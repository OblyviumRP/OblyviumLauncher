const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')
const JavaDefaults  = require('./javadefaults')

exports.REMOTE_DISTRO_URL = 'https://launcher.oblyvium.com.br/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    // Without a remote URL, read distribution_dev.json from the launcher directory.
    exports.REMOTE_DISTRO_URL === ''
)

// Every loaded distribution gets Java requirements newer than helios-core knows
// about (Minecraft 26+ needs Java 25).
for(const method of ['getDistribution', 'getDistributionLocalLoadOnly', 'refreshDistributionOrFallback']) {
    const original = api[method].bind(api)
    api[method] = async (...args) => JavaDefaults.apply(await original(...args))
}

exports.DistroAPI = api