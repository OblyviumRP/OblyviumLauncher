/**
 * Child process entry for the launch file check. Runs helios-core's receiver,
 * but pack files the player edits in game (options.txt, config/) are only
 * downloaded when missing, so relaunching never resets their settings.
 */
const fs                                = require('fs-extra')
const path                              = require('path')
const { DistributionIndexProcessor }    = require('helios-core/dl')
const { Type }                          = require('helios-distribution-types')
const { isSettingsPath }                = require('./profiles')

function settingsPaths(modules, out = new Set()) {
    for(const mdl of modules) {
        if(mdl.rawModule.type === Type.File && isSettingsPath(mdl.rawModule.artifact.path ?? '')) {
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
