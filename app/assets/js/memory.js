const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { promisify } = require('util')

const MARGIN_MB = 2048
const MB = 1048576
const run = promisify(execFile)

const PAGEFILES_PS = '$c=Get-CimInstance Win32_ComputerSystem;'
    + '$u=@(Get-CimInstance Win32_PageFileUsage | % { @{ name=$_.Name; alloc=$_.AllocatedBaseSize } });'
    + '$s=@(Get-CimInstance Win32_PageFileSetting | % { @{ name=$_.Name; max=$_.MaximumSize } });'
    + '@{ auto=$c.AutomaticManagedPagefile; usage=$u; settings=$s } | ConvertTo-Json -Compress -Depth 4'

function growthMb(file, totalRamMb){
    const systemCap = Math.min(Math.max(3 * totalRamMb, 4096), file.volumeMb / 8)
    const cap = file.maxMb > 0 ? file.maxMb : systemCap
    return Math.max(0, Math.min(cap - file.allocMb, file.volumeFreeMb))
}

function lowMemory({ commitFreeMb, totalRamMb, pageFiles = [] }, maxRamMb){
    if(!Number.isFinite(commitFreeMb) || !(maxRamMb > 0)) return null
    const freeMb = Math.floor(commitFreeMb + pageFiles.reduce((sum, f) => sum + growthMb(f, totalRamMb), 0))
    const needMb = maxRamMb + MARGIN_MB
    return freeMb < needMb ? { freeMb, needMb } : null
}

function volumeOf(file){
    try {
        const s = fs.statfsSync(path.parse(file).root)
        return { volumeMb: (s.blocks * s.bsize) / MB, volumeFreeMb: (s.bavail * s.bsize) / MB }
    } catch {
        return { volumeMb: 0, volumeFreeMb: 0 }
    }
}

function pageFilesFrom(json){
    const list = v => (v == null ? [] : Array.isArray(v) ? v : [v])
    const settings = new Map(list(json?.settings).map(s => [String(s.name).toLowerCase(), Number(s.max) || 0]))
    return list(json?.usage).map(u => ({
        allocMb: Number(u.alloc) || 0,
        maxMb: json?.auto ? 0 : (settings.get(String(u.name).toLowerCase()) ?? 0),
        ...volumeOf(String(u.name))
    }))
}

async function readPageFiles(){
    if(process.platform !== 'win32') return []
    try {
        const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', PAGEFILES_PS], { windowsHide: true, timeout: 10000 })
        return pageFilesFrom(JSON.parse(stdout))
    } catch {
        return []
    }
}

async function memoryWarning(info, maxRamMb){
    const commitFreeKb = info?.swapFree ?? info?.free
    if(!Number.isFinite(commitFreeKb)) return null
    const state = { commitFreeMb: commitFreeKb / 1024, totalRamMb: os.totalmem() / MB, pageFiles: [] }
    if(lowMemory(state, maxRamMb) == null) return null
    state.pageFiles = await readPageFiles()
    return lowMemory(state, maxRamMb)
}

module.exports = { growthMb, lowMemory, pageFilesFrom, memoryWarning }
