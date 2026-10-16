const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const Migration = require('../app/assets/js/legacymigration')

const ROOT = path.join('C:', 'Users', 'Jogador', 'AppData', 'Roaming')
const OLD = path.join(ROOT, '.NationNetworkLauncher')
const NEW = path.join(ROOT, '.OblyviumLauncher')

function config(dataDirectory, javaConfig = {}) {
    return { settings: { launcher: { dataDirectory } }, javaConfig }
}

test('troca a pasta padrão antiga pela do Oblyvium', () => {
    const c = config(OLD)
    assert.equal(Migration.migrateLegacyDataDirectory(c, ROOT, NEW), true)
    assert.equal(c.settings.launcher.dataDirectory, NEW)
})

test('compara sem diferenciar maiúsculas e com barra no fim', () => {
    const c = config(OLD.toLowerCase() + path.sep)
    assert.equal(Migration.migrateLegacyDataDirectory(c, ROOT, NEW), true)
    assert.equal(c.settings.launcher.dataDirectory, NEW)
})

test('limpa o Java que estava dentro da pasta antiga e mantém os outros', () => {
    const c = config(OLD, {
        servidor: { executable: path.join(OLD, 'runtime', 'x64', 'jdk-25', 'bin', 'javaw.exe') },
        outro: { executable: path.join('C:', 'Program Files', 'Java', 'bin', 'javaw.exe') },
        vazio: { executable: null }
    })
    Migration.migrateLegacyDataDirectory(c, ROOT, NEW)
    assert.equal(c.javaConfig.servidor.executable, null)
    assert.equal(c.javaConfig.outro.executable, path.join('C:', 'Program Files', 'Java', 'bin', 'javaw.exe'))
    assert.equal(c.javaConfig.vazio.executable, null)
})

test('não mexe numa pasta escolhida pelo jogador', () => {
    const escolhida = path.join('D:', 'Jogos', 'Minecraft')
    const c = config(escolhida, { s: { executable: path.join(OLD, 'runtime', 'javaw.exe') } })
    assert.equal(Migration.migrateLegacyDataDirectory(c, ROOT, NEW), false)
    assert.equal(c.settings.launcher.dataDirectory, escolhida)
    assert.equal(c.javaConfig.s.executable, path.join(OLD, 'runtime', 'javaw.exe'))
})

test('aceita configuração incompleta', () => {
    assert.equal(Migration.migrateLegacyDataDirectory({}, ROOT, NEW), false)
    assert.equal(Migration.migrateLegacyDataDirectory(config(undefined), ROOT, NEW), false)
})
