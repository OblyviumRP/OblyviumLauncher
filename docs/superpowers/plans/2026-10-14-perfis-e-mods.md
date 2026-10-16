# Perfis e tela de mods — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vários perfis por servidor, cada um com pasta de jogo, conteúdo e ajustes próprios, e uma tela "Mods" no estilo do app da Modrinth para gerenciar e instalar mods, resource packs e shaders.

**Architecture:** Um perfil é identificado por uma *chave de configuração* (`<serverId>` para o Padrão, `<serverId>@<profileId>` para os outros). Todo ajuste que hoje é por servidor no `ConfigManager` (Java, memória, mods opcionais) passa a ser guardado por essa chave, então o código existente continua funcionando trocando apenas o argumento. Arquivos de perfil vivem em `instances/` (Padrão) ou `instances/.perfis/<id>/`. A lógica fica em módulos Node testáveis (`profiles.js`, `contentmanager.js`, `modrinth.js`); a tela nova (`mods.ejs` + `scripts/mods.js`) só orquestra.

**Tech Stack:** Electron 39 (renderer com `nodeIntegration`), EJS, jQuery, `got` 11, `fs-extra`, helios-core, `node:test`, `marked` 15 (CommonJS), `dompurify` 3.

**Spec:** `docs/superpowers/specs/2026-10-14-perfis-e-mods-design.md`

---

## Antes de começar

- Rode tudo a partir da raiz do repositório (`E:\Oblyvium-Projects\OblyviumLauncher`), no Git Bash.
- Os arquivos do repositório usam **CRLF** em parte deles. Edite com a ferramenta de edição, não com `sed -i` em arquivos CRLF. Se precisar de script, preserve o fim de linha original.
- Lint: `npx eslint --rule '@stylistic/linebreak-style: off' <arquivos>`. A regra de quebra de linha já falha no repositório inteiro; não é sua responsabilidade.
- Os scripts de `app/assets/js/scripts/*.js` são carregados como `<script>` clássicos e **compartilham o escopo global**. Nunca declare de novo um `const`/`let` global que já exista em outro script (ex.: `Modrinth`, `ConfigManager`, `DistroAPI`). Módulos compartilhados ficam declarados só em `uibinder.js`.
- Ordem de carga dos scripts: `uicore.js`, `uibinder.js` (no `<head>`), depois os `<script>` no fim de cada `.ejs` na ordem dos `include` de `app/app.ejs`.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `app/assets/js/profiles.js` | criar | Funções puras de perfis (store, chaves, pastas, cópia de arquivos) |
| `app/assets/js/profilemanager.js` | criar | Perfis ligados ao `ConfigManager` e à lixeira (renderer) |
| `app/assets/js/configmanager.js` | modificar | `profiles`, `gameConfig` por chave, cópia/remoção de config de perfil |
| `app/assets/js/scripts/uibinder.js` | modificar | Globais compartilhados; sincronizar mods opcionais e Java por chave |
| `app/assets/js/processbuilder.js` | modificar | Pasta do jogo e ajustes do perfil |
| `app/assets/js/scripts/landing.js` | modificar | Seletor de perfil, botão Mods, Jogar com o perfil, checagem de proibidos |
| `app/landing.ejs` | modificar | Seletor de perfil e botão Mods |
| `app/assets/js/modrinth.js` | reescrever | Busca por tipo e categoria, projeto, instalação, atualizações |
| `app/assets/js/contentmanager.js` | criar | Arquivos de conteúdo do perfil por tipo |
| `app/assets/js/richtext.js` | criar | Markdown da Modrinth → HTML limpo |
| `app/assets/js/profileicons.js` | criar | Desenhos SVG dos ícones de perfil |
| `app/mods.ejs` | criar | Marcação da tela de mods |
| `app/assets/js/scripts/mods.js` | criar | Comportamento da tela de mods |
| `app/app.ejs` | modificar | Incluir `mods` antes de `settings` |
| `app/assets/js/scripts/settings.js` | modificar | Init/save genéricos por raiz e chave; remover abas Mods e Java |
| `app/settings.ejs` | modificar | Remover abas Mods e Java; mover campos de jogo para o perfil |
| `app/assets/css/forja.css` | modificar | Estilos da tela de mods e do seletor de perfil |
| `app/assets/lang/en_US.toml` | modificar | Textos novos |
| `app/assets/js/dropinmodutil.js` | apagar | Substituído por `contentmanager.js` |
| `test/profiles.test.js`, `test/modrinth.test.js`, `test/contentmanager.test.js` | criar | Testes unitários |
| `test/helpers/fakeModrinth.js` | criar | Servidor HTTP local que imita a API da Modrinth |
| `scripts/verify-mods.cjs` | criar | Verificação no Electron com capturas |
| `package.json` | modificar | Script `test`, `verify:mods`, dependências |

---

# Fase 1 — Perfis

### Task 1: Funções puras de perfis

**Files:**
- Create: `app/assets/js/profiles.js`
- Create: `test/profiles.test.js`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, depois de `"verify:visual"`:

```json
    "test": "node --test \"test/*.test.js\"",
```

- [ ] **Step 2: Escrever os testes**

Crie `test/profiles.test.js`:

```js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Profiles = require('../app/assets/js/profiles')

const NOW = new Date('2026-10-14T19:00:00Z')

test('ensureServer cria o Padrão e o seleciona', () => {
    const store = {}
    const entry = Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(entry.selected, 'padrao')
    assert.deepEqual(entry.list, [{ id: 'padrao', name: 'Padrão', icon: 'espada', created: NOW.toISOString() }])
})

test('ensureServer recupera seleção inválida', () => {
    const store = { oblyvium: { selected: 'sumiu', list: [] } }
    Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.equal(store.oblyvium.list[0].id, 'padrao')
})

test('configKey usa o id do servidor para o Padrão', () => {
    assert.equal(Profiles.configKey('oblyvium', 'padrao'), 'oblyvium')
    assert.equal(Profiles.configKey('oblyvium', 'a1b2c3d4'), 'oblyvium@a1b2c3d4')
})

test('pastas do Padrão e de outros perfis', () => {
    const inst = path.join('C:', 'dados', 'instances')
    assert.equal(Profiles.gameDir(inst, 'oblyvium', 'padrao'), path.join(inst, 'oblyvium'))
    assert.equal(Profiles.instanceRoot(inst, 'a1b2c3d4'), path.join(inst, '.perfis', 'a1b2c3d4'))
    assert.equal(Profiles.gameDir(inst, 'oblyvium', 'a1b2c3d4'), path.join(inst, '.perfis', 'a1b2c3d4', 'oblyvium'))
})

test('createProfile valida nome e ícone', () => {
    const store = {}
    const p = Profiles.createProfile(store, 'oblyvium', { name: '  Leve  ', icon: 'nao-existe' }, { id: 'a1b2c3d4', now: NOW })
    assert.deepEqual(p, { id: 'a1b2c3d4', name: 'Leve', icon: 'espada', created: NOW.toISOString() })
    assert.equal(Profiles.listProfiles(store, 'oblyvium').length, 2)
    assert.throws(() => Profiles.createProfile(store, 'oblyvium', { name: '   ' }), /Invalid profile name/)
    assert.throws(() => Profiles.createProfile(store, 'oblyvium', { name: 'x'.repeat(33) }), /Invalid profile name/)
})

test('select, updateProfile e getSelected', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve', icon: 'livro' }, { id: 'a1b2c3d4', now: NOW })
    Profiles.select(store, 'oblyvium', 'a1b2c3d4')
    assert.equal(Profiles.getSelected(store, 'oblyvium').name, 'Leve')
    Profiles.updateProfile(store, 'oblyvium', 'a1b2c3d4', { name: 'Completo', icon: 'coroa' })
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'a1b2c3d4').name, 'Completo')
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'a1b2c3d4').icon, 'coroa')
    assert.throws(() => Profiles.select(store, 'oblyvium', 'nao-existe'), /Unknown profile/)
})

test('removeProfile protege o Padrão e volta a seleção para ele', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve' }, { id: 'a1b2c3d4', now: NOW })
    Profiles.select(store, 'oblyvium', 'a1b2c3d4')
    assert.throws(() => Profiles.removeProfile(store, 'oblyvium', 'padrao'), /cannot be removed/)
    Profiles.removeProfile(store, 'oblyvium', 'a1b2c3d4')
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.equal(store.oblyvium.list.length, 1)
})

test('copySettingsFiles copia só opções e config', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await fs.outputFile(path.join(src, 'options.txt'), 'key_key.jump:key.keyboard.space\n')
    await fs.outputFile(path.join(src, 'config', 'jei.toml'), 'a=1\n')
    await fs.outputFile(path.join(src, 'mods', 'x.jar'), 'jar')
    await Profiles.copySettingsFiles(src, dst)
    assert.equal(await fs.readFile(path.join(dst, 'options.txt'), 'utf8'), 'key_key.jump:key.keyboard.space\n')
    assert.ok(await fs.pathExists(path.join(dst, 'config', 'jei.toml')))
    assert.ok(!await fs.pathExists(path.join(dst, 'mods')))
})

test('copyGameDir copia tudo menos logs e crash-reports', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await fs.outputFile(path.join(src, 'mods', 'x.jar'), 'jar')
    await fs.outputFile(path.join(src, 'saves', 'Mundo', 'level.dat'), 'nbt')
    await fs.outputFile(path.join(src, 'logs', 'latest.log'), 'log')
    await fs.outputFile(path.join(src, 'crash-reports', 'c.txt'), 'crash')
    await Profiles.copyGameDir(src, dst)
    assert.ok(await fs.pathExists(path.join(dst, 'mods', 'x.jar')))
    assert.ok(await fs.pathExists(path.join(dst, 'saves', 'Mundo', 'level.dat')))
    assert.ok(!await fs.pathExists(path.join(dst, 'logs')))
    assert.ok(!await fs.pathExists(path.join(dst, 'crash-reports')))
})

test('copyGameDir aceita origem inexistente', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    await Profiles.copyGameDir(path.join(tmp, 'nao-existe'), path.join(tmp, 'dst'))
    assert.ok(await fs.pathExists(path.join(tmp, 'dst')))
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL com `Cannot find module '../app/assets/js/profiles'`.

- [ ] **Step 4: Implementar**

Crie `app/assets/js/profiles.js`:

```js
/**
 * Pure helpers for launcher profiles. A profile is a separate game folder
 * for one server, with its own content and settings.
 *
 * The store lives in config.json under "profiles":
 *   { "<serverId>": { "selected": "padrao", "list": [{ id, name, icon, created }] } }
 *
 * Java, game and optional-mod settings stay in ConfigManager, keyed by
 * configKey(serverId, profileId).
 */
const crypto = require('crypto')
const fs     = require('fs-extra')
const path   = require('path')

const DEFAULT_ID = 'padrao'
const DEFAULT_NAME = 'Padrão'
const ICONS = ['espada', 'escudo', 'machado', 'arco', 'picareta', 'livro', 'pocao', 'coroa']
const PROFILES_DIR = '.perfis'
const SETTINGS_FILES = ['options.txt', 'optionsof.txt', 'optionsshaders.txt', 'config']
const SKIP_ON_COPY = new Set(['logs', 'crash-reports'])

exports.DEFAULT_ID = DEFAULT_ID
exports.ICONS = ICONS

exports.configKey = function(serverId, profileId) {
    return profileId === DEFAULT_ID ? serverId : `${serverId}@${profileId}`
}

exports.instanceRoot = function(instanceDir, profileId) {
    return profileId === DEFAULT_ID ? instanceDir : path.join(instanceDir, PROFILES_DIR, profileId)
}

exports.gameDir = function(instanceDir, serverId, profileId) {
    return path.join(exports.instanceRoot(instanceDir, profileId), serverId)
}

exports.ensureServer = function(store, serverId, now = new Date()) {
    if(store[serverId] == null) {
        store[serverId] = { selected: DEFAULT_ID, list: [] }
    }
    const entry = store[serverId]
    if(!entry.list.some(p => p.id === DEFAULT_ID)) {
        entry.list.unshift({ id: DEFAULT_ID, name: DEFAULT_NAME, icon: ICONS[0], created: now.toISOString() })
    }
    if(!entry.list.some(p => p.id === entry.selected)) {
        entry.selected = DEFAULT_ID
    }
    return entry
}

exports.listProfiles = function(store, serverId) {
    return exports.ensureServer(store, serverId).list
}

exports.getProfile = function(store, serverId, profileId) {
    return exports.listProfiles(store, serverId).find(p => p.id === profileId) ?? null
}

exports.getSelected = function(store, serverId) {
    const entry = exports.ensureServer(store, serverId)
    return entry.list.find(p => p.id === entry.selected)
}

exports.select = function(store, serverId, profileId) {
    const entry = exports.ensureServer(store, serverId)
    if(!entry.list.some(p => p.id === profileId)) {
        throw new Error(`Unknown profile ${profileId} for ${serverId}`)
    }
    entry.selected = profileId
}

/**
 * @returns {string | null} The trimmed name, or null when it is not 1-32 characters.
 */
exports.validateName = function(name) {
    const trimmed = String(name ?? '').trim()
    return trimmed.length >= 1 && trimmed.length <= 32 ? trimmed : null
}

exports.newId = function() {
    return crypto.randomBytes(4).toString('hex')
}

exports.createProfile = function(store, serverId, { name, icon }, { id = exports.newId(), now = new Date() } = {}) {
    const valid = exports.validateName(name)
    if(valid == null) {
        throw new Error('Invalid profile name')
    }
    const profile = { id, name: valid, icon: ICONS.includes(icon) ? icon : ICONS[0], created: now.toISOString() }
    exports.listProfiles(store, serverId).push(profile)
    return profile
}

exports.updateProfile = function(store, serverId, profileId, { name, icon }) {
    const profile = exports.getProfile(store, serverId, profileId)
    if(profile == null) {
        throw new Error(`Unknown profile ${profileId} for ${serverId}`)
    }
    if(name !== undefined) {
        const valid = exports.validateName(name)
        if(valid == null) {
            throw new Error('Invalid profile name')
        }
        profile.name = valid
    }
    if(icon !== undefined && ICONS.includes(icon)) {
        profile.icon = icon
    }
    return profile
}

exports.removeProfile = function(store, serverId, profileId) {
    if(profileId === DEFAULT_ID) {
        throw new Error('The default profile cannot be removed')
    }
    const entry = exports.ensureServer(store, serverId)
    const index = entry.list.findIndex(p => p.id === profileId)
    if(index === -1) {
        throw new Error(`Unknown profile ${profileId} for ${serverId}`)
    }
    entry.list.splice(index, 1)
    if(entry.selected === profileId) {
        entry.selected = DEFAULT_ID
    }
}

/**
 * Copy video options, key binds and mod configs from one game folder to another.
 */
exports.copySettingsFiles = async function(srcGameDir, dstGameDir) {
    await fs.ensureDir(dstGameDir)
    for(const name of SETTINGS_FILES) {
        const src = path.join(srcGameDir, name)
        if(await fs.pathExists(src)) {
            await fs.copy(src, path.join(dstGameDir, name), { overwrite: true })
        }
    }
}

/**
 * Copy a whole game folder, leaving logs and crash reports behind.
 */
exports.copyGameDir = async function(srcGameDir, dstGameDir) {
    await fs.ensureDir(dstGameDir)
    if(!await fs.pathExists(srcGameDir)) {
        return
    }
    await fs.copy(srcGameDir, dstGameDir, {
        overwrite: true,
        filter: src => !SKIP_ON_COPY.has(path.relative(srcGameDir, src).split(path.sep)[0])
    })
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test`
Expected: PASS, 10 testes.

- [ ] **Step 6: Commit**

```bash
git add package.json app/assets/js/profiles.js test/profiles.test.js
git commit -m "Add pure profile helpers"
```

### Task 2: Configuração por perfil no ConfigManager

**Files:**
- Modify: `app/assets/js/configmanager.js`

`configmanager.js` exige `@electron/remote` ao carregar, então não tem teste unitário; ele é coberto pelo teste no Electron (Task 17).

- [ ] **Step 1: Novos campos no padrão**

Em `DEFAULT_CONFIG`, troque o final:

```js
    modConfigurations: [],
    javaConfig: {}
}
```

por:

```js
    modConfigurations: [],
    javaConfig: {},
    gameConfig: {},
    profiles: {}
}
```

(`validateKeySet` acrescenta esses campos a configs antigas ao carregar.)

- [ ] **Step 2: Funções de perfil**

Acrescente ao fim de `configmanager.js`:

```js
// Profiles

/**
 * The raw profiles store. See profiles.js for its shape.
 *
 * @returns {Object}
 */
exports.getProfiles = function(){
    return config.profiles
}

function gameConfigFor(key){
    if(config.gameConfig[key] == null){
        config.gameConfig[key] = {
            resWidth: config.settings.game.resWidth,
            resHeight: config.settings.game.resHeight,
            fullscreen: config.settings.game.fullscreen
        }
    }
    return config.gameConfig[key]
}

exports.getProfileGameWidth = function(key){
    return gameConfigFor(key).resWidth
}

exports.setProfileGameWidth = function(key, resWidth){
    gameConfigFor(key).resWidth = Number.parseInt(resWidth)
}

exports.validateProfileGameWidth = function(resWidth){
    return exports.validateGameWidth(resWidth)
}

exports.getProfileGameHeight = function(key){
    return gameConfigFor(key).resHeight
}

exports.setProfileGameHeight = function(key, resHeight){
    gameConfigFor(key).resHeight = Number.parseInt(resHeight)
}

exports.validateProfileGameHeight = function(resHeight){
    return exports.validateGameHeight(resHeight)
}

exports.getProfileFullscreen = function(key){
    return gameConfigFor(key).fullscreen
}

exports.setProfileFullscreen = function(key, fullscreen){
    gameConfigFor(key).fullscreen = fullscreen
}

/**
 * Copy Java, game and optional-mod settings from one profile key to another.
 */
exports.copyProfileConfig = function(srcKey, dstKey){
    if(config.javaConfig[srcKey] != null){
        config.javaConfig[dstKey] = JSON.parse(JSON.stringify(config.javaConfig[srcKey]))
    }
    config.gameConfig[dstKey] = JSON.parse(JSON.stringify(gameConfigFor(srcKey)))
    const modConf = exports.getModConfiguration(srcKey)
    if(modConf != null){
        exports.setModConfiguration(dstKey, { id: dstKey, mods: JSON.parse(JSON.stringify(modConf.mods)) })
    }
}

/**
 * Forget every setting stored for a profile key.
 */
exports.removeProfileConfig = function(key){
    delete config.javaConfig[key]
    delete config.gameConfig[key]
    config.modConfigurations = config.modConfigurations.filter(c => c.id !== key)
}
```

- [ ] **Step 3: Lint**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/configmanager.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/configmanager.js
git commit -m "Store game settings and profiles per profile key"
```

### Task 3: ProfileManager

**Files:**
- Create: `app/assets/js/profilemanager.js`

Também depende de `ConfigManager`; coberto pela Task 17.

- [ ] **Step 1: Implementar**

Crie `app/assets/js/profilemanager.js`:

```js
/**
 * Profiles bound to the launcher configuration. Renderer only.
 * Pure logic lives in profiles.js.
 */
const fs                = require('fs-extra')
const { ipcRenderer }   = require('electron')
const ConfigManager     = require('./configmanager')
const Profiles          = require('./profiles')
const { SHELL_OPCODE }  = require('./ipcconstants')

exports.DEFAULT_ID = Profiles.DEFAULT_ID
exports.ICONS = Profiles.ICONS
exports.validateName = Profiles.validateName

function store(){
    return ConfigManager.getProfiles()
}

exports.ensureServers = function(serverIds){
    for(const id of serverIds){
        Profiles.ensureServer(store(), id)
    }
    ConfigManager.save()
}

exports.list = function(serverId){
    return Profiles.listProfiles(store(), serverId)
}

exports.get = function(serverId, profileId){
    return Profiles.getProfile(store(), serverId, profileId)
}

exports.getSelected = function(serverId = ConfigManager.getSelectedServer()){
    return Profiles.getSelected(store(), serverId)
}

exports.select = function(serverId, profileId){
    Profiles.select(store(), serverId, profileId)
    ConfigManager.save()
}

exports.configKey = function(serverId, profileId){
    return Profiles.configKey(serverId, profileId)
}

exports.configKeys = function(serverId){
    return exports.list(serverId).map(p => Profiles.configKey(serverId, p.id))
}

exports.getSelectedConfigKey = function(serverId = ConfigManager.getSelectedServer()){
    return Profiles.configKey(serverId, exports.getSelected(serverId).id)
}

exports.getInstanceRoot = function(profileId){
    return Profiles.instanceRoot(ConfigManager.getInstanceDirectory(), profileId)
}

exports.getGameDir = function(serverId, profileId){
    return Profiles.gameDir(ConfigManager.getInstanceDirectory(), serverId, profileId)
}

exports.getSelectedGameDir = function(serverId = ConfigManager.getSelectedServer()){
    return exports.getGameDir(serverId, exports.getSelected(serverId).id)
}

/**
 * @param {string} serverId
 * @param {{name: string, icon: string, copyFrom: string | null}} options
 * copyFrom is a profile id whose options.txt, keybinds and configs are copied.
 * Java and game settings always come from copyFrom, or from the default profile.
 */
exports.create = async function(serverId, { name, icon, copyFrom = null }){
    const profile = Profiles.createProfile(store(), serverId, { name, icon })
    ConfigManager.copyProfileConfig(
        Profiles.configKey(serverId, copyFrom ?? Profiles.DEFAULT_ID),
        Profiles.configKey(serverId, profile.id)
    )
    if(copyFrom != null){
        await Profiles.copySettingsFiles(exports.getGameDir(serverId, copyFrom), exports.getGameDir(serverId, profile.id))
    }
    ConfigManager.save()
    return profile
}

exports.duplicate = async function(serverId, profileId){
    const source = exports.get(serverId, profileId)
    const name = `${source.name} (cópia)`.slice(0, 32)
    const profile = Profiles.createProfile(store(), serverId, { name, icon: source.icon })
    ConfigManager.copyProfileConfig(Profiles.configKey(serverId, profileId), Profiles.configKey(serverId, profile.id))
    await Profiles.copyGameDir(exports.getGameDir(serverId, profileId), exports.getGameDir(serverId, profile.id))
    ConfigManager.save()
    return profile
}

exports.update = function(serverId, profileId, changes){
    const profile = Profiles.updateProfile(store(), serverId, profileId, changes)
    ConfigManager.save()
    return profile
}

/**
 * Remove a profile and send its folder to the trash.
 */
exports.remove = async function(serverId, profileId){
    const root = exports.getInstanceRoot(profileId)
    Profiles.removeProfile(store(), serverId, profileId)
    ConfigManager.removeProfileConfig(Profiles.configKey(serverId, profileId))
    ConfigManager.save()
    if(await fs.pathExists(root)){
        const res = await ipcRenderer.invoke(SHELL_OPCODE.TRASH_ITEM, root)
        if(!res.result){
            throw res.error
        }
    }
}
```

