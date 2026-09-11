import type { CapacitorConfig } from '@capacitor/cli'

/**
 * O jogo roda na WebView do sistema. `androidScheme: 'https'` é o que dá
 * contexto seguro — sem ele não há WebRTC, e sem WebRTC não há online.
 */
const config: CapacitorConfig = {
  appId: 'com.esquyna.blobby',
  appName: 'Blobby Remake',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0b1220',
    webContentsDebuggingEnabled: true,
  },
  server: { androidScheme: 'https' },
  plugins: {
    // O Capacitor afastava a WebView do recorte da tela e sobrava faixa preta.
    // Quem trata as insets aqui é a MainActivity: a tela fica cheia e o CSS
    // recebe as medidas em variáveis.
    SystemBars: { insetsHandling: 'disable', hidden: true },
  },
}

export default config
