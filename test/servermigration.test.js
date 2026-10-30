const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const { migrateVersionedIds, VERSION_FILE } = require('../app/assets/js/servermigration')

const PERFIL = 'a1b2c3d4'

function profiles(...ids) {
    return { selected: ids[ids.length - 1], list: ids.map(id => ({ id, name: id, icon: 'espada', created: '' })) }
}

async function setup(files) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'instancias-'))
    for(const rel of files) {
        await fs.outputFile(path.join(dir, rel), 'x')
    }
    return dir
}

test('leva a versão mais nova para o id fixo com perfis, Java, configs e servidor selecionado', async () => {
    const dir = await setup([
        'oblyvium-26.2/mods/velho.jar',
        'oblyvium-26.3/mods/meu.jar',
        'oblyvium-26.3/saves/mundo/level.dat',
        `.perfis/${PERFIL}/oblyvium-26.3/options.txt`
    ])
    const config = {
        selectedServer: 'oblyvium-26.3',
        profiles: { 'oblyvium-26.2': profiles('padrao'), 'oblyvium-26.3': profiles('padrao', PERFIL) },
        javaConfig: { 'oblyvium-26.3': { maxRAM: '6G' }, [`oblyvium-26.3@${PERFIL}`]: { maxRAM: '8G' } },
        gameConfig: { 'oblyvium-26.3': { fullscreen: true } },
        modConfigurations: [{ id: 'oblyvium-26.3', mods: { x: false } }, { id: 'oblyvium', mods: {} }]
    }

    assert.deepEqual(migrateVersionedIds(config, ['oblyvium', 'oblyviumleve'], dir), [{ from: 'oblyvium-26.3', to: 'oblyvium' }])

    assert.ok(await fs.pathExists(path.join(dir, 'oblyvium', 'mods', 'meu.jar')))
    assert.ok(await fs.pathExists(path.join(dir, 'oblyvium', 'saves', 'mundo', 'level.dat')))
    assert.ok(await fs.pathExists(path.join(dir, '.perfis', PERFIL, 'oblyvium', 'options.txt')))
    assert.ok(await fs.pathExists(path.join(dir, 'oblyvium-26.2', 'mods', 'velho.jar')))
    assert.equal(await fs.readFile(path.join(dir, 'oblyvium', VERSION_FILE), 'utf8'), '26.3')

    assert.equal(config.selectedServer, 'oblyvium')
    assert.deepEqual(config.profiles.oblyvium.list.map(p => p.id), ['padrao', PERFIL])
    assert.equal(config.profiles['oblyvium-26.3'], undefined)
    assert.deepEqual(config.javaConfig, { oblyvium: { maxRAM: '6G' }, [`oblyvium@${PERFIL}`]: { maxRAM: '8G' } })
    assert.deepEqual(config.gameConfig, { oblyvium: { fullscreen: true } })
    assert.deepEqual(config.modConfigurations, [{ id: 'oblyvium', mods: { x: false } }])

    // Segunda vez não faz nada.
    assert.deepEqual(migrateVersionedIds(config, ['oblyvium', 'oblyviumleve'], dir), [])
    await fs.remove(dir)
})

test('não mexe quando o id fixo já tem pasta, nem enquanto o painel ainda usa ids com versão', async () => {
    const dir = await setup(['oblyvium-26.3/mods/meu.jar', 'oblyvium/options.txt'])
    const config = { profiles: { 'oblyvium-26.3': profiles('padrao') }, javaConfig: {}, gameConfig: {}, modConfigurations: [] }
    assert.deepEqual(migrateVersionedIds(config, ['oblyvium'], dir), [])
    assert.deepEqual(migrateVersionedIds(config, ['oblyvium-26.3'], dir), [])
    assert.ok(await fs.pathExists(path.join(dir, 'oblyvium-26.3', 'mods', 'meu.jar')))
    await fs.remove(dir)
})

test('ignora versão sem pasta no disco e usa a mais nova que tem', async () => {
    const dir = await setup(['oblyvium-26.2/mods/meu.jar'])
    const config = { profiles: { 'oblyvium-26.2': profiles('padrao'), 'oblyvium-26.3': profiles('padrao') }, javaConfig: {}, gameConfig: {}, modConfigurations: [] }
    assert.deepEqual(migrateVersionedIds(config, ['oblyvium'], dir), [{ from: 'oblyvium-26.2', to: 'oblyvium' }])
    assert.equal(await fs.readFile(path.join(dir, 'oblyvium', VERSION_FILE), 'utf8'), '26.2')
    await fs.remove(dir)
})
