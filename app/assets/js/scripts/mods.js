/**
 * Script for mods.ejs: the profile screen, with installed content, Modrinth
 * search, project pages and the profile editor.
 *
 * Globals from other scripts: ConfigManager, DistroAPI, ProfileManager,
 * Modrinth, ContentManager, Type, path (uibinder.js); Lang, LoggerUtil, shell,
 * ipcRenderer (uicore.js); switchView, getCurrentView, VIEWS (uibinder.js);
 * renderProfileSelection, escapeHtml (landing.js); toggleServerSelection,
 * setOverlayContent, setOverlayHandler, setDismissHandler, toggleOverlay
 * (overlay.js); initSettingsValidators, initSettingsValues, saveSettingsValues,
 * prepareJavaTab (settings.js, loaded after this script but only called on
 * user action).
 */
const modsFs         = require('fs-extra')
const RichText       = require('./assets/js/richtext')
const ProfileIcons   = require('./assets/js/profileicons')
const { SHELL_OPCODE } = require('./assets/js/ipcconstants')

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
    updatingAll: false,
    installedRequest: 0,
    search: { query: '', sort: 'relevance', categories: new Set(), offset: 0, request: 0, lastKey: null },
    projectRequest: 0,
    editing: null
}

// Each tab registers { show() } here (Tasks 12 and 13).
const modsPanels = {}

// True while openModsView is doing its async setup, to ignore re-entrant calls.
let modsOpening = false

// The search result element that opened the current project page (Task 13),
// so leaving it can restore focus there instead of always landing on the tab.
let modsProjectOrigin = null

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
        case 'DESTINATION_EXISTS':
            return Lang.queryJS('mods.error.destinationExists')
        case 'BAD_FILENAME':
            return Lang.queryJS('mods.error.badFile')
        case 'UNSUPPORTED_TYPE':
            return Lang.queryJS('mods.error.unsupported')
        case 'ENOENT':
        case 'ENOSPC':
            return Lang.queryJS('mods.error.disk')
        case 'EBUSY':
        case 'EPERM':
        case 'EACCES':
            return Lang.queryJS('mods.error.fileInUse')
        case 'ENOTFOUND':
        case 'ETIMEDOUT':
        case 'ECONNREFUSED':
        case 'ECONNRESET':
        case 'EAI_AGAIN':
            return Lang.queryJS('mods.error.offline')
    }
    if(err?.name === 'RequestError' || err?.name === 'TimeoutError' || err?.name === 'HTTPError'){
        return Lang.queryJS('mods.error.offline')
    }
    return Lang.queryJS('mods.error.generic')
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
    const modTypeBtn = document.querySelector('.mods-types [data-type="mod"]')
    modTypeBtn.disabled = modsState.target.loader == null
    modTypeBtn.title = modTypeBtn.disabled ? 'Este servidor não usa Forge nem Fabric.' : ''
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
    modsState.updates = new Map()
    modsState.installed = []
    modsState.installedRequest++
    modsRenderHeader()
    modsShowTab(modsState.tab === 'project' ? 'explore' : modsState.tab)
}

/**
 * Open the mods screen for the selected server and profile.
 *
 * @param {{createProfile?: boolean}} options createProfile opens the profile editor in create mode.
 */
