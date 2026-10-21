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
/** One more item for feed(), live for the next hour. */
function extraItem(id, type, title, fields = {}){
    return { id, type, title, body: '', link: null, target: 'all', highlight: false, image: null, startsAt: iso(Date.now() - 60000), expiresAt: iso(Date.now() + 3600000), ...fields }
}

app.whenReady().then(async () => {
    let fake = null
    let failed = false
    try {
        fake = await Fake.start()
        fake.setFeed(feed(fake.base))
        process.env.OBLYVIUM_NOTIFICATIONS_URL = fake.url
        process.env.OBLYVIUM_CHANGELOG_URL = 'http://127.0.0.1:9/changelog.json'

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
// Record system notifications instead of showing them; the hidden QA window counts as focused.
window.__native = [];
window.Notification = class { constructor(title, options){ this.title = title; this.options = options; window.__native.push(this) } };
window.__focused = true;
document.hasFocus = () => window.__focused;
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
        const key = async (keyCode, modifiers = []) => {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
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
        const toast = id => `document.querySelector('.notif-toast[data-id="${id}"]')`
        const highlightHidden = () => run('document.getElementById("notificationsHighlight").hidden')
        const activeText = () => run('document.activeElement.textContent')
        const openDialog = () => run(`setOverlayContent('Teste', 'Diálogo de teste', 'OK'); setOverlayHandler(null); toggleOverlay(true); true`)
        const listeners = () => run('ipcRenderer.listenerCount("autoUpdateNotification")')
        const updateCalls = () => run('window.__sent.filter(args => args[0] === "autoUpdateAction" && args[1] === "checkForUpdate").length')
        const extras = []
        const publish = (...items) => {
            extras.push(...items)
            fake.setFeed(feed(fake.base, extras))
        }

        /**
         * Loads the page and runs showMainUI like the app does. `beforeLanding` runs
         * on whatever view showMainUI picked; the main screen is then reached
         * through switchView, never by rendering the notifications by hand.
         */
        const boot = async (beforeLanding = async () => {}) => {
            await win.loadFile(fixture)
            await run('$.fx.off = true')
            await run('window.__opened = []; shell.openExternal = url => { window.__opened.push(url); return Promise.resolve() }; true')
            // @electron/remote talks over ipcRenderer.send too; let its own messages through.
            await run(`window.__sent = []; const send = ipcRenderer.send.bind(ipcRenderer)
                ipcRenderer.send = (...args) => String(args[0]).startsWith('REMOTE_') ? send(...args) : window.__sent.push(args); true`)
            await run('syncModConfigurations(DistroAPI.distribution); ensureJavaSettings(DistroAPI.distribution); showMainUI(DistroAPI.distribution); true')
            await waitFor('getCurrentView() != null && notificationsFeed != null', 'first view and first read')
            await pause(300)
            await run(`$('#loadingContainer').hide(); true`)
            const firstView = await run('getCurrentView()')
            await beforeLanding()
            if(await run('getCurrentView() !== VIEWS.landing')){
                await run('switchView(getCurrentView(), VIEWS.landing, 0, 0); true')
            }
            return firstView
        }

        // Before login (here the first-launch welcome screen) nothing shows.
        await boot(async () => {
            if(await run('getCurrentView() !== VIEWS.welcome')){
                await run('switchView(getCurrentView(), VIEWS.welcome, 0, 0); true')
                await waitFor('getCurrentView() === VIEWS.welcome && $(VIEWS.welcome).is(":visible")', 'welcome view')
            }
            await run('renderNotifications()')
            assert.deepEqual(await toastIds(), [])
            assert.equal(await highlightHidden(), true)
        })
        check('nothing shows before login (welcome screen)')

        // Reaching the main screen shows them on its own, without waiting for the next read.
        await waitFor('!document.getElementById("notificationsHighlight").hidden', 'highlight opens after switching to the main screen', 3000)
        await waitFor('document.querySelectorAll(".notif-toast").length === 3', 'cards show after switching to the main screen', 3000)
        check('cards and highlight show as soon as the main screen is on, without a manual render')

        // Highlight first, with the HTML in the title shown as text.
        assert.equal(await run('document.getElementById("notificationsHighlightTitle").textContent'), '<img src=x onerror="window.__xss=1">Torneio')
        assert.equal(await run('window.__xss === undefined && document.querySelector("#notificationsHighlight .notif-title img") === null'), true)
        await waitFor('document.querySelector(".notif-image")?.naturalWidth === 1', 'highlight image loads')
        assert.equal(await run('document.activeElement.closest("#notificationsHighlight") !== null'), true)
        assert.equal(await run('document.getElementById("main").inert'), true)
        await screenshot('notifications-highlight')
        await run('[...document.querySelectorAll("#notificationsHighlight button")].find(b => b.textContent.startsWith("Ver no site")).click()')
        assert.deepEqual(await run('window.__opened'), ['https://oblyvium.com.br/eventos'])
        check('highlight: text-only title, image, focus inside, page behind inert, link opens externally')

        // Keyboard: Tab wraps both ways, arrows stay inside.
        assert.ok((await activeText()).startsWith('Ver no site'))
        await key('Tab', ['shift'])
        assert.equal(await activeText(), Lang.queryJS('notifications.close'))
        await key('Tab')
        assert.ok((await activeText()).startsWith('Ver no site'))
        await run('window.__arrows = 0; document.addEventListener("keydown", e => { if(e.key.startsWith("Arrow")) window.__arrows++ }); true')
        await key('Up')
        await key('Down')
        assert.equal(await run('window.__arrows'), 0)
        check('highlight keyboard: Tab and Shift+Tab wrap, arrow keys do not reach the page')

        // A launcher dialog on top: it owns Escape; cards and highlight are inert until it closes.
        await openDialog()
        assert.equal(await run('notificationsToasts.inert && notificationsHighlight.inert'), true)
        await waitFor('document.getElementById("overlayContainer").contains(document.activeElement)', 'focus moves into the dialog')
        await key('Escape')
        assert.equal(await run('isOverlayVisible()'), false)
        assert.equal(await highlightHidden(), false)
        assert.equal(await run('notificationsToasts.inert || notificationsHighlight.inert'), false)
        await waitFor('document.activeElement.closest("#notificationsHighlight") !== null', 'focus back in the highlight', 3000)
        check('Escape with a dialog open closes the dialog, not the highlight; cards stop being inert right away')

        await key('Escape')
        assert.equal(await highlightHidden(), true)
        assert.equal(await run('document.getElementById("main").inert'), false)
        check('Escape closes the highlight and frees the page')

        // Cards: three at most, only for this server.
        const first = await toastIds()
        assert.deepEqual(first, ['evento', 'modpack', 'launcher'])
        await screenshot('notifications-cards')
        check('three cards for the selected server, the rest queued')

        // The non-sticky card leaves on its own and the queue moves.
        await waitFor(`!${toast('evento')}`, 'announcement auto-dismiss', 12000)
        await waitFor(`${toast('fila')} !== null`, 'queued card shows')
        assert.ok((await toastIds()).includes('launcher'))
        check('announcement dismisses itself, update stays, queue advances')

        // Its countdown waits while a dialog is open.
        await openDialog()
        await pause(Math.ceil(await run('Notifications.AUTO_DISMISS_MS')) + 1000)
        assert.notEqual(await run(toast('fila')), null)
        await run('toggleOverlay(false); true')
        await waitFor(`!${toast('fila')}`, 'auto-dismiss resumes after the dialog', 12000)
        check('auto-dismiss pauses behind a dialog and resumes after it')

        // Modpack: locked while the game runs, then updates without launching.
        const modpackStatus = `${toast('modpack')}.querySelector(".notif-status").textContent`
        await run('gameRunning = 1; refreshLaunchLock()')
        assert.equal(await run(`${toast('modpack')}.querySelector(".notif-btn").disabled`), true)
        assert.equal(await run(modpackStatus), Lang.queryJS('notifications.closeGameFirst'))
        await run('gameRunning = 0; refreshLaunchLock()')
        assert.equal(await run(`${toast('modpack')}.querySelector(".notif-btn").disabled`), false)
        // Preparing throws after locking the launch area: the card unlocks it and offers retry.
        await run(`prepareServerFiles = async () => { toggleLaunchArea(true); throw new Error('Falha de teste') }; true`)
        await run(`${toast('modpack')}.querySelector(".notif-btn").click()`)
        await waitFor(`${modpackStatus} === ${JSON.stringify(Lang.queryJS('notifications.modpackFailed'))}`, 'modpack failure shown')
        assert.equal(await run('isLaunchLocked()'), false)
        assert.notEqual(await run('getComputedStyle(document.getElementById("launch_content")).display'), 'none')
        assert.equal(await run(`${toast('modpack')}.querySelector(".notif-btn").textContent`), Lang.queryJS('notifications.retry'))
        assert.equal(await run(`${toast('modpack')}.querySelector(".notif-btn").disabled`), false)
        assert.equal(await run('isOverlayVisible()'), true, 'the failure dialog shows')
        await run('toggleOverlay(false); true')
        check('modpack update that throws unlocks Jogar and offers retry')

        await run('window.__prepared = 0; prepareServerFiles = async () => { window.__prepared++; return {} }; true')
        await run(`${toast('modpack')}.querySelector(".notif-btn").click()`)
        await waitFor(`${modpackStatus} === ${JSON.stringify(Lang.queryJS('notifications.modpackUpdated'))}`, 'modpack updated')
        assert.equal(await run('window.__prepared'), 1)
        await run('gameRunning = 1; refreshLaunchLock()')
        assert.equal(await run(modpackStatus), Lang.queryJS('notifications.modpackUpdated'))
        await run('gameRunning = 0; refreshLaunchLock()')
        check('modpack button: disabled while playing, prepares files without launching, result stays')

        // Launcher update. In development there is no updater: it says so at once.
        const launcherButton = `${toast('launcher')}.querySelector(".notif-btn")`
        await run(`${launcherButton}.click()`)
        assert.equal(await run(`${toast('launcher')}.querySelector(".notif-status").textContent`), Lang.queryJS('notifications.updateFailed'))
        assert.equal(await run(`${launcherButton}.textContent`), Lang.queryJS('notifications.retry'))
        assert.equal(await updateCalls(), 0)
        // With the updater on, it asks for the update, then offers restart and install.
        await run('notificationsUpdaterEnabled = true')
        const baseListeners = await listeners()
        await run(`${launcherButton}.click()`)
        assert.equal(await updateCalls(), 1)
        assert.deepEqual(await run('window.__sent'), [['autoUpdateAction', 'checkForUpdate']])
        assert.equal(await listeners(), baseListeners + 1)
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'update-downloaded', { version: '2.0.5' }); true`)
        assert.equal(await run(`${launcherButton}.textContent`), Lang.queryJS('notifications.restartToInstall'))
        assert.equal(await listeners(), baseListeners)
        check('launcher update: fails fast in development, drives the updater, stops listening when done')

        // Switching server drops the old server's card and brings the new one's.
        await run('updateSelectedServer(DistroAPI.distribution.getServerById("outro")); true')
        assert.equal(await run(toast('modpack')), null)
        await waitFor(`${toast('outro-servidor')} !== null`, 'card for the other server')
        assert.ok((await toastIds()).includes('launcher'))
        await run(`updateSelectedServer(DistroAPI.distribution.getServerById(${JSON.stringify(SERVER)})); true`)
        assert.equal(await run(toast('outro-servidor')), null)
        check('server switch removes cards meant for the previous server only')

        // Seen ids survive a restart: nothing shows again, and a new one shows on startup.
        assert.deepEqual((await run('ConfigManager.getNotificationsSeen()')).sort(), ['destaque', 'evento', 'fila', 'launcher', 'modpack', 'outro-servidor'].sort())
        publish(extraItem('nova', 'maintenance', 'Manutenção às 22h'))
        const restartView = await boot()
        assert.equal(restartView, await run('VIEWS.landing'), 'restart goes straight to the main screen')
        await waitFor(`${toast('nova')} !== null`, 'new notification on startup', 3000)
        assert.deepEqual(await toastIds(), ['nova'])
        assert.equal(await highlightHidden(), true)
        check('seen notifications do not come back after a restart; a new one shows on startup')

        // The real prepareServerFiles (this page has no stub): a second call while one runs leaves the screen alone.
        const launchDetails = 'document.getElementById("launch_details_text").innerHTML'
        const detailsBefore = await run(launchDetails)
        await run('preparingServerFiles = true')
        assert.equal(await run('prepareServerFiles()'), null)
        assert.equal(await run('isLaunchLocked()'), false)
        assert.equal(await run(launchDetails), detailsBefore)
        await run('preparingServerFiles = false')
        check('prepareServerFiles ignores a call while another run is going on')

        // Minimised window: a new read waits until the window is back.
        await run(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); true`)
        publish(extraItem('escondida', 'announcement', 'Chegou minimizado'))
        await run('pollNotifications()')
        assert.equal(await run(toast('escondida')), null)
        await run(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); true`)
        assert.notEqual(await run(toast('escondida')), null)
        check('a new read shows nothing while minimised and shows it when the window is back')

        // 800x600 keeps the cards in view.
        win.setSize(800, 600)
        await pause(250)
        assert.equal(await run(`(() => { const r = ${toast('nova')}.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })()`), true)
        await screenshot('notifications-800')
        win.setSize(1100, 700)
        check('fits at 800x600')

        // Back at a screen before login, shown cards hide; they return with the main screen.
        await run('switchView(getCurrentView(), VIEWS.welcome, 0, 0); true')
        await waitFor('notificationsToasts.hidden', 'cards hide off the main screens', 3000)
        await run('switchView(getCurrentView(), VIEWS.landing, 0, 0); true')
        await waitFor('!notificationsToasts.hidden', 'cards return with the main screen', 3000)
        assert.ok((await toastIds()).includes('nova'))
        check('cards hide when leaving the main screens and come back with them')

        // More launcher cards, on a fresh page (no update downloaded yet). The X clears the cards.
        await run(`${toast('nova')}.querySelector(".notif-close").click(); ${toast('escondida')}?.querySelector(".notif-close").click(); true`)
        assert.deepEqual(await toastIds(), [])
        await run('notificationsUpdaterEnabled = true; window.__saves = 0; const baseSave = ConfigManager.save; ConfigManager.save = (...args) => { window.__saves++; return baseSave(...args) }; true')
        publish(
            extraItem('launcher-erro', 'launcher-update', 'Launcher 2.0.6'),
            extraItem('launcher-em-dia', 'launcher-update', 'Launcher 2.0.7'),
            extraItem('launcher-pronto', 'launcher-update', 'Launcher 2.0.8')
        )
        await run('pollNotifications()')
        assert.deepEqual(await toastIds(), ['launcher-erro', 'launcher-em-dia', 'launcher-pronto'])
        assert.equal(await run('window.__saves'), 1, 'the read removed no seen id, the three cards save once')
        check('the seen list is saved once per render, not once per card')

        const baseCount = await listeners()
        await run(`${toast('launcher-erro')}.querySelector(".notif-btn").click()`)
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'realerror', { message: 'Sem conexão com o servidor.' }); true`)
        assert.equal(await run(`${toast('launcher-erro')}.querySelector(".notif-status").textContent`), Lang.queryJS('notifications.updateFailed') + ' Sem conexão com o servidor.')
        assert.equal(await run(`${toast('launcher-erro')}.querySelector(".notif-btn").textContent`), Lang.queryJS('notifications.retry'))
        assert.equal(await listeners(), baseCount)
        check('launcher update error: shows the reason, offers retry, stops listening')

        // Timeouts, shortened: no answer to the check gives up; a running download does not.
        const erroStatus = `${toast('launcher-erro')}.querySelector(".notif-status").textContent`
        await run('notificationUpdateTimeouts.checkMs = 300; notificationUpdateTimeouts.downloadMs = 1500')
        await run(`${toast('launcher-erro')}.querySelector(".notif-btn").click()`)
        await pause(700)
        assert.equal(await run(erroStatus), Lang.queryJS('notifications.updateFailed'))
        assert.equal(await run(`${toast('launcher-erro')}.querySelector(".notif-btn").textContent`), Lang.queryJS('notifications.retry'))
        assert.equal(await listeners(), baseCount)
        await run(`${toast('launcher-erro')}.querySelector(".notif-btn").click()`)
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'update-available', { version: '2.0.6' }); true`)
        await pause(700)
        assert.equal(await run(erroStatus), Lang.queryJS('notifications.downloadingUpdate'))
        assert.equal(await listeners(), baseCount + 1)
        await waitFor(`${erroStatus} === ${JSON.stringify(Lang.queryJS('notifications.updateFailed'))}`, 'download wait has its own, longer limit', 3000)
        assert.equal(await listeners(), baseCount)
        await run('notificationUpdateTimeouts.checkMs = 60000; notificationUpdateTimeouts.downloadMs = 600000')
        check('launcher update: the check times out, a running download gets its own longer wait')

        await run(`${toast('launcher-em-dia')}.querySelector(".notif-btn").click()`)
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'update-not-available'); true`)
        assert.equal(await run(`${toast('launcher-em-dia')}.querySelector(".notif-status").textContent`), Lang.queryJS('notifications.upToDate'))
        assert.equal(await listeners(), baseCount)
        await waitFor(`${toast('launcher-em-dia')} === null`, 'up-to-date card leaves', 5000)
        check('already up to date: says so and the card leaves')

        // Downloaded in the background: the button goes straight to restart.
        await run(`window.__sent = []; ipcRenderer.emit('autoUpdateNotification', {}, 'update-downloaded', { version: '2.0.8' }); true`)
        await run(`${toast('launcher-pronto')}.querySelector(".notif-btn").click()`)
        assert.equal(await run(`${toast('launcher-pronto')}.querySelector(".notif-btn").textContent`), Lang.queryJS('notifications.restartToInstall'))
        assert.equal(await updateCalls(), 0)
        check('an update downloaded in the background goes straight to restart and install')

        // Highlights without an image and with a broken one still open, without an image left.
        fake.state.missingImages = ['quebrada.png']
        await run(`${toast('launcher-pronto')}.querySelector(".notif-close").focus(); true`)
        publish(
            extraItem('destaque-sem-imagem', 'event', 'Sem imagem', { highlight: true }),
            extraItem('destaque-quebrado', 'event', 'Imagem quebrada', { highlight: true, image: fake.base + '/notifications/quebrada.png' })
        )
        await run('pollNotifications()')
        await waitFor('document.getElementById("notificationsHighlightTitle")?.textContent === "Sem imagem"', 'highlight without image')
        assert.equal(await run('document.querySelector("#notificationsHighlight img")'), null)
        await run('[...document.querySelectorAll("#notificationsHighlight button")].find(b => b.textContent === Lang.queryJS("notifications.close")).click()')
        await waitFor('document.getElementById("notificationsHighlightTitle")?.textContent === "Imagem quebrada"', 'highlight with broken image')
        await waitFor('document.querySelector("#notificationsHighlight img") === null', 'broken image removed')
        assert.equal(await highlightHidden(), false)
        check('highlight without an image and with a broken image still opens, no image left')

        // The element focused before it opened is gone: focus goes to Jogar.
        await run(`${toast('launcher-pronto')}.querySelector(".notif-close").click(); true`)
        await run('focusHighlight()')
        await key('Escape')
        assert.equal(await highlightHidden(), true)
        assert.equal(await run('document.activeElement.id'), 'launch_button')
        check('closing the highlight focuses Jogar when the old focus is gone')

        // Away from the launcher, new items also go to Windows, once each; clicking one brings the launcher back.
        await run('window.__native = []; window.__focused = false; true')
        publish(extraItem('fora-de-foco', 'announcement', 'Fora de foco', { body: 'Corpo do aviso.' }))
        await run('pollNotifications()')
        const announcement = await run(`Lang.queryJS('notifications.type.' + NOTIFICATION_TYPE_KEYS.announcement)`)
        assert.deepEqual(await run('window.__native.map(n => [n.title, n.options.body])'), [[announcement + ' · Fora de foco', 'Corpo do aviso.']])
        assert.equal(await run('window.__native[0].onclick === focusLauncherWindow'), true)
        await run('pollNotifications()')
        assert.equal(await run('window.__native.length'), 1, 'not sent again on the next read')
        await run('window.__focused = true; true')
        publish(extraItem('em-foco', 'announcement', 'Em foco'))
        await run('pollNotifications()')
        assert.equal(await run('window.__native.length'), 1, 'nothing sent while the launcher has focus')
        check('Windows notification only while away, once per item, click focuses the launcher')

        assert.deepEqual(errors, [], 'renderer errors')
        check('no renderer exceptions')
        console.log(JSON.stringify({ result: 'PASS', output, checks }, null, 2))
    } catch(err) {
        failed = true
        console.error('QA FAILED', err)
        console.error('Passed so far:', checks)
    } finally {
        await fake?.close()
        fs.rmSync(fixture, { force: true })
        app.exit(failed ? 1 : 0)
    }
})
