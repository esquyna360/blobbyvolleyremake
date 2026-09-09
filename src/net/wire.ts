import { STATE_FLOATS, STATE_INTS } from '../core/match.ts'
import type { MatchState } from '../core/match.ts'

const BYTES = STATE_FLOATS * 8 + STATE_INTS * 4

export function b64(bytes: Uint8Array): string {
  let s = ''
  for (let k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k])
  return btoa(s)
}

export function unb64(str: string): Uint8Array {
  const raw = atob(str)
  const out = new Uint8Array(raw.length)
  for (let k = 0; k < raw.length; k++) out[k] = raw.charCodeAt(k)
  return out
}

export function encodeState(s: MatchState): string {
  const buf = new ArrayBuffer(BYTES)
  new Float64Array(buf, 0, STATE_FLOATS).set(s.f)
  new Int32Array(buf, STATE_FLOATS * 8, STATE_INTS).set(s.i)
  return b64(new Uint8Array(buf))
}

export function decodeState(str: string, into: MatchState): boolean {
  const b = unb64(str)
  if (b.length !== BYTES) return false
  into.f.set(new Float64Array(b.buffer, 0, STATE_FLOATS))
  into.i.set(new Int32Array(b.buffer, STATE_FLOATS * 8, STATE_INTS))
  return true
}
