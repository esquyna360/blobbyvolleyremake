import { Match } from '../core/match.ts'
import { Rollback } from './rollback.ts'
import type { PeerId, Transport } from './transport.ts'
import { LEFT, RIGHT } from '../core/constants.ts'
import { setArena, arenaId } from '../core/constants.ts'
import { defaultLook, packLook, unpackLook } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import type { ArenaId } from '../core/constants.ts'
import type { Side } from '../core/constants.ts'

const PROTO = 20
const enum P {
  HELLO = 0, INPUT = 1, PING = 2, PONG = 3, SYNC = 4, EMOTE = 5, BYE = 6,
  WELCOME = 7, DENY = 8, REMATCH = 9,
}

const enum Deny { PROTO = 0, PASS = 1, REJECTED = 2, FULL = 3 }

const DENY_TEXT: Record<number, string> = {
  [Deny.PROTO]: 'versão incompatível',
  [Deny.PASS]: 'senha errada',
  [Deny.REJECTED]: 'o host recusou',
  [Deny.FULL]: 'sala cheia',
}

export function passHash(pass: string): number {
  const t = pass.trim()
  if (!t) return 0
  let h = 2166136261
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) || 1
}

export interface NetStats {
  rttMs: number
  peerFrame: number
  frameAdv: number
  rollbacks: number
  maxRollback: number
  desync: boolean
  kind: string
}

export type SessionPhase =
  | 'connecting' | 'waiting' | 'handshake' | 'approval' | 'playing' | 'desync' | 'closed'

export interface SessionOpts {
  ruleId: string
  arena: ArenaId
  walls: boolean
  /** cenário do host: os que são regra mudam a física dos dois lados */
  /** aparência local: viaja junto no aperto de mão, não entra na simulação */
  look: PlayerLook
  onArena?: (id: ArenaId) => void
  onWalls?: (on: boolean) => void
  /** cenário do host: quem entra vê a mesma quadra */
  scene: string
  onScene?: (id: string) => void
  scoreToWin?: number
  name: string
  host: boolean
  pass?: number
  onReady: (s: NetSession) => void
  onPhase?: (p: SessionPhase, info?: string) => void
  onEmote?: (id: number, side: Side) => void
  onJoinRequest?: (name: string, accept: () => void, reject: () => void) => void
  onRematch?: (mine: boolean, theirs: boolean) => void
}

export class NetSession {
  transport: Transport
  opts: SessionOpts
  rollback: Rollback | null = null
  match: Match | null = null
  localSide: Side = 0
  peerName = 'Player'
  peerLook: PlayerLook = defaultLook(1)
  phase: SessionPhase = 'connecting'

  private seed = (Math.random() * 0xffffffff) >>> 0
  private peer: PeerId | null = null
  private pending: PeerId | null = null
  private helloTimer = 0
  private pingTimer = 0
  private lastAckedSend = 0
  rtt = 0
  private checksums = new Map<number, number>()
  desynced = false
  private began: { ruleId: string; stw: number; arena: ArenaId; walls: boolean; serving: Side } | null = null

  /** Regra, placar-alvo, arena, paredes e quem saca: o replay precisa disso pra reproduzir. */
  get setup() { return this.began }
  private wantMine = false
  private wantTheirs = false

  constructor(transport: Transport, opts: SessionOpts) {
    this.transport = transport
    this.opts = opts
    this.localSide = opts.host ? LEFT : RIGHT
    transport.onData((d, from) => this.onData(d, from))
    transport.onPeerJoin(() => { if (!opts.host) this.startHandshake() })
    transport.onPeerLeave(p => {
      if (p === this.pending) { this.pending = null; if (this.phase === 'approval') this.setPhase('waiting') }
      if (this.peer === null || p === this.peer) {
        if (this.phase === 'playing' || this.phase === 'handshake') this.setPhase('closed', 'peer saiu')
      }
    })
    if (opts.host) this.setPhase('waiting')
    else if (transport.peers().length > 0) this.startHandshake()
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
    const look = packLook(this.opts.look)
    const buf = new Uint8Array(1 + 1 + 4 + 3 + 1 + nameBytes.length)
    const dv = new DataView(buf.buffer)
    let o = 0
    dv.setUint8(o++, P.HELLO)
    dv.setUint8(o++, PROTO)
    dv.setUint32(o, this.opts.pass ?? 0); o += 4
    for (const b of look) dv.setUint8(o++, b)
    dv.setUint8(o++, nameBytes.length); buf.set(nameBytes, o)
    this.transport.send(buf)
  }

