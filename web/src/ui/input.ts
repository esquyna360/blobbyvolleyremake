import type { PlayerInput } from '../core/input.ts'

export interface Binding { left: string[]; right: string[]; up: string[]; special: string[]; down: string[]; dive: string[] }

export const P1: Binding = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW', 'Space'], special: ['Space'], down: ['KeyS'], dive: ['KeyE', 'KeyQ', 'ShiftLeft'] }
export const P2: Binding = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'],
  special: ['ShiftRight', 'Numpad0'], down: ['ArrowDown'], dive: ['ControlRight', 'Numpad1', 'Enter'],
}
export const SOLO: Binding = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp', 'Space'],
  special: ['Space'],
  down: ['KeyS', 'ArrowDown'],
  dive: ['KeyE', 'KeyQ', 'ShiftLeft', 'ControlRight', 'Numpad1', 'Enter'],
}

export class InputManager {
  private keys = new Set<string>()
  touch: { left: boolean; right: boolean; up: boolean; special: boolean; down: boolean; dive: boolean } =
    { left: false, right: false, up: false, special: false, down: false, dive: false }
  onPause?: () => void
  private mouse = false

  constructor() {
    addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button === 0 && (e.target as HTMLElement).tagName === 'CANVAS') this.mouse = true
    })
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') this.mouse = false })
    addEventListener('blur', () => { this.mouse = false })
    addEventListener('keydown', e => {
      if (e.code === 'Escape') this.onPause?.()
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      this.keys.add(e.code)
    })
    addEventListener('keyup', e => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())
  }

  private pad(index: number): PlayerInput | null {
    const pads = navigator.getGamepads?.() ?? []
    const gp = pads[index]
    if (!gp) return null
    const ax = gp.axes[0] ?? 0
    const ay = gp.axes[1] ?? 0
    // mapeamento padrão do navegador: DualSense e Xbox caem os dois nele, então
    // ✕ e A são o mesmo botão 0, □ e X o mesmo botão 2
    const b = (i: number) => gp.buttons[i]?.pressed ?? false
    return {
      left: b(14) || ax < -0.35,
      right: b(15) || ax > 0.35,
      up: b(0) || b(12) || ay < -0.45,
      special: b(1) || b(3) || b(5) || b(7),
      down: b(13) || ay > 0.4,
      dive: b(2) || b(4) || b(6),
    }
  }

  read(binding: Binding, padIndex = -1, useTouch = false): PlayerInput {
    let left = binding.left.some(k => this.keys.has(k))
    let right = binding.right.some(k => this.keys.has(k))
    let up = binding.up.some(k => this.keys.has(k))
    let special = binding.special.some(k => this.keys.has(k))
    let down = binding.down.some(k => this.keys.has(k))
    let dive = binding.dive.some(k => this.keys.has(k))
    if (padIndex >= 0) {
      const p = this.pad(padIndex)
      if (p) {
        left = left || p.left; right = right || p.right; up = up || p.up
        special = special || p.special; down = down || p.down; dive = dive || p.dive
      }
    }
    if (useTouch || padIndex === 0) dive = dive || this.mouse
    if (useTouch) {
      left = left || this.touch.left
      right = right || this.touch.right
      up = up || this.touch.up
      special = special || this.touch.special
      down = down || this.touch.down
      dive = dive || this.touch.dive
    }
    return { left, right, up, special, down, dive }
  }
}