async function openModsView({ createProfile = false } = {}){
    if(getCurrentView() === VIEWS.mods && !createProfile){
        return
    }
    if(modsOpening){
        return
    }
    modsOpening = true
    try {
        const distro = await DistroAPI.getDistribution()
        const serverId = ConfigManager.getSelectedServer()
        const serv = serverId != null && serverId !== 'SELECT' ? distro.getServerById(serverId) : null
        if(serv == null){
            await toggleServerSelection(true)
            return
        }
        modsState.serverId = serverId
        modsState.serv = serv
        modsState.profileId = ProfileManager.getSelected(serverId).id
        modsState.target = Modrinth.getServerTarget(modsState.serv)
        modsState.blocklist = Modrinth.getBlocklist(modsState.serv)
        modsState.packProjects = null
        modsState.installedProjects = null
        modsState.search.query = ''
        modsState.search.offset = 0
        modsState.search.lastKey = null
        modsState.updates = new Map()
        modsState.installed = []
        modsEl('modsSearchQuery').value = ''
        modsState.installedRequest++
        modsState.search.request++
        modsState.projectRequest++
        modsSetType(modsState.target.loader == null ? 'resourcepack' : 'mod', false)
        modsRenderHeader()
        modsShowTab('installed')
        const openEditor = createProfile && typeof modsOpenEditor === 'function'
        if(openEditor){
            await modsOpenEditor('create')
        }
        if(getCurrentView() === VIEWS.mods){
            return
        }
        // The screen is still hidden here, so the editor's name field can only
        // take focus once it has faded in. switchView leaves focus alone when
        // onNextFade already put it inside the new view.
        switchView(getCurrentView(), VIEWS.mods, 180, 180, () => {}, () => {
            if(openEditor && modsState.editing != null){
                modsEl('modsEditName').focus()
            }
        })
    } catch(err) {
        loggerMods.error('Could not open the mods screen.', err)
    } finally {
        modsOpening = false
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
    if(e.target.matches('input[type=search]') && e.target.value !== ''){
        return
    }
    e.preventDefault()
    if(modsState.editing != null && typeof modsCloseEditor === 'function'){
        modsCloseEditor(true)
    } else if(modsState.tab === 'project'){
        modsLeaveProject()
    } else {
        closeModsView()
    }
})

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

    let described
    try {
        described = await ContentManager.describe(gameDir, type)
    } catch(err) {
        loggerMods.error('Could not describe content.', err)
        if(request === modsState.installedRequest){
            modsState.installed = []
            modsRenderInstalled()
            modsSetStatus('modsInstalledStatus', Lang.queryJS('mods.error.disk'))
        }
        return
    }
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

/**
 * Send a profile content file to the trash, disabling it first for types
 * whose state lives outside the file itself (resource packs, shaders) so
 * options.txt/shader configs never keep pointing at a missing file. Falls
 * back to a permanent delete if the trash operation fails.
 */
async function modsRemoveFile(gameDir, type, fileName){
    if(type !== 'mod'){
        await ContentManager.setEnabled(gameDir, type, fileName, false)
    }
    const dest = path.join(ContentManager.folder(gameDir, type), fileName)
    const res = await ipcRenderer.invoke(SHELL_OPCODE.TRASH_ITEM, dest)
    if(!res.result){
        loggerMods.warn('Could not send content to the trash, deleting instead.', res.error)
        await ContentManager.remove(gameDir, type, fileName)
    }
}

function modsInstalledRow(file){
    const { type } = file
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

    const setRowDisabled = disabled => {
        for(const control of row.querySelectorAll('input, button')){
            control.disabled = disabled
        }
    }

    const run = async action => {
        row.setAttribute('busy', '')
        setRowDisabled(true)
        try {
            await action()
            modsState.installedProjects = null
            await modsRefreshInstalled()
        } catch(err) {
            loggerMods.error('Content action failed.', err)
            row.removeAttribute('busy')
            setRowDisabled(false)
            toggleInput.checked = file.enabled
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
            btn.textContent = Lang.queryJS('mods.installed.updating')
            run(() => ContentManager.updateFile(modsGameDir(), type, file.fileName, update))
        }
        actions.appendChild(btn)
    }
    const toggleWrap = modsToggle(
        file.enabled,
        Lang.queryJS(type === 'shader' ? 'mods.installed.useShader' : 'mods.installed.enable', { title }),
        checked => run(() => ContentManager.setEnabled(modsGameDir(), type, file.fileName, checked))
    )
    const toggleInput = toggleWrap.querySelector('input')
    actions.appendChild(toggleWrap)
    const remove = modsText('button', 'mods-btn mods-btn-danger', Lang.queryJS('mods.installed.remove'))
    remove.type = 'button'
    remove.setAttribute('aria-label', Lang.queryJS('mods.installed.removeLabel', { title }))
    remove.onclick = () => run(() => modsRemoveFile(modsGameDir(), type, file.fileName))
    actions.appendChild(remove)

    row.append(modsIcon(file.project?.iconUrl), info, actions)
    if(modsState.updatingAll){
        setRowDisabled(true)
    }
    return row
}

