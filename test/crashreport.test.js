const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const CrashReport = require('../app/assets/js/crashreport')

test('redactor tira token, pasta do usuário e variáveis de ambiente', () => {
    const redact = CrashReport.redactor(['eyJsecretToken123'], 'C:\\Users\\Fulano', 'Fulano')
    const out = redact([
        'java_command: net.minecraft.client.main.Main --username Steve --accessToken eyJsecretToken123 --uuid x',
        'Arquivo em C:\\Users\\Fulano\\AppData\\Roaming\\.OblyviumLauncher\\instances\\a',
        'outro em c:/users/fulano/Desktop',
        'Também D:\\Users\\Fulano\\x',
        'USERNAME=Fulano',
        'Fulano entrou no jogo'
    ].join('\n'))
    assert.ok(!out.includes('eyJsecretToken123'))
    assert.match(out, /--accessToken \[oculto\]/)
    assert.match(out, /%USERPROFILE%\\AppData/)
    assert.match(out, /%USERPROFILE%\/Desktop/)
    assert.match(out, /D:\\Users\\\[oculto\]\\x/)
    assert.match(out, /^USERNAME=\[oculto\]$/m)
    assert.match(out, /^Fulano entrou no jogo$/m)
})

test('modsFromLog pega só os mods de primeiro nível do Fabric', () => {
    const log = '[main/INFO]: Loading 3 mods:\n\t- fabric-api 0.130.0\n\t   |-- fabric-api-base 1.0\n\t- java 25\n\t- sodium 0.7.0\n[main/INFO]: outro'
    assert.deepStrictEqual(CrashReport.modsFromLog(log), ['fabric-api 0.130.0', 'java 25', 'sodium 0.7.0'])
    assert.deepStrictEqual(CrashReport.modsFromLog('nada'), [])
})

test('ramMb e javaFrom', () => {
    assert.strictEqual(CrashReport.ramMb('6G'), 6144)
    assert.strictEqual(CrashReport.ramMb('3072M'), 3072)
    assert.strictEqual(CrashReport.ramMb(null), 0)
    assert.strictEqual(CrashReport.javaFrom(['\tJava Version: 25.0.1, Eclipse Adoptium']), '25.0.1, Eclipse Adoptium')
    assert.strictEqual(CrashReport.javaFrom(['# JRE version: OpenJDK (25.0.1+8)']), 'OpenJDK (25.0.1+8)')
    assert.strictEqual(CrashReport.javaFrom(['x']), 'desconhecido')
})

test('collect junta crash report, hs_err e o fim do latest.log', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crash-'))
    try {
        const startedAt = Date.now() - 1000
        await fs.outputFile(path.join(dir, 'crash-reports', 'crash-1.txt'), 'Description: boom\n\tJava Version: 25\n')
        await fs.outputFile(path.join(dir, 'hs_err_pid42.log'), '# EXCEPTION_ACCESS_VIOLATION\n')
        await fs.outputFile(path.join(dir, 'logs', 'latest.log'), Array.from({ length: 2000 }, (_, i) => `linha ${i}`).join('\n'))
        const r = await CrashReport.collect({ gameDir: dir, crashReport: path.join(dir, 'crash-reports', 'crash-1.txt'), startedAt, maxRam: '4G', secrets: [] })
        assert.deepStrictEqual(r.files.map(f => f.name), ['crash-1.txt', 'hs_err_pid42.log', 'latest.log'])
        const log = r.files[2].content
        assert.ok(log.startsWith('[... início cortado ...]'))
        assert.ok(log.endsWith('linha 1999'))
        assert.ok(!log.includes('linha 499\n'))
        assert.strictEqual(r.system.java, '25')
        assert.strictEqual(r.system.maxRamMb, 4096)
    } finally {
        await fs.remove(dir)
    }
})

test('gpusFrom pega nome, fabricante e driver e ignora o render por software', () => {
    const gpus = CrashReport.gpusFrom([
        { vendorId: 0x10de, deviceId: 0x2d83, deviceString: 'NVIDIA GeForce RTX 5050', driverVersion: '32.0.16.1742' },
        { vendorId: 0x1414, deviceId: 0x8c, deviceString: 'Microsoft Basic Render Driver', driverVersion: '10.0' },
        { vendorId: 0x1002, deviceId: 0x73bf }
    ])
    assert.deepStrictEqual(gpus, [
        { name: 'NVIDIA GeForce RTX 5050', vendor: 'NVIDIA', driver: '32.0.16.1742' },
        { name: '0x1002:0x73bf', vendor: 'AMD', driver: '' }
    ])
    assert.deepStrictEqual(CrashReport.gpusFrom(null), [])
})

test('crash pendente: hs_err mais novo das instâncias e perfis, depois do visto', async () => {
    const { pendingHsErr, readSeen, writeSeen } = CrashReport
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-pendente-'))
    try {
        const now = Date.now()
        const put = (dir, name, ageMs) => {
            fs.mkdirSync(dir, { recursive: true })
            const f = path.join(dir, name)
            fs.writeFileSync(f, '# insufficient memory')
            const t = (now - ageMs) / 1000
            fs.utimesSync(f, t, t)
        }
        const inst = path.join(root, 'instances')
        put(path.join(inst, 'oblyvium-26.3'), 'hs_err_pid1.log', 60 * 60 * 1000)
        put(path.join(inst, '.perfis', 'pvp', 'oblyviumvulkan-26.3'), 'hs_err_pid2.log', 10 * 60 * 1000)
        put(path.join(inst, 'velho'), 'hs_err_pid3.log', 3 * 24 * 60 * 60 * 1000)
        const found = await pendingHsErr(inst, null, now)
        assert.strictEqual(found.serverId, 'oblyviumvulkan-26.3')
        assert.strictEqual(path.basename(found.file), 'hs_err_pid2.log')
        assert.strictEqual(await pendingHsErr(inst, now - 5 * 60 * 1000, now), null)
        assert.strictEqual(await readSeen(root), null)
        await writeSeen(root, 1234)
        assert.strictEqual(await readSeen(root), 1234)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('memória baixa: compara o commit livre com a RAM do jogo mais folga', () => {
    const { lowMemory } = CrashReport
    const gb = n => n * 1024 * 1024
    assert.deepStrictEqual(lowMemory({ swapFree: gb(4), free: gb(10) }, 4096), { freeMb: 4096, needMb: 6144 })
    assert.strictEqual(lowMemory({ swapFree: gb(7), free: gb(1) }, 4096), null)
    assert.strictEqual(lowMemory({ free: gb(3) }, 4096).freeMb, 3072)
    assert.strictEqual(lowMemory({}, 4096), null)
    assert.strictEqual(lowMemory({ swapFree: gb(1) }, 0), null)
})
