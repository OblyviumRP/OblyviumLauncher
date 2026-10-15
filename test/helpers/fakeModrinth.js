/**
 * Minimal local stand-in for the Modrinth API, for tests only.
 */
const crypto = require('crypto')
const http   = require('http')

function makeFile(name, content){
    const buf = Buffer.from(content)
    return {
        name,
        buf,
        hashes: {
            sha1: crypto.createHash('sha1').update(buf).digest('hex'),
            sha512: crypto.createHash('sha512').update(buf).digest('hex')
        }
    }
}

const FILES = {
    'sodium-1.0.jar': makeFile('sodium-1.0.jar', 'sodium 1.0'),
    'iris-1.0.jar': makeFile('iris-1.0.jar', 'iris 1.0'),
    'iris-2.0.jar': makeFile('iris-2.0.jar', 'iris 2.0'),
    'mapa-1.0.jar': makeFile('mapa-1.0.jar', 'mapa 1.0'),
    'pacote-1.0.zip': makeFile('pacote-1.0.zip', 'pacote 1.0'),
    'sombra-1.0.zip': makeFile('sombra-1.0.zip', 'sombra 1.0'),
    'corrompido-1.0.jar': makeFile('corrompido-1.0.jar', 'conteudo real'),
    // Malicious filename announced by a version, used to test path safety.
    '../evil.jar': makeFile('../evil.jar', 'conteudo hostil'),
    // Invalid filename ("..") for a project whose dependency has a valid name.
    '..': makeFile('..', 'conteudo invalido')
}

function project(id, slug, title, type, extra = {}){
    return {
        id, slug, title, project_type: type,
        description: `${title} de teste`,
        body: `# ${title}\n\nDescrição de **${title}**.`,
        icon_url: null,
        gallery: [],
        categories: [],
        ...extra
    }
}

const PROJECTS = [
    project('AAAAAAAA', 'sodium', 'Sodium', 'mod'),
    project('BBBBBBBB', 'iris', 'Iris', 'mod', {
        body: 'Texto <script>window.__xss = 1</script><img src="x" onerror="window.__xss = 2"> [site](https://example.com) [local](file:///C:/x)',
        gallery: [{ url: 'https://cdn.example.com/a.png', title: 'Tela', ordering: 0 }]
    }),
    project('CCCCCCCC', 'mapa', 'Mapa', 'mod', { categories: ['utility'] }),
    project('DDDDDDDD', 'pacote', 'Pacote', 'resourcepack'),
    project('EEEEEEEE', 'sombra', 'Sombra', 'shader'),
    project('FFFFFFFF', 'corrompido', 'Corrompido', 'mod'),
    // Announces a path-traversal filename; used to test install() path safety.
    project('GGGGGGGG', 'hostil', 'Hostil', 'mod'),
    // A project type the launcher does not support (not in Modrinth.TYPES).
    project('HHHHHHHH', 'extra', 'Extra', 'plugin'),
    // Valid dependency (sodium), but its own file name is invalid; used to test
    // that install() validates every step before downloading any of them.
    project('IIIIIIII', 'invalido', 'Invalido', 'mod')
]

