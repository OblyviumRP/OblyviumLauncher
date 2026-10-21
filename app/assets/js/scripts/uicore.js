/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

// Must match the publish url in electron-builder.yml.
const UPDATE_URL = 'https://launcher.oblyvium.com.br/updates/'

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// **Exibe um aviso quando a janela de ferramentas de desenvolvedor (DevTools) é aberta.**
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log(
        '%cO console é escuro e está cheio de perigos.',
        'color: white; -webkit-text-stroke: 4px #a02d2a; font-size: 60px; font-weight: bold'
    )
    console.log(
        '%cSe alguém pediu para você colar algo aqui, você está sendo enganado.',
        'font-size: 16px'
    )
    console.log(
        '%cA menos que você saiba exatamente o que está fazendo, feche esta janela.',
        'font-size: 16px'
    )
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)

                if(process.platform === 'darwin'){
                    info.darwindownload = `${UPDATE_URL}Oblyvium-Launcher-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`
                    showUpdateUI('download', info)
                } else {
                    showUpdateUI('downloading', info)
                }

                populateSettingsUpdateInformation(info)
                break
            case 'download-progress':
                showUpdateUI('downloading', launcherUpdateInfo, info.percent)
                settingsUpdateButtonStatus(Lang.queryJS('settings.updates.downloadingPercentButton', { percent: Math.floor(info.percent) }), true)
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    installLauncherUpdate(document.getElementById('settingsUpdateTitle'), settingsUpdateActionButton)
                })
                showUpdateUI('ready', info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

/** The update the notice describes, kept so progress events can reuse its version. */
let launcherUpdateInfo = null

/**
 * Show the update notice next to the logo.
 *
 * @param {'downloading' | 'ready' | 'download'} state downloading runs in the background,
 * ready is installed by restarting, download (macOS) opens the installer page.
 * @param {Object} info The update info from electron-updater.
 * @param {number} percent Optional. Download progress, 0 to 100.
 */
function showUpdateUI(state, info, percent = null){
    launcherUpdateInfo = info
    const version = info?.version ?? ''
    const title = document.getElementById('launcherUpdateTitle')
    const status = document.getElementById('launcherUpdateStatus')
    const button = document.getElementById('launcherUpdateButton')
    document.getElementById('launcherUpdateNotice').hidden = false
    button.disabled = false
    if(state === 'ready'){
        title.textContent = Lang.queryJS('uicore.autoUpdate.noticeReady', { version })
        status.textContent = Lang.queryJS('uicore.autoUpdate.noticeReadyDesc')
        button.textContent = Lang.queryJS('uicore.autoUpdate.noticeRestartButton')
        button.onclick = () => installLauncherUpdate(status, button)
        button.hidden = false
    } else if(state === 'download'){
        title.textContent = Lang.queryJS('uicore.autoUpdate.noticeAvailable', { version })
        status.textContent = Lang.queryJS('uicore.autoUpdate.noticeDownloadDesc')
        button.textContent = Lang.queryJS('uicore.autoUpdate.noticeDownloadButton')
        button.onclick = () => shell.openExternal(info.darwindownload)
        button.hidden = false
    } else {
        title.textContent = Lang.queryJS('uicore.autoUpdate.noticeAvailable', { version })
        status.textContent = percent == null
            ? Lang.queryJS('uicore.autoUpdate.noticeDownloading')
            : Lang.queryJS('uicore.autoUpdate.noticeDownloadingPercent', { percent: Math.floor(percent) })
        button.hidden = true
    }
}

/**
 * Close the launcher, install the downloaded update silently and open it again.
 * Refused while the game is opening or running, since closing would stop it.
 *
 * @param {Element} status Optional. Where to explain a refusal.
 * @param {Element} button Optional. Disabled while the launcher restarts.
 * @returns {boolean} Whether the install started.
 */
function installLauncherUpdate(status = null, button = null){
    if(typeof isLaunchLocked === 'function' && isLaunchLocked()){
        if(status != null) status.textContent = Lang.queryJS('uicore.autoUpdate.noticeGameRunning')
        return false
    }
    if(button != null){
        button.disabled = true
        button.textContent = Lang.queryJS('uicore.autoUpdate.noticeRestarting')
    }
    if(!isDev){
        ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
    }
    return true
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Bind restore down button.
        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                if(window.isMaximized()){
                    window.unmaximize()
                } else {
                    window.maximize()
                }
                document.activeElement.blur()
            })
        })

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if(document.readyState === 'complete'){

        //266.01
        //170.8
        //53.21
        // Bind progress bar length to length of bot wrapper
        //const targetWidth = document.getElementById("launch_content").getBoundingClientRect().width
        //const targetWidth2 = document.getElementById("server_selection").getBoundingClientRect().width
        //const targetWidth3 = document.getElementById("launch_button").getBoundingClientRect().width

        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
        
    }

}, false)

/**
 * Links never navigate the launcher window (it has Node access). Web links
 * open in the user's default browser; anything else (e.g. href="#" with its
 * own click handler) only loses the default action.
 */
function openLinkExternally(anchor, event) {
    event.preventDefault()
    let url
    try {
        url = new URL(anchor.getAttribute('href'), document.baseURI)
    } catch {
        return
    }
    if(url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(url.href)
    }
}
$(document).on('click', 'a[href]', function(event) {
    openLinkExternally(this, event)
})
$(document).on('auxclick', 'a[href]', function(event) {
    if(event.button === 1) {
        openLinkExternally(this, event)
    } else {
        event.preventDefault()
    }
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})