- [ ] **Step 2: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/profilemanager.js`
Expected: sem saída.

```bash
git add app/assets/js/profilemanager.js
git commit -m "Add ProfileManager bound to launcher config"
```

### Task 4: Ligar perfis ao launcher (Jogar, Java, mods opcionais)

**Files:**
- Modify: `app/assets/js/scripts/uibinder.js`
- Modify: `app/assets/js/processbuilder.js`
- Modify: `app/assets/js/scripts/landing.js`
- Modify: `app/assets/js/scripts/settings.js`
- Modify: `app/settings.ejs`

- [ ] **Step 1: Globais compartilhados em `uibinder.js`**

Logo depois de `const { DistroAPI } = require('./assets/js/distromanager')`, acrescente:

```js
const ProfileManager = require('./assets/js/profilemanager')
const Modrinth      = require('./assets/js/modrinth')
```

E em `app/assets/js/scripts/settings.js` **apague** a linha `const Modrinth = require('./assets/js/modrinth')` (o global agora vem de `uibinder.js`).

- [ ] **Step 2: Mods opcionais e Java por chave de perfil (`uibinder.js`)**

Substitua a função `syncModConfigurations` inteira por:

```js
/**
 * Sync the optional mod configuration of every profile with the distro index.
 *
 * @param {Object} data The distro index object.
 */
function syncModConfigurations(data){
    ProfileManager.ensureServers(data.servers.map(s => s.rawServer.id))

    const syncedCfgs = []
    for(const serv of data.servers){
        for(const key of ProfileManager.configKeys(serv.rawServer.id)){
            const cfg = ConfigManager.getModConfiguration(key)
            syncedCfgs.push({
                id: key,
                mods: resolveModConfiguration(serv.modules, cfg?.mods ?? null)
            })
        }
    }

    ConfigManager.setModConfigurations(syncedCfgs)
    ConfigManager.save()
}

/**
 * Build the optional mod configuration for a server's modules, keeping the
 * player's previous choices when there are any.
 */
function resolveModConfiguration(mdls, modsOld){
    const mods = {}
    for(const mdl of mdls){
        const type = mdl.rawModule.type
        if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
            const mdlID = mdl.getVersionlessMavenIdentifier()
            if(!mdl.getRequired().value){
                const v = scanOptionalSubModules(mdl.subModules, mdl)
                mods[mdlID] = modsOld?.[mdlID] == null ? v : mergeModConfiguration(modsOld[mdlID], v, false)
            } else if(mdl.subModules.length > 0){
                const v = scanOptionalSubModules(mdl.subModules, mdl)
                if(typeof v === 'object'){
                    mods[mdlID] = modsOld?.[mdlID] == null ? v : mergeModConfiguration(modsOld[mdlID], v, true)
                }
            }
        }
    }
    return mods
}
```

Substitua a função `ensureJavaSettings` inteira por:

```js
/**
 * Ensure java configurations are present for every profile of every server.
 *
 * @param {Object} data The distro index object.
 */
function ensureJavaSettings(data) {
    ProfileManager.ensureServers(data.servers.map(s => s.rawServer.id))
    for(const serv of data.servers){
        for(const key of ProfileManager.configKeys(serv.rawServer.id)){
            ConfigManager.ensureJavaConfig(key, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
        }
    }
    ConfigManager.save()
}
```

- [ ] **Step 3: ProcessBuilder com perfil (`processbuilder.js`)**

Troque o início do construtor:

```js
    constructor(distroServer, vanillaManifest, modManifest, authUser, launcherVersion){
        this.gameDir = path.join(ConfigManager.getInstanceDirectory(), distroServer.rawServer.id)
```

por:

```js
    /**
     * @param {{gameDir: string, configKey: string} | null} profile Profile to launch.
     * Without it, the server's default folder and settings are used.
     */
    constructor(distroServer, vanillaManifest, modManifest, authUser, launcherVersion, profile = null){
        this.gameDir = profile?.gameDir ?? path.join(ConfigManager.getInstanceDirectory(), distroServer.rawServer.id)
        this.configKey = profile?.configKey ?? distroServer.rawServer.id
```

Depois, no restante do arquivo, faça estas trocas exatas (todas as ocorrências):

| Trocar | Por |
|---|---|
| `ConfigManager.getModConfiguration(this.server.rawServer.id)` | `ConfigManager.getModConfiguration(this.configKey)` |
| `ConfigManager.getJavaExecutable(this.server.rawServer.id)` | `ConfigManager.getJavaExecutable(this.configKey)` |
| `ConfigManager.getMaxRAM(this.server.rawServer.id)` | `ConfigManager.getMaxRAM(this.configKey)` |
| `ConfigManager.getMinRAM(this.server.rawServer.id)` | `ConfigManager.getMinRAM(this.configKey)` |
| `ConfigManager.getJVMOptions(this.server.rawServer.id)` | `ConfigManager.getJVMOptions(this.configKey)` |
| `ConfigManager.getFullscreen()` | `ConfigManager.getProfileFullscreen(this.configKey)` |
| `ConfigManager.getGameWidth()` | `ConfigManager.getProfileGameWidth(this.configKey)` |
| `ConfigManager.getGameHeight()` | `ConfigManager.getProfileGameHeight(this.configKey)` |

Confira: `grep -n "rawServer.id)\|getGameWidth()\|getGameHeight()\|getFullscreen()" app/assets/js/processbuilder.js` não deve mostrar nenhuma chamada a `ConfigManager` com `rawServer.id` nem os três getters sem argumento.

- [ ] **Step 4: Jogar com o perfil (`landing.js`)**

No listener de `launch_button`, troque:

```js
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
```

por:

```js
        const jExe = ConfigManager.getJavaExecutable(ProfileManager.getSelectedConfigKey())
```

Em `asyncSystemScan`, troque o bloco:

```js
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)
```

por:

```js
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ProfileManager.getSelectedConfigKey(), javaExec)
        ConfigManager.save()
```

(O editor de perfil relê o valor sempre que abre.)

Em `downloadJava`, troque:

```js
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
```

por:

```js
    ConfigManager.setJavaExecutable(ProfileManager.getSelectedConfigKey(), newJavaExec)
```

Em `dlAsync`, logo depois de `const serv = distro.getServerById(ConfigManager.getSelectedServer())`, acrescente:

```js
    const profile = ProfileManager.getSelected(serv.rawServer.id)
    const gameDir = ProfileManager.getGameDir(serv.rawServer.id, profile.id)
    const configKey = ProfileManager.configKey(serv.rawServer.id, profile.id)
```

No `new FullRepair(...)`, troque o segundo argumento `ConfigManager.getInstanceDirectory(),` por:

```js
        ProfileManager.getInstanceRoot(profile.id),
```

Troque `await disableBlockedDropins(serv, loggerLaunchSuite)` por:

```js
    await disableBlockedDropins(serv, gameDir, loggerLaunchSuite)
```

E na função `disableBlockedDropins`, troque a assinatura e a primeira linha:

```js
async function disableBlockedDropins(serv, logger) {
    const modsDir = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'mods')
```

por:

```js
async function disableBlockedDropins(serv, gameDir, logger) {
    const modsDir = path.join(gameDir, 'mods')
```

Troque:

```js
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
```

por:

```js
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion(), { gameDir, configKey })
```

- [ ] **Step 5: Configurações usam o perfil selecionado (`settings.js`, `settings.ejs`)**

Em `initSettingsValues` e em `saveSettingsValues`, troque as duas ocorrências de:

```js
            gFnOpts.push(ConfigManager.getSelectedServer())
```
```js
            sFnOpts.push(ConfigManager.getSelectedServer())
```

por, respectivamente:

```js
            gFnOpts.push(ProfileManager.getSelectedConfigKey())
```
```js
            sFnOpts.push(ProfileManager.getSelectedConfigKey())
```

Em `resolveModsForUI`, troque:

```js
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(serv)
```

por:

```js
    const serv = ConfigManager.getSelectedServer()

    const distro = await DistroAPI.getDistribution()
    const servConf = ConfigManager.getModConfiguration(ProfileManager.getSelectedConfigKey())
```

Em `saveModConfiguration`, troque o corpo por:

```js
function saveModConfiguration() {
    const key = ProfileManager.getSelectedConfigKey()
    const modConf = ConfigManager.getModConfiguration(key)
    modConf.mods = _saveModConfiguration(modConf.mods)
    ConfigManager.setModConfiguration(key, modConf)
}
```

Em `resolveDropinModsForUI`, troque:

```js
    CACHE_SETTINGS_MODS_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id, 'mods')
```

por:

```js
    CACHE_SETTINGS_MODS_DIR = path.join(ProfileManager.getSelectedGameDir(serv.rawServer.id), 'mods')
```

Em `resolveShaderpacksForUI`, troque:

```js
    CACHE_SETTINGS_INSTANCE_DIR = path.join(ConfigManager.getInstanceDirectory(), serv.rawServer.id)
```

por:

```js
    CACHE_SETTINGS_INSTANCE_DIR = ProfileManager.getSelectedGameDir(serv.rawServer.id)
```

Em `app/settings.ejs`, na aba Minecraft, troque os três campos de jogo para valerem por perfil:

```html
                    <input type="number" id="settingsGameWidth" min="0" cValue="GameWidth">
```
→
```html
                    <input type="number" id="settingsGameWidth" min="0" cValue="ProfileGameWidth" serverDependent>
```

```html
                    <input type="number" id="settingsGameHeight" min="0" cValue="GameHeight">
```
→
```html
                    <input type="number" id="settingsGameHeight" min="0" cValue="ProfileGameHeight" serverDependent>
```

```html
                        <input type="checkbox" cValue="Fullscreen">
```
→
```html
                        <input type="checkbox" cValue="ProfileFullscreen" serverDependent>
```

- [ ] **Step 6: Lint**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/uibinder.js app/assets/js/processbuilder.js app/assets/js/scripts/landing.js app/assets/js/scripts/settings.js`
Expected: sem saída.

- [ ] **Step 7: Conferir no Electron**

Run: `npm run verify:visual` (harness existente).
Expected: termina sem `QA FAILED` e sem erros `Renderer:` de `ReferenceError`/`TypeError`.

- [ ] **Step 8: Commit**

```bash
git add app/assets/js/scripts/uibinder.js app/assets/js/processbuilder.js app/assets/js/scripts/landing.js app/assets/js/scripts/settings.js app/settings.ejs
git commit -m "Launch and configure the selected profile"
```

### Task 5: Seletor de perfil na tela principal

**Files:**
- Modify: `app/landing.ejs`
- Modify: `app/assets/js/scripts/landing.js`
- Modify: `app/assets/css/forja.css`
- Modify: `app/assets/lang/en_US.toml`

- [ ] **Step 1: Marcação**

Em `app/landing.ejs`, logo depois do `</button>` de `server_selection_button` e antes de `<button id="launch_button">`, acrescente:

```html
                    <label id="profile_selection_wrap" class="profile-selector">
                        <span class="server-selector-label"><%- lang('landing.profileLabel') %></span>
                        <select id="profile_selection" aria-label="<%- lang('landing.profileLabel') %>"></select>
                        <svg class="server-selector-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                    </label>
```

- [ ] **Step 2: Textos**

Em `app/assets/lang/en_US.toml`, na seção `[ejs.landing]`, acrescente:

```toml
profileLabel = "Perfil"
```

E acrescente a seção (antes de `[js.landing.dlAsync]`):

```toml
[js.landing.profile]
new = "+ Novo perfil…"
```

- [ ] **Step 3: Comportamento**

Em `landing.js`, logo antes de `// Real text is set in uibinder.js on distributionIndexDone.`, acrescente:

```js
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
    select.disabled = false
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
```

(`modsOpenEditor` só passa a existir na Task 14; até lá o item "Novo perfil" não aparece.)

No fim de `updateSelectedServer`, depois de `setLaunchEnabled(...)`, acrescente:

```js
    renderProfileSelection()
```

- [ ] **Step 4: Estilo**

Em `app/assets/css/forja.css`, depois da regra `.server-selector-chevron { ... }` (linha que começa com `.server-selector-chevron`), acrescente:

```css
.profile-selector { position: relative; flex: 0 1 220px; min-width: 140px; min-height: 56px; padding: 8px 40px 8px 16px; background: var(--surface-2); border: 1px solid var(--input-border); border-radius: 4px; color: var(--foreground); }
.profile-selector:hover, .profile-selector:focus-within { background: var(--accent); border-color: var(--primary-light); }
#profile_selection { appearance: none; width: 100%; background: transparent; border: 0; color: var(--foreground); font: 500 13px var(--font-sans); padding: 0; cursor: pointer; }
#profile_selection:focus-visible { outline: none; }
.profile-selector:focus-within { outline: 2px solid var(--ring); outline-offset: 3px; }
#profile_selection option { background: var(--surface-2); color: var(--foreground); }
#profile_selection:disabled { cursor: default; color: var(--muted-foreground); }
```

Dentro do bloco `@media (max-width: 900px) {` já existente, acrescente:

```css
    .profile-selector { flex-basis: 160px; }
```

- [ ] **Step 5: Lint, conferir e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/landing.js`
Run: `npm run verify:visual`
Expected: sem erros; a captura `landing.png` em `%TEMP%\oblyvium-launcher-qa\` mostra "Perfil · Padrão" entre o servidor e o Jogar.

```bash
git add app/landing.ejs app/assets/js/scripts/landing.js app/assets/css/forja.css app/assets/lang/en_US.toml
git commit -m "Add profile selector to the landing screen"
```

# Fase 2 — Conteúdo

### Task 6: Modrinth falsa para testes

**Files:**
- Create: `test/helpers/fakeModrinth.js`

Servidor HTTP local com cinco projetos, usado pelos testes unitários e pela verificação no Electron. O nome do arquivo não termina em `.test.js`, então o `node --test` não o executa como teste.

| id | slug | tipo | observação |
|---|---|---|---|
| `AAAAAAAA` | `sodium` | mod | sem dependências |
| `BBBBBBBB` | `iris` | mod | versões 2.0 e 1.0; exige `sodium` |
| `CCCCCCCC` | `mapa` | mod | sem dependências |
| `DDDDDDDD` | `pacote` | resourcepack | |
| `EEEEEEEE` | `sombra` | shader | |
| `FFFFFFFF` | `corrompido` | mod | hash anunciado não bate com o arquivo |

- [ ] **Step 1: Implementar**

Crie `test/helpers/fakeModrinth.js`:

```js
/**
 * Minimal local stand-in for the Modrinth API, for tests only.
 */
const crypto = require('crypto')
const http   = require('http')

function makeFile(name, content){
    const buf = Buffer.from(content)
    return {
        name,
        buf,
        hashes: {
            sha1: crypto.createHash('sha1').update(buf).digest('hex'),
            sha512: crypto.createHash('sha512').update(buf).digest('hex')
        }
    }
}

const FILES = {
    'sodium-1.0.jar': makeFile('sodium-1.0.jar', 'sodium 1.0'),
    'iris-1.0.jar': makeFile('iris-1.0.jar', 'iris 1.0'),
    'iris-2.0.jar': makeFile('iris-2.0.jar', 'iris 2.0'),
    'mapa-1.0.jar': makeFile('mapa-1.0.jar', 'mapa 1.0'),
    'pacote-1.0.zip': makeFile('pacote-1.0.zip', 'pacote 1.0'),
    'sombra-1.0.zip': makeFile('sombra-1.0.zip', 'sombra 1.0'),
    'corrompido-1.0.jar': makeFile('corrompido-1.0.jar', 'conteudo real')
}

function project(id, slug, title, type, extra = {}){
    return {
        id, slug, title, project_type: type,
        description: `${title} de teste`,
        body: `# ${title}\n\nDescrição de **${title}**.`,
        icon_url: null,
        gallery: [],
        categories: [],
        ...extra
    }
}

const PROJECTS = [
    project('AAAAAAAA', 'sodium', 'Sodium', 'mod'),
    project('BBBBBBBB', 'iris', 'Iris', 'mod', {
        body: 'Texto <script>window.__xss = 1</script><img src="x" onerror="window.__xss = 2"> [site](https://example.com) [local](file:///C:/x)',
        gallery: [{ url: 'https://cdn.example.com/a.png', title: 'Tela', ordering: 0 }]
    }),
    project('CCCCCCCC', 'mapa', 'Mapa', 'mod', { categories: ['utility'] }),
    project('DDDDDDDD', 'pacote', 'Pacote', 'resourcepack'),
    project('EEEEEEEE', 'sombra', 'Sombra', 'shader'),
    project('FFFFFFFF', 'corrompido', 'Corrompido', 'mod')
]

exports.start = async function(){
    let base
    const fileRef = name => ({
        url: `${base}/files/${name}`,
        filename: name,
        primary: true,
        hashes: name === 'corrompido-1.0.jar' ? makeFile(name, 'outro conteudo').hashes : FILES[name].hashes
    })
    const version = (id, projectId, number, loaders, file, dependencies = []) => ({
        id, project_id: projectId, version_number: number, version_type: 'release',
        loaders, game_versions: ['1.20.1'], dependencies, files: [fileRef(file)]
    })
    const versions = () => ({
        AAAAAAAA: [version('va1', 'AAAAAAAA', '1.0', ['forge'], 'sodium-1.0.jar')],
        BBBBBBBB: [
            version('vb2', 'BBBBBBBB', '2.0', ['forge'], 'iris-2.0.jar', [{ project_id: 'AAAAAAAA', dependency_type: 'required' }]),
            version('vb1', 'BBBBBBBB', '1.0', ['forge'], 'iris-1.0.jar', [{ project_id: 'AAAAAAAA', dependency_type: 'required' }])
        ],
        CCCCCCCC: [version('vc1', 'CCCCCCCC', '1.0', ['forge'], 'mapa-1.0.jar')],
        DDDDDDDD: [version('vd1', 'DDDDDDDD', '1.0', ['minecraft'], 'pacote-1.0.zip')],
        EEEEEEEE: [version('ve1', 'EEEEEEEE', '1.0', ['iris'], 'sombra-1.0.zip')],
        FFFFFFFF: [version('vf1', 'FFFFFFFF', '1.0', ['forge'], 'corrompido-1.0.jar')]
    })
    const findProject = idOrSlug => PROJECTS.find(p => p.id === idOrSlug || p.slug === idOrSlug)
    const requests = []

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, base)
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
            requests.push({ method: req.method, url, body })
            const send = (status, data, headers = {}) => {
                res.writeHead(status, { 'content-type': 'application/json', ...headers })
                res.end(JSON.stringify(data))
            }
            const p = url.pathname
            let m

            if(p.startsWith('/files/')){
                const file = FILES[decodeURIComponent(p.slice('/files/'.length))]
                if(file == null) return send(404, {})
                res.writeHead(200, { 'content-type': 'application/octet-stream' })
                return res.end(file.buf)
            }
            if(p === '/v2/search'){
                if(url.searchParams.get('query') === 'limite'){
                    return send(429, { error: 'ratelimited' }, { 'retry-after': '0' })
                }
                const facets = JSON.parse(url.searchParams.get('facets'))
                const type = facets[0][0].split(':')[1]
                const hits = PROJECTS.filter(pr => pr.project_type === type).map(pr => ({
                    project_id: pr.id, slug: pr.slug, title: pr.title, description: pr.description,
                    author: 'autor', downloads: 1000, icon_url: pr.icon_url, categories: pr.categories
                }))
                return send(200, { hits, offset: Number(url.searchParams.get('offset') ?? 0), limit: 20, total_hits: hits.length })
            }
            if(p === '/v2/tag/category'){
                return send(200, [
                    { name: 'utility', project_type: 'mod', header: 'categories', icon: '' },
                    { name: 'optimization', project_type: 'mod', header: 'categories', icon: '' },
                    { name: 'decoration', project_type: 'resourcepack', header: 'categories', icon: '' },
                    { name: '64x', project_type: 'resourcepack', header: 'resolutions', icon: '' }
                ])
            }
            if(p === '/v2/projects'){
                const ids = JSON.parse(url.searchParams.get('ids'))
                return send(200, ids.map(findProject).filter(Boolean))
            }
            if((m = p.match(/^\/v2\/project\/([^/]+)\/version$/))){
                const pr = findProject(decodeURIComponent(m[1]))
                return send(200, pr ? versions()[pr.id] : [])
            }
            if((m = p.match(/^\/v2\/project\/([^/]+)$/))){
                const pr = findProject(decodeURIComponent(m[1]))
                return pr ? send(200, pr) : send(404, {})
            }
            if(p === '/v2/version_files' || p === '/v2/version_files/update'){
                const { hashes } = JSON.parse(body)
                const out = {}
                for(const list of Object.values(versions())){
                    for(const v of list){
                        for(const f of v.files){
                            if(hashes.includes(f.hashes.sha1)){
                                out[f.hashes.sha1] = p.endsWith('/update') ? list[0] : v
                            }
                        }
                    }
                }
                return send(200, out)
            }
            send(404, {})
        })
    })

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    return {
        base,
        api: `${base}/v2`,
        files: FILES,
        requests,
        close: () => new Promise(resolve => server.close(resolve))
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add test/helpers/fakeModrinth.js
git commit -m "Add local fake Modrinth API for tests"
```

### Task 7: Modrinth por tipo, categorias, projeto e atualizações

**Files:**
- Modify (reescrever): `app/assets/js/modrinth.js`
- Create: `test/modrinth.test.js`
- Modify: `app/assets/js/scripts/settings.js` (adaptar à nova API)
- Modify: `app/assets/js/scripts/landing.js` (adaptar à nova API)

- [ ] **Step 1: Escrever os testes**

Crie `test/modrinth.test.js`:

```js
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Fake = require('./helpers/fakeModrinth')

const TARGET = { gameVersion: '1.20.1', loader: 'forge' }
let fake
let Modrinth

before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_MODRINTH_API = fake.api
    Modrinth = require('../app/assets/js/modrinth')
})

