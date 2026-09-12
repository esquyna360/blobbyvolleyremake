import {
  BALL_COLLISION_VELOCITY, BALL_GRAVITATION, BALL_RADIUS, BLOBBY_ANIMATION_SPEED,
  BLOBBY_JUMP_ACCELERATION, BLOBBY_JUMP_BUFFER, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE,
  BLOBBY_SPEED, BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE, GRAVITATION,
  GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, OPEN_MARGIN,
  NET_RADIUS, NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE, STANDARD_BALL_ANGULAR_VELOCITY,
  STANDARD_BALL_HEIGHT, SPECIAL_BALL_FRAMES, SPECIAL_CAP, SPECIAL_FULL, SPECIAL_GAIN_FRAME,
  SPECIAL_GAIN_TOUCH, SPECIAL_REACH, SPECIAL_VELOCITY, STUN_FRAMES,
  SPECIAL_KNOCKBACK, SPECIAL_POP, KNOCK_DECAY, SPECIAL_NET_CLEARANCE,
  SPECIAL_GRAVITY_MUL, DOUBLE_GRAVITY_MUL, SPECIAL_TARGET_DEPTH, SPECIAL_TIME_MIN, SPECIAL_TIME_STEP, SPECIAL_TIME_STEPS,
  TEMPO_MAX, TEMPO_STEP,
  SPIN_FROM_VX, SPIN_MAX, SPIN_DECAY, MAGNUS_K, SPIN_ROT, APEX_WINDOW, APEX_MUL, FALL_MUL,
  DIVE_SPEED, DIVE_HOP, DIVE_FRAMES, DIVE_RECOVER, DIVE_CD, DIVE_WIDE, CROUCH_WIDE,
  DIVE_SLIDE_KEEP, DIVE_SLIDE_DRAG, DIVE_SLIDE_STOP,
  DIVE_VELOCITY, DIVE_TARGET_DEPTH, DIVE_NET_CLEARANCE,
  DIVE_TIME_MIN, DIVE_TIME_STEP, DIVE_TIME_STEPS, DIVE_GAIN,
  SPECIAL_RALLY_HOT, SPECIAL_RALLY_MUL, SPECIAL_LEAK,
  SPECIAL_COMEBACK_STEP, SPECIAL_COMEBACK_MIN, SPECIAL_COMEBACK_MAX,
  SPECIAL_DEPTH_JITTER, SPECIAL_ARC_JITTER,
  PARRY_ACTIVE, PARRY_CD, PARRY_REACH, PARRY_BOOST, PARRY_CHAIN_MAX, PARRY_HOLD,
  CROUCH_RATE, CROUCH_RATE_AIR, CROUCH_RELEASE, CROUCH_DUCK, CROUCH_SLIM,
  CROUCH_SPREAD, CROUCH_SPEED_MUL, CROUCH_FALL_MUL,
  DIG_REACH, DIG_CD, DIG_WINDOW, DIG_GAIN, DIG_UP, DIG_FORWARD,
  HIT_REACH, HIT_CHARGE_MAX, HIT_TAP, HIT_V_MIN, HIT_V_MAX, HIT_LAG, HIT_GAIN,
  DROP_DEEP_VELOCITY, DROP_DEEP_DEPTH, DROP_DEEP_CLEARANCE, DROP_UP_CLEARANCE,
  SWING_WINDOW, FLOAT_KEEP, FLOAT_G, FLOAT_FRAMES, FLOAT_RAMP, FLOAT_DRAG, PARRY_RETURN,
  DROP_VELOCITY, DROP_TARGET_DEPTH, DROP_NET_CLEARANCE, DROP_TIME_MIN, DROP_TIME_STEP, DROP_TIME_STEPS,
  REVERSAL_ACTIVE, REVERSAL_CD, REVERSAL_BOOST, REVERSAL_SPIN, REVERSAL_ORBIT, REVERSAL_TURNS, REVERSAL_PARRY_ACTIVE,
} from './constants.ts'
import type { Side } from './constants.ts'
import { Ev } from './events.ts'
import type { MatchEvent } from './events.ts'
import { NO_INPUT } from './input.ts'
import type { PlayerInput } from './input.ts'
import { Mod, MOD_STACK, forbiddenWith, hasMod, modCount } from './mods.ts'

/** Deformação: mola sub-amortecida; a gelatina afrouxa tudo. */
const DEF_K = 0.26
const DEF_D = 0.34
const DEF_MIN = 0.35
const DEF_MAX = 1.6
const MELT_FRAMES = 80
const CHEER_FRAMES = 45
const WOBBLE_FRAMES = 32
const ROULETTE_WAIT = 110
const CHAOS_WAIT = 75
const NET_RISE_STEP = 14
const NET_RISE_MAX = 150
const SWELL_MAX = 6

/** Direção da batida a partir do direcional: sem nada é frente-cima, puro lado é quase reto. */
export function aimDir(p: Side, ax: number, ay: number): [number, number] {
  const dir = p === LEFT ? 1 : -1
  let x: number, y: number
  if (ax === 0 && ay === 0) { x = dir; y = -0.55 }
  else if (ay === 0) { x = ax; y = -0.18 }
  else if (ax === 0) { x = dir * 0.16; y = ay < 0 ? -1 : 0.8 }
  else { x = ax; y = ay < 0 ? -0.75 : 0.7 }
  const l = Math.hypot(x, y)
  return [x / l, y / l]
}

