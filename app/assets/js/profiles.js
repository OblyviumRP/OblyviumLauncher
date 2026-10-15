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
