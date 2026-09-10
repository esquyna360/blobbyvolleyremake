import {
  BLOBBY_UPPER_SPHERE, HAND_REACH, LEFT, RIGHT, SPECIAL_FULL, SPECIAL_REACH,
  SPIKE_MIN_HOLD, other,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'

export type Mood =
  | 'calm' | 'focus' | 'worry' | 'panic' | 'shock'
  | 'laugh' | 'sad' | 'angry' | 'smug' | 'hurt'
  | 'aim' | 'slick' | 'whiff' | 'dumb'

export interface FacePose {
  /** 0 fechada .. 1 escancarada */
  open: number
  /** -1 emburrado .. +1 sorriso */
  curve: number
  /** -1 bravo (interno pra baixo) .. +1 preocupado (interno pra cima) */
  brow: number
  /** 0 fechado .. 1 normal .. 1.5 arregalado */
  lid: number
  tear: number
}

const POSES: Record<Mood, FacePose> = {
  calm: { open: 0.04, curve: 0.20, brow: 0.00, lid: 1.00, tear: 0 },
  focus: { open: 0.02, curve: -0.08, brow: -0.22, lid: 0.84, tear: 0 },
  worry: { open: 0.22, curve: -0.45, brow: 0.75, lid: 1.12, tear: 0 },
  panic: { open: 0.70, curve: -0.60, brow: 1.00, lid: 1.40, tear: 0.2 },
  shock: { open: 1.00, curve: -0.05, brow: 0.90, lid: 1.50, tear: 0 },
  laugh: { open: 0.82, curve: 1.00, brow: 0.30, lid: 0.14, tear: 0.4 },
  sad: { open: 0.14, curve: -0.88, brow: 0.95, lid: 0.60, tear: 1 },
  angry: { open: 0.48, curve: -0.72, brow: -1.00, lid: 0.70, tear: 0 },
  smug: { open: 0.04, curve: 0.78, brow: -0.40, lid: 0.52, tear: 0 },
  hurt: { open: 0.88, curve: -0.95, brow: -0.50, lid: 0.26, tear: 0.5 },
  // bola no raio: olho apertado, boca fechada, sobrancelha baixa
  aim: { open: 0.05, curve: -0.05, brow: -0.62, lid: 0.36, tear: 0 },
  // mão certeira: sorriso torto de quem sabia o que ia fazer
  slick: { open: 0.30, curve: 0.95, brow: -0.22, lid: 0.32, tear: 0 },
  // mão no vazio: olho fechado de vergonha e boca engolida
  whiff: { open: 0.26, curve: -0.58, brow: 0.28, lid: 0.08, tear: 0.25 },
  // barra queimada à toa: queixo caído, cara de bobo
  dumb: { open: 1.00, curve: -0.28, brow: 1.00, lid: 0.30, tear: 0.85 },
}

const mix = (a: FacePose, b: FacePose, k: number): FacePose => ({
  open: a.open + (b.open - a.open) * k,
  curve: a.curve + (b.curve - a.curve) * k,
  brow: a.brow + (b.brow - a.brow) * k,
  lid: a.lid + (b.lid - a.lid) * k,
  tear: a.tear + (b.tear - a.tear) * k,
})

/** Cara neutra puxada pela tensão do rally: tranquilo → concentrado → preocupado. */
function idlePose(t: number): FacePose {
  if (t <= 0.02) return POSES.calm
  return t < 0.5
    ? mix(POSES.calm, POSES.focus, t / 0.5)
    : mix(POSES.focus, POSES.worry, (t - 0.5) / 0.5)
}

/**
 * Uma cara por jogador, com prioridade: levar um especial na fuça não pode ser
 * atropelado pelo rosto de concentração do frame seguinte.
 */
export class FaceRig {
  readonly cur: FacePose = { ...POSES.calm }
  blink = 1
  private target: FacePose = POSES.calm
  private mood: Mood = 'calm'
  private hold = 0
  private prio = 0
  private blinkAt = Math.random() * 4
  private shake = 0

  set(mood: Mood, hold: number, prio = 1) {
    if (this.hold > 0 && prio < this.prio) return
    this.mood = mood
    this.hold = hold
    this.prio = prio
    this.target = POSES[mood]
    if (mood === 'shock' || mood === 'hurt' || mood === 'panic') this.shake = 1
  }

  reset() {
    this.hold = 0
    this.prio = 0
    this.mood = 'calm'
    this.target = POSES.calm
    Object.assign(this.cur, POSES.calm)
  }

  get current(): Mood { return this.mood }
  /** Tremida curta pra sustos e pancadas; quem desenha usa como quiser. */
  get jitter() { return this.shake }

  update(dt: number, tension: number, ballNear: boolean) {
    if (this.hold > 0) {
      this.hold -= dt
      if (this.hold <= 0) { this.prio = 0; this.mood = 'calm' }
    }
    if (this.hold <= 0) this.target = idlePose(tension)

    const k = Math.min(1, dt * 10)
    const c = this.cur, t = this.target
    c.open += (Math.max(t.open, ballNear && this.hold <= 0 ? 0.3 : 0) - c.open) * k
    c.curve += (t.curve - c.curve) * k
    c.brow += (t.brow - c.brow) * k
    c.lid += (t.lid - c.lid) * k
    c.tear += (t.tear - c.tear) * Math.min(1, dt * 4)

    this.shake = Math.max(0, this.shake - dt * 3.5)

    this.blinkAt -= dt
    if (this.blinkAt <= 0) { this.blinkAt = 2.5 + Math.random() * 4; this.blink = 0 }
    this.blink = Math.min(1, this.blink + dt * 7)
  }
}

/** Quanto de "aperto" o rally atual gera, 0..1. Começa a pesar lá pelo sexto toque. */
export const rallyTension = (rally: number) =>
  Math.max(0, Math.min(1, (rally - 3) / 14))

/**
 * Mesmas reações nos dois renderers: quem desenha só lê `cur`.
 * Os placares chegam já atualizados, então o erro do ponto olha o placar final.
 */
export function faceEvents(rigs: FaceRig[], events: MatchEvent[], scores: number[], stw: number) {
  for (const e of events) {
    const s = e.side as Side
    switch (e.event) {
      case Ev.PARRY:
        rigs[s].set('smug', 1.0, 3)
        rigs[other(s)].set('shock', 1.0, 3)
        break
      case Ev.PARRY_TRY:
        rigs[s].set('panic', 0.45, 2)
        break
      case Ev.SPECIAL_READY:
        rigs[s].set('smug', 0.9, 2)
        break
      case Ev.SPECIAL_FIRED:
        rigs[s].set('angry', 0.8, 2)
        rigs[other(s)].set('shock', 0.9, 3)
        break
      case Ev.SPECIAL_HIT:
        rigs[s].set('laugh', 1.3, 3)
        rigs[other(s)].set('hurt', 1.5, 4)
        break
      case Ev.DIG:
        rigs[s].set('focus', 0.55, 2)
        break
      case Ev.SPIKE_LEAP:
        rigs[s].set('angry', 0.8, 2)
        rigs[other(s)].set('worry', 0.7, 2)
        break
      case Ev.SPIKE_HIT:
        rigs[s].set('smug', 0.9, 3)
        rigs[other(s)].set('shock', 0.7, 3)
        break
      case Ev.HAND_HIT:
        rigs[s].set('slick', 1.1, 3)
        rigs[other(s)].set('worry', 0.8, 2)
        break
      case Ev.HAND_MISS:
        rigs[s].set('whiff', 1.2, 3)
        rigs[other(s)].set('laugh', 0.8, 2)
        break
      case Ev.SPECIAL_WASTED:
        rigs[s].set('dumb', 1.7, 4)
        rigs[other(s)].set('laugh', 1.3, 3)
        break
      case Ev.FATALITY:
        rigs[s].set('laugh', 2.6, 5)
        rigs[other(s)].set('hurt', 2.6, 5)
        break
      case Ev.PLAYER_ERROR: {
        const loser = s
        const winner = other(loser)
        const gap = scores[winner] - scores[loser]
        const matchPoint = scores[winner] >= stw - 1
        const bitter = gap >= 3 || matchPoint || Math.random() < 0.3
        rigs[loser].set(bitter ? 'angry' : 'sad', 2.0, 3)
        rigs[winner].set(gap >= 3 ? 'smug' : 'laugh', 2.0, 3)
        break
      }
    }
  }
}

/**
 * Agachar não é evento, é estado: a cara tem que acompanhar o frame inteiro.
 * Prioridade 1 pra que qualquer reação de evento continue passando por cima.
 */
export function crouchMoods(rigs: FaceRig[], crouch: number[], charge: number[]) {
  for (const s of SIDES) {
    if (crouch[s] < 0.45) continue
    rigs[s].set(charge[s] >= SPIKE_MIN_HOLD ? 'angry' : 'focus', 0.06, 1)
  }
}

/**
 * Bola dentro do alcance da mão ou do especial pronto: a cara mira antes do
 * botão. Prioridade 1, então qualquer reação de evento passa por cima.
 */
export function reachMoods(
  rigs: FaceRig[],
  w: { blobX: number[]; blobY: number[]; ballX: number; ballY: number; handCd: number[]; charge: number[] },
  valid: boolean,
) {
  if (!valid) return
  for (const s of SIDES) {
    const dx = w.ballX - w.blobX[s]
    const dy = w.ballY - (w.blobY[s] - BLOBBY_UPPER_SPHERE)
    const d2 = dx * dx + dy * dy
    const ready = w.handCd[s] === 0 ? HAND_REACH : 0
    const sp = w.charge[s] >= SPECIAL_FULL ? SPECIAL_REACH : 0
    const r = Math.max(ready, sp)
    if (r > 0 && d2 < r * r) rigs[s].set('aim', 0.06, 1)
  }
}

export const SIDES: Side[] = [LEFT, RIGHT]
