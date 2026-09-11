import {
  BALL_GRAVITATION, BALL_RADIUS, GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, NET_POSITION_X,
  NET_RADIUS, NET_SPHERE_POSITION, NO_PLAYER, RIGHT, SPECIAL_CAP,
} from './constants.ts'
import type { Side } from './constants.ts'
import { Ev } from './events.ts'
import type { PlayerInput } from './input.ts'
import type { Match } from './match.ts'

/**
 * Tutorial: um passo por golpe, com a bola reposta pela máquina até sair. O
 * texto usa {jump} {hit} {dive} {special} {down} {move}, que a tela troca pelo
 * nome do botão de quem está jogando.
 */
export interface TutStep {
  title: string
  text: string
  /** quantas vezes o golpe precisa sair */
  need: number
}

export const TUT_STEPS: TutStep[] = [
  { title: 'ANDAR E PULAR', text: '{move} anda, {jump} pula. Anda pros dois lados e pula.', need: 1 },
  { title: 'TOQUE', text: 'Sem apertar nada, a bola quica no corpo. Fica embaixo dela e deixa quicar pro outro lado. Manda 2.', need: 2 },
  { title: 'BATER', text: 'Segura {hit} pra armar: você para e o direcional vira mira. Solta com a bola perto pra bater. Mais tempo segurando, mais força. Manda 3 pro outro lado.', need: 3 },
  { title: 'DEIXADINHA', text: 'Toque rápido em {hit} com a bola perto: bola curta, mal passando a rede. Com {right} segurado ela vai pro fundo em parábola; com {up}, sobe e cai perto da rede. Faz 2.', need: 2 },
  { title: 'CORTADA', text: 'No ar, segura {hit} e mira pra baixo na direção da rede. Cortada é no ar — bate de cima. Faz 2.', need: 2 },
  { title: 'MANCHETE', text: 'No chão, segura {down} e toca {hit} na hora que a bola chega: ela sobe reta pra você cortar. Manchete e depois cortada, 2 vezes.', need: 2 },
  { title: 'MERGULHO', text: 'Bola longe: {dive} joga o corpo pro lado. Defende 2 mergulhando.', need: 2 },
  { title: 'ESPECIAL', text: 'Barra cheia: segura {special}, mira com o direcional e solta com a bola perto. No chão ou no ar. Dispara 2.', need: 2 },
  { title: 'PARRY', text: 'Especial vindo: aperta {hit} na hora exata em que a bola chega. Ela fica na sua mão e volta mais forte. Soltar com {down} vira manchete pra você cortar. Faz 2.', need: 2 },
  { title: 'DOUBLE SPECIAL', text: 'Especial vindo e sua barra cheia: aperta {special} na hora exata. A bola dá a volta no seu corpo e sai ainda mais violenta, com parry mais difícil. Faz 2.', need: 2 },
]

const NET_CLEAR = NET_SPHERE_POSITION - BALL_RADIUS - NET_RADIUS - 18

export class Tutorial {
  step = 0
  count = 0
  done = false
  /** 1 acertou agora, 0 nada, -1 errou. Zera ao ser lido. */
  private result: 0 | 1 | -1 = 0
  private live = false
  private wait = 30
  private movedL = false
  private movedR = false
  private jumped = false
  private digAt = -1
  private advanceIn = -1

  takeResult() { const r = this.result; this.result = 0; return r }
  get current() { return TUT_STEPS[this.step] }
  get need() { return this.current.need }

  private rnd() { return Math.random() }

  /** Repõe a bola num lob que cai perto de `xT`. */
  private feed(m: Match, xT: number, high = false) {
    const w = m.world, g = m.logic
    const half = NET_POSITION_X
    const x0 = half + 120 + this.rnd() * (half - 200)
    const y0 = high ? 100 : 140 + this.rnd() * 40
    const yT = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
    const gr = BALL_GRAVITATION
    const f = (half - x0) / (xT - x0)
    let T = high ? 90 : 72
    let vy = 0
    for (let n = 0; n < 24; n++) {
      vy = (yT - y0 - (gr * T * T) / 2) / T
      if (y0 + f * T * vy + (gr * f * f * T * T) / 2 < NET_CLEAR) break
      T += 4
    }
    w.resetBall(NO_PLAYER)
    w.ballX = x0
    w.ballY = y0
    w.ballVX = (xT - x0) / T
    w.ballVY = vy
    g.touches[LEFT] = 0; g.touches[RIGHT] = 0
    g.rally = 0
    g.isBallValid = true
    g.isGameRunning = true
    this.live = true
    m.events.push({ event: Ev.RESET_BALL, side: NO_PLAYER, intensity: 0 })
  }

