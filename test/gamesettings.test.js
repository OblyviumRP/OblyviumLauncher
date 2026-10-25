const { test } = require('node:test')
const assert = require('node:assert/strict')
const GameSettings = require('../app/assets/js/core/gamesettings')

function fakeConfig(globalRam){
    const java = {}
    const game = {}
    return {
        java, game,
        getGlobalMaxRAM: () => globalRam,
        getAbsoluteMinRAM: ram => ram?.minimum != null ? ram.minimum / 1024 : 2,
        getAbsoluteMaxRAM: () => 12,
        ensureJavaConfig: (key) => { java[key] ??= { maxRAM: '3G', minRAM: '3G' } },
        setMaxRAM: (key, v) => { java[key].maxRAM = v },
        setMinRAM: (key, v) => { java[key].minRAM = v },
        getGameWidth: () => 1600,
        getGameHeight: () => 900,
        getFullscreen: () => true,
        setProfileGameWidth: (key, v) => { (game[key] ??= {}).w = v },
        setProfileGameHeight: (key, v) => { (game[key] ??= {}).h = v },
        setProfileFullscreen: (key, v) => { (game[key] ??= {}).f = v }
    }
}

const profiles = { configKeys: id => id === 'a' ? ['a', 'a@1234abcd'] : [id] }
const distro = { servers: [
    { rawServer: { id: 'a', javaOptions: { ram: { minimum: 2048, recommended: 4096 } } } },
    { rawServer: { id: 'b', javaOptions: { ram: { minimum: 6144, recommended: 8192 } } } }
] }

test('ramString usa G para inteiros e M para meio GB', () => {
    assert.equal(GameSettings.ramString(4), '4G')
    assert.equal(GameSettings.ramString(4.5), '4608M')
})

test('parseRam lê G e M e cai no fallback', () => {
    assert.equal(GameSettings.parseRam('6G', 0), 6)
    assert.equal(GameSettings.parseRam('4608M', 0), 4.5)
    assert.equal(GameSettings.parseRam('lixo', 3), 3)
    assert.equal(GameSettings.parseRam(null, 3), 3)
})

test('apply copia memória e janela globais para todas as chaves', () => {
    const C = fakeConfig(4)
    GameSettings.apply(distro, C, profiles)
    assert.deepEqual(Object.keys(C.java).sort(), ['a', 'a@1234abcd', 'b'])
    assert.equal(C.java.a.maxRAM, '4G')
    assert.equal(C.java['a@1234abcd'].minRAM, '4G')
    assert.deepEqual(C.game.b, { w: 1600, h: 900, f: true })
})

test('apply respeita o mínimo de cada modpack', () => {
    const C = fakeConfig(4)
    GameSettings.apply(distro, C, profiles)
    assert.equal(C.java.b.maxRAM, '6G')
})

test('sem memória global, cada modpack mantém a sua', () => {
    const C = fakeConfig(null)
    GameSettings.apply(distro, C, profiles)
    assert.equal(C.java.a.maxRAM, '3G')
    assert.equal(C.game.a.w, 1600)
})

test('ramBounds usa o maior mínimo e o maior recomendado', () => {
    const C = fakeConfig(null)
    const b = GameSettings.ramBounds(distro.servers, C, 16 * 1024 ** 3)
    assert.deepEqual(b, { min: 6, max: 12, recommended: 8, system: 16 })
})
