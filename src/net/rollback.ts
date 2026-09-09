import { Match, allocState, checksumState } from '../core/match.ts'
import type { MatchState } from '../core/match.ts'
import { unpackInput } from '../core/input.ts'
import type { Side } from '../core/constants.ts'

export const MAX_ROLLBACK = 12
const RING = 256

export interface RollbackStats {
  frame: number
  confirmed: number
  rollbacks: number
  maxRollback: number
  frameAdvantage: number
  predictionMisses: number
  stalls: number
}

/** Deterministic 2-player rollback (GGPO-style) over an unreliable ordered-ish channel. */
export class Rollback {
  match: Match
  local: Side
  remote: Side

  frame = 0
  confirmed = -1

  private inputs: [Uint8Array, Uint8Array] = [new Uint8Array(RING), new Uint8Array(RING)]
  private stamp: [Int32Array, Int32Array] = [new Int32Array(RING).fill(-1), new Int32Array(RING).fill(-1)]
  private usedRemote = new Uint8Array(RING)
  private states: MatchState[] = []
  private stateFrame = new Int32Array(RING).fill(-1)

  lastRemoteFrame = -1
  remoteReportedFrame = -1
  stats: RollbackStats = {
    frame: 0, confirmed: -1, rollbacks: 0, maxRollback: 0,
    frameAdvantage: 0, predictionMisses: 0, stalls: 0,
  }

  constructor(match: Match, local: Side) {
    this.match = match
    this.local = local
    this.remote = (local === 0 ? 1 : 0) as Side
    for (let i = 0; i < RING; i++) this.states.push(allocState())
  }

  private idx(f: number) { return ((f % RING) + RING) % RING }

  private has(side: Side, f: number) { return this.stamp[side][this.idx(f)] === f }

  private setLocalInput(f: number, bits: number) {
    const i = this.idx(f)
    this.inputs[this.local][i] = bits
    this.stamp[this.local][i] = f
  }

  /** Returns the earliest frame whose remote prediction was wrong, or -1. */
  applyRemoteInputs(startFrame: number, bits: Uint8Array): number {
    let earliestMismatch = -1
    for (let k = 0; k < bits.length; k++) {
      const f = startFrame + k
      if (f < 0) continue
      if (f <= this.confirmed) continue
      if (f > this.frame + 600) continue
      const i = this.idx(f)
      const b = bits[k]
      if (this.has(this.remote, f)) {
        if (this.inputs[this.remote][i] === b) continue
      } else if (f < this.frame && this.stateFrame[i] === f && this.usedRemote[i] !== b) {
        if (earliestMismatch === -1 || f < earliestMismatch) earliestMismatch = f
      }
      this.inputs[this.remote][i] = b
      this.stamp[this.remote][i] = f
      if (f > this.lastRemoteFrame) this.lastRemoteFrame = f
    }
    return earliestMismatch
  }

  private predictedRemote(f: number): number {
    if (this.has(this.remote, f)) return this.inputs[this.remote][this.idx(f)]
    for (let k = f - 1; k >= f - MAX_ROLLBACK * 4 && k >= 0; k--) {
      if (this.has(this.remote, k)) return this.inputs[this.remote][this.idx(k)]
    }
    return 0
  }

  private stepOnce() {
    const f = this.frame
    const i = this.idx(f)
    this.match.save(this.states[i])
    this.stateFrame[i] = f

    const lb = this.has(this.local, f) ? this.inputs[this.local][i] : 0
    const rb = this.predictedRemote(f)
    this.usedRemote[i] = rb
    const li = unpackInput(this.local === 0 ? lb : rb)
    const ri = unpackInput(this.local === 0 ? rb : lb)
    this.match.step(li, ri)
    this.frame = f + 1
  }

  /** Roll back to `toFrame` and resimulate up to the current frame. */
  private resimulate(toFrame: number) {
    const target = this.frame
    const i = this.idx(toFrame)
    if (this.stateFrame[i] !== toFrame) return false
    this.match.restore(this.states[i])
    this.frame = toFrame
    this.stats.rollbacks++
    const depth = target - toFrame
    if (depth > this.stats.maxRollback) this.stats.maxRollback = depth
    while (this.frame < target) this.stepOnce()
    return true
  }

  onRemotePacket(startFrame: number, bits: Uint8Array, remoteFrame: number) {
    if (remoteFrame > this.remoteReportedFrame) this.remoteReportedFrame = remoteFrame
    const mismatch = this.applyRemoteInputs(startFrame, bits)
    if (mismatch >= 0 && mismatch < this.frame) {
      this.stats.predictionMisses++
      this.resimulate(Math.max(mismatch, this.frame - (RING - 8)))
    }
    let c = this.confirmed
    while (c + 1 < this.frame && this.has(this.remote, c + 1) && this.has(this.local, c + 1)) c++
    this.confirmed = c
  }

  /** Advance one frame if allowed. Returns whether a step happened. */
  advance(localBits: number): boolean {
    if (this.frame - this.lastRemoteFrame > MAX_ROLLBACK) {
      this.stats.stalls++
      this.syncStats()
      return false
    }
    this.setLocalInput(this.frame, localBits)
    this.stepOnce()
    this.syncStats()
    return true
  }

  /** Checksum of the saved state at the start of `frame`, or null if it is no longer retained. */
  checksumAt(frame: number): number | null {
    const i = this.idx(frame)
    if (this.stateFrame[i] !== frame) return null
    return checksumState(this.states[i])
  }

  private syncStats() {
    this.stats.frame = this.frame
    this.stats.confirmed = this.confirmed
    this.stats.frameAdvantage = this.frame - this.remoteReportedFrame
  }

  /** Inputs for every simulated local frame from `from` onwards, for redundant sending. */
  localWindow(from: number): { start: number; bits: Uint8Array } {
    const last = this.frame - 1
    const start = Math.max(0, Math.min(from, last))
    const n = Math.max(0, last - start + 1)
    const out = new Uint8Array(Math.min(n, 64))
    const realStart = last + 1 - out.length
    for (let k = 0; k < out.length; k++) {
      const f = realStart + k
      out[k] = this.has(this.local, f) ? this.inputs[this.local][this.idx(f)] : 0
    }
    return { start: realStart, bits: out }
  }
}
