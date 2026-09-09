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

export const ROOM_CONFIG = {
  appId: 'blobbyremake-v1',
  relayUrls: RELAY_URLS,
  rtcConfig: RTC_CONFIG,
}

/** Credencial TURN de curta duração; a chave fica no backend, nunca no bundle. */
const ICE_ENDPOINT = 'https://blobby-ice.vercel.app/api/ice'

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

export async function relayHealth(): Promise<{ open: number; total: number }> {
  try {
    const mod = await import('trystero/nostr')
    const sockets = Object.values(mod.getRelaySockets()) as (WebSocket | undefined)[]
    return { open: sockets.filter(w => w?.readyState === 1).length, total: sockets.length }
  } catch {
    return { open: 0, total: 0 }
  }
}

export interface Transport {
  readonly kind: string
  send(data: Uint8Array): void
  onData(cb: (data: Uint8Array, peer: PeerId) => void): void
  onPeerJoin(cb: (peer: PeerId) => void): void
  onPeerLeave(cb: (peer: PeerId) => void): void
  peers(): PeerId[]
  close(): void
}

/** Serverless signaling via Trystero (Nostr relays / BitTorrent trackers / MQTT). */
export async function createRoomTransport(roomId: string, strategy: 'nostr' | 'torrent' | 'mqtt' = 'nostr'): Promise<Transport> {
  const mod = strategy === 'nostr'
    ? await import('trystero/nostr')
    : strategy === 'mqtt'
      ? await import('trystero/mqtt')
      : await import('trystero/torrent')

  await ensureIce()
  const room = mod.joinRoom(ROOM_CONFIG, roomId)
  const [sendRaw, getRaw] = room.makeAction<Uint8Array>('pkt')

  const dataCbs: ((d: Uint8Array, p: PeerId) => void)[] = []
  const joinCbs: ((p: PeerId) => void)[] = []
  const leaveCbs: ((p: PeerId) => void)[] = []
  const peerSet = new Set<PeerId>()

  getRaw((data, peer) => {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer)
    for (const cb of dataCbs) cb(u8, peer)
  })
  room.onPeerJoin(p => { peerSet.add(p); for (const cb of joinCbs) cb(p) })
  room.onPeerLeave(p => { peerSet.delete(p); for (const cb of leaveCbs) cb(p) })

  return {
    kind: `room:${strategy}`,
    send: d => { void sendRaw(d) },
    onData: cb => dataCbs.push(cb),
    onPeerJoin: cb => joinCbs.push(cb),
    onPeerLeave: cb => leaveCbs.push(cb),
    peers: () => [...peerSet],
    close: () => room.leave(),
  }
}

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
    onData: cb => dataCbs.push(cb),
    onPeerJoin: cb => joinCbs.push(cb),
    onPeerLeave: cb => leaveCbs.push(cb),
    peers: () => (connected ? ['peer'] : []),
    close: () => pc.close(),
  }

  return { transport, localDescription, accept }
}
