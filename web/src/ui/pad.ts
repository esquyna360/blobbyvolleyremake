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
  jump: boolean; dive: boolean; special: boolean; ok: boolean; back: boolean; start: boolean
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
export function readPad(gp: Gamepad): PadState {
  const b = (i: number) => gp.buttons[i]?.pressed ?? false
  const ax = gp.axes[0] ?? 0
  const ay = gp.axes[1] ?? 0
  if (gp.mapping === 'standard' || gp.buttons.length >= 16) {
    return {
      left: b(14) || ax < -DEAD_AX,
      right: b(15) || ax > DEAD_AX,
      up: b(12) || ay < -0.45,
      down: b(13) || ay > 0.4,
      jump: b(0),
      dive: b(2) || b(4) || b(6),
      special: b(1) || b(3) || b(5) || b(7),
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
    dive: b(0) || b(4) || b(6),
    special: b(2) || b(3) || b(5) || b(7),
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
