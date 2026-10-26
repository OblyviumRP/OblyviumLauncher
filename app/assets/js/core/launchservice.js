/**
 * The launch pipeline without any DOM: Java check, file verification and
 * download, then the game process. The interface (ui/) drives it through
 * callbacks.
 *
 * Renderer only (ConfigManager, ProfileManager and @electron/remote).
 */
const fs = require('fs-extra')
const path = require('path')
const { ipcRenderer } = require('electron')
const { LoggerUtil } = require('helios-core')
const { validateLocalFile } = require('helios-core/common')
const { FullRepair, DistributionIndexProcessor, MojangIndexProcessor, downloadFile } = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
} = require('helios-core/java')

const AuthManager = require('../authmanager')
const ConfigManager = require('../configmanager')
const ContentManager = require('../contentmanager')
const DiscordWrapper = require('../discordwrapper')
const { DistroAPI } = require('../distromanager')
const { GAME_OPCODE } = require('../ipcconstants')
const Lang = require('../langloader')
const Modrinth = require('../modrinth')
const ProcessBuilder = require('../processbuilder')
const ProfileManager = require('../profilemanager')
const DistroSync = require('./distrosync')

const logger = LoggerUtil.getLogger('LaunchService')

const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const MIN_LINGER = 5000

/**
 * FullRepair that forks repairreceiver.js, which keeps the player's in-game
 * settings instead of restoring the pack's copy on every launch.
 */
class SettingsSafeRepair extends FullRepair {
    spawnReceiver(){
        if(this.receiver != null){
            throw new Error('Receiver already spawned!')
        }
        this.receiver = require('child_process').fork(require.resolve('../repairreceiver'), [this.receiverName()], { stdio: 'pipe' })
        for(const fd of [1, 2]){
            this.receiver.stdio[fd].setEncoding('utf8')
            this.receiver.stdio[fd].on('data', data => {
                `${data}`.trim().split('\n').forEach(line => logger.debug(`[repair] ${line}`))
            })
        }
    }
}

class LaunchError extends Error {
    constructor(title, desc){
        super(desc)
        this.title = title
        this.desc = desc
    }
}

function q(key, ph){
    try {
        return Lang.queryJS(key, ph)
    } catch {
        return key
    }
}

function noop(){}

function setProgressBar(value){
    try {
        require('@electron/remote').getCurrentWindow().setProgressBar(value)
    } catch {
        // Not in a window (tests).
    }
}

function appVersion(){
    try {
        return require('@electron/remote').app.getVersion()
    } catch {
        return require('../../../../package.json').version
    }
}

/** Busy flag: one prepare/launch at a time. */
let busy = false
/** Running game processes. */
const running = new Set()
/** True while the game owns the Discord status. */
let hasRPC = false

function isBusy(){
    return busy
}

function isRunning(){
    return running.size > 0
}

function stop(){
    for(const proc of running){
        proc.kill()
    }
}

async function updateLauncherPresence(resetTimer = false){
    if(!ConfigManager.getDiscordPresence()){
        DiscordWrapper.shutdownRPC()
        return
    }
    if(hasRPC){
        return
    }
    try {
        const distro = await DistroAPI.getDistribution()
        const serverId = ConfigManager.getSelectedServer()
        const serv = serverId == null || serverId === 'SELECT' ? null : distro.getServerById(serverId)
        DiscordWrapper.setPresence(distro.rawDistribution.discord, serv?.rawServer.discord, q('landing.discord.launcher'), { resetTimer })
    } catch(err){
        logger.warn('Unable to update Discord presence.', err)
    }
}

/**
 * Find or install a Java runtime for the selected profile.
 *
 * @param {object} h Handlers: onStatus, onProgress, askDownloadJava(options) => Promise<boolean>.
 * @returns {Promise<boolean>} False when the player declined to install Java.
 */
