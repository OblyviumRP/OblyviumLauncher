const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const keyFile = path.join(root, '.release-key.json')
const outFile = path.join(root, 'app', 'assets', 'native', 'sentinel_release.node')

function sentinelDir(){
    const dir = path.resolve(process.env.OBLYVIUM_SENTINEL_DIR || path.join(root, '..', 'OblyviumSentinel'))
    if(!fs.existsSync(path.join(dir, 'launcher-native', 'build.cjs'))){
        throw new Error(`OblyviumSentinel não encontrado em ${dir}: clone o repositório ao lado do launcher ou defina OBLYVIUM_SENTINEL_DIR.`)
    }
    return dir
}

function main(){
    execFileSync(process.execPath, [
        path.join(sentinelDir(), 'launcher-native', 'build.cjs'),
        '--electron', require('electron/package.json').version,
        '--version', require('../package.json').version,
        '--out', outFile,
        '--key-file', keyFile
    ], { stdio: 'inherit' })
}

module.exports = { keyFile, outFile }

if(require.main === module) main()
