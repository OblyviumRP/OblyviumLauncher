/**
 * Distribution bookkeeping shared by the renderers, without any DOM.
 *
 * Keeps each profile's optional-mod configuration and Java settings in step
 * with the distribution index, and exposes the modpack mods as a tree the
 * new UI can render. Ported from scripts/uibinder.js and scripts/mods.js.
 */
const { Type } = require('helios-distribution-types')

const OPTIONAL_TYPES = new Set([Type.ForgeMod, Type.LiteMod, Type.LiteLoader, Type.FabricMod])

function isPackMod(mdl){
    return OPTIONAL_TYPES.has(mdl.rawModule.type)
}

/**
 * Recursively scan for optional sub modules. If none are found this returns a
 * boolean, otherwise a recursive configuration object.
 */
function scanOptionalSubModules(mdls, origin){
    if(mdls != null){
        const mods = {}
        for(const mdl of mdls){
            if(!isPackMod(mdl)){
                continue
            }
            if(!mdl.getRequired().value){
                mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
            } else if(mdl.hasSubModules()){
                const v = scanOptionalSubModules(mdl.subModules, mdl)
                if(typeof v === 'object'){
                    mods[mdl.getVersionlessMavenIdentifier()] = v
                }
            }
        }
        if(Object.keys(mods).length > 0){
            const ret = { mods }
            if(!origin.getRequired().value){
                ret.value = origin.getRequired().def
            }
            return ret
        }
    }
    return origin.getRequired().def
}

/**
 * Recursively merge an old configuration into a new one.
 */
function mergeModConfiguration(o, n, nReq = false){
    if(typeof o === 'boolean'){
        if(typeof n === 'boolean') return o
        if(typeof n === 'object'){
            if(!nReq){
                n.value = o
            }
            return n
        }
    } else if(typeof o === 'object' && o != null){
        if(typeof n === 'boolean') return typeof o.value !== 'undefined' ? o.value : true
        if(typeof n === 'object'){
            if(!nReq){
                n.value = typeof o.value !== 'undefined' ? o.value : true
            }
            for(const mod of Object.keys(n.mods)){
                if(o.mods?.[mod] != null){
                    n.mods[mod] = mergeModConfiguration(o.mods[mod], n.mods[mod])
                }
            }
            return n
        }
    }
    return n
}

/**
 * Build the optional mod configuration for a server's modules, keeping the
 * player's previous choices when there are any.
 */
function resolveModConfiguration(mdls, modsOld){
    const mods = {}
    for(const mdl of mdls){
        if(!isPackMod(mdl)){
            continue
        }
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
    return mods
}

/**
 * Same rule as ProcessBuilder.isModEnabled: a missing config falls back to the
 * module's default, a boolean is used as-is, an object without "value" is on.
 */
function packModValue(conf, id, required){
    const modCfg = conf?.[id]
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

/**
 * The modpack mods of a server as a tree, with the state the launcher will use.
 *
 * @returns {Array<{id: string, path: string[], name: string, version: string,
 *   required: boolean, enabled: boolean, available: boolean, children: Array}>}
 */
function packModTree(mdls, conf, ids = [], parentActive = true){
    const out = []
    for(const mdl of mdls){
        if(!isPackMod(mdl)){
            continue
        }
        const id = mdl.getVersionlessMavenIdentifier()
        const required = mdl.getRequired()
        const enabled = required.value ? true : packModValue(conf, id, required)
        const active = parentActive && enabled
        out.push({
            id,
            path: [...ids, id],
            name: mdl.rawModule.name ?? id,
            version: mdl.mavenComponents?.version ?? '',
            required: Boolean(required.value),
            enabled,
            available: parentActive,
            children: mdl.subModules.length > 0
                ? packModTree(mdl.subModules, typeof conf?.[id] === 'object' ? (conf[id].mods ?? {}) : {}, [...ids, id], active)
                : []
        })
    }
    return out
}

function countPackMods(tree){
    return tree.reduce((n, m) => n + 1 + countPackMods(m.children), 0)
}

/**
 * Set one optional mod's value inside a configuration object (mutates cfg).
 * Tolerates missing levels and levels that are still plain booleans.
 */
function setPackModValue(cfg, ids, enabled){
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
    return cfg
}

/* Bound to the launcher configuration (renderer only). */

function managers(){
    return {
        ConfigManager: require('../configmanager'),
        ProfileManager: require('../profilemanager')
    }
}

function syncModConfigurations(distro){
    const { ConfigManager, ProfileManager } = managers()
    ProfileManager.ensureServers(distro.servers.map(s => s.rawServer.id))
    const synced = []
    for(const serv of distro.servers){
        for(const key of ProfileManager.configKeys(serv.rawServer.id)){
            const cfg = ConfigManager.getModConfiguration(key)
            synced.push({ id: key, mods: resolveModConfiguration(serv.modules, cfg?.mods ?? null) })
        }
    }
    ConfigManager.setModConfigurations(synced)
    ConfigManager.save()
}

function ensureJavaSettings(distro){
    const { ConfigManager, ProfileManager } = managers()
    ProfileManager.ensureServers(distro.servers.map(s => s.rawServer.id))
    for(const serv of distro.servers){
        for(const key of ProfileManager.configKeys(serv.rawServer.id)){
            ConfigManager.ensureJavaConfig(key, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
        }
    }
    ConfigManager.save()
}

/** Everything the launcher does after (re)loading the distribution. */
function syncDistribution(distro){
    syncModConfigurations(distro)
    ensureJavaSettings(distro)
}

function getPackMods(serv, configKey){
    const { ConfigManager } = managers()
    return packModTree(serv.modules, ConfigManager.getModConfiguration(configKey)?.mods ?? {})
}

function setPackModEnabled(configKey, ids, enabled){
    const { ConfigManager } = managers()
    const cfg = ConfigManager.getModConfiguration(configKey) ?? { id: configKey, mods: {} }
    setPackModValue(cfg, ids, enabled)
    ConfigManager.setModConfiguration(configKey, cfg)
    ConfigManager.save()
}

module.exports = {
    isPackMod,
    scanOptionalSubModules,
    mergeModConfiguration,
    resolveModConfiguration,
    packModValue,
    packModTree,
    countPackMods,
    setPackModValue,
    syncModConfigurations,
    ensureJavaSettings,
    syncDistribution,
    getPackMods,
    setPackModEnabled
}
