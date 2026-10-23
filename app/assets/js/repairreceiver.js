/**
 * Child process entry for the launch file check. Runs helios-core's receiver,
 * but pack files the player edits in game (video, language, shaders) are only
 * downloaded when missing, so relaunching never resets their settings.
 * Everything else, the rest of config/ included, is still hash-checked.
 */
const fs                                = require('fs-extra')
const path                              = require('path')
const { DistributionIndexProcessor }    = require('helios-core/dl')
const { Type }                          = require('helios-distribution-types')

// Paths inside the game folder, as written in the distribution: files the
// game rewrites from its own menus.
const PLAYER_SETTINGS = new Set([
    'options.txt',
    'optionsof.txt',
    'optionsshaders.txt',
    'config/sodium-options.json',
    'config/sodium-fingerprint.json',
    'config/iris.properties',
    'config/oculus.properties',
    'config/replaymod.json'
])

exports.isPlayerSetting = function(relativePath) {
    return PLAYER_SETTINGS.has(relativePath.replace(/\\/g, '/'))
}

function settingsPaths(modules, out = new Set()) {
    for(const mdl of modules) {
        if(mdl.rawModule.type === Type.File && exports.isPlayerSetting(mdl.rawModule.artifact.path ?? '')) {
            out.add(mdl.getPath())
        }
        settingsPaths(mdl.subModules, out)
    }
    return out
}

const validate = DistributionIndexProcessor.prototype.validate
DistributionIndexProcessor.prototype.validate = async function(...args) {
    const result = await validate.apply(this, args)
    const keep = settingsPaths(this.distribution.getServerById(this.serverId).modules)
    const invalid = []
    for(const asset of result.distribution) {
        if(!keep.has(asset.path) || !await fs.pathExists(asset.path)) {
            invalid.push(asset)
        }
    }
    result.distribution = invalid
    return result
}

if(require.main === module) {
    // helios-core does not export its executor; it reads the receiver name from argv.
    require(path.join(path.dirname(require.resolve('helios-core')), 'dl', 'receivers', 'ReceiverExecutor.js'))
}
