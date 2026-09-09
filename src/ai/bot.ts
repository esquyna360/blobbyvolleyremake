import {
  BALL_GRAVITATION, BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT,
  GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, PUSH_REACH_X, PUSH_REACH_Y, RIGHT_PLANE, SPECIAL_FULL, SPECIAL_REACH, other,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import type { PlayerInput } from '../core/input.ts'
import type { Match } from '../core/match.ts'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane'

const PARAMS: Record<Difficulty, {
  reaction: number; aimErr: number; jumpErr: number; speed: number; smash: number
}> = {
  easy:   { reaction: 14, aimErr: 46, jumpErr: 0.35, speed: 0.72, smash: 0.05 },
  normal: { reaction: 8,  aimErr: 26, jumpErr: 0.18, speed: 0.9,  smash: 0.25 },
  hard:   { reaction: 4,  aimErr: 12, jumpErr: 0.07, speed: 1.0,  smash: 0.55 },
  insane: { reaction: 1,  aimErr: 4,  jumpErr: 0.02, speed: 1.0,  smash: 0.85 },
}

interface Traj { x: number; y: number; vx: number; vy: number; t: number; crossed: boolean }

/** Forward-simulate the ball (walls + net + gravity, no blobs) until it reaches `targetY` on `side`. */
function predict(match: Match, side: Side, maxFrames = 220): Traj {
  const w = match.world
  let x = w.ballX, y = w.ballY, vx = w.ballVX, vy = w.ballVY
  let crossed = false
  const mySideOf = (px: number) => (side === LEFT ? px < NET_POSITION_X : px > NET_POSITION_X)

  for (let t = 1; t <= maxFrames; t++) {
    x += vx
    y += 0.5 * BALL_GRAVITATION + vy
    vy += BALL_GRAVITATION

    if (x - BALL_RADIUS <= LEFT_PLANE && vx < 0) { vx = -vx; x = LEFT_PLANE + BALL_RADIUS }
    else if (x + BALL_RADIUS >= RIGHT_PLANE && vx > 0) { vx = -vx; x = RIGHT_PLANE - BALL_RADIUS }
    else if (y > NET_SPHERE_POSITION && Math.abs(x - NET_POSITION_X) < BALL_RADIUS + NET_RADIUS) {
      const right = x - NET_POSITION_X > 0
      vx = -vx
      x = NET_POSITION_X + (right ? BALL_RADIUS + NET_RADIUS : -BALL_RADIUS - NET_RADIUS)
    }

    if (mySideOf(x)) crossed = true

    if (y + BALL_RADIUS >= GROUND_PLANE_HEIGHT_MAX) return { x, y, vx, vy, t, crossed }
    if (crossed && y > GROUND_PLANE_HEIGHT - 40 && vy > 0) return { x, y, vx, vy, t, crossed }
  }
  return { x, y, vx, vy, t: maxFrames, crossed }
}

export class Bot {
  side: Side
  diff: Difficulty
  private cooldown = 0
  private cached: Traj | null = null
  private rng: () => number
  private aimBias = 0

  constructor(side: Side, diff: Difficulty = 'normal', seed = 12345) {
    this.side = side
    this.diff = diff
    let s = seed >>> 0
    this.rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  }

  think(match: Match): PlayerInput {
    const p = PARAMS[this.diff]
    const w = match.world
    const g = match.logic
    const me = this.side
    const bx = w.blobX[me]
    const onGround = w.blobY[me] >= GROUND_PLANE_HEIGHT - 0.001

    if (this.cooldown-- <= 0) {
      this.cooldown = p.reaction
      this.cached = predict(match, me)
      this.aimBias = (this.rng() * 2 - 1) * p.aimErr
    }
    const tr = this.cached ?? predict(match, me)

    const homeX = me === LEFT ? 200 : 600
    let targetX: number

    const ballOnMySide = me === LEFT ? w.ballX < NET_POSITION_X : w.ballX > NET_POSITION_X
    const incoming = tr.crossed

    if (!g.isBallValid) {
      // serving position
      targetX = g.servingPlayer === me ? (me === LEFT ? 200 : 600) : homeX
    } else if (incoming || ballOnMySide) {
      targetX = tr.x + this.aimBias
      const smash = this.rng() < p.smash
      // stand slightly behind the ball so the hit goes forward over the net
      const push = smash ? 4 : 16
      targetX += me === LEFT ? -push : push
    } else {
      targetX = homeX + this.aimBias * 0.3
    }

    const minX = me === LEFT ? LEFT_PLANE + 10 : NET_POSITION_X + NET_RADIUS + BLOBBY_LOWER_RADIUS + 4
    const maxX = me === LEFT ? NET_POSITION_X - NET_RADIUS - BLOBBY_LOWER_RADIUS - 4 : RIGHT_PLANE - 10
    targetX = Math.max(minX, Math.min(maxX, targetX))

    const dx = targetX - bx
    const dead = 6
    let left = dx < -dead
    let right = dx > dead

    if (this.rng() > p.speed) { left = false; right = false }

    // jump decision
    let up = false
    const dxBall = Math.abs(w.ballX - bx)
    const ballHigh = w.ballY < GROUND_PLANE_HEIGHT - 30

    if (!g.isBallValid && g.servingPlayer === me) {
      up = Math.abs(w.ballX - bx) < 60 && w.ballY > 300 && onGround
    } else if (ballOnMySide && ballHigh && dxBall < 90 && this.rng() > this.jumpNoise()) {
      const framesToReach = tr.t
      up = framesToReach < 26 || (w.ballY < 330 && dxBall < 60)
    } else if (ballOnMySide && dxBall < 50 && w.ballY > GROUND_PLANE_HEIGHT - 20) {
      up = false
    }

    if (!onGround && w.blobVY[me] < 0) up = true

    return { left, right, up, special: this.wantSpecial(w, me, onGround), push: this.wantPush(w, me) }
  }

  private specialHeld = false
  private pushHeld = false

  private wantSpecial(w: Match['world'], me: Side, onGround: boolean) {
    const ready = w.charge[me] >= SPECIAL_FULL && !onGround && w.stun[me] <= 0
    const dx = w.ballX - w.blobX[me]
    const dy = w.ballY - (w.blobY[me] - BLOBBY_UPPER_SPHERE)
    const near = Math.sqrt(dx * dx + dy * dy) < SPECIAL_REACH * 0.8
    const want = ready && near && this.rng() < 0.5 + PARAMS[this.diff].smash * 0.5
    if (!want) { this.specialHeld = false; return false }
    if (this.specialHeld) return false
    this.specialHeld = true
    return true
  }

  private wantPush(w: Match['world'], me: Side) {
    const foe = other(me)
    const want = Math.abs(w.blobX[foe] - w.blobX[me]) < PUSH_REACH_X &&
      Math.abs(w.blobY[foe] - w.blobY[me]) < PUSH_REACH_Y &&
      this.rng() < PARAMS[this.diff].smash * 0.06
    if (!want) { this.pushHeld = false; return false }
    if (this.pushHeld) return false
    this.pushHeld = true
    return true
  }

  private jumpNoise() { return PARAMS[this.diff].jumpErr }
}
