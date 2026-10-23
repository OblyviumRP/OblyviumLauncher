/**
 * Modrinth integration: search, project pages, installs and updates for
 * mods, resource packs and shaders.
 *
 * The staff blocks projects per server in the distribution index:
 *
 *   "modrinth": { "blocked": ["xaeros-minimap", "AANobbMI"] }
 *
 * Entries may be project slugs or project IDs.
 */
const crypto                = require('crypto')
const fs                    = require('fs-extra')
const got                   = require('got')
const path                  = require('path')
const { Transform }         = require('stream')
const { pipeline }          = require('stream/promises')
const { Type }              = require('helios-distribution-types')
const { LoggerUtil }        = require('helios-core')
const { version }           = require('../../../package.json')

const logger = LoggerUtil.getLogger('Modrinth')

// The override exists for tests only.
const API = process.env.OBLYVIUM_MODRINTH_API || 'https://api.modrinth.com/v2'
const PAGE_SIZE = 20

// Modrinth asks every client to identify itself.
const USER_AGENT = `OblyviumRP/OblyviumLauncher/${version}`

const http = got.extend({
    prefixUrl: API,
    headers: { 'user-agent': USER_AGENT },
    responseType: 'json',
    timeout: 15000,
    retry: 1
})

/** Content types and the game folder each one is installed into. */
const TYPES = {
    mod: { folder: 'mods' },
    resourcepack: { folder: 'resourcepacks' },
    shader: { folder: 'shaderpacks' }
}
exports.TYPES = TYPES

exports.SORTS = ['relevance', 'downloads', 'newest', 'updated']

class ModrinthError extends Error {
    constructor(code, message, data = {}) {
        super(message)
        this.code = code
        this.data = data
    }
}
exports.ModrinthError = ModrinthError

function wrapError(err) {
    if(err?.response?.statusCode === 429) {
        return new ModrinthError('RATE_LIMITED', 'Modrinth rate limit reached')
    }
    return err
}

async function getJson(url, options) {
    try {
        return await http.get(url, options).json()
    } catch(err) {
        throw wrapError(err)
    }
}

async function postJson(url, json) {
    try {
        return await http.post(url, { json }).json()
    } catch(err) {
        throw wrapError(err)
    }
}

/**
 * Resolve the Minecraft version and mod loader of a server.
 *
 * @param {HeliosServer} serv The distribution server.
 * @returns {{gameVersion: string, loader: string | null}} loader is null for vanilla servers.
 */
exports.getServerTarget = function(serv) {
    for(const mdl of serv.modules) {
        switch(mdl.rawModule.type) {
            case Type.ForgeHosted:
            case Type.Forge:
                return { gameVersion: serv.rawServer.minecraftVersion, loader: 'forge' }
            case Type.Fabric:
                return { gameVersion: serv.rawServer.minecraftVersion, loader: 'fabric' }
        }
    }
    return { gameVersion: serv.rawServer.minecraftVersion, loader: null }
}

/**
 * @param {HeliosServer} serv The distribution server.
 * @returns {Set<string>} Blocked slugs and project IDs, lower-cased.
 */
exports.getBlocklist = function(serv) {
    const blocked = serv.rawServer.modrinth?.blocked
    return new Set(Array.isArray(blocked) ? blocked.map(b => String(b).toLowerCase()) : [])
}

/**
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {{id?: string, project_id?: string, slug?: string}} project A project or search hit.
 */
exports.isBlocked = function(blocklist, project) {
    return blocklist.has((project.project_id ?? project.id)?.toLowerCase())
        || blocklist.has(project.slug?.toLowerCase())
}

// Loaders a content type accepts on this server.
function loadersFor(type, target) {
    switch(type) {
        case 'mod': return [target.loader]
        case 'shader': return ['iris', 'optifine']
        default: return ['minecraft']
    }
}

function sha1(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1')
        fs.createReadStream(file)
            .on('error', reject)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')))
    })
}

/**
 * Identify local files on Modrinth by hash.
 *
 * @param {string[]} files Absolute paths of existing files.
 * @returns {Promise<Map<string, Object>>} file path -> Modrinth version, for recognised files only.
 * Every file is included, even when several share the same content and hash.
 */
exports.identifyFiles = async function(files) {
    const pathsByHash = new Map()
    for(const file of files) {
        const hash = await sha1(file)
        if(!pathsByHash.has(hash)) {
            pathsByHash.set(hash, [])
        }
        pathsByHash.get(hash).push(file)
    }
    const result = new Map()
    if(pathsByHash.size === 0) {
        return result
    }
    const versions = await postJson('version_files', { hashes: [...pathsByHash.keys()], algorithm: 'sha1' })
    for(const [hash, ver] of Object.entries(versions)) {
        for(const file of pathsByHash.get(hash) ?? []) {
            result.set(file, ver)
        }
    }
    return result
}

