/**
 * Site notifications for the launcher: reads the notifications.json the
 * website publishes on launcher-cdn, validates every item and decides which
 * ones to show. No DOM and no ConfigManager, so it runs under node --test.
 * Contract: oblyvium-website docs/superpowers/specs/2026-10-18-notificacoes-launcher-design.md
 */
const got = require('got')
const { performance } = require('perf_hooks')
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
/** The site never serves a feed anywhere near this size; bigger is read as broken or hostile. */
const MAX_BODY_BYTES = 256 * 1024

const http = got.extend({
    headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
    timeout: 10000,
    retry: 0,
    throwHttpErrors: false,
    responseType: 'text'
})

const isText = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max

/** Strict ISO-8601 UTC, same shape Date.prototype.toISOString produces. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const isIsoUtc = value => typeof value === 'string' && ISO_UTC.test(value)

/**
 * C0 controls, DEL, zero-width space, LRM/RLM and bidi-override/isolate characters: never
 * legitimate in card text. Code points, not regex \u escapes, so no invisible character
 * ever sits in this source file.
 *
 * ZWNJ (U+200C) and ZWJ (U+200D) are deliberately NOT in this list: they're needed for
 * emoji sequences (flags, families, professions - e.g. the rainbow flag or "man
 * technologist") and for ligature control in some scripts.
 */
const UNSAFE_RANGES = [
    [0x00, 0x1f], // C0 controls, including \n (allowed back in for the body below)
    [0x7f, 0x7f], // DEL
    [0x200b, 0x200b], // zero-width space
    [0x200e, 0x200f], // LRM, RLM
    [0x202a, 0x202e], // bidi embedding/override
    [0x2066, 0x2069] // bidi isolates
]
const NEWLINE_CODE_POINT = 0x0a

function hasUnsafeChars(value, allowNewline = false){
    for(const char of value){
        const codePoint = char.codePointAt(0)
        if(allowNewline && codePoint === NEWLINE_CODE_POINT) continue
        if(UNSAFE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to)) return true
    }
    return false
}

/** A highlight image's filename, once the CDN folder prefix is stripped off. */
const IMAGE_NAME = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/

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
    if(!isText(raw.title, 1, 80) || hasUnsafeChars(raw.title)) return null
    if(!isText(raw.target, 1, 64)) return null
    const body = raw.body ?? ''
    if(!isText(body, 0, 400) || hasUnsafeChars(body, true)) return null
    const startsAtMs = isIsoUtc(raw.startsAt) ? Date.parse(raw.startsAt) : NaN
    const expiresAtMs = isIsoUtc(raw.expiresAt) ? Date.parse(raw.expiresAt) : NaN
    if(!Number.isFinite(startsAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startsAtMs) return null

    let link = null
    if(raw.link != null){
        const url = isText(raw.link.url, 1, 2048) ? parseUrl(raw.link.url) : null
        if(url == null || url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null
        if(!isText(raw.link.label, 1, 24) || hasUnsafeChars(raw.link.label)) return null
        link = { url: url.href, label: raw.link.label }
    }

    const highlight = raw.highlight === true
    let image = null
    if(raw.image != null){
        const url = typeof raw.image === 'string' ? parseUrl(raw.image) : null
        // Compare the normalised URL, so "notifications/../x" cannot escape the folder.
        if(!highlight || url == null || !url.href.startsWith(IMAGE_PREFIX)) return null
        if(!IMAGE_NAME.test(url.href.slice(IMAGE_PREFIX.length))) return null
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
 * @returns {{ generatedAtMs: number, items: object[], dropped: number }} `dropped` counts
 * invalid items, duplicate ids (the first occurrence wins) and items beyond MAX_ITEMS.
 * @throws When the file is not a version 1 feed.
 */
function parseFeed(data){
    const generatedAtMs = data != null && isIsoUtc(data.generatedAt) ? Date.parse(data.generatedAt) : NaN
    if(data == null || data.version !== 1 || !Array.isArray(data.notifications) || !Number.isFinite(generatedAtMs)){
        throw new Error('Invalid notifications feed')
    }
    let dropped = 0
    const seenIds = new Set()
    const valid = []
    for(const raw of data.notifications){
        const parsed = parseItem(raw)
        if(parsed == null || seenIds.has(parsed.id)){
            dropped++
            continue
        }
        seenIds.add(parsed.id)
        valid.push(parsed)
    }
    dropped += Math.max(0, valid.length - MAX_ITEMS)
    return { generatedAtMs, items: valid.slice(0, MAX_ITEMS), dropped }
}

/**
 * "Now" on the website's clock: the server's own Date header plus the time elapsed since
 * it was read, measured on a monotonic clock so a wrong PC clock neither hides nor revives
 * a notification. The site only rewrites notifications.json on create/cancel, so
 * generatedAt can be days stale and must never stand in for the current time.
 *
 * @param {{ serverNowMs: number, fetchedAtMs: number }} clock From fetchFeed.
 */
function feedClock(clock, nowMs = performance.now()){
    return clock.serverNowMs + (nowMs - clock.fetchedAtMs)
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

/** The response's own Date header, in ms, or null when missing/invalid. */
function serverClockMs(headers){
    const ms = typeof headers?.date === 'string' ? Date.parse(headers.date) : NaN
    return Number.isFinite(ms) ? ms : null
}

/**
 * @param {{ etag: string | null }} options
 * @returns {Promise<
 *   { changed: false, clock: { serverNowMs: number, fetchedAtMs: number } | null } |
 *   { changed: true, feed: object, etag: string | null, clock: { serverNowMs: number, fetchedAtMs: number } }
 * >}
 */
async function fetchFeed({ etag }){
    const res = await http.get(FEED_URL, { headers: etag ? { 'if-none-match': etag } : {} })
    const fetchedAtMs = performance.now()
    const headerClockMs = serverClockMs(res.headers)
    if(res.statusCode === 304){
        return { changed: false, clock: headerClockMs != null ? { serverNowMs: headerClockMs, fetchedAtMs } : null }
    }
    if(res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`)
    if(Buffer.byteLength(res.body) > MAX_BODY_BYTES) throw new Error('Notifications feed is too large')
    const feed = parseFeed(JSON.parse(res.body))
    const serverNowMs = headerClockMs != null ? headerClockMs : feed.generatedAtMs
    return { changed: true, feed, etag: res.headers.etag ?? null, clock: { serverNowMs, fetchedAtMs } }
}

module.exports = {
    FEED_URL,
    isText,
    isIsoUtc,
    hasUnsafeChars,
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
