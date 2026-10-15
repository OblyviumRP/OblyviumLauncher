const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { Type } = require('helios-distribution-types')
const Fake = require('./helpers/fakeModrinth')

const TARGET = { gameVersion: '1.20.1', loader: 'forge' }
let fake
let Modrinth

before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_MODRINTH_API = fake.api
    Modrinth = require('../app/assets/js/modrinth')
})

after(() => fake.close())

const tmpGameDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'jogo-'))

test('search de mods envia versão, loader e client_side, e filtra proibidos e pack', async () => {
    const res = await Modrinth.search({ query: '', type: 'mod', categories: ['utility'] }, TARGET, new Set(['sodium']), new Set(['CCCCCCCC']))
    const titles = res.hits.map(h => h.title)
    assert.ok(!titles.includes('Sodium'))
    assert.ok(!titles.includes('Mapa'))
    assert.ok(titles.includes('Iris'))
    const facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [
        ['project_type:mod'],
        ['versions:1.20.1'],
        ['categories:forge'],
        ['client_side:required', 'client_side:optional'],
        ['categories:utility']
    ])
    assert.equal(fake.requests.at(-1).url.searchParams.get('index'), 'downloads')
})

test('search de shaders e resource packs usa os loaders certos', async () => {
    await Modrinth.search({ type: 'shader', sort: 'newest' }, TARGET, new Set(), new Set())
    let facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [['project_type:shader'], ['versions:1.20.1'], ['categories:iris', 'categories:optifine']])
    assert.equal(fake.requests.at(-1).url.searchParams.get('index'), 'newest')
    await Modrinth.search({ type: 'resourcepack' }, TARGET, new Set(), new Set())
    facets = JSON.parse(fake.requests.at(-1).url.searchParams.get('facets'))
    assert.deepEqual(facets, [['project_type:resourcepack'], ['versions:1.20.1']])
})

test('getCategories só traz o cabeçalho "categories" do tipo', async () => {
    assert.deepEqual(await Modrinth.getCategories('mod'), ['optimization', 'utility'])
    assert.deepEqual(await Modrinth.getCategories('resourcepack'), ['decoration'])
})

test('install baixa o projeto e as dependências na pasta do tipo', async () => {
    const dir = await tmpGameDir()
    const written = await Modrinth.install('iris', TARGET, dir, new Set(), new Set(), new Set())
    assert.deepEqual(written, ['sodium-1.0.jar', 'iris-2.0.jar'])
    assert.equal(await fs.readFile(path.join(dir, 'mods', 'iris-2.0.jar'), 'utf8'), 'iris 2.0')
})

test('install de resource pack e shader vai para as pastas certas', async () => {
    const dir = await tmpGameDir()
    await Modrinth.install('pacote', TARGET, dir, new Set(), new Set(), new Set())
    await Modrinth.install('sombra', TARGET, dir, new Set(), new Set(), new Set())
    assert.ok(await fs.pathExists(path.join(dir, 'resourcepacks', 'pacote-1.0.zip')))
    assert.ok(await fs.pathExists(path.join(dir, 'shaderpacks', 'sombra-1.0.zip')))
})

test('dependência proibida bloqueia tudo e não deixa arquivo', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('iris', TARGET, dir, new Set(), new Set(['sodium']), new Set()),
        err => err.code === 'BLOCKED' && err.data.dependency === true && err.data.title === 'Sodium'
    )
    assert.ok(!await fs.pathExists(path.join(dir, 'mods')))
})

test('projeto já instalado e dependência do pack', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('mapa', TARGET, dir, new Set(['CCCCCCCC']), new Set(), new Set()),
        err => err.code === 'ALREADY_INSTALLED'
    )
    const written = await Modrinth.install('iris', TARGET, dir, new Set(), new Set(), new Set(['AAAAAAAA']))
    assert.deepEqual(written, ['iris-2.0.jar'])
})

test('hash diferente não deixa arquivo', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('corrompido', TARGET, dir, new Set(), new Set(), new Set()),
        err => err.code === 'HASH_MISMATCH'
    )
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), [])
})

