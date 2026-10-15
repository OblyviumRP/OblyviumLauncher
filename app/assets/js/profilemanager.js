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
