/**
 * Electron check of the site notifications (cards, highlight, actions) against
 * a local fake feed. Screenshots go to %TEMP%/oblyvium-notifications-qa.
 * Run: npm run verify:notifications
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert/strict')
const Fake = require('../test/helpers/fakeNotifications')

const root = path.resolve(__dirname, '..')
const output = path.join(os.tmpdir(), 'oblyvium-notifications-qa')
const fixture = path.join(root, 'app', '.notifications-qa.html')
const SERVER = 'notif-qa'
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()
fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
process.env.APPDATA = path.join(output, 'appdata')
process.env.ELECTRON_IS_DEV = '1'
app.setPath('userData', path.join(output, 'userData'))
app.disableHardwareAcceleration()

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
const checks = []
const check = name => checks.push(name)

const iso = ms => new Date(ms).toISOString()
function feed(fakeBase, extra = []){
    const now = Date.now()
    const base = { body: '', link: null, target: 'all', highlight: false, image: null, startsAt: iso(now - 60000), expiresAt: iso(now + 3600000) }
    return {
        version: 1,
        generatedAt: iso(now),
        notifications: [
            { ...base, id: 'destaque', type: 'event', title: '<img src=x onerror="window.__xss=1">Torneio', body: 'Na Arena às 20h.', highlight: true, image: fakeBase + '/notifications/torneio.png', link: { url: 'https://oblyvium.com.br/eventos', label: 'Ver no site' } },
            { ...base, id: 'evento', type: 'announcement', title: 'Loja aberta' },
            { ...base, id: 'modpack', type: 'modpack-update', title: 'Modpack atualizado', target: SERVER },
            { ...base, id: 'launcher', type: 'launcher-update', title: 'Launcher 2.0.5' },
            { ...base, id: 'fila', type: 'other', title: 'Na fila' },
            { ...base, id: 'outro-servidor', type: 'event', title: 'Não aparece', target: 'outro' },
            ...extra
        ]
    }
}

app.whenReady().then(async () => {
    let fake = null
    let failed = false
    try {
        fake = await Fake.start()
        fake.setFeed(feed(fake.base))
        process.env.OBLYVIUM_NOTIFICATIONS_URL = fake.url

        const preload = path.join(output, 'preload.cjs')
        fs.writeFileSync(preload, `
const root = ${JSON.stringify(root)};
const C = require(root + '/app/assets/js/configmanager');
C.load();
C.addMojangAuthAccount('00000000000000000000000000000001', 'offline', 'NotifQA', 'NotifQA');
C.setSelectedAccount('00000000000000000000000000000001');
require(root + '/app/assets/js/langloader').setupLanguage();
const api = require(root + '/app/assets/js/distromanager').DistroAPI;
const {HeliosDistribution} = require(root + '/node_modules/helios-core/dist/common/distribution/DistributionFactory.js');
const server = id => ({ id, name: 'Servidor ' + id, description: 'QA', icon: '', address: '127.0.0.1:25565',
    minecraftVersion: '1.20.1', version: '1.0.0', mainServer: id === ${JSON.stringify(SERVER)}, autoconnect: false, modules: [] });
const raw = { version: '1.0.0', servers: [server(${JSON.stringify(SERVER)}), server('outro')] };
api.rawDistribution = raw;
api.distribution = new HeliosDistribution(raw, C.getCommonDirectory(), C.getInstanceDirectory());
api.refreshDistributionOrFallback = async () => api.distribution;
C.setSelectedServer(${JSON.stringify(SERVER)});
C.save();
`)

        const ejs = require('ejs')
        const Lang = require('../app/assets/js/langloader')
        Lang.setupLanguage()
        fs.writeFileSync(fixture, await ejs.renderFile(path.join(root, 'app/app.ejs'), { bkid: 0, lang: Lang.queryEJS }))

        const win = new BrowserWindow({ width: 1100, height: 700, frame: false, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, preload } })
        remoteMain.enable(win.webContents)
        win.webContents.on('console-message', e => {
            if(e.level === 'error'){
                console.error('Renderer:', e.message)
                if(/Uncaught|SyntaxError|ReferenceError|TypeError/.test(e.message)) errors.push(e.message)
            }
        })
        win.webContents.on('preload-error', (_event, _preload, error) => console.error('Preload:', error))
        const run = code => win.webContents.executeJavaScript(code)
        const waitFor = async (expr, label, ms = 20000) => {
            const start = Date.now()
            while(!(await run(expr))){
                if(Date.now() - start > ms) throw new Error('Timeout: ' + label)
                await pause(100)
            }
        }
        const key = async keyCode => {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
            await pause(150)
        }
        const screenshot = async name => {
            await run('document.fonts.ready')
            // Let the cards' entry fade finish; a hidden window only paints when captured.
            const entering = 'document.getAnimations().some(a => a.animationName === "notif-in" && a.playState === "running")'
            for(let i = 0; i < 40 && await run(entering); i++){
                await win.webContents.capturePage()
                await pause(50)
            }
            await win.webContents.capturePage()
            await pause(80)
            fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
        }
        const toastIds = () => run('[...document.querySelectorAll(".notif-toast")].map(t => t.dataset.id)')

        const boot = async () => {
            await win.loadFile(fixture)
            await run('$.fx.off = true')
            await run('syncModConfigurations(DistroAPI.distribution); ensureJavaSettings(DistroAPI.distribution); showMainUI(DistroAPI.distribution)')
            await pause(2300)
            await run(`$('#main > div').hide(); $('#overlayContainer, #loadingContainer').hide(); $('#main').show(); currentView = VIEWS.landing; $(currentView).show();`)
            await run('window.__opened = []; shell.openExternal = url => { window.__opened.push(url); return Promise.resolve() }; true')
            // @electron/remote talks over ipcRenderer.send too; let its own messages through.
            await run(`window.__sent = []; const send = ipcRenderer.send.bind(ipcRenderer)
                ipcRenderer.send = (...args) => String(args[0]).startsWith('REMOTE_') ? send(...args) : window.__sent.push(args); true`)
        }
        await boot()
        await run('renderNotifications()')

        // Highlight first, with the HTML in the title shown as text.
        await waitFor('!document.getElementById("notificationsHighlight").hidden', 'highlight opens')
        assert.equal(await run('document.getElementById("notificationsHighlightTitle").textContent'), '<img src=x onerror="window.__xss=1">Torneio')
        assert.equal(await run('window.__xss === undefined && document.querySelector("#notificationsHighlight .notif-title img") === null'), true)
        await waitFor('document.querySelector(".notif-image")?.naturalWidth === 1', 'highlight image loads')
        assert.equal(await run('document.activeElement.closest("#notificationsHighlight") !== null'), true)
        await screenshot('notifications-highlight')
        await run('[...document.querySelectorAll("#notificationsHighlight button")].find(b => b.textContent.startsWith("Ver no site")).click()')
        assert.deepEqual(await run('window.__opened'), ['https://oblyvium.com.br/eventos'])
        check('highlight: text-only title, image, focus inside, link opens externally')

        await key('Escape')
        assert.equal(await run('document.getElementById("notificationsHighlight").hidden'), true)
        check('Escape closes the highlight')

        // Cards: three at most, only for this server.
        await waitFor('document.querySelectorAll(".notif-toast").length === 3', 'three cards')
        const first = await toastIds()
        assert.deepEqual(first, ['evento', 'modpack', 'launcher'])
        assert.equal(first.includes('outro-servidor'), false)
        await screenshot('notifications-cards')
        check('three cards for the selected server, the rest queued')

        // The non-sticky card leaves on its own and the queue moves.
        await waitFor('!document.querySelector(".notif-toast[data-id=evento]")', 'announcement auto-dismiss', 12000)
        await waitFor('document.querySelector(".notif-toast[data-id=fila]") !== null', 'queued card shows')
        assert.ok((await toastIds()).includes('launcher'))
        check('announcement dismisses itself, update stays, queue advances')

        // Modpack: locked while the game runs, then updates without launching.
        await run('gameRunning = 1; refreshLaunchLock()')
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").disabled'), true)
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-status").textContent'), Lang.queryJS('notifications.closeGameFirst'))
        await run('gameRunning = 0; refreshLaunchLock()')
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").disabled'), false)
        await run('window.__prepared = 0; prepareServerFiles = async () => { window.__prepared++; return {} }; true')
        await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").click()')
        await waitFor(`document.querySelector(".notif-toast[data-id=modpack] .notif-status").textContent === ${JSON.stringify(Lang.queryJS('notifications.modpackUpdated'))}`, 'modpack updated')
        assert.equal(await run('window.__prepared'), 1)
        check('modpack button: disabled while playing, prepares files without launching')

        // Launcher update: asks the updater, then offers restart and install.
        await run('document.querySelector(".notif-toast[data-id=launcher] .notif-btn").click()')
        assert.deepEqual(await run('window.__sent'), [['autoUpdateAction', 'checkForUpdate']])
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'update-downloaded', { version: '2.0.5' })`)
        assert.equal(await run('document.querySelector(".notif-toast[data-id=launcher] .notif-btn").textContent'), Lang.queryJS('notifications.restartToInstall'))
        check('launcher update button drives the updater')

        // Seen ids survive a restart: nothing shows again.
        assert.deepEqual((await run('ConfigManager.getNotificationsSeen()')).sort(), ['destaque', 'evento', 'fila', 'launcher', 'modpack'].sort())
        await boot()
        await run('renderNotifications()')
        await pause(800)
        assert.deepEqual(await toastIds(), [])
        assert.equal(await run('document.getElementById("notificationsHighlight").hidden'), true)
        check('seen notifications do not come back after a restart')

        // A new one arrives on the next read; 800x600 keeps everything in view.
        fake.setFeed(feed(fake.base, [{ id: 'nova', type: 'maintenance', title: 'Manutenção às 22h', body: '', link: null, target: 'all', highlight: false, image: null, startsAt: iso(Date.now() - 1000), expiresAt: iso(Date.now() + 3600000) }]))
        await run('pollNotifications()')
        await waitFor('document.querySelector(".notif-toast[data-id=nova]") !== null', 'new notification on next read')
        win.setSize(800, 600)
        await pause(250)
        assert.equal(await run('(() => { const r = document.querySelector(".notif-toast[data-id=nova]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })()'), true)
        await screenshot('notifications-800')
        win.setSize(1100, 700)
        check('new notification on the next read; fits at 800x600')

        assert.deepEqual(errors, [], 'renderer errors')
        check('no renderer exceptions')
        console.log(JSON.stringify({ result: 'PASS', output, checks }, null, 2))
    } catch(err) {
        failed = true
        console.error('QA FAILED', err)
    } finally {
        await fake?.close()
        fs.rmSync(fixture, { force: true })
        app.exit(failed ? 1 : 0)
    }
})
