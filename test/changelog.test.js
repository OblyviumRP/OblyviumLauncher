const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

let server
let served = { status: 200, body: '' }
let reads = 0
let C
before(async () => {
    server = http.createServer((_req, res) => {
        reads++
        res.writeHead(served.status, { 'content-type': 'application/json' })
        res.end(served.body)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    process.env.OBLYVIUM_CHANGELOG_URL = `http://127.0.0.1:${server.address().port}/changelog.json`
    C = require('../app/assets/js/changelog')
})
after(() => server.close())

const release = (over = {}) => ({ version: '2.3.0', title: 'Notificações', notes: '- Uma\n- Duas', publishedAt: '2026-10-21T12:00:00.000Z', ...over })
const changelogOf = (...releases) => ({ version: 1, generatedAt: '2026-10-21T12:00:00.000Z', releases })

test('parseRelease aceita uma versão válida e normaliza as quebras de linha', () => {
    const parsed = C.parseRelease(release({ notes: '  Texto\r\n- item\r\n' }))
    assert.deepEqual(parsed, { version: '2.3.0', title: 'Notificações', notes: 'Texto\n- item', publishedAt: '2026-10-21T12:00:00.000Z' })
    assert.equal(C.parseRelease(release({ title: undefined })).title, '')
    assert.equal(C.parseRelease(release({ version: '3.0.0-beta.1' })).version, '3.0.0-beta.1')
})

test('parseRelease recusa versão, título, notas e data inválidos', () => {
    for(const over of [
        { version: 'v2.3.0' }, { version: '2.3' }, { version: 42 },
        { title: 'x'.repeat(81) }, { title: 'a\nb' }, { title: 'a‮b' },
        { notes: '' }, { notes: '   ' }, { notes: 'x'.repeat(4001) }, { notes: 'a\u0000b' }, { notes: null },
        { publishedAt: '2026-10-21' }, { publishedAt: null }
    ]){
        assert.equal(C.parseRelease(release(over)), null, JSON.stringify(over))
    }
    assert.equal(C.parseRelease(null), null)
})

test('parseChangelog descarta inválidas e repetidas e recusa formato desconhecido', () => {
    const parsed = C.parseChangelog(changelogOf(release(), release({ title: 'repetida' }), release({ version: 'x' }), release({ version: '2.2.1' })))
    assert.deepEqual(parsed.releases.map(r => [r.version, r.title]), [['2.3.0', 'Notificações'], ['2.2.1', 'Notificações']])
    assert.equal(parsed.dropped, 2)
    assert.throws(() => C.parseChangelog({ version: 2, releases: [] }))
    assert.throws(() => C.parseChangelog({ version: 1 }))
    assert.throws(() => C.parseChangelog(null))
})

test('findRelease aceita versão com e sem v', () => {
    const changelog = C.parseChangelog(changelogOf(release()))
    assert.equal(C.findRelease(changelog, 'v2.3.0').version, '2.3.0')
    assert.equal(C.findRelease(changelog, '2.3.0').version, '2.3.0')
    assert.equal(C.findRelease(changelog, '9.9.9'), null)
})

test('noteBlocks agrupa itens de lista e separa parágrafos', () => {
    assert.deepEqual(C.noteBlocks('Novidades da versão\n\n- Uma\n* Duas\n• Três\nFim'), [
        { type: 'p', text: 'Novidades da versão' },
        { type: 'ul', items: ['Uma', 'Duas', 'Três'] },
        { type: 'p', text: 'Fim' }
    ])
    assert.deepEqual(C.noteBlocks('<b>texto</b>'), [{ type: 'p', text: '<b>texto</b>' }])
})

test('fetchChangelog lê o arquivo, guarda em cache e não guarda falha', async () => {
    served = { status: 500, body: '' }
    await assert.rejects(C.fetchChangelog(), /HTTP 500/)
    served = { status: 200, body: JSON.stringify(changelogOf(release())) }
    const readsBefore = reads
    const first = await C.fetchChangelog()
    const second = await C.fetchChangelog()
    assert.equal(first, second)
    assert.equal(reads - readsBefore, 1, 'second call served from the cache')
    assert.equal(C.findRelease(first, '2.3.0').title, 'Notificações')
})
