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
 */
exports.identifyFiles = async function(files) {
    const byHash = new Map()
    for(const file of files) {
        byHash.set(await sha1(file), file)
    }
    const result = new Map()
    if(byHash.size === 0) {
        return result
    }
    const versions = await postJson('version_files', { hashes: [...byHash.keys()], algorithm: 'sha1' })
    for(const [hash, ver] of Object.entries(versions)) {
        result.set(byHash.get(hash), ver)
    }
    return result
}

const packProjectsCache = new Map()

/**
 * Modrinth project IDs of the mods already shipped by the server's modpack.
 * Installing these again would load the same mod twice.
 *
 * @param {HeliosServer} serv The distribution server.
 * @returns {Promise<Set<string>>}
 */
exports.getModpackProjects = async function(serv) {
    const key = `${serv.rawServer.id}@${serv.rawServer.version}`
    if(!packProjectsCache.has(key)) {
        const files = []
        const walk = mdls => {
            for(const mdl of mdls) {
                if(mdl.rawModule.type === Type.ForgeMod || mdl.rawModule.type === Type.FabricMod) {
                    if(fs.existsSync(mdl.getPath())) {
                        files.push(mdl.getPath())
                    }
                }
                walk(mdl.subModules)
            }
        }
        walk(serv.modules)
        const promise = exports.identifyFiles(files)
            .then(ids => new Set([...ids.values()].map(v => v.project_id)))
            .catch(err => {
                packProjectsCache.delete(key)
                throw err
            })
        packProjectsCache.set(key, promise)
    }
    return packProjectsCache.get(key)
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
 * Search content compatible with the server.
 *
 * @param {{query?: string, type?: string, categories?: string[], sort?: string, offset?: number}} options
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<{hits: Object[], total: number, offset: number, pageSize: number}>}
 */
exports.search = async function({ query = '', type = 'mod', categories = [], sort = 'relevance', offset = 0 }, target, blocklist, packProjects) {
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

exports.getCompatibleVersion = async function(projectId, type, target) {
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

async function downloadVerified(file, dest) {
    const tmp = `${dest}.part`
    const hash = crypto.createHash('sha512')
    await fs.ensureDir(path.dirname(dest))
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp)
        got.stream(file.url, { headers: { 'user-agent': USER_AGENT }, timeout: 60000 })
            .on('data', chunk => hash.update(chunk))
            .on('error', reject)
            .pipe(out)
            .on('error', reject)
            .on('finish', resolve)
    }).catch(async err => {
        await fs.remove(tmp)
        throw err
    })
    if(hash.digest('hex') !== file.hashes.sha512) {
        await fs.remove(tmp)
        throw new ModrinthError('HASH_MISMATCH', `Hash mismatch for ${file.filename}`)
    }
    await fs.move(tmp, dest, { overwrite: true })
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

        const type = TYPES[project.project_type] != null ? project.project_type : 'mod'
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
 *
 * @returns {Promise<string[]>} File names written, dependencies first.
 */
exports.install = async function(projectId, target, gameDir, installedProjects, blocklist, packProjects) {
    const plan = await exports.resolveInstall(projectId, target, installedProjects, blocklist, packProjects)
    const written = []
    for(const { project, version: ver, file, type } of plan) {
        await downloadVerified(file, path.join(gameDir, TYPES[type].folder, path.basename(file.filename)))
        written.push(file.filename)
        logger.info(`Installed ${project.slug} ${ver.version_number} (${file.filename}).`)
    }
    return written
}

/**
 * Find newer compatible versions of installed files.
 *
 * @param {{path: string, type: string}[]} files
 * @param {{gameVersion: string, loader: string | null}} target From getServerTarget.
 * @returns {Promise<Map<string, Object>>} file path -> newer version, only for files that have one.
 */
exports.checkUpdates = async function(files, target) {
    const result = new Map()
    for(const type of Object.keys(TYPES)) {
        const ofType = files.filter(f => f.type === type)
        if(ofType.length === 0) {
            continue
        }
        const byHash = new Map()
        for(const f of ofType) {
            byHash.set(await sha1(f.path), f.path)
        }
        const latest = await postJson('version_files/update', {
            hashes: [...byHash.keys()],
            algorithm: 'sha1',
            loaders: loadersFor(type, target),
            game_versions: [target.gameVersion]
        })
        for(const [hash, ver] of Object.entries(latest)) {
            if(!ver.files.some(f => f.hashes.sha1 === hash)) {
                result.set(byHash.get(hash), ver)
            }
        }
    }
    return result
}

/**
 * Replace a file with a newer version, keeping a ".disabled" suffix.
 *
 * @returns {Promise<string>} The new file name.
 */
exports.update = async function(filePath, newVersion) {
    const file = primaryFile(newVersion)
    const suffix = filePath.endsWith('.disabled') ? '.disabled' : ''
    const dest = path.join(path.dirname(filePath), path.basename(file.filename) + suffix)
    await downloadVerified(file, dest)
    if(path.resolve(dest) !== path.resolve(filePath)) {
        await fs.remove(filePath)
    }
    logger.info(`Updated ${path.basename(filePath)} to ${path.basename(dest)}.`)
    return path.basename(dest)
}
