export interface PlayerInput {
  left: boolean
  right: boolean
  up: boolean
  special: boolean
  down: boolean
  dive: boolean
  hit: boolean
}

export const NO_INPUT: PlayerInput = {
  left: false, right: false, up: false, special: false, down: false, dive: false, hit: false,
}

export const packInput = (i: PlayerInput): number =>
  (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) |
  (i.special ? 8 : 0) | (i.down ? 16 : 0) | (i.dive ? 32 : 0) | (i.hit ? 64 : 0)

export const unpackInput = (b: number): PlayerInput => ({
  left: (b & 1) !== 0,
  right: (b & 2) !== 0,
  up: (b & 4) !== 0,
  special: (b & 8) !== 0,
  down: (b & 16) !== 0,
  dive: (b & 32) !== 0,
  hit: (b & 64) !== 0,
})
