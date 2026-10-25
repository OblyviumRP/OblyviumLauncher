/**
 * Skins and capes of a Microsoft account, through the Minecraft services API,
 * plus a local library of skin files kept in the launcher data directory.
 *
 * Offline accounts have no skin on Mojang's servers; callers check the
 * account type first.
 */
const fs = require('fs-extra')
const path = require('path')
const crypto = require('crypto')

const API = 'https://api.minecraftservices.com/minecraft/profile'
const MAX_SKIN_BYTES = 256 * 1024
const MAX_LIBRARY = 60

class SkinError extends Error {
    constructor(code, message){
        super(message)
        this.code = code
    }
}

/**
 * Width and height of a PNG, or null when the bytes are not a PNG.
 */
function pngSize(buf){
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if(buf.length < 24 || !sig.every((b, i) => buf[i] === b) || buf.toString('ascii', 12, 16) !== 'IHDR'){
        return null
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** A Minecraft skin is a 64×64 (or legacy 64×32) PNG. */
function validateSkin(buf){
    if(buf.length > MAX_SKIN_BYTES){
        throw new SkinError('TOO_LARGE', 'O arquivo é grande demais para uma skin.')
    }
    const size = pngSize(buf)
    if(size == null){
        throw new SkinError('NOT_PNG', 'Escolha um arquivo .png.')
    }
    if(size.width !== 64 || (size.height !== 64 && size.height !== 32)){
        throw new SkinError('BAD_SIZE', `A skin precisa ter 64×64 pixels (este arquivo tem ${size.width}×${size.height}).`)
    }
}

function variantOf(value){
    return String(value).toLowerCase() === 'slim' ? 'slim' : 'classic'
}

/* Minecraft services */

async function call(fetchImpl, token, method, url, body, headers = {}){
    let res
    try {
        res = await fetchImpl(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } })
    } catch {
        throw new SkinError('NETWORK', 'Sem conexão com os servidores do Minecraft.')
    }
    if(res.status === 401){
        throw new SkinError('UNAUTHORIZED', 'A sessão expirou. Entre de novo na conta.')
    }
    if(res.status === 429){
        throw new SkinError('RATE_LIMITED', 'Muitas trocas seguidas. Tente de novo em alguns minutos.')
    }
    if(!res.ok){
        throw new SkinError('HTTP', `Os servidores do Minecraft recusaram o pedido (${res.status}).`)
    }
    const text = await res.text()
    return text ? JSON.parse(text) : null
}

function summarize(profile){
    const skin = profile?.skins?.find(s => s.state === 'ACTIVE') ?? null
    return {
        id: profile?.id ?? null,
        name: profile?.name ?? null,
        skin: skin == null ? null : { url: skin.url, variant: variantOf(skin.variant) },
        capes: (profile?.capes ?? []).map(c => ({ id: c.id, alias: c.alias, url: c.url, active: c.state === 'ACTIVE' }))
    }
}

async function getProfile(token, fetchImpl = fetch){
    return summarize(await call(fetchImpl, token, 'GET', API))
}

async function uploadSkin(token, buf, variant, fetchImpl = fetch){
    validateSkin(buf)
    const form = new FormData()
    form.append('variant', variantOf(variant))
    form.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png')
    return summarize(await call(fetchImpl, token, 'POST', `${API}/skins`, form))
}

async function resetSkin(token, fetchImpl = fetch){
    return summarize(await call(fetchImpl, token, 'DELETE', `${API}/skins/active`))
}

async function setCape(token, capeId, fetchImpl = fetch){
    if(capeId == null){
        return summarize(await call(fetchImpl, token, 'DELETE', `${API}/capes/active`))
    }
    return summarize(await call(fetchImpl, token, 'PUT', `${API}/capes/active`, JSON.stringify({ capeId }), { 'Content-Type': 'application/json' }))
}

