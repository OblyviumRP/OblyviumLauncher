const fs                    = require('fs-extra')
const got                   = require('got')
const path                  = require('path')
const { LoggerUtil }        = require('helios-core')
const { version }           = require('../../../package.json')
const Modrinth              = require('./modrinth')

const logger = LoggerUtil.getLogger('CurseForge')

const API = process.env.OBLYVIUM_CURSEFORGE_API || 'https://api.oblyvium.com.br/api/launcher/curseforge'
const PAGE_SIZE = Modrinth.PAGE_SIZE
const MAX_RESULTS = 10000
const PREFIX = 'cf:'

const CLASSES = { mod: 6, resourcepack: 12, shader: 6552 }
const LOADERS = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const LOADER_NAMES = { forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge' }
const SORTS = { relevance: 2, downloads: 6, updated: 3, newest: 11 }
const REQUIRED_DEPENDENCY = 3
const RELEASE = 1
const DOWNLOAD_HOST = /(^|\.)forgecdn\.net$/

const http = got.extend({
    prefixUrl: API,
    headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
    responseType: 'json',
    timeout: 15000,
    retry: 1
})

class CurseForgeError extends Modrinth.ModrinthError {
    constructor(code, message, data = {}) {
        super(code, message, data)
        this.source = 'curseforge'
    }
}
exports.CurseForgeError = CurseForgeError

function wrapError(err) {
    if(err instanceof Modrinth.ModrinthError) {
        return err
    }
    if(err?.response?.statusCode === 429) {
        return new CurseForgeError('RATE_LIMITED', 'CurseForge rate limit reached')
    }
    return new CurseForgeError('UNAVAILABLE', err?.message ?? 'CurseForge unavailable')
}

async function getData(url, options) {
    try {
        return (await http.get(url, options).json()).data
    } catch(err) {
        throw wrapError(err)
    }
}

async function postData(url, json) {
    try {
        return (await http.post(url, { json }).json()).data
    } catch(err) {
        throw wrapError(err)
    }
}

exports.isId = function(id) {
    return typeof id === 'string' && id.startsWith(PREFIX)
}

exports.toId = function(modId) {
    return PREFIX + modId
}

function modIdOf(id) {
    const m = /^cf:(\d{1,10})$/.exec(String(id))
    if(m == null) {
        throw new CurseForgeError('NOT_FOUND', `Invalid CurseForge id: ${id}`)
    }
    return Number(m[1])
}

exports.typeOf = function(mod) {
    return Object.keys(CLASSES).find(type => CLASSES[type] === mod.classId) ?? null
}

exports.isBlocked = function(blocklist, mod) {
    return blocklist.has(exports.toId(mod.id)) || blocklist.has(String(mod.slug ?? '').toLowerCase())
}

function isKnown(set, mod) {
    return set.has(exports.toId(mod.id)) || set.has(`slug:${String(mod.slug ?? '').toLowerCase()}`)
}

exports.fingerprint = function(buf) {
    const b = buf.filter(x => x !== 9 && x !== 10 && x !== 13 && x !== 32)
    const len = b.length
    const m = 0x5bd1e995
    let h = (1 ^ len) >>> 0
    let i = 0
    while(len - i >= 4) {
        let k = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)
        k = Math.imul(k, m)
        k ^= k >>> 24
        k = Math.imul(k, m)
        h = Math.imul(h, m) ^ k
        i += 4
    }
    const rest = len - i
    if(rest === 3) {
        h ^= b[i + 2] << 16
    }
    if(rest >= 2) {
        h ^= b[i + 1] << 8
    }
    if(rest >= 1) {
        h ^= b[i]
        h = Math.imul(h, m)
    }
    h ^= h >>> 13
    h = Math.imul(h, m)
    h ^= h >>> 15
    return h >>> 0
}

