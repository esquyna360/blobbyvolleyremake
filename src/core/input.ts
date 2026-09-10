import { AIM_STEPS } from './constants.ts'

export interface PlayerInput {
  left: boolean
  right: boolean
  up: boolean
  special: boolean
  hand: boolean
  down: boolean
  /** Refino do analógico dentro do octante: 0 nenhum, 1 +11°, 2 -11°, 3 +22°. */
  fine: number
}

export const NO_INPUT: PlayerInput = {
  left: false, right: false, up: false, special: false, hand: false, down: false, fine: 0,
}

export const packInput = (i: PlayerInput): number =>
  (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) | (i.special ? 8 : 0) |
  (i.hand ? 16 : 0) | (i.down ? 32 : 0) | ((i.fine & 3) << 6)

export const unpackInput = (b: number): PlayerInput => ({
  left: (b & 1) !== 0,
  right: (b & 2) !== 0,
  up: (b & 4) !== 0,
  special: (b & 8) !== 0,
  hand: (b & 16) !== 0,
  down: (b & 32) !== 0,
  fine: (b >> 6) & 3,
})

const OFF = [0, 1, -1, 2]

/**
 * Direção mirada em 32 passos. O octante vem dos direcionais — é assim que o
 * teclado mira — e os dois bits de refino vêm do analógico ou do arrasto no
 * botão da mão, o que fecha o círculo sem gastar um byte a mais na rede.
 */
export function aimIndex(i: PlayerInput): number {
  const rx = i.right === i.left ? 0 : i.right ? 1 : -1
  const ry = i.up === i.down ? 0 : i.up ? 1 : -1
  if (rx === 0 && ry === 0) return -1
  const oct = rx > 0
    ? ry > 0 ? 1 : ry < 0 ? 7 : 0
    : rx < 0
      ? ry > 0 ? 3 : ry < 0 ? 5 : 4
      : ry > 0 ? 2 : 6
  return (((oct * 4 + OFF[i.fine & 3]) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS
}

/** Ângulo de tela (y pra baixo) para os bits que o representam. */
export function aimBits(angle: number): { left: boolean; right: boolean; up: boolean; down: boolean; fine: number } {
  let idx = Math.round((-angle / (Math.PI * 2)) * AIM_STEPS)
  idx = ((idx % AIM_STEPS) + AIM_STEPS) % AIM_STEPS
  let oct = Math.floor(idx / 4)
  let off = idx - oct * 4
  if (off === 3) { oct = (oct + 1) % 8; off = -1 }
  const fine = off === 0 ? 0 : off === 1 ? 1 : off === -1 ? 2 : 3
  const rx = oct === 0 || oct === 1 || oct === 7 ? 1 : oct === 3 || oct === 4 || oct === 5 ? -1 : 0
  const ry = oct === 1 || oct === 2 || oct === 3 ? 1 : oct === 5 || oct === 6 || oct === 7 ? -1 : 0
  return { left: rx < 0, right: rx > 0, up: ry > 0, down: ry < 0, fine }
}

/**
 * Refino que aproxima o octante já escolhido pelos bits do ângulo real do
 * analógico. Só existem quatro offsets, então -22° não tem representação: cai
 * no -11°, o mais perto que dá.
 */
export function fineToward(i: PlayerInput, angle: number): number {
  const base = aimIndex({ ...i, fine: 0 })
  if (base < 0) return 0
  let idx = Math.round((-angle / (Math.PI * 2)) * AIM_STEPS)
  idx = ((idx % AIM_STEPS) + AIM_STEPS) % AIM_STEPS
  let d = ((idx - base + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) - AIM_STEPS / 2
  if (d >= 2) return 3
  if (d === 1) return 1
  if (d <= -1) return 2
  return 0
}