async function ensureJava(serv, configKey, h){
    const opts = serv.effectiveJavaOptions
    const current = ConfigManager.getJavaExecutable(configKey)
    if(current != null){
        h.onStatus(q('landing.launch.pleaseWait'))
        const details = await validateSelectedJvm(ensureJavaDirIsRoot(current), opts.supported)
        if(details != null){
            return true
        }
    }
    h.onStatus(q('landing.systemScan.checking'))
    const found = await discoverBestJvmInstallation(ConfigManager.getDataDirectory(), opts.supported)
    if(found != null){
        ConfigManager.setJavaExecutable(configKey, javaExecFromRoot(found.path))
        ConfigManager.save()
        return true
    }
    const accept = await h.askDownloadJava({ major: opts.suggestedMajor })
    if(!accept){
        return false
    }
    await downloadJava(opts, configKey, h)
    return true
}

async function downloadJava(opts, configKey, h){
    h.onStatus(q('landing.systemScan.javaDownloadPrepare'))
    const asset = await latestOpenJDK(opts.suggestedMajor, ConfigManager.getDataDirectory(), opts.distribution)
    if(asset == null){
        throw new LaunchError(q('landing.systemScan.javaDownloadFailureTitle'), q('landing.downloadJava.findJdkFailure'))
    }
    h.onStatus(`Baixando Java ${opts.suggestedMajor}`)
    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        const percent = Math.trunc((transferred / asset.size) * 100)
        setProgressBar(percent / 100)
        h.onProgress({ phase: 'java', percent, done: transferred, total: asset.size })
    })
    if(received !== asset.size && !await validateLocalFile(asset.path, asset.algo, asset.hash)){
        throw new LaunchError(q('landing.systemScan.javaDownloadFailureTitle'), q('landing.downloadJava.javaDownloadCorruptedError'))
    }
    setProgressBar(2)
    h.onStatus(q('landing.downloadJava.extractingJava'))
    try {
        const exec = await extractJdk(asset.path)
        ConfigManager.setJavaExecutable(configKey, exec)
        ConfigManager.save()
    } finally {
        setProgressBar(-1)
    }
    h.onStatus(q('landing.downloadJava.javaInstalled'))
}

async function disableBlockedContent(serv, gameDir, h){
    let blocked
    try {
        blocked = await ContentManager.findBlocked(gameDir, Modrinth.getBlocklist(serv))
    } catch(err){
        logger.warn('Could not check content against the blocklist.', err)
        return
    }
    const disabled = []
    for(const item of blocked){
        try {
            await ContentManager.setEnabled(gameDir, item.type, item.fileName, false)
            disabled.push(item)
        } catch(err){
            logger.warn(`Could not disable blocked ${item.type} ${item.fileName}.`, err)
        }
    }
    if(disabled.length > 0){
        h.onBlocked(disabled)
    }
}

/**
 * Refresh the distribution, verify and download the selected server's files
 * for its selected profile, and disable blocked content.
 */
