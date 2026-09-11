/** Fonte 3x5 pra textos dentro do canvas. Só caixa alta; acento cai na letra base. */
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101011001', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101011', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '!': '010010010000010', ' ': '000000000000000', '.': '000000000000010', '-': '000000111000000',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  ':': '000010000010000', '/': '001001010100100', '?': '111001011000010', "'": '010010000000000', '·': '000000010000000',
  '+': '000010111010000', '(': '010100100100010', ')': '010001001001010', ',': '000000000010100', '&': '010101010101011',
}
const FOLD: Record<string, string> = {
  Á: 'A', À: 'A', Â: 'A', Ã: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Ô: 'O', Õ: 'O', Ú: 'U', Ü: 'U', Ç: 'C', Ñ: 'N',
}
export const FONT_H = 5

export function textWidth(str: string, scale = 1) {
  return Math.max(0, [...str].length * 4 * scale - scale)
}

export function pxText(g: CanvasRenderingContext2D, str: string, x: number, y: number, col: string,
                       scale = 1, shadow: string | null = '#1a1620') {
  const up = str.toUpperCase()
  const chars = [...up].map(ch => FOLD[ch] ?? ch)
  const w = textWidth(up, scale)
  let cx = Math.round(x - w / 2)
  const yy = Math.round(y)
  const put = (fill: string, ox: number, oy: number) => {
    let px = cx
    g.fillStyle = fill
    for (const ch of chars) {
      const bits = GLYPHS[ch] ?? GLYPHS['?']
      for (let i = 0; i < 15; i++) {
        if (bits[i] !== '1') continue
        g.fillRect(px + (i % 3) * scale + ox, yy + Math.floor(i / 3) * scale + oy, scale, scale)
      }
      px += 4 * scale
    }
  }
  if (shadow) put(shadow, scale, scale)
  put(col, 0, 0)
}
