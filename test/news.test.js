const { test } = require('node:test')
const assert = require('node:assert/strict')
const News = require('../app/assets/js/core/news')

const FEED = `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<item><title><![CDATA[Evento de <b>Halloween</b>]]></title><link>https://oblyvium.com.br/n/1</link>
<pubDate>Fri, 24 Oct 2026 18:00:00 GMT</pubDate><dc:creator>Staff</dc:creator>
<description><![CDATA[<p>Abóboras &amp; fantasmas.</p><script>alert(1)</script><img src="x" onerror="y">]]></description></item>
<item><title>Sem link</title><link>javascript:alert(1)</link><description>Texto</description></item>
<item><title></title><description>ignorado</description></item>
</channel></rss>`

test('parseFeed devolve só texto e ignora itens sem título', () => {
    const items = News.parseFeed(FEED)
    assert.equal(items.length, 2)
    assert.equal(items[0].title, 'Evento de Halloween')
    assert.equal(items[0].summary, 'Abóboras & fantasmas.')
    assert.equal(items[0].author, 'Staff')
    assert.equal(items[0].date, '2026-10-24T18:00:00.000Z')
    assert.equal(items[0].link, 'https://oblyvium.com.br/n/1')
})

test('parseFeed descarta links que não são http(s)', () => {
    assert.equal(News.parseFeed(FEED)[1].link, null)
})

test('fetchNews devolve null sem feed, com URL inválida ou em falha', async () => {
    assert.equal(await News.fetchNews(''), null)
    assert.equal(await News.fetchNews('file:///etc/passwd'), null)
    assert.equal(await News.fetchNews('https://x.test/rss', async () => { throw new Error('offline') }), null)
})

test('fetchNews lê o feed pelo cliente HTTP', async () => {
    const items = await News.fetchNews('https://x.test/rss', async () => ({ body: FEED }))
    assert.equal(items.length, 2)
})
