const test = require('node:test')
const assert = require('node:assert')
const { fingerprintOf, machineFingerprint } = require('../app/assets/js/vac')

test('impressão não depende de espaço nem de maiúscula', () => {
    const a = fingerprintOf('ABC-1', '  UUID-2\r\n')
    assert.strictEqual(a, fingerprintOf('abc-1', 'uuid-2'))
    assert.match(a, /^[0-9a-f]{64}$/)
})

test('impressão desta máquina', { skip: process.platform !== 'win32' }, async () => {
    assert.match(await machineFingerprint(), /^[0-9a-f]{64}$/)
})

test('dados da prova: nonce e campos na ordem do site', () => {
    const { proofData } = require('../app/assets/js/vac')
    const nonce = Buffer.alloc(32, 7).toString('base64url')
    const d = proofData(nonce, { nick: 'Steve', type: 'pirate', fingerprint: 'f'.repeat(64), launcherVersion: '3.8.0' })
    assert.ok(d.subarray(0, 32).equals(Buffer.alloc(32, 7)))
    assert.strictEqual(d.subarray(32).toString(), `\nSteve\npirate\n${'f'.repeat(64)}\n3.8.0`)
})

test('falha de ticket vira motivo para o jogador', () => {
    const { ticketFailure } = require('../app/assets/js/vac')
    const http = (statusCode, error) => ({ response: { statusCode, body: { error } } })
    assert.strictEqual(ticketFailure(new Error('ECONNREFUSED')).code, 'REDE')
    assert.strictEqual(ticketFailure(Object.assign(new Error('spawn reg ENOENT'), { code: 'IDENTIFICACAO' })).code, 'IDENTIFICACAO')
    assert.strictEqual(ticketFailure(http(426, { code: 'LAUNCHER_DESATUALIZADO', message: 'x' })).code, 'LAUNCHER_DESATUALIZADO')
    assert.strictEqual(ticketFailure(http(403, { code: 'FORBIDDEN', message: 'x' })).message, 'Entre de novo com a Microsoft para jogar.')
    assert.strictEqual(ticketFailure(http(429, { code: 'RATE_LIMITED', message: 'Aguarde um minuto.' })).message, 'Aguarde um minuto.')
    assert.strictEqual(ticketFailure(http(502, undefined)).code, 'HTTP_502')
})

test('módulo nativo confere com o HMAC da chave gerada', { skip: !require('fs').existsSync(require('../app/assets/js/vac').PROVER_PATH) }, () => {
    const crypto = require('crypto')
    const { PROVER_PATH } = require('../app/assets/js/vac')
    const { keyFile } = require('../scripts/release-key.cjs')
    const k = JSON.parse(require('fs').readFileSync(keyFile, 'utf8')).key
    const data = crypto.randomBytes(100)
    assert.ok(require(PROVER_PATH).provar(data).equals(crypto.createHmac('sha256', Buffer.from(k, 'base64url')).update(data).digest()))
    assert.throws(() => require(PROVER_PATH).provar('texto'))
})

test('pacote do VacOblyvium vira dois jars com nome aleatório', () => {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const { unpackVac } = require('../app/assets/js/vac')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vac-teste-'))
    try {
        const len = Buffer.alloc(4)
        len.writeUInt32BE(3)
        const bundle = path.join(tmp, 'vac.bin')
        fs.writeFileSync(bundle, Buffer.concat([len, Buffer.from('AGE'), Buffer.from('MODJAR')]))
        const prover = { abrir: b => Buffer.from(b) }
        const dir = path.join(tmp, 'natives')
        const vac = unpackVac(dir, prover, bundle)
        assert.strictEqual(fs.readFileSync(vac.agent, 'utf8'), 'AGE')
        assert.strictEqual(fs.readFileSync(vac.mod, 'utf8'), 'MODJAR')
        assert.match(path.basename(vac.agent), /^[0-9a-f]{16}\.jar$/)
        assert.notStrictEqual(vac.agent, vac.mod)
        assert.strictEqual(unpackVac(dir, null, bundle), null)
        assert.strictEqual(unpackVac(dir, prover, path.join(tmp, 'falta.bin')), null)
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true })
    }
})
