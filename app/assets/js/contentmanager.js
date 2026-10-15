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
        const parsed = JSON.parse(lines[index].slice(PACKS_KEY.length))
        if(!Array.isArray(parsed)) {
            return { index, packs: ['vanilla'] }
        }
        return { index, packs: parsed.filter(p => typeof p === 'string') }
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
        const destPath = path.join(dir, next)
        // fs.rename overwrites silently on Windows; refuse instead of losing a file.
        if(await fs.pathExists(destPath)) {
            throw new Error(`Destination exists: ${next}`)
        }
        await fs.rename(path.join(dir, fileName), destPath)
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
