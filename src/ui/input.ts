import type { PlayerInput } from '../core/input.ts'

export interface Binding { left: string[]; right: string[]; up: string[]; special: string[]; down: string[] }

export const P1: Binding = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW', 'Space'], special: ['Space'], down: ['KeyS'] }
export const P2: Binding = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'],
  special: ['ShiftRight', 'Numpad0'], down: ['ArrowDown'],
}
export const SOLO: Binding = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp', 'Space'],
  special: ['Space'],
  down: ['KeyS', 'ArrowDown'],
}

export class InputManager {
  private keys = new Set<string>()
  touch: { left: boolean; right: boolean; up: boolean; special: boolean; down: boolean } =
    { left: false, right: false, up: false, special: false, down: false }
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

  private pad(index: number): PlayerInput | null {
    const pads = navigator.getGamepads?.() ?? []
    const gp = pads[index]
    if (!gp) return null
    const ax = gp.axes[0] ?? 0
    const ay = gp.axes[1] ?? 0
    const dpadL = gp.buttons[14]?.pressed ?? false
    const dpadR = gp.buttons[15]?.pressed ?? false
    const jump = (gp.buttons[0]?.pressed ?? false) || (gp.buttons[1]?.pressed ?? false) ||
      (gp.buttons[12]?.pressed ?? false) || (gp.buttons[7]?.pressed ?? false)
    const special = (gp.buttons[2]?.pressed ?? false) || (gp.buttons[3]?.pressed ?? false) ||
      (gp.buttons[5]?.pressed ?? false)
    return {
      left: dpadL || ax < -0.35,
      right: dpadR || ax > 0.35,
      up: jump || ay < -0.45,
      special,
      down: (gp.buttons[13]?.pressed ?? false) || ay > 0.4,
    }
  }

  read(binding: Binding, padIndex = -1, useTouch = false): PlayerInput {
    let left = binding.left.some(k => this.keys.has(k))
    let right = binding.right.some(k => this.keys.has(k))
    let up = binding.up.some(k => this.keys.has(k))
    let special = binding.special.some(k => this.keys.has(k))
    let down = binding.down.some(k => this.keys.has(k))
    if (padIndex >= 0) {
      const p = this.pad(padIndex)
      if (p) {
        left = left || p.left; right = right || p.right; up = up || p.up
        special = special || p.special; down = down || p.down
      }
    }
    if (useTouch) {
      left = left || this.touch.left
      right = right || this.touch.right
      up = up || this.touch.up
      special = special || this.touch.special
      down = down || this.touch.down
    }
    return { left, right, up, special, down }
  }
}
