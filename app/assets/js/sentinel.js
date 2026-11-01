const { execFile } = require('child_process')
const crypto = require('crypto')
const { promisify } = require('util')
const got = require('got')
const { version } = require('../../../package.json')

const TICKET_URL = process.env.OBLYVIUM_TICKET_URL || 'https://oblyvium.com.br/api/launcher/ticket'
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

async function requestTicket(account){
    const premium = account.type === 'microsoft'
    const res = await got.post(TICKET_URL, {
        headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
        json: {
            nick: account.displayName,
            type: premium ? 'premium' : 'pirate',
            accessToken: premium ? account.accessToken : undefined,
            launcherVersion: version,
            fingerprint: await machineFingerprint()
        },
        timeout: 15000,
        retry: 0,
        responseType: 'json'
    })
    return res.body.data
}

module.exports = { fingerprintOf, machineFingerprint, requestTicket }
