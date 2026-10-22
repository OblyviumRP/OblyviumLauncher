/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/**
 * FullRepair that forks repairreceiver.js, which keeps the player's in-game
 * settings instead of restoring the pack's copy on every launch.
 */
class SettingsSafeRepair extends FullRepair {
    // Same as helios-core's spawnReceiver, forking our entry instead of its executor.
    spawnReceiver(){
        if(this.receiver != null){
            throw new Error('Receiver already spawned!')
        }
        this.receiver = require('child_process').fork(require.resolve('./assets/js/repairreceiver'), [this.receiverName()], { stdio: 'pipe' })
        for(const [fd, color] of [[1, 32], [2, 31]]){
            this.receiver.stdio[fd].setEncoding('utf8')
            this.receiver.stdio[fd].on('data', (data) => {
                `${data}`.trim().split('\n').forEach(line => console.log(`\x1b[${color}m[_]\x1b[0m ${line}`))
            })
        }
    }
}

/* Launch Progress Wrapper Functions */

// True while the loading area is shown (Java scan, file checks, downloads,
// game start). The profile and its content must not change meanwhile.
let launchAreaShown = false
// Number of game processes spawned and not yet closed. The loading area hides
// once the game window is up, but the game keeps using the profile folder
// until it exits.
let gameRunning = 0
// True while the game owns the Discord status (launcher status otherwise).
let hasRPC = false

/**
 * @returns {boolean} True while the game is opening or running.
 */
function isLaunchLocked(){
    return launchAreaShown || gameRunning > 0
}

/**
 * Disable the Mods button and the profile selector while the game is opening
 * or running; re-enable them otherwise.
 */
function refreshLaunchLock(){
    document.getElementById('modsMediaButton').disabled = isLaunchLocked()
    if(isLaunchLocked()){
        document.getElementById('profile_selection').disabled = true
    } else {
        renderProfileSelection()
    }
}

/**
 * Show/hide the loading area.
 *
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    launchAreaShown = loading
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
    refreshLaunchLock()
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    launchAllowed = val
    refreshLaunchButton()
}

// True when a server is selected and the game may be launched.
let launchAllowed = false
// Game processes that are still running, so "Fechar jogo" can stop them.
const runningProcs = new Set()
// Timer that cancels the "Confirmar" step of the stop button.
let stopConfirmTimer = null

/**
 * Show "Jogar" or, while the game is running, "Fechar jogo".
 */
function refreshLaunchButton(){
    const button = document.getElementById('launch_button')
    const running = runningProcs.size > 0
    clearTimeout(stopConfirmTimer)
    stopConfirmTimer = null
    button.classList.remove('confirm')
    button.classList.toggle('running', running)
    button.textContent = Lang.queryJS(running ? 'landing.launch.stop' : 'landing.launch.play')
    button.disabled = !running && !launchAllowed
}

/**
 * Stop every running game process. The first click asks for confirmation,
 * since unsaved progress in the game is lost.
 */
