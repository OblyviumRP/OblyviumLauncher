/**
 * Child process entry for the launch file check. Runs helios-core's receiver,
 * but settings the player can change (game options, server list, mod configs)
 * are only downloaded when missing, so neither relaunching nor a modpack
 * update resets them. Everything else is still hash-checked.
 */
const fs                                = require('fs-extra')
const path                              = require('path')
const { DistributionIndexProcessor }    = require('helios-core/dl')
const { Type }                          = require('helios-distribution-types')

// Paths inside the game folder, as written in the distribution.
const PLAYER_SETTINGS = new Set([
    'options.txt',
    'optionsof.txt',
    'optionsshaders.txt',
    'servers.dat'
])
// Menu and loading screen art and layouts under config/ stay as the pack ships them.
const PACK_BRANDING = ['config/fancymenu/', 'config/drippyloadingscreen/']

exports.isPlayerSetting = function(relativePath) {
    const p = relativePath.replace(/\\/g, '/')
    return PLAYER_SETTINGS.has(p) || (p.startsWith('config/') && !PACK_BRANDING.some(dir => p.startsWith(dir)))
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
