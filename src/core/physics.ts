import {
  BALL_COLLISION_VELOCITY, BALL_GRAVITATION, BALL_RADIUS, BLOBBY_ANIMATION_SPEED,
  BLOBBY_JUMP_ACCELERATION, BLOBBY_JUMP_BUFFER, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE,
  BLOBBY_SPEED, BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE, GRAVITATION,
  GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X,
  NET_RADIUS, NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE, STANDARD_BALL_ANGULAR_VELOCITY,
  STANDARD_BALL_HEIGHT, SPECIAL_BALL_FRAMES, SPECIAL_FULL, SPECIAL_GAIN_FRAME,
  SPECIAL_GAIN_TOUCH, SPECIAL_REACH, SPECIAL_VELOCITY, STUN_FRAMES,
  SPECIAL_KNOCKBACK, SPECIAL_POP, KNOCK_DECAY, SPECIAL_NET_CLEARANCE,
  SPECIAL_GRAVITY_MUL, SPECIAL_TARGET_DEPTH, SPECIAL_TIME_MIN, SPECIAL_TIME_STEP, SPECIAL_TIME_STEPS,
  PUSH_REACH_X, PUSH_REACH_Y, PUSH_FORCE, PUSH_POP, PUSH_CD,
  SPECIAL_COMEBACK_STEP, SPECIAL_COMEBACK_MIN, SPECIAL_COMEBACK_MAX,
  SPECIAL_DEPTH_JITTER, SPECIAL_ARC_JITTER,
  PARRY_ACTIVE, PARRY_CD, PARRY_REACH, PARRY_BOOST, PARRY_CHAIN_MAX,
  CROUCH_RATE, CROUCH_RATE_AIR, CROUCH_RELEASE, CROUCH_DUCK, CROUCH_SLIM,
  CROUCH_SPREAD, CROUCH_SPEED_MUL, CROUCH_FALL_MUL,
  DIG_REACH, DIG_CD, DIG_WINDOW, DIG_VELOCITY, DIG_TARGET_DEPTH, DIG_NET_CLEARANCE,
  DIG_TIME_MIN, DIG_TIME_STEP, DIG_TIME_STEPS, DIG_GAIN,
  SPIKE_MIN_HOLD, SPIKE_MAX_HOLD, SPIKE_JUMP_BOOST, SPIKE_WINDOW, SPIKE_VELOCITY,
  SPIKE_WEAK, SPIKE_FLOOR, SPIKE_FLOOR_GAIN, SPIKE_TARGET_DEPTH, SPIKE_NET_CLEARANCE,
  SPIKE_TIME_MIN, SPIKE_TIME_STEP, SPIKE_TIME_STEPS, SPIKE_GAIN,
} from './constants.ts'
import type { Side } from './constants.ts'
import { Ev } from './events.ts'
import type { MatchEvent } from './events.ts'
import { NO_INPUT } from './input.ts'
import type { PlayerInput } from './input.ts'

export class PhysicWorld {
  blobX = [NET_POSITION_X * 0.5, NET_POSITION_X * 1.5]
  blobY = [GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT]
  blobVX = [0, 0]
  blobVY = [0, 0]
  blobState = [0, 0]
  animSpeed = [0, 0]

  ballX = NET_POSITION_X * 0.5
  ballY = STANDARD_BALL_HEIGHT
  ballVX = 0
  ballVY = 0
  ballRot = 0
  ballAngVel = STANDARD_BALL_ANGULAR_VELOCITY

  charge = [0, 0]
  stun = [0, 0]
  knock = [0, 0]
  prevUp = [0, 0]
  prevSpecial = [0, 0]
  prevPush = [0, 0]
  pushCd = [0, 0]
  superFrames = 0
  superOwner = -1
  parryActive = [0, 0]
  parryCd = [0, 0]
  parryChain = 0
  scores = [0, 0]

  crouch = [0, 0]
  prevDown = [0, 0]
  spikeHold = [0, 0]
  spikeFrames = [0, 0]
  spikePow = [0, 0]
  digCd = [0, 0]
  digActive = [0, 0]

  blobHitGround(p: Side) { return this.blobY[p] >= GROUND_PLANE_HEIGHT }

