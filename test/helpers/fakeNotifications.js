/**
 * Local stand-in for launcher-cdn's notifications.json, for tests and the
 * Electron verification only. Answers 304 to a matching If-None-Match and
 * serves a 1x1 PNG under /notifications/ for highlight images.
 */
const crypto = require('crypto')
const http   = require('http')

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

exports.start = async function(){
    const state = { body: null, status: 200, requests: [], date: null }
    const server = http.createServer((req, res) => {
        state.requests.push({ url: req.url, ifNoneMatch: req.headers['if-none-match'] ?? null })
        // state.date: null keeps Node's own Date header, a string overrides it,
        // false suppresses it (to test a response with no Date at all).
        if(state.date === false) res.sendDate = false
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
        const dateHeader = typeof state.date === 'string' ? { date: state.date } : {}
        if(req.headers['if-none-match'] === etag){
            res.writeHead(304, { ...dateHeader, etag })
            return res.end()
        }
        res.writeHead(200, { ...dateHeader, 'content-type': 'application/json', etag })
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
