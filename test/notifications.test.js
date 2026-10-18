const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const Fake = require('./helpers/fakeNotifications')

let fake
let N
before(async () => {
    fake = await Fake.start()
    process.env.OBLYVIUM_NOTIFICATIONS_URL = fake.url
    N = require('../app/assets/js/notifications')
})
after(() => fake.close())

const GEN = '2026-10-20T12:00:00.000Z'
const at = h => new Date(Date.parse(GEN) + h * 3600000).toISOString()

function item(over = {}){
    return {
        id: 'n1', type: 'event', title: 'Torneio', body: 'Hoje às 20h.', link: null, target: 'all',
        highlight: false, image: null, startsAt: at(-1), expiresAt: at(5), ...over
    }
}
const feedOf = (...notifications) => ({ version: 1, generatedAt: GEN, notifications })

test('parseItem aceita um item válido e normaliza', () => {
    const parsed = N.parseItem(item({ link: { url: 'https://oblyvium.com.br/x', label: 'Ver' } }))
    assert.equal(parsed.id, 'n1')
    assert.equal(parsed.sticky, false)
    assert.deepEqual(parsed.link, { url: 'https://oblyvium.com.br/x', label: 'Ver' })
    assert.equal(N.parseItem(item({ type: 'modpack-update' })).sticky, true)
})

test('parseItem descarta tipo, textos, link, imagem e datas inválidos', () => {
    assert.equal(N.parseItem(item({ type: 'spam' })), null)
    assert.equal(N.parseItem(item({ title: '' })), null)
    assert.equal(N.parseItem(item({ title: 'x'.repeat(81) })), null)
    assert.equal(N.parseItem(item({ body: 'x'.repeat(401) })), null)
    assert.equal(N.parseItem(item({ link: { url: 'http://x.com', label: 'Ver' } })), null)
    assert.equal(N.parseItem(item({ link: { url: 'javascript:alert(1)', label: 'Ver' } })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: 'https://evil.example/x.png' })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: fake.base + '/notifications/../distribution.json' })), null)
    assert.equal(N.parseItem(item({ highlight: false, image: fake.base + '/notifications/a.png' })), null)
    assert.equal(N.parseItem(item({ expiresAt: at(-2) })), null)
    assert.equal(N.parseItem(item({ startsAt: 'ontem' })), null)
    assert.equal(N.parseItem(null), null)
})

test('parseItem aceita imagem do CDN só em destaque', () => {
    const parsed = N.parseItem(item({ highlight: true, image: fake.base + '/notifications/abc.png' }))
    assert.equal(parsed.image, fake.base + '/notifications/abc.png')
})

test('parseFeed recusa arquivo fora do formato e descarta só os itens ruins', () => {
    assert.throws(() => N.parseFeed({ version: 2, generatedAt: GEN, notifications: [] }))
    assert.throws(() => N.parseFeed({ version: 1, notifications: [] }))
    assert.throws(() => N.parseFeed(null))
    const feed = N.parseFeed(feedOf(item(), item({ id: 'n2', type: 'spam' })))
    assert.equal(feed.generatedAtMs, Date.parse(GEN))
    assert.deepEqual(feed.items.map(i => i.id), ['n1'])
})

test('feedClock anda a partir do generatedAt, não do relógio do PC', () => {
    const feed = N.parseFeed(feedOf())
    assert.equal(N.feedClock(feed, 1000, 61000), Date.parse(GEN) + 60000)
})

test('pendingItems filtra por servidor, janela e vistos, em ordem de início', () => {
    const feed = N.parseFeed(feedOf(
        item({ id: 'b', startsAt: at(-1) }),
        item({ id: 'a', startsAt: at(-2) }),
        item({ id: 'outro-servidor', target: 'rpg' }),
        item({ id: 'meu-servidor', target: 'valley' }),
        item({ id: 'agendada', startsAt: at(1), expiresAt: at(3) }),
        item({ id: 'vista' })
    ))
    const ids = N.pendingItems(feed, { serverId: 'valley', seen: new Set(['vista']), feedNowMs: Date.parse(GEN) }).map(i => i.id)
    assert.deepEqual(ids, ['a', 'b', 'meu-servidor'])
    const later = N.pendingItems(feed, { serverId: 'valley', seen: new Set(), feedNowMs: Date.parse(at(2)) }).map(i => i.id)
    assert.ok(later.includes('agendada'))
})

test('pruneSeen guarda só ids que ainda estão no arquivo', () => {
    const feed = N.parseFeed(feedOf(item({ id: 'fica' })))
    assert.deepEqual(N.pruneSeen(['fica', 'saiu'], feed), ['fica'])
})

test('fetchFeed lê, devolve o ETag e usa 304 quando nada mudou', async () => {
    fake.setFeed(feedOf(item()))
    const first = await N.fetchFeed({ etag: null })
    assert.equal(first.changed, true)
    assert.deepEqual(first.feed.items.map(i => i.id), ['n1'])
    assert.ok(first.etag)
    const second = await N.fetchFeed({ etag: first.etag })
    assert.equal(second.changed, false)
    assert.equal(fake.state.requests.at(-1).ifNoneMatch, first.etag)
})

test('fetchFeed falha com HTTP de erro ou JSON quebrado', async () => {
    fake.state.status = 500
    await assert.rejects(N.fetchFeed({ etag: null }), /HTTP 500/)
    fake.state.status = 200
    fake.setFeed('{ quebrado')
    await assert.rejects(N.fetchFeed({ etag: null }))
})
