import {
  BALL_GRAVITATION, BALL_RADIUS, GROUND_PLANE_HEIGHT_MAX, LEFT, NET_POSITION_X,
  NET_RADIUS, NET_SPHERE_POSITION, NO_PLAYER, RIGHT, RIGHT_PLANE, other,
} from './constants.ts'
import type { Side } from './constants.ts'
import { Ev } from './events.ts'
import type { RuleSet } from './logic.ts'
import type { Match } from './match.ts'

/**
 * Mira: minigame de um jogador só. O campo da frente está vazio e uma faixa
 * acesa marca onde a bola tem que cair; a máquina devolve a bola, você tem três
 * toques pra derrubar lá dentro. Três erros e acabou.
 */

/** Faixa no chão, em unidades de quadra. `state` é o que ela acabou de virar. */
export interface TargetMark {
  x0: number
  x1: number
  /** 0 esperando, 1 a bola caiu dentro, -1 caiu fora */
  state: 0 | 1 | -1
}

export const DRILL_LIVES = 3

/**
 * Sem placar: quem termina o jogo é a contagem de vidas, não a regra. Errar é
 * só o fim da bola — o ponto vale 0 pra `winner` nunca aparecer.
 */
export const DRILL_RULES: RuleSet = {
  id: 'drill', name: 'Mira', desc: 'três toques pra derrubar a bola no alvo.',
  scoreToWin: 999,
  isWinning: () => false,
  onBallHitsPlayer(g, p) { if (g.touches[p] > 3) g.mistake(p, other(p), 0) },
  onBallHitsGround(g, p) { g.mistake(p, other(p), 0) },
}

/** Quantos acertos até a dificuldade estar no talo. */
const RAMP = 24

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Folga mínima entre a bola e o topo da rede na reposição. */
const NET_CLEAR = NET_SPHERE_POSITION - BALL_RADIUS - NET_RADIUS - 18

const BEST_KEY = 'bv.drill.best'

/** Recorde guardado neste aparelho. O menu mostra sem precisar do minigame. */
export function drillBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 }
}

export class Drill {
  hits = 0
  lives = DRILL_LIVES
  best = 0
  over = false
  mark: TargetMark | null = null

  /** 1 acerto, -1 erro, 0 nada neste frame. Zera ao ser lido. */
  private result: 0 | 1 | -1 = 0
  private live = false
  private wait = 40

  constructor() {
    this.best = drillBest()
  }

  takeResult() { const r = this.result; this.result = 0; return r }

  /** Nível 0..1: dita largura do alvo, espera da reposição e tempo de voo. */
  private get k() { return Math.min(1, this.hits / RAMP) }

  private rnd() { return Math.random() }

  private pickTarget() {
    const w = lerp(200, 90, this.k)
    const lo = NET_POSITION_X + 10
    const hi = RIGHT_PLANE - 10 - w
    const x0 = lo + this.rnd() * Math.max(0, hi - lo)
    this.mark = { x0, x1: x0 + w, state: 0 }
  }

  /**
   * Reposição: a bola nasce alta no campo vazio e cruza a rede num lob. O tempo
   * de voo cresce até o arco passar por cima da rede — arco baixo demais bate
   * nela e a bola volta antes de chegar em ninguém.
   */
  private launch(m: Match) {
    const w = m.world, g = m.logic
    const half = NET_POSITION_X
    const x0 = half + 80 + this.rnd() * (half - 160)
    const y0 = 130 + this.rnd() * 50
    const xT = half * 0.25 + this.rnd() * half * 0.5
    const yT = GROUND_PLANE_HEIGHT_MAX - BALL_RADIUS
    const gr = BALL_GRAVITATION
    const f = (half - x0) / (xT - x0)
    let T = lerp(80, 58, this.k)
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
    g.touches[LEFT] = 0
    g.touches[RIGHT] = 0
    g.rally = 0
    g.isBallValid = true
    g.isGameRunning = true
    this.live = true
    this.pickTarget()
    m.events.push({ event: Ev.RESET_BALL, side: NO_PLAYER, intensity: 0 })
  }

  private land(x: number) {
    const t = this.mark
    this.live = false
    const good = !!t && x >= t.x0 && x <= t.x1
    if (t) t.state = good ? 1 : -1
    if (good) {
      this.hits++
      this.result = 1
      if (this.hits > this.best) {
        this.best = this.hits
        try { localStorage.setItem(BEST_KEY, String(this.best)) } catch { /* sem storage */ }
      }
    } else {
      this.lives--
      this.result = -1
      if (this.lives <= 0) { this.over = true; this.mark = null }
    }
    this.wait = this.over ? 1e9 : Math.round(lerp(100, 30, this.k))
  }

  /**
   * Roda depois do passo da simulação. Devolve true quando teleportou a bola:
   * quem chama tem que capturar o quadro duas vezes, senão a interpolação
   * desenha um risco da posição velha até a nova.
   */
  after(m: Match): boolean {
    const g = m.logic
    // o saque embutido não existe aqui: quem repõe a bola é o minigame
    g.servingPlayer = NO_PLAYER
    if (this.over) return false

    if (this.live) {
      for (const e of m.events) {
        if (e.event === Ev.BALL_HIT_GROUND) { this.land(m.world.ballX); break }
        if (e.event === Ev.PLAYER_ERROR && (e.side as Side) === LEFT) { this.land(-1e9); break }
      }
      return false
    }

    if (--this.wait > 0) return false
    this.launch(m)
    return true
  }
}
