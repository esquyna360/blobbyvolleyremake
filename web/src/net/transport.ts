export type PeerId = string

/** Relays verificados manualmente: aceitam publicação anônima de eventos efêmeros. */
export const RELAY_URLS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://nostr.mom',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.fountain.fm',
  'wss://nostr.sathoarder.com',
]

const STUN_ONLY: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
]

const RTC_CONFIG: RTCConfiguration = { iceServers: STUN_ONLY }

/** Signaling próprio: relay público bania pubkey anônima e derrubava quem entrava. */
const SUPABASE_URL = 'https://vzxnnixegwfdtexmqbos.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6EHgiq7g9D1vE0s2yyoqtA_PdS2EZiG'

export type Strategy = 'supabase' | 'nostr' | 'torrent' | 'mqtt'

export const ROOM_CONFIG = {
  appId: 'blobbyremake-v1',
  relayUrls: RELAY_URLS,
  rtcConfig: RTC_CONFIG,
}

const SUPABASE_CONFIG = {
  appId: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  rtcConfig: RTC_CONFIG,
}

export const supabaseInfo = () => ({ url: SUPABASE_URL, key: SUPABASE_KEY })
export const iceConfig = (): RTCConfiguration => RTC_CONFIG

let supaUp: Promise<boolean> | null = null
let supaFailAt = 0

/** Handshake TLS lento (IPv6 caindo pro IPv4, antivírus) chega a passar de 9s. */
const PROBE_MS = 12000
const RECHECK_MS = 30000

/**
 * Projeto free hiberna depois de uma semana parado; se hibernou, cai pro Nostr.
 * Um "não" nunca é definitivo: máquina com DNS lento reprovava pra sessão inteira.
 */
function supabaseAlive(): Promise<boolean> {
  if (supaFailAt && Date.now() - supaFailAt > RECHECK_MS) { supaUp = null; supaFailAt = 0 }
  if (!supaUp) {
    supaUp = (async () => {
      try {
        const ctl = new AbortController()
        const t = setTimeout(() => ctl.abort(), PROBE_MS)
        const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
          headers: { apikey: SUPABASE_KEY },
          signal: ctl.signal,
        })
        clearTimeout(t)
        const ok = r.status < 500
        if (!ok) supaFailAt = Date.now()
        return ok
      } catch {
        supaFailAt = Date.now()
        return false
      }
    })()
  }
  return supaUp
}

export async function pickStrategy(pref: Strategy = 'supabase'): Promise<Strategy> {
  if (pref !== 'supabase') return pref
  return (await supabaseAlive()) ? 'supabase' : 'nostr'
}

type NostrMod = typeof import('trystero/nostr')
export type TrysteroRoom = ReturnType<NostrMod['joinRoom']>

/** Cada estratégia tem sua própria forma de config; devolve já um join fechado em cima dela. */
export async function loadStrategy(s: Strategy): Promise<(roomId: string) => TrysteroRoom> {
  switch (s) {
    case 'supabase': {
      const m = await import('trystero/supabase')
      return id => m.joinRoom(SUPABASE_CONFIG, id) as TrysteroRoom
    }
    case 'mqtt': {
      const m = await import('trystero/mqtt')
      return id => m.joinRoom(ROOM_CONFIG, id) as TrysteroRoom
    }
    case 'torrent': {
      const m = await import('trystero/torrent')
      return id => m.joinRoom(ROOM_CONFIG, id) as TrysteroRoom
    }
    default: {
      const m = await import('trystero/nostr')
      return id => m.joinRoom(ROOM_CONFIG, id)
    }
  }
}

/** Credencial TURN de curta duração; a chave fica no backend, nunca no bundle. */
const ICE_ENDPOINT = 'https://blobby-ice.vercel.app/api/ice'
export const iceEndpoint = () => ICE_ENDPOINT

let iceUntil = 0
let icePending: Promise<void> | null = null
let turnOn = false

export const hasTurn = () => turnOn

