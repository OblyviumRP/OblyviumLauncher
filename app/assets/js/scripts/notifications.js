/**
 * Site notifications: cards in the corner and a centered highlight. Reads the
 * feed through notifications.js every 30 s and shows what is meant for the
 * selected server and not seen yet. Loaded after landing.js and overlay.js.
 */
const Notifications = require('./assets/js/notifications')

const loggerNotifications = LoggerUtil.getLogger('Notifications')
const notificationsToasts = document.getElementById('notificationsToasts')
const notificationsHighlight = document.getElementById('notificationsHighlight')
const notificationsHighlightCard = notificationsHighlight.querySelector('.notif-highlight-card')

const NOTIFICATION_TYPE_KEYS = {
    'event': 'event',
    'announcement': 'announcement',
    'maintenance': 'maintenance',
    'launcher-update': 'launcherUpdate',
    'modpack-update': 'modpackUpdate',
    'other': 'other'
}

/**
 * How long a launcher update waits for the updater: an answer to the check, then
 * the download (no progress events arrive while it runs). An object so the
 * Electron check can shorten them.
 */
const notificationUpdateTimeouts = { checkMs: 60000, downloadMs: 600000 }
const UP_TO_DATE_DISMISS_MS = 3000

let notificationsFeed = null
let notificationsEtag = null
let notificationsPolling = false
let notificationsReadFailing = false
/** id -> { card, item, syncTimer, clearTimer } */
const shownToasts = new Map()
/** The item in the highlight, or null. */
let shownHighlight = null
let highlightReturnFocus = null
/** Ids shown during the current render, saved once at its end. */
let notificationsNewlySeen = []
/** Disable/enable callbacks of the modpack buttons on screen, run when the launch lock changes. */
const notificationLockWatchers = new Set()
/**
 * Whether the auto-updater runs (it does not in development). A let so the
 * Electron check can drive the update buttons in development.
 */
let notificationsUpdaterEnabled = !isDev
/** Version the auto-updater already downloaded in the background, or null. */
let launcherUpdateDownloaded = null
ipcRenderer.on('autoUpdateNotification', (_event, arg, info) => {
    if(arg === 'update-downloaded') launcherUpdateDownloaded = info?.version ?? true
})

function notifEl(tag, className, text){
    const element = document.createElement(tag)
    if(className) element.className = className
    if(text != null) element.textContent = text
    return element
}

function notifButton(text, secondary = false){
    const button = notifEl('button', secondary ? 'notif-btn notif-btn-secondary' : 'notif-btn', text)
    button.type = 'button'
    return button
}

function setNotificationStatus(status, text){
    status.textContent = text
    status.hidden = false
}

function markNotificationSeen(id){
    notificationsNewlySeen.push(id)
}

/** One save for everything a render put on screen. */
function saveNotificationsSeen(){
    const seen = ConfigManager.getNotificationsSeen()
    const added = notificationsNewlySeen.filter(id => !seen.includes(id))
    notificationsNewlySeen = []
    if(added.length === 0) return
    ConfigManager.setNotificationsSeen([...seen, ...added])
    ConfigManager.save()
}

/** Main UI only: nothing before login, nothing while the window is minimised. */
function notificationsCanShow(){
    return !document.hidden && [VIEWS.landing, VIEWS.settings, VIEWS.mods].includes(getCurrentView())
}

/** Ids already sent to Windows this session, so the 30 s reads never repeat one. */
const nativeNotified = new Set()

/** Past login, but the player is elsewhere: launcher minimised, behind another window or in the game. */
function notificationsAway(){
    return [VIEWS.landing, VIEWS.settings, VIEWS.mods].includes(getCurrentView()) && (document.hidden || !document.hasFocus())
}

/** Bring the launcher to the front, restoring it when minimised. */
function focusLauncherWindow(){
    const win = remote.getCurrentWindow()
    if(win.isMinimized()) win.restore()
    win.show()
    win.focus()
}

/**
 * Send pending notifications to the system while the player is away. The cards
 * still show in the launcher once it is back on screen.
 */
