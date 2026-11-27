const { execFile } = require('child_process')
const { promisify } = require('util')

const run = promisify(execFile)

const PROBE_PS = '$ErrorActionPreference="Stop";'
    + 'try{Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public static class OblyVk{'
    + '[DllImport("vulkan-1.dll")]public static extern int vkEnumerateInstanceExtensionProperties(IntPtr l,ref uint c,IntPtr p);}\'}catch{"erro";exit};'
    + 'try{$c=[uint32]0;$r=[OblyVk]::vkEnumerateInstanceExtensionProperties([IntPtr]::Zero,[ref]$c,[IntPtr]::Zero);'
    + 'if($r -ne 0 -or $c -eq 0){"sem-suporte";exit};'
    + '$p=[Runtime.InteropServices.Marshal]::AllocHGlobal([int]($c*260));'
    + '$r=[OblyVk]::vkEnumerateInstanceExtensionProperties([IntPtr]::Zero,[ref]$c,$p);'
    + 'if($r -ne 0){"erro";exit};$ok=$false;'
    + 'for($i=0;$i -lt $c;$i++){if([Runtime.InteropServices.Marshal]::PtrToStringAnsi([IntPtr]::Add($p,$i*260)) -eq "VK_KHR_surface"){$ok=$true}};'
    + 'if($ok){"ok"}else{"sem-suporte"}}'
    + 'catch{if($_.Exception.GetBaseException() -is [DllNotFoundException]){"sem-loader"}else{"erro"}}'

let cached

function problemFrom(stdout){
    const last = String(stdout ?? '').trim().split(/\r?\n/).pop().trim()
    return last === 'sem-loader' || last === 'sem-suporte' ? last : null
}

async function vulkanProblem(){
    if(process.platform !== 'win32') return null
    if(cached !== undefined) return cached
    try {
        const { stdout } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', PROBE_PS], { windowsHide: true, timeout: 20000 })
        cached = problemFrom(stdout)
    } catch {
        return null
    }
    return cached
}

module.exports = { problemFrom, vulkanProblem }