  /** Agachado a esfera de cima afunda e encolhe, a de baixo espalha. */
  upperY(p: Side) { return this.blobY[p] - BLOBBY_UPPER_SPHERE + this.crouch[p] * CROUCH_DUCK }
  upperR(p: Side) { return BLOBBY_UPPER_RADIUS - this.crouch[p] * CROUCH_SLIM }
  lowerR(p: Side) { return BLOBBY_LOWER_RADIUS + this.crouch[p] * CROUCH_SPREAD }
  spikeK(p: Side) {
    return Math.max(0, Math.min(1, (this.spikePow[p] - SPIKE_MIN_HOLD) / (SPIKE_MAX_HOLD - SPIKE_MIN_HOLD)))
  }

  /** Quem está perdendo enche mais rápido — é a chance de virar o jogo. */
  private comeback(p: Side) {
    const diff = this.scores[p === LEFT ? RIGHT : LEFT] - this.scores[p]
    const m = 1 + diff * SPECIAL_COMEBACK_STEP
    return Math.max(SPECIAL_COMEBACK_MIN, Math.min(SPECIAL_COMEBACK_MAX, m))
  }

  private addCharge(p: Side, amount: number, out: MatchEvent[]) {
    if (this.charge[p] >= SPECIAL_FULL) return
    this.charge[p] += amount * this.comeback(p)
    if (this.charge[p] >= SPECIAL_FULL) {
      this.charge[p] = SPECIAL_FULL
      out.push({ event: Ev.SPECIAL_READY, side: p, intensity: 1 })
    }
  }

  /** Ruído determinístico do estado: os dois peers calculam o mesmo valor. */
  private noise(p: Side, salt: number) {
    let h = Math.imul(Math.round(this.ballX * 32) ^ 0x9e3779b9, 2246822519)
    h = Math.imul(h ^ Math.round(this.ballY * 32), 3266489917)
    h = Math.imul(h ^ Math.round(this.blobX[p] * 32), 668265263)
    h = Math.imul(h ^ Math.round(this.blobY[p] * 32), 374761393)
    h = Math.imul(h ^ (p + 1) ^ Math.imul(salt + 1, 2654435761), 2246822519)
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296
  }

  /** A bola do especial pesa mais: é o que a faz cair no campo do outro em vez de planar. */
  private ballG() {
    return this.superFrames > 0 ? BALL_GRAVITATION * SPECIAL_GRAVITY_MUL : BALL_GRAVITATION
  }

  /** A parábola passa por cima da rede em toda a faixa de colisão dela? */
  private clearsNet(vx: number, vy: number, g: number, clearance: number) {
    const band = BALL_RADIUS + NET_RADIUS + 4
    const ceiling = NET_SPHERE_POSITION - clearance
    for (let k = -1; k <= 1; k++) {
      const t = (NET_POSITION_X + k * band - this.ballX) / vx
      if (t <= 0) continue
      if (this.ballY + vy * t + 0.5 * g * t * t > ceiling) return false
    }
    return true
  }

  /**
   * Mira do especial: alvo fundo no campo adversário, e o menor tempo de voo que
   * ainda passa da rede dentro do teto de velocidade. Menor tempo = bola mais rápida.
   */
  private aimSpecial(p: Side, boost = 1) {
    const dir = p === LEFT ? 1 : -1
    const ty = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
    const depth = SPECIAL_TARGET_DEPTH + (this.noise(p, 0) - 0.5) * SPECIAL_DEPTH_JITTER
    const tx = p === LEFT
      ? NET_POSITION_X + (RIGHT_PLANE - NET_POSITION_X) * depth
      : NET_POSITION_X - (NET_POSITION_X - LEFT_PLANE) * depth
    const vmax = SPECIAL_VELOCITY * boost

    if (dir * (tx - this.ballX) < 60) {
      this.ballVX = dir * vmax * 0.25
      this.ballVY = vmax * 0.97
      return
    }

    const max2 = vmax * vmax
    const g = BALL_GRAVITATION * SPECIAL_GRAVITY_MUL
    const skip = Math.floor(this.noise(p, 1) * SPECIAL_ARC_JITTER)
    let seen = 0
    let fx = 0, fy = 0, got = false
    for (let i = 0; i < SPECIAL_TIME_STEPS; i++) {
      const t = SPECIAL_TIME_MIN + i * SPECIAL_TIME_STEP
      const vx = (tx - this.ballX) / t
      const vy = (ty - this.ballY) / t - 0.5 * g * t
      if (vx * vx + vy * vy > max2) continue
      if (!this.clearsNet(vx, vy, g, SPECIAL_NET_CLEARANCE)) continue
      if (!got) { fx = vx; fy = vy; got = true }
      if (seen++ < skip) continue
      this.ballVX = vx
      this.ballVY = vy
      return
    }

    if (got) { this.ballVX = fx; this.ballVY = fy; return }
    this.ballVX = dir * vmax * 0.5
    this.ballVY = -vmax * 0.866
  }

