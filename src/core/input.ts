export interface PlayerInput { left: boolean; right: boolean; up: boolean }

export const NO_INPUT: PlayerInput = { left: false, right: false, up: false }

export const packInput = (i: PlayerInput): number =>
  (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0)

export const unpackInput = (b: number): PlayerInput => ({
  left: (b & 1) !== 0,
  right: (b & 2) !== 0,
  up: (b & 4) !== 0,
})
