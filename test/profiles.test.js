const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Profiles = require('../app/assets/js/profiles')

const NOW = new Date('2026-10-14T19:00:00Z')

test('ensureServer cria o Padrão e o seleciona', () => {
    const store = {}
    const entry = Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(entry.selected, 'padrao')
    assert.deepEqual(entry.list, [{ id: 'padrao', name: 'Padrão', icon: 'espada', created: NOW.toISOString() }])
})

test('ensureServer recupera seleção inválida', () => {
    const store = { oblyvium: { selected: 'sumiu', list: [] } }
    Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.equal(store.oblyvium.list[0].id, 'padrao')
})

test('ensureServer tolera entry sem list (objeto vazio)', () => {
    const store = { oblyvium: {} }
    Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.deepEqual(store.oblyvium.list.map(p => p.id), ['padrao'])
})

test('ensureServer tolera list corrompida (null)', () => {
    const store = { oblyvium: { list: null } }
    Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.deepEqual(store.oblyvium.list.map(p => p.id), ['padrao'])
})

test('ensureServer tolera store[serverId] não-objeto', () => {
    const store = { oblyvium: 'corrompido' }
    Profiles.ensureServer(store, 'oblyvium', NOW)
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.deepEqual(store.oblyvium.list.map(p => p.id), ['padrao'])
})

test('ensureServer chamado duas vezes mantém um único Padrão e o created original', () => {
    const store = {}
    Profiles.ensureServer(store, 'oblyvium', NOW)
    const firstCreated = store.oblyvium.list[0].created
    Profiles.ensureServer(store, 'oblyvium', new Date('2030-01-01T00:00:00Z'))
    assert.equal(store.oblyvium.list.length, 1)
    assert.equal(store.oblyvium.list[0].created, firstCreated)
})

test('configKey usa o id do servidor para o Padrão', () => {
    assert.equal(Profiles.configKey('oblyvium', 'padrao'), 'oblyvium')
    assert.equal(Profiles.configKey('oblyvium', 'a1b2c3d4'), 'oblyvium@a1b2c3d4')
})

test('pastas do Padrão e de outros perfis', () => {
    const inst = path.join('C:', 'dados', 'instances')
    assert.equal(Profiles.gameDir(inst, 'oblyvium', 'padrao'), path.join(inst, 'oblyvium'))
    assert.equal(Profiles.instanceRoot(inst, 'a1b2c3d4'), path.join(inst, '.perfis', 'a1b2c3d4'))
    assert.equal(Profiles.gameDir(inst, 'oblyvium', 'a1b2c3d4'), path.join(inst, '.perfis', 'a1b2c3d4', 'oblyvium'))
})

test('createProfile valida nome e ícone', () => {
    const store = {}
    const p = Profiles.createProfile(store, 'oblyvium', { name: '  Leve  ', icon: 'nao-existe' }, { id: 'a1b2c3d4', now: NOW })
    assert.deepEqual(p, { id: 'a1b2c3d4', name: 'Leve', icon: 'espada', created: NOW.toISOString() })
    assert.equal(Profiles.listProfiles(store, 'oblyvium').length, 2)
    assert.throws(() => Profiles.createProfile(store, 'oblyvium', { name: '   ' }), /Invalid profile name/)
    assert.throws(() => Profiles.createProfile(store, 'oblyvium', { name: 'x'.repeat(33) }), /Invalid profile name/)
})

test('createProfile rejeita id duplicado no mesmo servidor', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve' }, { id: 'a1b2c3d4', now: NOW })
    assert.throws(() => Profiles.createProfile(store, 'oblyvium', { name: 'Outro' }, { id: 'a1b2c3d4', now: NOW }), /Duplicate profile id a1b2c3d4/)
})

test('select, updateProfile e getSelected', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve', icon: 'livro' }, { id: 'a1b2c3d4', now: NOW })
    Profiles.select(store, 'oblyvium', 'a1b2c3d4')
    assert.equal(Profiles.getSelected(store, 'oblyvium').name, 'Leve')
    Profiles.updateProfile(store, 'oblyvium', 'a1b2c3d4', { name: 'Completo', icon: 'coroa' })
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'a1b2c3d4').name, 'Completo')
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'a1b2c3d4').icon, 'coroa')
    assert.throws(() => Profiles.select(store, 'oblyvium', 'nao-existe'), /Unknown profile/)
})

