const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URL = 'https://launcher.oblyvium.com.br/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    // Without a remote URL, read distribution_dev.json from the launcher directory.
    exports.REMOTE_DISTRO_URL === ''
)

exports.DistroAPI = api