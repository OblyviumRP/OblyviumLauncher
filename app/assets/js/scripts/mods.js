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
