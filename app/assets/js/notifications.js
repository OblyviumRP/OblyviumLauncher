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
