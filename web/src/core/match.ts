import { LEFT, NO_PLAYER, RIGHT, SPECIAL_GAIN_LOST } from './constants.ts'
import type { Side, SideOrNone } from './constants.ts'
import { Ev } from './events.ts'
import type { MatchEvent } from './events.ts'
import { GameLogic, getRules } from './logic.ts'
import type { RuleSet } from './logic.ts'
import { PhysicWorld } from './physics.ts'
import type { PlayerInput } from './input.ts'

export const STATE_FLOATS = 26
export const STATE_INTS = 69

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

  constructor(
    rules: RuleSet | string = 'default',
    scoreToWin?: number,
    servingPlayer: SideOrNone = LEFT,
    walls = true,
  ) {
    const r = typeof rules === 'string' ? getRules(rules) : rules
    this.logic = new GameLogic(r, scoreToWin)
    this.logic.servingPlayer = servingPlayer
    this.world.walls = walls
    this.world.resetBall(servingPlayer)
  }

  /** Match point de qualquer lado. */
  private atMatchPoint() {
    const g = this.logic
    return Math.max(g.scores[LEFT], g.scores[RIGHT]) >= g.scoreToWin - 1
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
      l = { left: ll, right: lr, up: lu, special: li.special, down: li.down, dive: li.dive, hit: li.hit }
      r = { left: rl, right: rr, up: ru, special: ri.special, down: ri.down, dive: ri.dive, hit: ri.hit }
    }

    w.scores[0] = g.scores[0]; w.scores[1] = g.scores[1]
    w.rally = g.rally
    w.matchPoint = this.atMatchPoint()
    w.step(l, r, g.isBallValid, g.isGameRunning, this.events)
    g.step()

    for (let k = 0; k < this.events.length; k++) {
      const e = this.events[k]
      switch (e.event) {
        case Ev.BALL_HIT_BLOB:
        case Ev.PARRY:
        case Ev.DIG:
        case Ev.DIVE_HIT:
        case Ev.HIT:
        case Ev.DROP:
        case Ev.LOB:
        case Ev.REVERSAL:
        case Ev.SPECIAL_FIRED: g.onBallHitsPlayer(e.side as Side); break
        case Ev.BALL_HIT_GROUND:
          g.onBallHitsGround(e.side as Side)
          if (!g.isBallValid) { w.ballVX *= 0.6; w.ballVY *= 0.6 }
          break
        case Ev.BALL_HIT_NET: g.onBallHitsNet(e.side); break
        case Ev.BALL_HIT_NET_TOP: g.onBallHitsNet(NO_PLAYER); break
        case Ev.BALL_HIT_WALL: g.onBallHitsWall(e.side as Side); break
        case Ev.BALL_OUT: g.onBallOut(); break
        case Ev.SPECIAL_HIT: this.tryFatality(e.side as Side); break
      }
    }

    const err = g.takeLastError()
    if (err !== NO_PLAYER) {
      this.events.push({ event: Ev.PLAYER_ERROR, side: err, intensity: 0 })
      w.addCharge(err, SPECIAL_GAIN_LOST, this.events)
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
    f[18] = w.charge[0]; f[19] = w.charge[1]
    f[20] = w.knock[0]; f[21] = w.knock[1]
    i[0] = g.scores[0]; i[1] = g.scores[1]; i[2] = g.touches[0]; i[3] = g.touches[1]
    i[4] = g.squish[0]; i[5] = g.squish[1]; i[6] = g.squishWall; i[7] = g.squishGround
    i[8] = g.servingPlayer; i[9] = (g.isBallValid ? 1 : 0) | (g.isGameRunning ? 2 : 0)
    i[10] = g.winner; i[11] = this.frame
    i[12] = w.stun[0]; i[13] = w.stun[1]
    i[14] = w.superFrames; i[15] = w.superOwner
    i[16] = w.prevUp[0]; i[17] = w.prevUp[1]
    i[18] = w.prevSpecial[0]; i[19] = w.prevSpecial[1]
    i[20] = w.diveFrames[0]; i[21] = w.diveFrames[1]
    i[22] = w.diveCd[0]; i[23] = w.diveCd[1]
    i[24] = w.parryActive[0]; i[25] = w.parryActive[1]
    i[26] = w.parryCd[0]; i[27] = w.parryCd[1]
    i[28] = w.parryChain
    i[29] = g.rally; i[30] = g.rallyBest
    f[22] = w.crouch[0]; f[23] = w.crouch[1]
    i[31] = w.prevDown[0]; i[32] = w.prevDown[1]
    i[33] = w.digCd[0]; i[34] = w.digCd[1]
    i[35] = w.digActive[0]; i[36] = w.digActive[1]
    i[37] = w.diveRecover[0]; i[38] = w.diveRecover[1]
    i[39] = w.diveDir[0]; i[40] = w.diveDir[1]
    i[41] = w.ballOut
    i[42] = w.prevDive[0]; i[43] = w.prevDive[1]
    i[44] = w.hold[0]; i[45] = w.hold[1]
    i[46] = w.hitCharge[0]; i[47] = w.hitCharge[1]
    i[48] = w.hitAimX[0]; i[49] = w.hitAimX[1]
    i[50] = w.hitAimY[0]; i[51] = w.hitAimY[1]
    i[52] = w.hitLag[0]; i[53] = w.hitLag[1]
    i[54] = w.prevHit[0]; i[55] = w.prevHit[1]
    i[56] = w.revActive[0]; i[57] = w.revActive[1]
    i[58] = w.revCd[0]; i[59] = w.revCd[1]
    i[60] = w.swingT[0]; i[61] = w.swingT[1]
    i[62] = w.swingPow[0]; i[63] = w.swingPow[1]
    i[64] = w.armSpecial[0]; i[65] = w.armSpecial[1]
    i[66] = w.revSpin[0]; i[67] = w.revSpin[1]; i[68] = w.superKind
    f[24] = w.tempo; f[25] = w.ballSpin
  }

  restore(s: MatchState) {
    const w = this.world, g = this.logic, f = s.f, i = s.i
    w.blobX[0] = f[0]; w.blobX[1] = f[1]; w.blobY[0] = f[2]; w.blobY[1] = f[3]
    w.blobVX[0] = f[4]; w.blobVX[1] = f[5]; w.blobVY[0] = f[6]; w.blobVY[1] = f[7]
    w.blobState[0] = f[8]; w.blobState[1] = f[9]; w.animSpeed[0] = f[10]; w.animSpeed[1] = f[11]
    w.ballX = f[12]; w.ballY = f[13]; w.ballVX = f[14]; w.ballVY = f[15]
    w.ballRot = f[16]; w.ballAngVel = f[17]
    w.charge[0] = f[18]; w.charge[1] = f[19]
    w.knock[0] = f[20]; w.knock[1] = f[21]
    w.stun[0] = i[12]; w.stun[1] = i[13]
    w.superFrames = i[14]; w.superOwner = i[15]
    w.prevUp[0] = i[16]; w.prevUp[1] = i[17]
    w.prevSpecial[0] = i[18]; w.prevSpecial[1] = i[19]
    w.diveFrames[0] = i[20]; w.diveFrames[1] = i[21]
    w.diveCd[0] = i[22]; w.diveCd[1] = i[23]
    w.parryActive[0] = i[24]; w.parryActive[1] = i[25]
    w.parryCd[0] = i[26]; w.parryCd[1] = i[27]
    w.parryChain = i[28]
    g.rally = i[29]; g.rallyBest = i[30]
    g.scores[0] = i[0]; g.scores[1] = i[1]; g.touches[0] = i[2]; g.touches[1] = i[3]
    g.squish[0] = i[4]; g.squish[1] = i[5]; g.squishWall = i[6]; g.squishGround = i[7]
    g.servingPlayer = i[8] as SideOrNone
    g.isBallValid = (i[9] & 1) !== 0; g.isGameRunning = (i[9] & 2) !== 0
    g.winner = i[10] as SideOrNone
    this.frame = i[11]
    g.lastError = NO_PLAYER
    w.crouch[0] = f[22]; w.crouch[1] = f[23]
    w.prevDown[0] = i[31]; w.prevDown[1] = i[32]
    w.digCd[0] = i[33]; w.digCd[1] = i[34]
    w.digActive[0] = i[35]; w.digActive[1] = i[36]
    w.diveRecover[0] = i[37]; w.diveRecover[1] = i[38]
    w.diveDir[0] = i[39]; w.diveDir[1] = i[40]
    w.ballOut = i[41]
    w.prevDive[0] = i[42]; w.prevDive[1] = i[43]
    w.hold[0] = i[44]; w.hold[1] = i[45]
    w.hitCharge[0] = i[46]; w.hitCharge[1] = i[47]
    w.hitAimX[0] = i[48]; w.hitAimX[1] = i[49]
    w.hitAimY[0] = i[50]; w.hitAimY[1] = i[51]
    w.hitLag[0] = i[52]; w.hitLag[1] = i[53]
    w.prevHit[0] = i[54]; w.prevHit[1] = i[55]
    w.revActive[0] = i[56]; w.revActive[1] = i[57]
    w.revCd[0] = i[58]; w.revCd[1] = i[59]
    w.swingT[0] = i[60]; w.swingT[1] = i[61]
    w.swingPow[0] = i[62]; w.swingPow[1] = i[63]
    w.armSpecial[0] = i[64]; w.armSpecial[1] = i[65]
    w.revSpin[0] = i[66]; w.revSpin[1] = i[67]; w.superKind = i[68]
    w.tempo = f[24]; w.ballSpin = f[25]
    w.rally = g.rally
    w.matchPoint = this.atMatchPoint()
  }

  /** Especial na cara do adversário valendo o jogo: acabou. */
  private tryFatality(victim: Side) {
    const g = this.logic
    if (g.winner !== NO_PLAYER || !g.isBallValid) return
    const killer = victim === LEFT ? RIGHT : LEFT
    const l = killer === LEFT ? g.scores[LEFT] + 1 : g.scores[LEFT]
    const r = killer === RIGHT ? g.scores[RIGHT] + 1 : g.scores[RIGHT]
    if (!g.rules.isWinning(l, r, g.scoreToWin)) return
    g.mistake(victim, killer, 1)
    this.events.push({ event: Ev.FATALITY, side: killer, intensity: 1 })
  }

  private scratch = allocState()

  checksum(): number {
    this.save(this.scratch)
    return checksumState(this.scratch)
  }
}
