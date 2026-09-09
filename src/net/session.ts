import { Match } from '../core/match.ts'
import { Rollback } from './rollback.ts'
import type { Transport } from './transport.ts'
import type { Side } from '../core/constants.ts'

const PROTO = 3
const enum P { HELLO = 0, INPUT = 1, PING = 2, PONG = 3, SYNC = 4, EMOTE = 5, BYE = 6 }

export interface NetStats {
  rttMs: number
  peerFrame: number
  frameAdv: number
  rollbacks: number
  maxRollback: number
  desync: boolean
  kind: string
}

export type SessionPhase = 'connecting' | 'handshake' | 'playing' | 'desync' | 'closed'

export interface SessionOpts {
  ruleId: string
  scoreToWin?: number
  name: string
  onReady: (s: NetSession) => void
  onPhase?: (p: SessionPhase, info?: string) => void
  onEmote?: (id: number) => void
}

export class NetSession {
  transport: Transport
  opts: SessionOpts
  rollback: Rollback | null = null
  match: Match | null = null
  localSide: Side = 0
  peerName = 'Player'
  phase: SessionPhase = 'connecting'

  private priority = (Math.random() * 0xffffffff) >>> 0
  private seed = (Math.random() * 0xffffffff) >>> 0
  private peerSeed = 0
  private helloTimer = 0
  private pingTimer = 0
  private lastAckedSend = 0
  rtt = 0
  private checksums = new Map<number, number>()
  desynced = false

  constructor(transport: Transport, opts: SessionOpts) {
    this.transport = transport
    this.opts = opts
    transport.onData(d => this.onData(d))
    transport.onPeerJoin(() => this.startHandshake())
    transport.onPeerLeave(() => this.setPhase('closed', 'peer saiu'))
    if (transport.peers().length > 0) this.startHandshake()
  }

  private setPhase(p: SessionPhase, info?: string) {
    this.phase = p
    this.opts.onPhase?.(p, info)
  }

  private startHandshake() {
    if (this.phase === 'playing') return
    this.setPhase('handshake')
    this.sendHello()
    clearInterval(this.helloTimer)
    this.helloTimer = setInterval(() => {
      if (this.phase === 'handshake') this.sendHello()
      else clearInterval(this.helloTimer)
    }, 250) as unknown as number
  }

  private sendHello() {
    const nameBytes = new TextEncoder().encode(this.opts.name.slice(0, 24))
    const ruleBytes = new TextEncoder().encode(this.opts.ruleId)
    const buf = new Uint8Array(1 + 1 + 4 + 4 + 1 + nameBytes.length + 1 + ruleBytes.length)
    const dv = new DataView(buf.buffer)
    let o = 0
    dv.setUint8(o++, P.HELLO)
    dv.setUint8(o++, PROTO)
    dv.setUint32(o, this.priority); o += 4
    dv.setUint32(o, this.seed); o += 4
    dv.setUint8(o++, nameBytes.length); buf.set(nameBytes, o); o += nameBytes.length
    dv.setUint8(o++, ruleBytes.length); buf.set(ruleBytes, o); o += ruleBytes.length
    this.transport.send(buf)
  }

  private onHello(dv: DataView, buf: Uint8Array) {
    let o = 1
    const proto = dv.getUint8(o++)
    if (proto !== PROTO) { this.setPhase('closed', 'versão incompatível'); return }
    const prio = dv.getUint32(o); o += 4
    const seed = dv.getUint32(o); o += 4
    const nl = dv.getUint8(o++); this.peerName = new TextDecoder().decode(buf.subarray(o, o + nl)); o += nl
    const rl = dv.getUint8(o++); const ruleId = new TextDecoder().decode(buf.subarray(o, o + rl)); o += rl

    this.peerSeed = seed
    if (this.phase === 'playing') return

    // Deterministic role assignment.
    let iAmLeft: boolean
    if (prio === this.priority) { this.priority = (this.priority + 1) >>> 0; this.sendHello(); return }
    iAmLeft = this.priority > prio
    this.localSide = (iAmLeft ? 0 : 1) as Side

    const combined = (this.seed ^ this.peerSeed) >>> 0
    const serving = (combined & 1) as Side
    const rules = iAmLeft ? this.opts.ruleId : ruleId

    this.match = new Match(rules, this.opts.scoreToWin, serving)
    this.rollback = new Rollback(this.match, this.localSide)
    clearInterval(this.helloTimer)
    this.sendHello()
    this.setPhase('playing')
    this.startPing()
    this.opts.onReady(this)
  }