after(() => fake.close())

const tmpGameDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'jogo-'))

test('search de mods envia versão, loader e client_side, e filtra proibidos e pack', async () => {
    const res = await Modrinth.search({ query: '', type: 'mod', categories: ['utility'] }, TARGET, new Set(['sodium']), new Set(['CCCCCCCC']))
    const titles = res.hits.map(h => h.title)
    assert.ok(!titles.includes('Sodium'))
    assert.ok(!titles.includes('Mapa'))
    assert.ok(titles.includes('Iris'))
    const facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [
        ['project_type:mod'],
        ['versions:1.20.1'],
        ['categories:forge'],
        ['client_side:required', 'client_side:optional'],
        ['categories:utility']
    ])
    assert.equal(fake.requests.at(-1).url.searchParams.get('index'), 'downloads')
})

test('search de shaders e resource packs usa os loaders certos', async () => {
    await Modrinth.search({ type: 'shader', sort: 'newest' }, TARGET, new Set(), new Set())
    let facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [['project_type:shader'], ['versions:1.20.1'], ['categories:iris', 'categories:optifine']])
    assert.equal(fake.requests.at(-1).url.searchParams.get('index'), 'newest')
    await Modrinth.search({ type: 'resourcepack' }, TARGET, new Set(), new Set())
    facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [['project_type:resourcepack'], ['versions:1.20.1']])
})

test('getCategories só traz o cabeçalho "categories" do tipo', async () => {
    assert.deepEqual(await Modrinth.getCategories('mod'), ['optimization', 'utility'])
    assert.deepEqual(await Modrinth.getCategories('resourcepack'), ['decoration'])
})

test('install baixa o projeto e as dependências na pasta do tipo', async () => {
    const dir = await tmpGameDir()
    const written = await Modrinth.install('iris', TARGET, dir, new Set(), new Set(), new Set())
    assert.deepEqual(written, ['sodium-1.0.jar', 'iris-2.0.jar'])
    assert.equal(await fs.readFile(path.join(dir, 'mods', 'iris-2.0.jar'), 'utf8'), 'iris 2.0')
})

test('install de resource pack e shader vai para as pastas certas', async () => {
    const dir = await tmpGameDir()
    await Modrinth.install('pacote', TARGET, dir, new Set(), new Set(), new Set())
    await Modrinth.install('sombra', TARGET, dir, new Set(), new Set(), new Set())
    assert.ok(await fs.pathExists(path.join(dir, 'resourcepacks', 'pacote-1.0.zip')))
    assert.ok(await fs.pathExists(path.join(dir, 'shaderpacks', 'sombra-1.0.zip')))
})

test('dependência proibida bloqueia tudo e não deixa arquivo', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('iris', TARGET, dir, new Set(), new Set(['sodium']), new Set()),
        err => err.code === 'BLOCKED' && err.data.dependency === true && err.data.title === 'Sodium'
    )
    assert.ok(!await fs.pathExists(path.join(dir, 'mods')))
})

test('projeto já instalado e dependência do pack', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('mapa', TARGET, dir, new Set(['CCCCCCCC']), new Set(), new Set()),
        err => err.code === 'ALREADY_INSTALLED'
    )
    const written = await Modrinth.install('iris', TARGET, dir, new Set(), new Set(), new Set(['AAAAAAAA']))
    assert.deepEqual(written, ['iris-2.0.jar'])
})

test('hash diferente não deixa arquivo', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('corrompido', TARGET, dir, new Set(), new Set(), new Set()),
        err => err.code === 'HASH_MISMATCH'
    )
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), [])
})

test('resolveInstall descreve o que será baixado', async () => {
    const plan = await Modrinth.resolveInstall('iris', TARGET, new Set(), new Set(), new Set())
    assert.deepEqual(plan.map(s => [s.project.slug, s.version.version_number, s.type]), [['sodium', '1.0', 'mod'], ['iris', '2.0', 'mod']])
})

test('identifyFiles, checkUpdates e update', async () => {
    const dir = await tmpGameDir()
    const old = path.join(dir, 'mods', 'iris-1.0.jar.disabled')
    await fs.outputFile(old, 'iris 1.0')
    const ids = await Modrinth.identifyFiles([old])
    assert.equal(ids.get(old).project_id, 'BBBBBBBB')
    const updates = await Modrinth.checkUpdates([{ path: old, type: 'mod' }], TARGET)
    assert.equal(updates.get(old).version_number, '2.0')
    const next = await Modrinth.update(old, updates.get(old))
    assert.equal(next, 'iris-2.0.jar.disabled')
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['iris-2.0.jar.disabled'])
})

test('limite da Modrinth vira RATE_LIMITED', async () => {
    await assert.rejects(
        Modrinth.search({ query: 'limite', type: 'mod' }, TARGET, new Set(), new Set()),
        err => err.code === 'RATE_LIMITED'
    )
})

