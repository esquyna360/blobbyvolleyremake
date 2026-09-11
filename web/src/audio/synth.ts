/**
 * As vozes da trilha. Cada uma monta e agenda um nó por nota e se desmonta
 * sozinha — nada aqui guarda estado entre notas, então o sequenciador pode
 * disparar centenas por segundo sem contabilidade.
 */

export interface Rack {
  ctx: AudioContext
  /** barramento seco da música */
  out: GainNode
  /** envio de reverb, compartilhado com os efeitos */
  wet: GainNode
  noise: AudioBuffer
}

/** t = quando tocar, hz = frequência, v = 0..1, dur = segundos. */
export type Voice = (r: Rack, t: number, hz: number, v: number, dur: number) => void

function env(r: Rack, t: number, peak: number, attack: number, decay: number, sustain: number, dur: number, release: number) {
  const g = r.ctx.createGain()
  const p = g.gain
  const hold = Math.max(dur, attack + 0.01)
  p.setValueAtTime(0.0001, t)
  p.linearRampToValueAtTime(peak, t + attack)
  p.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + attack + decay)
  p.setValueAtTime(Math.max(0.0001, peak * sustain), t + hold)
  p.exponentialRampToValueAtTime(0.0001, t + hold + release)
  return { node: g, end: t + hold + release }
}

function osc(r: Rack, type: OscillatorType, hz: number, t: number, end: number, detune = 0) {
  const o = r.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(hz, t)
  if (detune) o.detune.setValueAtTime(detune, t)
  o.start(t)
  o.stop(end + 0.02)
  return o
}

function noiseSrc(r: Rack, t: number, end: number, rate = 1) {
  const s = r.ctx.createBufferSource()
  s.buffer = r.noise
  s.loop = true
  s.playbackRate.setValueAtTime(rate, t)
  s.start(t, Math.random() * 2)
  s.stop(end + 0.02)
  return s
}

function filt(r: Rack, type: BiquadFilterType, hz: number, q = 1) {
  const f = r.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = hz
  f.Q.value = q
  return f
}

function vibrato(r: Rack, target: AudioParam, t: number, end: number, rate: number, cents: number, delay = 0) {
  const lfo = r.ctx.createOscillator()
  lfo.frequency.value = rate
  const depth = r.ctx.createGain()
  depth.gain.setValueAtTime(0.0001, t)
  depth.gain.linearRampToValueAtTime(cents, t + delay + 0.15)
  lfo.connect(depth).connect(target)
  lfo.start(t)
  lfo.stop(end + 0.02)
}

function send(r: Rack, node: AudioNode, amount: number) {
  if (amount <= 0) return
  const g = r.ctx.createGain()
  g.gain.value = amount
  node.connect(g).connect(r.wet)
}

// --------------------------------------------------------------- afinadas

const bass: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.5, 0.006, 0.09, 0.65, dur, 0.06)
  const f = filt(r, 'lowpass', hz * 5, 6)
  f.frequency.setValueAtTime(hz * 6, t)
  f.frequency.exponentialRampToValueAtTime(Math.max(80, hz * 2), t + 0.14)
  osc(r, 'sawtooth', hz, t, e.end).connect(f)
  osc(r, 'sine', hz / 2, t, e.end).connect(f)
  f.connect(e.node).connect(r.out)
}

const sub: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.6, 0.01, 0.12, 0.8, dur, 0.12)
  osc(r, 'sine', hz, t, e.end).connect(e.node)
  e.node.connect(r.out)
}

const pad: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.16, 0.45, 0.4, 0.85, dur, 0.9)
  const f = filt(r, 'lowpass', 1500, 0.7)
  for (const d of [-8, 6]) osc(r, 'sawtooth', hz, t, e.end, d).connect(f)
  osc(r, 'triangle', hz * 2, t, e.end).connect(f)
  f.connect(e.node).connect(r.out)
  send(r, e.node, 0.5)
}

const marimba: Voice = (r, t, hz, v) => {
  const e = env(r, t, v * 0.5, 0.004, 0.3, 0.001, 0.02, 0.12)
  osc(r, 'sine', hz, t, e.end).connect(e.node)
  const h = r.ctx.createGain()
  h.gain.value = 0.22
  osc(r, 'sine', hz * 4, t, t + 0.12).connect(h).connect(e.node)
  e.node.connect(r.out)
  send(r, e.node, 0.18)
}