function sendNativeNotifications(pending){
    if(!notificationsAway()) return
    for(const item of pending.filter(item => !nativeNotified.has(item.id)).slice(0, Notifications.MAX_TOASTS)){
        nativeNotified.add(item.id)
        const type = Lang.queryJS('notifications.type.' + NOTIFICATION_TYPE_KEYS[item.type])
        const native = new Notification(`${type} · ${item.title}`, { body: item.body })
        native.onclick = focusLauncherWindow
    }
}

function launcherUpdateButton(status, dismiss){
    const button = notifButton(Lang.queryJS(process.platform === 'darwin' ? 'notifications.download' : 'notifications.updateNow'))
    const offerRetry = text => {
        button.textContent = Lang.queryJS('notifications.retry')
        button.disabled = false
        setNotificationStatus(status, text)
    }
    const offerRestart = () => {
        button.textContent = Lang.queryJS('notifications.restartToInstall')
        button.disabled = false
        button.onclick = () => {
            if(!notificationsUpdaterEnabled) return
            if(typeof isLaunchLocked === 'function' && isLaunchLocked()){
                setNotificationStatus(status, Lang.queryJS('uicore.autoUpdate.noticeGameRunning'))
                return
            }
            ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
        }
        setNotificationStatus(status, Lang.queryJS('notifications.updateReady'))
    }
    button.onclick = () => {
        // Downloaded in the background already: nothing left to check.
        if(launcherUpdateDownloaded != null && process.platform !== 'darwin'){
            offerRestart()
            return
        }
        if(!notificationsUpdaterEnabled){
            offerRetry(Lang.queryJS('notifications.updateFailed'))
            return
        }
        button.disabled = true
        setNotificationStatus(status, Lang.queryJS('notifications.checking'))
        // No answer from the updater in time: stop waiting and let the player try again.
        let timeout = null
        const wait = ms => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                stop()
                offerRetry(Lang.queryJS('notifications.updateFailed'))
            }, ms)
        }
        const onUpdate = (_event, arg, info) => {
            if(arg === 'update-available' && process.platform === 'darwin'){
                stop()
                shell.openExternal(`${UPDATE_URL}Oblyvium-Launcher-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`)
                button.disabled = false
                setNotificationStatus(status, Lang.queryJS('notifications.downloadOpened'))
            } else if(arg === 'update-available'){
                // The download runs on its own; give it its own, longer wait.
                wait(notificationUpdateTimeouts.downloadMs)
                setNotificationStatus(status, Lang.queryJS('notifications.downloadingUpdate'))
            } else if(arg === 'update-downloaded'){
                stop()
                offerRestart()
            } else if(arg === 'update-not-available'){
                stop()
                button.hidden = true
                setNotificationStatus(status, Lang.queryJS('notifications.upToDate'))
                setTimeout(dismiss, UP_TO_DATE_DISMISS_MS)
            } else if(arg === 'realerror'){
                stop()
                const message = typeof info?.message === 'string' ? info.message.slice(0, 200) : ''
                offerRetry(Lang.queryJS('notifications.updateFailed') + (message ? ' ' + message : ''))
            }
        }
        const stop = () => {
            clearTimeout(timeout)
            ipcRenderer.removeListener('autoUpdateNotification', onUpdate)
        }
        wait(notificationUpdateTimeouts.checkMs)
        ipcRenderer.on('autoUpdateNotification', onUpdate)
        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
    }
    return button
}