  /**
   * Mira dos golpes de agachar: alvo no chão do outro lado e o primeiro tempo de
   * voo que passa da rede dentro do teto de velocidade. Gravidade é a normal — a
   * pesada é privilégio do especial. Manchete pede tempo longo (arco alto e
   * lento), cortada pede tempo curto (linha rápida); só mudam os números.
   */
  private aimShot(p: Side, vmax: number, vmin: number, depth: number, clearance: number,
                  tMin: number, tStep: number, tSteps: number, salt: number) {
    const dir = p === LEFT ? 1 : -1
    const g = BALL_GRAVITATION
    const ty = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
    const jit = (this.noise(p, salt) - 0.5) * 0.2
    const max2 = vmax * vmax
    let bx = 0, by = 0, best = -1

    // Perto da rede o único arco que passa é lento — mais lento que um toque
    // normal, o que faria cortar valer menos que não cortar. Antes de aceitar
    // isso, mira mais fundo: alvo longe exige bola rápida.
    for (let d = 0; d < 3; d++) {
      const dd = Math.min(0.94, depth + jit + d * 0.16)
      const tx = p === LEFT
        ? NET_POSITION_X + (RIGHT_PLANE - NET_POSITION_X) * dd
        : NET_POSITION_X - (NET_POSITION_X - LEFT_PLANE) * dd
      if (dir * (tx - this.ballX) < 40) continue
      for (let i = 0; i < tSteps; i++) {
        const t = tMin + i * tStep
        const vx = (tx - this.ballX) / t
        const vy = (ty - this.ballY) / t - 0.5 * g * t
        const v2 = vx * vx + vy * vy
        if (v2 > max2) continue
        if (!this.clearsNet(vx, vy, g, clearance)) continue
        if (v2 > best) { best = v2; bx = vx; by = vy }
        break
      }
      if (best >= vmin * vmin) break
    }

    if (best >= 0) { this.ballVX = bx; this.ballVY = by; return }

    // daqui nada passa da rede: levanta a bola no próprio campo e segue o rally
    this.ballVX = dir * BALL_COLLISION_VELOCITY * 0.4
    this.ballVY = -BALL_COLLISION_VELOCITY * 0.78
  }

  /**
   * Agachar, manchete e cortada saem do mesmo botão: tocar arma a manchete,
   * segurar no chão carrega o salto de ataque, soltar dispara.
   */
  private tryCrouch(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    const ground = this.blobHitGround(p)
    if (this.spikeFrames[p] > 0 && ground && this.blobVY[p] >= 0) this.spikeFrames[p] = 0

    const held = raw.down && this.stun[p] <= 0
    if (held) this.crouch[p] = Math.min(1, this.crouch[p] + (ground ? CROUCH_RATE : CROUCH_RATE_AIR))
    else this.crouch[p] = Math.max(0, this.crouch[p] - CROUCH_RELEASE)

    if (held && ground) {
      if (this.spikeHold[p] < SPIKE_MAX_HOLD) this.spikeHold[p]++
    } else if (held) {
      // saiu do chão segurando: a carga não viaja pelo ar
      this.spikeHold[p] = 0
    } else {
      const pow = this.spikeHold[p]
      this.spikeHold[p] = 0
      if (pow >= SPIKE_MIN_HOLD && ground && this.stun[p] <= 0) {
        this.spikePow[p] = pow
        this.blobVY[p] = BLOBBY_JUMP_ACCELERATION * (1 + SPIKE_JUMP_BOOST * this.spikeK(p))
        this.spikeFrames[p] = SPIKE_WINDOW
        this.startAnim(p)
        out.push({ event: Ev.SPIKE_LEAP, side: p, intensity: this.spikeK(p) })
      }
    }

    if (raw.down && this.prevDown[p] === 0 && this.stun[p] <= 0 && this.digCd[p] === 0) {
      this.digActive[p] = DIG_WINDOW
      this.digCd[p] = DIG_CD
    }
  }