/**
 * Steel drum é FM: uma senoide modulando a outra num índice que cai rápido.
 * O ataque sai metálico e a cauda vira nota limpa.
 */
const steeldrum: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.42, 0.005, 0.35, 0.28, dur, 0.3)
  const car = osc(r, 'sine', hz, t, e.end)
  const mod = osc(r, 'sine', hz * 3.5, t, e.end)
  const idx = r.ctx.createGain()
  idx.gain.setValueAtTime(hz * 3.4, t)
  idx.gain.exponentialRampToValueAtTime(hz * 0.25, t + 0.28)
  mod.connect(idx).connect(car.frequency)
  car.connect(e.node).connect(r.out)
  send(r, e.node, 0.3)
}

const saw: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.2, 0.006, 0.08, 0.7, dur, 0.07)
  const f = filt(r, 'lowpass', 2600, 3)
  osc(r, 'sawtooth', hz, t, e.end).connect(f)
  osc(r, 'sawtooth', hz, t, e.end, 9).connect(f)
  f.connect(e.node).connect(r.out)
}

const square: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.17, 0.008, 0.1, 0.7, dur, 0.08)
  const o = osc(r, 'square', hz, t, e.end)
  vibrato(r, o.detune, t, e.end, 5.2, 7, 0.12)
  const f = filt(r, 'lowpass', 3400, 1)
  o.connect(f).connect(e.node).connect(r.out)
  send(r, e.node, 0.2)
}

/** Chip: pulso estreito, sem filtro e sem vibrato. Tem que soar duro. */
const pulse: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.15, 0.002, 0.04, 0.85, dur, 0.02)
  osc(r, 'square', hz, t, e.end).connect(e.node)
  osc(r, 'square', hz, t, e.end, 22).connect(e.node)
  e.node.connect(r.out)
}

const tri: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.3, 0.002, 0.05, 0.9, dur, 0.03)
  osc(r, 'triangle', hz, t, e.end).connect(e.node)
  e.node.connect(r.out)
}

const harp: Voice = (r, t, hz, v) => {
  const e = env(r, t, v * 0.34, 0.004, 0.9, 0.001, 0.02, 0.4)
  osc(r, 'triangle', hz, t, e.end).connect(e.node)
  const h = r.ctx.createGain()
  h.gain.value = 0.14
  osc(r, 'sine', hz * 3, t, t + 0.3).connect(h).connect(e.node)
  e.node.connect(r.out)
  send(r, e.node, 0.4)
}

const accordion: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.15, 0.05, 0.1, 0.9, dur, 0.1)
  const f = filt(r, 'bandpass', 1250, 0.8)
  for (const d of [-7, 0, 7]) {
    const o = osc(r, 'sawtooth', hz, t, e.end, d)
    vibrato(r, o.detune, t, e.end, 4.6, 5, 0.2)
    o.connect(f)
  }
  const hp = filt(r, 'highpass', 180, 0.6)
  f.connect(hp).connect(e.node).connect(r.out)
  send(r, e.node, 0.3)
}

const violin: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.15, 0.13, 0.12, 0.92, dur, 0.22)
  const o = osc(r, 'sawtooth', hz, t, e.end)
  vibrato(r, o.detune, t, e.end, 5.6, 11, 0.18)
  const f = filt(r, 'lowpass', hz * 6 + 900, 1.4)
  o.connect(f)
  osc(r, 'sawtooth', hz, t, e.end, -6).connect(f)
  f.connect(e.node).connect(r.out)
  send(r, e.node, 0.45)
}

const banjo: Voice = (r, t, hz, v) => {
  const e = env(r, t, v * 0.26, 0.002, 0.22, 0.001, 0.02, 0.1)
  const f = filt(r, 'highpass', 320, 0.8)
  osc(r, 'square', hz, t, e.end).connect(f)
  osc(r, 'sawtooth', hz * 2, t, t + 0.08).connect(f)
  f.connect(e.node).connect(r.out)
  send(r, e.node, 0.22)
}