modsEl('modsInstalledFilter').addEventListener('input', modsRenderInstalled)

modsEl('modsUpdateAll').onclick = async () => {
    const btn = modsEl('modsUpdateAll')
    const gameDir = modsGameDir()
    // Snapshot now: the live state (and the rows built from it) will be
    // disabled for the whole bulk run, so nothing here should shift under us.
    const snapshot = modsState.installed
        .filter(f => modsState.updates.has(f.path))
        .map(f => ({ fileName: f.fileName, type: f.type, version: modsState.updates.get(f.path) }))
    btn.disabled = true
    modsState.updatingAll = true
    modsRenderInstalled()
    let failed = 0
    try {
        for(const { fileName, type, version } of snapshot){
            try {
                await ContentManager.updateFile(gameDir, type, fileName, version)
            } catch(err) {
                failed++
                loggerMods.error('Update failed.', err)
            }
        }
    } finally {
        modsState.updatingAll = false
        btn.disabled = false
        await modsRefreshInstalled()
    }
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

/**
 * Mirrors ProcessBuilder.isModEnabled (processbuilder.js) so the pack group
 * shows the same on/off state the launcher will actually use at launch:
 * missing config falls back to the module's declared default, a boolean
 * config is used as-is, and an object config without "value" counts as on.
 */
function modsPackModValue(conf, id, required){
    const modCfg = conf[id]
    if(modCfg == null){
        return Boolean(required.def)
    }
    if(typeof modCfg === 'boolean'){
        return modCfg
    }
    if(typeof modCfg === 'object'){
        return modCfg.value !== undefined ? Boolean(modCfg.value) : true
    }
    return Boolean(required.def)
}

function modsAppendPackModules(parent, mdls, conf, ids, parentActive = true){
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
        const required = mdl.getRequired()
        let active = parentActive
        if(required.value){
            row.appendChild(modsText('span', 'mods-badge', Lang.queryJS('mods.pack.required')))
        } else {
            const value = modsPackModValue(conf, id, required)
            let toggleInput
            const toggleWrap = modsToggle(
                value,
                Lang.queryJS('mods.installed.enable', { title: mdl.rawModule.name }),
                checked => modsSetPackModEnabled([...ids, id], checked, toggleInput)
            )
            toggleInput = toggleWrap.querySelector('input')
            toggleInput.disabled = !parentActive
            row.appendChild(toggleWrap)
            active = parentActive && value
        }
        parent.appendChild(row)
        if(mdl.subModules.length > 0){
            const sub = document.createElement('div')
            sub.className = 'mods-pack-sub'
            parent.appendChild(sub)
            modsAppendPackModules(sub, mdl.subModules, typeof conf[id] === 'object' ? (conf[id].mods ?? {}) : {}, [...ids, id], active)
        }
    }
}

/**
 * Defensively walk/create the mod configuration tree down to `ids` and set
 * the leaf's enabled value, tolerating a missing configuration, a missing
 * intermediate level, or a level that is still a plain boolean from an older
 * save. Reverts the toggle and logs instead of throwing into an event handler.
 */
function modsSetPackModEnabled(ids, enabled, toggleInput){
    try {
        const key = modsConfigKey()
        let cfg = ConfigManager.getModConfiguration(key)
        if(cfg == null){
            cfg = { id: key, mods: {} }
        }
        let level = cfg.mods
        for(const id of ids.slice(0, -1)){
            if(level[id] == null || typeof level[id] !== 'object'){
                level[id] = { value: level[id] ?? true, mods: {} }
            } else if(level[id].mods == null){
                level[id].mods = {}
            }
            level = level[id].mods
        }
        const last = ids[ids.length - 1]
        if(level[last] != null && typeof level[last] === 'object'){
            level[last].value = enabled
        } else {
            level[last] = enabled
        }
        ConfigManager.setModConfiguration(key, cfg)
        ConfigManager.save()
        modsRenderPackGroup()
    } catch(err) {
        loggerMods.error('Could not update the pack mod configuration.', err)
        if(toggleInput != null){
            toggleInput.checked = !enabled
        }
    }
}

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