  private deny(to: PeerId | null, reason: Deny) {
    const b = new Uint8Array([P.DENY, reason])
    this.transport.send(b, to ?? undefined)
  }

  /** Só o host processa HELLO: valida senha e pede aprovação antes de abrir a partida. */
  private onHello(dv: DataView, buf: Uint8Array, from: PeerId) {
    if (!this.opts.host) return
    const proto = dv.getUint8(1)
    if (proto !== PROTO) { this.deny(from, Deny.PROTO); return }
    if (this.peer !== null && this.peer !== from) { this.deny(from, Deny.FULL); return }
    if (this.peer === from) { this.sendWelcome(from); return }
    if (dv.getUint32(2) !== (this.opts.pass ?? 0)) { this.deny(from, Deny.PASS); return }
    if (this.pending === from) return
    if (this.pending !== null) { this.deny(from, Deny.FULL); return }

    this.peerLook = unpackLook(dv.getUint8(6), dv.getUint8(7), dv.getUint8(8))
    const nl = dv.getUint8(9)
    this.peerName = new TextDecoder().decode(buf.subarray(10, 10 + nl)) || 'Player'
    this.pending = from
    this.setPhase('approval', this.peerName)

    const settle = (ok: boolean) => {
      if (this.pending !== from) return
      this.pending = null
      if (!ok) { this.deny(from, Deny.REJECTED); this.setPhase('waiting'); return }
      this.peer = from
      this.sendWelcome(from)
      this.begin(this.opts.ruleId, this.scoreToWin(), (this.seed & 1) as Side,
        this.opts.arena, this.opts.walls)
    }
    if (this.opts.onJoinRequest) this.opts.onJoinRequest(this.peerName, () => settle(true), () => settle(false))
    else settle(true)
  }

  private scoreToWin() { return this.opts.scoreToWin ?? 0 }

  private sendWelcome(to: PeerId) {
    const nameBytes = new TextEncoder().encode(this.opts.name.slice(0, 24))
    const ruleBytes = new TextEncoder().encode(this.opts.ruleId)
    const look = packLook(this.opts.look)
    const sceneBytes = new TextEncoder().encode(this.opts.scene.slice(0, 16))
    const buf = new Uint8Array(1 + 1 + 1 + 1 + 2 + 3 + 1 + nameBytes.length + 1 + ruleBytes.length + 1 + sceneBytes.length)
    const dv = new DataView(buf.buffer)
    let o = 0
    dv.setUint8(o++, P.WELCOME)
    dv.setUint8(o++, PROTO)
    dv.setUint8(o++, this.seed & 1)
    dv.setUint8(o++, (this.opts.arena === 'wide' ? 1 : 0) | (this.opts.walls ? 0 : 2))
    dv.setUint16(o, this.scoreToWin()); o += 2
    for (const b of look) dv.setUint8(o++, b)
    dv.setUint8(o++, nameBytes.length); buf.set(nameBytes, o); o += nameBytes.length
    dv.setUint8(o++, ruleBytes.length); buf.set(ruleBytes, o); o += ruleBytes.length
    dv.setUint8(o++, sceneBytes.length); buf.set(sceneBytes, o)
    this.transport.send(buf, to)
  }

