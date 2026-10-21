/**
 * Launcher release notes: reads the changelog.json the website publishes on
 * launcher-cdn and validates it. Notes are plain text, never HTML; lines that
 * start with "- " become list items. No DOM, so it runs under node --test.
 * Contract: oblyvium-website docs/superpowers/specs/2026-10-21-changelog-launcher-design.md
 */
const got = require('got')
const { isText, isIsoUtc, hasUnsafeChars } = require('./notifications')
const { version } = require('../../../package.json')

// The override exists for tests only.
const CHANGELOG_URL = process.env.OBLYVIUM_CHANGELOG_URL || 'https://launcher.oblyvium.com.br/changelog.json'
const MAX_RELEASES = 100
/** The site never serves a changelog anywhere near this size; bigger is read as broken or hostile. */
const MAX_BODY_BYTES = 512 * 1024
/** One read serves every screen for a while; the notes rarely change. */
const CACHE_MS = 5 * 60 * 1000
const SEMVER = /^\d{1,5}\.\d{1,5}\.\d{1,5}(-[0-9A-Za-z.-]{1,32})?$/
const LIST_ITEM = /^\s*[-*•]\s+(.*)$/

const http = got.extend({
    headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
    timeout: 10000,
    retry: 0,
    throwHttpErrors: false,
    responseType: 'text'
})

/** @returns {{ version: string, title: string, notes: string, publishedAt: string } | null} */
function parseRelease(raw){
    if(raw == null || typeof raw !== 'object') return null
    if(typeof raw.version !== 'string' || !SEMVER.test(raw.version)) return null
    const title = raw.title ?? ''
    if(!isText(title, 0, 80) || hasUnsafeChars(title)) return null
    if(typeof raw.notes !== 'string') return null
    const notes = raw.notes.replace(/\r\n?/g, '\n').trim()
    if(!isText(notes, 1, 4000) || hasUnsafeChars(notes, true)) return null
    if(!isIsoUtc(raw.publishedAt)) return null
    return { version: raw.version, title, notes, publishedAt: raw.publishedAt }
}

/**
 * Invalid and repeated releases are dropped one by one; a broken file as a whole throws.
 *
 * @returns {{ releases: Array<object>, dropped: number }}
 */
function parseChangelog(raw){
    if(raw == null || raw.version !== 1 || !Array.isArray(raw.releases)) throw new Error('Unknown changelog format')
    const releases = []
    const versions = new Set()
    let dropped = Math.max(0, raw.releases.length - MAX_RELEASES)
    for(const entry of raw.releases.slice(0, MAX_RELEASES)){
        const release = parseRelease(entry)
        if(release == null || versions.has(release.version)){
            dropped++
            continue
        }
        versions.add(release.version)
        releases.push(release)
    }
    return { releases, dropped }
}

/** The release for a version ("2.3.0" or "v2.3.0"), or null. */
function findRelease(changelog, wanted){
    const v = String(wanted ?? '').replace(/^v/, '')
    return changelog.releases.find(release => release.version === v) ?? null
}

/**
 * Notes as blocks to render: runs of "- " lines become one list, other lines paragraphs.
 *
 * @returns {Array<{ type: 'p', text: string } | { type: 'ul', items: string[] }>}
 */
function noteBlocks(notes){
    const blocks = []
    for(const line of notes.split('\n')){
        const text = line.trim()
        const item = LIST_ITEM.exec(line)
        const last = blocks[blocks.length - 1]
        if(item){
            if(last?.type === 'ul') last.items.push(item[1].trim())
            else blocks.push({ type: 'ul', items: [item[1].trim()] })
        } else if(text){
            blocks.push({ type: 'p', text })
        }
    }
    return blocks
}

let cache = null

/** Reads the changelog, sharing one read across callers for CACHE_MS. A failed read is not cached. */
function fetchChangelog(){
    if(cache != null && Date.now() - cache.at < CACHE_MS) return cache.promise
    const promise = (async () => {
        const res = await http.get(CHANGELOG_URL)
        // Nothing published yet: no notes for any version, which is not an error.
        if(res.statusCode === 404) return { releases: [], dropped: 0 }
        if(res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`)
        if(Buffer.byteLength(res.body) > MAX_BODY_BYTES) throw new Error('Changelog is too large')
        return parseChangelog(JSON.parse(res.body))
    })()
    cache = { at: Date.now(), promise }
    promise.catch(() => { if(cache?.promise === promise) cache = null })
    return promise
}

/** Tests only: forget the cached read. */
function resetCache(){
    cache = null
}

module.exports = {
    CHANGELOG_URL,
    resetCache,
    parseRelease,
    parseChangelog,
    findRelease,
    noteBlocks,
    fetchChangelog
}