/** Blob travado na carga: só o botão de bater segue vivo. */
const LOCKED: PlayerInput = { ...NO_INPUT, hit: true }

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
  /** Rotação da bola. Positivo = curva pra direita/pra baixo no voo. */
  ballSpin = 0
  diveFrames = [0, 0]
  diveDir = [0, 0]
  diveCd = [0, 0]
  diveRecover = [0, 0]
  prevDive = [0, 0]
  /** Espelho do rally da lógica: a barra carrega mais rápido em troca longa. */
  rally = 0
  /** Escala de tempo do rally: 1 no saque, sobe a cada toque até TEMPO_MAX. */
  tempo = 1
  superFrames = 0
  superOwner = -1
  parryActive = [0, 0]
  parryCd = [0, 0]
  parryChain = 0
  hold = [0, 0]
  scores = [0, 0]

  crouch = [0, 0]
  prevDown = [0, 0]
  digCd = [0, 0]
  digActive = [0, 0]

  /** Batida: frames segurando (0 = solto), mira do direcional, recuperação. */
  hitCharge = [0, 0]
  hitAimX = [0, 0]
  hitAimY = [0, 0]
  hitLag = [0, 0]
  /** Frames após a batida em que a bola atravessa o corpo de quem bateu enquanto se afasta. */
  hitPass = [0, 0]
  prevHit = [0, 0]
  swingT = [0, 0]
  /** double special: a bola dá uma volta no corpo antes de sair */
  revSpin = [0, 0]
  /** 1 quando o especial em voo nasceu de um double special */
  superKind = 0
  swingPow = [0, 0]
  armSpecial = [0, 0]
  revActive = [0, 0]
  revCd = [0, 0]

  /**
   * Paredes laterais. Ligadas, a bola quica e o rally continua. Desligadas, a
   * quadra fica aberta e sair pelo lado é ponto de quem não tocou por último.
   */
  walls = true

  /**
   * Minigame de mira: o lado direito é cenário. Sem isso um blob invisível
   * rebate a bola no meio do campo vazio.
   */
  solo = false
  /** Trava pra não pontuar duas vezes na mesma bola fora. */
  ballOut = 0

  matchPoint = false

  /** Modificadores: máscara ativa agora, modo, base escolhida/acumulada, semente, espera pro saque, sorteio pendente. */
  mods = 0
  modMode = 0
  modBase = 0
  modSeed = 0
  modWait = 0
  modPick = -1
  netRise = 0
  swell = [0, 0]
  windX = 0
  ball2On = 0
  ball2X = 0
  ball2Y = 0
  ball2VX = 0
  ball2VY = 0
  wobble = [0, 0]

  /**
   * Forma do blob, na simulação. 1 = neutro; X e Y são escalas. `dent` é o
   * afundamento local no ponto do toque. O render só pixeliza isto.
   */
  defX = [1, 1]
  defY = [1, 1]
  defVX = [0, 0]
  defVY = [0, 0]
  dentX = [0, 0]
  dentY = [0, 0]
  dentK = [0, 0]
  melt = [0, 0]
  cheer = [0, 0]
  antic = [0, 0]

  get wallsOn() { return this.walls }

  has(m: Mod) { return hasMod(this.mods, m) }
  /** Força do efeito: sozinho vale cheio; empilhado, o valor próprio de pilha. */
  k(m: Mod) { return this.has(m) ? (modCount(this.mods) > 1 ? MOD_STACK[m] : 1) : 0 }
  private lerp1(k: number, to: number) { return 1 + (to - 1) * k }

  gBlob() { return GRAVITATION * this.lerp1(this.k(Mod.LUNAR), 0.42) }
  gBallBase() {
    return BALL_GRAVITATION * this.lerp1(this.k(Mod.LUNAR), 0.42)
      * this.lerp1(this.k(Mod.BOWLING), 1.9) * this.lerp1(this.k(Mod.BALLOON), 0.4)
  }
  ballR() { return BALL_RADIUS * this.lerp1(this.k(Mod.BALLOON), 1.3) }
  netTop() { return NET_SPHERE_POSITION - this.netRise }
  size(p: Side) { return 1 + this.swell[p] * 0.11 * this.lerp1(this.k(Mod.SWELL), 1) }
  groundY(p: Side) { return GROUND_PLANE_HEIGHT - (this.size(p) - 1) * (BLOBBY_LOWER_SPHERE + BLOBBY_LOWER_RADIUS) }
  speedMul(p: Side) {
    const w = this.wobble[p] > 0 ? 0.45 + 0.55 * (1 - this.wobble[p] / WOBBLE_FRAMES) : 1
    return (1 - this.swell[p] * 0.07) * w
  }
  jumpMul(p: Side) { return (1 - this.swell[p] * 0.05) * (this.wobble[p] > 0 ? 0.85 : 1) }

  /** Configura os modificadores antes do primeiro saque. Só aqui e no resetBall a máscara muda. */
  setMods(mode: number, base: number, seed: number) {
    this.modMode = mode
    this.modBase = mode === 1 ? base : 0
    this.modSeed = seed | 0
    this.mods = mode === 1 ? base : 0
    this.modPick = -1
    if (mode === 2) { this.modPick = this.rollMod(0); this.mods = 1 << this.modPick }
    if (mode === 3) this.mods = 0
    this.netRise = 0
    this.swell[0] = 0; this.swell[1] = 0
    this.windX = this.has(Mod.WIND) ? this.rollWind() : 0
  }

  private modHash(salt: number) {
    let h = Math.imul(this.modSeed ^ 0x9e3779b9, 2246822519)
    h = Math.imul(h ^ (this.scores[0] * 31 + this.scores[1] * 977 + salt * 7919), 3266489917)
    h = Math.imul(h ^ (h >>> 13), 668265263)
    return ((h ^ (h >>> 16)) >>> 0)
  }

  private rollMod(avoid: number) {
    const h = this.modHash(1)
    let m = h % 10
    if ((1 << m) === avoid) m = (m + 1 + (h >>> 8) % 9) % 10
    return m
  }

  private rollWind() {
    const h = this.modHash(2)
    const mag = 0.025 + ((h >>> 4) % 1000) / 1000 * 0.05
    return (h & 1 ? 1 : -1) * mag * this.k(Mod.WIND)
  }

  /** Ponto acabou: o que acumula, acumula aqui. O que muda de máscara espera o saque. */
  onPoint(loser: Side) {
    if (this.has(Mod.SWELL) && this.swell[loser] < SWELL_MAX) this.swell[loser]++
    if (this.has(Mod.NET)) this.netRise = Math.min(NET_RISE_MAX, this.netRise + NET_RISE_STEP)
    this.melt[loser] = MELT_FRAMES
    this.cheer[loser === LEFT ? RIGHT : LEFT] = CHEER_FRAMES
    if (this.modMode === 2) {
      this.modPick = this.rollMod(this.mods)
      this.modWait = ROULETTE_WAIT
    } else if (this.modMode === 3 && modCount(this.modBase) < 10) {
      const h = this.modHash(3)
      for (let i = 0; i < 10; i++) {
        const m = ((h % 10) + i) % 10
        if (hasMod(this.modBase, m) || forbiddenWith(this.modBase, m)) continue
        this.modBase |= 1 << m
        this.modPick = m
        this.modWait = CHAOS_WAIT
        break
      }
    }
  }

  private applyModsOnServe(out: MatchEvent[]) {
    const was = this.mods
    if (this.modMode === 2 && this.modPick >= 0) this.mods = 1 << this.modPick
    else if (this.modMode === 3) this.mods = this.modBase
    else if (this.modMode === 1) this.mods = this.modBase
    if (this.has(Mod.WIND)) this.windX = this.rollWind()
    else this.windX = 0
    if (!this.has(Mod.SWELL)) { this.swell[0] = 0; this.swell[1] = 0 }
    if (!this.has(Mod.NET)) this.netRise = 0
    if (this.mods !== was || this.has(Mod.WIND) || this.modMode >= 2)
      out.push({ event: Ev.MOD_CHANGE, side: -1, intensity: this.mods })
  }

  blobHitGround(p: Side) { return this.blobY[p] >= this.groundY(p) - 0.001 }

  /** Agachado a esfera de cima afunda e encolhe, a de baixo espalha. */
  upperY(p: Side) { return this.blobY[p] - (BLOBBY_UPPER_SPHERE - this.crouch[p] * CROUCH_DUCK) * this.size(p) }
  upperR(p: Side) { return (BLOBBY_UPPER_RADIUS - this.crouch[p] * CROUCH_SLIM) * this.size(p) }
  lowerR(p: Side) { return (BLOBBY_LOWER_RADIUS + this.crouch[p] * CROUCH_SPREAD) * this.size(p) }
  lowerY(p: Side) { return this.blobY[p] + BLOBBY_LOWER_SPHERE * this.size(p) }
  /** Esticada horizontal da caixa de baixo: agachado alarga um pouco, mergulhando alarga muito. */
  wideX(p: Side) {
    const dive = this.diveFrames[p] > 0 ? 1 : this.diveRecover[p] > 0 ? 0.5 : 0
    return 1 + this.crouch[p] * CROUCH_WIDE + dive * DIVE_WIDE
  }
  diving(p: Side) { return this.diveFrames[p] > 0 }

  /** Quem está perdendo enche mais rápido — é a chance de virar o jogo. */
  private comeback(p: Side) {
    const diff = this.scores[p === LEFT ? RIGHT : LEFT] - this.scores[p]
    const m = 1 + diff * SPECIAL_COMEBACK_STEP
    return Math.max(SPECIAL_COMEBACK_MIN, Math.min(SPECIAL_COMEBACK_MAX, m))
  }

  addCharge(p: Side, amount: number, out: MatchEvent[]) {
    if (this.charge[p] >= SPECIAL_CAP) return
    const hot = this.rally >= SPECIAL_RALLY_HOT ? SPECIAL_RALLY_MUL : 1
    const was = this.charge[p]
    this.charge[p] += amount * this.comeback(p) * hot
    if (this.charge[p] > SPECIAL_CAP) this.charge[p] = SPECIAL_CAP
    if (was < SPECIAL_FULL && this.charge[p] >= SPECIAL_FULL) {
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
    const base = this.superFrames > 0 ? this.gBallBase() * this.superGravity() : this.gBallBase()
    return base * this.tempo * this.tempo
  }

  /**
   * Um toque, um degrau de ritmo. Acelerar o jogo é escalar o tempo: as
   * velocidades guardadas sobem junto, senão a bola no ar mudaria de trajetória
   * no meio do voo em vez de só percorrê-la mais rápido.
   */
  private bumpTempo() {
    if (this.tempo >= TEMPO_MAX) return
    const prev = this.tempo
    this.tempo = Math.min(TEMPO_MAX, this.tempo + TEMPO_STEP)
    const k = this.tempo / prev
    this.ballVX *= k
    this.ballVY *= k
    this.blobVY[LEFT] *= k
    this.blobVY[RIGHT] *= k
    this.knock[LEFT] *= k
    this.knock[RIGHT] *= k
  }

  /** As miras resolvem em tempo base; a velocidade sai daqui já no ritmo atual. */
  private scaleBallV() {
    this.ballVX *= this.tempo
    this.ballVY *= this.tempo
  }

  /** A parábola passa por cima da rede em toda a faixa de colisão dela? */
  private clearsNet(vx: number, vy: number, g: number, clearance: number) {
    const band = this.ballR() + NET_RADIUS + 4
    const ceiling = this.netTop() - clearance
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
  superGravity() { return this.superKind === 1 ? DOUBLE_GRAVITY_MUL : SPECIAL_GRAVITY_MUL }

  private aimSpecial(p: Side, boost = 1, mode = 0) {
    const dir = p === LEFT ? 1 : -1
    const ty = GROUND_PLANE_HEIGHT_MAX - this.ballR()
    const depth = (mode < 0 ? 0.86 : mode > 0 ? 0.3 : SPECIAL_TARGET_DEPTH) + (this.noise(p, 0) - 0.5) * SPECIAL_DEPTH_JITTER
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
    const g = this.gBallBase() * this.superGravity()
    // pra cima: o arco mais lento que ainda cabe no teto; pra baixo/frente: o mais rápido
    const skip = mode < 0 ? 6 : Math.floor(this.noise(p, 1) * SPECIAL_ARC_JITTER)
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
   * pesada é privilégio do especial.
   */
  /** Mira em tempo base e devolve a velocidade já no ritmo do rally. */
  private aimShotScaled(p: Side, vmax: number, vmin: number, depth: number, clearance: number,
                        tMin: number, tStep: number, tSteps: number, salt: number) {
    this.aimShot(p, vmax, vmin, depth, clearance, tMin, tStep, tSteps, salt)
    this.scaleBallV()
  }

  private aimShot(p: Side, vmax: number, vmin: number, depth: number, clearance: number,
                  tMin: number, tStep: number, tSteps: number, salt: number) {
    const dir = p === LEFT ? 1 : -1
    const g = this.gBallBase()
    const ty = GROUND_PLANE_HEIGHT_MAX - this.ballR()
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
   * Agachar e manchete saem do mesmo botão: tocar arma a manchete, segurar
   * agacha. Soltar não faz nada — pular é com o botão de pular.
   */
  private tryCrouch(p: Side, raw: PlayerInput) {
    const ground = this.blobHitGround(p)
    const held = raw.down && this.stun[p] <= 0
    if (held) this.crouch[p] = Math.min(1, this.crouch[p] + (ground ? CROUCH_RATE : CROUCH_RATE_AIR))
    else this.crouch[p] = Math.max(0, this.crouch[p] - CROUCH_RELEASE)

  }

  /** Manchete: bola perto e o botão apertado agora, devolve num arco alto e lento. */
  private tryDig(p: Side, out: MatchEvent[]) {
    if (this.digActive[p] <= 0 || this.stun[p] > 0) return false
    // especial na área é problema do parry, não da manchete
    if (this.superFrames > 0) return false
    const cy = this.lowerY(p)
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - cy
    const d2 = dx * dx + dy * dy
    if (d2 > DIG_REACH * DIG_REACH) return false

    this.digActive[p] = 0
    this.digCd[p] = DIG_CD
    this.bumpTempo()
    this.punch(p, 0.4)
    const dir = p === LEFT ? 1 : -1
    this.ballVX = dir * DIG_FORWARD * this.tempo
    this.ballVY = -DIG_UP * this.tempo
    this.ballSpin = 0
    this.pushOut(p, cy, dx, dy, Math.sqrt(d2), this.lowerR(p))
    this.addCharge(p, DIG_GAIN, out)
    out.push({ event: Ev.DIG, side: p, intensity: 1 })
    return true
  }

  /** Golpe que não é reflexão precisa tirar a bola de dentro do corpo na mão. */
  private pushOut(p: Side, cy: number, dx: number, dy: number, l: number, r: number) {
    const need = this.ballR() + r + 2
    if (l >= need) return
    const k = l || 1
    this.ballX = this.blobX[p] + (dx / k) * need
    this.ballY = cy + (dy / k) * need
  }

  /**
   * Mergulho. Baixo apertado enquanto corre no chão: o blob se joga de lado,
   * esticado e rente à areia. Alcança o que a corrida não alcança e paga
   * ficando deitado no fim.
   */
  /** Esse toque de baixo é mergulho? Vale pra manchete e pro mergulho lerem igual. */
  private divePress(p: Side) {
    return this.stun[p] === 0 && this.diveCd[p] === 0 &&
      this.diveFrames[p] === 0 && this.diveRecover[p] === 0
  }

  private tryDive(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (!raw.dive || this.prevDive[p] !== 0) return
    if (!this.divePress(p)) return
    const dir = raw.left !== raw.right ? (raw.right ? 1 : -1) : (p === LEFT ? 1 : -1)
    const ground = this.blobHitGround(p)

    this.diveFrames[p] = DIVE_FRAMES
    this.diveDir[p] = dir
    this.diveCd[p] = DIVE_CD
    this.blobVX[p] = dir * DIVE_SPEED * this.tempo
    // no ar não ganha impulso: só corta a subida e se joga de lado até cair
    this.blobVY[p] = ground ? DIVE_HOP * this.tempo : Math.max(this.blobVY[p], DIVE_HOP * this.tempo)
    out.push({ event: Ev.DIVE, side: p, intensity: 0 })
  }

  /** Soltou o botão de especial: barra cheia e bola perto dispara na hora, no chão ou no ar. */
  private fireSpecial(p: Side, out: MatchEvent[]) {
    if (this.stun[p] > 0) return
    if (this.superFrames > 0 && this.superOwner !== p) return
    if (this.charge[p] < SPECIAL_FULL) return
    if (!this.nearHead(p, SPECIAL_REACH)) return
    this.charge[p] = 0
    this.superFrames = SPECIAL_BALL_FRAMES
    this.superOwner = p
    this.superKind = 0
    this.hold[p] = 0
    this.ballSpin = 0
    this.anchorHeld(p)
    this.bumpTempo()
    this.punch(p, 1)
    // direcional só escolhe o tipo de arco (cima, frente, corta); o alvo é sempre o campo do outro
    this.aimSpecial(p, 1, this.hitAimY[p])
    this.scaleBallV()
    out.push({ event: Ev.SPECIAL_FIRED, side: p, intensity: 1 })
  }

  private incoming(p: Side) { return this.superFrames > 0 && this.superOwner !== p }

  private nearHead(p: Side, reach: number) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - this.upperY(p)
    return dx * dx + dy * dy <= reach * reach
  }

  /**
   * Reversal: o botão de especial na hora exata em que o especial chega devolve
   * ele na hora, ainda mais forte. Não segura a bola: sai no mesmo frame.
   */
  private tryReversal(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (this.stun[p] > 0 || !this.incoming(p)) return
    const pressed = raw.special && this.prevSpecial[p] === 0 && this.charge[p] >= SPECIAL_FULL
    if (pressed && this.revCd[p] === 0 && this.revActive[p] === 0) {
      this.revActive[p] = REVERSAL_ACTIVE
      this.revCd[p] = REVERSAL_CD
      out.push({ event: Ev.REVERSAL_TRY, side: p, intensity: 0 })
    }
    if (this.revActive[p] <= 0) return
    const closing = p === LEFT ? this.ballVX < 0 : this.ballVX > 0
    if (!closing || !this.nearHead(p, PARRY_REACH)) return
    this.revActive[p] = 0
    this.revCd[p] = 0
    this.charge[p] = 0
    this.parryChain = Math.min(this.parryChain + 1, PARRY_CHAIN_MAX)
    this.superOwner = p
    this.superFrames = SPECIAL_BALL_FRAMES
    this.hold[p] = 0
    this.hitCharge[p] = 0
    this.ballSpin = 0
    this.ballVX = 0; this.ballVY = 0
    this.revSpin[p] = REVERSAL_SPIN
    this.orbit(p)
    out.push({ event: Ev.REVERSAL_SPIN, side: p, intensity: 1 })
  }

  /** Posição da bola na volta em torno do corpo, do lado de trás pra frente. */
  orbitPos(p: Side, spin: number): [number, number] {
    const dir = p === LEFT ? 1 : -1
    const k = 1 - spin / REVERSAL_SPIN
    const e = k * k * (3 - 2 * k)
    const a = Math.PI + dir * e * Math.PI * 2 * REVERSAL_TURNS
    const r = REVERSAL_ORBIT * (0.55 + 0.45 * Math.sin(e * Math.PI))
    return [this.blobX[p] + Math.cos(a) * r, this.upperY(p) + Math.sin(a) * r * 0.75]
  }

  private orbit(p: Side) {
    const [x, y] = this.orbitPos(p, this.revSpin[p])
    this.ballX = x; this.ballY = y
  }

  private spinStep(p: Side, out: MatchEvent[]) {
    if (this.revSpin[p] <= 0) return
    this.revSpin[p]--
    if (this.revSpin[p] > 0) { this.orbit(p); return }
    this.anchorHeld(p)
    this.superKind = 1
    this.bumpTempo()
    this.aimSpecial(p, REVERSAL_BOOST + this.parryChain * PARRY_BOOST)
    this.scaleBallV()
    out.push({ event: Ev.REVERSAL, side: p, intensity: 1 })
  }

  /** Especial vindo em cima: o botão de bater na hora certa segura a bola e devolve mais forte. */
  private tryParry(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (this.stun[p] > 0) return
    if (this.superFrames <= 0 || this.superOwner === p) return
    const pressed = raw.hit && this.prevHit[p] === 0
    if (pressed && this.parryCd[p] === 0 && this.parryActive[p] === 0) {
      this.parryActive[p] = this.superKind === 1 ? REVERSAL_PARRY_ACTIVE : PARRY_ACTIVE
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
    this.superKind = 0
    this.hold[p] = PARRY_HOLD
    this.ballVX = 0; this.ballVY = 0; this.ballSpin = 0
    this.anchorHeld(p)
    out.push({ event: Ev.PARRY, side: p, intensity: 1 })
  }

  private anchorHeld(p: Side) {
    const dir = p === LEFT ? 1 : -1
    this.ballX = this.blobX[p] + dir * (BLOBBY_UPPER_RADIUS + BALL_RADIUS) * 0.55
    this.ballY = this.upperY(p) - BALL_RADIUS * 0.9
  }

  holding(): boolean {
    return this.hold[LEFT] > 0 || this.hold[RIGHT] > 0 || this.revSpin[LEFT] > 0 || this.revSpin[RIGHT] > 0
  }

  /** Parry bem dado segura a bola na mão: solta ao largar o botão ou em 1 s. */
  private holdStep(p: Side, raw: PlayerInput, out: MatchEvent[]) {
    if (this.hold[p] <= 0) return
    this.hold[p]--
    this.anchorHeld(p)
    const held = raw.hit || raw.special
    if (held && this.hold[p] > 0 && this.stun[p] === 0) return
    this.hold[p] = 0
    this.bumpTempo()
    if (raw.down) {
      // parry manchete: solta com baixo segurado e a bola sobe no seu lado, pronta pra cortada
      this.superFrames = 0
      this.superOwner = -1
      this.parryChain = 0
      const dir = p === LEFT ? 1 : -1
      this.ballVX = dir * DIG_FORWARD * this.tempo
      this.ballVY = -DIG_UP * 1.1 * this.tempo
      this.ballSpin = 0
      this.addCharge(p, DIG_GAIN, out)
      out.push({ event: Ev.DIG, side: p, intensity: 1 })
      return
    }
    this.aimSpecial(p, PARRY_RETURN + this.parryChain * PARRY_BOOST)
    this.scaleBallV()
    out.push({ event: Ev.SPECIAL_FIRED, side: p, intensity: 0.5 })
  }

  charging(p: Side) { return this.hitCharge[p] > 0 }

  /** Direção da mira em unidades de quadra: sem direcional, pra frente e pra cima. */
  aimVector(p: Side): [number, number] {
    return aimDir(p, this.hitAimX[p], this.hitAimY[p])
  }

  /**
   * Botão de bater. Apertar com baixo segurado arma a manchete. Apertar solto
   * começa a carga: o blob para, o direcional mira, e soltar com a bola no raio
   * é a batida. Soltar longe da bola não custa nada.
   */
  private hitStep(p: Side, raw: PlayerInput, isBallValid: boolean, out: MatchEvent[]) {
    if (this.hitLag[p] > 0) this.hitLag[p]--
    if (this.hitPass[p] > 0) this.hitPass[p]--
    const busy = this.stun[p] > 0 || this.diveFrames[p] > 0 || this.diveRecover[p] > 0
    if (this.swingT[p] > 0) {
      this.swingT[p]--
      if (isBallValid && !busy && this.swing(p, this.swingPow[p], out)) this.swingT[p] = 0
    }
    if (this.hitCharge[p] > 0) {
      // soltar o direcional junto com o botão não apaga a mira: a última segurada vale
      const held = this.armSpecial[p] ? raw.special : raw.hit
      if (held || raw.left || raw.right || raw.up || raw.down) {
        this.hitAimX[p] = raw.left !== raw.right ? (raw.right ? 1 : -1) : 0
        this.hitAimY[p] = raw.up !== raw.down ? (raw.up ? -1 : 1) : 0
      }
      if (this.hitCharge[p] < 100000) this.hitCharge[p]++
      if (busy || this.incoming(p)) { this.hitCharge[p] = 0; this.armSpecial[p] = 0; return }
      if (this.armSpecial[p] ? raw.special : raw.hit) return
      const c = this.hitCharge[p]
      this.hitCharge[p] = 0
      if (this.armSpecial[p]) {
        this.armSpecial[p] = 0
        if (isBallValid) this.fireSpecial(p, out)
        return
      }
      // soltou cedo: a batida ainda vale por alguns frames
      if (isBallValid && !this.swing(p, c, out)) { this.swingT[p] = SWING_WINDOW; this.swingPow[p] = c }
      return
    }
    const pressHit = raw.hit && this.prevHit[p] === 0
    const pressSp = raw.special && this.prevSpecial[p] === 0
    if (!(pressHit || pressSp) || busy || this.hitLag[p] > 0 || this.incoming(p) || this.hold[p] > 0) return
    const ground = this.blobHitGround(p)
    if (pressHit && raw.down && ground) {
      if (this.digCd[p] === 0) { this.digActive[p] = DIG_WINDOW; this.digCd[p] = DIG_CD }
      return
    }
    this.hitCharge[p] = 1
    this.armSpecial[p] = pressSp && !pressHit ? 1 : 0
    this.hitAimX[p] = raw.left !== raw.right ? (raw.right ? 1 : -1) : 0
    this.hitAimY[p] = raw.up !== raw.down ? (raw.up ? -1 : 1) : 0
    // no ar, armar é quase parar: o embalo segue devagar e a queda demora a voltar
    if (!ground) { this.blobVX[p] *= FLOAT_KEEP; this.blobVY[p] *= FLOAT_KEEP }
  }

  private swing(p: Side, charge: number, out: MatchEvent[]): boolean {
    if (this.superFrames > 0) return false
    const cy = this.upperY(p)
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - cy
    const d2 = dx * dx + dy * dy
    if (d2 > HIT_REACH * HIT_REACH) return false
    this.hitLag[p] = HIT_LAG
    this.hitPass[p] = 30
    this.bumpTempo()
    this.ballSpin = 0
    this.punch(p, charge <= HIT_TAP ? 0.2 : 1)
    const cortada = !this.blobHitGround(p) && this.hitAimY[p] > 0
    if (charge <= HIT_TAP && !cortada) {
      const dir = p === LEFT ? 1 : -1
      if (this.hitAimX[p] === dir) {
        this.aimShotScaled(p, DROP_DEEP_VELOCITY, 0, DROP_DEEP_DEPTH, DROP_DEEP_CLEARANCE,
          DROP_TIME_MIN, DROP_TIME_STEP, DROP_TIME_STEPS, 7)
      } else if (this.hitAimY[p] < 0) {
        this.aimShotScaled(p, DROP_DEEP_VELOCITY, 0, DROP_TARGET_DEPTH, DROP_UP_CLEARANCE,
          DROP_TIME_MIN, DROP_TIME_STEP, DROP_TIME_STEPS, 7)
      } else {
        this.aimShotScaled(p, DROP_VELOCITY, 0, DROP_TARGET_DEPTH, DROP_NET_CLEARANCE,
          DROP_TIME_MIN, DROP_TIME_STEP, DROP_TIME_STEPS, 7)
      }
      this.pushOut(p, cy, dx, dy, Math.sqrt(d2), this.upperR(p))
      this.addCharge(p, DIG_GAIN, out)
      out.push({ event: Ev.DROP, side: p, intensity: 1 })
      return true
    }
    const k = Math.max(0, Math.min(1, (charge - HIT_TAP) / (HIT_CHARGE_MAX - HIT_TAP)))
    const [nx, ny] = this.aimVector(p)
    const v = (HIT_V_MIN + (HIT_V_MAX - HIT_V_MIN) * k) * this.tempo
    this.ballVX = nx * v
    this.ballVY = ny * v
    this.pushOut(p, cy, dx, dy, Math.sqrt(d2), this.upperR(p))
    this.ballX += this.ballVX
    this.ballY += this.ballVY
    this.addCharge(p, HIT_GAIN, out)
    out.push({ event: Ev.HIT, side: p, intensity: k })
    return true
  }

  /** Tutorial: um especial vindo do lado `from`, sem ninguém lá pra bater. */
  launchSpecial(from: Side) {
    this.superFrames = SPECIAL_BALL_FRAMES
    this.superOwner = from
    this.parryChain = 0
    this.ballX = from === LEFT ? NET_POSITION_X * 0.5 : NET_POSITION_X * 1.5
    this.ballY = 300
    this.ballSpin = 0
    this.aimSpecial(from)
    this.scaleBallV()
  }

  private topBallCollision(p: Side) {
    const dx = this.ballX - this.blobX[p]
    const dy = this.ballY - this.upperY(p)
    const r = this.ballR() + this.upperR(p)
    return dx * dx + dy * dy < r * r
  }

  private bottomBallCollision(p: Side) {
    const dx = (this.ballX - this.blobX[p]) / this.wideX(p)
    const dy = this.ballY - this.lowerY(p)
    const r = this.ballR() + this.lowerR(p)
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
    const T = this.tempo
    const T2 = T * T
    const gy = this.groundY(p)
    let g = this.gBlob()
    const jumpV = BLOBBY_JUMP_ACCELERATION * T * this.jumpMul(p)
    if (input.up && !input.down) {
      // pulo é aperto, não tecla segurada: soltar a mira pra cima não pode virar pulo
      if (ground && this.prevUp[p] === 0) { this.blobVY[p] = jumpV; this.startAnim(p); this.antic[p] = 1 }
      g -= BLOBBY_JUMP_BUFFER * this.lerp1(this.k(Mod.LUNAR), 0.42)
    }
    // pula-pula: no chão o corpo já está subindo de novo
    if (ground && this.has(Mod.BOUNCE) && this.hitCharge[p] === 0 && this.diveRecover[p] === 0) {
      this.blobVY[p] = jumpV * 0.92
      this.startAnim(p)
      this.antic[p] = 1
    }
    // no ar, pra baixo é queda rápida
    if (!ground && input.down) g += GRAVITATION * CROUCH_FALL_MUL
    if ((input.left || input.right) && ground) this.startAnim(p)
    const floating = this.hitCharge[p] > 0 && !ground
    if (floating) {
      const ramp = Math.max(0, Math.min(1, (this.hitCharge[p] - FLOAT_FRAMES) / FLOAT_RAMP))
      g *= FLOAT_G + (1 - FLOAT_G) * ramp
    }
    g *= T2

    // mergulhando o blob é um projétil: não freia nem muda de ideia no meio
    if (this.diveFrames[p] > 0) {
      this.blobX[p] += this.blobVX[p] + this.knock[p]
      if (this.knock[p] !== 0) {
        this.knock[p] *= KNOCK_DECAY
        if (Math.abs(this.knock[p]) < 0.05) this.knock[p] = 0
      }
      this.blobY[p] += 0.5 * g + this.blobVY[p]
      this.blobVY[p] += g
      if (this.blobY[p] >= gy) {
        this.land(p, this.blobVY[p])
        this.blobY[p] = gy
        this.blobVY[p] = 0
        this.diveFrames[p] = 0
        this.diveRecover[p] = DIVE_RECOVER
        this.blobVX[p] *= this.has(Mod.ICE) ? 0.95 : DIVE_SLIDE_KEEP
      }
      return
    }

    // levantando da areia: o preço do mergulho é ficar parado um instante
    const stuck = this.diveRecover[p] > 0
    const slow = (1 - this.crouch[p] * (1 - CROUCH_SPEED_MUL)) * T * this.speedMul(p)
    const ice = this.k(Mod.ICE)
    if (stuck) {
      // escorrega até parar: quem se joga não freia no ar seco
      this.blobVX[p] *= ice > 0 ? 0.985 : DIVE_SLIDE_DRAG
      if (Math.abs(this.blobVX[p]) < DIVE_SLIDE_STOP) this.blobVX[p] = 0
    } else if (floating) {
      this.blobVX[p] *= FLOAT_DRAG
    } else {
      const want = ((input.right ? BLOBBY_SPEED : 0) - (input.left ? BLOBBY_SPEED : 0)) * slow
      if (ice > 0) {
        // gelo: acelera devagar e freia mais devagar ainda; no ar segue o embalo
        const accel = want !== 0 ? 0.10 - 0.06 * ice : 0.045 - 0.03 * ice
        this.blobVX[p] += (want - this.blobVX[p]) * (ground ? accel : accel * 0.6)
        if (want === 0 && Math.abs(this.blobVX[p]) < 0.04) this.blobVX[p] = 0
      } else {
        this.blobVX[p] = want
      }
    }

    this.blobX[p] += this.blobVX[p] + this.knock[p]
    if (this.knock[p] !== 0) {
      this.knock[p] *= KNOCK_DECAY
      if (Math.abs(this.knock[p]) < 0.05) this.knock[p] = 0
    }
    this.blobY[p] += 0.5 * g + this.blobVY[p]
    this.blobVY[p] += g

    if (this.blobY[p] > gy) {
      if (this.blobVY[p] > 3.5) this.startAnim(p)
      this.land(p, this.blobVY[p])
      this.blobY[p] = gy
      this.blobVY[p] = 0
    }
    this.animStep(p)
  }

  /** Aterrissou com velocidade `vy`: achata na proporção do impacto; gelatina cambaleia depois. */
  private land(p: Side, vy: number) {
    if (vy <= 0.5) return
    const amp = 1 + 1.4 * this.k(Mod.JELLY)
    const hit = Math.min(1, vy / 16)
    this.defVY[p] -= (0.05 + 0.13 * hit) * amp
    this.defVX[p] += (0.03 + 0.09 * hit) * amp
    if (this.has(Mod.JELLY) && hit > 0.25) this.wobble[p] = WOBBLE_FRAMES
  }

  /** A bola encostou: afunda ali. `nx,ny` apontam do centro do blob pra bola. */
  private dent(p: Side, nx: number, ny: number, k: number) {
    this.dentX[p] = nx
    this.dentY[p] = ny
    this.dentK[p] = Math.max(this.dentK[p], 0.5 + 0.5 * k) * (1 + 0.6 * this.k(Mod.JELLY))
  }

  /**
   * Forma do blob: alvo pelo estado (respira, estica subindo, achata caindo,
   * espalha mergulhando, derrete perdendo, quica ganhando) e uma mola que
   * corre atrás dele. Volume aparente: achatar alarga, esticar afina.
   */
  private deformStep(p: Side, frame: number) {
    const jelly = this.k(Mod.JELLY)
    const K = DEF_K * (1 - 0.5 * jelly)
    const D = DEF_D * (1 - 0.55 * jelly)
    const ground = this.blobHitGround(p)
    const vy = this.blobVY[p]
    let ty: number, tx: number | null = null
    if (this.melt[p] > 0) {
      this.melt[p]--
      const k = this.melt[p] / MELT_FRAMES
      const soft = 1 + 0.35 * jelly
      ty = 1 - 0.4 * Math.min(1, k * 1.6) * soft
      tx = 1 + 0.5 * Math.min(1, k * 1.6) * soft
    } else if (this.cheer[p] > 0) {
      this.cheer[p]--
      const k = this.cheer[p] / CHEER_FRAMES
      ty = 1 + Math.sin(k * Math.PI * 3) * 0.28 * (1 + 0.5 * jelly)
    } else if (this.diveFrames[p] > 0) {
      ty = 1 - 0.28 * (1 + 0.4 * jelly)
      tx = 1 + 0.5 * (1 + 0.4 * jelly)
    } else if (this.diveRecover[p] > 0) {
      ty = 1 - 0.18
      tx = 1 + 0.32
    } else if (!ground) {
      if (vy < -APEX_WINDOW) ty = 1 + Math.min(0.32, -vy * 0.024) * (1 + 0.5 * jelly)
      else if (vy > APEX_WINDOW) ty = 1 + Math.min(0.45, vy * 0.036) * (1 + 0.5 * jelly)
      else ty = 1.03
    } else {
      ty = 1 + Math.sin((frame + p * 37) * 0.065) * 0.022
    }
    if (this.antic[p] > 0) { this.antic[p] = 0; this.defY[p] = Math.min(this.defY[p], 0.74 - 0.1 * jelly); this.defX[p] = Math.max(this.defX[p], 1.22) }
    if (tx === null) tx = 1 / Math.pow(ty, 0.8)
    this.defVY[p] += (ty - this.defY[p]) * K - this.defVY[p] * D
    this.defVX[p] += (tx - this.defX[p]) * K - this.defVX[p] * D
    this.defY[p] += this.defVY[p]
    this.defX[p] += this.defVX[p]
    if (this.defY[p] < DEF_MIN) { this.defY[p] = DEF_MIN; this.defVY[p] = 0 }
    if (this.defY[p] > DEF_MAX) { this.defY[p] = DEF_MAX; this.defVY[p] = 0 }
    if (this.defX[p] < 0.5) { this.defX[p] = 0.5; this.defVX[p] = 0 }
    if (this.defX[p] > 2) { this.defX[p] = 2; this.defVX[p] = 0 }
    this.dentK[p] *= 0.86 + 0.06 * jelly
    if (this.dentK[p] < 0.02) this.dentK[p] = 0
    if (this.wobble[p] > 0) this.wobble[p]--
  }

  /** Golpe: comprime e explode pra fora no instante da batida. */
  private punch(p: Side, k: number) {
    const amp = 1 + 1.2 * this.k(Mod.JELLY)
    this.defX[p] = Math.min(this.defX[p], 0.86)
    this.defY[p] = Math.min(this.defY[p], 0.86)
    this.defVX[p] += (0.12 + 0.12 * k) * amp
    this.defVY[p] += (0.12 + 0.12 * k) * amp
  }

  private handleBlobBallCollision(p: Side, out: MatchEvent[]) {
    let cy = this.lowerY(p)
    let cr = this.lowerR(p)
    if (!this.bottomBallCollision(p)) {
      if (!this.topBallCollision(p)) return false
      cy = this.upperY(p)
      cr = this.upperR(p)
    }

    // quem soltou o especial não reencosta na bola enquanto ela sai de perto
    if (this.superOwner === p && this.superFrames > SPECIAL_BALL_FRAMES - 12) return false
    // quem acabou de bater também não: a bola sai limpa do corpo enquanto se afasta
    if (this.hitPass[p] > 0) {
      const away = (this.ballX - this.blobX[p]) * this.ballVX + (this.ballY - this.blobY[p]) * this.ballVY > 0
      if (away) return false
    }

    this.bumpTempo()

    // mergulho: é defesa, não ataque. Levanta a bola alto e devagar, sem spin.
    if ((this.diveFrames[p] > 0 || this.diveRecover[p] > 0) && this.superFrames === 0) {
      const dx = this.ballX - this.blobX[p]
      const dy = this.ballY - cy
      this.ballSpin = 0
      this.aimShotScaled(p, DIVE_VELOCITY, DIVE_VELOCITY * 0.7, DIVE_TARGET_DEPTH,
        DIVE_NET_CLEARANCE, DIVE_TIME_MIN, DIVE_TIME_STEP, DIVE_TIME_STEPS, 5)
      this.pushOut(p, cy, dx, dy, Math.sqrt(dx * dx + dy * dy), cr)
      this.hitPass[p] = 30
      this.addCharge(p, DIVE_GAIN, out)
      out.push({ event: Ev.DIVE_HIT, side: p, intensity: 1 })
      return true
    }

    const rx = this.ballVX - this.blobVX[p]
    const ry = this.ballVY - this.blobVY[p]
    const intensity = Math.min(1, Math.sqrt(rx * rx + ry * ry) / 25)

    let nx = (this.ballX - this.blobX[p]) / this.wideX(p)
    let ny = this.ballY - cy
    const l = Math.sqrt(nx * nx + ny * ny) || 1
    nx /= l; ny /= l

    // onde no pulo você bateu: no ápice sai mais forte, caindo sai mais fraco
    const bvy = this.blobVY[p]
    const apex = bvy < 0 || bvy > 0
      ? (bvy > -APEX_WINDOW && bvy < APEX_WINDOW ? APEX_MUL : bvy > 0 ? FALL_MUL : 1)
      : 1
    const v = BALL_COLLISION_VELOCITY * this.tempo * apex
    this.ballVX = nx * v
    this.ballVY = ny * v
    // e o quanto você estava correndo vira rotação, que é o que curva a bola
    const raw = this.blobVX[p] * SPIN_FROM_VX
    this.ballSpin = raw > SPIN_MAX ? SPIN_MAX : raw < -SPIN_MAX ? -SPIN_MAX : raw
    if (apex === APEX_MUL) out.push({ event: Ev.APEX_HIT, side: p, intensity: 1 })
    this.ballX += this.ballVX
    this.ballY += this.ballVY
    this.dent(p, nx, ny, intensity)
    // boliche: a bola pesada empurra o corpo pro lado contrário do toque
    if (this.has(Mod.BOWLING)) {
      this.knock[p] += -nx * 7 * this.k(Mod.BOWLING) * this.tempo
      if (ny < -0.3 && !this.blobHitGround(p)) this.blobVY[p] += 3 * this.k(Mod.BOWLING)
    }

    out.push({ event: Ev.BALL_HIT_BLOB, side: p, intensity })
    this.addCharge(p, SPECIAL_GAIN_TOUCH, out)

    if (this.superFrames > 0) {
      if (this.superOwner !== p) {
        this.stun[p] = STUN_FRAMES
        this.knock[p] = (p === LEFT ? -1 : 1) * SPECIAL_KNOCKBACK * this.tempo
        this.blobVY[p] = SPECIAL_POP * this.tempo
        out.push({ event: Ev.SPECIAL_HIT, side: p, intensity: 1 })
      }
      this.superFrames = 0
      this.superOwner = -1
      this.parryChain = 0
    }
    return true
  }

  private handleBallWorldCollisions(out: MatchEvent[]) {
    const walls = this.wallsOn
    const R = this.ballR()
    if (this.ballY + R > GROUND_PLANE_HEIGHT_MAX && this.ball2On) {
      // bola dividida: a primeira que cai some; o ponto é da última
      this.ballX = this.ball2X; this.ballY = this.ball2Y
      this.ballVX = this.ball2VX; this.ballVY = this.ball2VY
      this.ball2On = 0
      this.ballSpin = 0
      out.push({ event: Ev.BALL_MERGE, side: this.ballX > NET_POSITION_X ? RIGHT : LEFT, intensity: 0 })
      return
    }
    if (this.ballY + R > GROUND_PLANE_HEIGHT_MAX) {
      // quadra aberta: fora é cair no chão fora da linha. No ar não é nada —
      // passar da lateral e voltar pro rally é jogada, não erro.
      if (!walls && !this.ballOut && (this.ballX < LEFT_PLANE || this.ballX > RIGHT_PLANE)) {
        this.ballOut = 1
        out.push({ event: Ev.BALL_OUT, side: this.ballX < LEFT_PLANE ? LEFT : RIGHT, intensity: 0 })
      }
      if (this.superFrames > 0) {
        this.superFrames = 0
        this.superOwner = -1
        this.parryChain = 0
        out.push({ event: Ev.SPECIAL_GROUND, side: this.ballX > NET_POSITION_X ? RIGHT : LEFT, intensity: 1 })
      }
      const rest = this.lerp1(this.k(Mod.BOWLING), 0.45) * this.lerp1(this.k(Mod.BALLOON), 0.85)
      this.ballVY = -this.ballVY * 0.95 * rest
      this.ballVX *= 0.95 * rest
      this.ballY = GROUND_PLANE_HEIGHT_MAX - R
      this.ballSpin = 0
      out.push({ event: Ev.BALL_HIT_GROUND, side: this.ballX > NET_POSITION_X ? RIGHT : LEFT, intensity: this.has(Mod.BOWLING) ? 1 : 0 })
    }

    const onLeft = this.ballX - R <= LEFT_PLANE && this.ballVX < 0
    const onRight = this.ballX + R >= RIGHT_PLANE && this.ballVX > 0

    // longe demais não existe: sem isso a bola sai do enquadramento e o rally
    // fica esperando ela cair num chão que ninguém vê.
    if (!walls && !this.ballOut
        && (this.ballX < LEFT_PLANE - OPEN_MARGIN || this.ballX > RIGHT_PLANE + OPEN_MARGIN)) {
      this.ballOut = 1
      out.push({ event: Ev.BALL_OUT, side: this.ballX < LEFT_PLANE ? LEFT : RIGHT, intensity: 0 })
    }
    if (walls && onLeft) {
      this.ballSpin = 0
      this.ballVX = -this.ballVX
      this.ballX = LEFT_PLANE + R
      out.push({ event: Ev.BALL_HIT_WALL, side: LEFT, intensity: 0 })
    } else if (walls && onRight) {
      this.ballSpin = 0
      this.ballVX = -this.ballVX
      this.ballX = RIGHT_PLANE - R
      out.push({ event: Ev.BALL_HIT_WALL, side: RIGHT, intensity: 0 })
    } else if (this.ballY > this.netTop() && Math.abs(this.ballX - NET_POSITION_X) < R + NET_RADIUS) {
      const right = this.ballX - NET_POSITION_X > 0
      const vx = this.ballVX
      this.ballVX = -this.ballVX
      this.ballX = NET_POSITION_X + (right ? R + NET_RADIUS : -R - NET_RADIUS)
      this.ballSpin = 0
      out.push({ event: Ev.BALL_HIT_NET, side: right ? RIGHT : LEFT, intensity: 0 })
      this.split(vx, out)
    } else {
      const dx = this.ballX - NET_POSITION_X
      const dy = this.ballY - this.netTop()
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < NET_RADIUS + R) {
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
        const vx0 = this.ballVX
        this.ballX = NET_POSITION_X - nx * (NET_RADIUS + R)
        this.ballY = this.netTop() - ny * (NET_RADIUS + R)
        out.push({ event: Ev.BALL_HIT_NET_TOP, side: -1, intensity: 0 })
        this.split(-vx0, out)
      }
    }
  }

  /** Bola na rede vira duas: a nova segue pro outro lado, as duas sobem. */
  private split(throughVX: number, out: MatchEvent[]) {
    if (!this.has(Mod.SPLIT) || this.ball2On || this.superFrames > 0) return
    this.ball2On = 1
    this.ball2X = this.ballX
    this.ball2Y = this.ballY - 6
    const v = Math.max(3, Math.abs(throughVX))
    this.ball2VX = (throughVX >= 0 ? 1 : -1) * v
    this.ball2VY = Math.min(this.ballVY, -7) - 2
    this.ballVY = Math.min(this.ballVY, -7) - 2
    out.push({ event: Ev.BALL_SPLIT, side: -1, intensity: 1 })
  }

  /** A segunda bola: gravidade, vento, paredes, rede e os blobs. Sem golpe, sem especial. */
  private ball2Step(out: MatchEvent[]) {
    if (!this.ball2On) return
    const g = this.ballG()
    const R = this.ballR()
    this.ball2VX += this.windX * this.tempo
    this.ball2X += this.ball2VX
    this.ball2Y += 0.5 * g + this.ball2VY
    this.ball2VY += g
    if (this.ball2Y + R > GROUND_PLANE_HEIGHT_MAX) {
      this.ball2On = 0
      out.push({ event: Ev.BALL_MERGE, side: this.ball2X > NET_POSITION_X ? RIGHT : LEFT, intensity: 1 })
      return
    }
    if (!this.wallsOn && (this.ball2X < LEFT_PLANE - OPEN_MARGIN || this.ball2X > RIGHT_PLANE + OPEN_MARGIN)) { this.ball2On = 0; return }
    if (this.wallsOn && this.ball2X - R <= LEFT_PLANE && this.ball2VX < 0) { this.ball2VX = -this.ball2VX; this.ball2X = LEFT_PLANE + R }
    else if (this.wallsOn && this.ball2X + R >= RIGHT_PLANE && this.ball2VX > 0) { this.ball2VX = -this.ball2VX; this.ball2X = RIGHT_PLANE - R }
    else if (this.ball2Y > this.netTop() && Math.abs(this.ball2X - NET_POSITION_X) < R + NET_RADIUS) {
      const right = this.ball2X - NET_POSITION_X > 0
      this.ball2VX = -this.ball2VX
      this.ball2X = NET_POSITION_X + (right ? R + NET_RADIUS : -R - NET_RADIUS)
    }
    for (const p of [LEFT, RIGHT] as Side[]) {
      if (this.solo && p === RIGHT) continue
      let cy = this.lowerY(p), cr = this.lowerR(p)
      let dx = (this.ball2X - this.blobX[p]) / this.wideX(p)
      let dy = this.ball2Y - cy
      let r = R + cr
      if (dx * dx + dy * dy >= r * r) {
        cy = this.upperY(p); cr = this.upperR(p)
        dx = this.ball2X - this.blobX[p]; dy = this.ball2Y - cy
        r = R + cr
        if (dx * dx + dy * dy >= r * r) continue
      }
      const l = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = dx / l, ny = dy / l
      const v = BALL_COLLISION_VELOCITY * this.tempo
      this.ball2VX = nx * v
      this.ball2VY = ny * v
      this.ball2X = this.blobX[p] + nx * (r + 1)
      this.ball2Y = cy + ny * (r + 1)
      this.dent(p, nx, ny, 0.6)
      out.push({ event: Ev.BALL_HIT_BLOB, side: p, intensity: 0.6 })
    }
  }

  /** Contador só pra respiração da deformação: não precisa sobreviver ao rollback exato. */
  frameNo = 0

  step(li: PlayerInput, ri: PlayerInput, isBallValid: boolean, isGameRunning: boolean, out: MatchEvent[]) {
    if (this.modWait > 0 && !isBallValid) this.modWait--
    if (this.stun[LEFT] > 0) this.stun[LEFT]--
    if (this.stun[RIGHT] > 0) this.stun[RIGHT]--
    if (this.superFrames > 0 && !this.holding() && --this.superFrames === 0) { this.superOwner = -1; this.parryChain = 0 }
    if (this.diveCd[LEFT] > 0) this.diveCd[LEFT]--
    if (this.diveCd[RIGHT] > 0) this.diveCd[RIGHT]--
    if (this.diveRecover[LEFT] > 0) this.diveRecover[LEFT]--
    if (this.diveRecover[RIGHT] > 0) this.diveRecover[RIGHT]--
    if (this.parryActive[LEFT] > 0) this.parryActive[LEFT]--
    if (this.parryActive[RIGHT] > 0) this.parryActive[RIGHT]--
    if (this.parryCd[LEFT] > 0) this.parryCd[LEFT]--
    if (this.parryCd[RIGHT] > 0) this.parryCd[RIGHT]--
    if (this.digCd[LEFT] > 0) this.digCd[LEFT]--
    if (this.digCd[RIGHT] > 0) this.digCd[RIGHT]--
    if (this.digActive[LEFT] > 0) this.digActive[LEFT]--
    if (this.digActive[RIGHT] > 0) this.digActive[RIGHT]--
    if (this.revActive[LEFT] > 0) this.revActive[LEFT]--
    if (this.revActive[RIGHT] > 0) this.revActive[RIGHT]--
    if (this.revCd[LEFT] > 0) this.revCd[LEFT]--
    if (this.revCd[RIGHT] > 0) this.revCd[RIGHT]--

    this.hitStep(LEFT, li, isBallValid && !this.holding(), out)
    this.hitStep(RIGHT, ri, isBallValid && !this.holding(), out)

    // armando a batida o blob fica plantado: o direcional é mira, não passo
    const el = this.stun[LEFT] > 0 || this.revSpin[LEFT] > 0 ? NO_INPUT : this.hitCharge[LEFT] > 0 ? LOCKED : li
    const er = this.stun[RIGHT] > 0 || this.revSpin[RIGHT] > 0 ? NO_INPUT : this.hitCharge[RIGHT] > 0 ? LOCKED : ri

    this.tryCrouch(LEFT, el)
    this.tryCrouch(RIGHT, er)
    this.handleBlob(LEFT, el)
    this.handleBlob(RIGHT, er)

    this.deformStep(LEFT, this.frameNo)
    this.deformStep(RIGHT, this.frameNo)
    this.frameNo++
    this.holdStep(LEFT, li, out)
    this.holdStep(RIGHT, ri, out)
    this.spinStep(LEFT, out)
    this.spinStep(RIGHT, out)
    const holding = this.holding()

    if (isGameRunning && !holding) {
      const g = this.ballG()
      // Magnus: a rotação empurra a bola perpendicular ao próprio voo, então
      // ela curva sem ganhar velocidade. Escala com o tempo igual à gravidade.
      if (this.ballSpin !== 0) {
        const k = this.ballSpin * MAGNUS_K * this.tempo
        const vx = this.ballVX, vy = this.ballVY
        this.ballVX = vx - vy * k
        this.ballVY = vy + vx * k
        this.ballSpin *= SPIN_DECAY
        if (this.ballSpin < 0.006 && this.ballSpin > -0.006) this.ballSpin = 0
      }
      if (this.windX !== 0 && this.superFrames === 0) this.ballVX += this.windX * this.tempo
      const bal = this.k(Mod.BALLOON)
      if (bal > 0 && this.superFrames === 0) {
        // balão: arrasto no ar e um tremor errático de lado
        const drag = 1 - 0.012 * bal
        this.ballVX *= drag; this.ballVY *= drag
        this.ballVX += (this.noise(LEFT, 11) - 0.5) * 0.22 * bal
      }
      this.ballX += this.ballVX
      this.ballY += 0.5 * g + this.ballVY
      this.ballVY += g
      this.addCharge(LEFT, SPECIAL_GAIN_FRAME, out)
      this.addCharge(RIGHT, SPECIAL_GAIN_FRAME, out)
      // barra cheia guardada vaza: o especial é pra usar, não pra colecionar
      if (this.charge[LEFT] >= SPECIAL_FULL) this.charge[LEFT] = Math.max(0, this.charge[LEFT] - SPECIAL_LEAK)
      if (this.charge[RIGHT] >= SPECIAL_FULL) this.charge[RIGHT] = Math.max(0, this.charge[RIGHT] - SPECIAL_LEAK)
    }

    this.tryDive(LEFT, el, out)
    this.tryDive(RIGHT, er, out)

    if (isBallValid && !holding) {
      this.tryReversal(LEFT, li, out)
      this.tryReversal(RIGHT, ri, out)
      this.tryParry(LEFT, li, out)
      this.tryParry(RIGHT, ri, out)
      this.tryDig(LEFT, out) || this.handleBlobBallCollision(LEFT, out)
      if (!this.solo) this.tryDig(RIGHT, out) || this.handleBlobBallCollision(RIGHT, out)
    }

    this.prevUp[LEFT] = li.up ? 1 : 0
    this.prevUp[RIGHT] = ri.up ? 1 : 0
    this.prevSpecial[LEFT] = li.special ? 1 : 0
    this.prevSpecial[RIGHT] = ri.special ? 1 : 0
    this.prevDown[LEFT] = li.down ? 1 : 0
    this.prevDown[RIGHT] = ri.down ? 1 : 0
    this.prevDive[LEFT] = li.dive ? 1 : 0
    this.prevDive[RIGHT] = ri.dive ? 1 : 0
    this.prevHit[LEFT] = li.hit ? 1 : 0
    this.prevHit[RIGHT] = ri.hit ? 1 : 0

    if (!holding) this.handleBallWorldCollisions(out)
    if (isGameRunning && !holding) this.ball2Step(out)

    if (this.blobX[LEFT] + BLOBBY_LOWER_RADIUS > NET_POSITION_X - NET_RADIUS)
      this.blobX[LEFT] = NET_POSITION_X - NET_RADIUS - BLOBBY_LOWER_RADIUS
    if (this.blobX[RIGHT] - BLOBBY_LOWER_RADIUS < NET_POSITION_X + NET_RADIUS)
      this.blobX[RIGHT] = NET_POSITION_X + NET_RADIUS + BLOBBY_LOWER_RADIUS
    // com a quadra aberta dá pra ir buscar a bola fora da linha
    const outer = this.wallsOn ? 0 : OPEN_MARGIN
    if (this.blobX[LEFT] < LEFT_PLANE - outer) this.blobX[LEFT] = LEFT_PLANE - outer
    if (this.blobX[RIGHT] > RIGHT_PLANE + outer) this.blobX[RIGHT] = RIGHT_PLANE + outer

    const speed = Math.sqrt(this.ballVX * this.ballVX + this.ballVY * this.ballVY)
    if (!isGameRunning) this.ballRot -= this.ballAngVel
    else {
      const base = (this.ballVX > 0 ? 1 : -1) * this.ballAngVel * (speed / 6)
      this.ballRot += base + this.ballSpin * SPIN_ROT
    }

    if (this.ballRot <= 0) this.ballRot = 6.25 + this.ballRot
    else if (this.ballRot >= 6.25) this.ballRot = this.ballRot - 6.25
  }

  resetBall(side: number, out?: MatchEvent[]) {
    if (out) this.applyModsOnServe(out)
    this.ball2On = 0
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
    this.hold[LEFT] = 0; this.hold[RIGHT] = 0
    this.stun[LEFT] = 0; this.stun[RIGHT] = 0
    this.digActive[LEFT] = 0; this.digActive[RIGHT] = 0
    this.ballOut = 0
    this.digCd[LEFT] = 0; this.digCd[RIGHT] = 0
    this.hitCharge[LEFT] = 0; this.hitCharge[RIGHT] = 0
    this.swingT[LEFT] = 0; this.swingT[RIGHT] = 0
    this.revSpin[LEFT] = 0; this.revSpin[RIGHT] = 0
    this.superKind = 0
    this.armSpecial[LEFT] = 0; this.armSpecial[RIGHT] = 0
    this.hitLag[LEFT] = 0; this.hitLag[RIGHT] = 0
    this.hitPass[LEFT] = 0; this.hitPass[RIGHT] = 0
    this.revActive[LEFT] = 0; this.revActive[RIGHT] = 0
    this.revCd[LEFT] = 0; this.revCd[RIGHT] = 0
    this.diveFrames[LEFT] = 0; this.diveFrames[RIGHT] = 0
    this.diveRecover[LEFT] = 0; this.diveRecover[RIGHT] = 0
    this.diveCd[LEFT] = 0; this.diveCd[RIGHT] = 0
    this.ballSpin = 0
    this.tempo = 1
  }
}
