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
// O teste lê os textos em português; o idioma do sistema da máquina de teste não importa.
if(C.getLanguage() == null) C.setLanguage('pt-BR');
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
    { id: 'qa-principal-vulkan', name: 'Principal Vulkan', description: 'Mesmo modpack com Vulkan', icon: '', address: '127.0.0.1:9',
      minecraftVersion: '1.20.1', version: '1.0.0', mainServer: false, autoconnect: false,
      modules: [
        { id: 'net.minecraftforge:forge:1.20.1-47.3.0', name: 'Minecraft Forge', type: 'ForgeHosted', artifact },
        { id: 'com.exemplo:vulkanmod:1.0.0', name: 'VulkanMod', type: 'ForgeMod', artifact }
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
// Mesmas ligações de janela do index.js (maximizar e restaurar).
let mainWindow = null
ipcMain.on('WINDOW_TOGGLE_MAXIMIZE', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('WINDOW_MAXIMIZE', () => mainWindow.maximize())

app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1100, height: 700, frame: false, show: true, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, preload } })
    remoteMain.enable(win.webContents)
    mainWindow = win
    win.on('maximize', () => win.webContents.send('WINDOW_MAXIMIZED_CHANGED', true))
    win.on('unmaximize', () => win.webContents.send('WINDOW_MAXIMIZED_CHANGED', false))
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
        // Ficha do servidor (no lugar das pílulas) e arte só na área de conteúdo.
        assert.match(await text(), /Renderizador\s+OpenGL/, 'ficha do servidor')
        assert.match(await text(), /Versão\s+1\.20\.1 · Forge/, 'versão na ficha')
        assert.ok(await run(`!!document.querySelector('main [aria-hidden] svg, main [aria-hidden] img')`), 'arte no Início')
        assert.ok(await run(`!!document.querySelector('.fj-dither-fade')`), 'transição em pixels')
        // Só o perfil padrão: o seletor de perfis não aparece.
        assert.equal(await run(`document.querySelectorAll('main [role=radiogroup]').length`), 0, 'sem seletor de perfis')
        await noOverflow('início')
        await shot('02-inicio')

        // Mods do Modrinth sim; modpacks e criação de perfil não.
        const nav = await run(`[...document.querySelectorAll('nav a')].map(a => a.textContent.trim()).join('|')`)
        assert.match(nav, /Descobrir/, 'menu com Descobrir: ' + nav)
        assert.doesNotMatch(nav, /Modpacks/, 'menu sem Modpacks: ' + nav)
        for(const hash of ['#/modpacks', '#/servidores']){
            await go(hash)
            assert.equal(await run('location.hash'), '#/', hash + ' volta ao Início')
        }

        // Perfil: conteúdo do Modrinth, mods opcionais da staff, capturas, logs e configurações.
        await go('#/perfil')
        const tabs = await run(`[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim()).join('|')`)
        assert.match(tabs, /Conteúdo/, 'aba de conteúdo: ' + tabs)
        assert.match(tabs, /Mods do servidor/)
        assert.match(await text(), /Nada instalado neste perfil/, 'conteúdo vazio')
        assert.doesNotMatch(await text(), /Duplicar|Novo perfil/, 'sem duplicar nem criar perfil')
        await shot('03-perfil-conteudo')
        await click('[role=tab]', 'Mods do servidor')
        assert.match(await text(), /Mod opcional/)
        assert.match(await text(), /obrigatório/)
        await click('[role=switch][aria-label="Mod opcional"]')
        const key = await run(`require(${JSON.stringify(root + '/app/assets/js/profilemanager')}).getSelectedConfigKey()`)
        const modConf = await config(`JSON.stringify(C.getModConfiguration(${JSON.stringify(key)}))`)
        assert.match(modConf, /"com\.exemplo:opcional":false/, 'mod opcional desligado no perfil')
        await shot('04-perfil-pacote')
        await click('[role=tab]', 'Configurações')
        assert.match(await text(), /Versões aceitas/)
        assert.doesNotMatch(await text(), /Memória máxima/, 'memória saiu do perfil')
        await noOverflow('perfil')
        await shot('05-perfil-config')

        // Memória global: vale para todas as chaves (modpacks e perfis).
        await go('#/configuracoes?aba=jogo')
        assert.match(await text(), /Memória máxima/)
        await click('[role=slider]')
        for(const keyCode of ['Right', 'Right']){
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
            await pause(200)
        }
        await pause(400)
        const globalRam = await config('C.getGlobalMaxRAM()')
        assert.ok(globalRam != null, 'memória global salva')
        const rams = await config('JSON.stringify(C.getJavaConfigKeys().filter(k => k.startsWith("qa-principal")).map(k => C.getMaxRAM(k)))')
        assert.ok(JSON.parse(rams).length >= 2, 'servidores com configuração de Java: ' + rams)
        assert.ok(JSON.parse(rams).every(v => v === JSON.parse(rams)[0]), 'mesma memória em todos: ' + rams)
        await shot('05b-config-jogo')

        // Idioma: troca para inglês e volta.
        await go('#/configuracoes')
        await click('button[aria-label="Idioma"]')
        await click('[role=option]', 'English')
        await pause(800)
        assert.match(await text(), /Settings/)
        assert.match(await text(), /When the game opens/)
        assert.equal(await config('C.getLanguage()'), 'en')
        await shot('05c-ingles')
        await click('button[aria-label="Language"]')
        await click('[role=option]', 'Português')
        await pause(800)
        assert.match(await text(), /Configurações/)


        // Configurações do launcher gravam no ConfigManager.
        await go('#/configuracoes')
        assert.equal(await config('C.getLauncherOnPlay()'), 'tray', 'padrão: esconder na bandeja')
        await click('button[aria-label="Quando o jogo abrir"]')
        await click('[role=option]', 'Minimizar')
        assert.equal(await config('C.getLauncherOnPlay()'), 'minimize', 'opção salva')
        assert.equal(await config('C.getHideLauncherWhilePlaying()'), false, 'opção antiga em sincronia')
        await shot('06-configuracoes')

        // Janela: botão da barra de título maximiza e restaura (sem tela cheia) e o estado fica salvo.
        // Sem gerenciador de janelas (xvfb puro) o sistema ignora o maximizar; aí o passo é pulado.
        await click('button[aria-label="Maximizar"]')
        await pause(800)
        if(win.isMaximized()){
            assert.equal(win.isFullScreen(), false, 'maximizar não é tela cheia')
            assert.equal(await config('C.getLauncherMaximized()'), true, 'estado maximizado salvo')
            await click('button[aria-label="Restaurar"]')
            await pause(800)
            assert.equal(win.isMaximized(), false, 'restaurou')
            assert.equal(await config('C.getLauncherMaximized()'), false, 'estado restaurado salvo')
        } else {
            console.log('Aviso: sem gerenciador de janelas, maximizar não foi testado.')
        }

        // Descrição dos projetos do Modrinth: Markdown vira HTML sem nada executável.
        const body = await run(`require(${JSON.stringify(root + '/app/assets/js/richtext')}).render('# Oi\\n\\n<script>alert(1)</script><a href="javascript:x">l</a>\\n\\n[ok](https://modrinth.com)')`)
        assert.match(body, /<h1>Oi<\/h1>/)
        assert.match(body, /href="https:\/\/modrinth\.com\/"/)
        assert.doesNotMatch(body, /script|javascript/)

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

        // Trocar de servidor pelo Início ("Outros servidores"); servidor sem mods não tem a aba.
        await go('#/')
        await click('button[aria-label="Jogar em Eventos"]')
        await pause(600)
        assert.equal(await config('C.getSelectedServer()'), 'qa-vanilla')
        await go('#/perfil')
        assert.doesNotMatch(await run(`[...document.querySelectorAll('[role=tab]')].map(t => t.textContent).join('|')`), /Mods do servidor/, 'sem aba de mods')
        // Servidor sem loader: Descobrir não oferece mods.
        await go('#/descobrir?tipo=mod')
        assert.match(await text(), /Servidor sem mods/)

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