test('resolveInstall descreve o que será baixado', async () => {
    const plan = await Modrinth.resolveInstall('iris', TARGET, new Set(), new Set(), new Set())
    assert.deepEqual(plan.map(s => [s.project.slug, s.version.version_number, s.type]), [['sodium', '1.0', 'mod'], ['iris', '2.0', 'mod']])
})

test('identifyFiles, checkUpdates e update', async () => {
    const dir = await tmpGameDir()
    const old = path.join(dir, 'mods', 'iris-1.0.jar.disabled')
    await fs.outputFile(old, 'iris 1.0')
    const ids = await Modrinth.identifyFiles([old])
    assert.equal(ids.get(old).project_id, 'BBBBBBBB')
    const updates = await Modrinth.checkUpdates([{ path: old, type: 'mod' }], TARGET)
    assert.equal(updates.get(old).version_number, '2.0')
    const next = await Modrinth.update(old, updates.get(old))
    assert.equal(next, 'iris-2.0.jar.disabled')
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['iris-2.0.jar.disabled'])
})

test('limite da Modrinth vira RATE_LIMITED', async () => {
    await assert.rejects(
        Modrinth.search({ query: 'limite', type: 'mod' }, TARGET, new Set(), new Set()),
        err => err.code === 'RATE_LIMITED'
    )
})

test('getServerTarget e getBlocklist', () => {
    const serv = {
        rawServer: { minecraftVersion: '1.20.1', modrinth: { blocked: ['Sodium', 'AANobbMI'] } },
        modules: [{ rawModule: { type: 'ForgeHosted' } }]
    }
    assert.deepEqual(Modrinth.getServerTarget(serv), { gameVersion: '1.20.1', loader: 'forge' })
    assert.deepEqual([...Modrinth.getBlocklist(serv)], ['sodium', 'aanobbmi'])
    assert.ok(Modrinth.isBlocked(Modrinth.getBlocklist(serv), { id: 'AAAAAAAA', slug: 'sodium' }))
})

test('safeFileName rejeita nomes perigosos e aceita nomes válidos', () => {
    assert.equal(Modrinth.safeFileName('sodium-1.0.jar', 'mod'), 'sodium-1.0.jar')
    assert.equal(Modrinth.safeFileName('pacote-1.0.zip', 'resourcepack'), 'pacote-1.0.zip')
    for(const bad of ['..', '.', '', 'a/../b.jar', 'x.jar:ads', 'a\\b.jar', 'a/b.jar']) {
        assert.throws(() => Modrinth.safeFileName(bad, 'mod'), err => err.code === 'BAD_FILENAME')
    }
    // Right shape of name, wrong extension for the type.
    assert.throws(() => Modrinth.safeFileName('sodium-1.0.zip', 'mod'), err => err.code === 'BAD_FILENAME')
})

test('install rejeita nome de arquivo perigoso anunciado pela Modrinth e não escreve nada', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        Modrinth.install('hostil', TARGET, dir, new Set(), new Set(), new Set()),
        err => err.code === 'BAD_FILENAME'
    )
    assert.ok(!await fs.pathExists(path.join(dir, 'mods')))
})

test('update rejeita nomes de arquivo perigosos e não escreve nada', async () => {
    const dir = await tmpGameDir()
    const original = path.join(dir, 'mods', 'alvo.jar')
    await fs.outputFile(original, 'original')
    for(const bad of ['..', '', 'a/../b.jar', 'x.jar:ads']) {
        const fakeVersion = { files: [{ url: `${fake.base}/files/sumiu.jar`, filename: bad, primary: true, hashes: { sha512: 'x' } }] }
        await assert.rejects(
            Modrinth.update(original, fakeVersion),
            err => err.code === 'BAD_FILENAME'
        )
    }
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['alvo.jar'])
})

test('download que recebe 404 não deixa arquivo .part nem apaga o original', async () => {
    const dir = await tmpGameDir()
    const original = path.join(dir, 'mods', 'alvo.jar')
    await fs.outputFile(original, 'original')
    const fakeVersion = { files: [{ url: `${fake.base}/files/sumiu.jar`, filename: 'alvo.jar', primary: true, hashes: { sha512: 'x' } }] }
    await assert.rejects(Modrinth.update(original, fakeVersion))
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['alvo.jar'])
})

