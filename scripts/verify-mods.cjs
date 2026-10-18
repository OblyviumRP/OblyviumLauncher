/**
 * Electron check of profiles and the mods screen against a local fake Modrinth.
 * Screenshots go to %TEMP%/oblyvium-mods-qa. Run: npm run verify:mods
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert/strict')
const Fake = require('../test/helpers/fakeModrinth')
const { SHELL_OPCODE } = require('../app/assets/js/ipcconstants')

const root = path.resolve(__dirname, '..')
const output = path.join(os.tmpdir(), 'oblyvium-mods-qa')
const fixture = path.join(root, 'app', '.mods-qa.html')
const SERVER = 'mods-qa'
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()
fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
process.env.APPDATA = path.join(output, 'appdata')
process.env.ELECTRON_IS_DEV = '1'
// Never let QA read the production notifications feed.
process.env.OBLYVIUM_NOTIFICATIONS_URL = 'http://127.0.0.1:9/notifications.json'
app.setPath('userData', path.join(output, 'userData'))
app.disableHardwareAcceleration()

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
const trashed = []
const checks = []
const check = name => checks.push(name)

// index.js is not loaded here, so stand in for its trash handler without touching the real recycle bin.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (_event, target) => {
    trashed.push(target)
    fs.rmSync(target, { recursive: true, force: true })
    return { result: true }
})

app.whenReady().then(async () => {
    let fake = null
    let failed = false
    try {
        fake = await Fake.start()
        process.env.OBLYVIUM_MODRINTH_API = fake.api

        const preload = path.join(output, 'preload.cjs')
        fs.writeFileSync(preload, `
const root = ${JSON.stringify(root)};
const C = require(root + '/app/assets/js/configmanager');
C.load();
// The same account the offline login creates, so the landing screen is reachable.
C.addMojangAuthAccount('00000000000000000000000000000001', 'offline', 'ModsQA', 'ModsQA');
C.setSelectedAccount('00000000000000000000000000000001');
require(root + '/app/assets/js/langloader').setupLanguage();
const api = require(root + '/app/assets/js/distromanager').DistroAPI;
const {HeliosDistribution} = require(root + '/node_modules/helios-core/dist/common/distribution/DistributionFactory.js');
const artifact = { size: 1, MD5: '0', url: 'http://127.0.0.1/x.jar' };
const raw = { version: '1.0.0', servers: [{
    id: ${JSON.stringify(SERVER)}, name: 'Servidor de teste', description: 'QA', icon: '', address: '127.0.0.1:25565',
    minecraftVersion: '1.20.1', version: '1.0.0', mainServer: true, autoconnect: false,
    modrinth: { blocked: ['sodium'] },
    modules: [
        { id: 'net.minecraftforge:forge:1.20.1-47.3.0', name: 'Minecraft Forge', type: 'ForgeHosted', artifact },
        { id: 'com.exemplo:obrigatorio:1.0.0', name: 'Mod obrigatório', type: 'ForgeMod', artifact },
        { id: 'com.exemplo:opcional:1.0.0', name: 'Mod opcional', type: 'ForgeMod', required: { value: false, def: true }, artifact }
    ]
}] };
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
            await win.webContents.capturePage()
            await pause(80)
            fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
        }
        const noOverflow = async label => {
            const overflow = await run(`Array.from(document.querySelectorAll('#modsContainer button, #modsContainer input, #modsContainer select, #modsContainer h1, #modsContainer .mods-row')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.left < -1 || r.right > innerWidth + 1) }).map(e => e.id || e.className)`)
            assert.deepEqual(overflow, [], label + ': controls outside viewport')
            const scroll = await run(`(() => { const m = document.getElementById('modsContainer'); return [m.scrollWidth, m.clientWidth] })()`)
            assert.ok(scroll[0] <= scroll[1] + 1, label + ': #modsContainer scrolls horizontally ' + scroll.join('>'))
        }
        const landingOptions = () => run(`[...document.getElementById('profile_selection').options].map(o => o.text)`)
        const resultRow = title => `[...document.querySelectorAll('#modsSearchResults .mods-row')].find(r => r.querySelector('.mods-row-title').textContent === ${JSON.stringify(title)})`
        const installedRow = fileName => `[...document.querySelectorAll('#modsInstalledList .mods-row')].find(r => r.querySelector('.mods-row-meta').textContent.endsWith(${JSON.stringify(fileName)}))`
        const exists = file => `require('fs').existsSync(${JSON.stringify(file)})`
        const instanceDir = path.join(output, 'appdata', '.OblyviumLauncher', 'instances')
        const padraoDir = path.join(instanceDir, SERVER)
        const padraoMods = path.join(padraoDir, 'mods')

        await win.loadFile(fixture)
        await run('$.fx.off = true')
        await run('syncModConfigurations(DistroAPI.distribution); ensureJavaSettings(DistroAPI.distribution); showMainUI(DistroAPI.distribution)')
        await pause(2300)
        await run(`$('#main > div').hide(); $('#overlayContainer, #loadingContainer').hide(); $('#main').show(); currentView = VIEWS.landing; $(currentView).show();`)
        assert.equal(await run(`ProfileManager.getGameDir(${JSON.stringify(SERVER)}, ProfileManager.DEFAULT_ID)`), padraoDir)

        // 1. Landing: profile selector and Mods button
        assert.deepEqual(await landingOptions(), ['Padrão', '+ Novo perfil…'])
        assert.ok(await run(`document.getElementById('modsMediaButton').getClientRects().length > 0`), 'Mods button visible')
        await screenshot('landing')
        check('landing profile selector and Mods button')

        // 2. Mods screen, installed tab, pack group
        await run(`document.getElementById('modsMediaButton').click()`)
        await waitFor(`getCurrentView() === VIEWS.mods && $('#modsContainer').is(':visible')`, 'mods view')
        assert.equal(await run(`modsProfileName.textContent`), 'Padrão')
        await waitFor(`modsInstalledStatus.textContent === ${JSON.stringify('Nenhum mod seu neste perfil. Use Adicionar conteúdo para buscar.')}`, 'empty installed')
        assert.equal(await run(`modsPackSummary.textContent`), 'Mods do pack (2) 🔒')
        await run(`modsPackGroup.open = true`)
        await screenshot('installed')
        const packToggles = await run(`document.querySelectorAll('#modsPackList input[type=checkbox]').length`)
        assert.equal(packToggles, 1, 'only the optional pack mod has a toggle')
        assert.equal(await run(`document.querySelector('#modsPackList input[type=checkbox]').checked`), true)
        await run(`document.querySelector('#modsPackList input[type=checkbox]').click()`)
        assert.equal(await run(`ConfigManager.getModConfiguration(${JSON.stringify(SERVER)}).mods['com.exemplo:opcional']`), false)
        assert.equal(await run(`document.querySelector('#modsPackList input[type=checkbox]').checked`), false)
        check('mods view, empty Installed, pack group and optional toggle saved')

        // 3. Explore: blocked hidden, categories translated, installs
        await run(`modsTabExplore.click()`)
        await waitFor(`modsSearchResults.childElementCount > 0`, 'search results')
        const titles = await run(`[...document.querySelectorAll('#modsSearchResults .mods-row-title')].map(e => e.textContent)`)
        assert.ok(!titles.includes('Sodium'), 'blocked project is hidden')
        assert.ok(titles.includes('Mapa') && titles.includes('Iris'), 'results listed: ' + titles.join(', '))
        await waitFor(`modsCategoryList.textContent.includes('Utilidade')`, 'categories')
        await screenshot('explore')

        await run(`${resultRow('Mapa')}.querySelector('button[data-install]').click()`)
        await waitFor(`${resultRow('Mapa')}.querySelector('.mods-badge-success') != null`, 'Mapa installed')
        assert.ok(fs.existsSync(path.join(padraoMods, 'mapa-1.0.jar')))

        await run(`${resultRow('Iris')}.querySelector('button[data-install]').click()`)
        await waitFor(`${resultRow('Iris')}.querySelector('.mods-row-status').hasAttribute('error')`, 'Iris refused')
        assert.equal(await run(`${resultRow('Iris')}.querySelector('.mods-row-status').textContent`), 'Não dá para instalar: ele precisa de Sodium, que é proibido pela staff.')
        assert.deepEqual(fs.readdirSync(padraoMods).filter(f => f.startsWith('iris') || f.startsWith('sodium')), [])
        check('Explore hides blocked, translates categories, installs Mapa, refuses Iris')

        // 4. Project page: sanitised description, Escape back to the results
        await run(`${resultRow('Iris')}.querySelector('.mods-row-title').click()`)
        await waitFor(`!modsPanelProject.hidden && modsProject.querySelector('.mods-project-body') != null`, 'project page')
        assert.equal(await run(`window.__xss`), undefined)
        assert.equal(await run(`modsProject.querySelector('script, [onerror], iframe')`), null)
        assert.deepEqual(await run(`[...modsProject.querySelectorAll('.mods-project-body a')].map(a => a.getAttribute('href'))`), ['https://example.com/', null])
        assert.ok((await run(`modsProject.textContent`)).includes('proibido'), 'blocked dependency explained')
        await screenshot('project')
        await key('Escape')
        assert.equal(await run(`modsPanelExplore.hidden`), false)
        assert.equal(await run(`modsPanelProject.hidden`), true)
        assert.ok(await run(`modsSearchResults.childElementCount > 0`), 'search kept after back')
        assert.ok(await run(`document.activeElement === ${resultRow('Iris')}.querySelector('.mods-row-title')`), 'focus back on the Iris title')
        check('project page sanitised, Escape returns to results with focus restored')

        // 5. Installed: update, disable, name collision
        fs.writeFileSync(path.join(padraoMods, 'iris-1.0.jar'), fake.files['iris-1.0.jar'].buf)
        await run(`modsTabInstalled.click()`)
        const updateBtn = `[...document.querySelectorAll('#modsInstalledList .mods-btn-primary')].find(b => b.textContent === 'Atualizar para 2.0')`
        await waitFor(`${updateBtn} != null`, 'update button')
        await run(`${updateBtn}.click()`)
        await waitFor(`!modsInstalledList.textContent.includes('Atualizar') && ${installedRow('iris-2.0.jar')} != null`, 'updated')
        assert.ok(fs.existsSync(path.join(padraoMods, 'iris-2.0.jar')))
        assert.ok(!fs.existsSync(path.join(padraoMods, 'iris-1.0.jar')))

        await run(`${installedRow('mapa-1.0.jar')}.querySelector('input[type=checkbox]').click()`)
        await waitFor(exists(path.join(padraoMods, 'mapa-1.0.jar.disabled')), 'Mapa disabled')
        await waitFor(`${installedRow('mapa-1.0.jar.disabled')} != null && !${installedRow('mapa-1.0.jar.disabled')}.querySelector('input[type=checkbox]').checked`, 'Mapa row off')
        assert.ok(!fs.existsSync(path.join(padraoMods, 'mapa-1.0.jar')))

        fs.writeFileSync(path.join(padraoMods, 'foo.jar'), 'foo enabled')
        fs.writeFileSync(path.join(padraoMods, 'foo.jar.disabled'), 'foo disabled')
        await run(`modsTabInstalled.click()`)
        await waitFor(`${installedRow('foo.jar')} != null && !${installedRow('foo.jar')}.hasAttribute('busy')`, 'foo listed')
        await run(`${installedRow('foo.jar')}.querySelector('input[type=checkbox]').click()`)
        await waitFor(`${installedRow('foo.jar')}.querySelector('.mods-row-status').textContent !== ''`, 'collision message')
        assert.equal(await run(`${installedRow('foo.jar')}.querySelector('.mods-row-status').textContent`), 'Já existe um arquivo com esse nome na pasta.')
        assert.equal(await run(`${installedRow('foo.jar')}.querySelector('input[type=checkbox]').checked`), true, 'toggle reverted')
        assert.equal(fs.readFileSync(path.join(padraoMods, 'foo.jar.disabled'), 'utf8'), 'foo disabled', 'existing file untouched')
        fs.rmSync(path.join(padraoMods, 'foo.jar'))
        fs.rmSync(path.join(padraoMods, 'foo.jar.disabled'))
        check('update replaces the file, disable renames, name collision refused')

        // 6. Resource pack: install and enable
        await run(`document.querySelector('.mods-types [data-type="resourcepack"]').click()`)
        await run(`modsTabExplore.click()`)
        await waitFor(`${resultRow('Pacote')} != null`, 'resource pack result')
        await run(`${resultRow('Pacote')}.querySelector('button[data-install]').click()`)
        await waitFor(`${resultRow('Pacote')}.querySelector('.mods-badge-success') != null`, 'pack installed')
        assert.ok(fs.existsSync(path.join(padraoDir, 'resourcepacks', 'pacote-1.0.zip')))
        await run(`modsTabInstalled.click()`)
        await waitFor(`${installedRow('pacote-1.0.zip')} != null`, 'pack listed')
        await run(`${installedRow('pacote-1.0.zip')}.querySelector('input[type=checkbox]').click()`)
        const optionsFile = path.join(padraoDir, 'options.txt')
        await waitFor(`${exists(optionsFile)} && require('fs').readFileSync(${JSON.stringify(optionsFile)}, 'utf8').includes('file/pacote-1.0.zip')`, 'pack enabled')
        await run(`document.querySelector('.mods-types [data-type="mod"]').click()`)
        check('resource pack installed and enabled in options.txt')

        // 7. Create a profile from the landing selector
        await key('Escape')
        await waitFor(`getCurrentView() === VIEWS.landing && $('#landingContainer').is(':visible')`, 'landing after Escape')
        assert.deepEqual(await landingOptions(), ['Padrão', '+ Novo perfil…'])
        await run(`profile_selection.value = '__novo__'; profile_selection.dispatchEvent(new Event('change'))`)
        await waitFor(`getCurrentView() === VIEWS.mods && !modsPanelEdit.hidden && $('#modsContainer').is(':visible')`, 'editor open')
        await waitFor(`document.activeElement === modsEditName`, 'focus on the name field after the fade', 3000)
        assert.equal(await run(`modsEditGame.hidden`), true)
        await run(`modsEditSave.click()`)
        assert.equal(await run(`modsEditNameError.textContent`), 'Use de 1 a 32 caracteres.')
        assert.equal(await run(`modsEditName.getAttribute('aria-invalid')`), 'true')
        await screenshot('editor-create')
        await run(`modsEditName.value = 'Leve'; document.querySelector('input[name=modsEditIcon][value=livro]').click(); modsEditCopyFrom.value = ProfileManager.DEFAULT_ID; modsEditSave.click()`)
        await waitFor(`modsProfileName.textContent === 'Leve' && modsPanelEdit.hidden`, 'profile created')
        const leveId = await run(`ProfileManager.getSelected(${JSON.stringify(SERVER)}).id`)
        assert.notEqual(leveId, 'padrao')
        assert.equal(await run(`ProfileManager.get(${JSON.stringify(SERVER)}, ${JSON.stringify(leveId)}).icon`), 'livro')
        const leveDir = path.join(instanceDir, '.perfis', leveId, SERVER)
        assert.equal(await run(`ProfileManager.getGameDir(${JSON.stringify(SERVER)}, ${JSON.stringify(leveId)})`), leveDir)
        assert.ok(fs.readFileSync(path.join(leveDir, 'options.txt'), 'utf8').includes('file/pacote-1.0.zip'), 'settings copied')
        await waitFor(`modsInstalledStatus.textContent.includes('Nenhum mod seu')`, 'new profile is empty')
        assert.ok(!fs.existsSync(path.join(leveDir, 'mods')), 'mods are not copied')
        check('profile created from landing: focus, name validation, icon, settings copied, empty mods')

        // 8. Edit: invalid width blocks saving; RAM and width saved per profile
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden && !modsEditGame.hidden && !modsEditSave.disabled`, 'editor loaded')
        await run(`settingsGameWidth.value = '-1'; settingsGameWidth.dispatchEvent(new KeyboardEvent('keyup', { key: '1', bubbles: true }))`)
        assert.equal(await run(`modsEditSave.disabled`), true)
        assert.equal(await run(`settingsGameWidth.getAttribute('aria-invalid')`), 'true')
        await screenshot('editor-invalid')
        await run(`settingsGameWidth.value = '1600'; settingsGameWidth.dispatchEvent(new KeyboardEvent('keyup', { key: '0', bubbles: true }))`)
        assert.equal(await run(`modsEditSave.disabled`), false)
        assert.equal(await run(`settingsGameWidth.hasAttribute('aria-invalid')`), false)
        const ramBefore = await run(`Number(settingsMaxRAMRange.getAttribute('value'))`)
        await run(`settingsMaxRAMRange.scrollIntoView({ block: 'center' }); settingsMaxRAMRange.focus()`)
        assert.equal(await run(`document.activeElement.id`), 'settingsMaxRAMRange')
        await key('Right')
        const ramAfter = await run(`Number(settingsMaxRAMRange.getAttribute('value'))`)
        assert.ok(ramAfter > ramBefore, `RAM slider moved (${ramBefore} -> ${ramAfter})`)
        await screenshot('editor-game')
        await run(`modsEditSave.click()`)
        await waitFor(`modsPanelEdit.hidden`, 'editor closed')
        const leveKey = `${SERVER}@${leveId}`
        assert.equal(await run(`ConfigManager.getProfileGameWidth(${JSON.stringify(leveKey)})`), 1600)
        assert.notEqual(await run(`ConfigManager.getProfileGameWidth(${JSON.stringify(SERVER)})`), 1600)
        assert.equal(await run(`ConfigManager.getMaxRAM(${JSON.stringify(leveKey)})`), ramAfter % 1 > 0 ? ramAfter * 1024 + 'M' : ramAfter + 'G')
        assert.notEqual(await run(`ConfigManager.getMaxRAM(${JSON.stringify(leveKey)})`), await run(`ConfigManager.getMaxRAM(${JSON.stringify(SERVER)})`))
        check('editor: invalid width blocks Save, keyboard RAM slider, settings saved per profile')

        // 9. Duplicate, then delete the copy
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden && !modsEditDuplicate.disabled`, 'editor reopened')
        await run(`modsEditDuplicate.click()`)
        await waitFor(`modsProfileName.textContent === 'Leve (cópia)' && modsPanelEdit.hidden`, 'duplicated')
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden && !modsEditDelete.hidden && !modsEditSave.disabled`, 'delete available')
        await run(`modsEditDelete.click()`)
        await waitFor(`isOverlayVisible()`, 'delete confirmation')
        await run(`overlayAcknowledge.click()`)
        await waitFor(`modsProfileName.textContent === 'Padrão' && modsPanelEdit.hidden`, 'back to default after delete')
        assert.deepEqual(await run(`ProfileManager.list(${JSON.stringify(SERVER)}).map(p => p.name)`), ['Padrão', 'Leve'])
        assert.equal(trashed.length, 1)
        assert.ok(trashed[0].startsWith(path.join(instanceDir, '.perfis') + path.sep), 'only a profile folder goes to the trash: ' + trashed[0])
        assert.ok(fs.existsSync(leveDir), 'the original profile folder is kept')
        check('duplicate and delete through the overlay, trash limited to .perfis')

        // 10. Narrow window
        win.setSize(800, 600)
        await pause(250)
        await noOverflow('800x600')
        await screenshot('mods-800')
        win.setSize(1100, 700)
        await pause(150)
        check('800x600 layout without horizontal overflow')

        // 11. Escape closes the screen; landing lists the profiles
        await key('Escape')
        await waitFor(`getCurrentView() === VIEWS.landing`, 'back to landing')
        assert.deepEqual(await landingOptions(), ['Padrão', 'Leve', '+ Novo perfil…'])
        check('Escape back to landing with the updated profile list')

        // 12. Launch-time blocklist check on the default profile
        fs.writeFileSync(path.join(padraoMods, 'sodium-1.0.jar'), fake.files['sodium-1.0.jar'].buf)
        await run(`disableBlockedContent(DistroAPI.distribution.getServerById(${JSON.stringify(SERVER)}), ${JSON.stringify(padraoDir)}, console)`)
        assert.ok(fs.existsSync(path.join(padraoMods, 'sodium-1.0.jar.disabled')))
        assert.ok(!fs.existsSync(path.join(padraoMods, 'sodium-1.0.jar')))
        assert.ok(fs.existsSync(path.join(padraoMods, 'iris-2.0.jar')), 'allowed mods stay enabled')
        assert.equal(await run(`isOverlayVisible()`), true)
        assert.equal(await run(`overlayTitle.textContent`), 'Conteúdo Proibido Desativado')
        await screenshot('launch-blocked')
        await run(`overlayAcknowledge.click()`)
        check('blocked content disabled at launch with a notice')

        // 13. Links from rendered descriptions open outside, normalised
        const link = await run(`(async () => {
            const box = document.createElement('div')
            box.innerHTML = RichText.render('[x](HTTPS://evil.example)')
            document.body.appendChild(box)
            const a = box.querySelector('a')
            const opened = []
            const original = shell.openExternal
            shell.openExternal = url => { opened.push(url); return Promise.resolve() }
            const before = location.href
            try {
                a.click()
                await new Promise(resolve => setTimeout(resolve, 100))
            } finally {
                shell.openExternal = original
                box.remove()
            }
            return { href: a.getAttribute('href'), opened, same: location.href === before }
        })()`)
        assert.deepEqual(link, { href: 'https://evil.example/', opened: ['https://evil.example/'], same: true })
        check('rendered links normalised and opened externally')

        // 14. No renderer exceptions
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
