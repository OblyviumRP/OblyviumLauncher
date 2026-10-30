/**
 * One-time move from versioned server ids (oblyvium-26.3) to fixed ones (oblyvium).
 *
 * The game folder is named after the server id, so a new id per Minecraft
 * version used to open the game in an empty folder: the player's mods, worlds,
 * packs and profiles stayed behind in the old one.
 */
const fs        = require('fs-extra')
const path      = require('path')
const Profiles  = require('./profiles')

const VERSIONED = /^(.+)-(\d+(?:\.\d+)*)$/

exports.VERSION_FILE = '.versao-minecraft'

function compareVersions(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for(let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if(d !== 0) {
            return d
        }
    }
    return 0
}

function nextFree(base) {
    let dir = base
    for(let i = 2; fs.existsSync(dir); i++) {
        dir = `${base}-${i}`
    }
    return dir
}

function renameKey(obj, from, to) {
    if(obj != null && Object.prototype.hasOwnProperty.call(obj, from)) {
        obj[to] = obj[from]
        delete obj[from]
    }
}

/**
 * For each fixed id in the distribution, take the newest "<id>-<version>" the
 * player has played and move it over: every profile's game folder, the
 * profiles, Java, game and optional-mod settings, and the selected server.
 * Skipped once the fixed id has a game folder made by this launcher (it has
 * VERSION_FILE) or profiles of its own. A folder without VERSION_FILE was made
 * by an older launcher that already saw the fixed id: it is kept beside, as
 * "<id>.antes-da-migracao", and the player's real folder takes its place.
 *
 * Each moved folder gets VERSION_FILE with the old Minecraft version (the id
 * suffix), so mods added for it are disabled if the server moved on.
 *
 * @param {Object} config The loaded configuration (changed in place).
 * @param {string[]} serverIds Server ids in the distribution.
 * @param {string} instanceDir The instances folder.
 * @returns {{from: string, to: string}[]} What was moved.
 */
exports.migrateVersionedIds = function(config, serverIds, instanceDir) {
    const store = config.profiles ?? {}
    const done = []
    for(const to of serverIds) {
        const own = store[to]?.list
        const target = path.join(instanceDir, to)
        if(fs.existsSync(path.join(target, exports.VERSION_FILE)) || (Array.isArray(own) && own.some(p => p?.id !== Profiles.DEFAULT_ID))) {
            continue
        }
        const from = Object.keys(store)
            .map(id => ({ id, m: VERSIONED.exec(id) }))
            .filter(({ id, m }) => m != null && m[1] === to && !serverIds.includes(id))
            .filter(({ id }) => Profiles.listProfiles(store, id).some(p => fs.existsSync(Profiles.gameDir(instanceDir, id, p.id))))
            .sort((a, b) => compareVersions(b.m[2], a.m[2]))[0]
        if(from == null) {
            continue
        }
        const profiles = Profiles.listProfiles(store, from.id)

        const moved = []
        const aside = fs.existsSync(target) ? nextFree(`${target}.antes-da-migracao`) : null
        try {
            if(aside != null) {
                fs.renameSync(target, aside)
            }
            for(const p of profiles) {
                const src = Profiles.gameDir(instanceDir, from.id, p.id)
                const dst = Profiles.gameDir(instanceDir, to, p.id)
                if(fs.existsSync(src) && !fs.existsSync(dst)) {
                    fs.renameSync(src, dst)
                    moved.push([src, dst])
                }
            }
        } catch(err) {
            // A folder in use (game still open) cannot be renamed: undo and try again next time.
            for(const [src, dst] of moved.reverse()) {
                fs.renameSync(dst, src)
            }
            if(aside != null && fs.existsSync(aside)) {
                fs.renameSync(aside, target)
            }
            throw err
        }
        for(const p of profiles) {
            const oldKey = Profiles.configKey(from.id, p.id)
            const newKey = Profiles.configKey(to, p.id)
            renameKey(config.javaConfig, oldKey, newKey)
            renameKey(config.gameConfig, oldKey, newKey)
            config.modConfigurations = (config.modConfigurations ?? [])
                .filter(c => c.id !== newKey)
                .map(c => c.id === oldKey ? { ...c, id: newKey } : c)
        }
        store[to] = store[from.id]
        delete store[from.id]
        if(config.selectedServer === from.id) {
            config.selectedServer = to
        }
        for(const [, dst] of moved) {
            try {
                fs.writeFileSync(path.join(dst, exports.VERSION_FILE), from.m[2], { flag: 'wx' })
            } catch {
                // Already there, or not writable: the mods are then left as they are.
            }
        }
        done.push({ from: from.id, to })
    }
    return done
}
