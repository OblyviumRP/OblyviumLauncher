/**
 * Modrinth integration for drop-in mods.
 *
 * Players can search Modrinth and install mods into the selected server's
 * mods folder. The staff controls which projects are forbidden through the
 * server entry of the distribution index:
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

const API = 'https://api.modrinth.com/v2'
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

class ModrinthError extends Error {
    constructor(code, message, data = {}) {
        super(message)
        this.code = code
        this.data = data
    }
}
exports.ModrinthError = ModrinthError

/**
 * Resolve the Minecraft version and mod loader of a server.
 *
 * @param {HeliosServer} serv The distribution server.
 * @returns {{gameVersion: string, loader: string} | null} null when the server has no supported loader.
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
    return null
}

/**
 * @param {HeliosServer} serv The distribution server.
 * @returns {Set<string>} Blocked slugs and project IDs, lower-cased.
 */
exports.getBlocklist = function(serv) {
    const blocked = serv.rawServer.modrinth?.blocked
    return new Set(Array.isArray(blocked) ? blocked.map(b => String(b).toLowerCase()) : [])
}

function isBlocked(blocklist, project) {
    return blocklist.has(project.project_id?.toLowerCase() ?? project.id?.toLowerCase())
        || blocklist.has(project.slug?.toLowerCase())
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
 * Identify local jars on Modrinth by hash.
 *
 * @param {string[]} files Absolute paths of existing files.
 * @returns {Promise<Map<string, string>>} file path -> Modrinth project ID, for recognised files only.
 */
async function identifyFiles(files) {
    const byHash = new Map()
    for(const file of files) {
        byHash.set(await sha1(file), file)
    }
    const result = new Map()
    if(byHash.size === 0) {
        return result
    }
    const versions = await http.post('version_files', {
        json: { hashes: [...byHash.keys()], algorithm: 'sha1' }
    }).json()
    for(const [hash, ver] of Object.entries(versions)) {
        result.set(byHash.get(hash), ver.project_id)
    }
    return result
}

const packProjectsCache = new Map()

/**
 * Modrinth project IDs of the mods already shipped by the server's modpack.
 * Installing these again as drop-ins would load the same mod twice.
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
        const promise = identifyFiles(files)
            .then(ids => new Set(ids.values()))
            .catch(err => {
                packProjectsCache.delete(key)
                throw err
            })
        packProjectsCache.set(key, promise)
    }
    return packProjectsCache.get(key)
}

/**
 * Search mods compatible with the server.
 *
 * @param {string} query Free text.
 * @param {{gameVersion: string, loader: string}} target Server target.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @param {number} offset Pagination offset.
 * @returns {Promise<{hits: Object[], total: number, offset: number, pageSize: number}>}
 */
exports.search = async function(query, target, blocklist, packProjects, offset = 0) {
    const facets = [
        ['project_type:mod'],
        [`versions:${target.gameVersion}`],
        [`categories:${target.loader}`],
        ['client_side:required', 'client_side:optional']
    ]
    const res = await http.get('search', {
        searchParams: {
            query,
            facets: JSON.stringify(facets),
            index: query ? 'relevance' : 'downloads',
            limit: PAGE_SIZE,
            offset
        }
    }).json()
    return {
        hits: res.hits.filter(hit => !isBlocked(blocklist, hit) && !packProjects.has(hit.project_id)),
        total: res.total_hits,
        offset: res.offset,
        pageSize: PAGE_SIZE
    }
}

async function getProject(idOrSlug) {
    return http.get(`project/${encodeURIComponent(idOrSlug)}`).json()
}

async function getCompatibleVersion(projectId, target) {
    const versions = await http.get(`project/${encodeURIComponent(projectId)}/version`, {
        searchParams: {
            loaders: JSON.stringify([target.loader]),
            game_versions: JSON.stringify([target.gameVersion])
        }
    }).json()
    return versions.find(v => v.version_type === 'release') ?? versions[0] ?? null
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
 * Install a project and its required dependencies into the mods folder.
 *
 * @param {string} projectId Project ID or slug.
 * @param {{gameVersion: string, loader: string}} target Server target.
 * @param {string} modsDir The server's drop-in mods directory.
 * @param {Set<string>} blocklist From getBlocklist.
 * @param {Set<string>} packProjects From getModpackProjects.
 * @returns {Promise<string[]>} File names written to modsDir.
 */
exports.install = async function(projectId, target, modsDir, blocklist, packProjects) {
    const installedProjects = new Set((await identifyFiles(listModFiles(modsDir, true))).values())
    const seen = new Set()
    const plan = []

    // Resolve everything first so a blocked dependency leaves nothing behind.
    const resolve = async (idOrSlug, isDependency) => {
        const project = await getProject(idOrSlug)
        if(seen.has(project.id)) {
            return
        }
        seen.add(project.id)

        if(isBlocked(blocklist, project)) {
            throw new ModrinthError('BLOCKED', `${project.title} is blocked`, { title: project.title, dependency: isDependency })
        }
        if(packProjects.has(project.id) || installedProjects.has(project.id)) {
            if(isDependency) {
                return
            }
            throw new ModrinthError('ALREADY_INSTALLED', `${project.title} is already installed`, { title: project.title })
        }

        const ver = await getCompatibleVersion(project.id, target)
        if(ver == null) {
            throw new ModrinthError('NO_COMPATIBLE_VERSION', `${project.title} has no compatible version`, { title: project.title })
        }

        for(const dep of ver.dependencies) {
            if(dep.dependency_type === 'required' && dep.project_id != null) {
                await resolve(dep.project_id, true)
            }
        }

        plan.push({ project, ver, file: ver.files.find(f => f.primary) ?? ver.files[0] })
    }

    await resolve(projectId, false)

    const written = []
    for(const { project, ver, file } of plan) {
        await downloadVerified(file, path.join(modsDir, path.basename(file.filename)))
        written.push(file.filename)
        logger.info(`Installed ${project.slug} ${ver.version_number} (${file.filename}).`)
    }
    return written
}

function listModFiles(modsDir, includeDisabled = false) {
    if(!fs.existsSync(modsDir)) {
        return []
    }
    const pattern = includeDisabled ? /\.jar(\.disabled)?$/ : /\.jar$/
    return fs.readdirSync(modsDir)
        .filter(f => pattern.test(f))
        .map(f => path.join(modsDir, f))
        .filter(f => fs.statSync(f).isFile())
}

/**
 * Find enabled drop-in mods that the staff has blocked. Jars that Modrinth
 * does not recognise cannot be checked and are left alone.
 *
 * @param {string} modsDir The server's drop-in mods directory.
 * @param {Set<string>} blocklist From getBlocklist.
 * @returns {Promise<{fileName: string, title: string}[]>}
 */
exports.findBlockedDropins = async function(modsDir, blocklist) {
    if(blocklist.size === 0) {
        return []
    }
    const ids = await identifyFiles(listModFiles(modsDir))
    if(ids.size === 0) {
        return []
    }
    const projects = await http.get('projects', {
        searchParams: { ids: JSON.stringify([...new Set(ids.values())]) }
    }).json()
    const byId = new Map(projects.map(p => [p.id, p]))
    const found = []
    for(const [file, projectId] of ids) {
        const project = byId.get(projectId)
        if(project != null && isBlocked(blocklist, project)) {
            found.push({ fileName: path.basename(file), title: project.title })
        }
    }
    return found
}