test('updateProfile com nome inválido lança erro', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve' }, { id: 'a1b2c3d4', now: NOW })
    assert.throws(() => Profiles.updateProfile(store, 'oblyvium', 'a1b2c3d4', { name: '   ' }), /Invalid profile name/)
})

test('updateProfile com ícone desconhecido mantém o ícone anterior', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve', icon: 'livro' }, { id: 'a1b2c3d4', now: NOW })
    Profiles.updateProfile(store, 'oblyvium', 'a1b2c3d4', { icon: 'nao-existe' })
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'a1b2c3d4').icon, 'livro')
})

test('getProfile retorna null para id desconhecido', () => {
    const store = {}
    assert.equal(Profiles.getProfile(store, 'oblyvium', 'nao-existe'), null)
})

test('removeProfile protege o Padrão e volta a seleção para ele', () => {
    const store = {}
    Profiles.createProfile(store, 'oblyvium', { name: 'Leve' }, { id: 'a1b2c3d4', now: NOW })
    Profiles.select(store, 'oblyvium', 'a1b2c3d4')
    assert.throws(() => Profiles.removeProfile(store, 'oblyvium', 'padrao'), /cannot be removed/)
    Profiles.removeProfile(store, 'oblyvium', 'a1b2c3d4')
    assert.equal(store.oblyvium.selected, 'padrao')
    assert.equal(store.oblyvium.list.length, 1)
})

test('removeProfile com id desconhecido lança erro', () => {
    const store = {}
    assert.throws(() => Profiles.removeProfile(store, 'oblyvium', 'nao-existe'), /Unknown profile/)
})

test('copySettingsFiles copia só opções e config', async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    t.after(() => fs.remove(tmp))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await fs.outputFile(path.join(src, 'options.txt'), 'key_key.jump:key.keyboard.space\n')
    await fs.outputFile(path.join(src, 'config', 'jei.toml'), 'a=1\n')
    await fs.outputFile(path.join(src, 'mods', 'x.jar'), 'jar')
    await Profiles.copySettingsFiles(src, dst)
    assert.equal(await fs.readFile(path.join(dst, 'options.txt'), 'utf8'), 'key_key.jump:key.keyboard.space\n')
    assert.ok(await fs.pathExists(path.join(dst, 'config', 'jei.toml')))
    assert.ok(!await fs.pathExists(path.join(dst, 'mods')))
})

test('copySettingsFiles com arquivos ausentes não lança erro', async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    t.after(() => fs.remove(tmp))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await assert.doesNotReject(Profiles.copySettingsFiles(src, dst))
})

test('copyGameDir copia tudo menos logs e crash-reports', async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    t.after(() => fs.remove(tmp))
    const src = path.join(tmp, 'src')
    const dst = path.join(tmp, 'dst')
    await fs.outputFile(path.join(src, 'mods', 'x.jar'), 'jar')
    await fs.outputFile(path.join(src, 'saves', 'Mundo', 'level.dat'), 'nbt')
    await fs.outputFile(path.join(src, 'logs', 'latest.log'), 'log')
    await fs.outputFile(path.join(src, 'crash-reports', 'c.txt'), 'crash')
    await Profiles.copyGameDir(src, dst)
    assert.ok(await fs.pathExists(path.join(dst, 'mods', 'x.jar')))
    assert.ok(await fs.pathExists(path.join(dst, 'saves', 'Mundo', 'level.dat')))
    assert.ok(!await fs.pathExists(path.join(dst, 'logs')))
    assert.ok(!await fs.pathExists(path.join(dst, 'crash-reports')))
})

test('copyGameDir aceita origem inexistente', async (t) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'perfis-'))
    t.after(() => fs.remove(tmp))
    await Profiles.copyGameDir(path.join(tmp, 'nao-existe'), path.join(tmp, 'dst'))
    assert.ok(await fs.pathExists(path.join(tmp, 'dst')))
})
