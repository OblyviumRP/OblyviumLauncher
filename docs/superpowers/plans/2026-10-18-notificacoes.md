# Notificações do site no launcher — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O launcher lê `https://launcher.oblyvium.com.br/notifications.json` a cada 30 s e mostra as notificações da staff em cartões no canto e em destaque no centro, com "Atualizar agora" para launcher e modpack.

**Architecture:** Módulo puro `app/assets/js/notifications.js` (busca com `If-None-Match`, validação, filtro por servidor e janela) testado com `node --test` contra um servidor local. Script de tela `app/assets/js/scripts/notifications.js` com os cartões, o destaque e as ações, carregado por um partial fora de `#main`. A parte de `dlAsync` que recarrega a distribuição, confere e baixa os arquivos vira `prepareServerFiles`, usada pelo Jogar e pelo botão do modpack.

**Tech Stack:** Electron 39 (renderer com `nodeIntegration`), scripts clássicos com globais compartilhados, `got` 11, EJS, `node --test`, verificação em Electron (`scripts/verify-*.cjs`).

**Spec:** `oblyvium-website/docs/superpowers/specs/2026-10-18-notificacoes-launcher-design.md` (seções 3 e 4 são o contrato e o comportamento do launcher). O site tem plano próprio; este plano funciona sozinho contra o servidor falso dos testes.

---

## Antes de começar

- Branch a partir de `main` (`feat/notificacoes`).
- Estilo: aspas simples, sem ponto e vírgula, indentação de 4, `if(`/`function nome(){` como no resto do código. `npm run lint` e `npm test` no fim de cada task.
- Os scripts de `app/assets/js/scripts/` compartilham globais (`ConfigManager`, `DistroAPI`, `Lang`, `LoggerUtil`, `ipcRenderer`, `shell`, `remote`, `isLaunchLocked`, `toggleLaunchArea`, `UPDATE_URL`…). O módulo puro **não** pode fazer `require('./configmanager')` (ele chama `@electron/remote` ao carregar e quebra no `node --test`).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `app/assets/js/configmanager.js` | `notificationsSeen` persistido |
| `app/assets/js/notifications.js` (novo) | Buscar, validar e filtrar o feed (sem DOM) |
| `test/helpers/fakeNotifications.js` (novo) | Servidor local do feed para testes e verificação |
| `test/notifications.test.js` (novo) | Testes do módulo |
| `app/assets/js/scripts/landing.js` | `prepareServerFiles` separado de `dlAsync` |
| `app/notifications.ejs` (novo) + `app/app.ejs` | Marcação, fora de `#main` |
| `app/assets/js/scripts/notifications.js` (novo) | Cartões, destaque, ações, leitura periódica |
| `app/assets/css/forja.css` | Estilos |
| `app/assets/lang/en_US.toml` | Textos (pt-BR) |
| `scripts/verify-notifications.cjs` (novo) + `package.json` + `electron-builder.yml` + `.gitignore` | Verificação no Electron |
| `docs/forja-launcher.md` | Documentação |

---

### Task 1: `notificationsSeen` na configuração

**Files:**
- Modify: `app/assets/js/configmanager.js:80-107` (DEFAULT_CONFIG) e perto de `getNewsCache` (`:223-234`)

- [ ] **Step 1: Default**

Em `DEFAULT_CONFIG`, depois de `profiles: {}`:

```js
    profiles: {},
    notificationsSeen: []
```

(`validateKeySet` já completa a chave nas configurações antigas.)

- [ ] **Step 2: Getter e setter**

Depois de `exports.setNewsCache`:

```js
/**
 * Ids das notificações do site que já apareceram neste computador.
 *
 * @returns {string[]}
 */
exports.getNotificationsSeen = function(){
    return Array.isArray(config.notificationsSeen) ? config.notificationsSeen : []
}

/**
 * @param {string[]} ids Replaces the list (never mutate the returned array: on a fresh
 * config it is the DEFAULT_CONFIG array itself).
 */
exports.setNotificationsSeen = function(ids){
    config.notificationsSeen = ids
}
```

- [ ] **Step 3: Lint e testes**

Run: `npm run lint && npm test`
Expected: sem erros; testes como antes.

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/configmanager.js
git commit -m "Remember which site notifications were shown"
```

---

### Task 2: Módulo do feed

**Files:**
- Create: `test/helpers/fakeNotifications.js`
- Create: `test/notifications.test.js`
- Create: `app/assets/js/notifications.js`

- [ ] **Step 1: Servidor falso**

`test/helpers/fakeNotifications.js`:

```js
/**
 * Local stand-in for launcher-cdn's notifications.json, for tests and the
 * Electron verification only. Answers 304 to a matching If-None-Match and
 * serves a 1x1 PNG under /notifications/ for highlight images.
 */
const crypto = require('crypto')
const http   = require('http')

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