const organ: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.13, 0.01, 0.05, 0.95, dur, 0.06)
  for (const [mul, amp] of [[1, 1], [2, 0.5], [3, 0.3], [4, 0.18]] as [number, number][]) {
    const g = r.ctx.createGain()
    g.gain.value = amp
    osc(r, 'sine', hz * mul, t, e.end).connect(g).connect(e.node)
  }
  e.node.connect(r.out)
  send(r, e.node, 0.35)
}

const bell: Voice = (r, t, hz, v) => {
  const e = env(r, t, v * 0.24, 0.003, 1.6, 0.001, 0.02, 0.6)
  for (const [mul, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.16]] as [number, number][]) {
    const g = r.ctx.createGain()
    g.gain.value = amp
    osc(r, 'sine', hz * mul, t, e.end).connect(g).connect(e.node)
  }
  e.node.connect(r.out)
  send(r, e.node, 0.6)
}

const whistle: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.2, 0.07, 0.1, 0.9, dur, 0.14)
  const o = osc(r, 'sine', hz, t, e.end)
  vibrato(r, o.detune, t, e.end, 5.9, 16, 0.16)
  o.connect(e.node)
  const air = r.ctx.createGain()
  air.gain.value = v * 0.012
  noiseSrc(r, t, e.end).connect(filt(r, 'bandpass', hz * 2, 8)).connect(air).connect(e.node)
  e.node.connect(r.out)
  send(r, e.node, 0.5)
}

const brass: Voice = (r, t, hz, v, dur) => {
  const e = env(r, t, v * 0.17, 0.055, 0.1, 0.88, dur, 0.14)
  const f = filt(r, 'lowpass', hz * 2, 2.4)
  f.frequency.setValueAtTime(hz * 1.4, t)
  f.frequency.linearRampToValueAtTime(hz * 6 + 600, t + 0.09)
  for (const d of [-5, 5]) osc(r, 'sawtooth', hz, t, e.end, d).connect(f)
  f.connect(e.node).connect(r.out)
  send(r, e.node, 0.4)
}

const pluck: Voice = (r, t, hz, v) => {
  const e = env(r, t, v * 0.3, 0.003, 0.4, 0.001, 0.02, 0.15)
  const f = filt(r, 'lowpass', hz * 5 + 400, 1.2)
  osc(r, 'sawtooth', hz, t, e.end).connect(f)
  f.connect(e.node).connect(r.out)
  send(r, e.node, 0.25)
}

// ------------------------------------------------------------- percussão

function drumEnv(r: Rack, t: number, peak: number, dur: number, attack = 0.001) {
  const g = r.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  return { node: g, end: t + dur }
}

function boom(r: Rack, t: number, from: number, to: number, drop: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const e = drumEnv(r, t, peak, dur, 0.002)
  const o = osc(r, type, from, t, e.end)
  o.frequency.exponentialRampToValueAtTime(to, t + drop)
  o.connect(e.node).connect(r.out)
  return e
}

function hiss(r: Rack, t: number, type: BiquadFilterType, hz: number, q: number, dur: number, peak: number, wet = 0) {
  const e = drumEnv(r, t, peak, dur)
  noiseSrc(r, t, e.end).connect(filt(r, type, hz, q)).connect(e.node).connect(r.out)
  send(r, e.node, wet)
  return e
}

const kick: Voice = (r, t, _hz, v) => {
  boom(r, t, 150, 42, 0.075, 0.3, v * 0.9)
  hiss(r, t, 'lowpass', 2200, 0.7, 0.02, v * 0.14)
}

const kick808: Voice = (r, t, _hz, v) => {
  boom(r, t, 110, 38, 0.14, 0.62, v * 1.0)
}

const snare: Voice = (r, t, _hz, v) => {
  boom(r, t, 210, 150, 0.05, 0.11, v * 0.28, 'triangle')
  hiss(r, t, 'bandpass', 1900, 0.9, 0.16, v * 0.5, 0.2)
}

const clap: Voice = (r, t, _hz, v) => {
  for (let i = 0; i < 3; i++) hiss(r, t + i * 0.009, 'bandpass', 1500, 1.4, 0.06, v * 0.34)
  hiss(r, t + 0.028, 'bandpass', 1200, 1.1, 0.19, v * 0.3, 0.25)
}

