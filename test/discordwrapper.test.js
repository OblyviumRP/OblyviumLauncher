const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')

// Fake discord-rpc-patch client: records logins and activities.
const clients = []
let failNextLogin = false
class FakeClient {
    constructor() {
        this.handlers = {}
        this.activities = []
        this.destroyed = false
        clients.push(this)
    }
    on(event, fn) { this.handlers[event] = fn }
    login({ clientId }) {
        this.clientId = clientId
        if(failNextLogin) {
            failNextLogin = false
            return Promise.reject(new Error('connect ENOENT'))
        }
        setImmediate(() => this.handlers.ready?.())
        return Promise.resolve(this)
    }
    setActivity(activity) { this.activities.push({ ...activity }); return Promise.resolve() }
    clearActivity() { return Promise.resolve() }
    destroy() { this.destroyed = true; return Promise.resolve() }
}

const originalLoad = Module._load
Module._load = function(request) {
    if(request === 'discord-rpc-patch') {
        return { Client: FakeClient }
    }
    return originalLoad.apply(this, arguments)
}
const Lang = require('../app/assets/js/langloader')
Lang.setupLanguage()
const Discord = require('../app/assets/js/discordwrapper')

const GEN = { clientId: '111', smallImageKey: 'small', smallImageText: 'Oblyvium Launcher' }
const SERV = { shortId: 'Oblyvium', largeImageKey: 'large', largeImageText: 'Castelo' }
const tick = () => new Promise(r => setImmediate(r))

beforeEach(() => {
    Discord.shutdownRPC()
    clients.length = 0
    failNextLogin = false
})

test('setPresence conecta e mostra detalhes, servidor e imagens', async () => {
    Discord.setPresence(GEN, SERV, 'No launcher')
    await tick()
    assert.equal(clients.length, 1)
    assert.equal(clients[0].clientId, '111')
    const a = clients[0].activities.at(-1)
    assert.equal(a.details, 'No launcher')
    assert.equal(a.state, 'Servidor: Oblyvium')
    assert.equal(a.largeImageKey, 'large')
    assert.equal(a.smallImageKey, 'small')
})

test('mudar o status reaproveita a conexão e mantém o tempo, a não ser que peça para zerar', async () => {
    Discord.setPresence(GEN, SERV, 'No launcher')
    await tick()
    const started = clients[0].activities.at(-1).startTimestamp
    Discord.setPresence(GEN, { ...SERV, shortId: 'Outro' }, 'No launcher')
    Discord.updateDetails('Carregando jogo..')
    assert.equal(clients.length, 1)
    const last = clients[0].activities.at(-1)
    assert.equal(last.details, 'Carregando jogo..')
    assert.equal(last.state, 'Servidor: Outro')
    assert.equal(last.startTimestamp, started)
    await new Promise(r => setTimeout(r, 5))
    Discord.setPresence(GEN, SERV, 'Aguardando', { resetTimer: true })
    assert.ok(clients[0].activities.at(-1).startTimestamp > started)
})

test('outro clientId reconecta; sem configuração desliga', async () => {
    Discord.setPresence(GEN, SERV, 'No launcher')
    await tick()
    Discord.setPresence({ ...GEN, clientId: '222' }, SERV, 'No launcher')
    await tick()
    assert.equal(clients.length, 2)
    assert.equal(clients[0].destroyed, true)
    assert.equal(clients[1].clientId, '222')
    Discord.setPresence(null, SERV, 'No launcher')
    assert.equal(clients[1].destroyed, true)
})

test('se o Discord não estiver aberto, tenta de novo na próxima mudança', async () => {
    failNextLogin = true
    Discord.setPresence(GEN, SERV, 'No launcher')
    await tick()
    await tick()
    Discord.setPresence(GEN, SERV, 'No launcher')
    await tick()
    assert.equal(clients.length, 2)
    assert.equal(clients[1].activities.at(-1).details, 'No launcher')
})

test('updateDetails e shutdownRPC sem conexão não quebram', () => {
    Discord.updateDetails('qualquer')
    Discord.shutdownRPC()
})