/** STUN sozinho não atravessa CGNAT de operadora móvel — sem TURN, 4G/5G não conecta. */
export function ensureIce(): Promise<void> {
  if (Date.now() < iceUntil) return Promise.resolve()
  if (icePending) return icePending
  icePending = (async () => {
    let ok = false
    try {
      const r = await fetch(ICE_ENDPOINT)
      if (r.ok) {
        const data = (await r.json()) as { iceServers?: RTCIceServer[] }
        if (data.iceServers?.length) {
          RTC_CONFIG.iceServers = [...data.iceServers, ...STUN_ONLY]
          ok = true
        }
      }
    } catch { /* segue só com STUN */ }
    turnOn = ok
    iceUntil = Date.now() + (ok ? 3_600_000 : 60_000)
    icePending = null
  })()
  return icePending
}

export async function relayHealth(): Promise<{ open: number; total: number; kind: string }> {
  if (lastStrategy === 'supabase') {
    const up = await supabaseAlive()
    return { open: up ? 1 : 0, total: 1, kind: 'supabase' }
  }
  try {
    const mod = await import('trystero/nostr')
    const sockets = Object.values(mod.getRelaySockets()) as (WebSocket | undefined)[]
    return { open: sockets.filter(w => w?.readyState === 1).length, total: sockets.length, kind: 'nostr' }
  } catch {
    return { open: 0, total: 0, kind: 'nostr' }
  }
}

let lastStrategy: Strategy = 'supabase'
export const currentStrategy = () => lastStrategy

export interface Transport {
  readonly kind: string
  send(data: Uint8Array, to?: PeerId): void
  /**
   * Pacote descartável (input redundante, ping): vai por canal sem ordem nem
   * retransmissão quando existe. O canal do Trystero é confiável e ordenado —
   * pacote perdido segura todos os seguintes, e a fila só cresce ao longo da
   * partida. Sem o canal rápido cai no `send` normal.
   */
  sendFast(data: Uint8Array, to?: PeerId): void
  onData(cb: (data: Uint8Array, peer: PeerId) => void): void
  onPeerJoin(cb: (peer: PeerId) => void): void
  onPeerLeave(cb: (peer: PeerId) => void): void
  peers(): PeerId[]
  close(): void
}

/** Signaling serverless via Trystero (Supabase Realtime, com Nostr de reserva). */
export async function createRoomTransport(roomId: string, pref: Strategy = 'supabase'): Promise<Transport> {
  const strategy = await pickStrategy(pref)
  lastStrategy = strategy
  const join = await loadStrategy(strategy)

  await ensureIce()
  const room = join(roomId)
  const [sendRaw, getRaw] = room.makeAction<Uint8Array>('pkt')

  const dataCbs: ((d: Uint8Array, p: PeerId) => void)[] = []
  const joinCbs: ((p: PeerId) => void)[] = []
  const leaveCbs: ((p: PeerId) => void)[] = []
  const peerSet = new Set<PeerId>()
  const fast = new Map<PeerId, RTCDataChannel>()

  const deliver = (u8: Uint8Array, peer: PeerId) => { for (const cb of dataCbs) cb(u8, peer) }
  getRaw((data, peer) => {
    deliver(data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer), peer)
  })

  // Cada lado abre o seu canal de saída e escuta o do outro: sem negociar quem
  // cria. Canal novo na mesma associação SCTP não renegocia nada.
  const openFast = (p: PeerId) => {
    const pc = (room.getPeers() as Record<string, RTCPeerConnection | undefined>)[p]
    if (!pc) return
    const prev = pc.ondatachannel
    pc.ondatachannel = ev => {
      if (ev.channel.label !== FAST_LABEL) { prev?.call(pc, ev); return }
      ev.channel.binaryType = 'arraybuffer'
      ev.channel.onmessage = e => deliver(new Uint8Array(e.data as ArrayBuffer), p)
    }
    try {
      const ch = pc.createDataChannel(FAST_LABEL, { ordered: false, maxRetransmits: 0 })
      ch.binaryType = 'arraybuffer'
      ch.onopen = () => fast.set(p, ch)
      ch.onclose = () => { if (fast.get(p) === ch) fast.delete(p) }
      ch.onerror = () => { if (fast.get(p) === ch) fast.delete(p) }
    } catch { /* fica no canal do Trystero */ }
  }

  room.onPeerJoin(p => { peerSet.add(p); openFast(p); for (const cb of joinCbs) cb(p) })
  room.onPeerLeave(p => { peerSet.delete(p); fast.delete(p); for (const cb of leaveCbs) cb(p) })

  const send = (d: Uint8Array, to?: PeerId) => { void (to ? sendRaw(d, to) : sendRaw(d)) }
  const sendFast = (d: Uint8Array, to?: PeerId) => {
    const targets = to ? [to] : [...peerSet]
    for (const p of targets) {
      const ch = fast.get(p)
      if (ch && ch.readyState === 'open' && ch.bufferedAmount < FAST_BACKLOG) {
        try { ch.send(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer); continue } catch { /* cai pro lento */ }
      }
      send(d, p)
    }
  }

  return {
    kind: `room:${strategy}`,
    send,
    sendFast,
    onData: cb => dataCbs.push(cb),
    onPeerJoin: cb => joinCbs.push(cb),
    onPeerLeave: cb => leaveCbs.push(cb),
    peers: () => [...peerSet],
    close: () => { for (const ch of fast.values()) ch.close(); fast.clear(); void room.leave() },
  }
}

