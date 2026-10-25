const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Type } = require('helios-distribution-types')
const DistroSync = require('../app/assets/js/core/distrosync')

// Módulo mínimo com a mesma interface que o HeliosModule expõe.
function mod(id, { required = true, def = true, type = Type.ForgeMod, subs = [], name = id } = {}){
    return {
        rawModule: { type, name },
        mavenComponents: { version: '1.0.0' },
        subModules: subs,
        getRequired: () => ({ value: required, def }),
        getVersionlessMavenIdentifier: () => id,
        hasSubModules: () => subs.length > 0
    }
}

test('resolveModConfiguration lista só mods opcionais com o valor padrão', () => {
    const mods = [mod('a:core'), mod('a:map', { required: false, def: false }), mod('a:lib', { type: Type.Library })]
    assert.deepEqual(DistroSync.resolveModConfiguration(mods, null), { 'a:map': false })
})

test('resolveModConfiguration mantém a escolha anterior do jogador', () => {
    const mods = [mod('a:map', { required: false, def: false })]
    assert.deepEqual(DistroSync.resolveModConfiguration(mods, { 'a:map': true }), { 'a:map': true })
})

test('resolveModConfiguration inclui submódulos opcionais de um mod obrigatório', () => {
    const mods = [mod('a:core', { subs: [mod('a:extra', { required: false, def: true })] })]
    assert.deepEqual(DistroSync.resolveModConfiguration(mods, null), { 'a:core': { mods: { 'a:extra': true } } })
})

test('packModTree mostra o estado usado no jogo e trava filhos de pai desligado', () => {
    const mods = [mod('a:opt', { required: false, def: true, subs: [mod('a:child', { required: false, def: true })] })]
    const tree = DistroSync.packModTree(mods, { 'a:opt': { value: false, mods: { 'a:child': true } } })
    assert.equal(tree[0].enabled, false)
    assert.equal(tree[0].required, false)
    assert.equal(tree[0].children[0].available, false)
    assert.deepEqual(tree[0].children[0].path, ['a:opt', 'a:child'])
    assert.equal(DistroSync.countPackMods(tree), 2)
})

test('packModValue segue a regra do ProcessBuilder', () => {
    assert.equal(DistroSync.packModValue({}, 'x', { def: true }), true)
    assert.equal(DistroSync.packModValue({ x: false }, 'x', { def: true }), false)
    assert.equal(DistroSync.packModValue({ x: { mods: {} } }, 'x', { def: false }), true)
    assert.equal(DistroSync.packModValue({ x: { value: false } }, 'x', { def: true }), false)
})

test('setPackModValue cria níveis que faltam e converte booleanos antigos', () => {
    const cfg = { mods: { 'a:opt': true } }
    DistroSync.setPackModValue(cfg, ['a:opt', 'a:child'], false)
    assert.deepEqual(cfg.mods, { 'a:opt': { value: true, mods: { 'a:child': false } } })
    DistroSync.setPackModValue(cfg, ['a:opt'], false)
    assert.equal(cfg.mods['a:opt'].value, false)
})
