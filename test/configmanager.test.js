const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Module = require('module')

const launcherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-'))
const configPath = path.join(launcherDir, 'config.json')
const originalLoad = Module._load
Module._load = function(request) {
    if(request === '@electron/remote') {
        return { app: { getPath: () => launcherDir } }
    }
    return originalLoad.apply(this, arguments)
}
const ConfigManager = require('../app/assets/js/configmanager')

test('save troca o arquivo inteiro e não deixa o .tmp', () => {
    ConfigManager.load()
    ConfigManager.setSelectedServer('srv')
    ConfigManager.save()
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).selectedServer, 'srv')
    assert.equal(fs.existsSync(configPath + '.tmp'), false)
})

test('config corrompida é guardada como .corrupt antes de gerar uma nova', () => {
    fs.writeFileSync(configPath, '{"selectedServer": "srv", "authenticationDatabase": {"a')
    ConfigManager.load()
    assert.equal(fs.readFileSync(configPath + '.corrupt', 'utf8'), '{"selectedServer": "srv", "authenticationDatabase": {"a')
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(configPath, 'utf8')))
})

test('erro de leitura não apaga uma config boa', () => {
    fs.writeFileSync(configPath, JSON.stringify({ selectedServer: 'srv' }))
    const good = fs.readFileSync(configPath, 'utf8')
    const readFileSync = fs.readFileSync
    fs.readFileSync = (file, ...args) => {
        if(file === configPath) {
            throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
        }
        return readFileSync(file, ...args)
    }
    try {
        assert.throws(() => ConfigManager.load(), { code: 'EBUSY' })
    } finally {
        fs.readFileSync = readFileSync
    }
    assert.equal(fs.readFileSync(configPath, 'utf8'), good)
})
