import type { PlayerInput } from '../core/input.ts'

import { pads, readPad, padMap } from './pad.ts'
import type { PadMap } from './pad.ts'

export type Action = 'left' | 'right' | 'up' | 'down' | 'hit' | 'dive' | 'special'
export const ACTIONS: Action[] = ['left', 'right', 'up', 'down', 'hit', 'dive', 'special']
export const ACTION_LABEL: Record<Action, string> = {
  left: 'esquerda', right: 'direita', up: 'pular', down: 'agachar / mira',
  hit: 'bater', dive: 'mergulhar', special: 'especial',
}

export type Binding = Record<Action, string[]>

const DEFAULT_P1: Binding = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW', 'Space'], down: ['KeyS'],
  hit: ['KeyJ'], dive: ['KeyK'], special: ['KeyL'],
}
const DEFAULT_P2: Binding = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  hit: ['Numpad1', 'Comma'], dive: ['Numpad2', 'Period'], special: ['Numpad3', 'Slash'],
}

const KEY = 'bv.keys'

function load(): [Binding, Binding] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as [Binding, Binding] | null
    if (raw && raw.length === 2 && ACTIONS.every(a => Array.isArray(raw[0][a]) && Array.isArray(raw[1][a]))) return raw
  } catch { /* sem storage */ }
  return [structuredClone(DEFAULT_P1), structuredClone(DEFAULT_P2)]
}

export const KEYS: [Binding, Binding] = load()
export const P1 = KEYS[0]
export const P2 = KEYS[1]

/** Sozinho na quadra (CPU, online): os dois teclados servem. */
export const SOLO: Binding = { ...P1 }
export function syncSolo() {
  for (const a of ACTIONS) SOLO[a] = [...P1[a], ...P2[a]]
}
syncSolo()

export function setKey(player: 0 | 1, action: Action, code: string) {
  for (const b of KEYS) for (const a of ACTIONS) b[a] = b[a].filter(c => c !== code)
  KEYS[player][action] = [code]
  syncSolo()
  try { localStorage.setItem(KEY, JSON.stringify(KEYS)) } catch { /* sem storage */ }
}

export function resetKeys() {
  const d = [structuredClone(DEFAULT_P1), structuredClone(DEFAULT_P2)]
  for (let i = 0; i < 2; i++) for (const a of ACTIONS) KEYS[i][a] = d[i][a]
  syncSolo()
  try { localStorage.removeItem(KEY) } catch { /* sem storage */ }
}

/** Nome curto da tecla pra tela de controles. */
export function keyName(code: string) {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6)
  if (code.startsWith('Arrow')) return { Up: '↑', Down: '↓', Left: '←', Right: '→' }[code.slice(5)] ?? code
  const map: Record<string, string> = {
    Space: 'ESPAÇO', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT D', ControlLeft: 'CTRL', ControlRight: 'CTRL D',
    AltLeft: 'ALT', AltRight: 'ALT D', Enter: 'ENTER', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Tab: 'TAB',
    Backspace: 'BACK', CapsLock: 'CAPS',
  }
  return map[code] ?? code.toUpperCase()
}

export class InputManager {
  private keys = new Set<string>()
  touch: Record<Action, boolean> & { stickUp: boolean } =
    { left: false, right: false, up: false, down: false, hit: false, dive: false, special: false, stickUp: false }
  /** Armando a batida o direcional é mira: o analógico pra cima passa a valer. */
  aimMode = false
  onPause?: () => void

  constructor() {
    addEventListener('keydown', e => {
      if (e.code === 'Escape') this.onPause?.()
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      this.keys.add(e.code)
    })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
  }

  private pad(index: number, map: PadMap): PlayerInput | null {
    const gp = pads()[index]
    if (!gp) return null
    const s = readPad(gp, map)
    return {
      left: s.left, right: s.right, up: s.jump || (s.up && this.aimMode), special: s.special,
      down: s.down, dive: s.dive, hit: s.hit,
    }
  }

  read(binding: Binding, padIndex = -1, useTouch = false): PlayerInput {
    const k = (a: Action) => binding[a].some(c => this.keys.has(c))
    let left = k('left'), right = k('right'), up = k('up'), special = k('special')
    let down = k('down'), dive = k('dive'), hit = k('hit')
    if (padIndex >= 0) {
      const p = this.pad(padIndex, padMap())
      if (p) {
        left = left || p.left; right = right || p.right; up = up || p.up
        special = special || p.special; down = down || p.down; dive = dive || p.dive; hit = hit || p.hit
      }
    }
    if (useTouch) {
      const t = this.touch
      left = left || t.left
      right = right || t.right
      up = up || t.up || (t.stickUp && this.aimMode)
      special = special || t.special
      down = down || t.down
      dive = dive || t.dive
      hit = hit || t.hit
    }
    return { left, right, up, special, down, dive, hit }
  }
}