exports.getMods = async function(modIds) {
    const ids = [...new Set(modIds)]
    if(ids.length === 0) {
        return []
    }
    const out = []
    for(let i = 0; i < ids.length; i += 500) {
        out.push(...await postData('v1/mods', { modIds: ids.slice(i, i + 500) }))
    }
    return out
}

exports.identifyFiles = async function(files) {
    const pathsByPrint = new Map()
    for(const file of files) {
        const print = exports.fingerprint(await fs.readFile(file))
        if(!pathsByPrint.has(print)) {
            pathsByPrint.set(print, [])
        }
        pathsByPrint.get(print).push(file)
    }
    const result = new Map()
    if(pathsByPrint.size === 0) {
        return result
    }
    const prints = [...pathsByPrint.keys()]
    const matches = []
    for(let i = 0; i < prints.length; i += 1000) {
        const res = await postData('v1/fingerprints/432', { fingerprints: prints.slice(i, i + 1000) })
        matches.push(...(res.exactMatches ?? []))
    }
    const mods = new Map((await exports.getMods(matches.map(x => x.id))).map(mod => [mod.id, mod]))
    for(const match of matches) {
        const mod = mods.get(match.id)
        if(mod == null) {
            continue
        }
        for(const file of pathsByPrint.get(match.file.fileFingerprint) ?? []) {
            result.set(file, { mod, file: match.file })
        }
    }
    return result
}

exports.projectIds = async function(files) {
    const found = await exports.identifyFiles(files)
    return [...found.values()].map(x => exports.toId(x.mod.id))
}

exports.search = async function({ query = '', type = 'mod', sort = 'relevance', offset = 0 }, target, blocklist, packProjects) {
    const empty = { hits: [], total: 0, offset, pageSize: PAGE_SIZE }
    if(CLASSES[type] == null || (type === 'mod' && target.loader == null) || offset + PAGE_SIZE > MAX_RESULTS) {
        return empty
    }
    const searchParams = {
        classId: CLASSES[type],
        gameVersion: target.gameVersion,
        sortField: SORTS[sort] ?? SORTS.relevance,
        sortOrder: 'desc',
        index: offset,
        pageSize: PAGE_SIZE
    }
    if(query) {
        searchParams.searchFilter = query
    }
    if(type === 'mod' && LOADERS[target.loader] != null) {
        searchParams.modLoaderType = LOADERS[target.loader]
    }
    let res
    try {
        res = await http.get('v1/mods/search', { searchParams }).json()
    } catch(err) {
        throw wrapError(err)
    }
    return {
        hits: res.data.filter(mod => !exports.isBlocked(blocklist, mod) && !isKnown(packProjects, mod)),
        total: Math.min(res.pagination?.totalCount ?? 0, MAX_RESULTS),
        offset,
        pageSize: PAGE_SIZE
    }
}

exports.getProject = async function(id) {
    return getData(`v1/mods/${modIdOf(id)}`)
}

exports.getDescription = async function(id) {
    return getData(`v1/mods/${modIdOf(id)}/description`)
}

function fitsTarget(file, type, target) {
    if(!file.isAvailable || !file.gameVersions?.includes(target.gameVersion)) {
        return false
    }
    return type !== 'mod' || file.gameVersions.includes(LOADER_NAMES[target.loader])
}

exports.getCompatibleFile = async function(id, type, target) {
    if(type === 'mod' && target.loader == null) {
        return null
    }
    const searchParams = { gameVersion: target.gameVersion, pageSize: 50 }
    if(type === 'mod' && LOADERS[target.loader] != null) {
        searchParams.modLoaderType = LOADERS[target.loader]
    }
    const files = (await getData(`v1/mods/${modIdOf(id)}/files`, { searchParams })).filter(f => fitsTarget(f, type, target))
    files.sort((a, b) => (a.releaseType === RELEASE ? 0 : 1) - (b.releaseType === RELEASE ? 0 : 1) || Date.parse(b.fileDate) - Date.parse(a.fileDate))
    return files[0] ?? null
}