/**
 * Identifies the search currently reflected by modsState.search (server,
 * profile, type, query, sort, categories). Used to skip a redundant
 * re-search when the Explore tab is merely re-shown with nothing changed —
 * arrow-key tab cycling used to refire a full search on every press.
 */
function modsSearchKey(){
    const s = modsState.search
    return JSON.stringify([modsState.serverId, modsState.profileId, modsState.type, s.query, s.sort, [...s.categories].sort()])
}

function modsPrepareExplore(){
    modsEl('modsSearchQuery').placeholder = Lang.queryJS(`mods.explore.placeholder.${modsState.type}`)
    if(modsSearchKey() === modsState.search.lastKey){
        return
    }
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
        s.lastKey = modsSearchKey()
    } catch(err) {
        if(request !== s.request){
            return
        }
        loggerMods.error('Search failed.', err)
        s.lastKey = null
        modsSetStatus('modsSearchStatus', modsErrorMessage(err), () => modsRunSearch(append))
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
    titleBtn.onclick = () => modsOpenProject(hit.project_id, titleBtn)
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

function modsLeaveProject(){
    modsShowTab('explore', false)
    const origin = modsProjectOrigin
    modsProjectOrigin = null
    if(origin != null && document.contains(origin)){
        origin.focus()
    } else {
        modsEl('modsTabExplore').focus()
    }
}

async function modsOpenProject(projectId, originEl = null){
    modsProjectOrigin = originEl
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
        modsSetStatus('modsProjectStatus', modsErrorMessage(err), () => modsOpenProject(projectId, originEl))
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

modsEl('modsProjectBack').onclick = modsLeaveProject

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
    if(modsState.editing != null){
        modsCloseEditor()
    }
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

    // The editor works on the current profile: switching it underneath would
    // save the fields into the wrong one.
    modsEl('modsProfileSelect').disabled = true
    modsEl('modsBrowse').hidden = true
    document.querySelector('.mods-profile-actions').hidden = true
    modsEl('modsPanelEdit').hidden = false

    if(mode === 'edit'){
        if(!modsEditorState.validatorsBound){
            initSettingsValidators(modsEl('modsEditGame'), modsEditorState, modsSetEditorSaveDisabled)
            modsEditorState.validatorsBound = true
        }
        try {
            await initSettingsValues(modsEl('modsEditGame'), modsConfigKey())
            await prepareJavaTab()
        } catch(err) {
            loggerMods.error('Could not load the profile game settings.', err)
        }
    }
    modsEl('modsEditName').focus()
}

/**
 * @param {boolean} restoreFocus Put focus back on the Edit profile button.
 */
function modsCloseEditor(restoreFocus = false){
    modsState.editing = null
    modsEl('modsPanelEdit').hidden = true
    modsEl('modsBrowse').hidden = false
    document.querySelector('.mods-profile-actions').hidden = false
    modsEl('modsProfileSelect').disabled = false
    modsEditorState.invalid.clear()
    modsSetEditorSaveDisabled(false)
    for(const el of modsEl('modsEditGame').querySelectorAll('[error]')){
        el.removeAttribute('error')
        el.removeAttribute('aria-invalid')
    }
    if(restoreFocus){
        modsEl('modsEditProfile').focus()
    }
}

function modsEditorFailed(key, err){
    loggerMods.error('Profile editor action failed.', err)
    modsEl('modsEditNameError').textContent = Lang.queryJS(key)
}

modsEl('modsEditProfile').onclick = () => modsOpenEditor('edit')
modsEl('modsEditCancel').onclick = () => modsCloseEditor(true)

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
    modsEl('modsEditNameError').textContent = ''
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
        modsEl('modsEditProfile').focus()
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
        modsEl('modsEditProfile').focus()
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
            modsEl('modsEditProfile').focus()
        } catch(err) {
            modsEditorFailed('mods.editor.deleteFailed', err)
        }
    })
    setDismissHandler(() => toggleOverlay(false))
    toggleOverlay(true, true)
}
