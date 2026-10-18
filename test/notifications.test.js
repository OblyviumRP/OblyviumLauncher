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

test('parseItem aceita os limites exatos de tamanho de título, corpo e rótulo do link', () => {
    const parsed = N.parseItem(item({
        title: 'x'.repeat(80),
        body: 'x'.repeat(400),
        link: { url: 'https://oblyvium.com.br/x', label: 'x'.repeat(24) }
    }))
    assert.ok(parsed != null)
    assert.equal(parsed.title.length, 80)
    assert.equal(parsed.body.length, 400)
    assert.equal(parsed.link.label.length, 24)
})

test('parseItem aceita quebra de linha no corpo, mas não no título nem no rótulo do link', () => {
    assert.equal(N.parseItem(item({ body: 'Linha 1\nLinha 2' })).body, 'Linha 1\nLinha 2')
    assert.equal(N.parseItem(item({ title: 'Linha 1\nLinha 2' })), null)
    assert.equal(N.parseItem(item({ link: { url: 'https://oblyvium.com.br/x', label: 'Ver\nmais' } })), null)
})

test('parseItem descarta tipo, textos, link, imagem e datas inválidos', () => {
    assert.equal(N.parseItem(item({ type: 'spam' })), null)
    assert.equal(N.parseItem(item({ title: '' })), null)
    assert.equal(N.parseItem(item({ title: 'x'.repeat(81) })), null)
    assert.equal(N.parseItem(item({ body: 'x'.repeat(401) })), null)
    assert.equal(N.parseItem(item({ link: { url: 'http://x.com', label: 'Ver' } })), null)
    assert.equal(N.parseItem(item({ link: { url: 'javascript:alert(1)', label: 'Ver' } })), null)
    assert.equal(N.parseItem(item({ link: 'https://oblyvium.com.br/x' })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: 'https://evil.example/x.png' })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: fake.base + '/notifications/../distribution.json' })), null)
    assert.equal(N.parseItem(item({ highlight: false, image: fake.base + '/notifications/a.png' })), null)
    assert.equal(N.parseItem(item({ highlight: 'true', image: fake.base + '/notifications/a.png' })), null)
    assert.equal(N.parseItem(item({ expiresAt: at(-2) })), null)
    assert.equal(N.parseItem(item({ expiresAt: at(-1) })), null)
    assert.equal(N.parseItem(item({ startsAt: 'ontem' })), null)
    assert.equal(N.parseItem(null), null)
})

test('parseItem descarta texto com caracteres de controle, espaço de largura zero, LRM/RLM ou bidi', () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b)
    const leftToRightMark = String.fromCodePoint(0x200e)
    const bidiOverride = String.fromCodePoint(0x202e)
    assert.equal(N.parseItem(item({ title: 'Oi\tgente' })), null)
    assert.equal(N.parseItem(item({ title: `Oi${zeroWidthSpace}gente` })), null)
    assert.equal(N.parseItem(item({ title: `Oi${leftToRightMark}gente` })), null)
    assert.equal(N.parseItem(item({ title: `Oi${bidiOverride}gente` })), null)
    assert.equal(N.parseItem(item({ body: 'Oi\u0007gente' })), null)
    assert.equal(N.parseItem(item({ link: { url: 'https://oblyvium.com.br/x', label: `Ver${zeroWidthSpace}isso` } })), null)
})

test('parseItem aceita ZWJ e ZWNJ (emoji compostos e junção de script) no título, corpo e rótulo do link', () => {
    const zwj = String.fromCodePoint(0x200d)
    const zwnj = String.fromCodePoint(0x200c)
    const rainbowFlag = '\u{1F3F3}\u{FE0F}' + zwj + '\u{1F308}' // 🏳️‍🌈
    const manTechnologist = '\u{1F468}' + zwj + '\u{1F4BB}' // 👨‍💻
    const heartOnFire = '\u{2764}\u{FE0F}' + zwj + '\u{1F525}' // ❤️‍🔥
    assert.ok(N.parseItem(item({ title: `Evento ${rainbowFlag}` })) != null)
    assert.ok(N.parseItem(item({ body: `Chegou ${manTechnologist} no servidor!` })) != null)
    assert.ok(N.parseItem(item({ link: { url: 'https://oblyvium.com.br/x', label: `Ver ${heartOnFire}` } })) != null)
    assert.ok(N.parseItem(item({ title: `Com${zwnj}junção` })) != null)
})

