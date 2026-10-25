// Abre a nova interface (ui/dist) numa janela do Electron com o mesmo tamanho do launcher.
// Não toca na interface atual nem nos dados do usuário. Uso: npm run ui:build && npm run ui:electron
const { app, BrowserWindow, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const entry = path.join(__dirname, '..', 'ui', 'dist', 'index.html')

app.whenReady().then(() => {
    if (!fs.existsSync(entry)) {
        console.error('ui/dist não encontrado. Rode "npm run ui:build" antes.')
        app.quit()
        return
    }
    const win = new BrowserWindow({
        width: 1100,
        height: 700,
        minWidth: 800,
        minHeight: 560,
        frame: false,
        backgroundColor: '#060509',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    const url = pathToFileURL(entry).toString()
    win.webContents.setWindowOpenHandler(({ url: target }) => {
        if (target.startsWith('https://')) shell.openExternal(target)
        return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, target) => {
        if (!target.startsWith(url)) e.preventDefault()
    })
    win.loadURL(url)
})

app.on('window-all-closed', () => app.quit())
