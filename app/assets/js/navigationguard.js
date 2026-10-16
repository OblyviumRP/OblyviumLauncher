/**
 * Keeps the launcher window on its own page. The renderer runs with Node
 * integration, so any remote page loaded into it would get `require`.
 * Web links are handed to the system browser instead.
 * Main process only; the pure helpers are unit tested.
 */

function parse(value, base) {
    try {
        return new URL(value, base)
    } catch {
        return null
    }
}

/**
 * @param {string} target URL the window wants to load.
 * @param {string} appUrl URL the window was loaded with.
 * @returns {boolean} True when target is the launcher page itself (hash and query ignored).
 */
function isAppUrl(target, appUrl) {
    const url = parse(target)
    const app = parse(appUrl)
    // WHATWG pathnames are already canonical; decoding could throw.
    return url != null && app != null && url.protocol === 'file:' && app.protocol === 'file:'
        && url.host === app.host && url.pathname === app.pathname
}

/**
 * @param {string} target URL the window wants to load.
 * @param {string} appUrl URL the window was loaded with.
 * @returns {{ allow: boolean, external: string | null }} Whether to let the
 * navigation happen, and which URL (if any) to open in the system browser.
 */
function decideNavigation(target, appUrl) {
    try {
        if(isAppUrl(target, appUrl)) {
            return { allow: true, external: null }
        }
        return { allow: false, external: externalUrl(target) }
    } catch {
        // Fail closed: an unexpected error must never let a navigation through.
        return { allow: false, external: null }
    }
}

/**
 * @param {string} target URL a link or window.open asked for.
 * @returns {string | null} Normalised http(s) URL, or null for anything else.
 */
function externalUrl(target) {
    const url = parse(target)
    return url != null && (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : null
}

/**
 * Block every navigation away from the app page and every new window.
 * @param {Electron.WebContents} webContents Launcher window contents.
 * @param {() => string} getAppUrl Returns the URL the window was loaded with.
 * @param {(url: string) => unknown} openExternal Opens a URL in the system browser.
 */
function attach(webContents, getAppUrl, openExternal) {
    webContents.on('will-navigate', (event, target) => {
        const decision = decideNavigation(target ?? event.url, getAppUrl())
        if(!decision.allow) {
            event.preventDefault()
            if(decision.external) {
                openExternal(decision.external)
            }
        }
    })
    webContents.setWindowOpenHandler(({ url }) => {
        const external = externalUrl(url)
        if(external) {
            openExternal(external)
        }
        return { action: 'deny' }
    })
}

module.exports = { isAppUrl, decideNavigation, externalUrl, attach }
