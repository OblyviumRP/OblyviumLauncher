const { execFile } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const got = require('got')
const { version } = require('../../../package.json')

const TICKET_URL = process.env.OBLYVIUM_TICKET_URL || 'https://oblyvium.com.br/api/launcher/ticket'
const CHALLENGE_URL = `${TICKET_URL}/desafio`
const PROVER_PATH = path.join(__dirname, '..', 'native', 'vac_release.node')
const BUNDLE_PATH = path.join(__dirname, '..', 'native', 'vac.bin')
const TICKET_MARGIN_MS = 10 * 60 * 1000
const run = promisify(execFile)

function fingerprintOf(machineGuid, smbiosUuid){
    return crypto.createHash('sha256')
        .update(`oblyvium:${machineGuid.trim().toLowerCase()}:${smbiosUuid.trim().toLowerCase()}`)
        .digest('hex')
}

async function windowsFingerprint(opts){
    const [reg, cim] = await Promise.all([
        run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], opts),
        run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'], opts)
    ])
    return [/MachineGuid\s+REG_SZ\s+(\S+)/.exec(reg.stdout)?.[1], cim.stdout]
}

async function linuxFingerprint(){
    const read = (file) => fs.promises.readFile(file, 'utf8').then(t => t.trim()).catch(() => '')
    const id = await read('/etc/machine-id') || await read('/var/lib/dbus/machine-id')
    return [id, await read('/sys/class/dmi/id/product_uuid') || id]
}

async function macFingerprint(opts){
    const { stdout } = await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], opts)
    const uuid = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(stdout)?.[1]
    return [uuid, uuid ?? '']
}

async function machineFingerprint(platform = process.platform){
    const opts = { windowsHide: true, timeout: 10000 }
    const [id, uuid] = platform === 'win32' ? await windowsFingerprint(opts)
        : platform === 'darwin' ? await macFingerprint(opts)
            : await linuxFingerprint()
    if(!id || !uuid?.trim()) throw new Error('Identificadores da máquina não encontrados.')
    return fingerprintOf(id, uuid)
}

async function localFingerprint(){
    try {
        return await machineFingerprint()
    } catch(err) {
        throw Object.assign(new Error(`Identificação da máquina falhou: ${err.message}`, { cause: err }), { code: 'IDENTIFICACAO' })
    }
}

let prover
function loadProver(){
    if(prover === undefined){
        try {
            prover = require(PROVER_PATH)
        } catch {
            prover = null
        }
    }
    return prover
}

function proofData(nonce, fields){
    return Buffer.concat([
        Buffer.from(nonce, 'base64url'),
        Buffer.from(`\n${fields.nick}\n${fields.type}\n${fields.fingerprint}\n${fields.launcherVersion}`, 'utf8')
    ])
}

async function requestTicket(account, p = loadProver()){
    const premium = account.type === 'microsoft'
    const headers = { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` }
    const body = {
        nick: account.displayName,
        type: premium ? 'premium' : 'pirate',
        accessToken: premium ? account.accessToken : undefined,
        launcherVersion: version,
        fingerprint: await localFingerprint()
    }
    if(p != null){
        const challenge = await got.post(CHALLENGE_URL, { headers, json: {}, timeout: 15000, retry: 0, responseType: 'json' })
        const { id, nonce } = challenge.body.data
        body.desafio = id
        body.prova = p.provar(proofData(nonce, body)).toString('base64url')
    }
    const res = await got.post(TICKET_URL, { headers, json: body, timeout: 15000, retry: 0, responseType: 'json' })
    return res.body.data
}

// O proxy confere o ticket sozinho, sem o site: o último emitido serve para jogar com o site fora do ar.
// shortcut: guarda só o último ticket; com várias contas, só a última que jogou tem reserva.
function saveTicket(file, ticket){
    try {
        fs.writeFileSync(file, JSON.stringify({ ticket: ticket.ticket, key: ticket.key }), { mode: 0o600 })
    } catch {
        // Sem reserva só se perde a entrada com o site fora do ar.
    }
}

function cachedTicket(file, nick, now = Date.now()){
    try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
        const p = JSON.parse(Buffer.from(saved.ticket.split('.')[0], 'base64url').toString('utf8'))
        // Margem para o jogo abrir antes de vencer; outra versão do launcher traz outro VAC, que o proxy recusa.
        const valid = p.nick.toLowerCase() === nick.toLowerCase() && p.lv === version && p.exp * 1000 > now + TICKET_MARGIN_MS
        return valid ? saved : null
    } catch {
        return null
    }
}

function unpackVac(dir, p = loadProver(), bundlePath = BUNDLE_PATH){
    if(p == null || typeof p.abrir !== 'function' || !fs.existsSync(bundlePath)) return null
    const plain = p.abrir(fs.readFileSync(bundlePath))
    const agentLength = plain.readUInt32BE(0)
    const file = () => path.join(dir, `${crypto.randomBytes(8).toString('hex')}.jar`)
    const vac = { agent: file(), mod: file() }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(vac.agent, plain.subarray(4, 4 + agentLength))
    fs.writeFileSync(vac.mod, plain.subarray(4 + agentLength))
    plain.fill(0)
    return vac
}

function ticketFailure(err){
    const status = err?.response?.statusCode
    const site = err?.response?.body?.error
    if(err?.code === 'IDENTIFICACAO'){
        return { code: err.code, message: 'O launcher não conseguiu identificar este computador. Mande o log do launcher para a equipe do Oblyvium.' }
    }
    if(status == null){
        return { code: 'REDE', message: 'Não foi possível falar com o Oblyvium agora. Tente de novo em instantes.' }
    }
    if(site?.code === 'LAUNCHER_DESATUALIZADO'){
        return { code: site.code, message: 'Atualize o launcher para jogar. A atualização começa agora e o launcher reabre sozinho.' }
    }
    if(site?.code === 'FORBIDDEN'){
        return { code: site.code, message: 'Entre de novo com a Microsoft para jogar.' }
    }
    if(site?.message && status < 500){
        return { code: site.code ?? `HTTP_${status}`, message: site.message }
    }
    return { code: `HTTP_${status}`, message: 'Não foi possível falar com o Oblyvium agora. Tente de novo em instantes.' }
}

module.exports = { fingerprintOf, machineFingerprint, proofData, requestTicket, saveTicket, cachedTicket, ticketFailure, unpackVac, PROVER_PATH, BUNDLE_PATH }
