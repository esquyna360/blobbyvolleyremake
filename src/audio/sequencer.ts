import { VOICES } from './synth.ts'
import type { Rack } from './synth.ts'
import { midiHz, stepSeconds } from './song.ts'
import type { Song } from './song.ts'

/** Quanto o agendador enche à frente. Curto demais engasga se a aba atrasa. */
const AHEAD = 0.35
const TICK_MS = 45
const TIERS = 4
/** Camada entra e sai em rampa: corte seco estala. */
const TIER_FADE = 0.25

interface Hit {
  voice: string
  hz: number
  vel: number
  /** duração em passos: em segundos depende do andamento da hora */
  steps: number
  frac: number
  tier: number
}

/**
 * Toca uma música do jogo nota a nota. O andamento é uma variável, então
 * acelerar com o rally não custa nada — e as camadas ligam por tier, sempre
 * na virada do compasso, pra não entrarem no meio da frase.
 */
export class Sequencer {
  private rack: Rack
  private tierGain: GainNode[] = []
  private song: Song | null = null
  private grid: Hit[][] = []
  private total = 0
  private spb = 16

  private step = 0
  private nextTime = 0
  private timer = 0
  private running = false

  bpm = 112
  private bpmTarget = 112
  private wantTier = 0
  private liveTier = -1
  private drumsOnlyUntil = 0

  /** Em que segundo do relógio de áudio o compasso corrente começou. */
  private barAt = 0
  private barLen = 2

  constructor(rack: Rack) {
    this.rack = rack
    for (let i = 0; i < TIERS; i++) {
      const g = rack.ctx.createGain()
      g.gain.value = i === 0 ? 1 : 0
      g.connect(rack.out)
      this.tierGain.push(g)
    }
  }

  get playing() { return this.running }
  get songId() { return this.song?.id ?? '' }

  /**
   * Fase do compasso em 0..1 no instante pedido. É o que deixa o cenário
   * pulsar no mesmo tempo que a música sem duplicar o relógio.
   */
  barPhase(at = this.rack.ctx.currentTime) {
    if (!this.running || this.barLen <= 0) return 0
    const k = (at - this.barAt) / this.barLen
    return k - Math.floor(k)
  }

  /** Tempo, não compasso: em 6/8 o compasso tem três tempos, não quatro. */
  beatPhase(at = this.rack.ctx.currentTime) {
    const k = this.barPhase(at) * (this.spb / 4)
    return k - Math.floor(k)
  }

  load(song: Song) {
    const same = this.song?.id === song.id
    this.song = song
    this.spb = song.spb
    this.total = song.bars * song.spb
    this.grid = Array.from({ length: this.total }, () => [] as Hit[])
    for (const tr of song.tracks) {
      const voice = VOICES[tr.v] ? tr.v : 'pluck'
      for (let i = 0; i < tr.n.length; i += 4) {
        const step = tr.n[i]
        const idx = Math.floor(step) % this.total
        this.grid[idx].push({
          voice,
          hz: midiHz(tr.n[i + 1]),
          vel: (tr.n[i + 2] / 127) * tr.gain,
          steps: tr.n[i + 3],
          frac: step - Math.floor(step),
          tier: Math.min(TIERS - 1, Math.max(0, tr.tier)),
        })
      }
    }
    if (!same) {
      this.bpm = song.bpm
      this.bpmTarget = song.bpm
      this.step = 0
    }
  }

  /** `mult` vem do rally: 1 é o andamento escrito, 1.5 é o teto. */
  setTempo(mult: number) {
    if (!this.song) return
    this.bpmTarget = this.song.bpm * Math.max(0.5, Math.min(1.8, mult))
  }

  /** Camadas ativas: 0 só a base, 3 tudo. Entra na próxima virada de compasso. */
  setTier(tier: number) {
    this.wantTier = Math.max(0, Math.min(TIERS - 1, Math.round(tier)))
  }

  /** Especial disparado: sobra só a percussão por um compasso. O corte chama
   * mais atenção do que qualquer efeito somado por cima. */
  cutToDrums(bars = 1) {
    this.drumsOnlyUntil = this.rack.ctx.currentTime + this.barLen * bars
  }

  start(song: Song, atStep = 0) {
    this.load(song)
    if (this.running) return
    this.step = atStep % Math.max(1, this.total)
    this.nextTime = this.rack.ctx.currentTime + 0.06
    this.barAt = this.nextTime
    this.running = true
    this.liveTier = -1
    this.applyTier(0, true, this.nextTime)
    this.timer = setInterval(() => this.pump(), TICK_MS) as unknown as number
    this.pump()
  }

  stop(fade = 0.5) {
    if (!this.running) return
    this.running = false
    clearInterval(this.timer)
    const t = this.rack.ctx.currentTime
    for (const g of this.tierGain) {
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(0.0001, t, fade / 3)
    }
    this.liveTier = -1
  }

  /** Chamado também pelo loop do jogo: o setInterval sozinho é estrangulado
   * quando a aba sai da frente. */
  pump() {
    if (!this.running || !this.song) return
    const ctx = this.rack.ctx
    const now = ctx.currentTime
    if (this.nextTime < now) this.nextTime = now + 0.02
    let guard = 0
    while (this.nextTime < now + AHEAD && guard++ < 512) {
      if (this.step % this.spb === 0) {
        this.barAt = this.nextTime
        this.barLen = stepSeconds(this.bpm) * this.spb
        this.applyTier(this.wantTier, false, this.nextTime)
      }
      this.schedule(this.step, this.nextTime)
      const sd = stepSeconds(this.bpm)
      this.nextTime += sd
      this.step = (this.step + 1) % this.total
      this.bpm += (this.bpmTarget - this.bpm) * Math.min(1, sd / 0.4)
    }
  }

  private applyTier(tier: number, force: boolean, at: number) {
    if (tier === this.liveTier && !force) return
    this.liveTier = tier
    const t = Math.max(at, this.rack.ctx.currentTime)
    for (let i = 0; i < TIERS; i++) {
      const g = this.tierGain[i].gain
      g.cancelScheduledValues(t)
      g.setTargetAtTime(i <= tier ? 1 : 0.0001, t, TIER_FADE / 3)
    }
  }

  private schedule(step: number, at: number) {
    const hits = this.grid[step]
    if (!hits.length) return
    const sd = stepSeconds(this.bpm)
    const drumsOnly = at < this.drumsOnlyUntil
    for (const h of hits) {
      if (h.tier > this.liveTier) continue
      if (drumsOnly && !PERC.has(h.voice)) continue
      VOICES[h.voice](this.rack, at + h.frac * sd, h.hz, h.vel, Math.max(0.03, h.steps * sd * 0.94))
    }
  }
}

const PERC = new Set([
  'kick', 'kick808', 'snare', 'clap', 'hat', 'crash', 'ride', 'stick', 'tom',
  'conga_hi', 'conga_low', 'maracas', 'shaker', 'tambourine', 'agogo', 'chipnoise', 'rail',
])