exports.start = async function(){
    const state = { body: null, status: 200, requests: [] }
    const server = http.createServer((req, res) => {
        state.requests.push({ url: req.url, ifNoneMatch: req.headers['if-none-match'] ?? null })
        if(req.url.startsWith('/notifications/')){
            res.writeHead(200, { 'content-type': 'image/png' })
            return res.end(PNG_1X1)
        }
        if(req.url !== '/notifications.json'){
            res.writeHead(404)
            return res.end()
        }
        if(state.status !== 200){
            res.writeHead(state.status)
            return res.end('erro')
        }
        const body = typeof state.body === 'string' ? state.body : JSON.stringify(state.body)
        const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"'
        if(req.headers['if-none-match'] === etag){
            res.writeHead(304, { etag })
            return res.end()
        }
        res.writeHead(200, { 'content-type': 'application/json', etag })
        res.end(body)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    return {
        base,
        url: `${base}/notifications.json`,
        state,
        /** Replaces the feed (an object, or a raw string to test broken JSON). */
        setFeed: body => { state.body = body },
        close: () => new Promise(resolve => server.close(resolve))
    }
}
```

- [ ] **Step 2: Testes**

`test/notifications.test.js`:

```js
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test test/notifications.test.js`
Expected: FAIL (`Cannot find module '../app/assets/js/notifications'`).

- [ ] **Step 4: Implementar**

`app/assets/js/notifications.js`:

```js
/**
 * Site notifications for the launcher: reads the notifications.json the
 * website publishes on launcher-cdn, validates every item and decides which
 * ones to show. No DOM and no ConfigManager, so it runs under node --test.
 * Contract: oblyvium-website docs/superpowers/specs/2026-10-18-notificacoes-launcher-design.md
 */
const got = require('got')
const { version } = require('../../../package.json')

// The override exists for tests only.
const FEED_URL = process.env.OBLYVIUM_NOTIFICATIONS_URL || 'https://launcher.oblyvium.com.br/notifications.json'
/** Highlight images must live in the CDN folder next to the feed. */
const IMAGE_PREFIX = new URL('notifications/', FEED_URL).href

const POLL_MS = 30000
const AUTO_DISMISS_MS = 8000
const MAX_TOASTS = 3

const TYPES = new Set(['event', 'announcement', 'maintenance', 'launcher-update', 'modpack-update', 'other'])
/** Types that stay on screen until the player closes them or acts. */
const STICKY_TYPES = new Set(['maintenance', 'launcher-update', 'modpack-update'])
const MAX_ITEMS = 50

const http = got.extend({
    headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
    timeout: 10000,
    retry: 0,
    throwHttpErrors: false,
    responseType: 'text'
})

const isText = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max

function parseUrl(value){
    try {
        return new URL(value)
    } catch {
        return null
    }
}

/**
 * Validates one feed item. Anything unexpected drops the item.
 *
 * @returns {object | null}
 */
function parseItem(raw){
    if(raw == null || typeof raw !== 'object') return null
    if(!isText(raw.id, 1, 64) || !TYPES.has(raw.type)) return null
    if(!isText(raw.title, 1, 80) || !isText(raw.target, 1, 64)) return null
    const body = raw.body ?? ''
    if(!isText(body, 0, 400)) return null
    const startsAtMs = typeof raw.startsAt === 'string' ? Date.parse(raw.startsAt) : NaN
    const expiresAtMs = typeof raw.expiresAt === 'string' ? Date.parse(raw.expiresAt) : NaN
    if(!Number.isFinite(startsAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startsAtMs) return null

    let link = null
    if(raw.link != null){
        const url = isText(raw.link.url, 1, 2048) ? parseUrl(raw.link.url) : null
        if(url == null || url.protocol !== 'https:' || !isText(raw.link.label, 1, 24)) return null
        link = { url: url.href, label: raw.link.label }
    }

    const highlight = raw.highlight === true
    let image = null
    if(raw.image != null){
        const url = typeof raw.image === 'string' ? parseUrl(raw.image) : null
        // Compare the normalised URL, so "notifications/../x" cannot escape the folder.
        if(!highlight || url == null || !url.href.startsWith(IMAGE_PREFIX)) return null
        image = url.href
    }

    return {
        id: raw.id,
        type: raw.type,
        title: raw.title,
        body,
        link,
        target: raw.target,
        highlight,
        image,
        startsAtMs,
        expiresAtMs,
        sticky: STICKY_TYPES.has(raw.type)
    }
}

/**
 * @returns {{ generatedAtMs: number, items: object[] }}
 * @throws When the file is not a version 1 feed.
 */
function parseFeed(data){
    const generatedAtMs = data != null && typeof data.generatedAt === 'string' ? Date.parse(data.generatedAt) : NaN
    if(data == null || data.version !== 1 || !Array.isArray(data.notifications) || !Number.isFinite(generatedAtMs)){
        throw new Error('Invalid notifications feed')
    }
    const items = data.notifications.slice(0, MAX_ITEMS).map(parseItem).filter(item => item != null)
    return { generatedAtMs, items }
}

/**
 * "Now" on the website's clock: generatedAt plus the time since the file was
 * read, so a wrong PC clock neither hides nor revives a notification.
 */
function feedClock(feed, fetchedAtMs, nowMs = Date.now()){
    return feed.generatedAtMs + (nowMs - fetchedAtMs)
}

/**
 * Items to show now, oldest start first.
 *
 * @param {{ serverId: string | null, seen: Set<string>, feedNowMs: number }} ctx
 */
function pendingItems(feed, { serverId, seen, feedNowMs }){
    return feed.items
        .filter(item => item.target === 'all' || item.target === serverId)
        .filter(item => item.startsAtMs <= feedNowMs && feedNowMs < item.expiresAtMs)
        .filter(item => !seen.has(item.id))
        .sort((a, b) => a.startsAtMs - b.startsAtMs)
}

/** Keeps only the seen ids still in the feed, so the list never grows forever. */
function pruneSeen(seen, feed){
    const ids = new Set(feed.items.map(item => item.id))
    return seen.filter(id => ids.has(id))
}

/**
 * @param {{ etag: string | null }} options
 * @returns {Promise<{ changed: false } | { changed: true, feed: object, etag: string | null, fetchedAtMs: number }>}
 */
async function fetchFeed({ etag }){
    const res = await http.get(FEED_URL, { headers: etag ? { 'if-none-match': etag } : {} })
    if(res.statusCode === 304) return { changed: false }
    if(res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`)
    const feed = parseFeed(JSON.parse(res.body))
    return { changed: true, feed, etag: res.headers.etag ?? null, fetchedAtMs: Date.now() }
}

module.exports = {
    FEED_URL,
    IMAGE_PREFIX,
    POLL_MS,
    AUTO_DISMISS_MS,
    MAX_TOASTS,
    parseItem,
    parseFeed,
    feedClock,
    pendingItems,
    pruneSeen,
    fetchFeed
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/notifications.test.js`
Expected: PASS (9 testes).

- [ ] **Step 6: Lint e suíte**

Run: `npm run lint && npm test`
Expected: sem erros; todos passam.

- [ ] **Step 7: Commit**

```bash
git add app/assets/js/notifications.js test/notifications.test.js test/helpers/fakeNotifications.js
git commit -m "Read and validate site notifications"
```

---

### Task 3: `prepareServerFiles`

**Files:**
- Modify: `app/assets/js/scripts/landing.js:644-750`

O comportamento do Jogar não muda. A única diferença: a checagem de conta logada passa a vir antes de recarregar a distribuição (antes vinha depois, e sem conta o `dlAsync` só retornava).

- [ ] **Step 1: Separar a função**

Troque o começo de `dlAsync` (da linha `async function dlAsync(login = true) {` até `await disableBlockedContent(serv, gameDir, loggerLaunchSuite)`, inclusive) por:

```js
/**
 * Refreshes the distribution, then verifies and downloads the selected server's
 * files for its selected profile, and disables blocked content. Shows any failure
 * with showLaunchFailure. Leaves the launch area in its loading state; callers
 * that do not launch the game call toggleLaunchArea(false) afterwards.
 *
 * @returns {Promise<{ distro: object, serv: object, gameDir: string, configKey: string, loggerLaunchSuite: object } | null>}
 * null when something failed (already shown to the player).
 */
async function prepareServerFiles() {

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return null
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())
    if(serv == null){
        loggerLaunchSuite.error('The selected server is not in the distribution index.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return null
    }

    const profile = ProfileManager.getSelected(serv.rawServer.id)
    const gameDir = ProfileManager.getGameDir(serv.rawServer.id, profile.id)
    const configKey = ProfileManager.configKey(serv.rawServer.id, profile.id)

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)
```

…mantendo **sem mudança** todo o trecho seguinte (o comentário sobre File modules, `new FullRepair(...)`, `spawnReceiver`, os dois `childProcess.on`, a validação, o download, `setProgressBar(-1)`, `destroyReceiver()` e `await disableBlockedContent(...)`), trocando apenas os dois `return` dentro desse trecho (falha na validação e falha no download) por `return null`. Feche a função com:

```js
    await disableBlockedContent(serv, gameDir, loggerLaunchSuite)

    return { distro, serv, gameDir, configKey, loggerLaunchSuite }
}

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if(login && ConfigManager.getSelectedAccount() == null){
        loggerLanding.error('You must be logged into an account.')
        return
    }

    const prepared = await prepareServerFiles()
    if(prepared == null){
        return
    }
    const { distro, serv, gameDir, configKey, loggerLaunchSuite } = prepared
```

O resto de `dlAsync` (de `setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))` até o fim) fica igual.

- [ ] **Step 2: Conferir que nada mais mudou**

Run: `git diff -w app/assets/js/scripts/landing.js`
Expected: só a função nova, os `return null`, o bloco de login movido e a desestruturação. Nenhuma linha do trecho de FullRepair ou da abertura do jogo alterada.

- [ ] **Step 3: Lint, testes e as verificações existentes**

Run: `npm run lint && npm test && npm run verify:mods && npm run verify:visual`
Expected: tudo PASS (o `verify-mods` cobre o Jogar com conteúdo bloqueado, que passa por `prepareServerFiles`).

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/scripts/landing.js
git commit -m "Split file preparation out of the launch flow"
```

---

### Task 4: Marcação, textos e estilos

**Files:**
- Create: `app/notifications.ejs`
- Modify: `app/app.ejs:22`
- Modify: `app/assets/lang/en_US.toml` (fim do arquivo)
- Modify: `app/assets/css/forja.css` (antes do bloco `@media (prefers-reduced-motion: reduce)`)

- [ ] **Step 1: Partial**

`app/notifications.ejs`:

```html
<div id="notificationsToasts" class="notif-toasts" aria-live="polite" aria-label="<%- lang('notifications.region') %>"></div>
<div id="notificationsHighlight" class="notif-highlight" role="dialog" aria-modal="true" aria-labelledby="notificationsHighlightTitle" hidden>
    <div class="notif-highlight-card"></div>
</div>
<script src="./assets/js/scripts/notifications.js"></script>
```

Em `app/app.ejs`, logo depois de `<%- include('overlay') %>` (fora de `#main`, que tem `overflow: clip` e fica escurecido com o overlay aberto):

```html
    <%- include('notifications') %>
```

- [ ] **Step 2: Textos**

No fim de `app/assets/lang/en_US.toml`:

```toml

[ejs.notifications]
region = "Notificações"

[js.notifications]
close = "Fechar"
updateNow = "Atualizar agora"
download = "Baixar"
retry = "Tentar de novo"
checking = "Procurando a versão nova..."
downloadingUpdate = "Baixando a versão nova..."
updateReady = "Versão nova pronta."
restartToInstall = "Reiniciar e instalar"
downloadOpened = "O download abriu no navegador."
upToDate = "Você já está na versão mais nova."
updateFailed = "Não foi possível atualizar agora."
updatingModpack = "Atualizando o modpack..."
modpackUpdated = "Modpack atualizado."
modpackFailed = "Não foi possível atualizar o modpack."
closeGameFirst = "Feche o jogo para atualizar."

[js.notifications.type]
event = "Evento"
announcement = "Anúncio"
maintenance = "Manutenção"
launcherUpdate = "Launcher"
modpackUpdate = "Modpack"
other = "Aviso"
```

- [ ] **Step 3: Estilos**

Em `app/assets/css/forja.css`, antes de `@media (prefers-reduced-motion: reduce)` (que já desliga as animações):

```css
/* Notificações do site: cartões acima da barra do Jogar e destaque no centro. */
.notif-toasts { position: fixed; right: 16px; bottom: calc(124px + 16px); z-index: 300; display: flex; flex-direction: column-reverse; gap: 10px; width: min(320px, calc(100vw - 32px)); pointer-events: none; }
.notif-toast { position: relative; pointer-events: auto; padding: 12px 14px; background: var(--card); border: 1px solid var(--primary-line); border-radius: 8px; box-shadow: var(--shadow-dialog); animation: notif-in var(--dur-slow) var(--ease-forja); }
@keyframes notif-in { from { opacity: 0; transform: translateY(8px); } }
.notif-close { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted-foreground); cursor: pointer; }
.notif-close:hover { background: var(--accent); color: var(--foreground); }
.notif-chip { display: inline-block; padding: 0 6px; border: 1px solid; border-radius: 4px; font: 700 10px/1.6 var(--font-sans); letter-spacing: .08em; text-transform: uppercase; }
.notif-chip-event { color: var(--warning-fg); background: var(--warning-soft); border-color: var(--warning-line); }
.notif-chip-announcement { color: var(--success-fg); background: var(--success-soft); border-color: var(--success-line); }
.notif-chip-maintenance { color: var(--danger-fg); background: var(--danger-soft); border-color: var(--danger-line); }
.notif-chip-launcher-update, .notif-chip-modpack-update, .notif-chip-other { color: var(--primary-fg); background: var(--primary-soft); border-color: var(--primary-line); }
.notif-title { margin: 6px 28px 2px 0; font: 600 14px/1.35 var(--font-sans); color: var(--foreground); overflow-wrap: anywhere; }
.notif-body { margin: 0; font-size: 12px; line-height: 1.45; color: var(--muted-foreground); white-space: pre-line; overflow-wrap: anywhere; }
.notif-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.notif-btn { min-height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 6px; background: var(--primary-fill); color: #fff; font: 600 12px var(--font-sans); cursor: pointer; }
.notif-btn:hover:not(:disabled) { background: var(--fj-primary-hover); }
.notif-btn-secondary { background: transparent; color: var(--primary-fg); border-color: var(--primary-line); }
.notif-btn-secondary:hover:not(:disabled) { background: var(--primary-soft); }
.notif-btn:disabled { opacity: .55; cursor: not-allowed; }
.notif-status { margin: 8px 0 0; font-size: 11px; color: var(--muted-foreground); }
.notif-highlight { position: fixed; inset: var(--fj-frame-height) 0 0 0; z-index: 450; display: grid; place-items: center; padding: 24px; background: var(--fj-overlay); }
.notif-highlight-card { width: min(100%, 460px); max-height: 100%; overflow-y: auto; background: var(--card); border: 1px solid var(--primary-line); border-radius: 10px; box-shadow: var(--shadow-dialog); animation: notif-in var(--dur-slow) var(--ease-forja); }
.notif-image { display: block; width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px 10px 0 0; }
.notif-highlight-content { padding: 20px 22px; }
.notif-highlight .notif-title { margin-right: 0; font-size: 18px; }
@media (max-width: 650px) { .notif-toasts { bottom: calc(180px + 16px); } }
```

- [ ] **Step 4: Conferir que o TOML carrega e o EJS renderiza**

Run: `node -e "require('toml').parse(require('fs').readFileSync('app/assets/lang/en_US.toml','utf8'));console.log('ok')"`
Expected: `ok`. (O partial carrega um script que ainda não existe; ele é criado na Task 5, então não abra o app entre as duas tasks.)

- [ ] **Step 5: Commit**

```bash
git add app/notifications.ejs app/app.ejs app/assets/lang/en_US.toml app/assets/css/forja.css
git commit -m "Add markup, texts and styles for site notifications"
```

---

### Task 5: Cartões, destaque e ações

**Files:**
- Create: `app/assets/js/scripts/notifications.js`

- [ ] **Step 1: Implementar**

`app/assets/js/scripts/notifications.js`:

```js
/**
 * Site notifications: cards in the corner and a centered highlight. Reads the
 * feed through notifications.js every 30 s and shows what is meant for the
 * selected server and not seen yet. Loaded after landing.js and overlay.js.
 */
const Notifications = require('./assets/js/notifications')

const loggerNotifications = LoggerUtil.getLogger('Notifications')
const notificationsToasts = document.getElementById('notificationsToasts')
const notificationsHighlight = document.getElementById('notificationsHighlight')

const NOTIFICATION_TYPE_KEYS = {
    'event': 'event',
    'announcement': 'announcement',
    'maintenance': 'maintenance',
    'launcher-update': 'launcherUpdate',
    'modpack-update': 'modpackUpdate',
    'other': 'other'
}

let notificationsFeed = null
let notificationsEtag = null
let notificationsPolling = false
const shownToasts = new Map()
let shownHighlight = null
let highlightReturnFocus = null
/** Disable/enable callbacks of the modpack buttons on screen, run when the launch lock changes. */
const notificationLockWatchers = new Set()

function notifEl(tag, className, text){
    const element = document.createElement(tag)
    if(className) element.className = className
    if(text != null) element.textContent = text
    return element
}

function notifButton(text, secondary = false){
    const button = notifEl('button', secondary ? 'notif-btn notif-btn-secondary' : 'notif-btn', text)
    button.type = 'button'
    return button
}

function setNotificationStatus(status, text){
    status.textContent = text
    status.hidden = false
}

function markNotificationSeen(id){
    const seen = ConfigManager.getNotificationsSeen()
    if(!seen.includes(id)){
        ConfigManager.setNotificationsSeen([...seen, id])
        ConfigManager.save()
    }
}

/** Main UI only: nothing before login, nothing while the window is minimised. */
function notificationsCanShow(){
    return !document.hidden && [VIEWS.landing, VIEWS.settings, VIEWS.mods].includes(getCurrentView())
}

function launcherUpdateButton(status){
    const button = notifButton(Lang.queryJS(process.platform === 'darwin' ? 'notifications.download' : 'notifications.updateNow'))
    button.onclick = () => {
        button.disabled = true
        setNotificationStatus(status, Lang.queryJS('notifications.checking'))
        const onUpdate = (_event, arg, info) => {
            if(arg === 'update-available' && process.platform === 'darwin'){
                stop()
                shell.openExternal(`${UPDATE_URL}Oblyvium-Launcher-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`)
                button.disabled = false
                setNotificationStatus(status, Lang.queryJS('notifications.downloadOpened'))
            } else if(arg === 'update-available'){
                setNotificationStatus(status, Lang.queryJS('notifications.downloadingUpdate'))
            } else if(arg === 'update-downloaded'){
                stop()
                button.textContent = Lang.queryJS('notifications.restartToInstall')
                button.disabled = false
                button.onclick = () => ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                setNotificationStatus(status, Lang.queryJS('notifications.updateReady'))
            } else if(arg === 'update-not-available'){
                stop()
                button.hidden = true
                setNotificationStatus(status, Lang.queryJS('notifications.upToDate'))
            } else if(arg === 'realerror'){
                stop()
                button.textContent = Lang.queryJS('notifications.retry')
                button.disabled = false
                setNotificationStatus(status, Lang.queryJS('notifications.updateFailed'))
            }
        }
        const stop = () => ipcRenderer.removeListener('autoUpdateNotification', onUpdate)
        ipcRenderer.on('autoUpdateNotification', onUpdate)
        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
    }
    return button
}

function modpackUpdateButton(status){
    const button = notifButton(Lang.queryJS('notifications.updateNow'))
    const sync = () => {
        if(!button.isConnected){
            notificationLockWatchers.delete(sync)
            return
        }
        if(button.dataset.busy) return
        button.disabled = isLaunchLocked()
        if(gameRunning > 0){
            setNotificationStatus(status, Lang.queryJS('notifications.closeGameFirst'))
        } else if(status.textContent === Lang.queryJS('notifications.closeGameFirst')){
            status.hidden = true
        }
    }
    notificationLockWatchers.add(sync)
    button.onclick = async () => {
        if(isLaunchLocked()) return
        button.dataset.busy = '1'
        button.disabled = true
        setNotificationStatus(status, Lang.queryJS('notifications.updatingModpack'))
        const prepared = await prepareServerFiles()
        delete button.dataset.busy
        if(prepared != null){
            toggleLaunchArea(false)
            button.hidden = true
            setNotificationStatus(status, Lang.queryJS('notifications.modpackUpdated'))
        } else {
            button.textContent = Lang.queryJS('notifications.retry')
            setNotificationStatus(status, Lang.queryJS('notifications.modpackFailed'))
            sync()
        }
    }
    // Run after the button is in the page, so isConnected is true.
    setTimeout(sync)
    return button
}

/**
 * Fills a card with chip, title, text and buttons. Text always goes in as
 * text, never as HTML.
 *
 * @returns {HTMLElement} The title element.
 */
function buildNotificationBody(item, container, extraButtons = []){
    container.append(notifEl('span', 'notif-chip notif-chip-' + item.type, Lang.queryJS('notifications.type.' + NOTIFICATION_TYPE_KEYS[item.type])))
    const title = notifEl('h3', 'notif-title', item.title)
    container.append(title)
    if(item.body) container.append(notifEl('p', 'notif-body', item.body))

    const status = notifEl('p', 'notif-status')
    status.setAttribute('role', 'status')
    status.hidden = true
    const actions = notifEl('div', 'notif-actions')
    if(item.type === 'launcher-update') actions.append(launcherUpdateButton(status))
    if(item.type === 'modpack-update') actions.append(modpackUpdateButton(status))
    if(item.link){
        const link = notifButton(item.link.label + ' ↗', true)
        link.onclick = () => shell.openExternal(item.link.url)
        actions.append(link)
    }
    actions.append(...extraButtons)
    if(actions.childElementCount > 0) container.append(actions)
    container.append(status)
    return title
}

function removeToast(id){
    const card = shownToasts.get(id)
    if(card == null) return
    shownToasts.delete(id)
    card.remove()
    renderNotifications()
}

function showToast(item){
    markNotificationSeen(item.id)
    const card = notifEl('article', 'notif-toast')
    card.dataset.id = item.id
    card.setAttribute('aria-label', item.title)
    const close = notifEl('button', 'notif-close', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', Lang.queryJS('notifications.close'))
    close.onclick = () => removeToast(item.id)
    card.append(close)
    buildNotificationBody(item, card)
    notificationsToasts.append(card)
    shownToasts.set(item.id, card)

    if(!item.sticky){
        let timer = null
        const start = () => {
            clearTimeout(timer)
            timer = setTimeout(() => removeToast(item.id), Notifications.AUTO_DISMISS_MS)
        }
        const pause = () => clearTimeout(timer)
        card.addEventListener('mouseenter', pause)
        card.addEventListener('mouseleave', start)
        card.addEventListener('focusin', pause)
        card.addEventListener('focusout', start)
        start()
    }
}

function openHighlight(item){
    markNotificationSeen(item.id)
    shownHighlight = item.id
    highlightReturnFocus = document.activeElement
    const card = notificationsHighlight.querySelector('.notif-highlight-card')
    card.replaceChildren()
    if(item.image){
        const image = notifEl('img', 'notif-image')
        image.alt = ''
        image.onerror = () => image.remove()
        image.src = item.image
        card.append(image)
    }
    const content = notifEl('div', 'notif-highlight-content')
    const close = notifButton(Lang.queryJS('notifications.close'), true)
    close.onclick = closeHighlight
    const title = buildNotificationBody(item, content, [close])
    title.id = 'notificationsHighlightTitle'
    card.append(content)
    notificationsHighlight.hidden = false
    const first = content.querySelector('button:not([disabled]):not([hidden])')
    if(first) first.focus()
}

function closeHighlight(){
    notificationsHighlight.hidden = true
    shownHighlight = null
    if(highlightReturnFocus && typeof highlightReturnFocus.focus === 'function') highlightReturnFocus.focus()
    highlightReturnFocus = null
    renderNotifications()
}

notificationsHighlight.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
        event.preventDefault()
        event.stopPropagation()
        closeHighlight()
        return
    }
    if(event.key !== 'Tab') return
    const buttons = [...notificationsHighlight.querySelectorAll('button:not([disabled]):not([hidden])')]
    if(buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if(event.shiftKey && document.activeElement === first){
        event.preventDefault()
        last.focus()
    } else if(!event.shiftKey && document.activeElement === last){
        event.preventDefault()
        first.focus()
    }
})

function renderNotifications(){
    const overlay = isOverlayVisible()
    // A launcher dialog takes the keyboard; the cards wait behind it.
    notificationsToasts.inert = overlay
    if(notificationsFeed == null || !notificationsCanShow()) return
    const pending = Notifications.pendingItems(notificationsFeed.feed, {
        serverId: ConfigManager.getSelectedServer(),
        seen: new Set(ConfigManager.getNotificationsSeen()),
        feedNowMs: Notifications.feedClock(notificationsFeed.clock)
    })
    if(!overlay && shownHighlight == null){
        const highlight = pending.find(item => item.highlight)
        if(highlight) openHighlight(highlight)
    }
    for(const item of pending){
        if(item.highlight || shownToasts.has(item.id)) continue
        if(shownToasts.size >= Notifications.MAX_TOASTS) break
        showToast(item)
    }
}

async function pollNotifications(){
    if(notificationsPolling) return
    notificationsPolling = true
    try {
        const result = await Notifications.fetchFeed({ etag: notificationsEtag })
        if(result.changed){
            notificationsFeed = { feed: result.feed, clock: result.clock }
            notificationsEtag = result.etag
            if(result.feed.dropped > 0) loggerNotifications.warn(`Ignored ${result.feed.dropped} invalid or repeated notification(s).`)
            ConfigManager.setNotificationsSeen(Notifications.pruneSeen(ConfigManager.getNotificationsSeen(), result.feed))
            ConfigManager.save()
        } else if(notificationsFeed != null && result.clock != null){
            // 304: same file, fresh server clock (scheduled and expired items depend on it).
            notificationsFeed.clock = result.clock
        }
    } catch(err) {
        loggerNotifications.warn('Could not read the notifications feed:', err.message)
    } finally {
        notificationsPolling = false
    }
    renderNotifications()
}

// Re-filter when the selected server changes and react to the launch lock.
// Function declarations in classic scripts are writable globals, and callers
// resolve them at call time, so wrapping here reaches every caller.
const notificationsBaseUpdateSelectedServer = updateSelectedServer
updateSelectedServer = function(...args){
    const result = notificationsBaseUpdateSelectedServer.apply(this, args)
    renderNotifications()
    return result
}
const notificationsBaseRefreshLaunchLock = refreshLaunchLock
refreshLaunchLock = function(...args){
    const result = notificationsBaseRefreshLaunchLock.apply(this, args)
    notificationLockWatchers.forEach(sync => sync())
    return result
}

document.addEventListener('visibilitychange', renderNotifications)
setInterval(pollNotifications, Notifications.POLL_MS)
pollNotifications()
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sem erros (`no-undef` e `no-unused-vars` estão desligados para `app/assets/js/scripts/*.js`).

- [ ] **Step 3: Abrir o launcher apontando para o servidor falso**

Num terminal: `node -e "require('./test/helpers/fakeNotifications').start().then(f=>{f.setFeed({version:1,generatedAt:new Date().toISOString(),notifications:[{id:'t1',type:'event',title:'Teste',body:'Funciona?',target:'all',highlight:false,image:null,link:null,startsAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}]});console.log(f.url)})"`

Em outro: `OBLYVIUM_NOTIFICATIONS_URL=<url impressa> npm start` (PowerShell: `$env:OBLYVIUM_NOTIFICATIONS_URL='<url>'; npm start`).
Expected: depois de entrar, o cartão "Teste" aparece acima do Jogar e some em 8 s. Feche e abra de novo: ele não volta.

- [ ] **Step 4: Commit**

```bash
git add app/assets/js/scripts/notifications.js
git commit -m "Show site notifications in the launcher"
```

---

### Task 6: Verificação no Electron

**Files:**
- Create: `scripts/verify-notifications.cjs`
- Modify: `package.json` (scripts), `electron-builder.yml` (files), `.gitignore`

- [ ] **Step 1: Script**

`scripts/verify-notifications.cjs`:

```js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert/strict')
const Fake = require('../test/helpers/fakeNotifications')

const root = path.resolve(__dirname, '..')
const output = path.join(os.tmpdir(), 'oblyvium-notifications-qa')
const fixture = path.join(root, 'app', '.notifications-qa.html')
const SERVER = 'notif-qa'
const remoteMain = require('@electron/remote/main')
remoteMain.initialize()
fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
process.env.APPDATA = path.join(output, 'appdata')
process.env.ELECTRON_IS_DEV = '1'
app.setPath('userData', path.join(output, 'userData'))
app.disableHardwareAcceleration()

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
const checks = []
const check = name => checks.push(name)

const iso = ms => new Date(ms).toISOString()
function feed(fakeBase, extra = []){
    const now = Date.now()
    const base = { body: '', link: null, target: 'all', highlight: false, image: null, startsAt: iso(now - 60000), expiresAt: iso(now + 3600000) }
    return {
        version: 1,
        generatedAt: iso(now),
        notifications: [
            { ...base, id: 'destaque', type: 'event', title: '<img src=x onerror="window.__xss=1">Torneio', body: 'Na Arena às 20h.', highlight: true, image: fakeBase + '/notifications/torneio.png', link: { url: 'https://oblyvium.com.br/eventos', label: 'Ver no site' } },
            { ...base, id: 'evento', type: 'announcement', title: 'Loja aberta' },
            { ...base, id: 'modpack', type: 'modpack-update', title: 'Modpack atualizado', target: SERVER },
            { ...base, id: 'launcher', type: 'launcher-update', title: 'Launcher 2.0.5' },
            { ...base, id: 'fila', type: 'other', title: 'Na fila' },
            { ...base, id: 'outro-servidor', type: 'event', title: 'Não aparece', target: 'outro' },
            ...extra
        ]
    }
}

app.whenReady().then(async () => {
    let fake = null
    let failed = false
    try {
        fake = await Fake.start()
        fake.setFeed(feed(fake.base))
        process.env.OBLYVIUM_NOTIFICATIONS_URL = fake.url

        const preload = path.join(output, 'preload.cjs')
        fs.writeFileSync(preload, `
const root = ${JSON.stringify(root)};
const C = require(root + '/app/assets/js/configmanager');
C.load();
C.addMojangAuthAccount('00000000000000000000000000000001', 'offline', 'NotifQA', 'NotifQA');
C.setSelectedAccount('00000000000000000000000000000001');
require(root + '/app/assets/js/langloader').setupLanguage();
const api = require(root + '/app/assets/js/distromanager').DistroAPI;
const {HeliosDistribution} = require(root + '/node_modules/helios-core/dist/common/distribution/DistributionFactory.js');
const server = id => ({ id, name: 'Servidor ' + id, description: 'QA', icon: '', address: '127.0.0.1:25565',
    minecraftVersion: '1.20.1', version: '1.0.0', mainServer: id === ${JSON.stringify(SERVER)}, autoconnect: false, modules: [] });
const raw = { version: '1.0.0', servers: [server(${JSON.stringify(SERVER)}), server('outro')] };
api.rawDistribution = raw;
api.distribution = new HeliosDistribution(raw, C.getCommonDirectory(), C.getInstanceDirectory());
api.refreshDistributionOrFallback = async () => api.distribution;
C.setSelectedServer(${JSON.stringify(SERVER)});
C.save();
`)

        const ejs = require('ejs')
        const Lang = require('../app/assets/js/langloader')
        Lang.setupLanguage()
        fs.writeFileSync(fixture, await ejs.renderFile(path.join(root, 'app/app.ejs'), { bkid: 0, lang: Lang.queryEJS }))

        const win = new BrowserWindow({ width: 1100, height: 700, frame: false, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, preload } })
        remoteMain.enable(win.webContents)
        win.webContents.on('console-message', e => {
            if(e.level === 'error'){
                console.error('Renderer:', e.message)
                if(/Uncaught|SyntaxError|ReferenceError|TypeError/.test(e.message)) errors.push(e.message)
            }
        })
        const run = code => win.webContents.executeJavaScript(code)
        const waitFor = async (expr, label, ms = 20000) => {
            const start = Date.now()
            while(!(await run(expr))){
                if(Date.now() - start > ms) throw new Error('Timeout: ' + label)
                await pause(100)
            }
        }
        const key = async keyCode => {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
            await pause(150)
        }
        const screenshot = async name => {
            await run('document.fonts.ready')
            await win.webContents.capturePage()
            await pause(80)
            fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
        }
        const toastIds = () => run('[...document.querySelectorAll(".notif-toast")].map(t => t.dataset.id)')

        const boot = async () => {
            await win.loadFile(fixture)
            await run('$.fx.off = true')
            await run('syncModConfigurations(DistroAPI.distribution); ensureJavaSettings(DistroAPI.distribution); showMainUI(DistroAPI.distribution)')
            await pause(2300)
            await run(`$('#main > div').hide(); $('#overlayContainer, #loadingContainer').hide(); $('#main').show(); currentView = VIEWS.landing; $(currentView).show();`)
            await run('window.__opened = []; shell.openExternal = url => { window.__opened.push(url); return Promise.resolve() }')
            await run('window.__sent = []; ipcRenderer.send = (...args) => window.__sent.push(args)')
        }
        await boot()
        await run('renderNotifications()')

        // Highlight first, with the HTML in the title shown as text.
        await waitFor('!document.getElementById("notificationsHighlight").hidden', 'highlight opens')
        assert.equal(await run('document.getElementById("notificationsHighlightTitle").textContent'), '<img src=x onerror="window.__xss=1">Torneio')
        assert.equal(await run('window.__xss === undefined && document.querySelector("#notificationsHighlight .notif-title img") === null'), true)
        await waitFor('document.querySelector(".notif-image")?.naturalWidth === 1', 'highlight image loads')
        assert.equal(await run('document.activeElement.closest("#notificationsHighlight") !== null'), true)
        await screenshot('notifications-highlight')
        await run('[...document.querySelectorAll("#notificationsHighlight button")].find(b => b.textContent.startsWith("Ver no site")).click()')
        assert.deepEqual(await run('window.__opened'), ['https://oblyvium.com.br/eventos'])
        check('highlight: text-only title, image, focus inside, link opens externally')

        await key('Escape')
        assert.equal(await run('document.getElementById("notificationsHighlight").hidden'), true)
        check('Escape closes the highlight')

        // Cards: three at most, only for this server.
        await waitFor('document.querySelectorAll(".notif-toast").length === 3', 'three cards')
        const first = await toastIds()
        assert.deepEqual(first, ['evento', 'modpack', 'launcher'])
        assert.equal(first.includes('outro-servidor'), false)
        await screenshot('notifications-cards')
        check('three cards for the selected server, the rest queued')

        // The non-sticky card leaves on its own and the queue moves.
        await waitFor('!document.querySelector(".notif-toast[data-id=evento]")', 'announcement auto-dismiss', 12000)
        await waitFor('document.querySelector(".notif-toast[data-id=fila]") !== null', 'queued card shows')
        assert.ok((await toastIds()).includes('launcher'))
        check('announcement dismisses itself, update stays, queue advances')

        // Modpack: locked while the game runs, then updates without launching.
        await run('gameRunning = 1; refreshLaunchLock()')
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").disabled'), true)
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-status").textContent'), Lang.queryJS('notifications.closeGameFirst'))
        await run('gameRunning = 0; refreshLaunchLock()')
        assert.equal(await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").disabled'), false)
        await run('window.__prepared = 0; prepareServerFiles = async () => { window.__prepared++; return {} }')
        await run('document.querySelector(".notif-toast[data-id=modpack] .notif-btn").click()')
        await waitFor(`document.querySelector(".notif-toast[data-id=modpack] .notif-status").textContent === ${JSON.stringify(Lang.queryJS('notifications.modpackUpdated'))}`, 'modpack updated')
        assert.equal(await run('window.__prepared'), 1)
        check('modpack button: disabled while playing, prepares files without launching')

        // Launcher update: asks the updater, then offers restart and install.
        await run('document.querySelector(".notif-toast[data-id=launcher] .notif-btn").click()')
        assert.deepEqual(await run('window.__sent'), [['autoUpdateAction', 'checkForUpdate']])
        await run(`ipcRenderer.emit('autoUpdateNotification', {}, 'update-downloaded', { version: '2.0.5' })`)
        assert.equal(await run('document.querySelector(".notif-toast[data-id=launcher] .notif-btn").textContent'), Lang.queryJS('notifications.restartToInstall'))
        check('launcher update button drives the updater')

        // Seen ids survive a restart: nothing shows again.
        assert.deepEqual((await run('ConfigManager.getNotificationsSeen()')).sort(), ['destaque', 'evento', 'fila', 'launcher', 'modpack'].sort())
        await boot()
        await run('renderNotifications()')
        await pause(800)
        assert.deepEqual(await toastIds(), [])
        assert.equal(await run('document.getElementById("notificationsHighlight").hidden'), true)
        check('seen notifications do not come back after a restart')

        // A new one arrives on the next read; 800x600 keeps everything in view.
        fake.setFeed(feed(fake.base, [{ id: 'nova', type: 'maintenance', title: 'Manutenção às 22h', body: '', link: null, target: 'all', highlight: false, image: null, startsAt: iso(Date.now() - 1000), expiresAt: iso(Date.now() + 3600000) }]))
        await run('pollNotifications()')
        await waitFor('document.querySelector(".notif-toast[data-id=nova]") !== null', 'new notification on next read')
        win.setSize(800, 600)
        await pause(250)
        assert.equal(await run('(() => { const r = document.querySelector(".notif-toast[data-id=nova]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })()'), true)
        await screenshot('notifications-800')
        win.setSize(1100, 700)
        check('new notification on the next read; fits at 800x600')

        assert.deepEqual(errors, [], 'renderer errors')
        check('no renderer exceptions')
        console.log(JSON.stringify({ result: 'PASS', output, checks }, null, 2))
    } catch(err) {
        failed = true
        console.error('QA FAILED', err)
    } finally {
        await fake?.close()
        fs.rmSync(fixture, { force: true })
        app.exit(failed ? 1 : 0)
    }
})
```

Se a ordem dos três primeiros cartões vier diferente de `['evento', 'modpack', 'launcher']`, é porque os `startsAt` empatam e a ordenação preserva a ordem do arquivo; ajuste o teste para comparar conjuntos, não a ordem.

- [ ] **Step 2: Script npm, empacotamento e gitignore**

`package.json`, em `scripts`, depois de `verify:mods`:

```json
    "verify:notifications": "electron scripts/verify-notifications.cjs",
```

`electron-builder.yml`, em `files`, depois de `'!scripts/publish-update.cjs'`:

```yaml
  - '!scripts/verify-notifications.cjs'
  - '!app/.notifications-qa.html'
```

`.gitignore`, depois de `/app/.mods-qa.html`:

```
/app/.notifications-qa.html
```

- [ ] **Step 3: Rodar**

Run: `npm run verify:notifications`
Expected: JSON com `"result": "PASS"` e as 9 checagens; capturas em `%TEMP%/oblyvium-notifications-qa`. Abra as três capturas e confira o visual (cartões acima do Jogar, destaque centralizado, nada cortado em 800×600).

- [ ] **Step 4: As outras verificações continuam passando**

Run: `npm test && npm run lint && npm run verify:mods && npm run verify:visual`
Expected: tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-notifications.cjs package.json electron-builder.yml .gitignore
git commit -m "Add Electron verification for site notifications"
```

---

### Task 7: Documentação

**Files:**
- Modify: `docs/forja-launcher.md` (seção nova antes de "## Publicar uma versão")

- [ ] **Step 1: Texto**

```markdown
## Notificações do site

A staff dispara notificações pelo painel do site (Launcher → Notificações). O launcher lê `https://launcher.oblyvium.com.br/notifications.json` ao abrir e a cada 30 segundos e mostra o que é para "Todos" ou para o servidor selecionado, dentro da janela de validade e ainda não visto neste computador (`notificationsSeen` na configuração).

- Cartões no canto, acima do Jogar, no máximo 3 por vez. Evento, anúncio e aviso somem em 8 segundos; manutenção e atualizações ficam até o jogador fechar.
- Destaque: abre no centro, com imagem, e só fecha pelo jogador (Esc ou Fechar).
- "Atualizar agora": no launcher, procura e baixa a versão nova e oferece "Reiniciar e instalar" (no macOS abre o `.dmg`); no modpack, confere e baixa os arquivos do servidor sem abrir o jogo (desativado com o jogo aberto).
- Nada aparece antes do login nem com a janela minimizada. Texto sempre como texto, links só `https://`, imagens só do CDN do launcher.

`npm run verify:notifications` testa tudo isso contra um servidor local (`test/helpers/fakeNotifications.js`); `OBLYVIUM_NOTIFICATIONS_URL` troca o endereço do feed só para testes.
```

- [ ] **Step 2: Commit**

```bash
git add docs/forja-launcher.md
git commit -m "Document site notifications"
```
