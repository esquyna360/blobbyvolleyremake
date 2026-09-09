export type PeerId = string

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

  const room = mod.joinRoom({ appId: 'blobbyremake-v1' }, roomId)
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

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
}

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
