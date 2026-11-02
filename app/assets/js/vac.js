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
const run = promisify(execFile)

function fingerprintOf(machineGuid, smbiosUuid){
    return crypto.createHash('sha256')
        .update(`oblyvium:${machineGuid.trim().toLowerCase()}:${smbiosUuid.trim().toLowerCase()}`)
        .digest('hex')
}

async function machineFingerprint(){
    const opts = { windowsHide: true, timeout: 10000 }
    const [reg, cim] = await Promise.all([
        run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], opts),
        run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'], opts)
    ])
    const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(reg.stdout)?.[1]
    if(guid == null || cim.stdout.trim() === '') throw new Error('Identificadores da máquina não encontrados.')
    return fingerprintOf(guid, cim.stdout)
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
        fingerprint: await machineFingerprint()
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

module.exports = { fingerprintOf, machineFingerprint, proofData, requestTicket, ticketFailure, unpackVac, PROVER_PATH, BUNDLE_PATH }
