/**
 * News from the RSS feed named in the distribution (distribution.rss).
 * No DOM: the feed is parsed with plain string handling and only text leaves
 * this module, so nothing from the feed is ever rendered as HTML.
 */
const got = require('got')

const TIMEOUT_MS = 4000
const MAX_BYTES = 1024 * 1024
const MAX_ARTICLES = 10

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

function decodeEntities(text){
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
        if(code[0] === '#'){
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
        }
        return ENTITIES[code.toLowerCase()] ?? m
    })
}

function unwrapCdata(text){
    return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

/** Plain text from an RSS field that may hold HTML. */
function toText(raw){
    if(raw == null){
        return ''
    }
    const html = decodeEntities(unwrapCdata(raw))
    return decodeEntities(html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>|<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[ \t\f\v\r]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim()
}

function field(item, name){
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
    const m = re.exec(item)
    return m ? m[1] : null
}

function safeLink(raw){
    const text = toText(raw)
    try {
        const url = new URL(text)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
        return null
    }
}

/**
 * @returns {Array<{title: string, link: string|null, date: string|null, author: string, summary: string}>}
 */
function parseFeed(xml){
    const articles = []
    const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []
    for(const item of items.slice(0, MAX_ARTICLES)){
        const title = toText(field(item, 'title'))
        if(!title){
            continue
        }
        const pub = toText(field(item, 'pubDate'))
        const date = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null
        const body = toText(field(item, 'description') ?? field(item, 'content:encoded'))
        articles.push({
            title: title.slice(0, 200),
            link: safeLink(field(item, 'link')),
            date,
            author: toText(field(item, 'dc:creator')).slice(0, 80),
            summary: body.length > 280 ? body.slice(0, 279).trimEnd() + '…' : body
        })
    }
    return articles
}

/**
 * @param {string|null|undefined} url The distribution's rss field.
 * @returns {Promise<Array|null>} null when there is no valid feed or it failed to load.
 */
async function fetchNews(url, client = got){
    if(!url){
        return null
    }
    let feed
    try {
        feed = new URL(url)
    } catch {
        return null
    }
    if(feed.protocol !== 'https:' && feed.protocol !== 'http:'){
        return null
    }
    try {
        const res = await client(feed.toString(), { timeout: { request: TIMEOUT_MS }, retry: { limit: 0 }, responseType: 'text' })
        if(typeof res.body !== 'string' || res.body.length > MAX_BYTES){
            return null
        }
        return parseFeed(res.body)
    } catch {
        return null
    }
}

module.exports = { parseFeed, fetchNews, toText }
