import { MODS } from '../core/mods.ts'

type G = CanvasRenderingContext2D

/**
 * Logos dos modificadores: desenhados em pixel, numa grade 16×16 que escala
 * por inteiro. Cada um é uma silhueta só, legível em 16 px.
 */
export function modIcon(g: G, id: number, x: number, y: number, s: number) {
  const u = s / 16
  const px = (cx: number, cy: number, w = 1, h = 1, c?: string) => {
    if (c) g.fillStyle = c
    g.fillRect(Math.round(x + cx * u), Math.round(y + cy * u), Math.ceil(w * u), Math.ceil(h * u))
  }
  const disc = (cx: number, cy: number, r: number, c: string) => {
    g.fillStyle = c
    for (let yy = -r; yy <= r; yy++) {
      const w = Math.floor(Math.sqrt(r * r - yy * yy + 0.5))
      px(cx - w, cy + yy, 2 * w + 1, 1)
    }
  }
  const col = MODS[id]?.color ?? '#fff'
  const ink = '#14121c'
  switch (id) {
    case 0: // lua crescente + bolinha
      disc(7, 7, 6, col)
      disc(9, 6, 5, ink)
      disc(12, 12, 2, '#ffd257')
      break
    case 1: // bola de boliche
      disc(8, 8, 7, col)
      px(5, 4, 2, 2, '#8d86a8'); px(8, 3, 2, 2, '#8d86a8'); px(6, 7, 2, 2, '#8d86a8')
      break
    case 2: // balão com fio
      disc(8, 6, 5, col)
      px(5, 3, 2, 2, '#ffd6e6')
      px(7, 11, 2, 1, col); px(8, 12, 1, 1, '#eee'); px(7, 13, 1, 1, '#eee'); px(8, 14, 1, 2, '#eee')
      break
    case 3: // floco sobre a linha
      px(7, 1, 2, 10, col); px(3, 5, 10, 2, col)
      px(4, 2, 2, 2, col); px(10, 2, 2, 2, col); px(4, 8, 2, 2, col); px(10, 8, 2, 2, col)
      px(2, 13, 12, 2, '#e8fbff')
      break
    case 4: // blob gordo
      disc(8, 9, 7, col)
      px(3, 12, 10, 3, col)
      px(5, 7, 2, 2, ink); px(9, 7, 2, 2, ink)
      px(6, 11, 4, 1, ink)
      break
    case 5: // rede + seta pra cima
      for (let i = 0; i < 4; i++) { px(1, 7 + i * 2, 8, 1, col); px(1 + i * 2, 7, 1, 8, col) }
      px(11, 5, 2, 9, col); px(9, 7, 6, 1, col); px(10, 6, 4, 1, col); px(11, 4, 2, 1, col); px(9, 8, 2, 1, col); px(13, 8, 2, 1, col)
      px(11, 2, 2, 2, col)
      break
    case 6: // bola se dividindo
      disc(5, 8, 4, col); disc(11, 8, 4, col)
      px(7, 4, 2, 9, ink)
      px(4, 6, 1, 1, '#fff5c0'); px(10, 6, 1, 1, '#fff5c0')
      break
    case 7: // mola comprimida
      for (let i = 0; i < 5; i++) px(3 + (i & 1) * 2, 4 + i * 2, 8, 1, col)
      px(2, 2, 12, 2, '#d9ffde'); px(2, 13, 12, 2, '#d9ffde')
      break
    case 8: // três curvas de vento
      px(2, 4, 8, 1, col); px(10, 3, 2, 1, col); px(12, 4, 1, 1, col)
      px(1, 8, 11, 1, col); px(12, 7, 2, 1, col); px(14, 8, 1, 1, col)
      px(3, 12, 7, 1, col); px(10, 11, 2, 1, col); px(12, 12, 1, 1, col)
      break
    case 9: // cubo de gelatina tremendo
      px(3, 4, 10, 9, col)
      px(2, 6, 1, 5, col); px(13, 6, 1, 5, col)
      px(4, 5, 3, 2, '#e8d6ff')
      px(6, 9, 1, 1, ink); px(9, 9, 1, 1, ink)
      px(1, 3, 1, 1, col); px(14, 3, 1, 1, col); px(1, 13, 1, 1, col); px(14, 13, 1, 1, col)
      break
  }
}
