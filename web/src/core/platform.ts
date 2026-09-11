/**
 * Onde o jogo está rodando. O mesmo bundle serve o navegador, a WebView do
 * Android e a janela do desktop — o que muda é o que cada um aguenta e o que
 * cada um deve oferecer no menu.
 */
export type Platform = 'web' | 'android' | 'desktop'

declare global {
  interface Window {
    Capacitor?: { getPlatform?(): string; isNativePlatform?(): boolean }
    __BLOBBY_SHELL__?: string
  }
}

function detect(): Platform {
  if (typeof window === 'undefined') return 'web'
  if (window.__BLOBBY_SHELL__ === 'desktop') return 'desktop'
  const cap = window.Capacitor?.getPlatform?.()
  if (cap === 'android' || cap === 'ios') return 'android'
  return 'web'
}

export const PLATFORM: Platform = detect()
export const NATIVE = PLATFORM !== 'web'
/** Só o desktop ainda oferece o 3D; 2D nunca entra no menu dele. */
export const ONLY_3D = false
/** Navegador e Android são só pixel art; 2D e 3D ficam no código, fora do menu. */
export const PIXEL_ONLY = PLATFORM !== 'desktop'