test('parseItem descarta link com usuário ou senha na URL', () => {
    assert.equal(N.parseItem(item({ link: { url: 'https://user@oblyvium.com.br/x', label: 'Ver' } })), null)
    assert.equal(N.parseItem(item({ link: { url: 'https://user:pass@oblyvium.com.br/x', label: 'Ver' } })), null)
})

test('parseItem aceita imagem do CDN só em destaque', () => {
    const parsed = N.parseItem(item({ highlight: true, image: fake.base + '/notifications/abc.png' }))
    assert.equal(parsed.image, fake.base + '/notifications/abc.png')
})

test('parseItem descarta imagem de destaque fora do formato ou do caminho aceitos', () => {
    assert.equal(N.parseItem(item({ highlight: true, image: fake.base + '/notifications/abc.gif' })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: fake.base + '/notifications/abc.png?x=1' })), null)
    assert.equal(N.parseItem(item({ highlight: true, image: fake.base + '/notifications/sub/abc.png' })), null)
})

test('parseFeed recusa arquivo fora do formato e descarta só os itens ruins', () => {
    assert.throws(() => N.parseFeed({ version: 2, generatedAt: GEN, notifications: [] }))
    assert.throws(() => N.parseFeed({ version: 1, notifications: [] }))
    assert.throws(() => N.parseFeed(null))
    const feed = N.parseFeed(feedOf(item(), item({ id: 'n2', type: 'spam' })))
    assert.equal(feed.generatedAtMs, Date.parse(GEN))
    assert.deepEqual(feed.items.map(i => i.id), ['n1'])
    assert.equal(feed.dropped, 1)
})

test('parseFeed descarta ids duplicados, mantendo o primeiro', () => {
    const feed = N.parseFeed(feedOf(item({ id: 'dup', title: 'Primeiro' }), item({ id: 'dup', title: 'Segundo' })))
    assert.deepEqual(feed.items.map(i => i.title), ['Primeiro'])
    assert.equal(feed.dropped, 1)
})

test('parseFeed valida tudo antes de cortar em MAX_ITEMS', () => {
    const notifications = []
    for(let i = 0; i < 60; i++) notifications.push(item({ id: 'i' + i }))
    notifications.push({ bad: true })
    const feed = N.parseFeed(feedOf(...notifications))
    assert.equal(feed.items.length, 50)
    assert.equal(feed.dropped, 11)
})

test('feedClock anda a partir do relógio do servidor, não do generatedAt nem do relógio do PC', () => {
    const clock = { serverNowMs: Date.parse(GEN), fetchedAtMs: 1000 }
    assert.equal(N.feedClock(clock, 61000), Date.parse(GEN) + 60000)
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
    assert.deepEqual(later, ['a', 'b', 'meu-servidor', 'vista', 'agendada'])
})

test('pendingItems com serverId null só mostra notificações para todos', () => {
    const feed = N.parseFeed(feedOf(item({ id: 'geral' }), item({ id: 'servidor', target: 'valley' })))
    const ids = N.pendingItems(feed, { serverId: null, seen: new Set(), feedNowMs: Date.parse(GEN) }).map(i => i.id)
    assert.deepEqual(ids, ['geral'])
})

test('pendingItems exclui quando feedNowMs é igual ao expiresAt', () => {
    const feed = N.parseFeed(feedOf(item({ expiresAt: at(5) })))
    const ids = N.pendingItems(feed, { serverId: 'all', seen: new Set(), feedNowMs: Date.parse(at(5)) }).map(i => i.id)
    assert.deepEqual(ids, [])
})

