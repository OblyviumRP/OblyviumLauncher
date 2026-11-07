const { DistributionAPI } = require('helios-core/common')
const { LoggerUtil } = require('helios-core')
const got = require('got')

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

// helios-core fetches without a timeout and retries twice, so a site that is down
// held the launcher for a long time before it fell back to the local copy.
api.pullRemote = async function(){
    try {
        const res = await got.get(this.remoteUrl, { responseType: 'json', timeout: 10000, retry: 0 })
        return { data: res.body }
    } catch(err) {
        LoggerUtil.getLogger('DistroAPI').warn(`Remote distribution unavailable (${err.code ?? err.message}), using the local copy.`)
        return { data: null }
    }
}

// Every loaded distribution gets Java requirements newer than helios-core knows
// about (Minecraft 26+ needs Java 25).
for(const method of ['getDistribution', 'getDistributionLocalLoadOnly', 'refreshDistributionOrFallback']) {
    const original = api[method].bind(api)
    api[method] = async (...args) => JavaDefaults.apply(await original(...args))
}

exports.DistroAPI = api