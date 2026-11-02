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