test('pruneSeen guarda só ids que ainda estão no arquivo', () => {
    const feed = N.parseFeed(feedOf(item({ id: 'fica' })))
    assert.deepEqual(N.pruneSeen(['fica', 'saiu'], feed), ['fica'])
})

test('fetchFeed lê, devolve o ETag e o clock, e usa 304 quando nada mudou', async () => {
    fake.setFeed(feedOf(item()))
    const first = await N.fetchFeed({ etag: null })
    assert.equal(first.changed, true)
    assert.deepEqual(first.feed.items.map(i => i.id), ['n1'])
    assert.ok(first.etag)
    assert.ok(Number.isFinite(first.clock.serverNowMs))
    assert.ok(Number.isFinite(first.clock.fetchedAtMs))
    const second = await N.fetchFeed({ etag: first.etag })
    assert.equal(second.changed, false)
    assert.equal(fake.state.requests.at(-1).ifNoneMatch, first.etag)
})

test('fetchFeed usa o Date do servidor, não o generatedAt (que só muda em create/cancel), para o que já começou', async () => {
    try {
        const serverNow = new Date(Date.parse(GEN) + 10 * 24 * 3600000)
        fake.state.date = serverNow.toUTCString()
        const scheduled = item({
            id: 'agendada-tardia',
            startsAt: new Date(Date.parse(fake.state.date) - 3600000).toISOString(),
            expiresAt: new Date(Date.parse(fake.state.date) + 3600000).toISOString()
        })
        fake.setFeed({ version: 1, generatedAt: GEN, notifications: [scheduled] })
        const result = await N.fetchFeed({ etag: null })
        assert.equal(result.clock.serverNowMs, Date.parse(fake.state.date))
        const feedNowMs = N.feedClock(result.clock, result.clock.fetchedAtMs)
        const pending = N.pendingItems(result.feed, { serverId: 'all', seen: new Set(), feedNowMs }).map(i => i.id)
        assert.deepEqual(pending, ['agendada-tardia'])
    } finally {
        fake.state.date = null
    }
})

test('fetchFeed sem cabeçalho Date cai para o generatedAt do arquivo', async () => {
    try {
        fake.state.date = false
        fake.setFeed(feedOf(item()))
        const result = await N.fetchFeed({ etag: null })
        assert.equal(result.clock.serverNowMs, Date.parse(GEN))
    } finally {
        fake.state.date = null
    }
})

test('fetchFeed no 304 devolve um clock novo', async () => {
    fake.setFeed(feedOf(item()))
    const first = await N.fetchFeed({ etag: null })
    const second = await N.fetchFeed({ etag: first.etag })
    assert.equal(second.changed, false)
    assert.ok(second.clock != null)
    assert.ok(Number.isFinite(second.clock.serverNowMs))
    assert.ok(Number.isFinite(second.clock.fetchedAtMs))
})

test('fetchFeed no 304 sem cabeçalho Date devolve clock null', async () => {
    try {
        fake.setFeed(feedOf(item()))
        const first = await N.fetchFeed({ etag: null })
        fake.state.date = false
        const second = await N.fetchFeed({ etag: first.etag })
        assert.equal(second.changed, false)
        assert.equal(second.clock, null)
    } finally {
        fake.state.date = null
    }
})

test('fetchFeed recusa corpo maior que 256 KB antes do JSON.parse', async () => {
    try {
        fake.setFeed('[' + '"x",'.repeat(130000) + '"x"]')
        await assert.rejects(N.fetchFeed({ etag: null }), /too large/i)
    } finally {
        fake.setFeed(feedOf(item()))
    }
})

test('fetchFeed falha com HTTP de erro ou JSON quebrado', async () => {
    try {
        fake.state.status = 500
        await assert.rejects(N.fetchFeed({ etag: null }), /HTTP 500/)
        fake.state.status = 200
        fake.setFeed('{ quebrado')
        await assert.rejects(N.fetchFeed({ etag: null }))
    } finally {
        fake.state.status = 200
    }
})
