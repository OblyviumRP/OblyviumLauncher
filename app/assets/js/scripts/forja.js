document.addEventListener('DOMContentLoaded', () => {
    const settingsBack = document.getElementById('settingsBackButton')
    const settingsDone = document.getElementById('settingsNavDone')
    const syncSettingsExit = () => {
        settingsBack.disabled = settingsDone.disabled
        document.getElementById('settingsSaveHint').textContent = settingsDone.disabled
            ? 'Revise os campos destacados antes de voltar.'
            : 'Voltar salva suas preferências.'
    }
    settingsBack.addEventListener('click', () => settingsDone.click())
    new MutationObserver(syncSettingsExit).observe(settingsDone, { attributes: true, attributeFilter: ['disabled'] })
    document.addEventListener('keydown', event => {
        if(event.defaultPrevented || event.key !== 'Escape' || isOverlayVisible() || getCurrentView() !== VIEWS.settings) return
        event.preventDefault()
        if(!settingsDone.disabled) settingsDone.click()
    })
    syncSettingsExit()
    document.getElementById('server_selection_icon').addEventListener('error', event => {
        const fallback = new URL('assets/images/oblyvium-mark.svg', document.baseURI).href
        if(event.currentTarget.src !== fallback) event.currentTarget.src = fallback
    })
    const syncControls = () => {
        const inDialog = document.getElementById('main').hasAttribute('overlay')
        for (const slider of document.querySelectorAll('.rangeSlider')) {
            slider.tabIndex = inDialog ? -1 : 0
            slider.setAttribute('aria-valuenow', slider.getAttribute('value'))
            slider.setAttribute('aria-valuemin', slider.getAttribute('min'))
            slider.setAttribute('aria-valuemax', slider.getAttribute('max'))
            slider.setAttribute('aria-valuetext', slider.getAttribute('value') + ' gigabytes')
        }
    }
    for (const slider of document.querySelectorAll('.rangeSlider')) {
        slider.tabIndex = 0
        slider.setAttribute('role', 'slider')
        slider.setAttribute('aria-label', slider.id.includes('Max') ? 'Memória máxima' : 'Memória mínima')
        slider.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const meta = calculateRangeSliderMeta(slider)
            const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1
            let value = Number(slider.getAttribute('value')) + direction * meta.step
            if (event.key === 'Home') value = meta.min
            if (event.key === 'End') value = meta.max
            value = Math.max(meta.min, Math.min(meta.max, value))
            updateRangedSlider(slider, value, ((value - meta.min) / meta.step) * meta.inc)
        })
    }
    const overlay = document.getElementById('overlayContainer')
    let overlayOpen = false
    let previousFocus
    const focusable = scope => Array.from(scope.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    const syncOverlay = () => {
        const open = document.getElementById('main').hasAttribute('overlay')
        if (open && !overlayOpen) {
            previousFocus = document.activeElement
        } else if (!open && overlayOpen && previousFocus?.getClientRects().length) {
            previousFocus.focus({ preventScroll: true })
        }
        if (open && !overlay.contains(document.activeElement)) focusable(overlay)[0]?.focus({ preventScroll: true })
        overlayOpen = open
    }
    overlay.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return
        const controls = focusable(overlay)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
        }
    })
    for (const [id, title] of [['overlayContent', 'overlayTitle'], ['serverSelectContent', 'serverSelectHeader'], ['accountSelectContent', 'accountSelectHeader']]) {
        const dialog = document.getElementById(id)
        dialog.setAttribute('role', 'dialog')
        dialog.setAttribute('aria-modal', 'true')
        dialog.setAttribute('aria-labelledby', title)
    }
    new MutationObserver(() => { syncControls(); syncOverlay() }).observe(document.getElementById('main'), { attributes: true, childList: true, subtree: true, attributeFilter: ['value', 'hidden', 'selected', 'overlay'] })
    new MutationObserver(syncOverlay).observe(overlay, { attributes: true, subtree: true, attributeFilter: ['style'] })
    syncControls()
})