const FAST_LABEL = 'fast'
/** Acima disso o canal está engasgado: solta o pacote em vez de empilhar. */
const FAST_BACKLOG = 4096

export interface ManualHandle {
  transport: Transport
  /** Base64 blob to hand to the other side. */
  localDescription: Promise<string>
  /** Feed the remote blob. */
  accept(remote: string): Promise<void>
}

const ICE = RTC_CONFIG

const encodeSDP = (d: RTCSessionDescriptionInit) =>
  btoa(JSON.stringify(d)).replace(/=+$/, '')
const decodeSDP = (s: string): RTCSessionDescriptionInit =>
  JSON.parse(atob(s.trim().replace(/\s+/g, '')))

/** Zero-infrastructure P2P: copy/paste the offer and answer. Unordered channel for lowest latency. */
export function createManualTransport(asHost: boolean): ManualHandle {
  const pc = new RTCPeerConnection(ICE)
  const dataCbs: ((d: Uint8Array, p: PeerId) => void)[] = []
  const joinCbs: ((p: PeerId) => void)[] = []
  const leaveCbs: ((p: PeerId) => void)[] = []
  let channel: RTCDataChannel | null = null
  let connected = false

  const wire = (ch: RTCDataChannel) => {
    channel = ch
    ch.binaryType = 'arraybuffer'
    ch.onopen = () => { connected = true; for (const cb of joinCbs) cb('peer') }
    ch.onclose = () => { connected = false; for (const cb of leaveCbs) cb('peer') }
    ch.onmessage = e => {
      const u8 = new Uint8Array(e.data as ArrayBuffer)
      for (const cb of dataCbs) cb(u8, 'peer')
    }
  }

  if (asHost) {
    wire(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }))
  } else {
    pc.ondatachannel = e => wire(e.channel)
  }

  const gathered = new Promise<void>(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const t = setTimeout(resolve, 3000)
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
    }
  })

  let resolveLocal!: (s: string) => void
  const localDescription = new Promise<string>(r => { resolveLocal = r })

  if (asHost) {
    void (async () => {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await gathered
      resolveLocal(encodeSDP(pc.localDescription!))
    })()
  }

  const accept = async (remote: string) => {
    const desc = decodeSDP(remote)
    await pc.setRemoteDescription(desc)
    if (!asHost) {
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await gathered
      resolveLocal(encodeSDP(pc.localDescription!))
    }
  }

  const transport: Transport = {
    kind: asHost ? 'manual:host' : 'manual:guest',
    send: d => { if (channel && channel.readyState === 'open') channel.send(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer) },
    sendFast: d => { if (channel && channel.readyState === 'open') channel.send(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer) },
    onData: cb => dataCbs.push(cb),
    onPeerJoin: cb => joinCbs.push(cb),
    onPeerLeave: cb => leaveCbs.push(cb),
    peers: () => (connected ? ['peer'] : []),
    close: () => pc.close(),
  }

  return { transport, localDescription, accept }
}