function modpackUpdateButton(status){
    const button = notifButton(Lang.queryJS('notifications.updateNow'))
    const sync = () => {
        if(!button.isConnected){
            notificationLockWatchers.delete(sync)
            return
        }
        // Busy, or done: the status line already says what happened.
        if(button.dataset.busy || button.hidden) return
        button.disabled = isLaunchLocked()
        if(gameRunning > 0){
            setNotificationStatus(status, Lang.queryJS('notifications.closeGameFirst'))
        } else if(status.textContent === Lang.queryJS('notifications.closeGameFirst')){
            status.hidden = true
        }
    }
    notificationLockWatchers.add(sync)
    button.onclick = async () => {
        if(isLaunchLocked()) return
        button.dataset.busy = '1'
        button.disabled = true
        setNotificationStatus(status, Lang.queryJS('notifications.updatingModpack'))
        let prepared = null
        try {
            prepared = await prepareServerFiles()
        } catch(err) {
            // The Jogar path has its own catch; without one here the launch area would stay locked.
            loggerNotifications.error('Could not update the modpack.', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        } finally {
            delete button.dataset.busy
        }
        if(prepared != null){
            toggleLaunchArea(false)
            button.hidden = true
            setNotificationStatus(status, Lang.queryJS('notifications.modpackUpdated'))
        } else {
            button.textContent = Lang.queryJS('notifications.retry')
            setNotificationStatus(status, Lang.queryJS('notifications.modpackFailed'))
            sync()
        }
    }
    // Run after the button is in the page, so isConnected is true.
    setTimeout(sync)
    return button
}

/**
 * Fills a card with chip, title, text and buttons. Text always goes in as
 * text, never as HTML.
 *
 * @param {() => void} dismiss Removes this card (once an action is done).
 * @returns {HTMLElement} The title element.
 */
function buildNotificationBody(item, container, dismiss, extraButtons = []){
    container.append(notifEl('span', 'notif-chip notif-chip-' + item.type, Lang.queryJS('notifications.type.' + NOTIFICATION_TYPE_KEYS[item.type])))
    const title = notifEl('h3', 'notif-title', item.title)
    container.append(title)
    if(item.body) container.append(notifEl('p', 'notif-body', item.body))

    const status = notifEl('p', 'notif-status')
    status.setAttribute('role', 'status')
    status.hidden = true
    const actions = notifEl('div', 'notif-actions')
    if(item.type === 'launcher-update') actions.append(launcherUpdateButton(status, dismiss))
    if(item.type === 'modpack-update') actions.append(modpackUpdateButton(status))
    if(item.link){
        const link = notifButton(item.link.label + ' ↗', true)
        link.onclick = () => shell.openExternal(item.link.url)
        actions.append(link)
    }
    actions.append(...extraButtons)
    if(actions.childElementCount > 0) container.append(actions)
    container.append(status)
    return title
}

/** Takes a card off the screen without rendering again. */
function dropToast(id){
    const shown = shownToasts.get(id)
    if(shown == null) return
    shownToasts.delete(id)
    shown.clearTimer()
    shown.card.remove()
}

function removeToast(id){
    if(!shownToasts.has(id)) return
    dropToast(id)
    renderNotifications()
}

function showToast(item){
    markNotificationSeen(item.id)
    const card = notifEl('article', 'notif-toast')
    card.dataset.id = item.id
    card.dataset.target = item.target
    card.setAttribute('aria-label', item.title)
    const close = notifEl('button', 'notif-close', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', Lang.queryJS('notifications.close'))
    close.onclick = () => removeToast(item.id)
    card.append(close)
    buildNotificationBody(item, card, () => removeToast(item.id))
    notificationsToasts.append(card)

    // The auto-dismiss countdown only runs while the card can be read: not under
    // the mouse or focus, not behind a dialog, not with the window minimised.
    let timer = null
    let hovered = false
    let focused = false
    const clearTimer = () => {
        clearTimeout(timer)
        timer = null
    }
    const syncTimer = () => {
        if(item.sticky) return
        if(hovered || focused || isOverlayVisible() || !notificationsCanShow()){
            clearTimer()
        } else if(timer == null){
            timer = setTimeout(() => removeToast(item.id), Notifications.AUTO_DISMISS_MS)
        }
    }
    card.addEventListener('mouseenter', () => { hovered = true; syncTimer() })
    card.addEventListener('mouseleave', () => { hovered = false; syncTimer() })
    card.addEventListener('focusin', () => { focused = true; syncTimer() })
    card.addEventListener('focusout', () => { focused = false; syncTimer() })
    shownToasts.set(item.id, { card, item, syncTimer, clearTimer })
    syncTimer()
}

// Clicks on the card keep the focus inside the dialog instead of dropping it on the body.
notificationsHighlightCard.tabIndex = -1
// Same for clicks on the dimmed backdrop around the card.
notificationsHighlight.addEventListener('mousedown', event => {
    if(event.target === notificationsHighlight) event.preventDefault()
})

function focusHighlight(){
    const first = notificationsHighlightCard.querySelector('button:not([disabled]):not([hidden])')
    if(first){
        first.focus()
    } else {
        notificationsHighlightCard.focus()
    }
}

function openHighlight(item){
    markNotificationSeen(item.id)
    shownHighlight = item
    highlightReturnFocus = document.activeElement
    notificationsHighlightCard.replaceChildren()
    if(item.image){
        const image = notifEl('img', 'notif-image')
        image.alt = ''
        image.onerror = () => image.remove()
        image.src = item.image
        notificationsHighlightCard.append(image)
    }
    const content = notifEl('div', 'notif-highlight-content')
    const close = notifButton(Lang.queryJS('notifications.close'), true)
    close.onclick = closeHighlight
    const title = buildNotificationBody(item, content, () => {
        if(shownHighlight === item) closeHighlight()
    }, [close])
    title.id = 'notificationsHighlightTitle'
    notificationsHighlightCard.append(content)
    syncHighlightVisibility()
    focusHighlight()
}

/**
 * Shows the open highlight only on the main screens. While it shows, the page
 * behind takes no focus or clicks.
 */
function syncHighlightVisibility(){
    const visible = shownHighlight != null && notificationsCanShow()
    const wasHidden = notificationsHighlight.hidden
    notificationsHighlight.hidden = !visible
    document.getElementById('main').inert = visible
    if(visible && wasHidden && !notificationsHighlight.contains(document.activeElement)) focusHighlight()
}

/** Closes the highlight without rendering again. */
function hideHighlight(){
    shownHighlight = null
    syncHighlightVisibility()
    const returnTo = highlightReturnFocus?.isConnected && highlightReturnFocus !== document.body
        ? highlightReturnFocus
        : document.getElementById('launch_button')
    highlightReturnFocus = null
    returnTo.focus()
}

function closeHighlight(){
    hideHighlight()
    renderNotifications()
}

notificationsHighlight.addEventListener('keydown', event => {
    // A launcher dialog on top owns the keyboard.
    if(isOverlayVisible()) return
    // Keys must not reach the page behind (landing.js binds the arrows, for one).
    event.stopPropagation()
    if(event.key === 'Escape'){
        event.preventDefault()
        closeHighlight()
        return
    }
    if(event.key !== 'Tab') return
    const buttons = [...notificationsHighlight.querySelectorAll('button:not([disabled]):not([hidden])')]
    if(buttons.length === 0){
        event.preventDefault()
        return
    }
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if(event.shiftKey && (document.activeElement === first || document.activeElement === notificationsHighlightCard)){
        event.preventDefault()
        last.focus()
    } else if(!event.shiftKey && document.activeElement === last){
        event.preventDefault()
        first.focus()
    }
})

function renderNotifications(){
    // Off the main screens (back at login, minimised) shown cards and the highlight hide too.
    notificationsToasts.hidden = !notificationsCanShow()
    syncHighlightVisibility()
    const overlay = isOverlayVisible()
    // A launcher dialog takes the keyboard; the cards and the highlight wait behind it.
    notificationsToasts.inert = overlay
    const highlightWasInert = notificationsHighlight.inert
    notificationsHighlight.inert = overlay
    if(highlightWasInert && !overlay && shownHighlight != null && !notificationsHighlight.contains(document.activeElement)){
        focusHighlight()
    }
    shownToasts.forEach(shown => shown.syncTimer())
    if(notificationsFeed == null) return
    const pending = Notifications.pendingItems(notificationsFeed.feed, {
        serverId: ConfigManager.getSelectedServer(),
        seen: new Set(ConfigManager.getNotificationsSeen()),
        feedNowMs: Notifications.feedClock(notificationsFeed.clock)
    })
    sendNativeNotifications(pending)
    if(!notificationsCanShow()) return
    if(!overlay && shownHighlight == null){
        const highlight = pending.find(item => item.highlight)
        if(highlight) openHighlight(highlight)
    }
    for(const item of pending){
        if(item.highlight || shownToasts.has(item.id)) continue
        if(shownToasts.size >= Notifications.MAX_TOASTS) break
        showToast(item)
    }
    saveNotificationsSeen()
}

async function pollNotifications(){
    if(notificationsPolling) return
    notificationsPolling = true
    try {
        const result = await Notifications.fetchFeed({ etag: notificationsEtag })
        if(result.changed){
            notificationsFeed = { feed: result.feed, clock: result.clock }
            notificationsEtag = result.etag
            if(result.feed.dropped > 0) loggerNotifications.warn(`Ignored ${result.feed.dropped} invalid or repeated notification(s).`)
            const seen = ConfigManager.getNotificationsSeen()
            const kept = Notifications.pruneSeen(seen, result.feed)
            if(kept.length !== seen.length){
                ConfigManager.setNotificationsSeen(kept)
                ConfigManager.save()
            }
        } else if(notificationsFeed != null && result.clock != null){
            // 304: same file, fresh server clock (scheduled and expired items depend on it).
            notificationsFeed.clock = result.clock
        }
        if(notificationsReadFailing) loggerNotifications.info('The notifications feed can be read again.')
        notificationsReadFailing = false
    } catch(err) {
        // Once per outage, not every 30 s.
        if(!notificationsReadFailing) loggerNotifications.warn('Could not read the notifications feed:', err.message)
        notificationsReadFailing = true
    } finally {
        notificationsPolling = false
    }
    renderNotifications()
}

// Function declarations in classic scripts are writable globals, and callers
// resolve them at call time, so wrapping here reaches every caller.

// Re-filter when the selected server changes, dropping what was meant for the previous one only.
const notificationsBaseUpdateSelectedServer = updateSelectedServer
updateSelectedServer = function(...args){
    const result = notificationsBaseUpdateSelectedServer.apply(this, args)
    const serverId = ConfigManager.getSelectedServer()
    const forOtherServer = item => item.target !== 'all' && item.target !== serverId
    if(shownHighlight != null && forOtherServer(shownHighlight)) hideHighlight()
    for(const [id, shown] of [...shownToasts]){
        if(forOtherServer(shown.item)) dropToast(id)
    }
    renderNotifications()
    return result
}
// React to the launch lock.
const notificationsBaseRefreshLaunchLock = refreshLaunchLock
refreshLaunchLock = function(...args){
    const result = notificationsBaseRefreshLaunchLock.apply(this, args)
    notificationLockWatchers.forEach(sync => sync())
    return result
}
// A dialog opening or closing changes whether the cards are inert and the highlight may open.
const notificationsBaseToggleOverlay = toggleOverlay
toggleOverlay = function(...args){
    const result = notificationsBaseToggleOverlay.apply(this, args)
    renderNotifications()
    return result
}
// Render as soon as a view is on screen, not on the next 30 s read.
const notificationsBaseSwitchView = switchView
switchView = function(current, next, currentFadeTime, nextFadeTime, onCurrentFade, onNextFade = () => {}){
    return notificationsBaseSwitchView.call(this, current, next, currentFadeTime, nextFadeTime, onCurrentFade, async () => {
        await onNextFade()
        // A failure here must not skip switchView's own focus handling after this callback.
        try {
            renderNotifications()
        } catch(err) {
            loggerNotifications.error('Could not show the notifications.', err)
        }
    })
}
// showMainUI picks the first view a moment after it returns, then fades it in.
const notificationsBaseShowMainUI = showMainUI
showMainUI = async function(...args){
    const result = await notificationsBaseShowMainUI.apply(this, args)
    let tries = 0
    const whenShown = () => {
        if(getCurrentView() == null){
            // The view comes 750 ms later; stop looking after 10 s.
            if(++tries < 100) setTimeout(whenShown, 100)
        } else {
            $(getCurrentView()).promise().done(renderNotifications)
        }
    }
    whenShown()
    return result
}

document.addEventListener('visibilitychange', renderNotifications)
setInterval(pollNotifications, Notifications.POLL_MS)
pollNotifications()
