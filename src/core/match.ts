import { LEFT, NO_PLAYER, RIGHT } from './constants.ts'
import type { Side, SideOrNone } from './constants.ts'
import { Ev } from './events.ts'
import type { MatchEvent } from './events.ts'
import { GameLogic, getRules } from './logic.ts'
import type { RuleSet } from './logic.ts'
import { PhysicWorld } from './physics.ts'
import type { PlayerInput } from './input.ts'

export const STATE_FLOATS = 20
export const STATE_INTS = 12

export interface MatchState { f: Float64Array; i: Int32Array }

export const allocState = (): MatchState => ({
  f: new Float64Array(STATE_FLOATS),
  i: new Int32Array(STATE_INTS),
})

export function checksumState(s: MatchState): number {
  let h = 2166136261
  const b = new Uint8Array(s.f.buffer)
  for (let k = 0; k < b.length; k++) { h ^= b[k]; h = Math.imul(h, 16777619) }
  const b2 = new Uint8Array(s.i.buffer)
  for (let k = 0; k < b2.length; k++) { h ^= b2[k]; h = Math.imul(h, 16777619) }
  return h >>> 0
}

export class Match {
  world = new PhysicWorld()
  logic: GameLogic
  events: MatchEvent[] = []
  frame = 0

  constructor(rules: RuleSet | string = 'default', scoreToWin?: number, servingPlayer: SideOrNone = LEFT) {
    const r = typeof rules === 'string' ? getRules(rules) : rules
    this.logic = new GameLogic(r, scoreToWin)
    this.logic.servingPlayer = servingPlayer
    this.world.resetBall(servingPlayer)
  }

  private canStartRound(serving: SideOrNone) {
    const w = this.world
    if (serving === NO_PLAYER) return false
    return w.blobHitGround(serving as Side) && w.ballVY < 1.5 && w.ballVY > -1.5 && w.ballY > 430
  }

  step(li: PlayerInput, ri: PlayerInput) {
    this.events.length = 0
    const w = this.world, g = this.logic

    let l = li, r = ri
    const tf = g.rules.transformInput
    if (tf) {
      const [ll, lr, lu] = tf(LEFT, li.left, li.right, li.up)
      const [rl, rr, ru] = tf(RIGHT, ri.left, ri.right, ri.up)
      l = { left: ll, right: lr, up: lu }
      r = { left: rl, right: rr, up: ru }
    }

    w.step(l, r, g.isBallValid, g.isGameRunning, this.events)
    g.step()

    for (let k = 0; k < this.events.length; k++) {
      const e = this.events[k]
      switch (e.event) {
        case Ev.BALL_HIT_BLOB: g.onBallHitsPlayer(e.side as Side); break
        case Ev.BALL_HIT_GROUND:
          g.onBallHitsGround(e.side as Side)
          if (!g.isBallValid) { w.ballVX *= 0.6; w.ballVY *= 0.6 }
          break
        case Ev.BALL_HIT_NET: g.onBallHitsNet(e.side); break
        case Ev.BALL_HIT_NET_TOP: g.onBallHitsNet(NO_PLAYER); break
        case Ev.BALL_HIT_WALL: g.onBallHitsWall(e.side as Side); break
      }
    }

    const err = g.takeLastError()
    if (err !== NO_PLAYER) {
      this.events.push({ event: Ev.PLAYER_ERROR, side: err, intensity: 0 })
      w.ballVX *= 0.6; w.ballVY *= 0.6
    }

    if (!g.isBallValid && this.canStartRound(g.servingPlayer)) {
      w.resetBall(g.servingPlayer)
      g.onServe()
      this.events.push({ event: Ev.RESET_BALL, side: NO_PLAYER, intensity: 0 })
    }

    this.frame++
  }

  save(s: MatchState) {
    const w = this.world, g = this.logic, f = s.f, i = s.i
    f[0] = w.blobX[0]; f[1] = w.blobX[1]; f[2] = w.blobY[0]; f[3] = w.blobY[1]
    f[4] = w.blobVX[0]; f[5] = w.blobVX[1]; f[6] = w.blobVY[0]; f[7] = w.blobVY[1]
    f[8] = w.blobState[0]; f[9] = w.blobState[1]; f[10] = w.animSpeed[0]; f[11] = w.animSpeed[1]
    f[12] = w.ballX; f[13] = w.ballY; f[14] = w.ballVX; f[15] = w.ballVY
    f[16] = w.ballRot; f[17] = w.ballAngVel
    i[0] = g.scores[0]; i[1] = g.scores[1]; i[2] = g.touches[0]; i[3] = g.touches[1]
    i[4] = g.squish[0]; i[5] = g.squish[1]; i[6] = g.squishWall; i[7] = g.squishGround
    i[8] = g.servingPlayer; i[9] = (g.isBallValid ? 1 : 0) | (g.isGameRunning ? 2 : 0)
    i[10] = g.winner; i[11] = this.frame
  }

  restore(s: MatchState) {
    const w = this.world, g = this.logic, f = s.f, i = s.i
    w.blobX[0] = f[0]; w.blobX[1] = f[1]; w.blobY[0] = f[2]; w.blobY[1] = f[3]
    w.blobVX[0] = f[4]; w.blobVX[1] = f[5]; w.blobVY[0] = f[6]; w.blobVY[1] = f[7]
    w.blobState[0] = f[8]; w.blobState[1] = f[9]; w.animSpeed[0] = f[10]; w.animSpeed[1] = f[11]
    w.ballX = f[12]; w.ballY = f[13]; w.ballVX = f[14]; w.ballVY = f[15]
    w.ballRot = f[16]; w.ballAngVel = f[17]
    g.scores[0] = i[0]; g.scores[1] = i[1]; g.touches[0] = i[2]; g.touches[1] = i[3]
    g.squish[0] = i[4]; g.squish[1] = i[5]; g.squishWall = i[6]; g.squishGround = i[7]
    g.servingPlayer = i[8] as SideOrNone
    g.isBallValid = (i[9] & 1) !== 0; g.isGameRunning = (i[9] & 2) !== 0
    g.winner = i[10] as SideOrNone
    this.frame = i[11]
    g.lastError = NO_PLAYER
  }

  private scratch = allocState()

  checksum(): number {
    this.save(this.scratch)
    return checksumState(this.scratch)
  }
}
