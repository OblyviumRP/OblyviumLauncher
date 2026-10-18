const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')

const { feedFiles, publishPlan, publish, CHUNK_BYTES } = require('../scripts/publish-update.cjs')

const KEY = 'chave-de-teste'

/** Stand-in for the website's PUT /api/ci/launcher/updates/<name>?offset=&total=. */
function fakeSite({ existing = [], failOnce = {}, refuse = {} } = {}){
    const received = new Map()
    const done = []
    const requests = []
    const server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', () => {
            const url = new URL(req.url, 'http://x')
            const name = decodeURIComponent(url.pathname.replace('/api/ci/launcher/updates/', ''))
            const offset = Number(url.searchParams.get('offset'))
            const total = Number(url.searchParams.get('total'))
            const body = Buffer.concat(chunks)
            requests.push({ name, offset, size: body.length, auth: req.headers.authorization })
            const reply = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(payload))
            }
            if(req.headers.authorization !== `Launcher ${KEY}`) return reply(401, { error: { code: 'UNAUTHENTICATED' } })
            if(offset === 0 && existing.includes(name)) return reply(409, { error: { code: 'UPDATE_FILE_EXISTS' } })
            if(failOnce[name] && offset === failOnce[name]){
                delete failOnce[name]
                return reply(502, { error: { code: 'BAD_GATEWAY' } })
            }
            const prev = offset === 0 ? Buffer.alloc(0) : received.get(name)
            if(prev == null || prev.length !== offset) return reply(409, { error: { code: 'UPLOAD_OFFSET_MISMATCH' } })
            const now = Buffer.concat([prev, body])
            received.set(name, now)
            if(now.length < total) return reply(200, { data: { done: false, receivedBytes: now.length } })
            if(refuse[name]) return reply(409, { error: { code: 'MISSING_UPDATE_ASSET', message: refuse[name] } })
            done.push(name)
            return reply(200, { data: { done: true, path: name } })
        })
    })
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}`, received, done, requests })
    }))
}

let dist
let site
const quiet = () => {}

function writeDist(files){
    for(const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dist, name), content)
}

const WIN_YML = [
    'version: 2.0.5',
    'files:',
    '  - url: Oblyvium-Launcher-setup-2.0.5.exe',
    '    sha512: abc',
    '    size: 3',
    'path: Oblyvium-Launcher-setup-2.0.5.exe',
    'sha512: abc',
    'releaseDate: \'2026-10-18T12:00:00.000Z\'',
    ''
].join('\r\n')

beforeEach(() => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-'))
})
afterEach(() => {
    if(site) site.server.close()
    site = null
    fs.rmSync(dist, { recursive: true, force: true })
})

test('feedFiles reads the urls of an electron-builder yml', () => {
    const mac = 'version: 1\nfiles:\n  - url: A-x64.zip\n    size: 1\n  - url: \'A-arm64.dmg\'\n    size: 1\npath: A-x64.zip\n'
    assert.deepStrictEqual(feedFiles(mac), ['A-x64.zip', 'A-arm64.dmg'])
    assert.deepStrictEqual(feedFiles(WIN_YML), ['Oblyvium-Launcher-setup-2.0.5.exe'])
})

test('publishPlan sends files and their blockmaps before the yml', () => {
    writeDist({ 'latest.yml': WIN_YML, 'Oblyvium-Launcher-setup-2.0.5.exe': 'exe', 'Oblyvium-Launcher-setup-2.0.5.exe.blockmap': 'bm' })
    assert.deepStrictEqual(publishPlan(dist, 'latest.yml'), [
        'Oblyvium-Launcher-setup-2.0.5.exe',
        'Oblyvium-Launcher-setup-2.0.5.exe.blockmap',
        'latest.yml'
    ])
})

test('publishPlan refuses a missing yml and paths inside it', () => {
    assert.throws(() => publishPlan(dist, 'latest.yml'), /not found/)
    writeDist({ 'latest.yml': 'files:\n  - url: ../fora.exe\n' })
    assert.throws(() => publishPlan(dist, 'latest.yml'), /Unexpected path/)
})

test('publish uploads in 8 MB pieces, yml last, with the key', async () => {
    site = await fakeSite()
    const big = Buffer.alloc(CHUNK_BYTES * 2 + 5, 7)
    writeDist({ 'latest.yml': WIN_YML.replace('size: 3', `size: ${big.length}`), 'Oblyvium-Launcher-setup-2.0.5.exe': big })
    await publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: KEY, log: quiet })

    assert.deepStrictEqual(site.done, ['Oblyvium-Launcher-setup-2.0.5.exe', 'latest.yml'])
    assert.ok(site.received.get('Oblyvium-Launcher-setup-2.0.5.exe').equals(big))
    const exeOffsets = site.requests.filter(r => r.name.endsWith('.exe')).map(r => r.offset)
    assert.deepStrictEqual(exeOffsets, [0, CHUNK_BYTES, CHUNK_BYTES * 2])
    assert.ok(site.requests.every(r => r.auth === `Launcher ${KEY}`))
})

test('publish skips a file the website already has', async () => {
    site = await fakeSite({ existing: ['Oblyvium-Launcher-setup-2.0.5.exe'] })
    writeDist({ 'latest.yml': WIN_YML, 'Oblyvium-Launcher-setup-2.0.5.exe': 'exe' })
    await publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: KEY, log: quiet })
    assert.deepStrictEqual(site.done, ['latest.yml'])
})

test('publish restarts a file after a 5xx and finishes', { timeout: 20000 }, async () => {
    site = await fakeSite({ failOnce: { 'Oblyvium-Launcher-setup-2.0.5.exe': CHUNK_BYTES } })
    const big = Buffer.alloc(CHUNK_BYTES + 10, 1)
    writeDist({ 'latest.yml': WIN_YML, 'Oblyvium-Launcher-setup-2.0.5.exe': big })
    await publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: KEY, log: quiet })
    assert.ok(site.received.get('Oblyvium-Launcher-setup-2.0.5.exe').equals(big))
    assert.deepStrictEqual(site.done, ['Oblyvium-Launcher-setup-2.0.5.exe', 'latest.yml'])
})

test('publish fails with the website message when the yml is refused', async () => {
    site = await fakeSite({ refuse: { 'latest.yml': 'Envie "x.exe" antes do latest.yml.' } })
    writeDist({ 'latest.yml': WIN_YML, 'Oblyvium-Launcher-setup-2.0.5.exe': 'exe' })
    await assert.rejects(
        publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: KEY, log: quiet }),
        /latest\.yml: Envie "x\.exe" antes do latest\.yml\./
    )
})

test('publish fails on a wrong key without retrying', async () => {
    site = await fakeSite()
    writeDist({ 'latest.yml': WIN_YML, 'Oblyvium-Launcher-setup-2.0.5.exe': 'exe' })
    await assert.rejects(publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: 'errada', log: quiet }), /UNAUTHENTICATED/)
    assert.strictEqual(site.requests.length, 1)
    await assert.rejects(publish({ distDir: dist, feed: 'latest.yml', baseUrl: site.baseUrl, key: '', log: quiet }), /LAUNCHER_PUBLISH_KEY/)
})