const packProjectsCache = new Map()

/**
 * Modrinth project IDs of the mods already shipped by the server's modpack.
 * Installing these again would load the same mod twice.
 *
 * The result is only cached when every expected modpack file was found on
 * disk; a partial scan (e.g. while files are still being downloaded) is
 * returned but not remembered, so the next call tries again.
 *
 * Mods are identified by the files on disk, so with `download` the missing
 * modpack mods are fetched first (checked against the distribution's MD5).
 * Without it, a modpack that was never launched would look empty and its
 * mods would be installed a second time as dependencies.
 *
 * @param {HeliosServer} serv The distribution server.
 * @param {{download?: boolean}} [options]
 * @returns {Promise<Set<string>>}
 */
exports.getModpackProjects = async function(serv, { download = false } = {}) {
    const key = `${serv.rawServer.id}@${serv.rawServer.version}`
    if(packProjectsCache.has(key)) {
        return packProjectsCache.get(key)
    }
    const files = []
    const missing = []
    const walk = mdls => {
        for(const mdl of mdls) {
            if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.FabricMod) {
                if(fs.existsSync(mdl.getPath())) {
                    files.push(mdl.getPath())
                } else {
                    missing.push(mdl)
                }
            }
            walk(mdl.subModules)
        }
    }
    walk(serv.modules)
    if(download) {
        for(const mdl of missing.splice(0)) {
            const { url, MD5 } = mdl.rawModule.artifact
            await downloadChecked(url, mdl.getPath(), 'md5', MD5, path.basename(mdl.getPath()))
            files.push(mdl.getPath())
        }
    }
    const complete = missing.length === 0
    const result = exports.identifyFiles(files).then(ids => new Set([...ids.values()].map(v => v.project_id)))
    if(!complete) {
        return result
    }
    const promise = result.catch(err => {
        packProjectsCache.delete(key)
        throw err
    })
    packProjectsCache.set(key, promise)
    return promise
}

let categoriesPromise = null

/**
 * @param {string} type One of TYPES.
 * @returns {Promise<string[]>} Category names for the type, sorted.
 */
exports.getCategories = async function(type) {
    if(categoriesPromise == null) {
        categoriesPromise = getJson('tag/category').catch(err => {
            categoriesPromise = null
            throw err
        })
    }
    const all = await categoriesPromise
    return all.filter(c => c.project_type === type && c.header === 'categories').map(c => c.name).sort()
}

/**
 * Search content compatible with the server. Mods are never searched on a
 * vanilla server (no loader to install them with).
 *
 * @param {{query?: string, type?: string, categories?: string[], sort?: string, offset?: number}} options
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<{hits: Object[], total: number, offset: number, pageSize: number}>}
 */
exports.search = async function({ query = '', type = 'mod', categories = [], sort = 'relevance', offset = 0 }, target, blocklist, packProjects) {
    if(type === 'mod' && target.loader == null) {
        return { hits: [], total: 0, offset, pageSize: PAGE_SIZE }
    }
    const facets = [[`project_type:${type}`], [`versions:${target.gameVersion}`]]
    if(type !== 'resourcepack') {
        facets.push(loadersFor(type, target).map(l => `categories:${l}`))
    }
    if(type === 'mod') {
        facets.push(['client_side:required', 'client_side:optional'])
    }
    for(const category of categories) {
        facets.push([`categories:${category}`])
    }
    const index = sort === 'relevance' && !query ? 'downloads' : sort
    const res = await getJson('search', {
        searchParams: { query, facets: JSON.stringify(facets), index, limit: PAGE_SIZE, offset }
    })
    return {
        hits: res.hits.filter(hit => !exports.isBlocked(blocklist, hit) && !packProjects.has(hit.project_id)),
        total: res.total_hits,
        offset: res.offset,
        pageSize: PAGE_SIZE
    }
}

exports.getProject = function(idOrSlug) {
    return getJson(`project/${encodeURIComponent(idOrSlug)}`)
}

exports.getProjects = async function(ids) {
    if(ids.length === 0) {
        return []
    }
    return getJson('projects', { searchParams: { ids: JSON.stringify(ids) } })
}

/**
 * Mods have no compatible version on a vanilla server (no loader to run them with).
 */
exports.getCompatibleVersion = async function(projectId, type, target) {
    if(type === 'mod' && target.loader == null) {
        return null
    }
    const versions = await getJson(`project/${encodeURIComponent(projectId)}/version`, {
        searchParams: {
            loaders: JSON.stringify(loadersFor(type, target)),
            game_versions: JSON.stringify([target.gameVersion])
        }
    })
    return versions.find(v => v.version_type === 'release') ?? versions[0] ?? null
}