function stopGame(){
    const button = document.getElementById('launch_button')
    if(stopConfirmTimer == null){
        button.classList.add('confirm')
        button.textContent = Lang.queryJS('landing.launch.confirmStop')
        stopConfirmTimer = setTimeout(refreshLaunchButton, 4000)
        return
    }
    loggerLanding.info('Stopping game..')
    for(const p of runningProcs){
        p.kill()
    }
    refreshLaunchButton()
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    if(runningProcs.size > 0){
        stopGame()
        return
    }
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ProfileManager.getSelectedConfigKey())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind mods button
document.getElementById('modsMediaButton').onclick = () => openModsView()

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if (authUser.displayName != null) {
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://minotar.net/bust/${authUser.displayName}/256.png')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
/**
 * Show "in the launcher" on Discord for the selected server, unless the game
 * is running (the game updates the status itself).
 *
 * @param {boolean} resetTimer Restart the elapsed time (e.g. after the game closes).
 */
async function updateLauncherPresence(resetTimer = false){
    if(hasRPC){
        return
    }
    try {
        const distro = await DistroAPI.getDistribution()
        const serverId = ConfigManager.getSelectedServer()
        const serv = serverId == null || serverId === 'SELECT' ? null : distro.getServerById(serverId)
        DiscordWrapper.setPresence(distro.rawDistribution.discord, serv?.rawServer.discord, Lang.queryJS('landing.discord.launcher'), { resetTimer })
    } catch(err) {
        loggerLanding.warn('Unable to update Discord presence.', err)
    }
}

function updateSelectedServer(serv){

    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }

    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()

    // Servers without their own background keep the launcher's default.
    if (serv?.rawServer.background) {
        setTimeout(() => {
            document.body.style.backgroundImage = `url('${serv.rawServer.background}'), url('assets/images/backgrounds/${document.body.getAttribute('bkid')}.jpg')`
        }, 900)
    } else {
        setTimeout(() => {
            document.body.style.backgroundImage = `url('assets/images/backgrounds/${document.body.getAttribute('bkid')}.jpg')`
        }, 900)
    }

    const available = serv != null && serv.rawServer.id !== 'SELECT'
    const serverName = available ? serv.rawServer.name : 'Escolher servidor'
    document.getElementById('server_selection_name').textContent = serverName
    server_selection_button.setAttribute('aria-label', 'Selecionar servidor: ' + serverName)
    const serverIcon = document.getElementById('server_selection_icon')
    serverIcon.hidden = !available
    serverIcon.src = available ? (serv.rawServer.icon || 'assets/images/oblyvium-mark.svg') : 'assets/images/oblyvium-mark.svg'
    server_selection_button.classList.toggle('has-server-icon', available)
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }

    setLaunchEnabled(serv != null && serv.rawServer.id !== 'SELECT')
    updateLauncherPresence()

    renderProfileSelection()

}
const PROFILE_NEW_VALUE = '__novo__'

/**
 * Fill the profile selector with the selected server's profiles.
 */
function renderProfileSelection(){
    const select = document.getElementById('profile_selection')
    const serverId = ConfigManager.getSelectedServer()
    select.replaceChildren()
    if(serverId == null || serverId === 'SELECT'){
        select.disabled = true
        return
    }
    // dlAsync refreshes the distro mid-launch, which re-renders this selector.
    select.disabled = isLaunchLocked()
    const selected = ProfileManager.getSelected(serverId)
    for(const profile of ProfileManager.list(serverId)){
        select.add(new Option(profile.name, profile.id, false, profile.id === selected.id))
    }
    if(typeof modsOpenEditor === 'function'){
        select.add(new Option(Lang.queryJS('landing.profile.new'), PROFILE_NEW_VALUE))
    }
}

document.getElementById('profile_selection').addEventListener('change', async e => {
    const serverId = ConfigManager.getSelectedServer()
    if(e.target.value === PROFILE_NEW_VALUE){
        renderProfileSelection()
        await openModsView({ createProfile: true })
        return
    }
    ProfileManager.select(serverId, e.target.value)
})

