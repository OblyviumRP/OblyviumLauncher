// Abre a nova interface (ui/dist) no Electron com uma distribuição falsa e um
// perfil de dados isolado, percorre as telas e falha em erro de renderer.
// Uso: npm run ui:verify (no Linux sem tela: xvfb-run -a npm run ui:verify)
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const entry = path.join(root, 'ui', 'dist', 'index.html')
const output = path.join(os.tmpdir(), 'oblyvium-ui-qa')
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

if(!fs.existsSync(entry)){
    console.error('ui/dist não existe. Rode npm run ui:build antes.')
    process.exit(1)
}

fs.mkdirSync(output, { recursive: true })
const runProfile = path.join(output, 'runs', String(process.pid))
fs.mkdirSync(runProfile, { recursive: true })
process.env.APPDATA = path.join(runProfile, 'profile')
process.env.ELECTRON_IS_DEV = '1'
// Nada de feeds de produção durante a verificação.
process.env.OBLYVIUM_NOTIFICATIONS_URL = 'http://127.0.0.1:9/notifications.json'
process.env.OBLYVIUM_CHANGELOG_URL = 'http://127.0.0.1:9/changelog.json'
app.setPath('userData', path.join(runProfile, 'userData'))
app.disableHardwareAcceleration()

const preload = path.join(output, 'preload.cjs')
fs.writeFileSync(preload, `
const root = ${JSON.stringify(root)};
const { ipcRenderer } = require('electron');
const C = require(root + '/app/assets/js/configmanager');
C.load();
require(root + '/app/assets/js/langloader').setupLanguage();
const api = require(root + '/app/assets/js/distromanager').DistroAPI;
api.commonDir = C.getCommonDirectory();
api.instanceDir = C.getInstanceDirectory();
const {HeliosDistribution} = require(root + '/node_modules/helios-core/dist/common/distribution/DistributionFactory.js');
const artifact = { size: 1, MD5: '0', url: 'http://127.0.0.1:9/x.jar' };
const raw = { version: '1.0.0', servers: [
    { id: 'qa-principal', name: 'Servidor principal', description: 'Servidor de teste da nova interface', icon: '', address: '127.0.0.1:9',
      minecraftVersion: '1.20.1', version: '1.0.0', mainServer: true, autoconnect: false,
      modules: [
        { id: 'net.minecraftforge:forge:1.20.1-47.3.0', name: 'Minecraft Forge', type: 'ForgeHosted', artifact },
        { id: 'com.exemplo:obrigatorio:1.0.0', name: 'Mod obrigatório', type: 'ForgeMod', artifact },
        { id: 'com.exemplo:opcional:1.0.0', name: 'Mod opcional', type: 'ForgeMod', required: { value: false, def: true }, artifact }
      ] },
    { id: 'qa-vanilla', name: 'Eventos', description: 'Sem mods', icon: '', address: '127.0.0.1:9',
      minecraftVersion: '1.21.1', version: '1.0.0', mainServer: false, autoconnect: false, modules: [] }
] };
api.rawDistribution = raw;
api.distribution = new HeliosDistribution(raw, C.getCommonDirectory(), C.getInstanceDirectory());
api.refreshDistributionOrFallback = async () => api.distribution;
C.setSelectedServer('qa-principal');
C.save();
window.distributionIndexResult = true;
ipcRenderer.send('distributionIndexDone', true);
`)

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
ipcMain.on('distributionIndexDone', () => {})
ipcMain.on('autoUpdateAction', () => {})
ipcMain.handle('TRASH_ITEM', async () => ({ result: false }))