test('download cortado no meio não deixa arquivo .part nem apaga o original', async () => {
    const dir = await tmpGameDir()
    const original = path.join(dir, 'mods', 'alvo.jar')
    await fs.outputFile(original, 'original')
    const fakeVersion = { files: [{ url: `${fake.base}/files/corte.jar`, filename: 'alvo.jar', primary: true, hashes: { sha512: 'x' } }] }
    await assert.rejects(Modrinth.update(original, fakeVersion))
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['alvo.jar'])
})

test('identifyFiles reconhece todos os arquivos com o mesmo hash', async () => {
    const dir = await tmpGameDir()
    const a = path.join(dir, 'a.jar')
    const b = path.join(dir, 'b.jar')
    await fs.outputFile(a, 'sodium 1.0')
    await fs.outputFile(b, 'sodium 1.0')
    const ids = await Modrinth.identifyFiles([a, b])
    assert.equal(ids.get(a).project_id, 'AAAAAAAA')
    assert.equal(ids.get(b).project_id, 'AAAAAAAA')
})

test('checkUpdates atualiza todos os arquivos duplicados com o mesmo hash', async () => {
    const dir = await tmpGameDir()
    const a = path.join(dir, 'mods', 'a.jar.disabled')
    const b = path.join(dir, 'mods', 'b.jar.disabled')
    await fs.outputFile(a, 'iris 1.0')
    await fs.outputFile(b, 'iris 1.0')
    const updates = await Modrinth.checkUpdates([{ path: a, type: 'mod' }, { path: b, type: 'mod' }], TARGET)
    assert.equal(updates.get(a).version_number, '2.0')
    assert.equal(updates.get(b).version_number, '2.0')
})

test('getModpackProjects não guarda em cache quando falta um mod esperado no disco', async () => {
    const dir = await tmpGameDir()
    const missingPath = path.join(dir, 'iris.jar')
    const presentPath = path.join(dir, 'sodium.jar')
    await fs.outputFile(presentPath, 'sodium 1.0')
    const serv = {
        rawServer: { id: 'teste-cache-modpack', version: '1' },
        modules: [
            { rawModule: { type: Type.ForgeMod }, getPath: () => missingPath, subModules: [] },
            { rawModule: { type: Type.ForgeMod }, getPath: () => presentPath, subModules: [] }
        ]
    }
    const first = await Modrinth.getModpackProjects(serv)
    assert.deepEqual([...first], ['AAAAAAAA'])

    await fs.outputFile(missingPath, 'iris 1.0')
    const second = await Modrinth.getModpackProjects(serv)
    assert.deepEqual([...second].sort(), ['AAAAAAAA', 'BBBBBBBB'])
})

test('vanilla não busca mods na API', async () => {
    const vanilla = { gameVersion: '1.20.1', loader: null }
    const before = fake.requests.length
    const res = await Modrinth.search({ type: 'mod' }, vanilla, new Set(), new Set())
    assert.deepEqual(res, { hits: [], total: 0, offset: 0, pageSize: 20 })
    assert.equal(fake.requests.length, before)
})

test('vanilla não tem versão compatível de mod', async () => {
    const vanilla = { gameVersion: '1.20.1', loader: null }
    assert.equal(await Modrinth.getCompatibleVersion('AAAAAAAA', 'mod', vanilla), null)
})

test('checkUpdates ignora mods em servidor vanilla', async () => {
    const vanilla = { gameVersion: '1.20.1', loader: null }
    const dir = await tmpGameDir()
    const modPath = path.join(dir, 'mods', 'iris-1.0.jar.disabled')
    await fs.outputFile(modPath, 'iris 1.0')
    const updates = await Modrinth.checkUpdates([{ path: modPath, type: 'mod' }], vanilla)
    assert.equal(updates.size, 0)
})

test('resolveInstall rejeita tipo de projeto não suportado', async () => {
    await assert.rejects(
        Modrinth.resolveInstall('extra', TARGET, new Set(), new Set(), new Set()),
        err => err.code === 'UNSUPPORTED_TYPE' && err.data.title === 'Extra'
    )
})
