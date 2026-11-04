const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const keyFile = path.join(root, '.release-key.json')
const outFile = path.join(root, 'app', 'assets', 'native', 'vac_release.node')
const bundleFile = path.join(root, 'app', 'assets', 'native', 'vac.bin')

function vacDir(){
    const dir = path.resolve(process.env.OBLYVIUM_VAC_DIR || path.join(root, '..', 'VacOblyvium'))
    if(!fs.existsSync(path.join(dir, 'launcher-native', 'build.cjs'))){
        throw new Error(`VacOblyvium não encontrado em ${dir}: clone o repositório ao lado do launcher ou defina OBLYVIUM_VAC_DIR.`)
    }
    return dir
}

function vacJars(dir){
    const agent = path.join(dir, 'agent', 'build', 'vac', 'vac-agent.jar')
    const libs = path.join(dir, 'mod', 'build', 'libs')
    const mods = fs.existsSync(libs) ? fs.readdirSync(libs).filter(f => /^vac-mod-.+\.jar$/.test(f) && !f.endsWith('-sources.jar')) : []
    if(!fs.existsSync(agent)) throw new Error(`Falta ${agent}: rode ./gradlew build em agent/ do VacOblyvium.`)
    if(mods.length !== 1) throw new Error(`Esperava um vac-mod-*.jar em ${libs}, achei ${mods.length}: rode ./gradlew clean build em mod/.`)
    return { agent, mod: path.join(libs, mods[0]) }
}

function main(){
    const dir = vacDir()
    const jars = vacJars(dir)
    execFileSync(process.execPath, [
        path.join(dir, 'launcher-native', 'build.cjs'),
        '--electron', require('electron/package.json').version,
        '--version', require('../package.json').version,
        '--out', outFile,
        '--key-file', keyFile,
        '--bundle-out', bundleFile,
        '--agent', jars.agent,
        '--mod', jars.mod,
        ...(process.env.OBLYVIUM_REUSE_KEY === '1' ? ['--reuse-key'] : [])
    ], { stdio: 'inherit' })
}

module.exports = { keyFile, outFile, bundleFile }

if(require.main === module) main()