app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1100, height: 700, frame: false, show: true, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, preload } })
    remoteMain.enable(win.webContents)
    win.webContents.on('console-message', event => {
        if(event.level === 'error'){
            console.error('Renderer:', event.message)
            // Falhas de rede (feeds, minotar, Modrinth sem internet) são esperadas aqui.
            if(!/net::ERR_|Failed to load resource|ERR_CONNECTION|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(event.message)) errors.push(event.message)
        }
    })
    win.webContents.on('preload-error', (_e, _p, error) => errors.push('preload: ' + error))
    const run = code => win.webContents.executeJavaScript(code).catch(err => { throw new Error(`${err.message}\n  em: ${code.slice(0, 160)}`) })
    const go = async hash => { await run(`location.hash = ${JSON.stringify(hash)}`); await pause(700) }
    const text = () => run('document.body.innerText')
    // Clique de verdade (mouse), para Radix e Motion reagirem como com uma pessoa.
    const click = async (selector, label) => {
        const point = await run(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(x => x.getClientRects().length); const e = ${label ? `els.find(x => x.textContent.trim().includes(${JSON.stringify(label)}))` : 'els[0]'}; if(!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
        assert.ok(point, `não achei ${selector} ${label ?? ''}`)
        win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
        win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
        win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
        await pause(600)
    }
    const waitFor = async selector => {
        for(let i = 0; i < 30; i++){
            if(await run(`!!document.querySelector(${JSON.stringify(selector)})`)) return
            await pause(100)
        }
        throw new Error('não apareceu: ' + selector)
    }
    const type = async (selector, value) => {
        await waitFor(selector)
        await run(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })) })()`)
        await pause(200)
    }
    const shot = async name => {
        await run('document.fonts.ready')
        await pause(300)
        fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
    }
    const noOverflow = async label => {
        const wide = await run('document.documentElement.scrollWidth > innerWidth + 1')
        assert.equal(wide, false, label + ': rolagem horizontal')
    }
    const config = code => run(`(() => { const C = require(${JSON.stringify(root + '/app/assets/js/configmanager')}); return ${code} })()`)

    try {
        await win.loadFile(entry)
        await pause(2000)

        // Primeiro acesso: sem conta, cai no login.
        assert.match(await text(), /Entre na sua conta/)
        await shot('01-login')
        await click('button', 'Jogar offline')
        await type('input', 'TesterQA')
        await click('button[type=submit]', 'Entrar')
        await pause(800)
        assert.equal(await config('C.getSelectedAccount()?.displayName'), 'TesterQA', 'conta offline salva')
        // Dois servidores: pergunta onde jogar.
        assert.match(await text(), /Onde você quer jogar/)
        await click('button[role=radio]', 'Servidor principal')
        await click('button', 'Começar')
        await pause(800)

        assert.match(await text(), /Servidor principal/)
        assert.match(await text(), /Perfil\s+Padrão/)
        await noOverflow('início')
        await shot('02-inicio')

        // Servidores e criação de perfil.
        await go('#/servidores')
        assert.match(await text(), /Perfis de Servidor principal/)
        await click('button', 'Novo perfil')
        await type('[role=dialog] input', 'Construção')
        await click('[role=dialog] button[type=submit]', 'Criar perfil')
        await pause(800)
        const profiles = await config('C.getProfiles ? JSON.stringify(C.getProfiles()) : ""')
        assert.match(profiles, /Construção/, 'perfil criado no config')
        await shot('03-servidores')

        // Perfil: conteúdo, mods do pacote e configurações.
        await go('#/perfil')
        assert.match(await text(), /Construção/)
        await click('[role=tab]', 'Mods do servidor')
        assert.match(await text(), /Mod opcional/)
        assert.match(await text(), /obrigatório/)
        await click('[role=switch][aria-label="Mod opcional"]')
        const key = await run(`require(${JSON.stringify(root + '/app/assets/js/profilemanager')}).getSelectedConfigKey()`)
        const modConf = await config(`JSON.stringify(C.getModConfiguration(${JSON.stringify(key)}))`)
        assert.match(modConf, /"com\.exemplo:opcional":false/, 'mod opcional desligado no perfil')
        await shot('04-perfil-pacote')
        await click('[role=tab]', 'Configurações')
        assert.match(await text(), /Memória máxima/)
        await noOverflow('perfil')
        await shot('05-perfil-config')

        // Configurações do launcher gravam no ConfigManager.
        await go('#/configuracoes')
        const before = await config('C.getHideLauncherWhilePlaying()')
        await click('#s-hideLauncherWhilePlaying')
        assert.equal(await config('C.getHideLauncherWhilePlaying()'), !before, 'opção salva')
        await shot('06-configuracoes')

        for(const [hash, expected, name] of [
            ['#/descobrir', /Descobrir/, '07-descobrir'],
            ['#/skins', /conta Microsoft/, '08-skins-offline'],
            ['#/downloads', /Downloads/, '09-downloads'],
            ['#/console', /Nenhum jogo aberto/, '10-console']
        ]){
            await go(hash)
            assert.match(await text(), expected, hash)
            await noOverflow(hash)
            await shot(name)
        }

        // Servidor sem loader: Descobrir não oferece mods.
        await go('#/servidores')
        await click('button', 'Selecionar')
        await go('#/descobrir?tipo=mod')
        assert.match(await text(), /Servidor sem mods/)
        assert.equal(await config('C.getSelectedServer()'), 'qa-vanilla')

        // Sidebar recolhida continua navegável.
        await go('#/')
        await click('button[aria-label="Recolher menu"]')
        await pause(500)
        await shot('11-sidebar-recolhida')

        assert.deepEqual(errors, [], 'erros no renderer')
        console.log(`Nova interface verificada. Capturas em ${output}`)
        app.exit(0)
    } catch(err){
        console.error(err)
        await shot('falha').catch(() => {})
        app.exit(1)
    }
})