function primaryFile(ver) {
    return ver.files.find(f => f.primary) ?? ver.files[0]
}

// Characters that are reserved on Windows, plus control characters.
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/
// Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), with
// or without an extension — they are invalid regardless of what follows.
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i
const EXTENSION_FOR_TYPE = { mod: '.jar', resourcepack: '.zip', shader: '.zip' }

/**
 * Validate a file name announced by Modrinth before it is ever joined into a
 * real path. Rejects anything that could escape the destination folder
 * (path separators, "." / "..", Windows-reserved characters or device names,
 * control characters) or that does not have the extension the content type
 * expects.
 *
 * @param {string} name The file name as announced by Modrinth.
 * @param {string} type One of TYPES.
 * @returns {string} The same name, once it is confirmed safe to use.
 */
function safeFileName(name, type) {
    if(typeof name !== 'string' || name.length === 0 || name === '.' || name === '..') {
        throw new ModrinthError('BAD_FILENAME', `Invalid file name: ${JSON.stringify(name)}`)
    }
    if(path.basename(name) !== name || UNSAFE_NAME_CHARS.test(name) || RESERVED_DEVICE_NAME.test(name)) {
        throw new ModrinthError('BAD_FILENAME', `Invalid file name: ${name}`)
    }
    if(path.extname(name).toLowerCase() !== EXTENSION_FOR_TYPE[type]) {
        throw new ModrinthError('BAD_FILENAME', `Invalid file name: ${name}`)
    }
    return name
}
exports.safeFileName = safeFileName

/**
 * Download a file, verifying its hash as it streams in. Never leaves
 * a partial file behind: on any failure (network, HTTP status, hash
 * mismatch) the temporary file is removed before the error is rethrown.
 */
async function downloadChecked(url, dest, algorithm, expected, label) {
    const tmp = `${dest}.part`
    const hash = crypto.createHash(algorithm)
    await fs.ensureDir(path.dirname(dest))
    const hashingTransform = new Transform({
        transform(chunk, encoding, callback) {
            hash.update(chunk)
            callback(null, chunk)
        }
    })
    try {
        await pipeline(
            got.stream(url, {
                headers: { 'user-agent': USER_AGENT },
                // Per-phase timeouts instead of one overall cap, so a large file
                // that keeps making progress is not killed by a fixed deadline.
                // `socket` still bounds how long the connection may sit idle.
                timeout: { lookup: 10000, connect: 15000, secureConnect: 15000, response: 30000, send: 30000, socket: 60000 }
            }),
            hashingTransform,
            fs.createWriteStream(tmp)
        )
    } catch(err) {
        await fs.remove(tmp).catch(() => {})
        throw err
    }
    if(hash.digest('hex') !== String(expected).toLowerCase()) {
        await fs.remove(tmp)
        throw new ModrinthError('HASH_MISMATCH', `Hash mismatch for ${label}`)
    }
    await fs.move(tmp, dest, { overwrite: true })
}

/** Download a Modrinth version file, verifying its sha512 hash. */
function downloadVerified(file, dest) {
    return downloadChecked(file.url, dest, 'sha512', file.hashes.sha512, file.filename)
}

/**
 * Work out what installing a project downloads, without downloading anything.
 *
 * @param {string} projectId Project ID or slug.
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @param {Set<string>} installedProjects Project IDs already in the profile.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<{project: Object, version: Object, file: Object, type: string}[]>}
 * Dependencies first, the requested project last.
 */
exports.resolveInstall = async function(projectId, target, installedProjects, blocklist, packProjects) {
    const seen = new Set()
    const plan = []

    const resolve = async (idOrSlug, isDependency) => {
        const project = await exports.getProject(idOrSlug)
        if(seen.has(project.id)) {
            return
        }
        seen.add(project.id)

        if(exports.isBlocked(blocklist, project)) {
            throw new ModrinthError('BLOCKED', `${project.title} is blocked`, { title: project.title, dependency: isDependency })
        }
        if(packProjects.has(project.id) || installedProjects.has(project.id)) {
            if(isDependency) {
                return
            }
            throw new ModrinthError('ALREADY_INSTALLED', `${project.title} is already installed`, { title: project.title })
        }

        if(TYPES[project.project_type] == null) {
            throw new ModrinthError('UNSUPPORTED_TYPE', `${project.title} has an unsupported content type`, { title: project.title })
        }
        const type = project.project_type
        const ver = await exports.getCompatibleVersion(project.id, type, target)
        if(ver == null) {
            throw new ModrinthError('NO_COMPATIBLE_VERSION', `${project.title} has no compatible version`, { title: project.title })
        }

        for(const dep of ver.dependencies) {
            if(dep.dependency_type === 'required' && dep.project_id != null) {
                await resolve(dep.project_id, true)
            }
        }

        plan.push({ project, version: ver, file: primaryFile(ver), type })
    }

    await resolve(projectId, false)
    return plan
}

