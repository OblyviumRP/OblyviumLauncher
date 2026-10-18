/**
 * Site notifications: cards in the corner and a centered highlight. Reads the
 * feed through notifications.js every 30 s and shows what is meant for the
 * selected server and not seen yet. Loaded after landing.js and overlay.js.
 */
const Notifications = require('./assets/js/notifications')

const loggerNotifications = LoggerUtil.getLogger('Notifications')
const notificationsToasts = document.getElementById('notificationsToasts')
const notificationsHighlight = document.getElementById('notificationsHighlight')

const NOTIFICATION_TYPE_KEYS = {
    'event': 'event',
    'announcement': 'announcement',
    'maintenance': 'maintenance',
    'launcher-update': 'launcherUpdate',
    'modpack-update': 'modpackUpdate',
    'other': 'other'
}

let notificationsFeed = null
let notificationsEtag = null
let notificationsPolling = false
const shownToasts = new Map()
let shownHighlight = null
let highlightReturnFocus = null
/** Disable/enable callbacks of the modpack buttons on screen, run when the launch lock changes. */
const notificationLockWatchers = new Set()

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
    const seen = ConfigManager.getNotificationsSeen()
    if(!seen.includes(id)){
        ConfigManager.setNotificationsSeen([...seen, id])
        ConfigManager.save()
    }
}

/** Main UI only: nothing before login, nothing while the window is minimised. */
function notificationsCanShow(){
    return !document.hidden && [VIEWS.landing, VIEWS.settings, VIEWS.mods].includes(getCurrentView())
}

