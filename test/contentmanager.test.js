const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Fake = require('./helpers/fakeModrinth')

let fake
let Content

before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_MODRINTH_API = fake.api
    Content = require('../app/assets/js/contentmanager')
})

after(() => fake.close())

async function gameDir(files = {}){
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jogo-'))
    for(const [rel, content] of Object.entries(files)){
        await fs.outputFile(path.join(dir, rel), content)
    }
    return dir
}

test('listFiles de mods respeita .disabled e ignora outros arquivos', async () => {
    const dir = await gameDir({ 'mods/a.jar': 'a', 'mods/b.jar.disabled': 'b', 'mods/leia.txt': 'x' })
    const files = await Content.listFiles(dir, 'mod')
    assert.deepEqual(files.map(f => [f.fileName, f.enabled]), [['a.jar', true], ['b.jar.disabled', false]])
})

test('ligar e desligar mod renomeia o arquivo', async () => {
    const dir = await gameDir({ 'mods/a.jar': 'a' })
    assert.equal(await Content.setEnabled(dir, 'mod', 'a.jar', false), 'a.jar.disabled')
    assert.equal(await Content.setEnabled(dir, 'mod', 'a.jar.disabled', true), 'a.jar')
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), ['a.jar'])
})

test('ligar mod não sobrescreve um arquivo que já existe com o nome de destino', async () => {
    const dir = await gameDir({ 'mods/a.jar': 'ativo', 'mods/a.jar.disabled': 'inativo' })
    await assert.rejects(
        Content.setEnabled(dir, 'mod', 'a.jar.disabled', true),
        err => err.message.includes('Destination exists') && err.code === 'DESTINATION_EXISTS'
    )
    assert.equal(await fs.readFile(path.join(dir, 'mods', 'a.jar'), 'utf8'), 'ativo')
    assert.equal(await fs.readFile(path.join(dir, 'mods', 'a.jar.disabled'), 'utf8'), 'inativo')
})

test('resource packs ativos ficam no options.txt sem perder o resto', async () => {
    const dir = await gameDir({
        'resourcepacks/x.zip': 'x',
        'resourcepacks/y.zip': 'y',
        'options.txt': 'version:3465\nresourcePacks:["vanilla","fabric"]\nfov:0.0\n'
    })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    await Content.setEnabled(dir, 'resourcepack', 'y.zip', true)
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', false)
    const options = await fs.readFile(path.join(dir, 'options.txt'), 'utf8')
    assert.equal(options, 'version:3465\nresourcePacks:["vanilla","fabric","file/y.zip"]\nfov:0.0\n')
    const files = await Content.listFiles(dir, 'resourcepack')
    assert.deepEqual(files.map(f => [f.fileName, f.enabled]), [['x.zip', false], ['y.zip', true]])
})

test('resource pack sem options.txt cria a linha', async () => {
    const dir = await gameDir({ 'resourcepacks/x.zip': 'x' })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    assert.equal(await fs.readFile(path.join(dir, 'options.txt'), 'utf8'), 'resourcePacks:["vanilla","file/x.zip"]\n')
})

test('resourcePacks inválido (null ou objeto) no options.txt vira lista vazia', async () => {
    const dirNull = await gameDir({ 'resourcepacks/x.zip': 'x', 'options.txt': 'resourcePacks:null\n' })
    assert.deepEqual(await Content.getEnabledResourcePacks(dirNull), [])
    await Content.setEnabled(dirNull, 'resourcepack', 'x.zip', true)
    assert.equal(await fs.readFile(path.join(dirNull, 'options.txt'), 'utf8'), 'resourcePacks:["vanilla","file/x.zip"]\n')

    const dirObj = await gameDir({ 'options.txt': 'resourcePacks:{}\n' })
    assert.deepEqual(await Content.getEnabledResourcePacks(dirObj), [])
})

test('só um shader fica ativo, gravado para OptiFine, Oculus e Iris', async () => {
    const dir = await gameDir({ 'shaderpacks/s1.zip': '1', 'shaderpacks/s2.zip': '2', 'config/oculus.properties': 'maxShadowRenderDistance=32\n' })
    await Content.setEnabled(dir, 'shader', 's1.zip', true)
    await Content.setEnabled(dir, 'shader', 's2.zip', true)
    assert.equal(await Content.getActiveShader(dir), 's2.zip')
    assert.equal(await fs.readFile(path.join(dir, 'optionsshaders.txt'), 'utf8'), 'shaderPack=s2.zip\n')
    assert.equal(await fs.readFile(path.join(dir, 'config', 'oculus.properties'), 'utf8'), 'maxShadowRenderDistance=32\nshaderPack=s2.zip\nenableShaders=true\n')
    assert.ok(await fs.pathExists(path.join(dir, 'config', 'iris.properties')))
    await Content.setEnabled(dir, 'shader', 's2.zip', false)
    assert.equal(await Content.getActiveShader(dir), null)
})