async function downloadTexture(url, fetchImpl = fetch){
    const u = new URL(url)
    if(u.protocol !== 'https:' && u.protocol !== 'http:'){
        throw new SkinError('BAD_URL', 'Endereço de textura inválido.')
    }
    if(u.hostname !== 'textures.minecraft.net'){
        throw new SkinError('BAD_URL', 'Endereço de textura inválido.')
    }
    let res
    try {
        res = await fetchImpl(u.toString().replace(/^http:/, 'https:'))
    } catch {
        throw new SkinError('NETWORK', 'Sem conexão para baixar a skin.')
    }
    if(!res.ok){
        throw new SkinError('HTTP', `Não foi possível baixar a skin (${res.status}).`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    validateSkin(buf)
    return buf
}

/* Local library: <dataDir>/skins/library.json plus one PNG per entry. */

function libraryDir(dataDir){
    return path.join(dataDir, 'skins')
}

async function readLibrary(dataDir){
    try {
        const list = await fs.readJson(path.join(libraryDir(dataDir), 'library.json'))
        return Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string' && typeof e.file === 'string') : []
    } catch {
        return []
    }
}

async function writeLibrary(dataDir, list){
    const dir = libraryDir(dataDir)
    await fs.ensureDir(dir)
    const tmp = path.join(dir, 'library.json.tmp')
    await fs.writeJson(tmp, list, { spaces: 2 })
    await fs.move(tmp, path.join(dir, 'library.json'), { overwrite: true })
}

function cleanName(name){
    const n = String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32)
    return n || 'Skin'
}

/**
 * @returns {Promise<Array<{id, name, variant, file, addedAt, hash}>>}
 */
async function listLibrary(dataDir){
    return readLibrary(dataDir)
}

/** The PNG bytes of a library entry. */
async function readLibrarySkin(dataDir, id){
    const entry = (await readLibrary(dataDir)).find(e => e.id === id)
    if(entry == null){
        throw new SkinError('NOT_FOUND', 'Skin não encontrada na biblioteca.')
    }
    const file = path.join(libraryDir(dataDir), path.basename(entry.file))
    return { entry, buf: await fs.readFile(file) }
}

async function addToLibrary(dataDir, buf, { name, variant }){
    validateSkin(buf)
    const list = await readLibrary(dataDir)
    const hash = crypto.createHash('sha1').update(buf).digest('hex')
    const existing = list.find(e => e.hash === hash)
    if(existing != null){
        return existing
    }
    if(list.length >= MAX_LIBRARY){
        throw new SkinError('LIBRARY_FULL', `A biblioteca aceita até ${MAX_LIBRARY} skins.`)
    }
    const id = crypto.randomBytes(6).toString('hex')
    const file = `${id}.png`
    await fs.ensureDir(libraryDir(dataDir))
    await fs.writeFile(path.join(libraryDir(dataDir), file), buf)
    const entry = { id, name: cleanName(name), variant: variantOf(variant), file, hash, addedAt: new Date().toISOString() }
    await writeLibrary(dataDir, [...list, entry])
    return entry
}

async function updateLibraryEntry(dataDir, id, changes){
    const list = await readLibrary(dataDir)
    const entry = list.find(e => e.id === id)
    if(entry == null){
        throw new SkinError('NOT_FOUND', 'Skin não encontrada na biblioteca.')
    }
    if(changes.name != null){
        entry.name = cleanName(changes.name)
    }
    if(changes.variant != null){
        entry.variant = variantOf(changes.variant)
    }
    await writeLibrary(dataDir, list)
    return entry
}

async function removeFromLibrary(dataDir, id){
    const list = await readLibrary(dataDir)
    const entry = list.find(e => e.id === id)
    if(entry == null){
        return
    }
    await writeLibrary(dataDir, list.filter(e => e.id !== id))
    await fs.remove(path.join(libraryDir(dataDir), path.basename(entry.file))).catch(() => {})
}

module.exports = {
    API,
    SkinError,
    pngSize,
    validateSkin,
    getProfile,
    uploadSkin,
    resetSkin,
    setCape,
    downloadTexture,
    listLibrary,
    readLibrarySkin,
    addToLibrary,
    updateLibraryEntry,
    removeFromLibrary
}