async function prepareFiles(h){
    h.onStatus(q('landing.dlAsync.loadingServerInfo'))
    let distro
    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        DistroSync.syncDistribution(distro)
        h.onDistro?.(distro)
    } catch(err){
        logger.error('Unable to refresh distribution index.', err)
        throw new LaunchError(q('landing.dlAsync.fatalError'), q('landing.dlAsync.unableToLoadDistributionIndex'))
    }
    const serv = distro.getServerById(ConfigManager.getSelectedServer())
    if(serv == null){
        throw new LaunchError(q('landing.dlAsync.fatalError'), q('landing.dlAsync.unableToLoadDistributionIndex'))
    }
    const profile = ProfileManager.getSelected(serv.rawServer.id)
    const gameDir = ProfileManager.getGameDir(serv.rawServer.id, profile.id)
    const configKey = ProfileManager.configKey(serv.rawServer.id, profile.id)

    const repair = new SettingsSafeRepair(
        ConfigManager.getCommonDirectory(),
        ProfileManager.getInstanceRoot(profile.id),
        ConfigManager.getLauncherDirectory(),
        serv.rawServer.id,
        DistroAPI.isDevMode()
    )
    repair.spawnReceiver()
    const receiverGone = new Promise((_, reject) => {
        repair.childProcess.once('error', reject)
        repair.childProcess.once('close', code => reject(new Error(`File check process exited with code ${code}.`)))
    })
    receiverGone.catch(() => {})

    try {
        h.onStatus(q('landing.dlAsync.validatingFileIntegrity'))
        let invalid
        try {
            invalid = await Promise.race([repair.verifyFiles(percent => h.onProgress({ phase: 'verify', percent })), receiverGone])
            h.onProgress({ phase: 'verify', percent: 100 })
        } catch(err){
            logger.error('Error during file validation.', err)
            throw new LaunchError(q('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || q('landing.dlAsync.seeConsoleForDetails'))
        }
        if(invalid > 0){
            h.onStatus(q('landing.dlAsync.downloadingFiles'))
            try {
                await Promise.race([repair.download(percent => {
                    setProgressBar(percent / 100)
                    h.onProgress({ phase: 'download', percent, files: invalid })
                }), receiverGone])
                h.onProgress({ phase: 'download', percent: 100, files: invalid })
            } catch(err){
                logger.error('Error during file download.', err)
                throw new LaunchError(q('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || q('landing.dlAsync.seeConsoleForDetails'))
            } finally {
                setProgressBar(-1)
            }
        }
    } finally {
        try {
            repair.destroyReceiver()
        } catch {
            // Already gone.
        }
    }
    await disableBlockedContent(serv, gameDir, h)
    return { distro, serv, profile, gameDir, configKey }
}

function handlersWithDefaults(h){
    return {
        onStatus: noop,
        onProgress: noop,
        onBlocked: noop,
        onLog: noop,
        onStarted: noop,
        onExit: noop,
        askDownloadJava: async () => false,
        ...h
    }
}

/**
 * Verify and download the selected server's files without starting the game
 * (used by "update modpack" actions).
 */
async function verifyOnly(handlers){
    if(busy || isRunning()){
        return false
    }
    const h = handlersWithDefaults(handlers)
    busy = true
    try {
        await prepareFiles(h)
        return true
    } finally {
        busy = false
    }
}

async function newestCrashReport(gameDir, since){
    try {
        const dir = path.join(gameDir, 'crash-reports')
        const files = await fs.readdir(dir)
        let best = null
        for(const f of files){
            const st = await fs.stat(path.join(dir, f))
            if(st.mtimeMs >= since && (best == null || st.mtimeMs > best.mtime)){
                best = { path: path.join(dir, f), mtime: st.mtimeMs }
            }
        }
        return best?.path ?? null
    } catch {
        return null
    }
}

/**
 * Launch the selected profile of the selected server with the selected account.
 * Throws a LaunchError (title, desc) for anything the player should see.
 *
 * @param {object} handlers onStatus(text), onProgress({phase, percent}),
 * askDownloadJava({major}), onBlocked(items), onLog({stream, line}),
 * onStarted(), onExit({code, started, crashReport}).
 * @returns {Promise<boolean>} False when nothing was started (busy, or Java declined).
 */
async function launch(handlers){
    if(busy || isRunning()){
        return false
    }
    const h = handlersWithDefaults(handlers)
    const account = ConfigManager.getSelectedAccount()
    if(account == null){
        throw new LaunchError(q('landing.launch.failureTitle'), 'Entre em uma conta antes de jogar.')
    }
    busy = true
    try {
        const distro0 = await DistroAPI.getDistribution()
        const serv0 = distro0.getServerById(ConfigManager.getSelectedServer())
        if(serv0 == null){
            throw new LaunchError(q('landing.dlAsync.fatalError'), q('landing.dlAsync.unableToLoadDistributionIndex'))
        }
        if(!await ensureJava(serv0, ProfileManager.getSelectedConfigKey(serv0.rawServer.id), h)){
            return false
        }

        const { distro, serv, gameDir, configKey } = await prepareFiles(h)

        h.onStatus(q('landing.dlAsync.preparingToLaunch'))
        // O token do Minecraft vence em 24h; sem renovar aqui o jogo abre com ele vencido e o servidor recusa ("Invalid session").
        if(!await AuthManager.validateSelected()){
            throw new LaunchError(q('landing.launch.failureTitle'), 'A sessão da conta expirou. Entre de novo com a Microsoft para jogar.')
        }
        const modLoaderData = await new DistributionIndexProcessor(ConfigManager.getCommonDirectory(), distro, serv.rawServer.id).loadModLoaderVersionJson(serv)
        const versionData = await new MojangIndexProcessor(ConfigManager.getCommonDirectory(), serv.rawServer.minecraftVersion).getVersionJson()

        h.onStatus(q('landing.dlAsync.launchingGame'))
        const pb = new ProcessBuilder(serv, versionData, modLoaderData, account, appVersion(), { gameDir, configKey })
        const startedAt = Date.now()
        const proc = pb.build()
        running.add(proc)

        let started = false
        const joinedRegex = new RegExp(`\\[.+\\]: \\[CHAT\\] ${account.displayName} joined the game`)
        const emitLines = (stream) => (data) => {
            for(const line of `${data}`.split(/\r?\n/)){
                if(line.trim() === ''){
                    continue
                }
                h.onLog({ stream, line })
                if(!started && stream === 'stdout' && GAME_LAUNCH_REGEX.test(line.trim())){
                    started = true
                    const onPlay = ConfigManager.getLauncherOnPlay()
                    if(onPlay === 'tray'){
                        ipcRenderer.send(GAME_OPCODE.HIDE_LAUNCHER)
                    } else if(onPlay === 'minimize'){
                        ipcRenderer.send(GAME_OPCODE.MINIMIZE_LAUNCHER)
                    }
                    const wait = Math.max(0, MIN_LINGER - (Date.now() - startedAt))
                    setTimeout(() => {
                        if(hasRPC && proc.exitCode == null){
                            DiscordWrapper.updateDetails(q('landing.discord.loading'))
                        }
                        h.onStarted()
                    }, wait)
                } else if(hasRPC && started){
                    if(joinedRegex.test(line)){
                        DiscordWrapper.updateDetails(q('landing.discord.joined'))
                    } else if(GAME_JOINED_REGEX.test(line)){
                        DiscordWrapper.updateDetails(q('landing.discord.joining'))
                    }
                }
            }
        }
        proc.stdout.setEncoding('utf8')
        proc.stderr.setEncoding('utf8')
        proc.stdout.on('data', emitLines('stdout'))
        proc.stderr.on('data', emitLines('stderr'))

        if(ConfigManager.getDiscordPresence() && distro.rawDistribution.discord != null && serv.rawServer.discord != null){
            DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
            hasRPC = true
        }

        let closed = false
        const finish = async (code) => {
            if(closed){
                return
            }
            closed = true
            running.delete(proc)
            ipcRenderer.send(GAME_OPCODE.SHOW_LAUNCHER)
            if(hasRPC){
                hasRPC = false
                updateLauncherPresence(true)
            }
            const crashReport = code !== 0 ? await newestCrashReport(gameDir, startedAt) : null
            h.onExit({ code, started, crashReport })
        }
        proc.on('close', code => { finish(code) })
        proc.on('error', err => {
            logger.error('Game process error', err)
            if(proc.pid == null){
                finish(-1)
            }
        })
        return true
    } catch(err){
        if(err instanceof LaunchError){
            throw err
        }
        logger.error('Unhandled error during launch.', err)
        throw new LaunchError(q('landing.launch.failureTitle'), q('landing.launch.failureText'))
    } finally {
        busy = false
    }
}

module.exports = {
    LaunchError,
    isBusy,
    isRunning,
    stop,
    launch,
    verifyOnly,
    updateLauncherPresence,
    GAME_LAUNCH_REGEX
}
