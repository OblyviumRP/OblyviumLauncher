/**
 * Publishes one platform's build to the Oblyvium website, which serves the
 * auto-update feed at launcher.oblyvium.com.br/updates/.
 *
 *   node scripts/publish-update.cjs <dist dir> <latest.yml | latest-mac.yml | latest-linux.yml>
 *
 * Env: LAUNCHER_PUBLISH_URL (default https://staff.oblyvium.com.br) and
 * LAUNCHER_PUBLISH_KEY (the website's LAUNCHER_PUBLISH_KEY).
 *
 * The website checks each latest*.yml against the files it already has, so
 * every file the yml lists (plus its .blockmap, when there is one) goes first
 * and the yml goes last. Files are sent in 8 MB pieces because Cloudflare
 * limits the request size. A file the website already has is skipped:
 * installer names are immutable there, and if the content differs the yml
 * upload fails, which is the signal to bump the version.
 */
const fs   = require('fs')
const path = require('path')

const CHUNK_BYTES = 8 * 1024 * 1024
const RETRIES = 3

/** File names listed under `files:` in an electron-builder latest*.yml. */
function feedFiles(yml){
    const names = []
    for(const line of yml.split(/\r?\n/)){
        const m = /^\s*-\s*url:\s*(.+?)\s*$/.exec(line)
        if(m) names.push(m[1].replace(/^['"]|['"]$/g, ''))
    }
    return names
}

/** Every file to send for a feed, in order: listed files, their blockmaps, then the feed. */
function publishPlan(distDir, feed){
    const ymlPath = path.join(distDir, feed)
    if(!fs.existsSync(ymlPath)) throw new Error(`${feed} not found in ${distDir}`)
    const files = []
    for(const name of feedFiles(fs.readFileSync(ymlPath, 'utf8'))){
        if(name.includes('/') || name.includes('\\')) throw new Error(`Unexpected path in ${feed}: ${name}`)
        files.push(name)
        if(fs.existsSync(path.join(distDir, `${name}.blockmap`))) files.push(`${name}.blockmap`)
    }
    if(files.length === 0) throw new Error(`${feed} lists no files`)
    return [...files, feed]
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function putChunk({ baseUrl, key, name, offset, total, body }){
    const url = `${baseUrl}/api/ci/launcher/updates/${encodeURIComponent(name)}?offset=${offset}&total=${total}`
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Launcher ${key}`, 'Content-Type': 'application/octet-stream' },
        body
    })
    let payload = null
    try { payload = await res.json() } catch { /* non-JSON error page (proxy, Cloudflare) */ }
    return { status: res.status, payload }
}

const errorText = (r) => r.payload?.error?.message ?? r.payload?.error?.code ?? `HTTP ${r.status}`

/**
 * Sends one file. Returns 'sent' or 'exists'. A failed piece restarts the
 * file from offset 0, which is what the website expects after an error.
 */
async function sendFile({ baseUrl, key, distDir, name, log = console.log }){
    const data = fs.readFileSync(path.join(distDir, name))
    const total = data.length
    for(let attempt = 1; ; attempt++){
        let offset = 0
        let failure = null
        while(offset < total){
            const body = data.subarray(offset, Math.min(offset + CHUNK_BYTES, total))
            let r
            try {
                r = await putChunk({ baseUrl, key, name, offset, total, body })
            } catch(err) {
                failure = { retry: true, message: err.message }
                break
            }
            if(r.status === 409 && offset === 0 && r.payload?.error?.code === 'UPDATE_FILE_EXISTS') return 'exists'
            if(r.status >= 200 && r.status < 300){
                offset += body.length
                continue
            }
            // 429 and 5xx are worth another try; anything else is a real refusal.
            failure = { retry: r.status === 429 || r.status >= 500, message: errorText(r) }
            break
        }
        if(failure == null){
            log(`  sent ${name} (${total} bytes)`)
            return 'sent'
        }
        if(!failure.retry || attempt >= RETRIES) throw new Error(`${name}: ${failure.message}`)
        log(`  ${name}: ${failure.message}, retrying (${attempt}/${RETRIES - 1})`)
        await sleep(5000 * attempt)
    }
}

async function publish({ distDir, feed, baseUrl, key, log = console.log }){
    if(!key) throw new Error('LAUNCHER_PUBLISH_KEY is not set.')
    const plan = publishPlan(distDir, feed)
    log(`Publishing ${feed} to ${baseUrl}: ${plan.join(', ')}`)
    for(const name of plan){
        const result = await sendFile({ baseUrl, key, distDir, name, log })
        if(result === 'exists') log(`  ${name} is already on the website, skipped`)
    }
    log(`Published ${feed}.`)
}

module.exports = { feedFiles, publishPlan, sendFile, publish, CHUNK_BYTES }

if(require.main === module){
    const [distDir, feed] = process.argv.slice(2)
    if(!distDir || !feed){
        console.error('Usage: node scripts/publish-update.cjs <dist dir> <latest*.yml>')
        process.exit(2)
    }
    publish({
        distDir,
        feed,
        baseUrl: (process.env.LAUNCHER_PUBLISH_URL || 'https://staff.oblyvium.com.br').replace(/\/+$/, ''),
        key: process.env.LAUNCHER_PUBLISH_KEY
    }).catch(err => {
        console.error(`Publish failed: ${err.message}`)
        process.exit(1)
    })
}