function launcherUpdateButton(status){
    const button = notifButton(Lang.queryJS(process.platform === 'darwin' ? 'notifications.download' : 'notifications.updateNow'))
    button.onclick = () => {
        button.disabled = true
        setNotificationStatus(status, Lang.queryJS('notifications.checking'))
        const onUpdate = (_event, arg, info) => {
            if(arg === 'update-available' && process.platform === 'darwin'){
                stop()
                shell.openExternal(`${UPDATE_URL}Oblyvium-Launcher-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`)
                button.disabled = false
                setNotificationStatus(status, Lang.queryJS('notifications.downloadOpened'))
            } else if(arg === 'update-available'){
                setNotificationStatus(status, Lang.queryJS('notifications.downloadingUpdate'))
            } else if(arg === 'update-downloaded'){
                stop()
                button.textContent = Lang.queryJS('notifications.restartToInstall')
                button.disabled = false
                button.onclick = () => ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                setNotificationStatus(status, Lang.queryJS('notifications.updateReady'))
            } else if(arg === 'update-not-available'){
                stop()
                button.hidden = true
                setNotificationStatus(status, Lang.queryJS('notifications.upToDate'))
            } else if(arg === 'realerror'){
                stop()
                button.textContent = Lang.queryJS('notifications.retry')
                button.disabled = false
                setNotificationStatus(status, Lang.queryJS('notifications.updateFailed'))
            }
        }
        const stop = () => ipcRenderer.removeListener('autoUpdateNotification', onUpdate)
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
        if(button.dataset.busy) return
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
        const prepared = await prepareServerFiles()
        delete button.dataset.busy
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
 * @returns {HTMLElement} The title element.
 */
function buildNotificationBody(item, container, extraButtons = []){
    container.append(notifEl('span', 'notif-chip notif-chip-' + item.type, Lang.queryJS('notifications.type.' + NOTIFICATION_TYPE_KEYS[item.type])))
    const title = notifEl('h3', 'notif-title', item.title)
    container.append(title)
    if(item.body) container.append(notifEl('p', 'notif-body', item.body))

    const status = notifEl('p', 'notif-status')
    status.setAttribute('role', 'status')
    status.hidden = true
    const actions = notifEl('div', 'notif-actions')
    if(item.type === 'launcher-update') actions.append(launcherUpdateButton(status))
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

function removeToast(id){
    const card = shownToasts.get(id)
    if(card == null) return
    shownToasts.delete(id)
    card.remove()
    renderNotifications()
}

function showToast(item){
    markNotificationSeen(item.id)
    const card = notifEl('article', 'notif-toast')
    card.dataset.id = item.id
    card.setAttribute('aria-label', item.title)
    const close = notifEl('button', 'notif-close', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', Lang.queryJS('notifications.close'))
    close.onclick = () => removeToast(item.id)
    card.append(close)
    buildNotificationBody(item, card)
    notificationsToasts.append(card)
    shownToasts.set(item.id, card)

    if(!item.sticky){
        let timer = null
        const start = () => {
            clearTimeout(timer)
            timer = setTimeout(() => removeToast(item.id), Notifications.AUTO_DISMISS_MS)
        }
        const pause = () => clearTimeout(timer)
        card.addEventListener('mouseenter', pause)
        card.addEventListener('mouseleave', start)
        card.addEventListener('focusin', pause)
        card.addEventListener('focusout', start)
        start()
    }
}

function openHighlight(item){
    markNotificationSeen(item.id)
    shownHighlight = item.id
    highlightReturnFocus = document.activeElement
    const card = notificationsHighlight.querySelector('.notif-highlight-card')
    card.replaceChildren()
    if(item.image){
        const image = notifEl('img', 'notif-image')
        image.alt = ''
        image.onerror = () => image.remove()
        image.src = item.image
        card.append(image)
    }
    const content = notifEl('div', 'notif-highlight-content')
    const close = notifButton(Lang.queryJS('notifications.close'), true)
    close.onclick = closeHighlight
    const title = buildNotificationBody(item, content, [close])
    title.id = 'notificationsHighlightTitle'
    card.append(content)
    notificationsHighlight.hidden = false
    const first = content.querySelector('button:not([disabled]):not([hidden])')
    if(first) first.focus()
}

function closeHighlight(){
    notificationsHighlight.hidden = true
    shownHighlight = null
    if(highlightReturnFocus && typeof highlightReturnFocus.focus === 'function') highlightReturnFocus.focus()
    highlightReturnFocus = null
    renderNotifications()
}

notificationsHighlight.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
        event.preventDefault()
        event.stopPropagation()
        closeHighlight()
        return
    }
    if(event.key !== 'Tab') return
    const buttons = [...notificationsHighlight.querySelectorAll('button:not([disabled]):not([hidden])')]
    if(buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if(event.shiftKey && document.activeElement === first){
        event.preventDefault()
        last.focus()
    } else if(!event.shiftKey && document.activeElement === last){
        event.preventDefault()
        first.focus()
    }
})

function renderNotifications(){
    const overlay = isOverlayVisible()
    // A launcher dialog takes the keyboard; the cards wait behind it.
    notificationsToasts.inert = overlay
    if(notificationsFeed == null || !notificationsCanShow()) return
    const pending = Notifications.pendingItems(notificationsFeed.feed, {
        serverId: ConfigManager.getSelectedServer(),
        seen: new Set(ConfigManager.getNotificationsSeen()),
        feedNowMs: Notifications.feedClock(notificationsFeed.clock)
    })
    if(!overlay && shownHighlight == null){
        const highlight = pending.find(item => item.highlight)
        if(highlight) openHighlight(highlight)
    }
    for(const item of pending){
        if(item.highlight || shownToasts.has(item.id)) continue
        if(shownToasts.size >= Notifications.MAX_TOASTS) break
        showToast(item)
    }
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
            ConfigManager.setNotificationsSeen(Notifications.pruneSeen(ConfigManager.getNotificationsSeen(), result.feed))
            ConfigManager.save()
        } else if(notificationsFeed != null && result.clock != null){
            // 304: same file, fresh server clock (scheduled and expired items depend on it).
            notificationsFeed.clock = result.clock
        }
    } catch(err) {
        loggerNotifications.warn('Could not read the notifications feed:', err.message)
    } finally {
        notificationsPolling = false
    }
    renderNotifications()
}

// Re-filter when the selected server changes and react to the launch lock.
// Function declarations in classic scripts are writable globals, and callers
// resolve them at call time, so wrapping here reaches every caller.
const notificationsBaseUpdateSelectedServer = updateSelectedServer
updateSelectedServer = function(...args){
    const result = notificationsBaseUpdateSelectedServer.apply(this, args)
    renderNotifications()
    return result
}
const notificationsBaseRefreshLaunchLock = refreshLaunchLock
refreshLaunchLock = function(...args){
    const result = notificationsBaseRefreshLaunchLock.apply(this, args)
    notificationLockWatchers.forEach(sync => sync())
    return result
}

document.addEventListener('visibilitychange', renderNotifications)
setInterval(pollNotifications, Notifications.POLL_MS)
pollNotifications()
