const { test } = require('node:test')
const assert = require('node:assert')
const { growthMb, lowMemory, pageFilesFrom } = require('../app/assets/js/memory')

test('paginação gerenciada cresce até 3x a RAM ou 1/8 do disco, limitada ao espaço livre', () => {
    assert.strictEqual(growthMb({ allocMb: 1280, maxMb: 0, volumeMb: 476000, volumeFreeMb: 200000 }, 8192), 24576 - 1280)
    assert.strictEqual(growthMb({ allocMb: 1280, maxMb: 0, volumeMb: 476000, volumeFreeMb: 3000 }, 8192), 3000)
    assert.strictEqual(growthMb({ allocMb: 30483, maxMb: 0, volumeMb: 243864, volumeFreeMb: 67300 }, 32692), 0)
    assert.strictEqual(growthMb({ allocMb: 2048, maxMb: 4096, volumeMb: 476000, volumeFreeMb: 200000 }, 8192), 2048)
})

test('PC de 8 GB com paginação gerenciada não leva aviso falso', () => {
    const pc8 = { commitFreeMb: 2500, totalRamMb: 8192, pageFiles: [{ allocMb: 1280, maxMb: 0, volumeMb: 476000, volumeFreeMb: 100000 }] }
    assert.strictEqual(lowMemory(pc8, 4096), null)
    assert.deepStrictEqual(lowMemory({ ...pc8, pageFiles: [] }, 4096), { freeMb: 2500, needMb: 6144 })
})

test('paginação no teto: avisa como no crash de 2026-11-02', () => {
    const cheio = { commitFreeMb: 5900, totalRamMb: 32692, pageFiles: [{ allocMb: 30483, maxMb: 0, volumeMb: 243864, volumeFreeMb: 67300 }] }
    assert.deepStrictEqual(lowMemory(cheio, 4096), { freeMb: 5900, needMb: 6144 })
    assert.strictEqual(lowMemory({ ...cheio, commitFreeMb: 7000 }, 4096), null)
    assert.strictEqual(lowMemory({ commitFreeMb: NaN }, 4096), null)
    assert.strictEqual(lowMemory({ commitFreeMb: 100 }, 0), null)
})

test('lê a saída do PowerShell: gerenciada ignora o máximo, manual usa o máximo', () => {
    const auto = pageFilesFrom({ auto: true, usage: { name: 'C:/pagefile.sys', alloc: 1280 }, settings: [] })
    assert.strictEqual(auto.length, 1)
    assert.strictEqual(auto[0].allocMb, 1280)
    assert.strictEqual(auto[0].maxMb, 0)
    const manual = pageFilesFrom({ auto: false, usage: [{ name: 'C:/pagefile.sys', alloc: 2048 }], settings: [{ name: 'c:/pagefile.sys', max: 4096 }] })
    assert.strictEqual(manual[0].maxMb, 4096)
    assert.deepStrictEqual(pageFilesFrom({ auto: true }), [])
})