function checkedUrl(file, mod) {
    let url
    try {
        url = new URL(file.downloadUrl)
    } catch {
        throw new CurseForgeError('NO_DOWNLOAD', `${mod.name} only downloads from CurseForge`, { title: mod.name, url: mod.links?.websiteUrl ?? null })
    }
    const testOrigin = process.env.OBLYVIUM_CURSEFORGE_DOWNLOAD_ORIGIN
    if(!(testOrigin && url.origin === testOrigin) && (url.protocol !== 'https:' || !DOWNLOAD_HOST.test(url.hostname))) {
        throw new CurseForgeError('NO_DOWNLOAD', `Unexpected download host for ${mod.name}`, { title: mod.name, url: mod.links?.websiteUrl ?? null })
    }
    return url.href
}

function expectedHash(file) {
    const sha1 = file.hashes?.find(x => x.algo === 1)?.value
    if(sha1) {
        return { algorithm: 'sha1', value: sha1 }
    }
    const md5 = file.hashes?.find(x => x.algo === 2)?.value
    if(md5) {
        return { algorithm: 'md5', value: md5 }
    }
    throw new CurseForgeError('HASH_MISMATCH', `No hash announced for ${file.fileName}`)
}

exports.resolveInstall = async function(projectId, target, installedProjects, blocklist, packProjects) {
    const seen = new Set()
    const plan = []

    const resolve = async (modId, isDependency) => {
        if(seen.has(modId)) {
            return
        }
        seen.add(modId)
        const mod = await exports.getProject(exports.toId(modId))

        if(exports.isBlocked(blocklist, mod)) {
            throw new CurseForgeError('BLOCKED', `${mod.name} is blocked`, { title: mod.name, dependency: isDependency })
        }
        if(isKnown(packProjects, mod) || isKnown(installedProjects, mod)) {
            if(isDependency) {
                return
            }
            throw new CurseForgeError('ALREADY_INSTALLED', `${mod.name} is already installed`, { title: mod.name })
        }
        const type = exports.typeOf(mod)
        if(type == null) {
            throw new CurseForgeError('UNSUPPORTED_TYPE', `${mod.name} has an unsupported content type`, { title: mod.name })
        }
        const file = await exports.getCompatibleFile(exports.toId(mod.id), type, target)
        if(file == null) {
            throw new CurseForgeError('NO_COMPATIBLE_VERSION', `${mod.name} has no compatible version`, { title: mod.name })
        }
        const url = checkedUrl(file, mod)
        for(const dep of file.dependencies ?? []) {
            if(dep.relationType === REQUIRED_DEPENDENCY) {
                await resolve(dep.modId, true)
            }
        }
        plan.push({ mod, file, url, type })
    }

    await resolve(modIdOf(projectId), false)
    return plan
}

exports.install = async function(projectId, target, gameDir, installedProjects, blocklist, packProjects) {
    const plan = await exports.resolveInstall(projectId, target, installedProjects, blocklist, packProjects)
    const steps = plan.map(step => {
        const name = Modrinth.safeFileName(step.file.fileName, step.type)
        return { ...step, name, dest: path.join(gameDir, Modrinth.TYPES[step.type].folder, name), hash: expectedHash(step.file) }
    })
    for(const { dest } of steps) {
        if(await fs.pathExists(dest)) {
            throw new CurseForgeError('DESTINATION_EXISTS', `Destination already exists: ${path.basename(dest)}`)
        }
    }
    const written = []
    try {
        for(const { mod, file, url, name, dest, hash } of steps) {
            await Modrinth.downloadChecked(url, dest, hash.algorithm, hash.value, name)
            written.push(dest)
            logger.info(`Installed CurseForge ${mod.slug} ${file.displayName} (${name}).`)
        }
    } catch(err) {
        for(const dest of written) {
            await fs.remove(dest).catch(() => {})
        }
        throw err
    }
    return written.map(dest => path.basename(dest))
}
