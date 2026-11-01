const test = require('node:test')
const assert = require('node:assert')
const { fingerprintOf, machineFingerprint } = require('../app/assets/js/sentinel')

test('impressão não depende de espaço nem de maiúscula', () => {
    const a = fingerprintOf('ABC-1', '  UUID-2\r\n')
    assert.strictEqual(a, fingerprintOf('abc-1', 'uuid-2'))
    assert.match(a, /^[0-9a-f]{64}$/)
})

test('impressão desta máquina', { skip: process.platform !== 'win32' }, async () => {
    assert.match(await machineFingerprint(), /^[0-9a-f]{64}$/)
})