  /** Manchete: bola perto e o botão apertado agora, devolve num arco alto e lento. */
  private tryDig(p: Side, out: MatchEvent[]) {
    if (this.digActive[p] <= 0 || this.stun[p] > 0) return false
    // especial na área é problema do parry, não da manchete
    if (this.superFrames > 0) return false
    const cy = this.blobY[p] + BLOBBY_LOWER_SPHERE
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - cy
    const d2 = dx * dx + dy * dy
    if (d2 > DIG_REACH * DIG_REACH) return false

    this.digActive[p] = 0
    this.digCd[p] = DIG_CD
    this.aimShot(p, DIG_VELOCITY, 0, DIG_TARGET_DEPTH, DIG_NET_CLEARANCE,
      DIG_TIME_MIN, DIG_TIME_STEP, DIG_TIME_STEPS, 2)
    this.pushOut(p, cy, dx, dy, Math.sqrt(d2), this.lowerR(p))
    this.addCharge(p, DIG_GAIN, out)
    out.push({ event: Ev.DIG, side: p, intensity: 1 })
    return true
  }

  /** Golpe que não é reflexão precisa tirar a bola de dentro do corpo na mão. */
  private pushOut(p: Side, cy: number, dx: number, dy: number, l: number, r: number) {
    const need = BALL_RADIUS + r + 2
    if (l >= need) return
    const k = l || 1
    this.ballX = this.blobX[p] + (dx / k) * need
    this.ballY = cy + (dy / k) * need
  }

  /** Empurrão: encostou perto do adversário e apertou, ele voa pra trás. */
  private tryPush(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (!raw.push || this.prevPush[p] !== 0) return
    if (this.pushCd[p] > 0 || this.stun[p] > 0) return
    this.pushCd[p] = PUSH_CD
    const o: Side = p === LEFT ? RIGHT : LEFT
    const dx = this.blobX[o] - this.blobX[p]
    const dy = this.blobY[o] - this.blobY[p]
    if (Math.abs(dx) > PUSH_REACH_X || Math.abs(dy) > PUSH_REACH_Y) {
      out.push({ event: Ev.PUSH, side: p, intensity: 0 })
      return
    }
    this.knock[o] += (p === LEFT ? 1 : -1) * PUSH_FORCE
    if (this.blobVY[o] > PUSH_POP) this.blobVY[o] = PUSH_POP
    out.push({ event: Ev.PUSH_HIT, side: p, intensity: 1 })
  }

  /** Barra cheia e bola por perto: pulo de novo no ar, ou a tecla de especial. */
  private trySpecial(p: Side, raw: PlayerInput, isBallValid: boolean, wasGround: boolean, out: MatchEvent[]) {
    if (!isBallValid || this.stun[p] > 0) return
    if (this.superFrames > 0 && this.superOwner !== p) return
    if (this.charge[p] < SPECIAL_FULL) return
    const pressed = (raw.up && this.prevUp[p] === 0) || (raw.special && this.prevSpecial[p] === 0)
    if (!pressed) return
    if (wasGround) return

    const nx = this.ballX - this.blobX[p]
    const ny = this.ballY - this.upperY(p)
    if (Math.sqrt(nx * nx + ny * ny) > SPECIAL_REACH) return

    this.charge[p] = 0
    this.aimSpecial(p)
    this.superFrames = SPECIAL_BALL_FRAMES
    this.superOwner = p
    out.push({ event: Ev.SPECIAL_FIRED, side: p, intensity: 1 })
  }

  /** Especial vindo em cima: apertar pra cima na hora certa devolve a bola mais forte. */
  private tryParry(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (this.stun[p] > 0) return
    if (this.superFrames <= 0 || this.superOwner === p) return
    const pressed = (raw.up && this.prevUp[p] === 0) || (raw.special && this.prevSpecial[p] === 0)
    if (pressed && this.parryCd[p] === 0 && this.parryActive[p] === 0) {
      this.parryActive[p] = PARRY_ACTIVE
      this.parryCd[p] = PARRY_CD
      out.push({ event: Ev.PARRY_TRY, side: p, intensity: 0 })
    }
    if (this.parryActive[p] <= 0) return
    const closing = p === LEFT ? this.ballVX < 0 : this.ballVX > 0
    if (!closing) return
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - this.upperY(p)
    if (dx * dx + dy * dy > PARRY_REACH * PARRY_REACH) return
    this.parryActive[p] = 0
    this.parryCd[p] = 0
    this.parryChain = Math.min(this.parryChain + 1, PARRY_CHAIN_MAX)
    this.superOwner = p
    this.superFrames = SPECIAL_BALL_FRAMES
    this.aimSpecial(p, 1 + this.parryChain * PARRY_BOOST)
    this.addCharge(p, SPECIAL_GAIN_TOUCH, out)
    out.push({ event: Ev.PARRY, side: p, intensity: 1 })
  }

