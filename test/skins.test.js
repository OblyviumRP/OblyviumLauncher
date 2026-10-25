const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const Skins = require('../app/assets/js/core/skins')

// PNG válido mínimo (IHDR + IDAT + IEND) com o tamanho pedido.
function png(width, height){
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n
        for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        return c >>> 0
    })
    const crc = buf => { let c = 0xffffffff; for(const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
        const td = Buffer.concat([Buffer.from(type), data])
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
        return Buffer.concat([len, td, c])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
    const raw = Buffer.alloc((width * 4 + 1) * height)
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

test('validateSkin aceita 64×64 e 64×32 e recusa o resto', () => {
    assert.doesNotThrow(() => Skins.validateSkin(png(64, 64)))
    assert.doesNotThrow(() => Skins.validateSkin(png(64, 32)))
    assert.throws(() => Skins.validateSkin(png(128, 128)), { code: 'BAD_SIZE' })
    assert.throws(() => Skins.validateSkin(Buffer.from('não é png')), { code: 'NOT_PNG' })
})

test('biblioteca adiciona, evita duplicata, renomeia e remove', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skins-'))
    try {
        const a = await Skins.addToLibrary(dir, png(64, 64), { name: '  Cavaleiro  ', variant: 'SLIM' })
        assert.equal(a.name, 'Cavaleiro')
        assert.equal(a.variant, 'slim')
        const again = await Skins.addToLibrary(dir, png(64, 64), { name: 'Outro', variant: 'classic' })
        assert.equal(again.id, a.id)
        await Skins.updateLibraryEntry(dir, a.id, { name: 'Mago' })
        const { entry, buf } = await Skins.readLibrarySkin(dir, a.id)
        assert.equal(entry.name, 'Mago')
        assert.equal(Skins.pngSize(buf).width, 64)
        await Skins.removeFromLibrary(dir, a.id)
        assert.deepEqual(await Skins.listLibrary(dir), [])
    } finally {
        await fs.remove(dir)
    }
})

function fakeFetch(handler){
    const calls = []
    const impl = async (url, opts = {}) => {
        calls.push({ url, ...opts })
        const { status = 200, body = '' } = await handler(url, opts)
        return { status, ok: status >= 200 && status < 300, text: async () => body, arrayBuffer: async () => Buffer.from(body) }
    }
    impl.calls = calls
    return impl
}

const PROFILE = JSON.stringify({
    id: 'abc', name: 'Steve',
    skins: [{ id: 's1', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/1', variant: 'SLIM' }],
    capes: [{ id: 'c1', state: 'INACTIVE', alias: 'Migrator', url: 'http://textures.minecraft.net/texture/2' }]
})

test('getProfile resume skin ativa e capas', async () => {
    const f = fakeFetch(() => ({ body: PROFILE }))
    const p = await Skins.getProfile('tok', f)
    assert.deepEqual(p.skin, { url: 'http://textures.minecraft.net/texture/1', variant: 'slim' })
    assert.deepEqual(p.capes, [{ id: 'c1', alias: 'Migrator', url: 'http://textures.minecraft.net/texture/2', active: false }])
    assert.equal(f.calls[0].headers.Authorization, 'Bearer tok')
})

test('uploadSkin envia multipart com a variante e valida antes', async () => {
    const f = fakeFetch(() => ({ body: PROFILE }))
    await Skins.uploadSkin('tok', png(64, 64), 'slim', f)
    assert.equal(f.calls[0].method, 'POST')
    assert.equal(f.calls[0].body.get('variant'), 'slim')
    await assert.rejects(Skins.uploadSkin('tok', png(10, 10), 'classic', f), { code: 'BAD_SIZE' })
    assert.equal(f.calls.length, 1)
})

test('setCape ativa por id ou esconde com DELETE', async () => {
    const f = fakeFetch(() => ({ body: PROFILE }))
    await Skins.setCape('tok', 'c1', f)
    await Skins.setCape('tok', null, f)
    assert.equal(f.calls[0].method, 'PUT')
    assert.deepEqual(JSON.parse(f.calls[0].body), { capeId: 'c1' })
    assert.equal(f.calls[1].method, 'DELETE')
})

test('erros do servidor viram mensagens legíveis', async () => {
    await assert.rejects(Skins.getProfile('tok', fakeFetch(() => ({ status: 401 }))), { code: 'UNAUTHORIZED' })
    await assert.rejects(Skins.getProfile('tok', fakeFetch(() => ({ status: 429 }))), { code: 'RATE_LIMITED' })
    await assert.rejects(Skins.getProfile('tok', async () => { throw new Error('x') }), { code: 'NETWORK' })
})

test('downloadTexture só aceita textures.minecraft.net', async () => {
    await assert.rejects(Skins.downloadTexture('https://evil.test/a.png', fakeFetch(() => ({}))), { code: 'BAD_URL' })
})
