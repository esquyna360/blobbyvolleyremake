import type { RealtimeChannel } from '@supabase/supabase-js'
import { Match, allocState } from '../core/match.ts'
import { unpackInput } from '../core/input.ts'
import type { ArenaId } from '../core/constants.ts'
import { Rollback } from './rollback.ts'
import { supa } from './supa.ts'
import { b64, decodeState, encodeState, unb64 } from './wire.ts'

export interface LiveMeta {
  rule: string
  stw: number
  arena: ArenaId
  wl?: boolean
  nl: string
  nr: string
}

interface SnapMsg extends LiveMeta { f: number; s: string; j: number }
interface InpMsg { f: number; l: string; r: string }

const chanName = (code: string) => `blobby-live-${code.toUpperCase()}`

const SNAP_MS = 2000
const TICK_MS = 140
const IDLE_MS = 9000

/**
 * Quem hospeda transmite snapshot + inputs já confirmados. Como a simulação é
 * determinística, quem assiste reproduz a partida inteira a 60fps com ~7
 * mensagens por segundo — e só quando tem alguém olhando.
 */
export class LiveHost {
  viewers = 0
  private chan: RealtimeChannel | null = null
  private timer = 0
  private lastHi = 0
  private lastSnap = 0
  private sentUpTo = -1
  private scratch = allocState()

  constructor(
    private code: string,
    private getRb: () => Rollback | null,
    private getMeta: () => LiveMeta,
  ) {}

  start() {
    if (this.chan) return
    const chan = supa().channel(chanName(this.code), { config: { broadcast: { self: false } } })
    chan.on('broadcast', { event: 'hi' }, () => { this.lastHi = Date.now(); this.sentUpTo = -1 })
    chan.on('broadcast', { event: 'alive' }, () => { this.lastHi = Date.now() })
    chan.subscribe()
    this.chan = chan
    this.timer = setInterval(() => this.pump(), TICK_MS) as unknown as number
  }

  /** Reinicia o fluxo: revanche recomeça do frame 0 e quem assiste precisa do snapshot novo. */
  reset() {
    this.sentUpTo = -1
    this.lastSnap = 0
  }

  stop() {
    clearInterval(this.timer)
    if (this.chan) {
      void this.chan.send({ type: 'broadcast', event: 'end', payload: {} })
      void supa().removeChannel(this.chan)
    }
    this.chan = null
    this.viewers = 0
  }

  private pump() {
    const chan = this.chan
    const rb = this.getRb()
    const live = Date.now() - this.lastHi < IDLE_MS
    this.viewers = live ? 1 : 0
    if (!chan || !rb || !live) return

    const now = Date.now()
    if (this.sentUpTo < 0 || now - this.lastSnap > SNAP_MS) {
      const at = Math.min(rb.confirmed + 1, rb.frame - 1)
      const st = at >= 0 ? rb.stateAt(at) : null
      if (st) {
        const jump = this.sentUpTo < 0
        st.f.forEach((v, k) => { this.scratch.f[k] = v })
        st.i.forEach((v, k) => { this.scratch.i[k] = v })
        const msg: SnapMsg = { ...this.getMeta(), f: at, s: encodeState(this.scratch), j: jump ? 1 : 0 }
        void chan.send({ type: 'broadcast', event: 'snap', payload: msg })
        this.lastSnap = now
        if (jump) this.sentUpTo = at - 1
      }
    }

    const w = rb.confirmedWindow(this.sentUpTo + 1)
    if (!w || !w.l.length) return
    // buraco na sequência (aba travada, anel já girou): recomeça pelo snapshot
    if (this.sentUpTo >= 0 && w.start > this.sentUpTo + 1) { this.sentUpTo = -1; return }
    const msg: InpMsg = { f: w.start, l: b64(w.l), r: b64(w.r) }
    void chan.send({ type: 'broadcast', event: 'inp', payload: msg })
    this.sentUpTo = w.start + w.l.length - 1
  }
}

