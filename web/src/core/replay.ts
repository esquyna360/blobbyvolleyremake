import { Match, allocState } from './match.ts'
import { unpackInput } from './input.ts'
import type { ArenaId, SideOrNone } from './constants.ts'

/**
 * Sobe sempre que física, regra ou ordem de eventos mudar. Replay gravado com
 * outra versão não reproduz o mesmo jogo — melhor não mostrar do que mentir.
 */
export const SIM_VERSION = 15

export type ReplayMode = 'bot' | 'local' | 'online'

export interface ReplayMeta {
  rule: string
  stw: number
  arena: ArenaId
  /** Paredes laterais ligadas. Ausente em gravação antiga: era sempre ligado. */
  walls?: boolean
  /** Regra do cenário. Ausente em gravação antiga: cenário era só pintura. */
  serve: SideOrNone
  nl: string
  nr: string
  sl: number
  sr: number
  rally: number
  frames: number
  mode: ReplayMode
  at: number
}

const MAX_FRAMES = 60 * 60 * 30

/** Um byte de input por jogador por frame. Meia hora de jogo cabe em 200 KB. */
export class Recorder {
  private l = new Uint8Array(8192)
  private r = new Uint8Array(8192)
  private n = 0

  get frames() { return this.n }

  reset() { this.n = 0 }

  private grow(need: number) {
    if (need <= this.l.length) return
    let cap = this.l.length
    while (cap < need) cap *= 2
    const l = new Uint8Array(cap); l.set(this.l); this.l = l
    const r = new Uint8Array(cap); r.set(this.r); this.r = r
  }

  put(frame: number, lb: number, rb: number) {
    if (frame < 0 || frame >= MAX_FRAMES) return
    this.grow(frame + 1)
    this.l[frame] = lb
    this.r[frame] = rb
    if (frame + 1 > this.n) this.n = frame + 1
  }

  /** O online só confirma inputs em blocos: entra por faixa, não frame a frame. */
  putRange(start: number, l: Uint8Array, r: Uint8Array) {
    for (let k = 0; k < l.length; k++) this.put(start + k, l[k], r[k])
  }

  /** Só vale gravar o que é contínuo desde o frame 0. */
  take(): { l: Uint8Array; r: Uint8Array } {
    return { l: this.l.slice(0, this.n), r: this.r.slice(0, this.n) }
  }
}

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const cs = new CompressionStream('gzip')
    const w = cs.writable.getWriter()
    void w.write(bytes)
    void w.close()
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  } catch { return null }
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const ds = new DecompressionStream('gzip')
    const w = ds.writable.getWriter()
    void w.write(bytes)
    void w.close()
    return new Uint8Array(await new Response(ds.readable).arrayBuffer())
  } catch { return null }
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let k = 0; k < bytes.length; k += 8192) {
    s += String.fromCharCode(...bytes.subarray(k, k + 8192))
  }
  return btoa(s)
}

function unb64(str: string): Uint8Array<ArrayBuffer> {
  const raw = atob(str)
  const out = new Uint8Array(raw.length)
  for (let k = 0; k < raw.length; k++) out[k] = raw.charCodeAt(k)
  return out
}

/**
 * Os dois lados vão em blocos separados: cada jogador segura o mesmo botão por
 * dezenas de frames, e run longo comprime muito melhor do que intercalado.
 */
export async function encodeReplay(l: Uint8Array, r: Uint8Array): Promise<string> {
  const raw = new Uint8Array(l.length + r.length)
  raw.set(l, 0)
  raw.set(r, l.length)
  const z = await gzip(raw)
  return z ? `g${b64(z)}` : `r${b64(raw)}`
}

export async function decodeReplay(data: string): Promise<{ l: Uint8Array; r: Uint8Array } | null> {
  if (!data || data.length < 2) return null
  let raw: Uint8Array<ArrayBuffer> | null
  try { raw = unb64(data.slice(1)) } catch { return null }
  if (data[0] === 'g') raw = (await gunzip(raw)) as Uint8Array<ArrayBuffer> | null
  if (!raw || raw.length < 2 || raw.length % 2 !== 0) return null
  const n = raw.length / 2
  return { l: raw.subarray(0, n), r: raw.subarray(n) }
}

export const REPLAY_SPEEDS = [0.5, 1, 2, 4]

/** Reproduz do frame 0 com os inputs gravados. Mesmo papel do Spectator, sem rede. */
export class ReplayPlayer {
  readonly match: Match
  speed = 1
  paused = false
  private zero = allocState()

  constructor(readonly meta: ReplayMeta, private l: Uint8Array, private r: Uint8Array) {
    this.match = new Match(meta.rule, meta.stw || undefined, meta.serve, meta.walls !== false)
    this.match.save(this.zero)
  }

  get frames() { return this.l.length }
  get done() { return this.match.frame >= this.l.length }

  advance(): boolean {
    if (this.paused || this.done) return false
    const f = this.match.frame
    this.match.step(unpackInput(this.l[f]), unpackInput(this.r[f]))
    return true
  }

  /** Voltar re-simula do zero: exato e barato, uns poucos ms pra uma partida inteira. */
  seek(frame: number) {
    const to = Math.max(0, Math.min(frame, this.l.length))
    if (to < this.match.frame) this.match.restore(this.zero)
    while (this.match.frame < to) {
      const f = this.match.frame
      this.match.step(unpackInput(this.l[f]), unpackInput(this.r[f]))
    }
  }
}
