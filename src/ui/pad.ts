/**
 * Controle no menu. O navegador só entrega o estado bruto do gamepad a cada
 * quadro, então a borda de subida e a repetição segurando saem daqui — sem
 * isso um toque no direcional atravessa a lista inteira.
 *
 * Mapeamento padrão do navegador: DualSense e Xbox caem os dois nele, então
 * ✕/A é o mesmo botão 0 e ○/B o mesmo botão 1.
 */
export type PadAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'start'

const DEAD = 0.5
const FIRST_MS = 380
const REPEAT_MS = 110
const REPEATS = new Set<PadAction>(['up', 'down', 'left', 'right'])

export class PadNav {
  private held = new Map<PadAction, number>()

  /** Há algum controle plugado? O navegador só conta depois do primeiro toque. */
  static present() {
    for (const gp of navigator.getGamepads?.() ?? []) if (gp) return true
    return false
  }

  /** Ações desde o último quadro: borda de subida, mais repetição no direcional. */
  poll(now = performance.now()): PadAction[] {
    const live = new Set<PadAction>()
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp) continue
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      const b = (i: number) => gp.buttons[i]?.pressed ?? false
      if (b(12) || ay < -DEAD) live.add('up')
      if (b(13) || ay > DEAD) live.add('down')
      if (b(14) || ax < -DEAD) live.add('left')
      if (b(15) || ax > DEAD) live.add('right')
      if (b(0)) live.add('ok')
      if (b(1)) live.add('back')
      if (b(9) || b(16)) live.add('start')
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
