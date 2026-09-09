import { LEFT, RIGHT, GROUND_PLANE_HEIGHT } from '../core/constants.ts'
import type { Side, SideOrNone } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { PhysicWorld } from '../core/physics.ts'

export const FATALITY_SFX = `${import.meta.env.BASE_URL}fatality.mp3`

export const VOLUMES: [string, string, string][] = [
  ['off', 'Mudo', 'silêncio'],
  ['low', 'Baixo', 'de fundo'],
  ['normal', 'Normal', 'equilibrado'],
  ['loud', 'Alto', 'no talo'],
]

export type VolumeId = 'off' | 'low' | 'normal' | 'loud'
const LEVEL: Record<VolumeId, number> = { off: 0, low: 0.35, normal: 0.7, loud: 1.0 }

const PAD_NOTES = [110.0, 164.81, 246.94, 329.63, 415.3]

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private amb!: GainNode
  private noise!: AudioBuffer
  private wet!: GainNode
  private gullTimer = 0
  private grounded = [true, true]
  private landVel = [0, 0]

  volume: VolumeId

  constructor() {
    const saved = localStorage.getItem('bv.volume') as VolumeId | null
    this.volume = saved && saved in LEVEL ? saved : 'low'
  }

  /** Browsers only allow audio after a gesture, so this is called from the first click/keypress. */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return }
    const ctx = new AudioContext()
    this.ctx = ctx

    this.master = ctx.createGain()
    this.master.gain.value = LEVEL[this.volume]
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -8
    limiter.knee.value = 12
    limiter.ratio.value = 6
    limiter.attack.value = 0.004
    limiter.release.value = 0.2
    this.master.connect(limiter).connect(ctx.destination)

    this.sfx = ctx.createGain()
    this.sfx.gain.value = 1.0
    this.sfx.connect(this.master)

    this.amb = ctx.createGain()
    this.amb.gain.value = 0
    this.amb.connect(this.master)

    const conv = ctx.createConvolver()
    conv.buffer = this.impulse(1.6, 2.4)
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.22
    this.wet.connect(conv).connect(this.master)
    this.sfx.connect(this.wet)

    this.noise = this.noiseBuffer(4)
    this.buildAmbience()
    this.amb.gain.setTargetAtTime(1, ctx.currentTime, 3.5)
    this.gullTimer = ctx.currentTime + 12
  }

  setVolume(v: VolumeId) {
    this.volume = v
    localStorage.setItem('bv.volume', v)
    if (this.ctx) this.master.gain.setTargetAtTime(LEVEL[v], this.ctx.currentTime, 0.08)
  }

  toggle(): VolumeId {
    const next: VolumeId = this.volume === 'off' ? 'normal' : 'off'
    this.setVolume(next)
    return next
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
      src.connect(lp).connect(g).connect(p).connect(this.amb)
    }

    // constant breeze
    const wind = this.loopNoise()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 520
    bp.Q.value = 0.5
    const wg = ctx.createGain()
    this.lfo(0.055, 0.022, 0.042, wg.gain)
    wind.connect(bp).connect(wg).connect(this.amb)

    // slow chord drone, voices fading in and out on their own clocks
    const pad = ctx.createGain()
    pad.gain.value = 0.055
    const padLp = ctx.createBiquadFilter()
    padLp.type = 'lowpass'
    padLp.Q.value = 0.9
    this.lfo(0.021, 380, 860, padLp.frequency)
    padLp.connect(pad).connect(this.amb)
    pad.connect(this.wet)

    for (let i = 0; i < PAD_NOTES.length; i++) {
      const o = ctx.createOscillator()
      o.type = i < 2 ? 'sine' : 'triangle'
      o.frequency.value = PAD_NOTES[i]
      o.detune.value = (Math.random() - 0.5) * 9
      const g = ctx.createGain()
      this.lfo(1 / (13 + i * 4.7), 0.5, 0.5, g.gain)
      const still = ctx.createGain()
      still.gain.value = 0.18 / (1 + i * 0.55)
      o.connect(g).connect(still).connect(padLp)
      o.start()
    }
  }

  private gull(t: number) {
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

  push(pan = 0) {
    if (!this.ctx) return
    this.thump(150, 0.35, 0.12, 0.16, 'triangle')
    this.burst(0.07, 0.07, 'highpass', 2600, 0.9, pan)
  }

  /** Parry: estalo metálico brilhante subindo. */
  parry(pan = 0) {
    if (!this.ctx) return
    this.thump(880, 2.6, 0.22, 0.2, 'square')
    this.bell(1568, 0, 0.7, 0.2)
    this.bell(2349, 0.02, 0.55, 0.13)
    this.burst(0.16, 0.16, 'highpass', 4200, 1.1, pan)
  }

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
      o.connect(g).connect(this.master!)
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
        case Ev.PUSH_HIT: this.push(panOf(world.blobX[e.side as Side])); break
        case Ev.PARRY: this.parry(panOf(world.blobX[e.side as Side])); break
        case Ev.PARRY_TRY: this.parryWhiff(panOf(world.blobX[e.side as Side])); break
        case Ev.FATALITY: this.fatality(panOf(world.blobX[e.side as Side])); break
      }
    }

    for (const s of [LEFT, RIGHT] as Side[]) {
      const down = world.blobY[s] >= GROUND_PLANE_HEIGHT
      if (down && !this.grounded[s]) this.land(this.landVel[s] / 14, panOf(world.blobX[s]))
      if (!down) this.landVel[s] = world.blobVY[s]
      this.grounded[s] = down
    }

    if (ctx.currentTime > this.gullTimer) {
      this.gull(ctx.currentTime + Math.random() * 0.4)
      this.gullTimer = ctx.currentTime + 28 + Math.random() * 45
    }
  }
}