/**
 * Install a project and its required dependencies into a game folder.
 * Everything is resolved first, so a blocked dependency leaves nothing behind.
 * Every announced file name and destination is validated before anything is
 * downloaded, so an invalid name or an existing file anywhere in the plan
 * (including the requested project itself, after its dependencies) never
 * leaves an earlier download on disk. If a download fails partway, the files
 * already written by this install are removed (best effort).
 *
 * @returns {Promise<string[]>} File names written, dependencies first.
 */
exports.install = async function(projectId, target, gameDir, installedProjects, blocklist, packProjects) {
    const plan = await exports.resolveInstall(projectId, target, installedProjects, blocklist, packProjects)
    const steps = plan.map(step => {
        const name = safeFileName(step.file.filename, step.type)
        return { ...step, name, dest: path.join(gameDir, TYPES[step.type].folder, name) }
    })
    for(const { dest } of steps) {
        if(await fs.pathExists(dest)) {
            throw new ModrinthError('DESTINATION_EXISTS', `Destination already exists: ${path.basename(dest)}`)
        }
    }
    const written = []
    const writtenPaths = []
    try {
        for(const { project, version: ver, file, name, dest } of steps) {
            await downloadVerified(file, dest)
            written.push(name)
            writtenPaths.push(dest)
            logger.info(`Installed ${project.slug} ${ver.version_number} (${name}).`)
        }
    } catch(err) {
        for(const dest of writtenPaths) {
            await fs.remove(dest).catch(() => {})
        }
        throw err
    }
    return written
}

/**
 * Find newer compatible versions of installed files. Mods are skipped on a
 * vanilla server (no loader to check compatibility against).
 *
 * @param {{path: string, type: string}[]} files
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @returns {Promise<Map<string, Object>>} file path -> newer version, only for files that have one.
 * Every file sharing an outdated hash is included, even duplicates.
 */
exports.checkUpdates = async function(files, target) {
    const result = new Map()
    for(const type of Object.keys(TYPES)) {
        if(type === 'mod' && target.loader == null) {
            continue
        }
        const ofType = files.filter(f => f.type === type)
        if(ofType.length === 0) {
            continue
        }
        const pathsByHash = new Map()
        for(const f of ofType) {
            const hash = await sha1(f.path)
            if(!pathsByHash.has(hash)) {
                pathsByHash.set(hash, [])
            }
            pathsByHash.get(hash).push(f.path)
        }
        const latest = await postJson('version_files/update', {
            hashes: [...pathsByHash.keys()],
            algorithm: 'sha1',
            loaders: loadersFor(type, target),
            game_versions: [target.gameVersion]
        })
        for(const [hash, ver] of Object.entries(latest)) {
            if(!ver.files.some(f => f.hashes.sha1 === hash)) {
                for(const filePath of pathsByHash.get(hash) ?? []) {
                    result.set(filePath, ver)
                }
            }
        }
    }
    return result
}

/**
 * Replace a file with a newer version, keeping a ".disabled" suffix. The new
 * file name is validated before it is written, and the download never
 * overwrites an unrelated file that happens to already exist at the
 * destination.
 *
 * @param {string} filePath Path of the file being replaced.
 * @param {Object} newVersion The Modrinth version to update to.
 * @param {string} [type] One of TYPES. When omitted it is inferred from the
 * old file's extension (".jar" is a mod, anything else is a zip-based type) —
 * kept only for callers that do not already know the type.
 * @returns {Promise<string>} The new file name.
 */
exports.update = async function(filePath, newVersion, type) {
    const file = primaryFile(newVersion)
    const suffix = filePath.endsWith('.disabled') ? '.disabled' : ''
    let resolvedType = type
    if(resolvedType == null) {
        const base = suffix ? filePath.slice(0, -suffix.length) : filePath
        resolvedType = path.extname(base).toLowerCase() === '.jar' ? 'mod' : 'resourcepack'
    }
    const name = safeFileName(file.filename, resolvedType)
    const dest = path.join(path.dirname(filePath), name + suffix)
    if(path.resolve(dest) !== path.resolve(filePath) && await fs.pathExists(dest)) {
        throw new ModrinthError('DESTINATION_EXISTS', `Destination already exists: ${path.basename(dest)}`)
    }
    await downloadVerified(file, dest)
    if(path.resolve(dest) !== path.resolve(filePath)) {
        await fs.remove(filePath)
    }
    logger.info(`Updated ${path.basename(filePath)} to ${path.basename(dest)}.`)
    return path.basename(dest)
}
