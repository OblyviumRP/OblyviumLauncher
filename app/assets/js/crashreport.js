const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const got = require('got')
const { version } = require('../../../package.json')

const CRASH_URL = process.env.OBLYVIUM_CRASH_URL || 'https://oblyvium.com.br/api/launcher/crash'
const MAX_FILE_CHARS = 500000
const LOG_LINES = 1500
const HIDDEN = '[oculto]'

function escapeRegex(s){
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function redactor(secrets, home = os.homedir(), user = os.userInfo().username){
    const rules = []
    for(const s of secrets){
        if(typeof s === 'string' && s.length >= 8){
            rules.push([new RegExp(escapeRegex(s), 'g'), HIDDEN])
        }
    }
    rules.push([/(--accessToken[\s=]+)\S+/g, `$1${HIDDEN}`])
    rules.push([/^((?:USERNAME|USERPROFILE|HOMEPATH|USERDOMAIN\w*|COMPUTERNAME|LOGONSERVER|ONEDRIVE\w*)\s*=).*$/gmi, `$1${HIDDEN}`])
    if(home){
        for(const h of new Set([home, home.replace(/\\/g, '/')])){
            rules.push([new RegExp(escapeRegex(h), 'gi'), '%USERPROFILE%'])
        }
    }
    if(user){
        rules.push([new RegExp(`([\\\\/]Users[\\\\/]+)${escapeRegex(user)}(?=[\\\\/"'\\s]|$)`, 'gim'), `$1${HIDDEN}`])
    }
    return (text) => rules.reduce((acc, [re, to]) => acc.replace(re, to), text)
}

function head(text, max = MAX_FILE_CHARS){
    return text.length > max ? `${text.slice(0, max)}\n[... cortado ...]` : text
}

function tailLines(text, lines = LOG_LINES, max = MAX_FILE_CHARS){
    const all = text.split(/\r?\n/)
    let out = all.length > lines ? all.slice(-lines).join('\n') : text
    if(out.length > max) out = out.slice(-max)
    return out.length < text.length ? `[... início cortado ...]\n${out}` : out
}

async function readIfNewer(file, since){
    try {
        const st = await fs.stat(file)
        if(since != null && st.mtimeMs < since - 2000) return null
        return await fs.readFile(file, 'utf8')
    } catch {
        return null
    }
}

async function newestHsErr(gameDir, since){
    try {
        let best = null
        for(const f of await fs.readdir(gameDir)){
            if(!/^hs_err_pid\d+\.log$/.test(f)) continue
            const st = await fs.stat(path.join(gameDir, f))
            if(st.mtimeMs >= since - 2000 && (best == null || st.mtimeMs > best.mtime)){
                best = { file: path.join(gameDir, f), mtime: st.mtimeMs }
            }
        }
        return best?.file ?? null
    } catch {
        return null
    }
}

function modsFromLog(log){
    const at = /Loading \d+ mods:\r?\n/.exec(log)
    if(at == null) return []
    const mods = []
    for(const line of log.slice(at.index + at[0].length).split(/\r?\n/)){
        const m = /^\t- (.+)$/.exec(line)
        if(m) mods.push(m[1].trim().slice(0, 200))
        else if(!/^\t\s/.test(line)) break
    }
    return mods.slice(0, 500)
}

function javaFrom(texts){
    for(const t of texts){
        const m = /^\s*Java Version: (.+)$/m.exec(t) ?? /^# JRE version: (.+)$/m.exec(t)
        if(m) return m[1].trim().slice(0, 160)
    }
    return 'desconhecido'
}

function ramMb(value){
    const m = /^(\d+)([GM])$/i.exec(String(value ?? '').trim())
    if(m == null) return 0
    return m[2].toUpperCase() === 'G' ? Number(m[1]) * 1024 : Number(m[1])
}

const GPU_VENDORS = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x1022: 'AMD', 0x8086: 'Intel', 0x106b: 'Apple', 0x5143: 'Qualcomm', 0x13b5: 'ARM', 0x1414: 'Microsoft' }

function hex(n){
    return `0x${Number(n).toString(16).padStart(4, '0')}`
}

function gpusFrom(devices){
    if(!Array.isArray(devices)) return []
    return devices
        .filter(d => d != null && d.vendorId !== 0x1414)
        .slice(0, 8)
        .map(d => ({
            name: String(d.deviceString || `${hex(d.vendorId)}:${hex(d.deviceId)}`).slice(0, 200),
            vendor: String(GPU_VENDORS[d.vendorId] ?? d.driverVendor ?? hex(d.vendorId)).slice(0, 120),
            driver: String(d.driverVersion ?? '').slice(0, 120)
        }))
}

async function collect({ gameDir, crashReport, startedAt, maxRam, secrets = [], gpuDevices = [] }){
    const redact = redactor(secrets)
    const files = []
    const raw = []
    if(crashReport){
        const text = await readIfNewer(crashReport, null)
        if(text != null){
            raw.push(text)
            files.push({ name: path.basename(crashReport), content: head(redact(text)) })
        }
    }
    const hsErr = await newestHsErr(gameDir, startedAt)
    if(hsErr){
        const text = await readIfNewer(hsErr, startedAt)
        if(text != null){
            raw.push(text)
            files.push({ name: path.basename(hsErr), content: head(redact(text)) })
        }
    }
    const log = await readIfNewer(path.join(gameDir, 'logs', 'latest.log'), startedAt)
    if(log != null){
        files.push({ name: 'latest.log', content: tailLines(redact(log)) })
    }
    return {
        files,
        system: {
            os: `${os.version()} ${os.release()} (${os.arch()})`.slice(0, 160),
            java: javaFrom(raw),
            totalRamMb: Math.round(os.totalmem() / 1048576),
            maxRamMb: ramMb(maxRam),
            mods: log != null ? modsFromLog(log) : [],
            gpus: gpusFrom(gpuDevices)
        }
    }
}

async function send(report){
    try {
        await got.post(CRASH_URL, {
            headers: { 'user-agent': `OblyviumRP/OblyviumLauncher/${version}` },
            json: { ...report, launcherVersion: version },
            timeout: 30000,
            retry: 0,
            responseType: 'json'
        })
    } catch(err){
        const message = err?.response?.body?.error?.message
        throw new Error(typeof message === 'string' ? message : 'Não foi possível enviar o relatório. Confira a internet e tente de novo.')
    }
}

module.exports = { collect, send, redactor, modsFromLog, javaFrom, ramMb, tailLines, gpusFrom }
