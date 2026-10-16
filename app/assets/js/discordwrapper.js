/**
 * Discord Rich Presence. One connection is kept while the launcher runs; the
 * status changes between "in the launcher" and the game's loading/playing
 * states. If Discord is not running, the next status change tries again.
 */
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('DiscordWrapper')

const { Client } = require('discord-rpc-patch')

const Lang = require('./langloader')

let client = null
let clientId = null
let ready = false
let activity = null

function connect(id){
    const thisClient = new Client({ transport: 'ipc' })
    client = thisClient
    clientId = id
    ready = false

    thisClient.on('ready', () => {
        if(client !== thisClient){
            return
        }
        ready = true
        logger.info('Discord RPC Connected')
        pushActivity()
    })

    thisClient.login({ clientId: id }).catch(error => {
        if(error.message.includes('ENOENT')) {
            logger.info('Unable to initialize Discord Rich Presence, no client detected.')
        } else {
            logger.info('Unable to initialize Discord Rich Presence: ' + error.message, error)
        }
        // Forget the failed client so the next status change retries.
        if(client === thisClient){
            client = null
            clientId = null
            ready = false
        }
    })
}

function pushActivity(){
    if(client == null || !ready || activity == null){
        return
    }
    client.setActivity(activity).catch(err => logger.warn('Unable to update Discord Rich Presence.', err))
}

/**
 * Show a status. Reuses the current connection when the client id is the same.
 *
 * @param {Object | null} genSettings Distribution-level discord settings (clientId, smallImage*).
 * @param {Object | null} servSettings Server-level discord settings (shortId, largeImage*).
 * @param {string} details First line of the status.
 * @param {{resetTimer?: boolean}} options resetTimer restarts the elapsed-time counter.
 */
exports.setPresence = function(genSettings, servSettings, details, { resetTimer = false } = {}){
    if(genSettings?.clientId == null || servSettings == null){
        exports.shutdownRPC()
        return
    }
    activity = {
        details,
        state: Lang.queryJS('discord.state', { shortId: servSettings.shortId }),
        largeImageKey: servSettings.largeImageKey,
        largeImageText: servSettings.largeImageText,
        smallImageKey: genSettings.smallImageKey,
        smallImageText: genSettings.smallImageText,
        startTimestamp: resetTimer || activity?.startTimestamp == null ? Date.now() : activity.startTimestamp,
        instance: false
    }
    if(client != null && clientId === genSettings.clientId){
        pushActivity()
        return
    }
    exports.shutdownRPC({ keepActivity: true })
    connect(genSettings.clientId)
}

exports.initRPC = function(genSettings, servSettings, initialDetails = Lang.queryJS('discord.waiting')){
    exports.setPresence(genSettings, servSettings, initialDetails, { resetTimer: true })
}

exports.updateDetails = function(details){
    if(activity == null){
        return
    }
    activity.details = details
    pushActivity()
}

exports.shutdownRPC = function({ keepActivity = false } = {}){
    if(client != null){
        const old = client
        old.clearActivity().catch(() => {})
        old.destroy().catch(() => {})
    }
    client = null
    clientId = null
    ready = false
    if(!keepActivity){
        activity = null
    }
}
