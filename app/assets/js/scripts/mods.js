/**
 * Script for mods.ejs: the profile screen, with installed content, Modrinth
 * search, project pages and the profile editor.
 *
 * Globals from other scripts: ConfigManager, DistroAPI, ProfileManager,
 * Modrinth, ContentManager, Type (uibinder.js); Lang, LoggerUtil, shell
 * (uicore.js); switchView, getCurrentView, VIEWS (uibinder.js);
 * renderProfileSelection (landing.js); toggleServerSelection (overlay.js).
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

// True while openModsView is doing its async setup, to ignore re-entrant calls.
let modsOpening = false

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
        modsState.updates = new Map()
        modsState.installed = []
        modsEl('modsSearchQuery').value = ''
        modsState.installedRequest++
        modsState.search.request++
        modsState.projectRequest++
        modsSetType(modsState.target.loader == null ? 'resourcepack' : 'mod', false)
        modsRenderHeader()
        modsShowTab('installed')
        switchView(getCurrentView(), VIEWS.mods)
        if(createProfile && typeof modsOpenEditor === 'function'){
            modsOpenEditor('create')
        }
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
        modsCloseEditor()
    } else if(modsState.tab === 'project'){
        modsShowTab('explore', false)
        modsEl('modsTabExplore').focus()
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
