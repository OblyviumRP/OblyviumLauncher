const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const Module = require('module')

const launcherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-'))
const originalLoad = Module._load
Module._load = function(request) {
    if(request === '@electron/remote') {
        return { app: { getPath: () => launcherDir } }
    }
    return originalLoad.apply(this, arguments)
}
const { RestResponseStatus } = require('helios-core/common')
const { MicrosoftAuth, MicrosoftErrorCode } = require('helios-core/microsoft')
const ConfigManager = require('../app/assets/js/configmanager')
const Lang = require('../app/assets/js/langloader')
const AuthManager = require('../app/assets/js/authmanager')

Lang.setupLanguage()
ConfigManager.load()

// An account whose Minecraft and Microsoft tokens have both expired, so validation refreshes.
function expiredAccount() {
    ConfigManager.addMicrosoftAuthAccount('uuid', 'mc', 'Jogador', 0, 'ms', 'refresh', 0)
}

function tokenFails(error) {
    MicrosoftAuth.getAccessToken = async () => ({ responseStatus: RestResponseStatus.ERROR, error, microsoftErrorCode: MicrosoftErrorCode.UNKNOWN })
}

test('falha de rede ao renovar mantém a conta válida', async () => {
    expiredAccount()
    tokenFails(Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'RequestError', code: 'ENOTFOUND' }))
    assert.equal(await AuthManager.validateSelected(), true)
})

test('erro 5xx ou 429 da Microsoft mantém a conta válida', async () => {
    for(const statusCode of [503, 429]) {
        expiredAccount()
        tokenFails(Object.assign(new Error('HTTP'), { name: 'HTTPError', response: { statusCode } }))
        assert.equal(await AuthManager.validateSelected(), true, `status ${statusCode}`)
    }
})

test('token recusado pela Microsoft invalida a conta', async () => {
    expiredAccount()
    tokenFails(Object.assign(new Error('HTTP'), { name: 'HTTPError', response: { statusCode: 400 } }))
    assert.equal(await AuthManager.validateSelected(), false)
})