test('remove tira o arquivo e a ativação', async () => {
    const dir = await gameDir({ 'resourcepacks/x.zip': 'x', 'shaderpacks/s.zip': 's' })
    await Content.setEnabled(dir, 'resourcepack', 'x.zip', true)
    await Content.setEnabled(dir, 'shader', 's.zip', true)
    await Content.remove(dir, 'resourcepack', 'x.zip')
    await Content.remove(dir, 'shader', 's.zip')
    assert.deepEqual(await Content.getEnabledResourcePacks(dir), [])
    assert.equal(await Content.getActiveShader(dir), null)
    assert.deepEqual(await fs.readdir(path.join(dir, 'resourcepacks')), [])
})

test('describe junta dados da Modrinth e funciona com arquivo desconhecido', async () => {
    const dir = await gameDir({ 'mods/iris-1.0.jar': 'iris 1.0', 'mods/caseiro.jar': 'feito em casa' })
    const files = await Content.describe(dir, 'mod')
    const iris = files.find(f => f.fileName === 'iris-1.0.jar')
    assert.equal(iris.project.title, 'Iris')
    assert.equal(iris.version.number, '1.0')
    assert.equal(files.find(f => f.fileName === 'caseiro.jar').project, undefined)
})

test('updateFile mantém o resource pack ativo com o nome novo', async () => {
    const dir = await gameDir({ 'resourcepacks/pacote-0.9.zip': 'antigo' })
    await Content.setEnabled(dir, 'resourcepack', 'pacote-0.9.zip', true)
    const fakeVersion = { files: [{ url: `${fake.base}/files/pacote-1.0.zip`, filename: 'pacote-1.0.zip', primary: true, hashes: fake.files['pacote-1.0.zip'].hashes }] }
    const next = await Content.updateFile(dir, 'resourcepack', 'pacote-0.9.zip', fakeVersion)
    assert.equal(next, 'pacote-1.0.zip')
    assert.deepEqual(await Content.getEnabledResourcePacks(dir), ['pacote-1.0.zip'])
})

test('updateFile propaga DESTINATION_EXISTS e não muda o estado habilitado', async () => {
    const dir = await gameDir({
        'resourcepacks/pacote-0.9.zip': 'antigo',
        'resourcepacks/pacote-1.0.zip': 'ja existe'
    })
    await Content.setEnabled(dir, 'resourcepack', 'pacote-0.9.zip', true)
    const fakeVersion = { files: [{ url: `${fake.base}/files/pacote-1.0.zip`, filename: 'pacote-1.0.zip', primary: true, hashes: fake.files['pacote-1.0.zip'].hashes }] }
    await assert.rejects(
        Content.updateFile(dir, 'resourcepack', 'pacote-0.9.zip', fakeVersion),
        err => err.code === 'DESTINATION_EXISTS'
    )
    assert.deepEqual(await Content.getEnabledResourcePacks(dir), ['pacote-0.9.zip'])
    assert.equal(await fs.readFile(path.join(dir, 'resourcepacks', 'pacote-1.0.zip'), 'utf8'), 'ja existe')
})

test('installedProjects e findBlocked olham todos os tipos', async () => {
    const dir = await gameDir({
        'mods/sodium-1.0.jar': 'sodium 1.0',
        'mods/mapa-1.0.jar.disabled': 'mapa 1.0',
        'resourcepacks/pacote-1.0.zip': 'pacote 1.0'
    })
    await Content.setEnabled(dir, 'resourcepack', 'pacote-1.0.zip', true)
    assert.deepEqual([...await Content.installedProjects(dir)].sort(), ['AAAAAAAA', 'CCCCCCCC', 'DDDDDDDD'])
    const blocked = await Content.findBlocked(dir, new Set(['sodium', 'mapa', 'pacote']))
    assert.deepEqual(blocked.map(b => [b.type, b.fileName, b.title]).sort(), [
        ['mod', 'sodium-1.0.jar', 'Sodium'],
        ['resourcepack', 'pacote-1.0.zip', 'Pacote']
    ])
})

test('dois arquivos idênticos bloqueados aparecem os dois no findBlocked', async () => {
    const dir = await gameDir({
        'mods/sodium-1.0.jar': 'sodium 1.0',
        'mods/sodium-copia.jar': 'sodium 1.0'
    })
    const blocked = await Content.findBlocked(dir, new Set(['sodium']))
    assert.deepEqual(blocked.map(b => b.fileName).sort(), ['sodium-1.0.jar', 'sodium-copia.jar'])
})