// Real text is set in uibinder.js on distributionIndexDone.
document.getElementById('server_selection_name').textContent = Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.currentTarget.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }
    
    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    try {

        const servStat = await getServerStatus(47, serv.hostname, serv.port)
        console.log(servStat)
        pLabel = Lang.queryJS('landing.serverStatus.players')
        pVal = servStat.players.online + '/' + servStat.players.max

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ProfileManager.getSelectedConfigKey(), javaExec)
        ConfigManager.save()

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ProfileManager.getSelectedConfigKey(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

/**
 * Disable enabled content that the staff has blocked, then tell the player.
 * If Modrinth cannot be reached the launch carries on.
 */
async function disableBlockedContent(serv, gameDir, logger) {
    let blocked
    try {
        blocked = await ContentManager.findBlocked(gameDir, Modrinth.getBlocklist(serv))
    } catch (err) {
        logger.warn('Could not check content against the blocklist.', err)
        return
    }
    if (blocked.length === 0) {
        return
    }
    const disabled = []
    for (const item of blocked) {
        try {
            await ContentManager.setEnabled(gameDir, item.type, item.fileName, false)
            disabled.push(item)
            logger.warn(`Disabled blocked ${item.type} ${item.fileName} (${item.title}).`)
        } catch (err) {
            logger.warn(`Could not disable blocked ${item.type} ${item.fileName} (${item.title}).`, err)
        }
    }
    if (disabled.length === 0) {
        return
    }
    setOverlayContent(
        Lang.queryJS('landing.dlAsync.blockedModsTitle'),
        Lang.queryJS('landing.dlAsync.blockedModsMessage', { mods: disabled.map(m => escapeHtml(m.title)).join(', ') }),
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
}

/** True while prepareServerFiles runs. */
let preparingServerFiles = false

/**
 * Refreshes the distribution, then verifies and downloads the selected server's
 * files for its selected profile, and disables blocked content. Shows any failure
 * with showLaunchFailure. Leaves the launch area in its loading state; callers
 * that do not launch the game call toggleLaunchArea(false) afterwards.
 *
 * One run at a time: a call while another runs returns null and leaves the screen alone.
 *
 * @returns {Promise<{ distro: object, serv: object, gameDir: string, configKey: string, loggerLaunchSuite: object } | null>}
 * null when something failed (already shown to the player) or another run is going on.
 */
async function prepareServerFiles() {
    if(preparingServerFiles){
        loggerLanding.warn('Server files are already being prepared; ignoring a second request.')
        return null
    }
    preparingServerFiles = true
    try {
        return await runPrepareServerFiles()
    } finally {
        preparingServerFiles = false
    }
}

async function runPrepareServerFiles() {

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    // Lock Jogar and the modpack button before the first await, so neither can start a second run.
    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))
    toggleLaunchArea(true)

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return null
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())
    if(serv == null){
        loggerLaunchSuite.error('The selected server is not in the distribution index.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return null
    }

    const profile = ProfileManager.getSelected(serv.rawServer.id)
    const gameDir = ProfileManager.getGameDir(serv.rawServer.id, profile.id)
    const configKey = ProfileManager.configKey(serv.rawServer.id, profile.id)

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    setLaunchPercentage(0, 100)

    // The child process resolves File-type pack modules under this profile's
    // instance root. Renderer-side mdl.getPath() for File modules still points
    // at the default instance, so don't rely on it for other profiles.
    const fullRepairModule = new SettingsSafeRepair(
        ConfigManager.getCommonDirectory(),
        ProfileManager.getInstanceRoot(profile.id),
        ConfigManager.getLauncherDirectory(),
        serv.rawServer.id,
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), err.message || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return null
    }


    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return null
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    await disableBlockedContent(serv, gameDir, loggerLaunchSuite)

    return { distro, serv, gameDir, configKey, loggerLaunchSuite }
}

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if(login && ConfigManager.getSelectedAccount() == null){
        loggerLanding.error('You must be logged into an account.')
        toggleLaunchArea(false)
        return
    }

    const prepared = await prepareServerFiles()
    if(prepared == null){
        return
    }
    const { distro, serv, gameDir, configKey, loggerLaunchSuite } = prepared

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion(), { gameDir, configKey })
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        // This launch's process. The global `proc` may be cleared (or replaced by
        // a newer launch) before the delayed onLoadComplete runs.
        let gameProc = null

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            if(gameProc == null){
                return
            }
            if(hasRPC && gameProc.exitCode == null){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                gameProc.stdout.on('data', gameStateChange)
            }
            gameProc.stdout.removeListener('data', tempListener)
            gameProc.stderr.removeListener('data', gameErrorListener)
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()
            gameProc = proc
            gameRunning++
            runningProcs.add(gameProc)
            refreshLaunchButton()
            let released = false
            const releaseGameLock = () => {
                if(!released){
                    released = true
                    gameRunning--
                    runningProcs.delete(gameProc)
                    refreshLaunchLock()
                    refreshLaunchButton()
                }
            }
            gameProc.on('close', releaseGameLock)
            // A process that never spawned may emit 'error' without 'close'.
            gameProc.on('error', err => {
                loggerLaunchSuite.error('Game process error', err)
                if(gameProc.pid == null){
                    releaseGameLock()
                }
            })

            // Bind listeners to stdout.
            gameProc.stdout.on('data', tempListener)
            gameProc.stderr.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            // Discord: switch from the launcher status to the game's.
            if(distro.rawDistribution.discord != null && serv.rawServer.discord != null){
                DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
                hasRPC = true
            }
            gameProc.on('close', () => {
                if(proc === gameProc){
                    proc = null
                }
                if(hasRPC){
                    hasRPC = false
                    updateLauncherPresence(true)
                }
            })

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// // Bind news button.
// document.getElementById('newsButton').onclick = () => {
//     // Toggle tabbing.
//     if(newsActive){
//         $('#landingContainer *').removeAttr('tabindex')
//         $('#newsContainer *').attr('tabindex', '-1')
//     } else {
//         $('#landingContainer *').attr('tabindex', '-1')
//         $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
//         if(newsAlertShown){
//             $('#newsButtonAlert').fadeOut(2000)
//             newsAlertShown = false
//             ConfigManager.setNewsCacheDismissed(true)
//             ConfigManager.save()
//         }
//     }
//     slide_(!newsActive)
//     newsActive = !newsActive
// }

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function updateLandingNewsNotice(article){
    const notice = document.getElementById('landingNewsNotice')
    let articleUrl
    try {
        articleUrl = new URL(article?.link)
    } catch {
        notice.hidden = true
        return
    }
    if(!article?.title || !['http:', 'https:'].includes(articleUrl.protocol)){
        notice.hidden = true
        return
    }
    // DOMParser documents are inert: no scripts run and no handlers fire.
    const summary = new DOMParser().parseFromString(String(article.content || ''), 'text/html')
    summary.querySelectorAll('script, style').forEach(element => element.remove())
    const text = (summary.body.textContent || '').replace(/\s+/g, ' ').trim()
    document.getElementById('landingNewsTitle').textContent = article.title
    document.getElementById('landingNewsTitle').title = article.title
    document.getElementById('landingNewsSummary').textContent = text.length > 180 ? text.slice(0, 177) + '…' : text
    document.getElementById('landingNewsRead').href = articleUrl.href
    notice.hidden = false
}

async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null
    updateLandingNewsNotice(newsArr?.[0])

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    // Feed fields are untrusted and this renderer has Node access: plain
    // fields go in as text, the body through RichText. RichText is the global
    // declared by mods.js (shared script scope); redeclaring it would throw.
    newsArticleTitle.textContent = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.textContent = 'by ' + articleObject.author
    newsArticleDate.textContent = articleObject.date
    newsArticleComments.textContent = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + RichText.sanitizeHtml(articleObject.content) + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
async function loadNews(){

    const distroData = await DistroAPI.getDistribution()
    if(!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }
    // A placeholder or malformed value must not break the landing screen.
    let feedUrl
    try {
        feedUrl = new URL(distroData.rawDistribution.rss)
    } catch {
        feedUrl = null
    }
    if(feedUrl == null || (feedUrl.protocol !== 'https:' && feedUrl.protocol !== 'http:')) {
        loggerLanding.warn('Ignoring invalid RSS feed URL in the distribution:', distroData.rawDistribution.rss)
        return null
    }

    const promise = new Promise((resolve, reject) => {
        
        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text() || el.find('description').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })

    return await promise
}
