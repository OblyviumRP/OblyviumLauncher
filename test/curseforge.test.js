const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Fake = require('./helpers/fakeCurseForge')

const TARGET = { gameVersion: '26.3', loader: 'fabric' }
let fake
let CurseForge

before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_CURSEFORGE_API = fake.api
    process.env.OBLYVIUM_CURSEFORGE_DOWNLOAD_ORIGIN = fake.base
    CurseForge = require('../app/assets/js/curseforge')
})

after(() => fake.close())

const tmpGameDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'jogo-cf-'))

test('fingerprint ignora espaços e quebras de linha, como o CurseForge', () => {
    assert.equal(CurseForge.fingerprint(Buffer.from('a b\r\n\tc')), CurseForge.fingerprint(Buffer.from('abc')))
    assert.notEqual(CurseForge.fingerprint(Buffer.from('abc')), CurseForge.fingerprint(Buffer.from('abd')))
    assert.equal(CurseForge.fingerprint(Buffer.alloc(0)), 1540447798)
})

test('search manda classe, versão e loader e tira proibidos e o que o pack já tem', async () => {
    const res = await CurseForge.search({ query: 'mapa', type: 'mod', sort: 'downloads' }, TARGET, new Set(['cf:102']), new Set(['slug:sodium']))
    assert.deepEqual(res.hits.map(h => h.slug), ['cf-mapa', 'cf-lib', 'cf-velho'])
    const q = fake.requests.at(-1).url.searchParams
    assert.equal(q.get('classId'), '6')
    assert.equal(q.get('gameVersion'), '26.3')
    assert.equal(q.get('modLoaderType'), '4')
    assert.equal(q.get('sortField'), '6')
    assert.equal(q.get('searchFilter'), 'mapa')
})

test('categorias são as de primeiro nível e viram categoryIds na busca', async () => {
    assert.deepEqual(await CurseForge.getCategories('mod'), ['Map and Information', 'Performance'])
    await CurseForge.search({ type: 'mod', categories: ['Performance', 'Inexistente'] }, TARGET, new Set(), new Set())
    assert.equal(fake.requests.at(-1).url.searchParams.get('categoryIds'), '[6814]')
})

test('search de mods sem loader não chama a API', async () => {
    const before = fake.requests.length
    const res = await CurseForge.search({ type: 'mod' }, { gameVersion: '26.3', loader: null }, new Set(), new Set())
    assert.equal(res.hits.length, 0)
    assert.equal(fake.requests.length, before)
})

test('install baixa a dependência obrigatória e o mod, conferindo o sha1', async () => {
    const dir = await tmpGameDir()
    const written = await CurseForge.install('cf:100', TARGET, dir, new Set(), new Set(), new Set())
    assert.deepEqual(written, ['lib-cf-1.0.jar', 'mapa-cf-1.0.jar'])
    assert.equal(await fs.readFile(path.join(dir, 'mods', 'mapa-cf-1.0.jar'), 'utf8'), 'mapa cf 1.0')
    assert.ok(!await fs.pathExists(path.join(dir, 'resourcepacks')))
})

test('dependência que o pack já tem pelo slug não é baixada de novo', async () => {
    const dir = await tmpGameDir()
    const written = await CurseForge.install('cf:100', TARGET, dir, new Set(), new Set(), new Set(['slug:cf-lib']))
    assert.deepEqual(written, ['mapa-cf-1.0.jar'])
})

test('dependência proibida bloqueia tudo', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        CurseForge.install('cf:100', TARGET, dir, new Set(), new Set(['cf-lib']), new Set()),
        err => err.code === 'BLOCKED' && err.data.dependency === true && err.source === 'curseforge'
    )
    assert.ok(!await fs.pathExists(path.join(dir, 'mods')))
})

test('mod que o autor não libera para launchers vira NO_DOWNLOAD com o link', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(
        CurseForge.install('cf:102', TARGET, dir, new Set(), new Set(), new Set()),
        err => err.code === 'NO_DOWNLOAD' && err.data.url === 'https://www.curseforge.com/minecraft/mc-mods/cf-fechado'
    )
})

test('sem arquivo para a versão do servidor', async () => {
    const dir = await tmpGameDir()
    await assert.rejects(CurseForge.install('cf:105', TARGET, dir, new Set(), new Set(), new Set()), { code: 'NO_COMPATIBLE_VERSION' })
})

test('resource pack vai para a pasta certa', async () => {
    const dir = await tmpGameDir()
    await CurseForge.install('cf:104', TARGET, dir, new Set(), new Set(), new Set())
    assert.ok(await fs.pathExists(path.join(dir, 'resourcepacks', 'pacote-cf-1.0.zip')))
})

test('id fora do formato cf:<número> é recusado', async () => {
    await assert.rejects(CurseForge.getProject('cf:../x'), { code: 'NOT_FOUND' })
})

test('identifyFiles reconhece arquivos pela impressão', async () => {
    const dir = await tmpGameDir()
    await fs.outputFile(path.join(dir, 'mods', 'qualquer-nome.jar'), 'lib cf 1.0')
    await fs.outputFile(path.join(dir, 'mods', 'desconhecido.jar'), 'nada')
    const found = await CurseForge.identifyFiles([path.join(dir, 'mods', 'qualquer-nome.jar'), path.join(dir, 'mods', 'desconhecido.jar')])
    assert.equal(found.size, 1)
    assert.equal(found.get(path.join(dir, 'mods', 'qualquer-nome.jar')).mod.slug, 'cf-lib')
    assert.deepEqual(await CurseForge.projectIds([path.join(dir, 'mods', 'qualquer-nome.jar')]), ['cf:101'])
})
