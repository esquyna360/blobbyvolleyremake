export interface V2 { x: number; y: number }

export const v2 = (x = 0, y = 0): V2 => ({ x, y })
export const setv = (a: V2, x: number, y: number): V2 => { a.x = x; a.y = y; return a }
export const copyv = (a: V2, b: V2): V2 => { a.x = b.x; a.y = b.y; return a }
export const lenSQ = (a: V2) => a.x * a.x + a.y * a.y
export const len = (a: V2) => Math.sqrt(a.x * a.x + a.y * a.y)
export const dist = (a: V2, b: V2) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
export const distSQ = (a: V2, b: V2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