const hat: Voice = (r, t, hz, v) => {
  // pitch 46 no GM é o chimbal aberto; qualquer coisa acima de 44 abre
  const open = hz > 100
  hiss(r, t, 'highpass', 8200, 0.7, open ? 0.24 : 0.045, v * (open ? 0.24 : 0.3))
}

const crash: Voice = (r, t, _hz, v) => {
  hiss(r, t, 'highpass', 4800, 0.5, 1.5, v * 0.3, 0.5)
}

const ride: Voice = (r, t, _hz, v) => {
  hiss(r, t, 'bandpass', 6400, 1.2, 0.6, v * 0.24, 0.3)
  const e = drumEnv(r, t, v * 0.07, 0.5)
  osc(r, 'sine', 2400, t, e.end).connect(e.node).connect(r.out)
}

const stick: Voice = (r, t, _hz, v) => {
  boom(r, t, 900, 500, 0.01, 0.045, v * 0.3, 'triangle')
  hiss(r, t, 'highpass', 2600, 0.7, 0.03, v * 0.2)
}

const tom: Voice = (r, t, hz, v) => {
  boom(r, t, hz * 2.2, hz * 1.2, 0.1, 0.34, v * 0.55)
  hiss(r, t, 'lowpass', 1800, 0.7, 0.03, v * 0.1)
}

const conga_hi: Voice = (r, t, _hz, v) => {
  boom(r, t, 340, 250, 0.045, 0.19, v * 0.45)
  hiss(r, t, 'bandpass', 1400, 1.6, 0.03, v * 0.12)
}

const conga_low: Voice = (r, t, _hz, v) => {
  boom(r, t, 210, 150, 0.06, 0.28, v * 0.5)
  hiss(r, t, 'bandpass', 900, 1.6, 0.03, v * 0.1)
}

const maracas: Voice = (r, t, _hz, v) => { hiss(r, t, 'highpass', 6800, 0.8, 0.05, v * 0.24) }
const shaker: Voice = (r, t, _hz, v) => { hiss(r, t, 'highpass', 5600, 0.6, 0.07, v * 0.2) }
const tambourine: Voice = (r, t, _hz, v) => {
  hiss(r, t, 'highpass', 7400, 0.7, 0.2, v * 0.16, 0.2)
  hiss(r, t, 'bandpass', 9500, 3, 0.05, v * 0.12)
}

const agogo: Voice = (r, t, hz, v) => {
  const e = drumEnv(r, t, v * 0.22, 0.24, 0.002)
  osc(r, 'sine', hz * 6, t, e.end).connect(e.node)
  const g2 = r.ctx.createGain()
  g2.gain.value = 0.4
  osc(r, 'sine', hz * 9.4, t, e.end).connect(g2).connect(e.node)
  e.node.connect(r.out)
  send(r, e.node, 0.25)
}

/** Ruído de chip: a "bateria" do Game Boy é um canal só. */
const chipnoise: Voice = (r, t, hz, v) => {
  hiss(r, t, 'bandpass', Math.max(300, hz * 4), 0.8, 0.07, v * 0.26)
}

const thunder: Voice = (r, t, _hz, v, dur) => {
  const e = drumEnv(r, t, v * 0.5, Math.max(1.2, dur), 0.04)
  const f = filt(r, 'lowpass', 900, 0.6)
  f.frequency.setValueAtTime(1400, t)
  f.frequency.exponentialRampToValueAtTime(120, t + 1.4)
  noiseSrc(r, t, e.end, 0.4).connect(f).connect(e.node).connect(r.out)
  send(r, e.node, 0.6)
}

/** Trilho: o tec-tec é percussão afinada curta, não bateria. */
const rail: Voice = (r, t, _hz, v) => {
  hiss(r, t, 'bandpass', 3200, 2.4, 0.035, v * 0.22)
  boom(r, t, 260, 180, 0.02, 0.05, v * 0.14)
}

export const VOICES: Record<string, Voice> = {
  bass, sub, pad, marimba, steeldrum, saw, square, pulse, tri, harp,
  accordion, violin, banjo, organ, bell, whistle, brass, pluck,
  kick, kick808, snare, clap, hat, crash, ride, stick, tom,
  conga_hi, conga_low, maracas, shaker, tambourine, agogo,
  chipnoise, thunder, rail,
}
