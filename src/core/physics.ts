import {
  BALL_COLLISION_VELOCITY, BALL_GRAVITATION, BALL_RADIUS, BLOBBY_ANIMATION_SPEED,
  BLOBBY_JUMP_ACCELERATION, BLOBBY_JUMP_BUFFER, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE,
  BLOBBY_SPEED, BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE, GRAVITATION,
  GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X,
  NET_RADIUS, NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE, STANDARD_BALL_ANGULAR_VELOCITY,
  STANDARD_BALL_HEIGHT, SPECIAL_BALL_FRAMES, SPECIAL_FULL, SPECIAL_GAIN_FRAME,
  SPECIAL_GAIN_TOUCH, SPECIAL_REACH, SPECIAL_VELOCITY, STUN_FRAMES,
} from './constants.ts'
import type { Side } from './constants.ts'
import { Ev } from './events.ts'
import type { MatchEvent } from './events.ts'
import { NO_INPUT } from './input.ts'
import type { PlayerInput } from './input.ts'

export class PhysicWorld {
  blobX = [200, 600]
  blobY = [GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT]
  blobVX = [0, 0]
  blobVY = [0, 0]
  blobState = [0, 0]
  animSpeed = [0, 0]

  ballX = 200
  ballY = STANDARD_BALL_HEIGHT
  ballVX = 0
  ballVY = 0
  ballRot = 0
  ballAngVel = STANDARD_BALL_ANGULAR_VELOCITY

  charge = [0, 0]
  stun = [0, 0]
  prevUp = [0, 0]
  superFrames = 0
  superOwner = -1

  blobHitGround(p: Side) { return this.blobY[p] >= GROUND_PLANE_HEIGHT }

  private addCharge(p: Side, amount: number, out: MatchEvent[]) {
    if (this.charge[p] >= SPECIAL_FULL) return
    this.charge[p] += amount
    if (this.charge[p] >= SPECIAL_FULL) {
      this.charge[p] = SPECIAL_FULL
      out.push({ event: Ev.SPECIAL_READY, side: p, intensity: 1 })
    }
  }

  /** Pulo de novo no ar, com a barra cheia e a bola por perto: manda com tudo no ângulo da batida. */
  private trySpecial(p: Side, raw: PlayerInput, isBallValid: boolean, wasGround: boolean, out: MatchEvent[]) {
    if (!isBallValid || this.stun[p] > 0) return
    if (this.charge[p] < SPECIAL_FULL) return
    if (!raw.up || this.prevUp[p] === 1) return
    if (wasGround) return

    const cx = this.blobX[p]
    const cy = this.blobY[p] - BLOBBY_UPPER_SPHERE
    let nx = this.ballX - cx
    let ny = this.ballY - cy
    const d = Math.sqrt(nx * nx + ny * ny)
    if (d > SPECIAL_REACH) return

    const l = d || 1
    nx /= l; ny /= l
    this.charge[p] = 0
    this.ballVX = nx * SPECIAL_VELOCITY
    this.ballVY = ny * SPECIAL_VELOCITY
    this.superFrames = SPECIAL_BALL_FRAMES
    this.superOwner = p
    out.push({ event: Ev.SPECIAL_FIRED, side: p, intensity: 1 })
  }

