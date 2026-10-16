/**
 * One-time cleanup of settings left over from the NationNetwork launcher.
 *
 * config.json stores the data directory as an absolute path, so configs created
 * before the rename keep pointing at ".NationNetworkLauncher" even though the
 * default is now ".OblyviumLauncher".
 */
const path = require('path')

const LEGACY_DATA_DIR = '.NationNetworkLauncher'

function normalize(dir) {
    return path.resolve(String(dir)).replace(/[\\/]+$/, '').toLowerCase()
}

/**
 * Move a config still using the old default data directory to the new one, and
 * forget Java executables that lived inside the old folder (they are found or
 * downloaded again on the next launch). A directory the player chose themselves
 * is left alone.
 *
 * @param {Object} config The loaded configuration (changed in place).
 * @param {string} sysRoot The folder that holds launcher data (APPDATA on Windows).
 * @param {string} dataPath The current default data directory.
 * @returns {boolean} Whether anything changed.
 */
exports.migrateLegacyDataDirectory = function(config, sysRoot, dataPath) {
    const current = config?.settings?.launcher?.dataDirectory
    if(current == null) {
        return false
    }
    const legacy = normalize(path.join(sysRoot, LEGACY_DATA_DIR))
    if(normalize(current) !== legacy) {
        return false
    }
    config.settings.launcher.dataDirectory = dataPath
    for(const java of Object.values(config.javaConfig ?? {})) {
        const exe = java?.executable
        if(exe != null && normalize(exe).startsWith(legacy + path.sep)) {
            java.executable = null
        }
    }
    return true
}