test('getServerTarget e getBlocklist', () => {
    const serv = {
        rawServer: { minecraftVersion: '1.20.1', modrinth: { blocked: ['Sodium', 'AANobbMI'] } },
        modules: [{ rawModule: { type: 'ForgeHosted' } }]
    }
    assert.deepEqual(Modrinth.getServerTarget(serv), { gameVersion: '1.20.1', loader: 'forge' })
    assert.deepEqual([...Modrinth.getBlocklist(serv)], ['sodium', 'aanobbmi'])
    assert.ok(Modrinth.isBlocked(Modrinth.getBlocklist(serv), { id: 'AAAAAAAA', slug: 'sodium' }))
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL nos testes de `modrinth.test.js` (`Modrinth.search` com assinatura antiga, `getCategories is not a function` etc.).

- [ ] **Step 3: Reescrever `app/assets/js/modrinth.js`**

Substitua o arquivo inteiro por:

```js
/**
 * Modrinth integration: search, project pages, installs and updates for
 * mods, resource packs and shaders.
 *
 * The staff blocks projects per server in the distribution index:
 *
 *   "modrinth": { "blocked": ["xaeros-minimap", "AANobbMI"] }
 *
 * Entries may be project slugs or project IDs.
 */
const crypto                = require('crypto')
const fs                    = require('fs-extra')
const got                   = require('got')
const path                  = require('path')
const { Type }              = require('helios-distribution-types')
const { LoggerUtil }        = require('helios-core')
const { version }           = require('../../../package.json')

const logger = LoggerUtil.getLogger('Modrinth')

// The override exists for tests only.
const API = process.env.OBLYVIUM_MODRINTH_API || 'https://api.modrinth.com/v2'
const PAGE_SIZE = 20

// Modrinth asks every client to identify itself.
const USER_AGENT = `OblyviumRP/OblyviumLauncher/${version}`

const http = got.extend({
    prefixUrl: API,
    headers: { 'user-agent': USER_AGENT },
    responseType: 'json',
    timeout: 15000,
    retry: 1
})

/** Content types and the game folder each one is installed into. */
const TYPES = {
    mod: { folder: 'mods' },
    resourcepack: { folder: 'resourcepacks' },
    shader: { folder: 'shaderpacks' }
}
exports.TYPES = TYPES

exports.SORTS = ['relevance', 'downloads', 'newest', 'updated']

class ModrinthError extends Error {
    constructor(code, message, data = {}) {
        super(message)
        this.code = code
        this.data = data
    }
}
exports.ModrinthError = ModrinthError

function wrapError(err) {
    if(err?.response?.statusCode === 429) {
        return new ModrinthError('RATE_LIMITED', 'Modrinth rate limit reached')
    }
    return err
}

async function getJson(url, options) {
    try {
        return await http.get(url, options).json()
    } catch(err) {
        throw wrapError(err)
    }
}

async function postJson(url, json) {
    try {
        return await http.post(url, { json }).json()
    } catch(err) {
        throw wrapError(err)
    }
}

/**
 * Resolve the Minecraft version and mod loader of a server.
 *
 * @param {HeliosServer} serv The distribution server.
 * @returns {{gameVersion: string, loader: string | null}} loader is null for vanilla servers.
 */
exports.getServerTarget = function(serv) {
    for(const mdl of serv.modules) {
        switch(mdl.rawModule.type) {
            case Type.ForgeHosted:
            case Type.Forge:
                return { gameVersion: serv.rawServer.minecraftVersion, loader: 'forge' }
            case Type.Fabric:
                return { gameVersion: serv.rawServer.minecraftVersion, loader: 'fabric' }
        }
    }
    return { gameVersion: serv.rawServer.minecraftVersion, loader: null }
}

/**
 * @param {HeliosServer} serv The distribution server.
 * @returns {Set<string>} Blocked slugs and project IDs, lower-cased.
 */
exports.getBlocklist = function(serv) {
    const blocked = serv.rawServer.modrinth?.blocked
    return new Set(Array.isArray(blocked) ? blocked.map(b => String(b).toLowerCase()) : [])
}

/**
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {{id?: string, project_id?: string, slug?: string}} project A project or search hit.
 */
exports.isBlocked = function(blocklist, project) {
    return blocklist.has((project.project_id ?? project.id)?.toLowerCase())
        || blocklist.has(project.slug?.toLowerCase())
}

// Loaders a content type accepts on this server.
function loadersFor(type, target) {
    switch(type) {
        case 'mod': return [target.loader]
        case 'shader': return ['iris', 'optifine']
        default: return ['minecraft']
    }
}

function sha1(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1')
        fs.createReadStream(file)
            .on('error', reject)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')))
    })
}

/**
 * Identify local files on Modrinth by hash.
 *
 * @param {string[]} files Absolute paths of existing files.
 * @returns {Promise<Map<string, Object>>} file path -> Modrinth version, for recognised files only.
 */
exports.identifyFiles = async function(files) {
    const byHash = new Map()
    for(const file of files) {
        byHash.set(await sha1(file), file)
    }
    const result = new Map()
    if(byHash.size === 0) {
        return result
    }
    const versions = await postJson('version_files', { hashes: [...byHash.keys()], algorithm: 'sha1' })
    for(const [hash, ver] of Object.entries(versions)) {
        result.set(byHash.get(hash), ver)
    }
    return result
}

const packProjectsCache = new Map()

/**
 * Modrinth project IDs of the mods already shipped by the server's modpack.
 * Installing these again would load the same mod twice.
 *
 * @param {HeliosServer} serv The distribution server.
 * @returns {Promise<Set<string>>}
 */
exports.getModpackProjects = async function(serv) {
    const key = `${serv.rawServer.id}@${serv.rawServer.version}`
    if(!packProjectsCache.has(key)) {
        const files = []
        const walk = mdls => {
            for(const mdl of mdls) {
                if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.FabricMod) {
                    if(fs.existsSync(mdl.getPath())) {
                        files.push(mdl.getPath())
                    }
                }
                walk(mdl.subModules)
            }
        }
        walk(serv.modules)
        const promise = exports.identifyFiles(files)
            .then(ids => new Set([...ids.values()].map(v => v.project_id)))
            .catch(err => {
                packProjectsCache.delete(key)
                throw err
            })
        packProjectsCache.set(key, promise)
    }
    return packProjectsCache.get(key)
}

let categoriesPromise = null

/**
 * @param {string} type One of TYPES.
 * @returns {Promise<string[]>} Category names for the type, sorted.
 */
exports.getCategories = async function(type) {
    if(categoriesPromise == null) {
        categoriesPromise = getJson('tag/category').catch(err => {
            categoriesPromise = null
            throw err
        })
    }
    const all = await categoriesPromise
    return all.filter(c => c.project_type === type && c.header === 'categories').map(c => c.name).sort()
}

/**
 * Search content compatible with the server.
 *
 * @param {{query?: string, type?: string, categories?: string[], sort?: string, offset?: number}} options
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<{hits: Object[], total: number, offset: number, pageSize: number}>}
 */
exports.search = async function({ query = '', type = 'mod', categories = [], sort = 'relevance', offset = 0 }, target, blocklist, packProjects) {
    const facets = [[`project_type:${type}`], [`versions:${target.gameVersion}`]]
    if(type !== 'resourcepack') {
        facets.push(loadersFor(type, target).map(l => `categories:${l}`))
    }
    if(type === 'mod') {
        facets.push(['client_side:required', 'client_side:optional'])
    }
    for(const category of categories) {
        facets.push([`categories:${category}`])
    }
    const index = sort === 'relevance' && !query ? 'downloads' : sort
    const res = await getJson('search', {
        searchParams: { query, facets: JSON.stringify(facets), index, limit: PAGE_SIZE, offset }
    })
    return {
        hits: res.hits.filter(hit => !exports.isBlocked(blocklist, hit) && !packProjects.has(hit.project_id)),
        total: res.total_hits,
        offset: res.offset,
        pageSize: PAGE_SIZE
    }
}

exports.getProject = function(idOrSlug) {
    return getJson(`project/${encodeURIComponent(idOrSlug)}`)
}

exports.getProjects = async function(ids) {
    if(ids.length === 0) {
        return []
    }
    return getJson('projects', { searchParams: { ids: JSON.stringify(ids) } })
}

exports.getCompatibleVersion = async function(projectId, type, target) {
    const versions = await getJson(`project/${encodeURIComponent(projectId)}/version`, {
        searchParams: {
            loaders: JSON.stringify(loadersFor(type, target)),
            game_versions: JSON.stringify([target.gameVersion])
        }
    })
    return versions.find(v => v.version_type === 'release') ?? versions[0] ?? null
}

function primaryFile(ver) {
    return ver.files.find(f => f.primary) ?? ver.files[0]
}

async function downloadVerified(file, dest) {
    const tmp = `${dest}.part`
    const hash = crypto.createHash('sha512')
    await fs.ensureDir(path.dirname(dest))
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp)
        got.stream(file.url, { headers: { 'user-agent': USER_AGENT }, timeout: 60000 })
            .on('data', chunk => hash.update(chunk))
            .on('error', reject)
            .pipe(out)
            .on('error', reject)
            .on('finish', resolve)
    }).catch(async err => {
        await fs.remove(tmp)
        throw err
    })
    if(hash.digest('hex') !== file.hashes.sha512) {
        await fs.remove(tmp)
        throw new ModrinthError('HASH_MISMATCH', `Hash mismatch for ${file.filename}`)
    }
    await fs.move(tmp, dest, { overwrite: true })
}

/**
 * Work out what installing a project downloads, without downloading anything.
 *
 * @param {string} projectId Project ID or slug.
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @param {Set<string>} installedProjects Project IDs already in the profile.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<{project: Object, version: Object, file: Object, type: string}[]>}
 * Dependencies first, the requested project last.
 */
exports.resolveInstall = async function(projectId, target, installedProjects, blocklist, packProjects) {
    const seen = new Set()
    const plan = []

    const resolve = async (idOrSlug, isDependency) => {
        const project = await exports.getProject(idOrSlug)
        if(seen.has(project.id)) {
            return
        }
        seen.add(project.id)

        if(exports.isBlocked(blocklist, project)) {
            throw new ModrinthError('BLOCKED', `${project.title} is blocked`, { title: project.title, dependency: isDependency })
        }
        if(packProjects.has(project.id) || installedProjects.has(project.id)) {
            if(isDependency) {
                return
            }
            throw new ModrinthError('ALREADY_INSTALLED', `${project.title} is already installed`, { title: project.title })
        }

        const type = TYPES[project.project_type] != null ? project.project_type : 'mod'
        const ver = await exports.getCompatibleVersion(project.id, type, target)
        if(ver == null) {
            throw new ModrinthError('NO_COMPATIBLE_VERSION', `${project.title} has no compatible version`, { title: project.title })
        }

        for(const dep of ver.dependencies) {
            if(dep.dependency_type === 'required' && dep.project_id != null) {
                await resolve(dep.project_id, true)
            }
        }

        plan.push({ project, version: ver, file: primaryFile(ver), type })
    }

    await resolve(projectId, false)
    return plan
}

/**
 * Install a project and its required dependencies into a game folder.
 * Everything is resolved first, so a blocked dependency leaves nothing behind.
 *
 * @returns {Promise<string[]>} File names written, dependencies first.
 */
exports.install = async function(projectId, target, gameDir, installedProjects, blocklist, packProjects) {
    const plan = await exports.resolveInstall(projectId, target, installedProjects, blocklist, packProjects)
    const written = []
    for(const { project, version: ver, file, type } of plan) {
        await downloadVerified(file, path.join(gameDir, TYPES[type].folder, path.basename(file.filename)))
        written.push(file.filename)
        logger.info(`Installed ${project.slug} ${ver.version_number} (${file.filename}).`)
    }
    return written
}

/**
 * Find newer compatible versions of installed files.
 *
 * @param {{path: string, type: string}[]} files
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @returns {Promise<Map<string, Object>>} file path -> newer version, only for files that have one.
 */
exports.checkUpdates = async function(files, target) {
    const result = new Map()
    for(const type of Object.keys(TYPES)) {
        const ofType = files.filter(f => f.type === type)
        if(ofType.length === 0) {
            continue
        }
        const byHash = new Map()
        for(const f of ofType) {
            byHash.set(await sha1(f.path), f.path)
        }
        const latest = await postJson('version_files/update', {
            hashes: [...byHash.keys()],
            algorithm: 'sha1',
            loaders: loadersFor(type, target),
            game_versions: [target.gameVersion]
        })
        for(const [hash, ver] of Object.entries(latest)) {
            if(!ver.files.some(f => f.hashes.sha1 === hash)) {
                result.set(byHash.get(hash), ver)
            }
        }
    }
    return result
}

/**
 * Replace a file with a newer version, keeping a ".disabled" suffix.
 *
 * @returns {Promise<string>} The new file name.
 */
exports.update = async function(filePath, newVersion) {
    const file = primaryFile(newVersion)
    const suffix = filePath.endsWith('.disabled') ? '.disabled' : ''
    const dest = path.join(path.dirname(filePath), path.basename(file.filename) + suffix)
    await downloadVerified(file, dest)
    if(path.resolve(dest) !== path.resolve(filePath)) {
        await fs.remove(filePath)
    }
    logger.info(`Updated ${path.basename(filePath)} to ${path.basename(dest)}.`)
    return path.basename(dest)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS em todos os testes de `profiles` e `modrinth`.

- [ ] **Step 5: Adaptar a busca que já existe nas configurações (`settings.js`)**

A seção "Modrinth" atual (funções `searchModrinth`, `renderModrinthHit`, `prepareModrinthBrowser`) sai na Task 15; até lá ela precisa funcionar com a API nova.

Em `searchModrinth`, troque:

```js
        const res = await Modrinth.search(modrinthState.query, modrinthState.target, modrinthState.blocklist, packProjects, modrinthState.offset)
```

por:

```js
        const res = await Modrinth.search({ query: modrinthState.query, type: 'mod', offset: modrinthState.offset }, modrinthState.target, modrinthState.blocklist, packProjects)
```

Em `renderModrinthHit`, troque:

```js
            await Modrinth.install(hit.project_id, modrinthState.target, CACHE_SETTINGS_MODS_DIR, modrinthState.blocklist, packProjects)
```

por:

```js
            await Modrinth.install(hit.project_id, modrinthState.target, path.dirname(CACHE_SETTINGS_MODS_DIR), new Set(), modrinthState.blocklist, packProjects)
```

Em `prepareModrinthBrowser`, troque:

```js
    if (modrinthState.target == null) {
```

por:

```js
    if (modrinthState.target.loader == null) {
```

- [ ] **Step 6: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/modrinth.js app/assets/js/scripts/settings.js test/`
Expected: sem saída.

```bash
git add app/assets/js/modrinth.js test/modrinth.test.js app/assets/js/scripts/settings.js
git commit -m "Extend Modrinth module to resource packs, shaders, categories and updates"
```

(`landing.js` ainda chama `Modrinth.findBlockedDropins`; ele é trocado na Task 8, que vem logo em seguida. Não rode o launcher entre a Task 7 e a Task 8.)

### Task 8: Arquivos de conteúdo do perfil

**Files:**
- Create: `app/assets/js/contentmanager.js`
- Create: `test/contentmanager.test.js`
- Modify: `app/assets/js/scripts/uibinder.js`
- Modify: `app/assets/js/scripts/landing.js`
- Modify: `app/assets/lang/en_US.toml`

- [ ] **Step 1: Escrever os testes**

Crie `test/contentmanager.test.js`:

```js
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Fake = require('./helpers/fakeModrinth')

let fake
let Content

before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_MODRINTH_API = fake.api
    Content = require('../app/assets/js/contentmanager')
})

after(() => fake.close())

async function gameDir(files = {}){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jogo-'))
    for(const [rel, content] of Object.entries(files)){
        await fs.outputFile(path.join(dir, rel), content)
    }
    return dir
}

test('listFiles de mods respeita .disabled e ignora outros arquivos', async () => {
    const dir = await gameDir({ 'mods/a.jar': 'a', 'mods/b.jar.disabled': 'b', 'mods/leia.txt': 'x' })
    const files = await Content.listFiles(dir, 'mod')
    assert.deepEqual(files.map(f => [f.fileName, f.enabled]), [['a.jar', true], ['b.jar.disabled', false]])
})

test('ligar e desligar mod renomeia o arquivo', async () => {
    const dir = await gameDir({ 'mods/a.jar': 'a' })
    assert.equal(await Content.setEnabled(dir, 'mod', 'a.jar', false), 'a.jar.disabled')
    assert.equal(await Content.setEnabled(dir, 'mod', 'a.jar.disabled', true), 'a.jar')
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['a.jar'])
})

test('resource packs ativos ficam no options.txt sem perder o resto', async () => {
    const dir = await gameDir({
        'resourcepacks/x.zip': 'x',
        'resourcepacks/y.zip': 'y',
        'options.txt': 'version:3465\nresourcePacks:["vanilla","fabric"]\nfov:0.0\n'
    })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    await Content.setEnabled(dir, 'resourcepack', 'y.zip', true)
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', false)
    const options = await fs.readFile(path.join(dir, 'options.txt'), 'utf8')
    assert.equal(options, 'version:3465\nresourcePacks:["vanilla","fabric","file/y.zip"]\nfov:0.0\n')
    const files = await Content.listFiles(dir, 'resourcepack')
    assert.deepEqual(files.map(f => [f.fileName, f.enabled]), [['x.zip', false], ['y.zip', true]])
})

test('resource pack sem options.txt cria a linha', async () => {
    const dir = await gameDir({ 'resourcepacks/x.zip': 'x' })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    assert.equal(await fs.readFile(path.join(dir, 'options.txt'), 'utf8'), 'resourcePacks:["vanilla","file/x.zip"]\n')
})

test('só um shader fica ativo, gravado para OptiFine, Oculus e Iris', async () => {
    const dir = await gameDir({ 'shaderpacks/s1.zip': '1', 'shaderpacks/s2.zip': '2', 'config/oculus.properties': 'maxShadowRenderDistance=32\n' })
    await Content.setEnabled(dir, 'shader', 's1.zip', true)
    await Content.setEnabled(dir, 'shader', 's2.zip', true)
    assert.equal(await Content.getActiveShader(dir), 's2.zip')
    assert.equal(await fs.readFile(path.join(dir, 'optionsshaders.txt'), 'utf8'), 'shaderPack=s2.zip\n')
    assert.equal(await fs.readFile(path.join(dir, 'config', 'oculus.properties'), 'utf8'), 'maxShadowRenderDistance=32\nshaderPack=s2.zip\nenableShaders=true\n')
    assert.ok(await fs.pathExists(path.join(dir, 'config', 'iris.properties')))
    await Content.setEnabled(dir, 'shader', 's2.zip', false)
    assert.equal(await Content.getActiveShader(dir), null)
})

test('remove tira o arquivo e a ativação', async () => {
    const dir = await gameDir({ 'resourcepacks/x.zip': 'x', 'shaderpacks/s.zip': 's' })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    await Content.setEnabled(dir, 'shader', 's.zip', true)
    await Content.remove(dir, 'resourcepack', 'x.zip')
    await Content.remove(dir, 'shader', 's.zip')
    assert.deepEqual(await Content.getEnabledResourcePacks(dir), [])
    assert.equal(await Content.getActiveShader(dir), null)
    assert.deepEqual(await fs.readdir(path.join(dir, 'resourcepacks')), [])
})

test('describe junta dados da Modrinth e funciona com arquivo desconhecido', async () => {
    const dir = await gameDir({ 'mods/iris-1.0.jar': 'iris 1.0', 'mods/caseiro.jar': 'feito em casa' })
    const files = await Content.describe(dir, 'mod')
    const iris = files.find(f => f.fileName === 'iris-1.0.jar')
    assert.equal(iris.project.title, 'Iris')
    assert.equal(iris.version.number, '1.0')
    assert.equal(files.find(f => f.fileName === 'caseiro.jar').project, undefined)
})

test('updateFile mantém o resource pack ativo com o nome novo', async () => {
    const dir = await gameDir({ 'resourcepacks/pacote-0.9.zip': 'antigo' })
    await Content.setEnabled(dir, 'resourcepack', 'pacote-0.9.zip', true)
    const fakeVersion = { files: [{ url: `${fake.base}/files/pacote-1.0.zip`, filename: 'pacote-1.0.zip', primary: true, hashes: fake.files['pacote-1.0.zip'].hashes }] }
    const next = await Content.updateFile(dir, 'resourcepack', 'pacote-0.9.zip', fakeVersion)
    assert.equal(next, 'pacote-1.0.zip')
    assert.deepEqual(await Content.getEnabledResourcePacks(dir), ['pacote-1.0.zip'])
})

test('installedProjects e findBlocked olham todos os tipos', async () => {
    const dir = await gameDir({
        'mods/sodium-1.0.jar': 'sodium 1.0',
        'mods/mapa-1.0.jar.disabled': 'mapa 1.0',
        'resourcepacks/pacote-1.0.zip': 'pacote 1.0'
    })
    await Content.setEnabled(dir, 'resourcepack', 'pacote-1.0.zip', true)
    assert.deepEqual([...await Content.installedProjects(dir)].sort(), ['AAAAAAAA', 'CCCCCCCC', 'DDDDDDDD'])
    const blocked = await Content.findBlocked(dir, new Set(['sodium', 'mapa', 'pacote']))
    assert.deepEqual(blocked.map(b => [b.type, b.fileName, b.title]).sort(), [
        ['mod', 'sodium-1.0.jar', 'Sodium'],
        ['resourcepack', 'pacote-1.0.zip', 'Pacote']
    ])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL com `Cannot find module '../app/assets/js/contentmanager'`.

- [ ] **Step 3: Implementar**

Crie `app/assets/js/contentmanager.js`:

```js
/**
 * Files a profile adds on top of the modpack: mods, resource packs and shaders.
 *
 * - Mods are disabled by renaming them to "<name>.disabled".
 * - Resource packs are enabled through the "resourcePacks" line of options.txt.
 * - One shader is active at a time; the choice is written for OptiFine,
 *   Oculus and Iris so it works with whichever loader the pack ships.
 */
const fs                = require('fs-extra')
const path              = require('path')
const { LoggerUtil }    = require('helios-core')
const Modrinth          = require('./modrinth')

const logger = LoggerUtil.getLogger('ContentManager')

const DISABLED_EXT = '.disabled'
const PATTERNS = {
    mod: /\.jar$/i,
    resourcepack: /\.zip$/i,
    shader: /\.zip$/i
}
const OPTIONS_FILE = 'options.txt'
const PACKS_KEY = 'resourcePacks:'
const SHADER_CONFIGS = [
    { file: 'optionsshaders.txt', enabledKey: null, off: 'OFF' },
    { file: path.join('config', 'oculus.properties'), enabledKey: 'enableShaders', off: '' },
    { file: path.join('config', 'iris.properties'), enabledKey: 'enableShaders', off: '' }
]

exports.TYPES = Object.keys(PATTERNS)

exports.folder = function(gameDir, type) {
    return path.join(gameDir, Modrinth.TYPES[type].folder)
}

async function readLines(file) {
    if(!await fs.pathExists(file)) {
        return []
    }
    const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/)
    if(lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

async function writeLines(file, lines) {
    await fs.ensureDir(path.dirname(file))
    await fs.writeFile(file, lines.join('\n') + '\n')
}

function getProp(lines, key) {
    const line = lines.find(l => l.startsWith(key + '='))
    return line == null ? null : line.slice(key.length + 1)
}

function setProp(lines, key, value) {
    const index = lines.findIndex(l => l.startsWith(key + '='))
    if(index === -1) {
        lines.push(`${key}=${value}`)
    } else {
        lines[index] = `${key}=${value}`
    }
}

function readPacksLine(lines) {
    const index = lines.findIndex(l => l.startsWith(PACKS_KEY))
    if(index === -1) {
        return { index, packs: ['vanilla'] }
    }
    try {
        return { index, packs: JSON.parse(lines[index].slice(PACKS_KEY.length)) }
    } catch {
        return { index, packs: ['vanilla'] }
    }
}

/**
 * @returns {Promise<string[]>} File names of the enabled resource packs, in load order.
 */
exports.getEnabledResourcePacks = async function(gameDir) {
    const { packs } = readPacksLine(await readLines(path.join(gameDir, OPTIONS_FILE)))
    return packs.filter(p => p.startsWith('file/')).map(p => p.slice('file/'.length))
}

async function setEnabledResourcePacks(gameDir, names) {
    const file = path.join(gameDir, OPTIONS_FILE)
    const lines = await readLines(file)
    const { index, packs } = readPacksLine(lines)
    const builtIn = packs.filter(p => !p.startsWith('file/'))
    const line = PACKS_KEY + JSON.stringify([...builtIn, ...names.map(n => `file/${n}`)])
    if(index === -1) {
        lines.push(line)
    } else {
        lines[index] = line
    }
    await writeLines(file, lines)
}

/**
 * @returns {Promise<string | null>} File name of the active shader pack.
 */
exports.getActiveShader = async function(gameDir) {
    for(const cfg of SHADER_CONFIGS) {
        const lines = await readLines(path.join(gameDir, cfg.file))
        const value = getProp(lines, 'shaderPack')
        const enabled = cfg.enabledKey == null || getProp(lines, cfg.enabledKey) !== 'false'
        if(value != null && value !== '' && value !== cfg.off && value !== '(internal)' && enabled) {
            return value
        }
    }
    return null
}

/**
 * @param {string | null} name Shader pack file name, or null to turn shaders off.
 */
exports.setActiveShader = async function(gameDir, name) {
    for(const cfg of SHADER_CONFIGS) {
        const file = path.join(gameDir, cfg.file)
        const lines = await readLines(file)
        setProp(lines, 'shaderPack', name ?? cfg.off)
        if(cfg.enabledKey != null) {
            setProp(lines, cfg.enabledKey, String(name != null))
        }
        await writeLines(file, lines)
    }
}

/**
 * @returns {Promise<{fileName: string, path: string, type: string, enabled: boolean}[]>}
 */
exports.listFiles = async function(gameDir, type) {
    const dir = exports.folder(gameDir, type)
    if(!await fs.pathExists(dir)) {
        return []
    }
    const enabledPacks = type === 'resourcepack' ? new Set(await exports.getEnabledResourcePacks(gameDir)) : null
    const activeShader = type === 'shader' ? await exports.getActiveShader(gameDir) : null
    const files = []
    for(const fileName of (await fs.readdir(dir)).sort((a, b) => a.localeCompare(b))) {
        const base = type === 'mod' && fileName.endsWith(DISABLED_EXT) ? fileName.slice(0, -DISABLED_EXT.length) : fileName
        const full = path.join(dir, fileName)
        if(!PATTERNS[type].test(base) || !(await fs.stat(full)).isFile()) {
            continue
        }
        let enabled
        if(type === 'mod') {
            enabled = !fileName.endsWith(DISABLED_EXT)
        } else if(type === 'resourcepack') {
            enabled = enabledPacks.has(fileName)
        } else {
            enabled = activeShader === fileName
        }
        files.push({ fileName, path: full, type, enabled })
    }
    return files
}

/**
 * @returns {Promise<string>} The file name after the change (mods are renamed).
 */
exports.setEnabled = async function(gameDir, type, fileName, enabled) {
    if(type === 'mod') {
        const isEnabled = !fileName.endsWith(DISABLED_EXT)
        if(isEnabled === enabled) {
            return fileName
        }
        const next = enabled ? fileName.slice(0, -DISABLED_EXT.length) : fileName + DISABLED_EXT
        const dir = exports.folder(gameDir, type)
        await fs.rename(path.join(dir, fileName), path.join(dir, next))
        return next
    }
    if(type === 'resourcepack') {
        const others = (await exports.getEnabledResourcePacks(gameDir)).filter(n => n !== fileName)
        await setEnabledResourcePacks(gameDir, enabled ? [...others, fileName] : others)
        return fileName
    }
    await exports.setActiveShader(gameDir, enabled ? fileName : null)
    return fileName
}

exports.remove = async function(gameDir, type, fileName) {
    if(type === 'resourcepack') {
        await exports.setEnabled(gameDir, type, fileName, false)
    }
    if(type === 'shader' && await exports.getActiveShader(gameDir) === fileName) {
        await exports.setActiveShader(gameDir, null)
    }
    await fs.remove(path.join(exports.folder(gameDir, type), fileName))
}

/**
 * listFiles plus Modrinth data for recognised files. Works offline: without
 * Modrinth the files come back without "project" and "version".
 */
exports.describe = async function(gameDir, type) {
    const files = await exports.listFiles(gameDir, type)
    if(files.length === 0) {
        return files
    }
    try {
        const versions = await Modrinth.identifyFiles(files.map(f => f.path))
        const projects = await Modrinth.getProjects([...new Set([...versions.values()].map(v => v.project_id))])
        const byId = new Map(projects.map(p => [p.id, p]))
        return files.map(f => {
            const ver = versions.get(f.path)
            const project = ver != null ? byId.get(ver.project_id) : null
            if(project == null) {
                return f
            }
            return {
                ...f,
                project: { id: project.id, slug: project.slug, title: project.title, iconUrl: project.icon_url },
                version: { id: ver.id, number: ver.version_number }
            }
        })
    } catch(err) {
        logger.warn('Could not describe content with Modrinth.', err)
        return files
    }
}

/**
 * Update one file, keeping it enabled or active.
 *
 * @returns {Promise<string>} The new file name.
 */
exports.updateFile = async function(gameDir, type, fileName, newVersion) {
    const enabledPacks = type === 'resourcepack' ? await exports.getEnabledResourcePacks(gameDir) : []
    const wasActiveShader = type === 'shader' && await exports.getActiveShader(gameDir) === fileName
    const next = await Modrinth.update(path.join(exports.folder(gameDir, type), fileName), newVersion)
    if(enabledPacks.includes(fileName)) {
        await setEnabledResourcePacks(gameDir, enabledPacks.map(n => n === fileName ? next : n))
    }
    if(wasActiveShader) {
        await exports.setActiveShader(gameDir, next)
    }
    return next
}

async function listAll(gameDir) {
    return (await Promise.all(exports.TYPES.map(t => exports.listFiles(gameDir, t)))).flat()
}

/**
 * @returns {Promise<Set<string>>} Modrinth project IDs of everything in the profile, enabled or not.
 */
exports.installedProjects = async function(gameDir) {
    const versions = await Modrinth.identifyFiles((await listAll(gameDir)).map(f => f.path))
    return new Set([...versions.values()].map(v => v.project_id))
}

/**
 * Enabled files whose Modrinth project the staff has blocked. Files Modrinth
 * does not recognise cannot be checked and are left alone.
 *
 * @returns {Promise<{fileName: string, type: string, title: string}[]>}
 */
exports.findBlocked = async function(gameDir, blocklist) {
    if(blocklist.size === 0) {
        return []
    }
    const files = (await listAll(gameDir)).filter(f => f.enabled)
    if(files.length === 0) {
        return []
    }
    const versions = await Modrinth.identifyFiles(files.map(f => f.path))
    if(versions.size === 0) {
        return []
    }
    const projects = await Modrinth.getProjects([...new Set([...versions.values()].map(v => v.project_id))])
    const byId = new Map(projects.map(p => [p.id, p]))
    const found = []
    for(const f of files) {
        const ver = versions.get(f.path)
        const project = ver != null ? byId.get(ver.project_id) : null
        if(project != null && Modrinth.isBlocked(blocklist, project)) {
            found.push({ fileName: f.fileName, type: f.type, title: project.title })
        }
    }
    return found
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS em todos os testes.

- [ ] **Step 5: Global compartilhado**

Em `uibinder.js`, logo depois de `const Modrinth      = require('./assets/js/modrinth')`, acrescente:

```js
const ContentManager = require('./assets/js/contentmanager')
```

- [ ] **Step 6: Checagem de proibidos antes de abrir o jogo (`landing.js`)**

Substitua a função `disableBlockedDropins` inteira por:

```js
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
    for (const item of blocked) {
        await ContentManager.setEnabled(gameDir, item.type, item.fileName, false)
        logger.warn(`Disabled blocked ${item.type} ${item.fileName} (${item.title}).`)
    }
    setOverlayContent(
        Lang.queryJS('landing.dlAsync.blockedModsTitle'),
        Lang.queryJS('landing.dlAsync.blockedModsMessage', { mods: blocked.map(m => escapeHtml(m.title)).join(', ') }),
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
}
```

E troque a chamada `await disableBlockedDropins(serv, gameDir, loggerLaunchSuite)` por:

```js
    await disableBlockedContent(serv, gameDir, loggerLaunchSuite)
```

- [ ] **Step 7: Texto do aviso**

Em `en_US.toml`, na seção `[js.landing.dlAsync]`, troque:

```toml
blockedModsTitle = "Mods Proibidos Desativados"
blockedModsMessage = "A staff proíbe estes mods, então eles foram desativados: <strong>{mods}</strong>.<br><br>O jogo vai abrir normalmente sem eles."
```

por:

```toml
blockedModsTitle = "Conteúdo Proibido Desativado"
blockedModsMessage = "A staff proíbe estes itens, então eles foram desativados: <strong>{mods}</strong>.<br><br>O jogo vai abrir normalmente sem eles."
```

- [ ] **Step 8: Lint, conferir e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/contentmanager.js app/assets/js/scripts/uibinder.js app/assets/js/scripts/landing.js test/`
Run: `npm test`
Run: `npm run verify:visual`
Expected: lint sem saída, testes PASS, verificação visual sem `QA FAILED`.

```bash
git add app/assets/js/contentmanager.js test/contentmanager.test.js app/assets/js/scripts/uibinder.js app/assets/js/scripts/landing.js app/assets/lang/en_US.toml
git commit -m "Manage profile content per type and check all of it against the blocklist"
```

# Fase 3 — Tela de mods

### Task 9: Descrição segura e ícones de perfil

**Files:**
- Modify: `package.json`, `package-lock.json` (dependências)
- Create: `app/assets/js/richtext.js`
- Create: `app/assets/js/profileicons.js`

`richtext.js` depende do DOM do renderer (DOMPurify precisa de `window`), então é verificado no Electron (Task 17), não no `node --test`.

- [ ] **Step 1: Dependências**

Run: `npm install marked@^15 dompurify@^3`
Expected: as duas entram em `dependencies`. Use `marked` 15: as versões 16+ só existem como módulo ES e o launcher carrega tudo com `require`.

Confira: `node -e "console.log(typeof require('marked').marked.parse)"` imprime `function`.

- [ ] **Step 2: `richtext.js`**

Crie `app/assets/js/richtext.js`:

```js
/**
 * Turn Modrinth project descriptions (Markdown that may contain HTML) into
 * safe HTML. The launcher renderer has Node access, so nothing executable
 * may survive: no scripts, frames, styles, event handlers or non-https URLs.
 * Renderer only (DOMPurify needs window).
 */
const { marked }    = require('marked')
const DOMPurify     = require('dompurify')

const ALLOWED_TAGS = [
    'a', 'b', 'blockquote', 'br', 'center', 'code', 'del', 'details', 'div', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
    's', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th',
    'thead', 'tr', 'u', 'ul'
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'width', 'height', 'align']

DOMPurify.addHook('afterSanitizeAttributes', node => {
    if(node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy')
    }
    if(node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer')
    }
})

/**
 * @param {string} markdown Project body from Modrinth.
 * @returns {string} Sanitised HTML, safe for innerHTML.
 */
exports.render = function(markdown) {
    const html = marked.parse(String(markdown ?? ''), { gfm: true, async: false })
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOWED_URI_REGEXP: /^https:\/\//i
    })
}
```

Os links que sobram são `https` e abrem no navegador pelo handler global de `uicore.js` (`$(document).on('click', 'a[href^="http"]', ...)`).

- [ ] **Step 3: `profileicons.js`**

Crie `app/assets/js/profileicons.js`:

```js
/**
 * Line icons for profiles, drawn on a 24x24 grid. Renderer only.
 * Names match profiles.js ICONS.
 */
const PATHS = {
    espada: 'M20 4 9 15M6.5 12.5l5 5M4 20l4-4M16 4h4v4',
    escudo: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z',
    machado: 'M5 20 15 10M13 6c2-3 6-3 7-2s1 5-2 7l-5-5z',
    arco: 'M6 3c8 3 12 7 15 15M6 3l15 15M3 21l9-9M3 21h4M3 21v-4',
    picareta: 'M3 9c5-5 13-5 18 0M12 6 6 21',
    livro: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
    pocao: 'M10 3h4M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3M7.5 14h9',
    coroa: 'M3 18h18M4 18 3 7l5 4 4-6 4 6 5-4-1 11'
}

const LABELS = {
    espada: 'Espada',
    escudo: 'Escudo',
    machado: 'Machado',
    arco: 'Arco',
    picareta: 'Picareta',
    livro: 'Livro',
    pocao: 'Poção',
    coroa: 'Coroa'
}

exports.LABELS = LABELS

/**
 * @param {string} name One of profiles.js ICONS.
 * @returns {SVGSVGElement}
 */
exports.svg = function(name) {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.6')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', PATHS[name] ?? PATHS.espada)
    svg.appendChild(path)
    return svg
}
```

- [ ] **Step 4: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/richtext.js app/assets/js/profileicons.js`

```bash
git add package.json package-lock.json app/assets/js/richtext.js app/assets/js/profileicons.js
git commit -m "Add safe Modrinth description rendering and profile icons"
```

### Task 10: Textos da tela de mods

**Files:**
- Modify: `app/assets/lang/en_US.toml`

- [ ] **Step 1: Textos de marcação**

Acrescente a seção (antes de `[ejs.settings]`):

```toml
[ejs.mods]
back = "Voltar ao launcher"
switchProfile = "Trocar perfil"
editProfile = "Editar perfil"
addContent = "+ Adicionar conteúdo"
tabInstalled = "Instalados"
tabExplore = "Explorar"
typeGroup = "Tipo de conteúdo"
typeMod = "Mods"
typeResourcepack = "Resource packs"
typeShader = "Shaders"
filterPlaceholder = "Filtrar instalados"
updateAll = "Atualizar tudo"
openFolder = "Abrir pasta"
packNote = "Gerenciados pela staff. Os opcionais podem ser ligados ou desligados neste perfil."
searchLabel = "Buscar na Modrinth"
sortLabel = "Ordenar"
sortRelevance = "Relevância"
sortDownloads = "Mais baixados"
sortNewest = "Recentes"
sortUpdated = "Atualizados"
searchButton = "Buscar"
categories = "Categorias"
loadMore = "Carregar mais"
backToSearch = "← Voltar à busca"
editGeneral = "Geral"
editGame = "Jogo"
editName = "Nome"
editIcon = "Ícone"
editCopyFrom = "Copiar configurações de"
editDelete = "Excluir perfil"
editDuplicate = "Duplicar"
editCancel = "Cancelar"
editSave = "Salvar"
```

- [ ] **Step 2: Textos de script**

Acrescente (antes de `[js.settings.serverListing]`):

```toml
[js.mods]
summary = "{server} · {loader} {version} · {pack} mods do pack"
retry = "Tentar novamente"

[js.mods.error]
blocked = "{title} é proibido pela staff."
blockedDependency = "Não dá para instalar: ele precisa de {title}, que é proibido pela staff."
alreadyInstalled = "{title} já está instalado neste perfil."
noCompatibleVersion = "{title} não tem versão para este servidor."
hashMismatch = "O arquivo baixado veio diferente do esperado e foi descartado. Tente novamente."
rateLimited = "Muitas buscas seguidas, aguarde alguns segundos."
offline = "Não foi possível falar com a Modrinth."
disk = "Não foi possível ler a pasta do perfil."
generic = "Algo deu errado. Tente novamente."

[js.mods.installed]
loading = "Carregando…"
noMatch = "Nada instalado com esse nome."
update = "Atualizar para {version}"
updating = "Atualizando…"
updateAllFailed = "{count} atualizações falharam. Tente de novo."
enable = "Ativar {title}"
useShader = "Usar {title}"
remove = "Remover"
removeLabel = "Remover {title}"

[js.mods.installed.empty]
mod = "Nenhum mod seu neste perfil. Use Adicionar conteúdo para buscar."
resourcepack = "Nenhum resource pack neste perfil."
shader = "Nenhum shader neste perfil. Shaders precisam do Oculus ou do Iris instalado como mod."

[js.mods.pack]
summary = "Mods do pack ({count}) 🔒"
required = "Obrigatório"

[js.mods.explore]
loading = "Buscando…"
loadingCategories = "Carregando…"
categoriesError = "Não foi possível carregar as categorias."
empty = "Nada compatível encontrado."
by = "por {author}"
downloads = "{count} downloads"
install = "Instalar"
installLabel = "Instalar {title}"
installing = "Instalando…"
installed = "✓ Instalado"
installedStatus = "{title} instalado neste perfil."

[js.mods.explore.placeholder]
mod = "Buscar mods…"
resourcepack = "Buscar resource packs…"
shader = "Buscar shaders…"

[js.mods.project]
loading = "Carregando…"
openSite = "Ver na Modrinth ↗"
version = "Versão que será instalada: {version}"
dependencies = "Instala junto: {list}"

[js.mods.editor]
createTitle = "Novo perfil"
editTitle = "Editar perfil"
nameError = "Use de 1 a 32 caracteres."
noCopy = "Não copiar (começar limpo)"
deleteTitle = "Excluir {name}?"
deleteMessage = "A pasta do perfil, com mundos e mods, vai para a lixeira."
deleteConfirm = "Excluir"
deleteCancel = "Cancelar"
deleteFailed = "Não foi possível excluir o perfil."
saveFailed = "Não foi possível salvar o perfil."
```

- [ ] **Step 3: Conferir que o TOML carrega e commit**

Run: `node -e "require('toml').parse(require('fs').readFileSync('app/assets/lang/en_US.toml','utf8')); console.log('ok')"`
Expected: `ok`.

```bash
git add app/assets/lang/en_US.toml
git commit -m "Add texts for the mods screen"
```

### Task 11: Esqueleto da tela, cabeçalho e navegação

**Files:**
- Create: `app/mods.ejs`
- Create: `app/assets/js/scripts/mods.js`
- Modify: `app/app.ejs`
- Modify: `app/assets/js/scripts/uibinder.js`
- Modify: `app/landing.ejs`
- Modify: `app/assets/js/scripts/landing.js`
- Modify: `app/assets/css/forja.css`

- [ ] **Step 1: Marcação**

Crie `app/mods.ejs`:

```html
<div id="modsContainer" style="display: none;">
    <header class="mods-topbar">
        <button id="modsBackButton" type="button" data-view-focus>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 5-5 5 5 5M6 10h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span><%- lang('mods.back') %></span>
            <kbd>Esc</kbd>
        </button>
    </header>
    <main id="modsMain">
        <section class="mods-profile" aria-labelledby="modsProfileName">
            <div id="modsProfileIcon" class="mods-profile-icon"></div>
            <div class="mods-profile-text">
                <div class="mods-profile-title">
                    <h1 id="modsProfileName"></h1>
                    <label class="mods-profile-switch">
                        <span class="mods-sr"><%- lang('mods.switchProfile') %></span>
                        <select id="modsProfileSelect"></select>
                    </label>
                </div>
                <span id="modsProfileSummary"></span>
            </div>
            <div class="mods-profile-actions">
                <button id="modsAddContent" type="button" class="mods-btn mods-btn-primary"><%- lang('mods.addContent') %></button>
            </div>
        </section>

        <div id="modsBrowse">
            <div class="mods-tabs" role="tablist">
                <button id="modsTabInstalled" role="tab" type="button" aria-controls="modsPanelInstalled" aria-selected="true"><%- lang('mods.tabInstalled') %></button>
                <button id="modsTabExplore" role="tab" type="button" aria-controls="modsPanelExplore" aria-selected="false" tabindex="-1"><%- lang('mods.tabExplore') %></button>
            </div>
            <div class="mods-types" role="group" aria-label="<%- lang('mods.typeGroup') %>">
                <button type="button" data-type="mod" aria-pressed="true"><%- lang('mods.typeMod') %></button>
                <button type="button" data-type="resourcepack" aria-pressed="false"><%- lang('mods.typeResourcepack') %></button>
                <button type="button" data-type="shader" aria-pressed="false"><%- lang('mods.typeShader') %></button>
            </div>

            <section id="modsPanelInstalled" role="tabpanel" aria-labelledby="modsTabInstalled">
                <div class="mods-toolbar">
                    <input id="modsInstalledFilter" type="search" autocomplete="off" spellcheck="false" placeholder="<%- lang('mods.filterPlaceholder') %>" aria-label="<%- lang('mods.filterPlaceholder') %>">
                    <button id="modsUpdateAll" type="button" class="mods-btn" hidden><%- lang('mods.updateAll') %></button>
                    <button id="modsOpenFolder" type="button" class="mods-btn"><%- lang('mods.openFolder') %></button>
                </div>
                <div id="modsInstalledStatus" class="mods-status" role="status" aria-live="polite"></div>
                <div id="modsInstalledList" class="mods-list"></div>
                <details id="modsPackGroup" class="mods-pack">
                    <summary id="modsPackSummary"></summary>
                    <p class="mods-pack-note"><%- lang('mods.packNote') %></p>
                    <div id="modsPackList"></div>
                </details>
            </section>

            <section id="modsPanelExplore" role="tabpanel" aria-labelledby="modsTabExplore" hidden>
                <form id="modsSearchForm" role="search" class="mods-toolbar">
                    <input id="modsSearchQuery" type="search" autocomplete="off" spellcheck="false" aria-label="<%- lang('mods.searchLabel') %>">
                    <label class="mods-sort">
                        <span class="mods-sr"><%- lang('mods.sortLabel') %></span>
                        <select id="modsSearchSort">
                            <option value="relevance"><%- lang('mods.sortRelevance') %></option>
                            <option value="downloads"><%- lang('mods.sortDownloads') %></option>
                            <option value="newest"><%- lang('mods.sortNewest') %></option>
                            <option value="updated"><%- lang('mods.sortUpdated') %></option>
                        </select>
                    </label>
                    <button type="submit" class="mods-btn mods-btn-primary"><%- lang('mods.searchButton') %></button>
                </form>
                <div class="mods-explore">
                    <fieldset class="mods-categories">
                        <legend><%- lang('mods.categories') %></legend>
                        <div id="modsCategoryList"></div>
                    </fieldset>
                    <div class="mods-explore-results">
                        <div id="modsSearchStatus" class="mods-status" role="status" aria-live="polite"></div>
                        <div id="modsSearchResults" class="mods-list"></div>
                        <button id="modsSearchMore" type="button" class="mods-btn mods-more" hidden><%- lang('mods.loadMore') %></button>
                    </div>
                </div>
            </section>

            <section id="modsPanelProject" hidden>
                <button id="modsProjectBack" type="button" class="mods-link-btn"><%- lang('mods.backToSearch') %></button>
                <div id="modsProjectStatus" class="mods-status" role="status" aria-live="polite"></div>
                <article id="modsProject"></article>
            </section>
        </div>
    </main>
    <script src="./assets/js/scripts/mods.js"></script>
</div>
```

- [ ] **Step 2: Incluir a tela**

Em `app/app.ejs`, troque:

```html
        <%- include('settings') %>
```

por:

```html
        <%- include('mods') %>
        <%- include('settings') %>
```

(`mods` vem antes de `settings` de propósito: a Task 14 move campos de jogo para cá, e `settings.js` precisa encontrá-los já no DOM quando carrega.)

Em `uibinder.js`, no objeto `VIEWS`, depois de `settings: '#settingsContainer',` acrescente:

```js
    mods: '#modsContainer',
```

- [ ] **Step 3: `mods.js` — estado, cabeçalho, abas e tipos**

Crie `app/assets/js/scripts/mods.js`:

```js
/**
 * Script for mods.ejs: the profile screen, with installed content, Modrinth
 * search, project pages and the profile editor.
 *
 * Globals from other scripts: ConfigManager, DistroAPI, ProfileManager,
 * Modrinth, ContentManager, Type (uibinder.js); Lang, LoggerUtil, shell
 * (uicore.js); switchView, getCurrentView, VIEWS (uibinder.js);
 * renderProfileSelection (landing.js).
 */
const modsFs        = require('fs-extra')
const RichText      = require('./assets/js/richtext')
const ProfileIcons  = require('./assets/js/profileicons')

const loggerMods = LoggerUtil.getLogger('Mods')

const MODS_NEW_PROFILE = '__novo__'

const MODS_CATEGORY_LABELS = {
    adventure: 'Aventura', atmosphere: 'Atmosfera', audio: 'Áudio', blocks: 'Blocos', bloom: 'Bloom',
    cartoon: 'Cartoon', 'colored-lighting': 'Luz colorida', combat: 'Combate', 'core-shaders': 'Shaders de núcleo',
    cursed: 'Bizarro', decoration: 'Decoração', economy: 'Economia', entities: 'Entidades', environment: 'Ambiente',
    equipment: 'Equipamento', fantasy: 'Fantasia', foliage: 'Folhagem', fonts: 'Fontes', food: 'Comida',
    'game-mechanics': 'Mecânicas', gui: 'Interface', items: 'Itens', library: 'Biblioteca', locale: 'Idioma',
    magic: 'Magia', management: 'Gerenciamento', minigame: 'Minigame', mobs: 'Criaturas', modded: 'Para mods',
    models: 'Modelos', optimization: 'Otimização', 'path-tracing': 'Path tracing', pbr: 'PBR', potato: 'Leve',
    realistic: 'Realista', reflections: 'Reflexos', 'semi-realistic': 'Semi-realista', shadows: 'Sombras',
    simplistic: 'Simples', social: 'Social', storage: 'Armazenamento', technology: 'Tecnologia', themed: 'Temático',
    transportation: 'Transporte', tweaks: 'Ajustes', utility: 'Utilidade', 'vanilla-like': 'Estilo vanilla',
    worldgen: 'Geração de mundo'
}

const modsState = {
    serverId: null,
    profileId: null,
    serv: null,
    target: null,
    blocklist: new Set(),
    packProjects: null,
    installedProjects: null,
    tab: 'installed',
    type: 'mod',
    installed: [],
    updates: new Map(),
    installedRequest: 0,
    search: { query: '', sort: 'relevance', categories: new Set(), offset: 0, request: 0 },
    projectRequest: 0,
    editing: null
}

// Each tab registers { show() } here (Tasks 12 and 13).
const modsPanels = {}

function modsEl(id){
    return document.getElementById(id)
}

function modsText(tag, className, text){
    const el = document.createElement(tag)
    el.className = className
    el.textContent = text
    return el
}

function modsGameDir(){
    return ProfileManager.getGameDir(modsState.serverId, modsState.profileId)
}

function modsConfigKey(){
    return ProfileManager.configKey(modsState.serverId, modsState.profileId)
}

function modsSetStatus(id, text, retry = null){
    const el = modsEl(id)
    el.textContent = text
    if(retry != null){
        const btn = modsText('button', 'mods-btn', Lang.queryJS('mods.retry'))
        btn.type = 'button'
        btn.onclick = retry
        el.appendChild(btn)
    }
}

function modsErrorMessage(err){
    const title = err?.data?.title
    switch(err?.code){
        case 'BLOCKED':
            return err.data.dependency
                ? Lang.queryJS('mods.error.blockedDependency', { title })
                : Lang.queryJS('mods.error.blocked', { title })
        case 'ALREADY_INSTALLED':
            return Lang.queryJS('mods.error.alreadyInstalled', { title })
        case 'NO_COMPATIBLE_VERSION':
            return Lang.queryJS('mods.error.noCompatibleVersion', { title })
        case 'HASH_MISMATCH':
            return Lang.queryJS('mods.error.hashMismatch')
        case 'RATE_LIMITED':
            return Lang.queryJS('mods.error.rateLimited')
        default:
            return Lang.queryJS('mods.error.generic')
    }
}

function modsIcon(url){
    if(url != null && /^https:\/\//i.test(url)){
        const img = document.createElement('img')
        img.className = 'mods-row-icon'
        img.alt = ''
        img.loading = 'lazy'
        img.src = url
        return img
    }
    const empty = document.createElement('div')
    empty.className = 'mods-row-icon mods-row-icon-empty'
    empty.setAttribute('aria-hidden', 'true')
    return empty
}

function modsToggle(checked, label, onChange){
    const wrap = document.createElement('label')
    wrap.className = 'toggleSwitch'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.setAttribute('aria-label', label)
    input.onchange = () => onChange(input.checked)
    const slider = document.createElement('span')
    slider.className = 'toggleSwitchSlider'
    wrap.append(input, slider)
    return wrap
}

function modsCountPackMods(mdls){
    let count = 0
    for(const mdl of mdls){
        const t = mdl.rawModule.type
        if(t === Type.ForgeMod || t === Type.LiteMod || t === Type.LiteLoader || t === Type.FabricMod){
            count++
        }
        count += modsCountPackMods(mdl.subModules)
    }
    return count
}

function modsRenderHeader(){
    const profile = ProfileManager.get(modsState.serverId, modsState.profileId)
    modsEl('modsProfileName').textContent = profile.name
    modsEl('modsProfileIcon').replaceChildren(ProfileIcons.svg(profile.icon))
    const loader = { forge: 'Forge', fabric: 'Fabric' }[modsState.target.loader] ?? 'Vanilla'
    modsEl('modsProfileSummary').textContent = Lang.queryJS('mods.summary', {
        server: modsState.serv.rawServer.name,
        loader,
        version: modsState.target.gameVersion,
        pack: modsCountPackMods(modsState.serv.modules)
    })
    const select = modsEl('modsProfileSelect')
    select.replaceChildren()
    for(const p of ProfileManager.list(modsState.serverId)){
        select.add(new Option(p.name, p.id, false, p.id === modsState.profileId))
    }
    if(typeof modsOpenEditor === 'function'){
        select.add(new Option(Lang.queryJS('landing.profile.new'), MODS_NEW_PROFILE))
    }
    document.querySelector('.mods-types [data-type="mod"]').disabled = modsState.target.loader == null
}

/**
 * @param {'installed' | 'explore' | 'project'} tab
 * @param {boolean} refresh Reload the tab's content.
 */
function modsShowTab(tab, refresh = true){
    modsState.tab = tab
    modsEl('modsPanelInstalled').hidden = tab !== 'installed'
    modsEl('modsPanelExplore').hidden = tab !== 'explore'
    modsEl('modsPanelProject').hidden = tab !== 'project'
    const exploreSide = tab !== 'installed'
    for(const [id, on] of [['modsTabInstalled', !exploreSide], ['modsTabExplore', exploreSide]]){
        modsEl(id).setAttribute('aria-selected', String(on))
        modsEl(id).tabIndex = on ? 0 : -1
    }
    if(refresh){
        modsPanels[tab]?.show()
    }
}

function modsSetType(type, refresh = true){
    modsState.type = type
    modsState.search.categories.clear()
    for(const btn of document.querySelectorAll('.mods-types [data-type]')){
        btn.setAttribute('aria-pressed', String(btn.dataset.type === type))
    }
    if(refresh){
        modsShowTab(modsState.tab === 'project' ? 'explore' : modsState.tab)
    }
}

function modsSwitchProfile(profileId){
    ProfileManager.select(modsState.serverId, profileId)
    modsState.profileId = profileId
    modsState.installedProjects = null
    modsRenderHeader()
    modsShowTab(modsState.tab === 'project' ? 'explore' : modsState.tab)
}

/**
 * Open the mods screen for the selected server and profile.
 *
 * @param {{createProfile?: boolean}} options createProfile opens the profile editor in create mode.
 */
async function openModsView({ createProfile = false } = {}){
    const distro = await DistroAPI.getDistribution()
    const serverId = ConfigManager.getSelectedServer()
    modsState.serverId = serverId
    modsState.serv = distro.getServerById(serverId)
    modsState.profileId = ProfileManager.getSelected(serverId).id
    modsState.target = Modrinth.getServerTarget(modsState.serv)
    modsState.blocklist = Modrinth.getBlocklist(modsState.serv)
    modsState.packProjects = null
    modsState.installedProjects = null
    modsSetType(modsState.target.loader == null ? 'resourcepack' : 'mod', false)
    modsRenderHeader()
    modsShowTab('installed')
    switchView(getCurrentView(), VIEWS.mods)
    if(createProfile && typeof modsOpenEditor === 'function'){
        modsOpenEditor('create')
    }
}

function closeModsView(){
    if(modsState.editing != null && typeof modsCloseEditor === 'function'){
        modsCloseEditor()
    }
    switchView(getCurrentView(), VIEWS.landing)
    renderProfileSelection()
}

modsEl('modsBackButton').onclick = closeModsView
modsEl('modsTabInstalled').onclick = () => modsShowTab('installed')
modsEl('modsTabExplore').onclick = () => modsShowTab('explore')
modsEl('modsAddContent').onclick = () => modsShowTab('explore')
modsEl('modsProfileSelect').addEventListener('change', e => {
    if(e.target.value === MODS_NEW_PROFILE){
        modsRenderHeader()
        modsOpenEditor('create')
        return
    }
    modsSwitchProfile(e.target.value)
})
for(const btn of document.querySelectorAll('.mods-types [data-type]')){
    btn.onclick = () => modsSetType(btn.dataset.type)
}
document.querySelector('.mods-tabs').addEventListener('keydown', e => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight'){
        return
    }
    e.preventDefault()
    const next = modsState.tab === 'installed' ? 'explore' : 'installed'
    modsShowTab(next)
    modsEl(next === 'installed' ? 'modsTabInstalled' : 'modsTabExplore').focus()
})
// Middle-click on a link must not open a launcher window.
modsEl('modsContainer').addEventListener('auxclick', e => {
    if(e.target.closest('a[href]')){
        e.preventDefault()
    }
})
document.addEventListener('keydown', e => {
    if(e.defaultPrevented || e.key !== 'Escape' || isOverlayVisible() || getCurrentView() !== VIEWS.mods){
        return
    }
    e.preventDefault()
    if(modsState.editing != null && typeof modsCloseEditor === 'function'){
        modsCloseEditor()
    } else if(modsState.tab === 'project'){
        modsShowTab('explore', false)
    } else {
        closeModsView()
    }
})
```

- [ ] **Step 4: Botão Mods na tela principal**

Em `app/landing.ejs`, dentro de `<div id="internalMedia">`, antes de `<div class="mediaContainer" id="settingsMediaContainer">`, acrescente:

```html
                        <div class="mediaContainer" id="modsMediaContainer">
                            <button class="mediaButton" id="modsMediaButton" type="button">
                                <svg class="mediaSVG" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                                <span>Mods</span>
                            </button>
                        </div>
```

Em `landing.js`, depois do bloco `// Bind settings button` (`document.getElementById('settingsMediaButton').onclick = ...`), acrescente:

```js
// Bind mods button
document.getElementById('modsMediaButton').onclick = () => openModsView()
```

- [ ] **Step 5: Estilos**

Em `app/assets/css/forja.css`, antes da linha `/* Modrinth mod browser (settings > Mods). */`, acrescente:

```css
/* Mods screen (mods.ejs). Classes below set display, so [hidden] must win explicitly. */
#modsContainer [hidden] { display: none !important; }
#modsContainer { height: 100%; display: flex; flex-direction: column; background: var(--background); color: var(--foreground); }
.mods-topbar { flex-shrink: 0; height: 56px; display: flex; align-items: center; padding: 0 36px; background: var(--sidebar); border-bottom: 1px solid var(--border); }
#modsBackButton { display: inline-flex; align-items: center; gap: 8px; background: transparent; border: 1px solid transparent; color: var(--foreground); padding: 6px 8px; border-radius: 4px; font: 13px var(--font-sans); cursor: pointer; }
#modsBackButton:hover { background: var(--accent); }
#modsBackButton svg { width: 16px; height: 16px; }
#modsBackButton kbd { margin-left: 8px; font: 11px var(--font-mono); padding: 1px 5px; color: var(--muted-foreground); background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 3px; }
#modsMain { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 36px 36px; display: flex; flex-direction: column; gap: 16px; max-width: 1160px; width: 100%; box-sizing: border-box; }
.mods-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.mods-profile { display: flex; align-items: center; gap: 14px; }
.mods-profile-icon { flex: none; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: var(--primary-soft); border: 1px solid var(--primary-line); color: var(--primary-fg); }
.mods-profile-icon svg { width: 28px; height: 28px; }
.mods-profile-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.mods-profile-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
#modsProfileName { margin: 0; font-size: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#modsProfileSelect { min-height: 28px; padding: 0 8px; background: var(--surface-2); color: var(--foreground); border: 1px solid var(--border-2); border-radius: 4px; font: 12px var(--font-sans); cursor: pointer; }
#modsProfileSummary { color: var(--muted-foreground); font: 11px var(--font-mono); }
.mods-profile-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.mods-btn { min-height: 32px; padding: 0 12px; border-radius: 4px; font: 500 12px var(--font-sans); white-space: nowrap; cursor: pointer; color: var(--foreground); background: var(--surface-2); border: 1px solid var(--border-2); display: inline-flex; align-items: center; justify-content: center; text-decoration: none; transition: background var(--dur-fast) var(--ease-forja), border-color var(--dur-fast) var(--ease-forja); }
.mods-btn:hover:not(:disabled) { background: var(--border-2); }
.mods-btn:disabled { color: var(--muted-foreground); cursor: default; }
.mods-btn-primary { color: #fff; background: var(--primary-fill); border-color: var(--primary-fill); }
.mods-btn-primary:hover:not(:disabled) { background: var(--fj-primary-hover); border-color: var(--fj-primary-hover); }
.mods-btn-primary:disabled { background: var(--surface-2); border-color: var(--border-2); }
.mods-btn-danger { color: var(--danger-fg); background: transparent; border-color: var(--danger-line); }
.mods-btn-danger:hover:not(:disabled) { background: var(--danger-soft); }
.mods-link-btn { align-self: flex-start; background: none; border: 0; padding: 4px 0; color: var(--primary-light); font: 13px var(--font-sans); cursor: pointer; text-align: left; }
.mods-link-btn:hover { text-decoration: underline; }
.mods-tabs { display: flex; gap: 20px; border-bottom: 1px solid var(--border); }
.mods-tabs [role=tab] { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0; margin-bottom: -1px; color: var(--muted-foreground); font: 500 13px var(--font-sans); cursor: pointer; }
.mods-tabs [role=tab][aria-selected=true] { color: var(--foreground); border-bottom-color: var(--primary); }
.mods-types { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.mods-types button { min-height: 28px; padding: 0 10px; border-radius: 4px; border: 1px solid var(--border-2); background: var(--surface-2); color: var(--muted-foreground); font: 12px var(--font-sans); cursor: pointer; }
.mods-types button[aria-pressed=true] { background: var(--primary-soft); border-color: var(--primary-line); color: var(--primary-fg); }
.mods-types button:disabled { opacity: .5; cursor: default; }
#modsBrowse > section { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
#modsBrowse > section[hidden] { display: none; }
.mods-toolbar { display: flex; gap: 8px; align-items: center; }
.mods-toolbar input[type=search] { flex: 1; min-width: 0; min-height: 32px; padding: 0 10px; color: var(--foreground); background: var(--sidebar); border: 1px solid var(--input-border); border-radius: 4px; font: 13px var(--font-sans); }
.mods-toolbar input::placeholder { color: var(--muted-2); }
#modsSearchSort { min-height: 32px; padding: 0 8px; background: var(--surface-2); color: var(--foreground); border: 1px solid var(--border-2); border-radius: 4px; font: 12px var(--font-sans); }
.mods-status { display: flex; align-items: center; gap: 10px; color: var(--muted-foreground); font-size: 12px; min-height: 20px; }
.mods-status:empty { display: none; }
.mods-list { display: flex; flex-direction: column; gap: 6px; }
.mods-row { display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--card); border: 1px solid var(--border-2); border-radius: 6px; }
.mods-row:hover { background: var(--accent); }
.mods-row[busy] { opacity: .6; pointer-events: none; }
.mods-row-icon { flex: none; width: 40px; height: 40px; border-radius: 6px; background: var(--surface-2); object-fit: cover; }
.mods-row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mods-row-title { color: var(--foreground); font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.mods-row-title { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
button.mods-row-title:hover { color: var(--primary-light); text-decoration: underline; }
.mods-row-meta { color: var(--muted-foreground); font: 11px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mods-row-desc { color: var(--muted-foreground); font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mods-row-status { color: var(--success-fg); font-size: 12px; }
.mods-row-status:empty { display: none; }
.mods-row-status[error] { color: var(--danger-fg); }
.mods-row-actions { flex: none; display: flex; align-items: center; gap: 10px; }
.mods-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }
.mods-tag { font-size: 11px; color: var(--muted-foreground); background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 3px; padding: 0 5px; }
.mods-badge { font: 11px var(--font-mono); color: var(--muted-foreground); background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 4px; padding: 3px 8px; white-space: nowrap; }
.mods-badge-success { color: var(--success-fg); background: var(--success-soft); border-color: var(--success-line); }
.mods-pack { margin-top: 8px; border: 1px solid var(--border-2); border-radius: 6px; background: var(--card); }
.mods-pack summary { padding: 10px 12px; cursor: pointer; font-size: 13px; color: var(--muted-foreground); }
.mods-pack-note { margin: 0 12px 8px; font-size: 12px; color: var(--muted-foreground); }
#modsPackList { display: flex; flex-direction: column; padding: 0 12px 12px; }
.mods-pack-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); }
.mods-pack-sub { padding-left: 20px; }
.mods-explore { display: flex; gap: 16px; align-items: flex-start; }
.mods-categories { flex: none; width: 170px; margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 4px; }
.mods-categories legend { font-size: 12px; font-weight: 600; margin-bottom: 6px; padding: 0; }
#modsCategoryList { display: flex; flex-direction: column; gap: 2px; }
.mods-check { display: flex; align-items: center; gap: 8px; min-height: 24px; font-size: 12px; color: var(--muted-foreground); cursor: pointer; }
.mods-check input { accent-color: var(--primary-fill); width: 14px; height: 14px; margin: 0; }
.mods-muted { font-size: 12px; color: var(--muted-foreground); }
.mods-explore-results { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.mods-more { width: 100%; }
#modsPanelProject { gap: 12px !important; }
.mods-project-header { display: flex; gap: 14px; align-items: flex-start; }
.mods-project-header .mods-row-icon { width: 64px; height: 64px; }
.mods-project-heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.mods-project-heading h2 { margin: 0; font-size: 20px; }
.mods-project-heading p { margin: 0; color: var(--muted-foreground); font-size: 13px; }
.mods-project-actions { flex: none; display: flex; gap: 8px; align-items: center; }
.mods-project-facts { margin: 0; color: var(--muted-foreground); font: 11px var(--font-mono); }
.mods-gallery { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.mods-gallery img { height: 120px; border-radius: 6px; border: 1px solid var(--border-2); }
.mods-project-body { background: var(--card); border: 1px solid var(--border-2); border-radius: 6px; padding: 16px; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.mods-project-body img { max-width: 100%; height: auto; }
.mods-project-body a { color: var(--primary-light); }
.mods-project-body pre, .mods-project-body code { font: 12px var(--font-mono); background: var(--surface-2); border-radius: 4px; }
.mods-project-body pre { padding: 10px; overflow-x: auto; }
.mods-project-body table { border-collapse: collapse; }
.mods-project-body td, .mods-project-body th { border: 1px solid var(--border-2); padding: 4px 8px; }
#modsMediaButton { width: auto; gap: 6px; padding: 8px 10px; color: var(--foreground); font: 500 12px var(--font-sans); cursor: pointer; }
#modsMediaButton .mediaSVG { width: 18px; height: 18px; fill: none; }
#modsMediaButton:hover .mediaSVG { fill: none; color: var(--primary-light); }
```

Dentro do bloco `@media (max-width: 900px) {` já existente, acrescente:

```css
    .mods-topbar, #modsMain { padding-left: 24px; padding-right: 24px; }
    .mods-explore { flex-direction: column; }
    .mods-categories { width: 100%; }
    #modsCategoryList { flex-direction: row; flex-wrap: wrap; gap: 4px 12px; }
```

Dentro do bloco `@media (max-width: 650px) {` já existente, acrescente:

```css
    .mods-profile { flex-wrap: wrap; }
    .mods-profile-actions { width: 100%; justify-content: flex-start; }
    .mods-row { flex-wrap: wrap; }
    .mods-row-actions { width: 100%; justify-content: flex-end; }
    #modsBackButton kbd { display: none; }
```

- [ ] **Step 6: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/mods.js app/assets/js/scripts/landing.js app/assets/js/scripts/uibinder.js`

```bash
git add app/mods.ejs app/app.ejs app/assets/js/scripts/mods.js app/assets/js/scripts/uibinder.js app/landing.ejs app/assets/js/scripts/landing.js app/assets/css/forja.css
git commit -m "Add mods screen skeleton with profile header and tabs"
```

### Task 12: Aba Instalados

**Files:**
- Modify: `app/assets/js/scripts/mods.js` (acrescentar ao fim)

- [ ] **Step 1: Listagem, ações e mods do pack**

Acrescente ao fim de `mods.js`:

```js
// Installed tab

modsPanels.installed = { show: () => modsRefreshInstalled() }

function modsDisplayName(file){
    return file.project?.title ?? file.fileName.replace(/\.disabled$/, '').replace(/\.(jar|zip)$/i, '')
}

async function modsRefreshInstalled(){
    const request = ++modsState.installedRequest
    const { type } = modsState
    const gameDir = modsGameDir()
    modsState.updates = new Map()
    modsRenderPackGroup()
    modsSetStatus('modsInstalledStatus', Lang.queryJS('mods.installed.loading'))

    let files
    try {
        files = await ContentManager.listFiles(gameDir, type)
    } catch(err) {
        loggerMods.error('Could not list content.', err)
        if(request === modsState.installedRequest){
            modsSetStatus('modsInstalledStatus', Lang.queryJS('mods.error.disk'))
        }
        return
    }
    if(request !== modsState.installedRequest){
        return
    }
    modsState.installed = files
    modsRenderInstalled()

    const described = await ContentManager.describe(gameDir, type)
    if(request !== modsState.installedRequest){
        return
    }
    modsState.installed = described
    modsRenderInstalled()

    const recognised = described.filter(f => f.project != null)
    if(recognised.length === 0 || (type === 'mod' && modsState.target.loader == null)){
        return
    }
    try {
        const updates = await Modrinth.checkUpdates(recognised.map(f => ({ path: f.path, type })), modsState.target)
        if(request !== modsState.installedRequest){
            return
        }
        modsState.updates = updates
        modsRenderInstalled()
    } catch(err) {
        loggerMods.warn('Could not check for updates.', err)
    }
}

function modsRenderInstalled(){
    const filter = modsEl('modsInstalledFilter').value.trim().toLowerCase()
    const visible = modsState.installed.filter(f => !filter || modsDisplayName(f).toLowerCase().includes(filter))
    modsEl('modsInstalledList').replaceChildren(...visible.map(modsInstalledRow))
    modsEl('modsUpdateAll').hidden = !modsState.installed.some(f => modsState.updates.has(f.path))
    let status = ''
    if(modsState.installed.length === 0){
        status = Lang.queryJS(`mods.installed.empty.${modsState.type}`)
    } else if(visible.length === 0){
        status = Lang.queryJS('mods.installed.noMatch')
    }
    modsSetStatus('modsInstalledStatus', status)
}

function modsInstalledRow(file){
    const { type } = modsState
    const title = modsDisplayName(file)
    const row = document.createElement('div')
    row.className = 'mods-row'

    const info = document.createElement('div')
    info.className = 'mods-row-info'
    const rowStatus = modsText('span', 'mods-row-status', '')
    rowStatus.setAttribute('role', 'status')
    info.append(
        modsText('span', 'mods-row-title', title),
        modsText('span', 'mods-row-meta', file.version != null ? `${file.version.number} · ${file.fileName}` : file.fileName),
        rowStatus
    )

    const run = async action => {
        row.setAttribute('busy', '')
        try {
            await action()
            modsState.installedProjects = null
            await modsRefreshInstalled()
        } catch(err) {
            loggerMods.error('Content action failed.', err)
            row.removeAttribute('busy')
            rowStatus.textContent = modsErrorMessage(err)
            rowStatus.setAttribute('error', '')
        }
    }

    const actions = document.createElement('div')
    actions.className = 'mods-row-actions'
    const update = modsState.updates.get(file.path)
    if(update != null){
        const btn = modsText('button', 'mods-btn mods-btn-primary', Lang.queryJS('mods.installed.update', { version: update.version_number }))
        btn.type = 'button'
        btn.onclick = () => {
            btn.disabled = true
            btn.textContent = Lang.queryJS('mods.installed.updating')
            run(() => ContentManager.updateFile(modsGameDir(), type, file.fileName, update))
        }
        actions.appendChild(btn)
    }
    actions.appendChild(modsToggle(
        file.enabled,
        Lang.queryJS(type === 'shader' ? 'mods.installed.useShader' : 'mods.installed.enable', { title }),
        checked => run(() => ContentManager.setEnabled(modsGameDir(), type, file.fileName, checked))
    ))
    const remove = modsText('button', 'mods-btn mods-btn-danger', Lang.queryJS('mods.installed.remove'))
    remove.type = 'button'
    remove.setAttribute('aria-label', Lang.queryJS('mods.installed.removeLabel', { title }))
    remove.onclick = () => run(() => ContentManager.remove(modsGameDir(), type, file.fileName))
    actions.appendChild(remove)

    row.append(modsIcon(file.project?.iconUrl), info, actions)
    return row
}

modsEl('modsInstalledFilter').addEventListener('input', modsRenderInstalled)

modsEl('modsUpdateAll').onclick = async () => {
    const btn = modsEl('modsUpdateAll')
    btn.disabled = true
    const gameDir = modsGameDir()
    const { type } = modsState
    let failed = 0
    for(const file of modsState.installed){
        const update = modsState.updates.get(file.path)
        if(update == null){
            continue
        }
        try {
            await ContentManager.updateFile(gameDir, type, file.fileName, update)
        } catch(err) {
            failed++
            loggerMods.error('Update failed.', err)
        }
    }
    btn.disabled = false
    await modsRefreshInstalled()
    if(failed > 0){
        modsSetStatus('modsInstalledStatus', Lang.queryJS('mods.installed.updateAllFailed', { count: failed }))
    }
}

modsEl('modsOpenFolder').onclick = async () => {
    const dir = ContentManager.folder(modsGameDir(), modsState.type)
    await modsFs.ensureDir(dir)
    shell.openPath(dir)
}

// Modpack mods: read only, optional ones can be toggled per profile.

function modsIsPackMod(mdl){
    const t = mdl.rawModule.type
    return t === Type.ForgeMod || t === Type.LiteMod || t === Type.LiteLoader || t === Type.FabricMod
}

function modsRenderPackGroup(){
    const group = modsEl('modsPackGroup')
    const count = modsCountPackMods(modsState.serv.modules)
    group.hidden = modsState.type !== 'mod' || count === 0
    if(group.hidden){
        return
    }
    const conf = ConfigManager.getModConfiguration(modsConfigKey())?.mods ?? {}
    const list = modsEl('modsPackList')
    list.replaceChildren()
    modsAppendPackModules(list, modsState.serv.modules, conf, [])
    modsEl('modsPackSummary').textContent = Lang.queryJS('mods.pack.summary', { count })
}

function modsAppendPackModules(parent, mdls, conf, ids){
    for(const mdl of mdls){
        if(!modsIsPackMod(mdl)){
            continue
        }
        const id = mdl.getVersionlessMavenIdentifier()
        const row = document.createElement('div')
        row.className = 'mods-pack-row'
        const info = document.createElement('div')
        info.className = 'mods-row-info'
        info.append(
            modsText('span', 'mods-row-title', mdl.rawModule.name),
            modsText('span', 'mods-row-meta', `v${mdl.mavenComponents.version}`)
        )
        row.appendChild(info)
        if(mdl.getRequired().value){
            row.appendChild(modsText('span', 'mods-badge', Lang.queryJS('mods.pack.required')))
        } else {
            const value = typeof conf[id] === 'object' ? conf[id].value : conf[id]
            row.appendChild(modsToggle(
                Boolean(value),
                Lang.queryJS('mods.installed.enable', { title: mdl.rawModule.name }),
                checked => modsSetPackModEnabled([...ids, id], checked)
            ))
        }
        parent.appendChild(row)
        if(mdl.subModules.length > 0){
            const sub = document.createElement('div')
            sub.className = 'mods-pack-sub'
            parent.appendChild(sub)
            modsAppendPackModules(sub, mdl.subModules, typeof conf[id] === 'object' ? (conf[id].mods ?? {}) : {}, [...ids, id])
        }
    }
}

function modsSetPackModEnabled(ids, enabled){
    const key = modsConfigKey()
    const cfg = ConfigManager.getModConfiguration(key)
    let level = cfg.mods
    for(const id of ids.slice(0, -1)){
        level = level[id].mods
    }
    const last = ids[ids.length - 1]
    if(typeof level[last] === 'object'){
        level[last].value = enabled
    } else {
        level[last] = enabled
    }
    ConfigManager.setModConfiguration(key, cfg)
    ConfigManager.save()
}
```

- [ ] **Step 2: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/mods.js`

```bash
git add app/assets/js/scripts/mods.js
git commit -m "Add installed content tab to the mods screen"
```

### Task 13: Aba Explorar e página do projeto

**Files:**
- Modify: `app/assets/js/scripts/mods.js` (acrescentar ao fim)

- [ ] **Step 1: Busca, categorias, instalar e página do projeto**

Acrescente ao fim de `mods.js`:

```js
// Explore tab

modsPanels.explore = { show: () => modsPrepareExplore() }
modsPanels.project = { show: () => {} }

function modsCategoryLabel(name){
    return MODS_CATEGORY_LABELS[name] ?? name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
}

async function modsGetPackProjects(){
    if(modsState.packProjects == null){
        try {
            modsState.packProjects = await Modrinth.getModpackProjects(modsState.serv)
        } catch(err) {
            loggerMods.warn('Could not identify modpack mods.', err)
            return new Set()
        }
    }
    return modsState.packProjects
}

async function modsGetInstalledProjects(){
    if(modsState.installedProjects == null){
        try {
            modsState.installedProjects = await ContentManager.installedProjects(modsGameDir())
        } catch(err) {
            loggerMods.warn('Could not identify installed content.', err)
            return new Set()
        }
    }
    return modsState.installedProjects
}

function modsPrepareExplore(){
    modsEl('modsSearchQuery').placeholder = Lang.queryJS(`mods.explore.placeholder.${modsState.type}`)
    modsRenderCategories()
    modsRunSearch()
}

async function modsRenderCategories(){
    const type = modsState.type
    const box = modsEl('modsCategoryList')
    box.replaceChildren(modsText('span', 'mods-muted', Lang.queryJS('mods.explore.loadingCategories')))
    let names
    try {
        names = await Modrinth.getCategories(type)
    } catch(err) {
        loggerMods.warn('Could not load categories.', err)
        if(type === modsState.type){
            box.replaceChildren(modsText('span', 'mods-muted', Lang.queryJS('mods.explore.categoriesError')))
        }
        return
    }
    if(type !== modsState.type){
        return
    }
    box.replaceChildren(...names.map(name => {
        const label = document.createElement('label')
        label.className = 'mods-check'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.value = name
        input.checked = modsState.search.categories.has(name)
        input.onchange = () => {
            if(input.checked){
                modsState.search.categories.add(name)
            } else {
                modsState.search.categories.delete(name)
            }
            modsRunSearch()
        }
        label.append(input, modsText('span', '', modsCategoryLabel(name)))
        return label
    }))
}

async function modsRunSearch(append = false){
    const s = modsState.search
    const request = ++s.request
    const results = modsEl('modsSearchResults')
    const more = modsEl('modsSearchMore')
    if(!append){
        s.query = modsEl('modsSearchQuery').value.trim()
        s.sort = modsEl('modsSearchSort').value
        s.offset = 0
        results.replaceChildren()
    }
    more.hidden = true
    modsSetStatus('modsSearchStatus', Lang.queryJS('mods.explore.loading'))
    try {
        const [pack, installed] = await Promise.all([modsGetPackProjects(), modsGetInstalledProjects()])
        const res = await Modrinth.search(
            { query: s.query, type: modsState.type, categories: [...s.categories], sort: s.sort, offset: s.offset },
            modsState.target, modsState.blocklist, pack
        )
        if(request !== s.request){
            return
        }
        for(const hit of res.hits){
            results.appendChild(modsSearchRow(hit, installed.has(hit.project_id)))
        }
        s.offset = res.offset + res.pageSize
        more.hidden = s.offset >= res.total
        modsSetStatus('modsSearchStatus', results.childElementCount === 0 && more.hidden ? Lang.queryJS('mods.explore.empty') : '')
    } catch(err) {
        if(request !== s.request){
            return
        }
        loggerMods.error('Search failed.', err)
        modsSetStatus(
            'modsSearchStatus',
            err.code === 'RATE_LIMITED' ? Lang.queryJS('mods.error.rateLimited') : Lang.queryJS('mods.error.offline'),
            () => modsRunSearch(append)
        )
    }
}

function modsInstalledBadge(){
    return modsText('span', 'mods-badge mods-badge-success', Lang.queryJS('mods.explore.installed'))
}

/**
 * Install button for a project; shows the outcome in rowStatus.
 */
function modsInstallButton(projectId, title, installed, rowStatus){
    if(installed){
        return modsInstalledBadge()
    }
    const btn = modsText('button', 'mods-btn mods-btn-primary', Lang.queryJS('mods.explore.install'))
    btn.type = 'button'
    btn.setAttribute('aria-label', Lang.queryJS('mods.explore.installLabel', { title }))
    btn.onclick = async () => {
        btn.disabled = true
        btn.textContent = Lang.queryJS('mods.explore.installing')
        rowStatus.textContent = ''
        rowStatus.removeAttribute('error')
        try {
            const [pack, installedSet] = await Promise.all([modsGetPackProjects(), modsGetInstalledProjects()])
            await Modrinth.install(projectId, modsState.target, modsGameDir(), installedSet, modsState.blocklist, pack)
            modsState.installedProjects = null
            btn.replaceWith(modsInstalledBadge())
            rowStatus.textContent = Lang.queryJS('mods.explore.installedStatus', { title })
        } catch(err) {
            if(!(err instanceof Modrinth.ModrinthError)){
                loggerMods.error('Install failed.', err)
            }
            if(err.code === 'ALREADY_INSTALLED'){
                btn.replaceWith(modsInstalledBadge())
            } else {
                btn.disabled = false
                btn.textContent = Lang.queryJS('mods.explore.install')
            }
            rowStatus.textContent = modsErrorMessage(err)
            rowStatus.toggleAttribute('error', err.code !== 'ALREADY_INSTALLED')
        }
    }
    return btn
}

function modsSearchRow(hit, installed){
    const row = document.createElement('div')
    row.className = 'mods-row'
    const info = document.createElement('div')
    info.className = 'mods-row-info'
    const titleBtn = modsText('button', 'mods-row-title', hit.title)
    titleBtn.type = 'button'
    titleBtn.onclick = () => modsOpenProject(hit.project_id)
    const tags = document.createElement('div')
    tags.className = 'mods-tags'
    for(const c of hit.categories.filter(c => MODS_CATEGORY_LABELS[c] != null).slice(0, 3)){
        tags.appendChild(modsText('span', 'mods-tag', modsCategoryLabel(c)))
    }
    const rowStatus = modsText('span', 'mods-row-status', '')
    rowStatus.setAttribute('role', 'status')
    info.append(
        titleBtn,
        modsText('span', 'mods-row-meta', `${Lang.queryJS('mods.explore.by', { author: hit.author })} · ${Lang.queryJS('mods.explore.downloads', { count: hit.downloads.toLocaleString('pt-BR') })}`),
        modsText('span', 'mods-row-desc', hit.description),
        tags,
        rowStatus
    )
    row.append(modsIcon(hit.icon_url), info, modsInstallButton(hit.project_id, hit.title, installed, rowStatus))
    return row
}

modsEl('modsSearchForm').addEventListener('submit', e => {
    e.preventDefault()
    modsRunSearch()
})
modsEl('modsSearchSort').addEventListener('change', () => modsRunSearch())
modsEl('modsSearchMore').onclick = () => modsRunSearch(true)

// Project page

async function modsOpenProject(projectId){
    modsShowTab('project')
    const request = ++modsState.projectRequest
    const article = modsEl('modsProject')
    article.replaceChildren()
    modsSetStatus('modsProjectStatus', Lang.queryJS('mods.project.loading'))
    try {
        const [project, pack, installed] = await Promise.all([Modrinth.getProject(projectId), modsGetPackProjects(), modsGetInstalledProjects()])
        let plan = null
        let planError = null
        try {
            plan = await Modrinth.resolveInstall(project.id, modsState.target, installed, modsState.blocklist, pack)
        } catch(err) {
            planError = err
        }
        if(request !== modsState.projectRequest){
            return
        }
        modsSetStatus('modsProjectStatus', '')
        article.replaceChildren(...modsProjectContent(project, plan, planError, installed.has(project.id)))
        modsEl('modsProjectBack').focus()
    } catch(err) {
        if(request !== modsState.projectRequest){
            return
        }
        loggerMods.error('Could not load project.', err)
        modsSetStatus(
            'modsProjectStatus',
            err.code === 'RATE_LIMITED' ? Lang.queryJS('mods.error.rateLimited') : Lang.queryJS('mods.error.offline'),
            () => modsOpenProject(projectId)
        )
    }
}

function modsProjectContent(project, plan, planError, installed){
    const rowStatus = modsText('span', 'mods-row-status', '')
    rowStatus.setAttribute('role', 'status')

    const heading = document.createElement('div')
    heading.className = 'mods-project-heading'
    heading.append(modsText('h2', '', project.title), modsText('p', '', project.description), rowStatus)

    const actions = document.createElement('div')
    actions.className = 'mods-project-actions'
    const alreadyInstalled = installed || planError?.code === 'ALREADY_INSTALLED'
    if(planError != null && !alreadyInstalled){
        rowStatus.textContent = modsErrorMessage(planError)
        rowStatus.setAttribute('error', '')
    } else {
        actions.appendChild(modsInstallButton(project.id, project.title, alreadyInstalled, rowStatus))
    }
    const site = modsText('a', 'mods-btn', Lang.queryJS('mods.project.openSite'))
    site.href = `https://modrinth.com/${project.project_type}/${encodeURIComponent(project.slug)}`
    actions.appendChild(site)

    const header = document.createElement('div')
    header.className = 'mods-project-header'
    header.append(modsIcon(project.icon_url), heading, actions)

    const parts = [header]
    if(plan != null){
        const main = plan[plan.length - 1]
        parts.push(modsText('p', 'mods-project-facts', Lang.queryJS('mods.project.version', { version: main.version.version_number })))
        const deps = plan.slice(0, -1)
        if(deps.length > 0){
            parts.push(modsText('p', 'mods-project-facts', Lang.queryJS('mods.project.dependencies', { list: deps.map(d => d.project.title).join(', ') })))
        }
    }

    const gallery = (project.gallery ?? [])
        .filter(g => /^https:\/\//i.test(g.url))
        .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    if(gallery.length > 0){
        const strip = document.createElement('div')
        strip.className = 'mods-gallery'
        for(const g of gallery.slice(0, 8)){
            const img = document.createElement('img')
            img.src = g.url
            img.alt = g.title ?? ''
            img.loading = 'lazy'
            strip.appendChild(img)
        }
        parts.push(strip)
    }

    const body = document.createElement('div')
    body.className = 'mods-project-body'
    body.innerHTML = RichText.render(project.body)
    parts.push(body)
    return parts
}

modsEl('modsProjectBack').onclick = () => modsShowTab('explore', false)
```

- [ ] **Step 2: Lint e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/mods.js`

```bash
git add app/assets/js/scripts/mods.js
git commit -m "Add Modrinth explore tab and project page"
```

### Task 14: Editar perfil (geral e jogo)

**Files:**
- Modify: `app/assets/js/scripts/settings.js`
- Modify: `app/settings.ejs`
- Modify: `app/mods.ejs`
- Modify: `app/assets/js/scripts/mods.js` (acrescentar ao fim)
- Modify: `app/assets/css/forja.css`
- Modify: `scripts/verify-visual.cjs`

Os campos de memória, Java, argumentos da JVM, resolução e tela cheia saem das configurações e vão para o editor de perfil. Eles mantêm os mesmos `id` e `cValue`, então as funções de `settings.js` que já cuidam deles (sliders, seletor de Java, validação) continuam funcionando; só passam a receber a raiz e a chave do perfil.

- [ ] **Step 1: Funções genéricas em `settings.js`**

Troque a assinatura e a primeira linha de `initSettingsValidators`:

```js
function initSettingsValidators() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
```

por:

```js
function initSettingsValidators(root = document.getElementById('settingsContainer'), state = settingsState, setDisabled = settingsSaveDisabled) {
    const sEls = root.querySelectorAll('[cValue]')
```

E, dentro dela, troque `settingsState.invalid` por `state.invalid` (3 ocorrências) e `settingsSaveDisabled(` por `setDisabled(` (2 ocorrências).

Troque o início de `initSettingsValues`:

```js
async function initSettingsValues() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
```

por:

```js
async function initSettingsValues(root = document.getElementById('settingsContainer'), key = ProfileManager.getSelectedConfigKey()) {
    const sEls = root.querySelectorAll('[cValue]')
```

e, dentro dela, `gFnOpts.push(ProfileManager.getSelectedConfigKey())` por `gFnOpts.push(key)`.

Troque o início de `saveSettingsValues`:

```js
function saveSettingsValues() {
    const sEls = document.getElementById('settingsContainer').querySelectorAll('[cValue]')
```

por:

```js
function saveSettingsValues(root = document.getElementById('settingsContainer'), key = ProfileManager.getSelectedConfigKey()) {
    const sEls = root.querySelectorAll('[cValue]')
```

e, dentro dela, `sFnOpts.push(ProfileManager.getSelectedConfigKey())` por `sFnOpts.push(key)`.

Em `prepareSettings`, apague a linha `    await prepareJavaTab()` (o editor de perfil chama `prepareJavaTab` quando abre).

- [ ] **Step 2: Tirar a aba Java e os campos de jogo das configurações (`settings.ejs`)**

Apague o botão de navegação:

```html
                    <button class="settingsNavItem" rSc="settingsTabJava"><%- lang('settings.navJava') %></button>
```

**Recorte** (não apague; eles vão para `mods.ejs` no Step 3), na ordem:

1. Da aba Minecraft: o bloco `<div id="settingsGameResolutionContainer">…</div>` inteiro.
2. Da aba Minecraft: o primeiro `<div class="settingsFieldContainer">…</div>`, o que contém `cValue="ProfileFullscreen"`.
3. Da aba Java: o bloco `<div id="settingsMemoryContainer">…</div>` inteiro.
4. Da aba Java: o bloco `<div class="settingsFileSelContainer">…</div>` que contém `id="settingsJavaExecVal"`.
5. Da aba Java: o bloco `<div id="settingsJVMOptsContainer">…</div>` inteiro.

Depois apague o que restou da aba Java: o `<div id="settingsTabJava" class="settingsTab" style="display: none;">`, o cabeçalho dela e o `settingsSelServContainer` dela, até o `</div>` que fecha a aba.

Confira: `grep -n "settingsTabJava\|settingsMemoryContainer\|settingsGameWidth" app/settings.ejs` não imprime nada.

- [ ] **Step 3: Painel do editor (`mods.ejs`)**

Em `.mods-profile-actions`, antes do botão `modsAddContent`, acrescente:

```html
                <button id="modsEditProfile" type="button" class="mods-btn"><%- lang('mods.editProfile') %></button>
```

Logo depois do `</div>` que fecha `<div id="modsBrowse">` (e antes de `</main>`), acrescente:

```html
        <section id="modsPanelEdit" hidden aria-labelledby="modsEditTitle">
            <h2 id="modsEditTitle"></h2>
            <div class="mods-edit-section">
                <h3><%- lang('mods.editGeneral') %></h3>
                <label class="mods-field">
                    <span><%- lang('mods.editName') %></span>
                    <input id="modsEditName" type="text" maxlength="32" autocomplete="off" aria-describedby="modsEditNameError">
                </label>
                <span id="modsEditNameError" class="mods-field-error" role="alert"></span>
                <fieldset class="mods-field">
                    <legend><%- lang('mods.editIcon') %></legend>
                    <div id="modsEditIcons" class="mods-icon-picker"></div>
                </fieldset>
                <label id="modsEditCopyWrap" class="mods-field">
                    <span><%- lang('mods.editCopyFrom') %></span>
                    <select id="modsEditCopyFrom"></select>
                </label>
            </div>
            <div id="modsEditGame" class="mods-edit-section">
                <h3><%- lang('mods.editGame') %></h3>
                <!-- Cole aqui, nesta ordem, os cinco blocos recortados no Step 2. -->
            </div>
            <div class="mods-edit-actions">
                <button id="modsEditDelete" type="button" class="mods-btn mods-btn-danger"><%- lang('mods.editDelete') %></button>
                <button id="modsEditDuplicate" type="button" class="mods-btn"><%- lang('mods.editDuplicate') %></button>
                <span class="mods-spacer"></span>
                <button id="modsEditCancel" type="button" class="mods-btn"><%- lang('mods.editCancel') %></button>
                <button id="modsEditSave" type="button" class="mods-btn mods-btn-primary"><%- lang('mods.editSave') %></button>
            </div>
        </section>
```

Cole os cinco blocos no lugar do comentário e apague o comentário.

- [ ] **Step 4: Comportamento do editor (`mods.js`)**

Acrescente ao fim de `mods.js`:

```js
// Profile editor

const modsEditorState = { invalid: new Set(), validatorsBound: false }

function modsSetEditorSaveDisabled(disabled){
    modsEl('modsEditSave').disabled = disabled
}

function modsRenderIconPicker(selected){
    const box = modsEl('modsEditIcons')
    box.replaceChildren(...ProfileManager.ICONS.map(name => {
        const label = document.createElement('label')
        label.className = 'mods-icon-option'
        const input = document.createElement('input')
        input.type = 'radio'
        input.name = 'modsEditIcon'
        input.value = name
        input.checked = name === selected
        input.setAttribute('aria-label', ProfileIcons.LABELS[name])
        label.append(input, ProfileIcons.svg(name))
        return label
    }))
}

/**
 * @param {'create' | 'edit'} mode
 */
async function modsOpenEditor(mode){
    modsState.editing = { mode }
    const profile = mode === 'edit' ? ProfileManager.get(modsState.serverId, modsState.profileId) : null
    modsEl('modsEditTitle').textContent = Lang.queryJS(mode === 'create' ? 'mods.editor.createTitle' : 'mods.editor.editTitle')
    modsEl('modsEditName').value = profile?.name ?? ''
    modsEl('modsEditName').removeAttribute('aria-invalid')
    modsEl('modsEditNameError').textContent = ''
    modsRenderIconPicker(profile?.icon ?? ProfileManager.ICONS[0])

    modsEl('modsEditCopyWrap').hidden = mode !== 'create'
    if(mode === 'create'){
        const select = modsEl('modsEditCopyFrom')
        select.replaceChildren()
        for(const p of ProfileManager.list(modsState.serverId)){
            select.add(new Option(p.name, p.id, false, p.id === modsState.profileId))
        }
        select.add(new Option(Lang.queryJS('mods.editor.noCopy'), ''))
    }
    modsEl('modsEditGame').hidden = mode !== 'edit'
    modsEl('modsEditDelete').hidden = mode !== 'edit' || modsState.profileId === ProfileManager.DEFAULT_ID
    modsEl('modsEditDuplicate').hidden = mode !== 'edit'

    modsEl('modsBrowse').hidden = true
    document.querySelector('.mods-profile-actions').hidden = true
    modsEl('modsPanelEdit').hidden = false

    if(mode === 'edit'){
        if(!modsEditorState.validatorsBound){
            initSettingsValidators(modsEl('modsEditGame'), modsEditorState, modsSetEditorSaveDisabled)
            modsEditorState.validatorsBound = true
        }
        await initSettingsValues(modsEl('modsEditGame'), modsConfigKey())
        await prepareJavaTab()
    }
    modsEl('modsEditName').focus()
}

function modsCloseEditor(){
    modsState.editing = null
    modsEl('modsPanelEdit').hidden = true
    modsEl('modsBrowse').hidden = false
    document.querySelector('.mods-profile-actions').hidden = false
    modsEditorState.invalid.clear()
    modsSetEditorSaveDisabled(false)
    for(const el of modsEl('modsEditGame').querySelectorAll('[error]')){
        el.removeAttribute('error')
        el.removeAttribute('aria-invalid')
    }
}

function modsEditorFailed(key, err){
    loggerMods.error('Profile editor action failed.', err)
    modsEl('modsEditNameError').textContent = Lang.queryJS(key)
}

modsEl('modsEditProfile').onclick = () => modsOpenEditor('edit')
modsEl('modsEditCancel').onclick = modsCloseEditor

modsEl('modsEditName').addEventListener('keydown', e => {
    if(e.key === 'Enter'){
        e.preventDefault()
        modsEl('modsEditSave').click()
    }
})

modsEl('modsEditSave').onclick = async () => {
    const nameInput = modsEl('modsEditName')
    const name = ProfileManager.validateName(nameInput.value)
    if(name == null){
        modsEl('modsEditNameError').textContent = Lang.queryJS('mods.editor.nameError')
        nameInput.setAttribute('aria-invalid', 'true')
        nameInput.focus()
        return
    }
    nameInput.removeAttribute('aria-invalid')
    const icon = document.querySelector('input[name="modsEditIcon"]:checked')?.value
    const btn = modsEl('modsEditSave')
    btn.disabled = true
    try {
        if(modsState.editing.mode === 'create'){
            const copyFrom = modsEl('modsEditCopyFrom').value || null
            const profile = await ProfileManager.create(modsState.serverId, { name, icon, copyFrom })
            modsCloseEditor()
            modsSwitchProfile(profile.id)
        } else {
            ProfileManager.update(modsState.serverId, modsState.profileId, { name, icon })
            saveSettingsValues(modsEl('modsEditGame'), modsConfigKey())
            ConfigManager.save()
            modsCloseEditor()
            modsRenderHeader()
        }
    } catch(err) {
        modsEditorFailed('mods.editor.saveFailed', err)
    } finally {
        btn.disabled = modsEditorState.invalid.size > 0
    }
}

modsEl('modsEditDuplicate').onclick = async () => {
    try {
        const profile = await ProfileManager.duplicate(modsState.serverId, modsState.profileId)
        modsCloseEditor()
        modsSwitchProfile(profile.id)
    } catch(err) {
        modsEditorFailed('mods.editor.saveFailed', err)
    }
}

modsEl('modsEditDelete').onclick = () => {
    const profile = ProfileManager.get(modsState.serverId, modsState.profileId)
    setOverlayContent(
        Lang.queryJS('mods.editor.deleteTitle', { name: escapeHtml(profile.name) }),
        Lang.queryJS('mods.editor.deleteMessage'),
        Lang.queryJS('mods.editor.deleteConfirm'),
        Lang.queryJS('mods.editor.deleteCancel')
    )
    setOverlayHandler(async () => {
        toggleOverlay(false)
        try {
            await ProfileManager.remove(modsState.serverId, profile.id)
            modsCloseEditor()
            modsSwitchProfile(ProfileManager.DEFAULT_ID)
        } catch(err) {
            modsEditorFailed('mods.editor.deleteFailed', err)
        }
    })
    setDismissHandler(() => toggleOverlay(false))
    toggleOverlay(true, true)
}
```

(`escapeHtml` é global de `landing.js`; `setOverlayContent`, `setOverlayHandler`, `setDismissHandler` e `toggleOverlay` são de `overlay.js`. Todos já estão carregados quando o jogador clica.)

- [ ] **Step 5: Estilos do editor**

Em `forja.css`, logo depois das regras `/* Mods screen (mods.ejs). */` (antes de `/* Modrinth mod browser (settings > Mods). */`), acrescente:

```css
#modsPanelEdit { display: flex; flex-direction: column; gap: 16px; }
#modsPanelEdit[hidden] { display: none; }
#modsEditTitle { margin: 0; font-size: 18px; font-weight: 600; }
.mods-edit-section { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--card); border: 1px solid var(--border-2); border-radius: 6px; }
.mods-edit-section[hidden] { display: none; }
.mods-edit-section h3 { margin: 0; font-size: 13px; font-weight: 600; }
.mods-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted-foreground); border: 0; margin: 0; padding: 0; }
.mods-field[hidden] { display: none; }
.mods-field legend { padding: 0; margin-bottom: 6px; }
#modsEditName, #modsEditCopyFrom { max-width: 340px; min-height: 32px; padding: 0 10px; color: var(--foreground); background: var(--sidebar); border: 1px solid var(--input-border); border-radius: 4px; font: 13px var(--font-sans); }
#modsEditName[aria-invalid=true] { border-color: var(--danger-fg); }
.mods-field-error { color: var(--danger-fg); font-size: 12px; min-height: 0; }
.mods-field-error:empty { display: none; }
.mods-icon-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.mods-icon-option { position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid var(--border-2); background: var(--surface-2); color: var(--muted-foreground); cursor: pointer; }
.mods-icon-option input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.mods-icon-option svg { width: 22px; height: 22px; }
.mods-icon-option:has(input:checked) { background: var(--primary-soft); border-color: var(--primary-line); color: var(--primary-fg); }
.mods-icon-option:focus-within { outline: 2px solid var(--ring); outline-offset: 2px; }
.mods-edit-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.mods-spacer { flex: 1; }
#modsEditGame input[type=number], #modsEditGame input[type=text] { color: var(--foreground); background: var(--sidebar); border: 1px solid var(--input-border); border-radius: 4px; font-family: var(--font-sans); }
#modsEditGame input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
#modsEditGame input[error] { color: var(--danger-fg); border-color: var(--danger-fg); background: var(--danger-soft); }
#modsEditGame a { color: var(--primary-light); }
```

- [ ] **Step 6: Ajustar o teste visual existente (`scripts/verify-visual.cjs`)**

O campo de resolução e a aba Java não existem mais nas configurações; o teste deles passa para `verify-mods.cjs` (Task 16).

Troque a lista de abas:

```js
    for (const tab of ['Account', 'Minecraft', 'Mods', 'Java', 'Launcher', 'About', 'Update']) {
```

por:

```js
    for (const tab of ['Account', 'Minecraft', 'Mods', 'Launcher', 'About', 'Update']) {
```

Apague as linhas que vão de `const originalWidth = await run(...)` até `assert.equal(await run(\`document.getElementById('settingsBackButton').disabled\`), false)` (o teste do campo inválido de largura, 9 linhas).

Apague o bloco do slider de memória, de `await click('.settingsNavItem[rsc="settingsTabJava"]')` até `assert.equal(await run(\`settingsMaxRAMRange.tabIndex\`), 0)` (9 linhas). Mantenha a linha `await click('#settingsMediaButton')` que vem antes dele.

- [ ] **Step 7: Lint, conferir e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/mods.js app/assets/js/scripts/settings.js scripts/verify-visual.cjs`
Run: `npm run verify:visual`
Expected: sem `QA FAILED`.

```bash
git add app/assets/js/scripts/settings.js app/settings.ejs app/mods.ejs app/assets/js/scripts/mods.js app/assets/css/forja.css scripts/verify-visual.cjs
git commit -m "Move game settings into the profile editor"
```

# Fase 4 — Limpeza

### Task 15: Tirar a aba Mods das configurações

**Files:**
- Modify: `app/settings.ejs`
- Modify: `app/assets/js/scripts/settings.js`
- Modify: `app/assets/js/scripts/forja.js`
- Modify: `app/assets/css/forja.css`
- Modify: `scripts/verify-visual.cjs`
- Delete: `app/assets/js/dropinmodutil.js`

- [ ] **Step 1: Marcação (`settings.ejs`)**

Apague o botão:

```html
                    <button class="settingsNavItem" rSc="settingsTabMods"><%- lang('settings.navMods') %></button>
```

Apague o bloco `<div id="settingsTabMods" class="settingsTab" style="display: none;">` inteiro, até o `</div>` que o fecha (logo antes de `<div id="settingsTabLauncher"`).

- [ ] **Step 2: Código (`settings.js`)**

Apague estas linhas do topo:

```js
const DropinModUtil = require('./assets/js/dropinmodutil')
```
```js
const loggerModrinth = LoggerUtil.getLogger('Modrinth')
```

Troque `fullSettingsSave` por:

```js
function fullSettingsSave() {
    saveSettingsValues()
    ConfigManager.save()
}
```

Em `prepareSettings`, troque:

```js
    if (first) {
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
    } else {
        await prepareModsTab()
    }
```

por:

```js
    if (first) {
        setupSettingsTabs()
        initSettingsValidators()
        prepareUpdateTab()
    }
```

Apague a seção inteira que começa no comentário

```js
/**
 * Mods Tab
 */
```

e termina no fim da função `prepareModsTab`, **exceto** a função `animateSettingsTabRefresh`, que `landing.js` usa: copie-a antes e cole-a de volta no mesmo lugar. Concretamente, saem: `settingsModsContainer`, `resolveModsForUI`, `parseModulesForUI`, `bindModsToggleSwitch`, `saveModConfiguration`, `_saveModConfiguration`, `CACHE_SETTINGS_MODS_DIR`, `CACHE_DROPIN_MODS`, `resolveDropinModsForUI`, `bindDropinModsRemoveButton`, `bindDropinModFileSystemButton`, `saveDropinModConfiguration`, o listener de F5, `reloadDropinMods`, toda a seção "Modrinth" (`modrinthState` … `prepareModrinthBrowser`), toda a seção "Shaderpack" (`CACHE_SETTINGS_INSTANCE_DIR` … `bindShaderpackButton`), `loadSelectedServerOnModsTab`, o laço que liga `settingsSwitchServerButton`, `saveAllModConfigurations` e `prepareModsTab`.

Confira: `grep -n "DropinModUtil\|modrinthState\|prepareModsTab\|CACHE_SHADERPACKS\|settingsModsContainer" app/assets/js/scripts/settings.js` não imprime nada, e `grep -n "function animateSettingsTabRefresh" app/assets/js/scripts/settings.js` imprime uma linha.

- [ ] **Step 3: `forja.js`**

Em `app/assets/js/scripts/forja.js`, apague o código do combobox de shaders: as declarações `const shaders = …` e `const options = …`, as linhas `shaders.tabIndex …`/`shaders.setAttribute(…)`/`options.setAttribute(…)`, dentro de `syncControls` as linhas que usam `shaders`/`options` (incluindo o laço `for (const option of options.children)`), e os dois listeners `shaders.addEventListener('keydown', …)` e `options.addEventListener('keydown', …)`. Mantenha em `syncControls` só o cálculo de `inDialog` e o laço dos `.rangeSlider`.

Confira: `grep -n "shaders\|settingsShaders" app/assets/js/scripts/forja.js` não imprime nada.

- [ ] **Step 4: CSS**

Em `forja.css`, apague o bloco que começa em `/* Modrinth mod browser (settings > Mods). */` até a última regra `.settingsModrinth…` (a busca antiga das configurações).

- [ ] **Step 5: Teste visual**

Em `scripts/verify-visual.cjs`, troque:

```js
    for (const tab of ['Account', 'Minecraft', 'Mods', 'Launcher', 'About', 'Update']) {
```

por:

```js
    for (const tab of ['Account', 'Minecraft', 'Launcher', 'About', 'Update']) {
```

Apague o bloco do shader, de `await click('.settingsNavItem[rsc="settingsTabMods"]')` até `assert.equal(await run(\`document.getElementById('settingsShadersOptions').hasAttribute('hidden')\`), true)` (o segundo, depois do Escape). Na lista `checks` do `console.log` final, troque `'all seven settings tabs'` por `'all five settings tabs'` e `'keyboard RAM slider and shader selection'` por `'Escape on settings'`.

- [ ] **Step 6: Apagar o módulo antigo**

Run: `git rm app/assets/js/dropinmodutil.js`
Run: `grep -rn "dropinmodutil\|DropinModUtil" app/ index.js` → não imprime nada.

- [ ] **Step 7: Lint, conferir e commit**

Run: `npx eslint --rule '@stylistic/linebreak-style: off' app/assets/js/scripts/settings.js app/assets/js/scripts/forja.js scripts/verify-visual.cjs`
Run: `npm test`
Run: `npm run verify:visual`
Expected: lint sem saída, testes PASS, visual sem `QA FAILED`.

```bash
git add -A app/settings.ejs app/assets/js/scripts/settings.js app/assets/js/scripts/forja.js app/assets/css/forja.css scripts/verify-visual.cjs app/assets/js/dropinmodutil.js
git commit -m "Remove the old Mods tab from settings"
```

# Fase 5 — Verificação

### Task 16: Teste da tela de mods no Electron

**Files:**
- Create: `scripts/verify-mods.cjs`
- Modify: `package.json` (script `verify:mods`)
- Modify: `electron-builder.yml` (não empacotar o teste)

- [ ] **Step 1: Script npm e empacotamento**

Em `package.json`, depois de `"verify:visual"`:

```json
    "verify:mods": "electron scripts/verify-mods.cjs",
```

Em `electron-builder.yml`, na lista `files`, depois de `- '!scripts/verify-visual.cjs'`:

```yaml
  - '!scripts/verify-mods.cjs'
  - '!test/**'
  - '!app/.mods-qa.html'
```

- [ ] **Step 2: Escrever o teste**

Crie `scripts/verify-mods.cjs`:

```js
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
const trashed = []

// index.js is not loaded here, so stand in for its trash handler without touching the real recycle bin.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (_event, target) => {
    trashed.push(target)
    fs.rmSync(target, { recursive: true, force: true })
    return { result: true }
})

app.whenReady().then(async () => {
    const fake = await Fake.start()
    process.env.OBLYVIUM_MODRINTH_API = fake.api

    const preload = path.join(output, 'preload.cjs')
    fs.writeFileSync(preload, `
const root = ${JSON.stringify(root)};
const C = require(root + '/app/assets/js/configmanager');
C.load();
C.addMojangAuthAccount('00000000000000000000000000000001', 'token', 'ModsQA', 'ModsQA');
C.setSelectedAccount('00000000000000000000000000000001');
require(root + '/app/assets/js/langloader').setupLanguage();
const api = require(root + '/app/assets/js/distromanager').DistroAPI;
const {HeliosDistribution} = require(root + '/node_modules/helios-core/dist/common/distribution/DistributionFactory.js');
const artifact = { size: 1, MD5: '0', url: 'http://127.0.0.1/x.jar' };
const raw = { version: '1.0.0', servers: [{
    id: 'mods-qa', name: 'Servidor de teste', description: 'QA', icon: '', address: '127.0.0.1:25565',
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
C.setSelectedServer('mods-qa');
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
    const run = code => win.webContents.executeJavaScript(code)
    const waitFor = async (expr, label, ms = 20000) => {
        const start = Date.now()
        while(!(await run(expr))){
            if(Date.now() - start > ms) throw new Error('Timeout: ' + label)
            await pause(100)
        }
    }
    const screenshot = async name => {
        await run('document.fonts.ready')
        await win.webContents.capturePage()
        await pause(80)
        fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
    }
    const noOverflow = async label => {
        const overflow = await run(`Array.from(document.querySelectorAll('#modsContainer button, #modsContainer input, #modsContainer select, #modsContainer h1')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(e => e.id || e.className)`)
        assert.deepEqual(overflow, [], label + ': controls outside viewport')
    }
    const titleRow = title => `[...document.querySelectorAll('#modsSearchResults .mods-row')].find(r => r.querySelector('.mods-row-title').textContent === ${JSON.stringify(title)})`
    const instanceDir = path.join(output, 'appdata', '.OblyviumLauncher', 'instances')
    const padraoMods = path.join(instanceDir, 'mods-qa', 'mods')

    try {
        await win.loadFile(fixture)
        await run('$.fx.off = true')
        await run('syncModConfigurations(DistroAPI.distribution); ensureJavaSettings(DistroAPI.distribution); showMainUI(DistroAPI.distribution)')
        await pause(1500)
        await run(`$('#main > div').hide(); $('#overlayContainer, #loadingContainer').hide(); $('#main').show(); currentView = VIEWS.landing; $(currentView).show();`)

        // Landing: profile selector
        const landingOptions = await run(`[...document.getElementById('profile_selection').options].map(o => o.text)`)
        assert.deepEqual(landingOptions, ['Padrão', '+ Novo perfil…'])
        await screenshot('landing')

        // Mods screen, installed tab
        await run(`document.getElementById('modsMediaButton').click()`)
        await waitFor(`getCurrentView() === VIEWS.mods`, 'mods view')
        assert.equal(await run(`modsProfileName.textContent`), 'Padrão')
        await waitFor(`modsInstalledStatus.textContent.includes('Nenhum mod seu')`, 'empty installed')
        assert.equal(await run(`modsPackSummary.textContent`), 'Mods do pack (2) 🔒')
        await run(`modsPackGroup.open = true`)
        await screenshot('mods-installed-empty')

        // Optional pack mod off, saved for the default profile
        await run(`[...document.querySelectorAll('#modsPackList input[type=checkbox]')][0].click()`)
        assert.equal(await run(`ConfigManager.getModConfiguration('mods-qa').mods['com.exemplo:opcional']`), false)

        // Explore: blocked hidden, categories translated
        await run(`modsTabExplore.click()`)
        await waitFor(`modsSearchResults.childElementCount > 0`, 'search results')
        const titles = await run(`[...document.querySelectorAll('#modsSearchResults .mods-row-title')].map(e => e.textContent)`)
        assert.ok(!titles.includes('Sodium'), 'blocked project is hidden')
        await waitFor(`modsCategoryList.textContent.includes('Utilidade')`, 'categories')
        await screenshot('mods-explore')

        // Install Mapa
        await run(`${titleRow('Mapa')}.querySelector('.mods-btn-primary').click()`)
        await waitFor(`${titleRow('Mapa')}.querySelector('.mods-badge-success') != null`, 'Mapa installed')
        assert.ok(fs.existsSync(path.join(padraoMods, 'mapa-1.0.jar')))

        // Iris needs Sodium, which is blocked
        await run(`${titleRow('Iris')}.querySelector('.mods-btn-primary').click()`)
        await waitFor(`${titleRow('Iris')}.querySelector('.mods-row-status').textContent.includes('proibido')`, 'Iris blocked')
        assert.ok(!fs.existsSync(path.join(padraoMods, 'iris-2.0.jar')))
        await screenshot('mods-blocked-dependency')

        // Project page: sanitised description
        await run(`${titleRow('Iris')}.querySelector('.mods-row-title').click()`)
        await waitFor(`!modsPanelProject.hidden && modsProject.querySelector('.mods-project-body') != null`, 'project page')
        assert.equal(await run(`window.__xss`), undefined)
        assert.equal(await run(`modsProject.querySelector('script, [onerror], iframe')`), null)
        assert.equal(await run(`[...modsProject.querySelectorAll('.mods-project-body a')].map(a => a.getAttribute('href')).join('|')`), 'https://example.com|')
        assert.ok((await run(`modsProject.textContent`)).includes('proibido'))
        await screenshot('mods-project')
        await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        assert.equal(await run(`modsPanelExplore.hidden`), false)
        assert.ok(await run(`modsSearchResults.childElementCount > 0`), 'search kept after back')

        // Update: old Iris dropped in by hand
        fs.writeFileSync(path.join(padraoMods, 'iris-1.0.jar'), fake.files['iris-1.0.jar'].buf)
        await run(`modsTabInstalled.click()`)
        await waitFor(`[...document.querySelectorAll('#modsInstalledList .mods-btn-primary')].some(b => b.textContent === 'Atualizar para 2.0')`, 'update button')
        await screenshot('mods-update')
        await run(`[...document.querySelectorAll('#modsInstalledList .mods-btn-primary')].find(b => b.textContent === 'Atualizar para 2.0').click()`)
        await waitFor(`!modsInstalledList.textContent.includes('Atualizar para')`, 'updated')
        assert.ok(fs.existsSync(path.join(padraoMods, 'iris-2.0.jar')))
        assert.ok(!fs.existsSync(path.join(padraoMods, 'iris-1.0.jar')))

        // Disable Mapa
        await run(`[...document.querySelectorAll('#modsInstalledList .mods-row')].find(r => r.textContent.includes('Mapa')).querySelector('input[type=checkbox]').click()`)
        await waitFor(`require('fs').existsSync(${JSON.stringify(path.join(padraoMods, 'mapa-1.0.jar.disabled'))})`, 'Mapa disabled')

        // Resource pack: install and enable
        await run(`document.querySelector('.mods-types [data-type="resourcepack"]').click()`)
        await run(`modsTabExplore.click()`)
        await waitFor(`${titleRow('Pacote')} != null`, 'resource pack result')
        await run(`${titleRow('Pacote')}.querySelector('.mods-btn-primary').click()`)
        await waitFor(`${titleRow('Pacote')}.querySelector('.mods-badge-success') != null`, 'pack installed')
        await run(`modsTabInstalled.click()`)
        await waitFor(`document.querySelector('#modsInstalledList input[type=checkbox]') != null`, 'pack listed')
        await run(`document.querySelector('#modsInstalledList input[type=checkbox]').click()`)
        const optionsFile = path.join(instanceDir, 'mods-qa', 'options.txt')
        await waitFor(`require('fs').existsSync(${JSON.stringify(optionsFile)}) && require('fs').readFileSync(${JSON.stringify(optionsFile)}, 'utf8').includes('file/pacote-1.0.zip')`, 'pack enabled')
        await run(`document.querySelector('.mods-types [data-type="mod"]').click()`)

        // Create profile
        await run(`modsProfileSelect.value = '__novo__'; modsProfileSelect.dispatchEvent(new Event('change'))`)
        await waitFor(`!modsPanelEdit.hidden`, 'editor open')
        await run(`modsEditSave.click()`)
        assert.equal(await run(`modsEditNameError.textContent`), 'Use de 1 a 32 caracteres.')
        await screenshot('mods-editor-create')
        await run(`modsEditName.value = 'Leve'; document.querySelector('input[name=modsEditIcon][value=livro]').click(); modsEditCopyFrom.value = 'padrao'; modsEditSave.click()`)
        await waitFor(`modsProfileName.textContent === 'Leve'`, 'profile created')
        const leveId = await run(`ProfileManager.getSelected('mods-qa').id`)
        assert.notEqual(leveId, 'padrao')
        await waitFor(`modsInstalledStatus.textContent.includes('Nenhum mod seu')`, 'new profile is empty')
        assert.ok(fs.existsSync(path.join(instanceDir, '.perfis', leveId, 'mods-qa', 'options.txt')), 'settings copied')

        // Edit profile: invalid width blocks saving; RAM and width saved per profile
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden && !modsEditGame.hidden`, 'editor edit mode')
        await run(`settingsGameWidth.value = '-1'; settingsGameWidth.dispatchEvent(new KeyboardEvent('keyup', { key: '1', bubbles: true }))`)
        assert.equal(await run(`modsEditSave.disabled`), true)
        assert.equal(await run(`settingsGameWidth.getAttribute('aria-invalid')`), 'true')
        await screenshot('mods-editor-invalid')
        await run(`settingsGameWidth.value = '1600'; settingsGameWidth.dispatchEvent(new KeyboardEvent('keyup', { key: '1', bubbles: true }))`)
        assert.equal(await run(`modsEditSave.disabled`), false)
        const ramBefore = await run(`Number(settingsMaxRAMRange.getAttribute('value'))`)
        await run(`settingsMaxRAMRange.focus()`)
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RIGHT' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RIGHT' })
        await pause(100)
        assert.ok(await run(`Number(settingsMaxRAMRange.getAttribute('value'))`) > ramBefore, 'RAM slider moved')
        await screenshot('mods-editor-game')
        await run(`modsEditSave.click()`)
        await waitFor(`modsPanelEdit.hidden`, 'editor closed')
        const leveKey = `mods-qa@${leveId}`
        assert.equal(await run(`ConfigManager.getProfileGameWidth(${JSON.stringify(leveKey)})`), 1600)
        assert.notEqual(await run(`ConfigManager.getProfileGameWidth('mods-qa')`), 1600)
        assert.notEqual(await run(`ConfigManager.getMaxRAM(${JSON.stringify(leveKey)})`), await run(`ConfigManager.getMaxRAM('mods-qa')`))

        // Duplicate, then delete the copy
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden`, 'editor reopened')
        await run(`modsEditDuplicate.click()`)
        await waitFor(`modsProfileName.textContent === 'Leve (cópia)'`, 'duplicated')
        await run(`modsEditProfile.click()`)
        await waitFor(`!modsPanelEdit.hidden && !modsEditDelete.hidden`, 'delete available')
        await run(`modsEditDelete.click()`)
        await waitFor(`isOverlayVisible()`, 'delete confirmation')
        await screenshot('mods-delete-confirm')
        await run(`overlayAcknowledge.click()`)
        await waitFor(`modsProfileName.textContent === 'Padrão'`, 'back to default after delete')
        assert.deepEqual(await run(`ProfileManager.list('mods-qa').map(p => p.name)`), ['Padrão', 'Leve'])
        assert.equal(trashed.length, 1)
        assert.ok(trashed[0].includes(path.join('instances', '.perfis')), 'only the profile folder goes to the trash')

        // Narrow window
        win.setSize(800, 600)
        await pause(200)
        await noOverflow('800x600')
        await screenshot('mods-800')
        win.setSize(1100, 700)

        // Escape closes the screen; landing lists the profiles
        await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
        await waitFor(`getCurrentView() === VIEWS.landing`, 'back to landing')
        assert.deepEqual(await run(`[...document.getElementById('profile_selection').options].map(o => o.text)`), ['Padrão', 'Leve', '+ Novo perfil…'])

        // Launch-time blocklist check on the default profile
        fs.writeFileSync(path.join(padraoMods, 'sodium-1.0.jar'), fake.files['sodium-1.0.jar'].buf)
        await run(`disableBlockedContent(DistroAPI.distribution.getServerById('mods-qa'), ${JSON.stringify(path.join(instanceDir, 'mods-qa'))}, console)`)
        assert.ok(fs.existsSync(path.join(padraoMods, 'sodium-1.0.jar.disabled')))
        assert.equal(await run(`overlayTitle.textContent`), 'Conteúdo Proibido Desativado')
        await screenshot('launch-blocked')

        assert.deepEqual(errors, [], 'renderer errors')
        console.log(JSON.stringify({ result: 'PASS', output }, null, 2))
    } catch(err) {
        console.error('QA FAILED', err)
        process.exitCode = 1
    } finally {
        await fake.close()
        fs.rmSync(fixture, { force: true })
        app.quit()
    }
})
```

- [ ] **Step 3: Rodar**

Run: `npm run verify:mods`
Expected: imprime `"result": "PASS"`. Abra as capturas em `%TEMP%\oblyvium-mods-qa\` e confira: contraste legível, nada cortado, ícones de perfil reconhecíveis, aviso de proibido visível na linha do mod.

Se uma etapa falhar, corrija o código da tarefa correspondente, não o teste, a não ser que o teste esteja errado sobre o comportamento combinado no spec.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-mods.cjs package.json electron-builder.yml
git commit -m "Add Electron verification for profiles and the mods screen"
```

### Task 17: Conferência final contra a Modrinth real e documentação

**Files:**
- Modify: `docs/forja-launcher.md`

- [ ] **Step 1: Tudo verde**

Run: `npm test && npm run verify:visual && npm run verify:mods`
Expected: os três passam.

- [ ] **Step 2: Modrinth de verdade**

Run:

```bash
node -e "
const M = require('./app/assets/js/modrinth');
const fs = require('fs-extra'); const os = require('os'); const path = require('path');
const t = { gameVersion: '1.20.1', loader: 'forge' };
(async () => {
  const r = await M.search({ query: 'appleskin', type: 'mod' }, t, new Set(), new Set());
  console.log('busca:', r.hits.slice(0, 3).map(h => h.slug));
  console.log('categorias:', (await M.getCategories('mod')).length);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'real-'));
  console.log('instalado:', await M.install('appleskin', t, dir, new Set(), new Set(), new Set()));
  const shaders = await M.search({ type: 'shader' }, t, new Set(), new Set());
  console.log('shaders:', shaders.hits.slice(0, 3).map(h => h.slug));
})().catch(e => { console.error('FALHOU', e); process.exit(1) })"
```

Expected: `busca` contém `appleskin`; `categorias` maior que 10; `instalado` lista um `.jar` do AppleSkin; `shaders` lista três slugs.

- [ ] **Step 3: Documentação**

Em `docs/forja-launcher.md`, substitua a seção `## Mods da Modrinth` inteira por:

````markdown
## Perfis e tela de mods

Cada servidor tem perfis. O **Padrão** usa a pasta de jogo de sempre (`instances/<servidor>`); perfis novos ficam em `instances/.perfis/<id>/<servidor>`. Cada perfil tem os próprios mods, resource packs, shaders, `options.txt`, teclas, mundos, memória, Java, argumentos da JVM, resolução e mods opcionais do pack. Os mods obrigatórios do pack ficam em `common/` e não são baixados de novo por perfil.

O jogador escolhe o perfil ao lado do servidor, na tela principal, e abre a tela **Mods** pelo botão no topo. Nela há:

- **Instalados:** mods, resource packs e shaders do perfil, com ligar/desligar, remover e atualizar; o grupo "Mods do pack" mostra o que a staff mantém.
- **Explorar:** busca na Modrinth filtrada pela versão e pelo loader do servidor, com categorias e página de cada projeto. A descrição do projeto passa por limpeza de HTML antes de aparecer.
- **Editar perfil:** nome, ícone, ajustes de jogo, duplicar e excluir (a pasta vai para a lixeira).

A staff proíbe projetos no `distribution.json`, na entrada de cada servidor, por slug ou ID da Modrinth:

```json
{
    "id": "oblyvium-1.20.1",
    "modrinth": {
        "blocked": ["xaeros-minimap", "freecam", "AANobbMI"]
    }
}
```

Proibidos e suas dependências não aparecem nem instalam. Antes de abrir o jogo, o launcher identifica pelo hash o conteúdo ativo do perfil e desativa o que estiver proibido, avisando o jogador. Se a Modrinth estiver fora do ar, o jogo abre sem a checagem.

Limites: só arquivos publicados na Modrinth são reconhecidos; um jar modificado ou de outro site passa pela checagem. A lista é uma barreira de conveniência; anticheat de verdade fica no servidor.

Testes: `npm test` (módulos de perfis, conteúdo e Modrinth, contra uma Modrinth falsa local) e `npm run verify:mods` (tela no Electron, com capturas em `%TEMP%\oblyvium-mods-qa`).
````

- [ ] **Step 4: Commit**

```bash
git add docs/forja-launcher.md
git commit -m "Document profiles and the mods screen"
```