  private topBallCollision(p: Side) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - (this.blobY[p] - BLOBBY_UPPER_SPHERE)
    const r = BALL_RADIUS + BLOBBY_UPPER_RADIUS
    return dx * dx + dy * dy < r * r
  }

  private bottomBallCollision(p: Side) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - (this.blobY[p] + BLOBBY_LOWER_SPHERE)
    const r = BALL_RADIUS + BLOBBY_LOWER_RADIUS
    return dx * dx + dy * dy < r * r
  }

  private animStep(p: Side) {
    if (this.blobState[p] < 0) { this.animSpeed[p] = 0; this.blobState[p] = 0 }
    if (this.blobState[p] >= 4.5) this.animSpeed[p] = -BLOBBY_ANIMATION_SPEED
    this.blobState[p] += this.animSpeed[p]
    if (this.blobState[p] >= 5) this.blobState[p] = 4.99
  }

  private startAnim(p: Side) { if (this.animSpeed[p] === 0) this.animSpeed[p] = BLOBBY_ANIMATION_SPEED }

  private handleBlob(p: Side, input: PlayerInput) {
    let g = GRAVITATION
    if (input.up) {
      if (this.blobHitGround(p)) { this.blobVY[p] = BLOBBY_JUMP_ACCELERATION; this.startAnim(p) }
      g -= BLOBBY_JUMP_BUFFER
    }
    if ((input.left || input.right) && this.blobHitGround(p)) this.startAnim(p)

    this.blobVX[p] = (input.right ? BLOBBY_SPEED : 0) - (input.left ? BLOBBY_SPEED : 0)

    this.blobX[p] += this.blobVX[p]
    this.blobY[p] += 0.5 * g + this.blobVY[p]
    this.blobVY[p] += g

    if (this.blobY[p] > GROUND_PLANE_HEIGHT) {
      if (this.blobVY[p] > 3.5) this.startAnim(p)
      this.blobY[p] = GROUND_PLANE_HEIGHT
      this.blobVY[p] = 0
    }
    this.animStep(p)
  }

  private handleBlobBallCollision(p: Side, out: MatchEvent[]) {
    let cy = this.blobY[p]
    if (this.bottomBallCollision(p)) cy += BLOBBY_LOWER_SPHERE
    else if (this.topBallCollision(p)) cy -= BLOBBY_UPPER_SPHERE
    else return false

    const rx = this.ballVX - this.blobVX[p]
    const ry = this.ballVY - this.blobVY[p]
    const intensity = Math.min(1, Math.sqrt(rx * rx + ry * ry) / 25)

    let nx = this.ballX - this.blobX[p]
    let ny = this.ballY - cy
    const l = Math.sqrt(nx * nx + ny * ny) || 1
    nx /= l; ny /= l
    this.ballVX = nx * BALL_COLLISION_VELOCITY
    this.ballVY = ny * BALL_COLLISION_VELOCITY
    this.ballX += this.ballVX
    this.ballY += this.ballVY

    out.push({ event: Ev.BALL_HIT_BLOB, side: p, intensity })
    this.addCharge(p, SPECIAL_GAIN_TOUCH, out)

    if (this.superFrames > 0) {
      if (this.superOwner !== p) {
        this.stun[p] = STUN_FRAMES
        out.push({ event: Ev.SPECIAL_HIT, side: p, intensity: 1 })
      }
      this.superFrames = 0
      this.superOwner = -1
    }
    return true
  }

  private handleBallWorldCollisions(out: MatchEvent[]) {
    if (this.ballY + BALL_RADIUS > GROUND_PLANE_HEIGHT_MAX) {
      this.ballVY = -this.ballVY * 0.95
      this.ballVX *= 0.95
      this.ballY = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
      out.push({ event: Ev.BALL_HIT_GROUND, side: this.ballX > NET_POSITION_X ? RIGHT : LEFT, intensity: 0 })
    }

    if (this.ballX - BALL_RADIUS <= LEFT_PLANE && this.ballVX < 0) {
      this.ballVX = -this.ballVX
      this.ballX = LEFT_PLANE + BALL_RADIUS
      out.push({ event: Ev.BALL_HIT_WALL, side: LEFT, intensity: 0 })
    } else if (this.ballX + BALL_RADIUS >= RIGHT_PLANE && this.ballVX > 0) {
      this.ballVX = -this.ballVX
      this.ballX = RIGHT_PLANE - BALL_RADIUS
      out.push({ event: Ev.BALL_HIT_WALL, side: RIGHT, intensity: 0 })
    } else if (this.ballY > NET_SPHERE_POSITION && Math.abs(this.ballX - NET_POSITION_X) < BALL_RADIUS + NET_RADIUS) {
      const right = this.ballX - NET_POSITION_X > 0
      this.ballVX = -this.ballVX
      this.ballX = NET_POSITION_X + (right ? BALL_RADIUS + NET_RADIUS : -BALL_RADIUS - NET_RADIUS)
      out.push({ event: Ev.BALL_HIT_NET, side: right ? RIGHT : LEFT, intensity: 0 })
    } else {
      const dx = this.ballX - NET_POSITION_X
      const dy = this.ballY - NET_SPHERE_POSITION
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < NET_RADIUS + BALL_RADIUS) {
        const nx = dx / (d || 1), ny = dy / (d || 1)
        let perp = nx * this.ballVX + ny * this.ballVY
        perp *= perp
        let para = this.ballVX * this.ballVX + this.ballVY * this.ballVY - perp
        perp *= 0.7
        para *= 0.9
        const speed = Math.sqrt(perp + para)
        const dot = this.ballVX * nx + this.ballVY * ny
        let rx = this.ballVX - 2 * dot * nx
        let ry = this.ballVY - 2 * dot * ny
        const rl = Math.sqrt(rx * rx + ry * ry) || 1
        this.ballVX = (rx / rl) * speed
        this.ballVY = (ry / rl) * speed
        this.ballX = NET_POSITION_X - nx * (NET_RADIUS + BALL_RADIUS)
        this.ballY = NET_SPHERE_POSITION - ny * (NET_RADIUS + BALL_RADIUS)
        out.push({ event: Ev.BALL_HIT_NET_TOP, side: -1, intensity: 0 })
      }
    }
  }

  step(li: PlayerInput, ri: PlayerInput, isBallValid: boolean, isGameRunning: boolean, out: MatchEvent[]) {
    if (this.stun[LEFT] > 0) this.stun[LEFT]--
    if (this.stun[RIGHT] > 0) this.stun[RIGHT]--
    if (this.superFrames > 0 && --this.superFrames === 0) this.superOwner = -1

    const el = this.stun[LEFT] > 0 ? NO_INPUT : li
    const er = this.stun[RIGHT] > 0 ? NO_INPUT : ri
    const groundL = this.blobHitGround(LEFT)
    const groundR = this.blobHitGround(RIGHT)

    this.handleBlob(LEFT, el)
    this.handleBlob(RIGHT, er)

    if (isGameRunning) {
      this.ballX += this.ballVX
      this.ballY += 0.5 * BALL_GRAVITATION + this.ballVY
      this.ballVY += BALL_GRAVITATION
      this.addCharge(LEFT, SPECIAL_GAIN_FRAME, out)
      this.addCharge(RIGHT, SPECIAL_GAIN_FRAME, out)
    }

    if (isBallValid) {
      this.handleBlobBallCollision(LEFT, out)
      this.handleBlobBallCollision(RIGHT, out)
    }

    this.trySpecial(LEFT, li, isBallValid, groundL, out)
    this.trySpecial(RIGHT, ri, isBallValid, groundR, out)
    this.prevUp[LEFT] = li.up ? 1 : 0
    this.prevUp[RIGHT] = ri.up ? 1 : 0

    this.handleBallWorldCollisions(out)

    if (this.blobX[LEFT] + BLOBBY_LOWER_RADIUS > NET_POSITION_X - NET_RADIUS)
      this.blobX[LEFT] = NET_POSITION_X - NET_RADIUS - BLOBBY_LOWER_RADIUS
    if (this.blobX[RIGHT] - BLOBBY_LOWER_RADIUS < NET_POSITION_X + NET_RADIUS)
      this.blobX[RIGHT] = NET_POSITION_X + NET_RADIUS + BLOBBY_LOWER_RADIUS
    if (this.blobX[LEFT] < LEFT_PLANE) this.blobX[LEFT] = LEFT_PLANE
    if (this.blobX[RIGHT] > RIGHT_PLANE) this.blobX[RIGHT] = RIGHT_PLANE

    const speed = Math.sqrt(this.ballVX * this.ballVX + this.ballVY * this.ballVY)
    if (!isGameRunning) this.ballRot -= this.ballAngVel
    else if (this.ballVX > 0) this.ballRot += this.ballAngVel * (speed / 6)
    else this.ballRot -= this.ballAngVel * (speed / 6)

    if (this.ballRot <= 0) this.ballRot = 6.25 + this.ballRot
    else if (this.ballRot >= 6.25) this.ballRot = this.ballRot - 6.25
  }

  resetBall(side: number) {
    if (side === LEFT) { this.ballX = 200; this.ballY = STANDARD_BALL_HEIGHT }
    else if (side === RIGHT) { this.ballX = 600; this.ballY = STANDARD_BALL_HEIGHT }
    else { this.ballX = 400; this.ballY = 450 }
    this.ballVX = 0; this.ballVY = 0
    this.ballAngVel = (side === RIGHT ? -1 : 1) * STANDARD_BALL_ANGULAR_VELOCITY
    this.superFrames = 0
    this.superOwner = -1
    this.stun[LEFT] = 0; this.stun[RIGHT] = 0
  }
}