const LEAD_START = 16
const LEAD_MAX = 50

export interface SpectatorOpts {
  onReady(match: Match, meta: LiveMeta): void
  onArena(id: ArenaId): void
  onEnd(): void
}

export class Spectator {
  match: Match | null = null
  meta: LiveMeta | null = null
  private chan: RealtimeChannel | null = null
  private beat = 0
  private inputs = new Map<number, number>()
  private last = -1
  private running = false
  private scratch = allocState()
  private ended = false

  constructor(private code: string, private opts: SpectatorOpts) {}

  start() {
    const chan = supa().channel(chanName(this.code), { config: { broadcast: { self: false } } })
    chan.on('broadcast', { event: 'snap' }, m => this.onSnap(m.payload as SnapMsg))
    chan.on('broadcast', { event: 'inp' }, m => this.onInp(m.payload as InpMsg))
    chan.on('broadcast', { event: 'end' }, () => { if (!this.ended) { this.ended = true; this.opts.onEnd() } })
    chan.subscribe(status => {
      if (status !== 'SUBSCRIBED') return
      void chan.send({ type: 'broadcast', event: 'hi', payload: {} })
    })
    this.chan = chan
    this.beat = setInterval(() => {
      void chan.send({ type: 'broadcast', event: 'alive', payload: {} })
    }, 3000) as unknown as number
  }

  stop() {
    clearInterval(this.beat)
    if (this.chan) void supa().removeChannel(this.chan)
    this.chan = null
  }

  /** Quantos frames de folga tem no buffer. */
  buffered() { return this.match ? this.last - this.match.frame : 0 }
  get live() { return this.running }

  private onSnap(p: SnapMsg) {
    if (!p || typeof p.s !== 'string') return
    if (!decodeState(p.s, this.scratch)) return
    const fresh = !this.match || p.j === 1 || p.f < this.match.frame - 4
    if (!this.match) {
      this.meta = { rule: p.rule, stw: p.stw, arena: p.arena, wl: p.wl, nl: p.nl, nr: p.nr }
      this.opts.onArena(p.arena)
      this.match = new Match(p.rule, p.stw || undefined, 0, p.wl !== false)
    } else if (fresh) {
      if (this.meta && this.meta.arena !== p.arena) { this.meta.arena = p.arena; this.opts.onArena(p.arena) }
    }
    if (fresh) {
      this.match.restore(this.scratch)
      this.inputs.clear()
      this.last = this.match.frame - 1
      this.running = false
      if (this.meta) { this.meta.nl = p.nl; this.meta.nr = p.nr }
      this.opts.onReady(this.match, this.meta!)
    }
  }

  private onInp(p: InpMsg) {
    if (!this.match || !p || typeof p.l !== 'string') return
    const l = unb64(p.l), r = unb64(p.r)
    for (let k = 0; k < l.length; k++) {
      const f = p.f + k
      if (f < this.match.frame) continue
      this.inputs.set(f, l[k] | (r[k] << 8))
      if (f > this.last) this.last = f
    }
    if (this.inputs.size > 900) {
      for (const f of this.inputs.keys()) {
        if (f < this.match.frame) this.inputs.delete(f)
      }
    }
  }

  /** Um frame por chamada, só quando há input pronto. Segura um colchão pra não engasgar. */
  advance(): boolean {
    const m = this.match
    if (!m) return false
    const ahead = this.last - m.frame
    if (!this.running) {
      if (ahead < LEAD_START) return false
      this.running = true
    }
    const bits = this.inputs.get(m.frame)
    if (bits === undefined || ahead < 0) { this.running = false; return false }
    this.inputs.delete(m.frame)
    m.step(unpackInput(bits & 255), unpackInput((bits >> 8) & 255))
    return true
  }

  /** Ficou pra trás (aba em segundo plano): acelera até encostar de novo. */
  needsCatchUp() { return this.running && this.buffered() > LEAD_MAX }
}
