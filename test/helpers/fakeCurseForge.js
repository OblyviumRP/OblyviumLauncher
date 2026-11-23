const crypto = require('crypto')
const http   = require('http')

function makeFile(fingerprint, id, modId, fileName, content, extra = {}){
    const buf = Buffer.from(content)
    return {
        id, modId, fileName, buf,
        displayName: fileName,
        isAvailable: true,
        releaseType: 1,
        fileDate: '2026-11-01T00:00:00Z',
        gameVersions: ['26.3', 'Fabric', 'Client'],
        hashes: [{ value: crypto.createHash('sha1').update(buf).digest('hex'), algo: 1 }],
        fileFingerprint: fingerprint(buf),
        dependencies: [],
        ...extra
    }
}

const files = fingerprint => [
    makeFile(fingerprint, 1000, 100, 'mapa-cf-1.0.jar', 'mapa cf 1.0', { dependencies: [{ modId: 101, relationType: 3 }, { modId: 104, relationType: 2 }] }),
    makeFile(fingerprint, 1010, 101, 'lib-cf-1.0.jar', 'lib cf 1.0'),
    makeFile(fingerprint, 1011, 101, 'lib-cf-0.9.jar', 'lib cf 0.9', { fileDate: '2026-12-01T00:00:00Z', releaseType: 2 }),
    makeFile(fingerprint, 1020, 102, 'fechado-1.0.jar', 'fechado 1.0', { noDownload: true }),
    makeFile(fingerprint, 1030, 103, 'sodium-cf-1.0.jar', 'sodium cf 1.0'),
    makeFile(fingerprint, 1040, 104, 'pacote-cf-1.0.zip', 'pacote cf 1.0', { gameVersions: ['26.3'] }),
    makeFile(fingerprint, 1050, 105, 'velho-1.0.jar', 'velho 1.0', { gameVersions: ['1.20.1', 'Fabric'] })
]

function mod(id, slug, name, classId){
    return {
        id, slug, name, classId,
        summary: `${name} de teste`,
        authors: [{ name: 'autor' }],
        logo: { thumbnailUrl: `https://media.forgecdn.net/${slug}.png` },
        downloadCount: 10, categories: [], screenshots: [],
        links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/${slug}` }
    }
}

const MODS = [
    mod(100, 'cf-mapa', 'Mapa CF', 6),
    mod(101, 'cf-lib', 'Lib CF', 6),
    mod(102, 'cf-fechado', 'Fechado CF', 6),
    mod(103, 'sodium', 'Sodium CF', 6),
    mod(104, 'cf-pacote', 'Pacote CF', 12),
    mod(105, 'cf-velho', 'Velho CF', 6)
]

exports.start = async function(){
    let cached = null
    const allFiles = () => (cached ??= files(require('../../app/assets/js/curseforge').fingerprint))
    let base
    const requests = []
    const publicFile = f => {
        const rest = { ...f }
        delete rest.buf
        delete rest.noDownload
        return { ...rest, downloadUrl: f.noDownload ? null : `${base}/files/${encodeURIComponent(f.fileName)}` }
    }
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, base)
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
            requests.push({ method: req.method, url, body })
            const send = (status, data) => {
                res.writeHead(status, { 'content-type': 'application/json' })
                res.end(JSON.stringify(data))
            }
            const p = url.pathname
            let m
            if(p.startsWith('/files/')){
                const f = allFiles().find(x => x.fileName === decodeURIComponent(p.slice('/files/'.length)))
                if(f == null) return send(404, {})
                res.writeHead(200, { 'content-type': 'application/octet-stream' })
                return res.end(f.buf)
            }
            if(p === '/api/v1/categories'){
                return send(200, { data: [
                    { id: 423, name: 'Map and Information', classId: 6, parentCategoryId: 6 },
                    { id: 407, name: 'Biomes', classId: 6, parentCategoryId: 406 },
                    { id: 6814, name: 'Performance', classId: 6, parentCategoryId: 6 }
                ] })
            }
            if(p === '/api/v1/mods/search'){
                const classId = Number(url.searchParams.get('classId'))
                const data = MODS.filter(x => x.classId === classId)
                return send(200, { data, pagination: { index: 0, pageSize: 20, resultCount: data.length, totalCount: data.length } })
            }
            if(p === '/api/v1/mods' && req.method === 'POST'){
                const { modIds } = JSON.parse(body)
                return send(200, { data: MODS.filter(x => modIds.includes(x.id)) })
            }
            if(p === '/api/v1/fingerprints/432' && req.method === 'POST'){
                const { fingerprints } = JSON.parse(body)
                const exactMatches = allFiles().filter(f => fingerprints.includes(f.fileFingerprint)).map(f => ({ id: f.modId, file: publicFile(f) }))
                return send(200, { data: { exactMatches } })
            }
            if((m = p.match(/^\/api\/v1\/mods\/(\d+)\/files$/))){
                return send(200, { data: allFiles().filter(f => f.modId === Number(m[1])).map(publicFile) })
            }
            if((m = p.match(/^\/api\/v1\/mods\/(\d+)\/description$/))){
                return send(200, { data: '<p>Descrição</p>' })
            }
            if((m = p.match(/^\/api\/v1\/mods\/(\d+)$/))){
                const found = MODS.find(x => x.id === Number(m[1]))
                return found ? send(200, { data: found }) : send(404, {})
            }
            send(404, {})
        })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    return { base, api: `${base}/api`, requests, close: () => new Promise(resolve => server.close(resolve)) }
}