exports.start = async function(){
    let base
    const fileRef = name => ({
        url: `${base}/files/${name}`,
        filename: name,
        primary: true,
        hashes: name === 'corrompido-1.0.jar' ? makeFile(name, 'outro conteudo').hashes : FILES[name].hashes
    })
    const version = (id, projectId, number, loaders, file, dependencies = []) => ({
        id, project_id: projectId, version_number: number, version_type: 'release',
        loaders, game_versions: ['1.20.1'], dependencies, files: [fileRef(file)]
    })
    const versions = () => ({
        AAAAAAAA: [version('va1', 'AAAAAAAA', '1.0', ['forge'], 'sodium-1.0.jar')],
        BBBBBBBB: [
            version('vb2', 'BBBBBBBB', '2.0', ['forge'], 'iris-2.0.jar', [{ project_id: 'AAAAAAAA', dependency_type: 'required' }]),
            version('vb1', 'BBBBBBBB', '1.0', ['forge'], 'iris-1.0.jar', [{ project_id: 'AAAAAAAA', dependency_type: 'required' }])
        ],
        CCCCCCCC: [version('vc1', 'CCCCCCCC', '1.0', ['forge'], 'mapa-1.0.jar')],
        DDDDDDDD: [version('vd1', 'DDDDDDDD', '1.0', ['minecraft'], 'pacote-1.0.zip')],
        EEEEEEEE: [version('ve1', 'EEEEEEEE', '1.0', ['iris'], 'sombra-1.0.zip')],
        FFFFFFFF: [version('vf1', 'FFFFFFFF', '1.0', ['forge'], 'corrompido-1.0.jar')],
        GGGGGGGG: [version('vg1', 'GGGGGGGG', '1.0', ['forge'], '../evil.jar')],
        IIIIIIII: [version('vi1', 'IIIIIIII', '1.0', ['forge'], '..', [{ project_id: 'AAAAAAAA', dependency_type: 'required' }])]
    })
    const findProject = idOrSlug => PROJECTS.find(p => p.id === idOrSlug || p.slug === idOrSlug)
    const requests = []

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, base)
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
            requests.push({ method: req.method, url, body })
            const send = (status, data, headers = {}) => {
                res.writeHead(status, { 'content-type': 'application/json', ...headers })
                res.end(JSON.stringify(data))
            }
            const p = url.pathname
            let m

            if(p.startsWith('/files/')){
                const name = decodeURIComponent(p.slice('/files/'.length))
                // Always missing, for download-failure tests.
                if(name === 'sumiu.jar'){
                    return send(404, {})
                }
                // Sends a few bytes then kills the connection, for mid-stream failure tests.
                if(name === 'corte.jar'){
                    res.writeHead(200, { 'content-type': 'application/octet-stream' })
                    res.write(Buffer.from('parte de um arquivo'))
                    res.destroy()
                    return
                }
                const file = FILES[name]
                if(file == null) return send(404, {})
                res.writeHead(200, { 'content-type': 'application/octet-stream' })
                return res.end(file.buf)
            }
            if(p === '/v2/search'){
                if(url.searchParams.get('query') === 'limite'){
                    return send(429, { error: 'ratelimited' }, { 'retry-after': '0' })
                }
                const facets = JSON.parse(url.searchParams.get('facets'))
                const type = facets[0][0].split(':')[1]
                const hits = PROJECTS.filter(pr => pr.project_type === type).map(pr => ({
                    project_id: pr.id, slug: pr.slug, title: pr.title, description: pr.description,
                    author: 'autor', downloads: 1000, icon_url: pr.icon_url, categories: pr.categories
                }))
                return send(200, { hits, offset: Number(url.searchParams.get('offset') ?? 0), limit: 20, total_hits: hits.length })
            }
            if(p === '/v2/tag/category'){
                return send(200, [
                    { name: 'utility', project_type: 'mod', header: 'categories', icon: '' },
                    { name: 'optimization', project_type: 'mod', header: 'categories', icon: '' },
                    { name: 'decoration', project_type: 'resourcepack', header: 'categories', icon: '' },
                    { name: '64x', project_type: 'resourcepack', header: 'resolutions', icon: '' }
                ])
            }
            if(p === '/v2/projects'){
                const ids = JSON.parse(url.searchParams.get('ids'))
                return send(200, ids.map(findProject).filter(Boolean))
            }
            if((m = p.match(/^\/v2\/project\/([^/]+)\/version$/))){
                const pr = findProject(decodeURIComponent(m[1]))
                return send(200, pr ? versions()[pr.id] : [])
            }
            if((m = p.match(/^\/v2\/project\/([^/]+)$/))){
                const pr = findProject(decodeURIComponent(m[1]))
                return pr ? send(200, pr) : send(404, {})
            }
            if(p === '/v2/version_files' || p === '/v2/version_files/update'){
                const { hashes } = JSON.parse(body)
                const out = {}
                for(const list of Object.values(versions())){
                    for(const v of list){
                        for(const f of v.files){
                            if(hashes.includes(f.hashes.sha1)){
                                out[f.hashes.sha1] = p.endsWith('/update') ? list[0] : v
                            }
                        }
                    }
                }
                return send(200, out)
            }
            send(404, {})
        })
    })

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
    return {
        base,
        api: `${base}/v2`,
        files: FILES,
        requests,
        close: () => new Promise(resolve => server.close(resolve))
    }
}