  private topBallCollision(p: Side) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - this.upperY(p)
    const r = BALL_RADIUS + this.upperR(p)
    return dx * dx + dy * dy < r * r
  }

  private bottomBallCollision(p: Side) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - (this.blobY[p] + BLOBBY_LOWER_SPHERE)
    const r = BALL_RADIUS + this.lowerR(p)
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
    const ground = this.blobHitGround(p)
    let g = GRAVITATION
    if (input.up && !input.down) {
      if (ground && this.spikeFrames[p] === 0) { this.blobVY[p] = BLOBBY_JUMP_ACCELERATION; this.startAnim(p) }
      g -= BLOBBY_JUMP_BUFFER
    }
    // no ar, pra baixo é queda rápida
    if (!ground && input.down) g += GRAVITATION * CROUCH_FALL_MUL
    if ((input.left || input.right) && ground) this.startAnim(p)

    const slow = 1 - this.crouch[p] * (1 - CROUCH_SPEED_MUL)
    this.blobVX[p] = ((input.right ? BLOBBY_SPEED : 0) - (input.left ? BLOBBY_SPEED : 0)) * slow

    this.blobX[p] += this.blobVX[p] + this.knock[p]
    if (this.knock[p] !== 0) {
      this.knock[p] *= KNOCK_DECAY
      if (Math.abs(this.knock[p]) < 0.05) this.knock[p] = 0
    }
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
    let cy = this.blobY[p] + BLOBBY_LOWER_SPHERE
    let cr = this.lowerR(p)
    if (!this.bottomBallCollision(p)) {
      if (!this.topBallCollision(p)) return false
      cy = this.upperY(p)
      cr = this.upperR(p)
    }

    // quem soltou o especial não reencosta na bola enquanto ela sai de perto
    if (this.superOwner === p && this.superFrames > SPECIAL_BALL_FRAMES - 12) return false

    // cortada: janela do salto carregado manda a bola no lugar em vez de refletir
    if (this.spikeFrames[p] > 0 && this.superFrames === 0) {
      const k = this.spikeK(p)
      this.spikeFrames[p] = 0
      const dx = this.ballX - this.blobX[p]
      const dy = this.ballY - cy
      this.aimShot(p, SPIKE_VELOCITY * (SPIKE_WEAK + (1 - SPIKE_WEAK) * k),
        BALL_COLLISION_VELOCITY * (SPIKE_FLOOR + SPIKE_FLOOR_GAIN * k), SPIKE_TARGET_DEPTH,
        SPIKE_NET_CLEARANCE, SPIKE_TIME_MIN, SPIKE_TIME_STEP, SPIKE_TIME_STEPS, 3)
      this.pushOut(p, cy, dx, dy, Math.sqrt(dx * dx + dy * dy), cr)
      this.addCharge(p, SPIKE_GAIN, out)
      out.push({ event: Ev.SPIKE_HIT, side: p, intensity: 0.55 + k * 0.45 })
      return true
    }

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
        this.knock[p] = (p === LEFT ? -1 : 1) * SPECIAL_KNOCKBACK
        this.blobVY[p] = SPECIAL_POP
        out.push({ event: Ev.SPECIAL_HIT, side: p, intensity: 1 })
      }
      this.superFrames = 0
      this.superOwner = -1
      this.parryChain = 0
    }
    return true
  }

  private handleBallWorldCollisions(out: MatchEvent[]) {
    if (this.ballY + BALL_RADIUS > GROUND_PLANE_HEIGHT_MAX) {
      if (this.superFrames > 0) {
        this.superFrames = 0
        this.superOwner = -1
        this.parryChain = 0
        out.push({ event: Ev.SPECIAL_GROUND, side: this.ballX > NET_POSITION_X ? RIGHT : LEFT, intensity: 1 })
      }
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
    if (this.superFrames > 0 && --this.superFrames === 0) { this.superOwner = -1; this.parryChain = 0 }
    if (this.pushCd[LEFT] > 0) this.pushCd[LEFT]--
    if (this.pushCd[RIGHT] > 0) this.pushCd[RIGHT]--
    if (this.parryActive[LEFT] > 0) this.parryActive[LEFT]--
    if (this.parryActive[RIGHT] > 0) this.parryActive[RIGHT]--
    if (this.parryCd[LEFT] > 0) this.parryCd[LEFT]--
    if (this.parryCd[RIGHT] > 0) this.parryCd[RIGHT]--
    if (this.digCd[LEFT] > 0) this.digCd[LEFT]--
    if (this.digCd[RIGHT] > 0) this.digCd[RIGHT]--
    if (this.digActive[LEFT] > 0) this.digActive[LEFT]--
    if (this.digActive[RIGHT] > 0) this.digActive[RIGHT]--
    if (this.spikeFrames[LEFT] > 0) this.spikeFrames[LEFT]--
    if (this.spikeFrames[RIGHT] > 0) this.spikeFrames[RIGHT]--

    const el = this.stun[LEFT] > 0 ? NO_INPUT : li
    const er = this.stun[RIGHT] > 0 ? NO_INPUT : ri
    const groundL = this.blobHitGround(LEFT)
    const groundR = this.blobHitGround(RIGHT)

    this.tryCrouch(LEFT, li, out)
    this.tryCrouch(RIGHT, ri, out)
    this.handleBlob(LEFT, el)
    this.handleBlob(RIGHT, er)

    if (isGameRunning) {
      const g = this.ballG()
      this.ballX += this.ballVX
      this.ballY += 0.5 * g + this.ballVY
      this.ballVY += g
      this.addCharge(LEFT, SPECIAL_GAIN_FRAME, out)
      this.addCharge(RIGHT, SPECIAL_GAIN_FRAME, out)
    }

    if (isBallValid) {
      this.tryParry(LEFT, li, out)
      this.tryParry(RIGHT, ri, out)
      if (!this.tryDig(LEFT, out)) this.handleBlobBallCollision(LEFT, out)
      if (!this.tryDig(RIGHT, out)) this.handleBlobBallCollision(RIGHT, out)
    }

    this.trySpecial(LEFT, li, isBallValid, groundL, out)
    this.trySpecial(RIGHT, ri, isBallValid, groundR, out)
    this.tryPush(LEFT, li, out)
    this.tryPush(RIGHT, ri, out)
    this.prevUp[LEFT] = li.up ? 1 : 0
    this.prevUp[RIGHT] = ri.up ? 1 : 0
    this.prevSpecial[LEFT] = li.special ? 1 : 0
    this.prevSpecial[RIGHT] = ri.special ? 1 : 0
    this.prevPush[LEFT] = li.push ? 1 : 0
    this.prevPush[RIGHT] = ri.push ? 1 : 0
    this.prevDown[LEFT] = li.down ? 1 : 0
    this.prevDown[RIGHT] = ri.down ? 1 : 0

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
    if (side === LEFT) { this.ballX = NET_POSITION_X * 0.5; this.ballY = STANDARD_BALL_HEIGHT }
    else if (side === RIGHT) { this.ballX = NET_POSITION_X * 1.5; this.ballY = STANDARD_BALL_HEIGHT }
    else { this.ballX = NET_POSITION_X; this.ballY = 450 }
    this.ballVX = 0; this.ballVY = 0
    this.ballAngVel = (side === RIGHT ? -1 : 1) * STANDARD_BALL_ANGULAR_VELOCITY
    this.superFrames = 0
    this.superOwner = -1
    this.parryChain = 0
    this.parryActive[LEFT] = 0; this.parryActive[RIGHT] = 0
    this.parryCd[LEFT] = 0; this.parryCd[RIGHT] = 0
    this.stun[LEFT] = 0; this.stun[RIGHT] = 0
    this.digActive[LEFT] = 0; this.digActive[RIGHT] = 0
    this.digCd[LEFT] = 0; this.digCd[RIGHT] = 0
    this.spikeFrames[LEFT] = 0; this.spikeFrames[RIGHT] = 0
    this.spikeHold[LEFT] = 0; this.spikeHold[RIGHT] = 0
  }
}