  private launch(m: Match) {
    const w = m.world, g = m.logic
    const bx = w.blobX[LEFT]
    switch (this.step) {
      case 6: { // mergulho: cai longe de onde o blob está
        const far = bx < NET_POSITION_X * 0.5 ? bx + 190 + this.rnd() * 60 : bx - 190 - this.rnd() * 60
        this.feed(m, Math.max(60, Math.min(NET_POSITION_X - 70, far)))
        return
      }
      case 7: // especial: barra cheia e bola alta
        w.charge[LEFT] = SPECIAL_CAP
        this.feed(m, bx + 10, true)
        return
      case 8:
      case 9: {
        w.resetBall(NO_PLAYER)
        if (this.step === 9) w.charge[LEFT] = SPECIAL_CAP
        g.touches[LEFT] = 0; g.touches[RIGHT] = 0
        g.isBallValid = true
        g.isGameRunning = true
        w.launchSpecial(RIGHT)
        this.live = true
        m.events.push({ event: Ev.RESET_BALL, side: NO_PLAYER, intensity: 0 })
        return
      }
      default:
        this.feed(m, Math.max(70, Math.min(NET_POSITION_X - 80, bx + (this.rnd() - 0.5) * 60)), this.step === 4)
    }
  }

  private score(good: boolean) {
    if (good) {
      this.count++
      this.result = 1
      if (this.count >= this.need) { this.advanceIn = 70; this.live = false; return }
    } else this.result = -1
  }

  private crossed(m: Match) { return m.world.ballX > NET_POSITION_X + 40 }

  /**
   * Roda depois do passo. Devolve true quando teleportou a bola (quem chama
   * captura o quadro duas vezes).
   */
  after(m: Match, li: PlayerInput): boolean {
    const g = m.logic, w = m.world
    g.servingPlayer = NO_PLAYER
    if (this.done) return false

    if (this.advanceIn > 0) {
      if (--this.advanceIn === 0) {
        this.step++
        this.count = 0
        if (this.step >= TUT_STEPS.length) { this.done = true; return false }
        this.wait = 40
        w.resetBall(NO_PLAYER)
        w.ballY = -200
        g.isBallValid = false
      }
      return false
    }

    if (this.step === 0) {
      if (li.left) this.movedL = true
      if (li.right) this.movedR = true
      if (w.blobY[LEFT] < GROUND_PLANE_HEIGHT - 30) this.jumped = true
      if (this.movedL && this.movedR && this.jumped) this.score(true)
      return false
    }

    if (this.live) {
      let dead = false
      for (const e of m.events) {
        const mine = (e.side as Side) === LEFT
        switch (e.event) {
          case Ev.HIT:
            if (this.step === 2 && mine) this.pendingCross = 90
            if (this.step === 4 && mine && w.blobY[LEFT] < GROUND_PLANE_HEIGHT - 20 && w.ballVY > 0) this.pendingCross = 90
            if (this.step === 5 && mine && this.digAt >= 0 && m.frame - this.digAt < 150 && w.blobY[LEFT] < GROUND_PLANE_HEIGHT - 20) { this.digAt = -1; this.pendingCross = 90 }
            break
          case Ev.DROP: if (this.step === 3 && mine) this.pendingCross = 90; break
          case Ev.BALL_HIT_BLOB: if (this.step === 1 && mine) this.pendingCross = 90; break
          case Ev.DIG: if (this.step === 5 && mine) this.digAt = m.frame; break
          case Ev.DIVE_HIT: if (this.step === 6 && mine) this.score(true); break
          case Ev.SPECIAL_FIRED: if (this.step === 7 && mine) this.score(true); break
          case Ev.PARRY: if (this.step === 8 && mine) this.score(true); break
          case Ev.REVERSAL: if (this.step === 9 && mine) this.score(true); break
          case Ev.SPECIAL_HIT: if (mine) this.score(false); break
          case Ev.BALL_HIT_GROUND:
          case Ev.PLAYER_ERROR:
            dead = true
            break
        }
      }
      if (this.pendingCross > 0) {
        this.pendingCross--
        if (this.crossed(m) && w.ballX < NET_POSITION_X * 2 - 10) { this.pendingCross = 0; this.score(true) }
        else if (this.pendingCross === 0) this.score(false)
      }
      if (dead || w.ballY > GROUND_PLANE_HEIGHT_MAX + 200) {
        this.live = false
        this.pendingCross = 0
        this.wait = this.advanceIn > 0 ? 1e9 : 45
      }
      return false
    }

    if (--this.wait > 0) return false
    this.launch(m)
    return true
  }
  private pendingCross = 0
}
