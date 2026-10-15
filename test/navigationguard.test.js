const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { pathToFileURL } = require('url')
const path = require('path')
const Guard = require('../app/assets/js/navigationguard')

const APP = pathToFileURL(path.join(__dirname, '..', 'app', 'app.ejs')).toString()

test('a própria página do launcher pode navegar (com hash ou query)', () => {
    assert.deepEqual(Guard.decideNavigation(APP, APP), { allow: true, external: null })
    assert.deepEqual(Guard.decideNavigation(APP + '#x', APP), { allow: true, external: null })
    assert.deepEqual(Guard.decideNavigation(APP + '?a=1', APP), { allow: true, external: null })
})

test('https e http são bloqueados e abertos no navegador, normalizados', () => {
    assert.deepEqual(Guard.decideNavigation('HTTPS://Evil.example/x', APP), { allow: false, external: 'https://evil.example/x' })
    assert.deepEqual(Guard.decideNavigation('http://example.com', APP), { allow: false, external: 'http://example.com/' })
})

test('outros esquemas e outros arquivos são bloqueados sem abrir nada', () => {
    for(const target of [
        'javascript:alert(1)',
        'data:text/html,<script>1</script>',
        'file:///C:/Windows/System32/calc.exe',
        pathToFileURL(path.join(__dirname, '..', 'app', 'other.ejs')).toString(),
        'about:blank',
        'not a url'
    ]) {
        assert.deepEqual(Guard.decideNavigation(target, APP), { allow: false, external: null }, target)
    }
})

test('attach bloqueia will-navigate externo e nega janelas novas', () => {
    const wc = new EventEmitter()
    let openHandler
    wc.setWindowOpenHandler = fn => { openHandler = fn }
    const opened = []
    Guard.attach(wc, () => APP, url => opened.push(url))

    const nav = target => {
        let prevented = false
        wc.emit('will-navigate', { url: target, preventDefault: () => { prevented = true } }, target)
        return prevented
    }
    assert.equal(nav(APP), false)
    assert.equal(nav('Https://evil.example'), true)
    assert.equal(nav('javascript:alert(1)'), true)
    assert.deepEqual(opened, ['https://evil.example/'])

    assert.deepEqual(openHandler({ url: 'https://modrinth.com/mod/x' }), { action: 'deny' })
    assert.deepEqual(openHandler({ url: 'file:///C:/x' }), { action: 'deny' })
    assert.deepEqual(opened, ['https://evil.example/', 'https://modrinth.com/mod/x'])
})
