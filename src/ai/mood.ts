import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Side } from '../core/constants.ts'
import type { Difficulty } from './bot.ts'

/** Índices em EMOTES, na ordem em que estão lá. */
const LAUGH = 0, CRY = 1, RAGE = 2, FINGER = 3, TAUNT = 4
const NONE = -1

/**
 * Temperamento do bot. Nada disso entra na simulação — é reação a evento que
 * já aconteceu, sorteada na hora, então pode usar `Math.random` à vontade.
 */
interface Temper {
  /** chance de abrir a boca num ponto qualquer */
  talk: number
  /** perdeu o ponto: acima disso xinga, abaixo chora */
  salt: number
  /** ganhou o ponto: acima disso zoa, abaixo só ri */
  smug: number
  /** chance do dedo quando é humilhação: fatality e fim de partida */
  rude: number
  /** segundos de boca fechada depois de falar */
  cool: number
}

const TEMPER: Record<Difficulty, Temper> = {
  easy: { talk: 0.28, salt: 0.18, smug: 0.20, rude: 0.00, cool: 5.0 },
  normal: { talk: 0.44, salt: 0.52, smug: 0.46, rude: 0.06, cool: 3.6 },
  hard: { talk: 0.62, salt: 0.72, smug: 0.70, rude: 0.20, cool: 2.8 },
  insane: { talk: 0.82, salt: 0.86, smug: 0.90, rude: 0.44, cool: 2.0 },
}

/**
 * A cara que o bot faz. Ele fala mais quando a partida desanda pro lado dele —
 * três pontos seguidos perdidos e ele reclama de qualquer jeito, que é o que
 * separa um adversário de um sparring.
 */
export class BotMood {
  private lastAt = -1e9
  private lost = 0
  private won = 0
  private t: Temper

  constructor(private side: Side, diff: Difficulty) {
    this.t = TEMPER[diff] ?? TEMPER.normal
  }

  /** Reage aos eventos do quadro. Devolve o emote, ou -1 se ficar quieto. */
  react(events: MatchEvent[]): number {
    for (const e of events) {
      const mine = e.side === this.side
      if (e.event === Ev.FATALITY) {
        return this.say(mine
          ? (Math.random() < this.t.rude ? FINGER : LAUGH)
          : CRY, true)
      }
      if (e.event === Ev.PLAYER_ERROR) {
        if (mine) {
          this.lost++; this.won = 0
          if (!this.rolls(this.lost)) return NONE
          return this.say(Math.random() < this.t.salt ? RAGE : CRY)
        }
        this.won++; this.lost = 0
        if (!this.rolls(this.won)) return NONE
        return this.say(Math.random() < this.t.smug ? TAUNT : LAUGH)
      }
      if (e.event === Ev.SPECIAL_WASTED && mine && Math.random() < this.t.talk * 0.45) {
        return this.say(RAGE)
      }
      if (e.event === Ev.PARRY && mine && Math.random() < this.t.talk * 0.4) {
        return this.say(TAUNT)
      }
    }
    return NONE
  }

  /** Provocação do humano. O bot não deixa barato. */
  answer(id: number): number {
    if (Math.random() > this.t.talk) return NONE
    if (id === FINGER) return this.say(Math.random() < this.t.rude ? FINGER : RAGE, true)
    if (id === LAUGH || id === TAUNT) return this.say(Math.random() < this.t.salt ? RAGE : TAUNT, true)
    if (id === CRY) return this.say(LAUGH, true)
    return NONE
  }

  /** Fim de partida: sempre tem algo a dizer. */
  finish(won: boolean): number {
    return this.say(won ? (Math.random() < this.t.rude ? FINGER : LAUGH) : CRY, true)
  }

  /** Maré ruim solta a língua: na terceira seguida ele fala de qualquer jeito. */
  private rolls(streak: number) {
    if (streak >= 3) return true
    return Math.random() < this.t.talk
  }

  private say(id: number, force = false) {
    const now = performance.now()
    if (!force && now - this.lastAt < this.t.cool * 1000) return NONE
    this.lastAt = now
    return id
  }
}
