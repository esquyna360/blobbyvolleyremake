const { app, BrowserWindow, protocol, net, shell, screen } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DIST = path.join(__dirname, '..', 'dist')

/*
 * `file://` não é contexto seguro: sem isso não há WebRTC nem `crypto.subtle`,
 * e o online morre. Um esquema próprio marcado como seguro resolve, e de
 * quebra deixa o `fetch` das músicas funcionar.
 */
protocol.registerSchemesAsPrivileged([{
  scheme: 'blobby',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])

// o jogo desenha em 3D o tempo todo: nada de economizar quadro quando a janela sai da frente
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

function serve() {
  protocol.handle('blobby', req => {
    const { pathname } = new URL(req.url)
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.join(DIST, rel)
    if (!file.startsWith(DIST)) return new Response('no', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

function makeWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = Math.min(1600, Math.round(width * 0.9))
  const win = new BrowserWindow({
    width: w,
    height: Math.round(w * 9 / 16),
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    show: false,
    title: 'Blobby Remake',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  void win.loadURL('blobby://app/index.html')
  return win
}

app.whenReady().then(() => {
  serve()
  makeWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) makeWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
