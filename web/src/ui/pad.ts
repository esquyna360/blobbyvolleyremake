/**
 * Controle no menu. O navegador só entrega o estado bruto do gamepad a cada
 * quadro, então a borda de subida e a repetição segurando saem daqui — sem
 * isso um toque no direcional atravessa a lista inteira.
 *
 * Mapeamento padrão do navegador: DualSense e Xbox caem os dois nele, então
 * ✕/A é o mesmo botão 0 e ○/B o mesmo botão 1.
 */
export type PadAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'start'

const FIRST_MS = 380
const REPEAT_MS = 110
const REPEATS = new Set<PadAction>(['up', 'down', 'left', 'right'])

export interface PadState {
  left: boolean; right: boolean; up: boolean; down: boolean
  jump: boolean; dive: boolean; special: boolean; hit: boolean; ok: boolean; back: boolean; start: boolean
}

/** Índice do botão (mapeamento padrão) de cada ação. Xbox: A pula, B mergulha, X bate, Y especial. */
export type PadMap = { jump: number; dive: number; hit: number; special: number }
export const DEFAULT_PAD: PadMap = { jump: 0, dive: 1, hit: 2, special: 3 }
export const PAD_NAME: Record<number, string> = { 0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT' }
const PAD_KEY = 'bv.pad'
let padMapV: PadMap | null = null
export function padMap(): PadMap {
  if (padMapV) return padMapV
  try {
    const raw = JSON.parse(localStorage.getItem(PAD_KEY) ?? 'null') as PadMap | null
    padMapV = raw && typeof raw.jump === 'number' ? { ...DEFAULT_PAD, ...raw } : { ...DEFAULT_PAD }
  } catch { padMapV = { ...DEFAULT_PAD } }
  return padMapV
}
export function setPadButton(action: keyof PadMap, button: number) {
  const m = padMap()
  for (const k of Object.keys(m) as (keyof PadMap)[]) if (m[k] === button) m[k] = -1
  m[action] = button
  try { localStorage.setItem(PAD_KEY, JSON.stringify(m)) } catch { /* sem storage */ }
}
export function resetPad() {
  padMapV = { ...DEFAULT_PAD }
  try { localStorage.removeItem(PAD_KEY) } catch { /* sem storage */ }
}
/** Qualquer botão apertado agora, pra tela de mapear. */
export function pressedButton(): number {
  for (const gp of pads()) for (let i = 0; i < gp.buttons.length; i++) if (gp.buttons[i].pressed) return i
  return -1
}

const DEAD_AX = 0.35

/** Controles conectados, na ordem, sem os buracos que o navegador deixa. */
export function pads(): Gamepad[] {
  const out: Gamepad[] = []
  for (const gp of navigator.getGamepads?.() ?? []) if (gp && gp.connected) out.push(gp)
  return out
}

/**
 * Leitura única pra menu e jogo. Mapeamento padrão: ✕/A pula, □/X mergulha,
 * ○/B, △/Y e gatilhos especial, direcional e analógico andam. Sem mapeamento
 * padrão (DualSense em alguns navegadores) os índices são os do HID da Sony.
 */
export function readPad(gp: Gamepad, map: PadMap = padMap()): PadState {
  const b = (i: number) => gp.buttons[i]?.pressed ?? false
  const ax = gp.axes[0] ?? 0
  const ay = gp.axes[1] ?? 0
  if (gp.mapping === 'standard' || gp.buttons.length >= 16) {
    return {
      left: b(14) || ax < -DEAD_AX,
      right: b(15) || ax > DEAD_AX,
      up: b(12) || ay < -0.45,
      down: b(13) || ay > 0.4,
      jump: b(map.jump),
      dive: b(map.dive),
      hit: b(map.hit),
      special: b(map.special),
      ok: b(0),
      back: b(1),
      start: b(9) || b(16),
    }
  }
  const hat = gp.axes[9] ?? gp.axes[gp.axes.length - 1] ?? 1.5
  const h = Math.round((hat + 1) * 3.5)
  const hu = h === 0 || h === 1 || h === 7, hr = h >= 1 && h <= 3, hd = h >= 3 && h <= 5, hl = h >= 5 && h <= 7
  const on = hat > -1.05 && hat < 1.05
  return {
    left: (on && hl) || ax < -DEAD_AX,
    right: (on && hr) || ax > DEAD_AX,
    up: (on && hu) || ay < -0.45,
    down: (on && hd) || ay > 0.4,
    jump: b(1),
    dive: b(2),
    hit: b(0),
    special: b(3),
    ok: b(1),
    back: b(2),
    start: b(9) || b(12),
  }
}

export class PadNav {
  private held = new Map<PadAction, number>()

  /** Há algum controle plugado? O navegador só conta depois do primeiro toque. */
  static present() { return pads().length > 0 }

  /** Ações desde o último quadro: borda de subida, mais repetição no direcional. */
  poll(now = performance.now()): PadAction[] {
    const live = new Set<PadAction>()
    for (const gp of pads()) {
      const s = readPad(gp)
      if (s.up) live.add('up')
      if (s.down) live.add('down')
      if (s.left) live.add('left')
      if (s.right) live.add('right')
      if (s.ok) live.add('ok')
      if (s.back) live.add('back')
      if (s.start) live.add('start')
    }
    const out: PadAction[] = []
    for (const a of live) {
      const next = this.held.get(a)
      if (next === undefined) { this.held.set(a, now + FIRST_MS); out.push(a) }
      else if (REPEATS.has(a) && now >= next) { this.held.set(a, now + REPEAT_MS); out.push(a) }
    }
    for (const a of [...this.held.keys()]) if (!live.has(a)) this.held.delete(a)
    return out
  }
}
