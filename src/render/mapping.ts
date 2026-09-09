import { NET_POSITION_X, RIGHT_PLANE } from '../core/constants.ts'

export const S = 0.02
export const COURT_DEPTH = 8

export let COURT_HALF_W = (RIGHT_PLANE / 2) * S

/** Chamado quando a arena muda, antes de reconstruir o renderer. */
export function syncArena() { COURT_HALF_W = (RIGHT_PLANE / 2) * S }

export const gx = (x: number) => (x - NET_POSITION_X) * S
export const gy = (y: number) => (500 - y) * S
export const gr = (r: number) => r * S