  private onWelcome(dv: DataView, buf: Uint8Array, from: PeerId) {
    if (this.opts.host || this.phase === 'playing') return
    if (dv.getUint8(1) !== PROTO) { this.setPhase('closed', DENY_TEXT[Deny.PROTO]); return }
    let o = 2
    const serving = dv.getUint8(o++) as Side
    const arenaByte = dv.getUint8(o++)
    const arena: ArenaId = (arenaByte & 1) === 1 ? 'wide' : 'default'
    const walls = (arenaByte & 2) === 0
    const stw = dv.getUint16(o); o += 2
    this.peerLook = unpackLook(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2)); o += 3
    const nl = dv.getUint8(o++)
    this.peerName = new TextDecoder().decode(buf.subarray(o, o + nl)) || 'Player'; o += nl
    const rl = dv.getUint8(o++)
    const ruleId = new TextDecoder().decode(buf.subarray(o, o + rl)); o += rl
    if (o < buf.length) {
      const sl = dv.getUint8(o++)
      const scene = new TextDecoder().decode(buf.subarray(o, o + sl))
      if (scene) this.opts.onScene?.(scene)
    }
    this.peer = from
    clearInterval(this.helloTimer)
    this.begin(ruleId, stw, serving, arena, walls)
  }

  private begin(ruleId: string, stw: number, serving: Side, arena: ArenaId, walls: boolean) {
    if (arenaId() !== arena) { setArena(arena); this.opts.onArena?.(arena) }
    if (this.opts.walls !== walls) { this.opts.walls = walls; this.opts.onWalls?.(walls) }
    this.began = { ruleId, stw, arena, walls, serving }
    this.wantMine = false
    this.wantTheirs = false
    this.checksums.clear()
    this.desynced = false
    this.match = new Match(ruleId, stw || undefined, serving, walls)
    this.rollback = new Rollback(this.match, this.localSide)
    clearInterval(this.helloTimer)
    this.setPhase('playing')
    this.startPing()
    this.opts.onReady(this)
  }

  /** Revanche: os dois precisam pedir; o host escolhe quem saca e manda o ok. */
  requestRematch() {
    if (!this.began || this.wantMine) return
    this.wantMine = true
    this.transport.send(new Uint8Array([P.REMATCH, 0]))
    this.opts.onRematch?.(this.wantMine, this.wantTheirs)
    this.maybeRematch()
  }

  private maybeRematch() {
    if (!this.opts.host || !this.began || !this.wantMine || !this.wantTheirs) return
    this.seed = (Math.random() * 0xffffffff) >>> 0
    const serving = (this.seed & 1) as Side
    this.transport.send(new Uint8Array([P.REMATCH, 1, serving]))
    this.begin(this.began.ruleId, this.began.stw, serving, this.began.arena, this.began.walls)
  }

  private onRematch(dv: DataView) {
    if (!this.began) return
    if (dv.getUint8(1) === 1) {
      if (this.opts.host) return
      const serving = (dv.byteLength > 2 ? dv.getUint8(2) : 0) as Side
      this.begin(this.began.ruleId, this.began.stw, serving, this.began.arena, this.began.walls)
      return
    }
    this.wantTheirs = true
    this.opts.onRematch?.(this.wantMine, this.wantTheirs)
    this.maybeRematch()
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

  private onData(buf: Uint8Array, from: PeerId) {
    if (buf.length < 1) return
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const tag = dv.getUint8(0)
    if (tag === P.HELLO) { this.onHello(dv, buf, from); return }
    // Antes de ter par definido, o host só escuta HELLO e quem entra só escuta WELCOME/DENY.
    if (this.peer !== null) { if (from !== this.peer) return }
    else if (this.opts.host || (tag !== P.WELCOME && tag !== P.DENY)) return
    switch (tag) {
      case P.WELCOME: this.onWelcome(dv, buf, from); break
      case P.DENY: this.setPhase('closed', DENY_TEXT[dv.getUint8(1)] ?? 'recusado'); break
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
      case P.EMOTE: this.opts.onEmote?.(dv.getUint8(1), (1 - this.localSide) as Side); break
      case P.REMATCH: this.onRematch(dv); break
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
    this.opts.onEmote?.(id, this.localSide)
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
