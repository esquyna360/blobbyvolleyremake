import { LEFT, RIGHT, GROUND_PLANE_HEIGHT } from '../core/constants.ts'
import type { Side, SideOrNone } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { PhysicWorld } from '../core/physics.ts'
import { Sequencer } from './sequencer.ts'
import { loadSong } from './song.ts'
import type { Rack } from './synth.ts'

export const FATALITY_SFX = `${import.meta.env.BASE_URL}fatality.mp3`

/**
 * Rally parado não é rally mudo: o piso do volume e do filtro tem que deixar a
 * trilha audível já no saque.
 */
const musicGain = (k: number) => 0.62 + Math.max(0, Math.min(1, k)) * 0.24
const musicCut = (k: number) => {
  const kk = Math.max(0, Math.min(1, k))
  return 2600 + kk * kk * 14000
}

/**
 * Andamento e camadas em função do rally, como o compositor pediu: sobe rápido
 * nos primeiros toques e desacelera perto do teto de 1.5x.
 */
export const tempoForRally = (rally: number) =>
  1 + 0.5 * Math.pow(Math.min(rally, 24) / 24, 0.75)

export const tierForRally = (rally: number, matchPoint: boolean) =>
  rally >= 20 || matchPoint ? 3 : rally >= 10 ? 2 : rally >= 5 ? 1 : 0

export type VolumeBus = 'music' | 'sfx'

/** Nomes antigos do seletor de quatro degraus, pra não perder quem já tinha ajustado. */
const OLD_LEVEL: Record<string, number> = { off: 0, low: 0.35, normal: 0.7, loud: 1 }
const DEFAULT_VOL = 0.35

const readVol = (key: string, fallback: number) => {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  if (raw in OLD_LEVEL) return OLD_LEVEL[raw]
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}

/** Ouvido não é linear: o meio do curso tem que soar como metade. */
const curve = (v: number) => v * v


export class GameAudio {
  private ctx: AudioContext | null = null
  private sfxBus!: GainNode
  private musicBus!: GainNode
  private sfx!: GainNode
  private amb!: GainNode
  private noise!: AudioBuffer
  private wet!: GainNode
  private gullTimer = 0
  private pulseAt = 0
  private grounded = [true, true]
  private landVel = [0, 0]

  private music!: GainNode
  private musicLp!: BiquadFilterNode
  private musicWet!: GainNode
  private seq: Sequencer | null = null
  private surf: GainNode[] = []
  private crowd: GainNode | null = null
  /** praia e luau têm mar e bicho; ginásio tem plateia. */
  private outdoor = true
  private playing = false
  private paused = false
  private songId = ''
  private intensity = 0

  /** Trilha e efeitos têm controle separado, cada um em 0..1. */
  musicVol: number
  sfxVol: number

  constructor() {
    const fallback = readVol('bv.volume', DEFAULT_VOL)
    this.musicVol = readVol('bv.vol.music', fallback)
    this.sfxVol = readVol('bv.vol.sfx', fallback)
  }

  /** A tecla de mudo olha o conjunto: se sobrou som, ainda dá pra calar. */
  get volume() { return Math.max(this.musicVol, this.sfxVol) }

  /** Sem música tocando não há batida: o cenário precisa saber pra não ficar
   * parado no auge do pulso. */
  get musicOn() { return !!this.seq?.playing }
  get beatPhase() { return this.seq?.beatPhase() ?? 0 }
  get barPhase() { return this.seq?.barPhase() ?? 0 }

