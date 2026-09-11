const { contextBridge } = require('electron')

// o jogo lê isso pra saber que está numa janela nativa, não numa aba
contextBridge.exposeInMainWorld('__BLOBBY_SHELL__', 'desktop')
