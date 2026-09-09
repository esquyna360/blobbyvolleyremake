export const S = 0.02
export const COURT_HALF_W = 400 * S
export const COURT_DEPTH = 8

export const gx = (x: number) => (x - 400) * S
export const gy = (y: number) => (500 - y) * S
export const gr = (r: number) => r * S