  /** Browsers only allow audio after a gesture, so this is called from the first click/keypress. */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return }
    const ctx = new AudioContext()
    this.ctx = ctx

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.knee.value = 12
    limiter.ratio.value = 6
    limiter.attack.value = 0.004
    limiter.release.value = 0.2
    limiter.connect(ctx.destination)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = curve(this.sfxVol)
    this.sfxBus.connect(limiter)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = curve(this.musicVol)
    this.musicBus.connect(limiter)

    this.sfx = ctx.createGain()
    this.sfx.gain.value = 1.0
    this.sfx.connect(this.sfxBus)

    this.amb = ctx.createGain()
    this.amb.gain.value = 0
    this.amb.connect(this.sfxBus)

    const conv = ctx.createConvolver()
    conv.buffer = this.impulse(1.6, 2.4)
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.22
    this.wet.connect(conv).connect(this.sfxBus)
    this.sfx.connect(this.wet)

    this.music = ctx.createGain()
    this.music.gain.value = musicGain(0)
    this.musicLp = ctx.createBiquadFilter()
    this.musicLp.type = 'lowpass'
    this.musicLp.Q.value = 0.4
    this.musicLp.frequency.value = musicCut(0)
    this.musicLp.connect(this.music).connect(this.musicBus)

    this.noise = this.noiseBuffer(4)

    // reverb próprio da trilha: o dos efeitos vive no barramento errado
    const musicConv = ctx.createConvolver()
    musicConv.buffer = this.impulse(2.1, 2.8)
    const musicWet = ctx.createGain()
    musicWet.gain.value = 0.3
    this.musicWet = musicWet
    musicWet.connect(musicConv).connect(this.musicLp)
    const seqOut = ctx.createGain()
    seqOut.connect(this.musicLp)
    const rack: Rack = { ctx, out: seqOut, wet: musicWet, noise: this.noise }
    this.seq = new Sequencer(rack)

    this.buildAmbience()
    if (this.chip) this.applyChip()
    this.gullTimer = ctx.currentTime + 12
    if (this.playing && !this.chip) this.amb.gain.setTargetAtTime(1, ctx.currentTime, 2.0)
    if (this.songId) void this.startSong(this.songId)
  }

  setVolume(v: number, bus: VolumeBus | 'both' = 'both') {
    const k = Math.max(0, Math.min(1, v))
    if (bus !== 'sfx') {
      this.musicVol = k
      localStorage.setItem('bv.vol.music', String(k))
      if (this.ctx) this.musicBus.gain.setTargetAtTime(curve(k), this.ctx.currentTime, 0.08)
    }
    if (bus !== 'music') {
      this.sfxVol = k
      localStorage.setItem('bv.vol.sfx', String(k))
      if (this.ctx) this.sfxBus.gain.setTargetAtTime(curve(k), this.ctx.currentTime, 0.08)
    }
  }

  getVolume(bus: VolumeBus) { return bus === 'music' ? this.musicVol : this.sfxVol }

  /** Tecla M: guarda os dois níveis pra devolver exatamente como estavam. */
  toggle() {
    if (this.volume > 0) {
      this.mutedPair = [this.musicVol, this.sfxVol]
      this.setVolume(0)
      return false
    }
    const [m, s] = this.mutedPair
    this.setVolume(m || DEFAULT_VOL, 'music')
    this.setVolume(s || DEFAULT_VOL, 'sfx')
    return true
  }

  private mutedPair: [number, number] = [DEFAULT_VOL, DEFAULT_VOL]

  // ---------- música e ambiente ----------

  /**
   * O ambiente — mar, plateia, bicho — só existe com bola em jogo. A trilha
   * não: o menu tem a dele, então aqui só troca quem está tocando.
   */
  setPlaying(on: boolean) {
    if (this.playing === on) return
    this.playing = on
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.amb.gain.setTargetAtTime(on && !this.chip ? 1 : 0, t, on ? 0.6 : 0.35)
    if (!on) this.paused = false
  }

  /**
   * Pausa não é silêncio nem parada: a faixa continua tocando abaixo do
   * audível. Cortar aqui faria a música recomeçar do zero ao despausar.
   */
  setPaused(on: boolean) {
    if (this.paused === on) return
    this.paused = on
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.amb.gain.setTargetAtTime(this.chip ? 0 : on ? 0.12 : 1, t, 0.3)
    const g = this.music.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(on ? 0.05 : musicGain(this.intensity), t, 0.3)
    this.musicLp.frequency.setTargetAtTime(on ? 480 : musicCut(this.intensity), t, 0.3)
  }

  /** Troca o ambiente pro cenário escolhido. */
  setScene(outdoor: boolean) {
    this.outdoor = outdoor
    if (!this.ctx) return
    const t = this.ctx.currentTime
    for (const b of this.surf) b.gain.setTargetAtTime(outdoor ? 1 : 0, t, 0.5)
    if (this.crowd) this.crowd.gain.setTargetAtTime(outdoor ? 0 : 0.055, t, 0.5)
  }

  /**
   * Troca a trilha. Trocar pra mesma não faz nada — é o que deixa voltar do
   * menu de pausa sem a música recomeçar do começo.
   */
  setSong(id: string) {
    this.realSong = id
    if (this.chip) id = 'gameboy'
    if (id === this.songId) return
    this.songId = id
    void this.startSong(id)
  }

  private async startSong(id: string) {
    const seq = this.seq
    if (!seq) return
    let song
    try { song = await loadSong(id) } catch { return }
    if (this.songId !== id || !this.seq) return
    if (seq.playing && seq.songId !== id) seq.stop(0.4)
    if (seq.playing) { seq.load(song); return }
    setTimeout(() => {
      if (this.songId !== id) return
      seq.start(song)
      seq.setTier(this.tier)
      seq.setTempo(this.tempo)
    }, seq.songId && seq.songId !== id ? 420 : 0)
  }

  /** Deixa o JSON no cache antes da hora. Uma música do jogo tem 20 KB, mas
   * fetch no meio do saque ainda custa um engasgo. */
  preload(id: string) { void loadSong(id).catch(() => undefined) }

  private tier = 0
  private tempo = 1

  /** Modo 8 bits: pulse/triângulo/ruído 1-bit, envelope em degraus, sem reverb nem ambiente. */
  private chip = false
  private chipNoise: AudioBuffer | null = null
  private pulse25: PeriodicWave | null = null
  private pulse12: PeriodicWave | null = null
  private realSong = ''

  setChip(on: boolean) {
    if (this.chip === on) return
    this.chip = on
    if (this.ctx) this.applyChip()
    const want = this.realSong
    if (want) { this.songId = ''; this.setSong(want) }
  }

  private applyChip() {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const on = this.chip
    this.wet.gain.setTargetAtTime(on ? 0 : 0.22, t, 0.1)
    this.musicWet.gain.setTargetAtTime(on ? 0 : 0.3, t, 0.1)
    this.amb.gain.setTargetAtTime(on ? 0 : this.playing ? 1 : 0, t, 0.3)
    if (on && !this.chipNoise) {
      const n = Math.floor(ctx.sampleRate * 2)
      const buf = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = buf.getChannelData(0)
      let lfsr = 0x7fff, v = 1
      const hold = Math.max(1, Math.round(ctx.sampleRate / 22050))
      for (let i = 0; i < n; i++) {
        if (i % hold === 0) {
          const bit = (lfsr ^ (lfsr >> 1)) & 1
          lfsr = (lfsr >> 1) | (bit << 14)
          v = (lfsr & 1) ? 0.5 : -0.5
        }
        d[i] = v
      }
      this.chipNoise = buf
      const wave = (duty: number) => {
        const N = 32
        const re = new Float32Array(N), im = new Float32Array(N)
        for (let k = 1; k < N; k++) {
          re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty)
          im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * Math.PI * duty))
        }
        return ctx.createPeriodicWave(re, im, { disableNormalization: false })
      }
      this.pulse25 = wave(0.25)
      this.pulse12 = wave(0.125)
    }
  }

  /** Volume em 16 degraus, como o registrador de um chip de som. */
  private stepEnv(g: AudioParam, t: number, peak: number, dur: number) {
    const steps = 16
    g.setValueAtTime(peak, t)
    for (let i = 1; i <= steps; i++) {
      const k = 1 - i / steps
      g.setValueAtTime(peak * Math.pow(k, 1.6), t + (dur * i) / steps)
    }
    g.setValueAtTime(0, t + dur + 0.001)
  }

  private chipTone(freq: number, end: number, dur: number, gain: number, kind: 'tri' | 'sq' | 'p25' | 'p12', when = 0) {
    const ctx = this.ctx!
    const t = ctx.currentTime + when
    const o = ctx.createOscillator()
    if (kind === 'tri') o.type = 'triangle'
    else if (kind === 'sq') o.type = 'square'
    else o.setPeriodicWave((kind === 'p25' ? this.pulse25 : this.pulse12)!)
    const steps = Math.max(1, Math.round(dur * 60))
    for (let i = 0; i <= steps; i++) {
      const k = i / steps
      o.frequency.setValueAtTime(Math.max(20, freq * Math.pow(end / freq, k)), t + dur * k)
    }
    const g = ctx.createGain()
    this.stepEnv(g.gain, t, gain * (kind === 'tri' ? 1.4 : 0.6), dur)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private chipHiss(dur: number, gain: number, rate: number, pan = 0) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.chipNoise
    src.playbackRate.value = rate
    const g = ctx.createGain()
    this.stepEnv(g.gain, t, gain * 0.7, dur)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(g).connect(p).connect(this.sfx)
    src.start(t, Math.random() * 1.5, dur + 0.05)
    src.stop(t + dur + 0.05)
  }

  /**
   * O rally manda no andamento e nas camadas. Não é a mesma faixa mais alta:
   * é a mesma faixa mais rápida e com mais gente tocando.
   */
  setRally(rally: number, matchPoint: boolean) {
    const tier = tierForRally(rally, matchPoint)
    const tempo = tempoForRally(rally) + (matchPoint ? 0.04 : 0)
    this.tier = tier
    this.tempo = tempo
    if (this.paused) return
    this.seq?.setTier(tier)
    this.seq?.setTempo(tempo)
  }

  /** Abre o filtro conforme o rally aperta. É o brilho, não o volume. */
  setIntensity(k: number) {
    this.intensity = k
    if (!this.ctx || this.paused) return
    const t = this.ctx.currentTime
    const kk = Math.max(0, Math.min(1, k))
    this.musicLp.frequency.setTargetAtTime(musicCut(kk), t, 0.5)
    this.music.gain.setTargetAtTime(musicGain(kk), t, 0.6)
  }

  /** Especial disparado: sobra a percussão por um compasso. */
  cutToDrums(bars = 1) { this.seq?.cutToDrums(bars) }

  /** Ponto marcado: a música dá um passo atrás por um instante. */
  duckMusic(seconds = 1.1) {
    if (!this.ctx || this.paused) return
    const t = this.ctx.currentTime
    const g = this.music.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(0.16, t, 0.06)
    g.setTargetAtTime(musicGain(this.intensity), t + seconds, 0.5)
  }

  // ---------- buffers ----------

  private noiseBuffer(seconds: number) {
    const ctx = this.ctx!
    const n = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.0990460
      b1 = 0.96300 * b1 + w * 0.2965164
      b2 = 0.57000 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22
    }
    return buf
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const n = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < n; i++) {
        const t = i / n
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.3)
      }
    }
    return buf
  }

  // ---------- ambience ----------

  private lfo(rate: number, depth: number, base: number, target: AudioParam) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.value = rate
    const g = ctx.createGain()
    g.gain.value = depth
    target.value = base
    o.connect(g).connect(target)
    o.start()
    return o
  }

  private loopNoise() {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.start(this.ctx!.currentTime + Math.random() * 2)
    return src
  }

  private buildAmbience() {
    const ctx = this.ctx!

    // surf: three swells at incommensurate periods so it never audibly repeats
    for (const [period, cut, level, pan] of [
      [11.3, 700, 0.15, -0.5], [7.9, 460, 0.11, 0.55], [17.1, 1100, 0.07, 0.05],
    ]) {
      const src = this.loopNoise()
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.Q.value = 0.7
      this.lfo(1 / (period * 1.7), cut * 0.35, cut, lp.frequency)
      const g = ctx.createGain()
      this.lfo(1 / period, level * 0.75, level, g.gain)
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      const bus = ctx.createGain()
      bus.gain.value = 1
      this.surf.push(bus)
      src.connect(lp).connect(g).connect(p).connect(bus).connect(this.amb)
    }

    // plateia do ginásio: ruído grave respirando, entra só em quadra coberta
    const crowd = ctx.createGain()
    crowd.gain.value = 0
    this.crowd = crowd
    const cn = this.loopNoise()
    const cbp = ctx.createBiquadFilter()
    cbp.type = 'bandpass'
    cbp.frequency.value = 400
    cbp.Q.value = 0.32
    const swell = ctx.createGain()
    this.lfo(0.07, 0.5, 0.85, swell.gain)
    cn.connect(cbp).connect(swell).connect(crowd).connect(this.amb)
    crowd.connect(this.wet)
  }

  private gull(t: number) {
    if (this.chip) return
    const ctx = this.ctx!
    const n = 2 + Math.floor(Math.random() * 2)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    pan.connect(this.amb)
    pan.connect(this.wet)
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.22 + Math.random() * 0.1)
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f = 1150 + Math.random() * 420
      o.frequency.setValueAtTime(f, at)
      o.frequency.exponentialRampToValueAtTime(f * 0.55, at + 0.24)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.035, at + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26)
      o.connect(g).connect(pan)
      o.start(at)
      o.stop(at + 0.3)
    }
  }

  // ---------- synth helpers ----------

  private thump(freq: number, drop: number, dur: number, gain: number, type: OscillatorType) {
    if (this.chip) {
      const kind = type === 'sine' ? 'tri' : type === 'sawtooth' ? 'p25' : type === 'square' ? 'p12' : 'sq'
      this.chipTone(freq, Math.max(20, freq * drop), Math.max(0.03, dur), gain, kind)
      return
    }
    const ctx = this.ctx!
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * drop), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private burst(
    dur: number, gain: number, type: BiquadFilterType, freq: number, q: number, pan = 0,
  ) {
    if (this.chip) {
      const rate = type === 'lowpass' ? 0.25 : type === 'highpass' ? 1 : Math.max(0.12, Math.min(1, freq / 3000))
      this.chipHiss(Math.max(0.03, dur), gain, rate, pan)
      return
    }
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const off = Math.random() * (this.noise.duration - dur - 0.05)
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(f).connect(g).connect(p).connect(this.sfx)
    src.start(t, off, dur + 0.05)
    src.stop(t + dur + 0.05)
  }

  private bell(freq: number, when: number, dur: number, gain: number) {
    if (this.chip) {
      this.chipTone(freq, freq, Math.min(0.35, dur * 0.45), gain * 1.3, 'p12', when)
      return
    }
    const ctx = this.ctx!
    const t = ctx.currentTime + when
    for (const [mul, amp] of [[1, 1], [2.01, 0.32], [3.02, 0.11]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * mul
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(this.sfx)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  // ---------- game hooks ----------

  /**
   * Chamado todo frame com a tensão do rally. É daqui que a música respira: o
   * filtro abre, o volume sobe, e só em troca muito longa entra o pulso grave
   * por baixo — antes disso ele só ia brigar com a faixa.
   */
  setTension(t: number) {
    const ctx = this.ctx
    if (!ctx) return
    this.seq?.pump()
    this.setIntensity(t)
    if (t < 0.45) { this.pulseAt = 0; return }
    const period = 0.62 - t * 0.38
    const now = ctx.currentTime
    if (this.pulseAt < now) this.pulseAt = now + 0.03
    while (this.pulseAt < now + 0.3) {
      this.pulse(this.pulseAt, t)
      this.pulseAt += period
    }
  }

  private pulse(at: number, t: number) {
    if (this.chip) return
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(84 + t * 30, at)
    o.frequency.exponentialRampToValueAtTime(44, at + 0.17)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.06 + t * 0.13, at + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24)
    o.connect(g).connect(this.amb)
    o.start(at)
    o.stop(at + 0.28)
  }

  ui() {
    if (!this.ctx) return
    this.burst(0.035, 0.05, 'bandpass', 2200, 2)
    this.thump(880, 0.8, 0.045, 0.035, 'sine')
  }

  hitBlob(intensity: number, pan: number) {
    const i = Math.min(1, Math.max(0, intensity))
    this.thump(150 + i * 110, 0.42, 0.10 + i * 0.06, 0.22 + i * 0.22, 'triangle')
    this.burst(0.05, 0.07 + i * 0.07, 'bandpass', 900 + i * 700, 1.1, pan)
  }

  hitGround(power: number, pan: number) {
    const p = Math.min(1, Math.max(0, power))
    this.thump(95 + p * 35, 0.45, 0.22, 0.14 + p * 0.2, 'sine')
    this.burst(0.20 + p * 0.15, 0.05 + p * 0.08, 'highpass', 2400, 0.7, pan)
  }

  hitNet(pan: number) {
    this.burst(0.13, 0.07, 'bandpass', 620, 3.2, pan)
    this.thump(150, 0.6, 0.07, 0.05, 'sine')
  }

  hitWall(pan: number) {
    this.burst(0.045, 0.05, 'highpass', 3200, 0.8, pan)
    this.thump(760, 0.7, 0.04, 0.03, 'sine')
  }

  land(impact: number, pan: number) {
    const i = Math.min(1, Math.max(0, impact))
    if (i < 0.12) return
    this.burst(0.10 + i * 0.1, 0.04 + i * 0.07, 'lowpass', 1300, 0.8, pan)
  }

  point(mine: boolean) {
    if (!this.ctx) return
    if (mine) { this.bell(523.25, 0, 0.9, 0.115); this.bell(783.99, 0.11, 1.1, 0.09) }
    else { this.bell(392.0, 0, 0.8, 0.085); this.bell(293.66, 0.12, 1.0, 0.07) }
  }

  serve() {
    if (!this.ctx) return
    this.bell(659.25, 0, 0.5, 0.05)
  }

  emote(id: number) {
    if (!this.ctx) return
    if (id === 0) { this.bell(392.0, 0, 0.6, 0.075); this.bell(293.66, 0.14, 0.9, 0.06) }
    else if (id === 1) [523.25, 659.25, 880].forEach((f, i) => this.bell(f, i * 0.08, 0.6, 0.085))
    else { this.thump(660, 0.55, 0.09, 0.07, 'square'); this.thump(880, 0.5, 0.09, 0.055, 'square') }
  }

  special(kind: 'ready' | 'fired' | 'hit', pan = 0) {
    if (!this.ctx) return
    if (kind === 'ready') { this.bell(880, 0, 0.5, 0.07); this.bell(1174.7, 0.09, 0.6, 0.055) }
    else if (kind === 'fired') {
      this.thump(240, 0.25, 0.28, 0.30, 'sawtooth')
      this.burst(0.10, 0.16, 'bandpass', 1800, 1.2, pan)
      this.bell(1318.5, 0.02, 0.5, 0.07)
    } else {
      this.thump(70, 0.5, 0.55, 0.34, 'sine')
      this.burst(0.35, 0.20, 'lowpass', 900, 0.7, pan)
      this.bell(196.0, 0.05, 1.1, 0.09)
    }
  }

  groundBurn(pan = 0) {
    if (!this.ctx) return
    this.thump(46, 0.75, 0.9, 0.4, 'sine')
    this.burst(0.55, 0.34, 'lowpass', 700, 0.6, pan)
    this.burst(0.30, 0.16, 'bandpass', 2400, 1.4, pan)
  }

  /** Mergulho: o grunhido do salto e o corpo arrastando na areia. */
  dive(pan = 0) {
    if (!this.ctx) return
    this.thump(150, 0.5, 0.16, 0.12, 'triangle')
    this.burst(0.34, 0.26, 'lowpass', 1500, 0.7, pan)
  }

  /** Salvou de mergulho: pancada de antebraço com areia voando junto. */
  diveHit(pan = 0) {
    if (!this.ctx) return
    this.thump(190, 1.5, 0.14, 0.2, 'sine')
    this.burst(0.42, 0.3, 'bandpass', 900, 1.6, pan)
    this.bell(1245, 0.02, 0.34, 0.1)
  }

  /** Toque no ápice do pulo: estalo limpo e agudo, o som de acertar em cheio. */
  apexHit(pan = 0) {
    if (!this.ctx) return
    this.thump(430, 1.4, 0.07, 0.12, 'triangle')
    this.bell(2093, 0, 0.4, 0.1)
    this.burst(0.05, 0.05, 'highpass', 5200, 1.0, pan)
  }

  /** Barra queimada à toa: nota que despenca. */
  specialWasted(pan = 0) {
    if (!this.ctx) return
    this.thump(300, 0.1, 0.45, 0.22, 'sawtooth')
    this.burst(0.20, 0.16, 'lowpass', 900, 0.8, pan)
  }

  /** Parry: estalo metálico brilhante subindo. */
  parry(pan = 0) {
    if (!this.ctx) return
    this.thump(880, 2.6, 0.22, 0.2, 'square')
    this.bell(1568, 0, 0.7, 0.2)
    this.bell(2349, 0.02, 0.55, 0.13)
    this.burst(0.16, 0.16, 'highpass', 4200, 1.1, pan)
  }

  /** Manchete: pancada seca e abafada, som de antebraço. */
  dig(pan = 0) {
    if (!this.ctx) return
    this.thump(210, 0.5, 0.09, 0.16, 'triangle')
    this.burst(0.09, 0.06, 'lowpass', 1500, 0.9, pan)
  }

  /** Bola fora: apito seco, sem brilho. */
  ballOut(pan = 0) {
    if (!this.ctx) return
    this.bell(1660, 0.01, 0.16, 0.09)
    this.bell(1245, 0.02, 0.3, 0.07)
    this.burst(0.14, 0.05, 'bandpass', 900, 1.4, pan)
  }

  /** Trovão do raio: estouro grave e longo, com o estalo seco na frente. */
  thunder(pan = 0) {
    if (!this.ctx) return
    this.burst(0.06, 0.04, 'highpass', 5000, 0.9, pan)
    this.thump(34, 0.4, 2.2, 0.5, 'sine')
    this.burst(1.6, 0.8, 'lowpass', 420, 0.5, pan)
    this.burst(0.7, 0.35, 'bandpass', 1400, 1.8, pan)
  }

  /** Cartucho falhando: bipe rachado de console, três degraus pra baixo. */
  glitch(pan = 0) {
    if (!this.ctx) return
    this.thump(1200, 0.05, 0.05, 0.12, 'square')
    this.thump(760, 0.05, 0.05, 0.10, 'square')
    this.thump(430, 0.05, 0.09, 0.09, 'square')
    this.burst(0.06, 0.05, 'bandpass', 3200, 3.0, pan)
  }

  /** Acerto no tempo da batida: estalo curto com a quinta por cima. */
  parryWhiff(pan = 0) {
    if (!this.ctx) return
    this.burst(0.09, 0.05, 'bandpass', 1800, 2.2, pan)
  }

  private voice: HTMLAudioElement | null = null

  fatality(pan = 0) {
    if (!this.ctx) return
    this.thump(38, 0.9, 1.6, 0.45, 'sine')
    this.burst(0.9, 0.55, 'lowpass', 520, 0.5, pan)
    this.burst(0.4, 0.25, 'bandpass', 1600, 1.6, pan)
    let spoke = false
    try {
      const a = this.voice ?? (this.voice = new Audio(FATALITY_SFX))
      a.volume = 0.95
      a.currentTime = 0
      const r = a.play()
      spoke = true
      if (r) void r.catch(() => { this.growl() })
    } catch { spoke = false }
    if (!spoke) this.growl()
  }

  /** Plano B quando o sample externo não carrega: um berro grave sintetizado. */
  private growl() {
    const ctx = this.ctx
    if (!ctx) return
    const t0 = ctx.currentTime
    for (const [f, d] of [[110, 0], [82, 0.26], [62, 0.52]] as [number, number][]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f * 1.6, t0 + d)
      o.frequency.exponentialRampToValueAtTime(f, t0 + d + 0.3)
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.42)
      o.connect(g).connect(this.sfxBus)
      o.start(t0 + d)
      o.stop(t0 + d + 0.5)
    }
  }

  finish(won: boolean) {
    if (!this.ctx) return
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [493.88, 415.3, 329.63]
    notes.forEach((f, i) => this.bell(f, i * 0.14, 1.3, won ? 0.12 : 0.085))
  }

  /** Drives event sounds plus the landing scuffs, which the rules never emit as events. */
  onEvents(events: MatchEvent[], world: PhysicWorld, localSide: SideOrNone) {
    if (!this.ctx) return
    const ctx = this.ctx
    const panOf = (x: number) => Math.max(-0.85, Math.min(0.85, (x - 400) / 400 * 0.7))
    const ballPan = panOf(world.ballX)

    for (const e of events) {
      switch (e.event) {
        case Ev.BALL_HIT_BLOB: this.hitBlob(e.intensity, ballPan); break
        case Ev.BALL_HIT_GROUND: this.hitGround(Math.abs(world.ballVY) / 16, ballPan); break
        case Ev.BALL_HIT_NET:
        case Ev.BALL_HIT_NET_TOP: this.hitNet(ballPan); break
        case Ev.BALL_HIT_WALL: this.hitWall(ballPan); break
        case Ev.PLAYER_ERROR:
          this.point(localSide !== e.side)
          break
        case Ev.RESET_BALL: this.serve(); break
        case Ev.SPECIAL_READY: if (localSide === e.side) this.special('ready'); break
        case Ev.SPECIAL_FIRED: this.special('fired', ballPan); break
        case Ev.SPECIAL_HIT: this.special('hit', panOf(world.blobX[e.side as Side])); break
        case Ev.SPECIAL_GROUND: this.groundBurn(ballPan); break
        case Ev.DIVE: this.dive(panOf(world.blobX[e.side as Side])); break
        case Ev.DIVE_HIT: this.diveHit(panOf(world.blobX[e.side as Side])); break
        case Ev.APEX_HIT: this.apexHit(ballPan); break
        case Ev.SPECIAL_WASTED: this.specialWasted(panOf(world.blobX[e.side as Side])); break
        case Ev.PARRY: this.parry(panOf(world.blobX[e.side as Side])); break
        case Ev.PARRY_TRY: this.parryWhiff(panOf(world.blobX[e.side as Side])); break
        case Ev.DIG: this.dig(panOf(world.blobX[e.side as Side])); break
        case Ev.DROP: this.dig(panOf(world.blobX[e.side as Side])); break
        case Ev.HIT: this.hitBlob(0.6 + e.intensity * 0.4, ballPan); this.apexHit(ballPan); break
        case Ev.REVERSAL: this.parry(panOf(world.blobX[e.side as Side])); this.special('fired', ballPan); break
        case Ev.REVERSAL_TRY: this.parryWhiff(panOf(world.blobX[e.side as Side])); break
        case Ev.TRIP: this.diveHit(panOf(world.blobX[e.side as Side])); break
        case Ev.BALL_OUT: this.ballOut(ballPan); break
        case Ev.FATALITY: this.fatality(panOf(world.blobX[e.side as Side])); break
      }
    }

    for (const s of [LEFT, RIGHT] as Side[]) {
      const down = world.blobY[s] >= GROUND_PLANE_HEIGHT
      if (down && !this.grounded[s]) this.land(this.landVel[s] / 14, panOf(world.blobX[s]))
      if (!down) this.landVel[s] = world.blobVY[s]
      this.grounded[s] = down
    }

    if (this.outdoor && ctx.currentTime > this.gullTimer) {
      this.gull(ctx.currentTime + Math.random() * 0.4)
      this.gullTimer = ctx.currentTime + 28 + Math.random() * 45
    }
  }
}
