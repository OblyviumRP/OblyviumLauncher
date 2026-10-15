/**
 * Profiles bound to the launcher configuration. Renderer only.
 * Pure logic lives in profiles.js.
 */
const fs                = require('fs-extra')
const path              = require('path')
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
    if(copyFrom != null && exports.get(serverId, copyFrom) == null){
        throw new Error(`Unknown profile ${copyFrom} for ${serverId}`)
    }
    const profile = Profiles.createProfile(store(), serverId, { name, icon })
    const dstKey = Profiles.configKey(serverId, profile.id)
    try {
        ConfigManager.copyProfileConfig(
            Profiles.configKey(serverId, copyFrom ?? Profiles.DEFAULT_ID),
            dstKey
        )
        if(copyFrom != null){
            await Profiles.copySettingsFiles(exports.getGameDir(serverId, copyFrom), exports.getGameDir(serverId, profile.id))
        }
    } catch(err){
        Profiles.removeProfile(store(), serverId, profile.id)
        ConfigManager.removeProfileConfig(dstKey)
        await fs.remove(exports.getInstanceRoot(profile.id)).catch(() => {})
        throw err
    }
    ConfigManager.save()
    return profile
}

exports.duplicate = async function(serverId, profileId){
    const source = exports.get(serverId, profileId)
    if(source == null){
        throw new Error(`Unknown profile ${profileId} for ${serverId}`)
    }
    const name = `${source.name} (cópia)`.slice(0, 32)
    const profile = Profiles.createProfile(store(), serverId, { name, icon: source.icon })
    const dstKey = Profiles.configKey(serverId, profile.id)
    try {
        ConfigManager.copyProfileConfig(Profiles.configKey(serverId, profileId), dstKey)
        await Profiles.copyGameDir(exports.getGameDir(serverId, profileId), exports.getGameDir(serverId, profile.id))
    } catch(err){
        Profiles.removeProfile(store(), serverId, profile.id)
        ConfigManager.removeProfileConfig(dstKey)
        await fs.remove(exports.getInstanceRoot(profile.id)).catch(() => {})
        throw err
    }
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
 * The folder is trashed before any config state is touched, so a failed
 * trash operation leaves the profile and its settings intact.
 */
exports.remove = async function(serverId, profileId){
    if(profileId === Profiles.DEFAULT_ID){
        throw new Error('The default profile cannot be removed')
    }
    if(exports.get(serverId, profileId) == null){
        throw new Error(`Unknown profile ${profileId} for ${serverId}`)
    }
    const root = path.resolve(exports.getInstanceRoot(profileId))
    const perfisDir = path.resolve(path.join(ConfigManager.getInstanceDirectory(), '.perfis'))
    if(path.dirname(root) !== perfisDir || path.basename(root) !== profileId){
        throw new Error(`Refusing to trash ${root}: not a profile folder`)
    }
    if(await fs.pathExists(root)){
        const res = await ipcRenderer.invoke(SHELL_OPCODE.TRASH_ITEM, root)
        if(!res.result){
            throw res.error
        }
    }
    Profiles.removeProfile(store(), serverId, profileId)
    ConfigManager.removeProfileConfig(Profiles.configKey(serverId, profileId))
    ConfigManager.save()
}
