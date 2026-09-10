import {
  BALL_COLLISION_VELOCITY, BALL_GRAVITATION, BALL_RADIUS, BLOBBY_JUMP_ACCELERATION,
  BLOBBY_JUMP_BUFFER, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_SPEED,
  BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE, DIG_REACH, GRAVITATION, GROUND_PLANE_HEIGHT,
  GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, NET_RADIUS, NET_SPHERE_POSITION,
  AIM_DIRS, AIM_STEPS, HAND_MIN_SPEED, HAND_REACH, PARRY_REACH, RIGHT_PLANE, SPECIAL_FULL,
  SPECIAL_GRAVITY_MUL, SPECIAL_REACH, SPIKE_MAX_HOLD, SPIKE_MIN_HOLD, other,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { aimBits } from '../core/input.ts'
import type { PlayerInput } from '../core/input.ts'
import type { Match } from '../core/match.ts'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane'

interface Params {
  /** frames entre replanejamentos: quanto maior, mais tarde o bot corrige o rumo */
  reaction: number
  /** até onde enxerga a trajetória; horizonte curto só reage com a bola já perto */
  horizon: number
  /** ruído em px no ponto de apoio */
  aimErr: number
  /** ruído na nota do tiro: alto = escolhe devolução pior de propósito */
  shotErr: number
  /** fração dos frames em que realmente anda */
  speed: number
  /** apetite por ataque aéreo, especial e cortada */
  attack: number
  /** chance de tentar o parry dentro da janela */
  parry: number
  /** quantos pontos de apoio testa por contato: mais = mira mais fina */
  offsets: number
  /** folga exigida por cima da rede; pequena = bola mais esticada e mais arriscada */
  clear: number
  /** frames de deslocamento do adversário que antecipa */
  foeLead: number
}

const PARAMS: Record<Difficulty, Params> = {
  easy: {
    reaction: 12, horizon: 30, aimErr: 42, shotErr: 0.8, speed: 0.7,
    attack: 0.05, parry: 0.1, offsets: 6, clear: 30, foeLead: 0,
  },
  normal: {
    reaction: 6, horizon: 62, aimErr: 22, shotErr: 0.42, speed: 0.92,
    attack: 0.32, parry: 0.34, offsets: 9, clear: 26, foeLead: 0,
  },
  hard: {
    reaction: 3, horizon: 125, aimErr: 8, shotErr: 0.12, speed: 1,
    attack: 0.72, parry: 0.66, offsets: 14, clear: 22, foeLead: 5,
  },
  insane: {
    reaction: 1, horizon: 200, aimErr: 0, shotErr: 0, speed: 1,
    attack: 1, parry: 0.94, offsets: 22, clear: 18, foeLead: 10,
  },
}

const HORIZON = 200
const px = new Float64Array(HORIZON + 2)
const py = new Float64Array(HORIZON + 2)
const ay = new Float64Array(HORIZON + 2)

const LOWER_REACH = BALL_RADIUS + BLOBBY_LOWER_RADIUS
const UPPER_REACH = BALL_RADIUS + BLOBBY_UPPER_RADIUS
const GROUND_BALL_Y = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
const NET_TOP_Y = NET_SPHERE_POSITION - BALL_RADIUS - NET_RADIUS

/** Altura do blob a cada frame de um pulo com o botão segurado. */
const JUMP: number[] = (() => {
  const a: number[] = []
  const g = GRAVITATION - BLOBBY_JUMP_BUFFER
  let y = GROUND_PLANE_HEIGHT
  let vy = BLOBBY_JUMP_ACCELERATION
  for (let i = 0; i < 90; i++) {
    y += 0.5 * g + vy
    vy += g
    if (y >= GROUND_PLANE_HEIGHT) break
    a.push(y)
  }
  return a
})()

/** Trajetória da bola com paredes, rede e gravidade — sem os blobs. */
function simulate(match: Match, horizon: number): number {
  const w = match.world
  const running = match.logic.isGameRunning
  const n = Math.min(horizon, HORIZON)
  let x = w.ballX
  let y = w.ballY
  let vx = running ? w.ballVX : 0
  let vy = running ? w.ballVY : 0
  const g = !running ? 0
    : w.superFrames > 0 ? BALL_GRAVITATION * SPECIAL_GRAVITY_MUL : BALL_GRAVITATION

  for (let t = 1; t <= n; t++) {
    x += vx
    y += 0.5 * g + vy
    vy += g

    if (x - BALL_RADIUS <= LEFT_PLANE && vx < 0) { vx = -vx; x = LEFT_PLANE + BALL_RADIUS }
    else if (x + BALL_RADIUS >= RIGHT_PLANE && vx > 0) { vx = -vx; x = RIGHT_PLANE - BALL_RADIUS }
    else if (y > NET_SPHERE_POSITION && Math.abs(x - NET_POSITION_X) < BALL_RADIUS + NET_RADIUS) {
      const right = x - NET_POSITION_X > 0
      vx = -vx
      x = NET_POSITION_X + (right ? BALL_RADIUS + NET_RADIUS : -(BALL_RADIUS + NET_RADIUS))
    }

    px[t] = x
    py[t] = y
    if (y >= GROUND_BALL_Y) return t
  }
  return n
}

/** Quique na parede é espelho: dobra o x de queda de volta pra dentro da quadra. */
function foldX(x: number) {
  const lo = LEFT_PLANE + BALL_RADIUS
  const span = RIGHT_PLANE - BALL_RADIUS - lo
  if (span <= 0) return lo
  let u = x - lo
  u -= 2 * span * Math.floor(u / (2 * span))
  if (u > span) u = 2 * span - u
  return lo + u
}

const N = { x: 0, y: 0 }

/** Mesma prioridade da física: a esfera de baixo colide antes da de cima. */
function contactNormal(bx: number, by: number, ballx: number, bally: number) {
  const dx = ballx - bx
  let dy = bally - (by + BLOBBY_LOWER_SPHERE)
  let d = Math.sqrt(dx * dx + dy * dy)
  if (d >= LOWER_REACH) {
    dy = bally - (by - BLOBBY_UPPER_SPHERE)
    d = Math.sqrt(dx * dx + dy * dy)
    if (d >= UPPER_REACH) return false
  }
  if (d < 2) return false
  N.x = dx / d
  N.y = dy / d
  return true
}

const CTX = { dir: 1, foeX: 0, clear: 24 }

/**
 * Nota da devolução. O que decide um ponto é a bola cair onde o adversário não
 * chega a tempo, então a conta principal é a distância de queda menos o quanto
 * ele corre durante o voo. Levantar pra si mesmo vale uma nota média: perde de
 * um ataque bom, ganha de uma devolução ruim.
 */
function shotScore(x0: number, y0: number, vx: number, vy: number) {
  const g = BALL_GRAVITATION
  const disc = vy * vy + 2 * g * (GROUND_BALL_Y - y0)
  if (disc <= 0) return -900
  const tf = (-vy + Math.sqrt(disc)) / g
  if (tf <= 0) return -900

  const dir = CTX.dir
  if (dir * vx > 0) {
    const tn = (NET_POSITION_X - x0) / vx
    if (tn > 0 && tn < tf) {
      const yn = y0 + vy * tn + 0.5 * g * tn * tn
      if (yn > NET_TOP_Y - CTX.clear) return -900 + yn * -0.01
    }
  }

  const raw = x0 + vx * tf
  const land = foldX(raw)
  // bola que bate na parede antes de cair volta pro outro lado no cálculo mas
  // não na prática: sem esse corte o bot escolhe tiro pra trás achando que cruza
  const bounced = Math.abs(land - raw) > 0.5
  if (dir * vx <= 0 && bounced) return -700
  if (dir * (land - NET_POSITION_X) > 30) {
    const gap = Math.abs(land - CTX.foeX) - BLOBBY_SPEED * tf
    return gap * 2.2 + Math.abs(land - NET_POSITION_X) * 0.3 - tf * 0.2 - (bounced ? 45 : 0)
  }

  return -700
}

interface Plan {
  standX: number
  hitT: number
  jumpAt: number
  dig: boolean
  score: number
}

export class Bot {
  side: Side
  diff: Difficulty
  private rng: () => number
  private cool = 0
  private aim = 0
  private plan: Plan = { standX: NET_POSITION_X, hitT: 999, jumpAt: -99, dig: false, score: 0 }
  private upHeld = false
  private spHeld = false
  private handHeld = false
  private handAim = -1
  private digLock = 0
  private spikeHold = 0

  constructor(side: Side, diff: Difficulty = 'normal', seed = 12345) {
    this.side = side
    this.diff = diff
    let s = seed >>> 0
    this.rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  }

  private get dir() { return this.side === LEFT ? 1 : -1 }

  private clampX(x: number) {
    const lo = this.side === LEFT ? LEFT_PLANE + 8 : NET_POSITION_X + NET_RADIUS + BLOBBY_LOWER_RADIUS + 2
    const hi = this.side === LEFT ? NET_POSITION_X - NET_RADIUS - BLOBBY_LOWER_RADIUS - 2 : RIGHT_PLANE - 8
    return Math.max(lo, Math.min(hi, x))
  }

  think(match: Match): PlayerInput {
    const p = PARAMS[this.diff]
    const w = match.world
    const g = match.logic
    const me = this.side
    const bx = w.blobX[me]
    const onGround = w.blobY[me] >= GROUND_PLANE_HEIGHT - 0.001

    if (this.digLock > 0) this.digLock--

    if (w.stun[me] > 0) {
      this.upHeld = false; this.spHeld = false; this.handHeld = false; this.spikeHold = 0
      return { left: false, right: false, up: false, special: false, hand: false, down: false, fine: 0 }
    }

    if (--this.cool <= 0) {
      this.cool = p.reaction
      this.aim = (this.rng() * 2 - 1) * p.aimErr
      this.replan(match, p)
    } else {
      this.plan.hitT--
      this.plan.jumpAt--
    }

    const down = this.wantDown(w, me, onGround, p)

    let target = this.clampX(this.plan.standX + this.aim)
    if (!g.isBallValid) target = this.clampX(NET_POSITION_X - this.dir * (RIGHT_PLANE * 0.24))
    const dx = target - bx
    let left = dx < -2.5
    let right = dx > 2.5
    if (this.rng() > p.speed) { left = false; right = false }

    let up = false
    if (!down && onGround && this.plan.jumpAt <= 0 && this.plan.jumpAt > -5) up = true
    if (!onGround && w.blobVY[me] < 0 && (this.upHeld || w.charge[me] < SPECIAL_FULL)) up = true
    this.upHeld = up

    const hand = this.wantHand(w, me, p)
    const special = !hand && this.wantSpecial(w, me, onGround, p)
    const out: PlayerInput = { left, right, up, special, hand, down, fine: 0 }
    // sem direção o especial usa o solver da física, que já mira melhor que o bot
    if (special) { out.left = false; out.right = false; out.up = false; out.down = false }
    // com a mão, os bits de direção viram mira: o pulo fica bloqueado mesmo
    if (hand && this.handAim >= 0) {
      const b = aimBits((-this.handAim / AIM_STEPS) * Math.PI * 2)
      out.left = b.left; out.right = b.right; out.up = b.up; out.down = b.down; out.fine = b.fine
    }
    return out
  }

  /** Quando apertar pra que a cabeça esteja na altura `want` no frame `t`. */
  private jumpFor(t: number, want: number, landIn: number) {
    if (landIn < 0) return -1
    const kmax = Math.min(JUMP.length - 1, t - landIn)
    let bk = -1
    let be = 1e9
    for (let k = 0; k <= kmax; k++) {
      const e = Math.abs(JUMP[k] - BLOBBY_UPPER_SPHERE - want)
      if (e < be) { be = e; bk = k }
    }
    if (bk < 0 || be > UPPER_REACH * 0.8) return -1
    return t - bk
  }

  private replan(match: Match, p: Params) {
    const w = match.world
    const me = this.side
    const foe = other(me)
    const dir = this.dir
    const n = simulate(match, p.horizon)

    // minha altura frame a frame se eu não fizer nada, e quando volto pro chão
    let landIn = w.blobY[me] >= GROUND_PLANE_HEIGHT - 0.001 ? 0 : -1
    {
      let y = w.blobY[me]
      let vy = w.blobVY[me]
      for (let t = 1; t <= n; t++) {
        const gg = vy < 0 ? GRAVITATION - BLOBBY_JUMP_BUFFER : GRAVITATION
        y += 0.5 * gg + vy
        vy += gg
        if (y >= GROUND_PLANE_HEIGHT) { y = GROUND_PLANE_HEIGHT; vy = 0; if (landIn < 0) landIn = t }
        ay[t] = y
      }
    }

    let t0 = -1
    let t1 = -1
    for (let t = 1; t <= n; t++) {
      if (dir * (px[t] - NET_POSITION_X) >= 0) continue
      if (py[t] < 120) continue
      if (t0 < 0) t0 = t
      t1 = t
    }

    if (t0 < 0) {
      // bola ainda é dele: cobre o campo de acordo com de onde ele vai bater
      const depth = 108 + Math.abs(w.blobX[foe] - NET_POSITION_X) * 0.42
      this.plan = { standX: NET_POSITION_X - dir * depth, hitT: 999, jumpAt: -99, dig: false, score: 0 }
      return
    }

    if (w.superFrames > 0 && w.superOwner !== me) {
      // especial na área: não é hora de devolver, é hora de ficar embaixo pro parry
      this.plan = {
        standX: this.clampX(px[t0]),
        hitT: t0,
        jumpAt: py[t0] < GROUND_PLANE_HEIGHT - 150 ? this.jumpFor(t0, py[t0], landIn) : -99,
        dig: false,
        score: 0,
      }
      return
    }

    CTX.dir = dir
    CTX.clear = p.clear
    CTX.foeX = w.blobX[foe] + w.blobVX[foe] * p.foeLead

    // instantes de pulo que colocam a cabeça na bola em algum ponto da janela
    const jumps: number[] = [-99]
    for (let t = t0; t <= t1; t += 3) {
      for (const want of [py[t] - UPPER_REACH * 0.4, py[t] + UPPER_REACH * 0.15]) {
        const j = this.jumpFor(t, want, landIn)
        if (j >= 0 && jumps.indexOf(j) < 0 && jumps.length < 11) jumps.push(j)
      }
    }

    const bx0 = w.blobX[me]
    const chargeReady = w.charge[me] >= SPECIAL_FULL
    const reach = BLOBBY_SPEED * t1
    const lo = this.clampX(bx0 - reach)
    const hi = this.clampX(bx0 + reach)

    let best = -1e9
    let bStand = this.clampX(px[t1])
    let bT = t1
    let bJump = -99
    let bGround = true
    let found = false

    // o frame do contato não é escolha minha: é quando a bola entra na esfera.
    // então o que se testa é onde parar e quando pular — o resto a física decide.
    const probe = (sx: number, j: number) => {
      const adx = Math.abs(sx - bx0)
      const sgn = sx < bx0 ? -1 : 1
      for (let t = Math.max(1, t0 - 2); t <= t1; t++) {
        const bxt = bx0 + sgn * Math.min(BLOBBY_SPEED * t, adx)
        let byt: number
        if (j >= 0 && t > j) {
          const k = t - j - 1
          byt = k < JUMP.length ? JUMP[k] : GROUND_PLANE_HEIGHT
        } else byt = landIn < 0 || t < landIn ? ay[t] : GROUND_PLANE_HEIGHT
        if (!contactNormal(bxt, byt, px[t], py[t])) continue
        const vx = N.x * BALL_COLLISION_VELOCITY
        const vy = N.y * BALL_COLLISION_VELOCITY
        let s = shotScore(px[t] + vx, py[t] + vy, vx, vy)
        if (chargeReady && byt < GROUND_PLANE_HEIGHT - 20) s += 90 * p.attack
        if (p.shotErr > 0) s += (this.rng() * 2 - 1) * p.shotErr * 120
        if (s > best) {
          best = s; bStand = sx; bT = t; bJump = j
          bGround = byt >= GROUND_PLANE_HEIGHT - 1
        }
        found = true
        return
      }
    }

    const coarse = Math.max(6, p.offsets)
    for (let i = 0; i <= coarse; i++) {
      const sx = lo + ((hi - lo) * i) / coarse
      for (const j of jumps) probe(sx, j)
    }
    // segunda passada fina em volta do melhor: 15px de erro no apoio já joga a
    // bola na rede, e é isso que decide quase todo ponto
    if (found && p.offsets > 8) {
      const c = bStand
      const js = jumps.slice()
      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue
        const sx = this.clampX(c + i * 5.5)
        for (const j of js) probe(sx, j)
      }
    }

    // nenhum toque normal resolve: a manchete devolve num arco alto que sempre cruza
    let dig = false
    if (bGround && best < -300) {
      const dxb = px[bT] - bStand
      const dyb = py[bT] - (GROUND_PLANE_HEIGHT + BLOBBY_LOWER_SPHERE)
      dig = dxb * dxb + dyb * dyb < DIG_REACH * DIG_REACH * 0.8
    }

    this.plan = { standX: bStand, hitT: bT, jumpAt: bJump, dig, score: best }
  }

  /**
   * Agachar cobre manchete e cortada. A manchete é um toque só, na chegada da
   * bola; a cortada é carga longa e só compensa quando sobra tempo de rally.
   */
  private wantDown(w: Match['world'], me: Side, onGround: boolean, p: Params) {
    if (w.superFrames > 0 && w.superOwner !== me) { this.spikeHold = 0; return false }

    if (this.spikeHold > 0) {
      this.spikeHold--
      if (this.plan.hitT <= 20 || !onGround) { this.spikeHold = 0; return false }
      return true
    }

    if (this.plan.dig && this.plan.hitT <= 3 && onGround && w.digCd[me] === 0 && this.digLock === 0) {
      this.digLock = 14
      return true
    }

    // a cortada mira sozinha e trava o deslocamento: só compensa quando a
    // devolução normal planejada já não valia grande coisa
    if (onGround && !this.plan.dig && this.plan.hitT > 48 && this.plan.hitT < 130 &&
        this.plan.score < 80 && Math.abs(this.plan.standX - w.blobX[me]) < 46 &&
        w.charge[me] < SPECIAL_FULL && this.rng() < p.attack * 0.05) {
      this.spikeHold = Math.min(SPIKE_MAX_HOLD, this.plan.hitT - 22)
      return this.spikeHold >= SPIKE_MIN_HOLD
    }
    return false
  }

  private wantSpecial(w: Match['world'], me: Side, onGround: boolean, p: Params) {
    if (w.superFrames > 0 && w.superOwner !== me) return this.wantParry(w, me, p)
    const mine = this.dir * (w.ballX - NET_POSITION_X) < 0
    if (!(w.charge[me] >= SPECIAL_FULL && !onGround && mine)) { this.spHeld = false; return false }
    const dx = w.ballX - w.blobX[me]
    const dy = w.ballY - (w.blobY[me] - BLOBBY_UPPER_SPHERE)
    const near = dx * dx + dy * dy < SPECIAL_REACH * SPECIAL_REACH * 0.5
    if (!(near && this.rng() < 0.3 + p.attack * 0.7)) { this.spHeld = false; return false }
    if (this.spHeld) return false
    this.spHeld = true
    return true
  }

  /** A janela do parry dura 5 frames e o erro custa 58 de recarga: aperta em cima da hora. */
  private wantParry(w: Match['world'], me: Side, p: Params) {
    if (w.parryCd[me] > 0 || w.parryActive[me] > 0) { this.spHeld = false; return false }
    const closing = me === LEFT ? w.ballVX < 0 : w.ballVX > 0
    if (!closing) { this.spHeld = false; return false }
    const dx = w.ballX - w.blobX[me]
    const dy = w.ballY - (w.blobY[me] - BLOBBY_UPPER_SPHERE)
    const d = Math.sqrt(dx * dx + dy * dy)
    const v = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
    if (!(d < PARRY_REACH + v * 2.5 && this.rng() < p.parry)) { this.spHeld = false; return false }
    if (this.spHeld) return false
    this.spHeld = true
    return true
  }

  /**
   * A mão só compensa na faixa em que a bola passa perto sem encostar: dentro
   * do alcance do toque normal ela é desperdício, fora do alcance é recarga
   * queimada e pé preso.
   */
  private wantHand(w: Match['world'], me: Side, p: Params) {
    const off = () => { this.handHeld = false; this.handAim = -1; return false }
    if (w.handCd[me] > 0 || w.stun[me] > 0) return off()
    if (w.superFrames > 0 && w.superOwner !== me) return off()
    if (!this.plan.dig && this.plan.hitT >= 0 && this.plan.hitT < 6) return off()
    const dx = w.ballX - w.blobX[me]
    const dy = w.ballY - (w.blobY[me] - BLOBBY_UPPER_SPHERE)
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > HAND_REACH - 10 || d < BALL_RADIUS + BLOBBY_UPPER_RADIUS + 6) return off()
    if (this.rng() > p.attack * 0.55) { this.handHeld = false; return false }
    if (this.handHeld) return false

    const foe = other(me)
    CTX.dir = this.dir
    CTX.clear = p.clear
    CTX.foeX = w.blobX[foe] + w.blobVX[foe] * p.foeLead
    const cur = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY) / w.tempo
    const sp = Math.max(HAND_MIN_SPEED, cur)
    let best = -1e9
    let bi = -1
    for (let i = 0; i < AIM_STEPS; i++) {
      const vx = AIM_DIRS[i * 2] * sp
      const vy = AIM_DIRS[i * 2 + 1] * sp
      const sc = shotScore(w.ballX + vx, w.ballY + vy, vx, vy)
      if (sc > best) { best = sc; bi = i }
    }
    if (bi < 0 || best < 0) return off()
    this.handAim = bi
    this.handHeld = true
    return true
  }
}