  private startPing() {
    clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      const b = new Uint8Array(9)
      new DataView(b.buffer).setUint8(0, P.PING)
      new DataView(b.buffer).setFloat64(1, performance.now())
      this.transport.send(b)
    }, 1000) as unknown as number
  }

  private onData(buf: Uint8Array) {
    if (buf.length < 1) return
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    switch (dv.getUint8(0)) {
      case P.HELLO: this.onHello(dv, buf); break
      case P.INPUT: {
        if (!this.rollback) return
        const start = dv.getUint32(1)
        const peerFrame = dv.getUint32(5)
        const count = dv.getUint8(9)
        const bits = buf.subarray(10, 10 + count)
        this.rollback.onRemotePacket(start, bits, peerFrame)
        break
      }
      case P.PING: {
        const b = new Uint8Array(9)
        const d2 = new DataView(b.buffer)
        d2.setUint8(0, P.PONG)
        d2.setFloat64(1, dv.getFloat64(1))
        this.transport.send(b)
        break
      }
      case P.PONG: this.rtt = performance.now() - dv.getFloat64(1); break
      case P.SYNC: {
        const f = dv.getUint32(1), c = dv.getUint32(5)
        const mine = this.checksums.get(f)
        if (mine !== undefined && mine !== c && !this.desynced) {
          this.desynced = true
          this.setPhase('desync', `frame ${f}`)
        }
        break
      }
      case P.EMOTE: this.opts.onEmote?.(dv.getUint8(1)); break
      case P.BYE: this.setPhase('closed', 'peer saiu'); break
    }
  }

  sendInputs() {
    const rb = this.rollback
    if (!rb) return
    const from = Math.max(this.lastAckedSend, rb.frame - 20)
    const { start, bits } = rb.localWindow(from)
    const buf = new Uint8Array(10 + bits.length)
    const dv = new DataView(buf.buffer)
    dv.setUint8(0, P.INPUT)
    dv.setUint32(1, start)
    dv.setUint32(5, rb.frame)
    dv.setUint8(9, bits.length)
    buf.set(bits, 10)
    this.transport.send(buf)
  }

  maybeSendChecksum() {
    const rb = this.rollback
    if (!rb) return
    const f = rb.confirmed
    if (f < 0 || f % 60 !== 0 || this.checksums.has(f)) return
    const c = rb.checksumAt(f)
    if (c === null) return
    this.checksums.set(f, c)
    if (this.checksums.size > 64) this.checksums.delete([...this.checksums.keys()][0])
    const b = new Uint8Array(9)
    const dv = new DataView(b.buffer)
    dv.setUint8(0, P.SYNC)
    dv.setUint32(1, f)
    dv.setUint32(5, c)
    this.transport.send(b)
  }

  emote(id: number) {
    const b = new Uint8Array(2)
    b[0] = P.EMOTE; b[1] = id
    this.transport.send(b)
    this.opts.onEmote?.(id)
  }

  stats(): NetStats {
    const rb = this.rollback
    return {
      rttMs: Math.round(this.rtt),
      peerFrame: rb?.remoteReportedFrame ?? -1,
      frameAdv: rb?.stats.frameAdvantage ?? 0,
      rollbacks: rb?.stats.rollbacks ?? 0,
      maxRollback: rb?.stats.maxRollback ?? 0,
      desync: this.desynced,
      kind: this.transport.kind,
    }
  }

  close() {
    this.transport.send(new Uint8Array([P.BYE]))
    clearInterval(this.helloTimer)
    clearInterval(this.pingTimer)
    this.transport.close()
    this.setPhase('closed')
  }
}
