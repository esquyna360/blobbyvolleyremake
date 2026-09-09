import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { ensureIce, loadStrategy, pickStrategy, supabaseInfo } from './transport.ts'

type Mod = typeof import('trystero/nostr')
type TRoom = ReturnType<Mod['joinRoom']>

export interface RoomAd {
  code: string
  name: string
  rule: string
  lock: number
  ts: number
  [k: string]: string | number
}

const LOBBY_ID = 'lobby-v1'
const CHANNEL = 'blobby-lobby-v1'
const BEAT_MS = 2000
const TTL_MS = 7000
const GRACE_MS = 20000

/** Como os anúncios saem daqui. O canal do Supabase é WebSocket puro, sem P2P. */
interface Wire {
  send(ad: RoomAd): void
  close(): void
}

export class Lobby {
  private wire: Wire | null = null
  private opening: Promise<void> | null = null
  private ads = new Map<string, RoomAd>()
  private watchers = new Set<(rooms: RoomAd[]) => void>()
  private mine: RoomAd | null = null
  private beat = 0
  private prune = 0
  private closeTimer = 0
  private gen = 0

  watch(cb: (rooms: RoomAd[]) => void): () => void {
    this.watchers.add(cb)
    void this.open().then(() => cb(this.list()))
    cb(this.list())
    return () => {
      this.watchers.delete(cb)
      this.scheduleClose()
    }
  }

  advertise(ad: { code: string; name: string; rule: string; lock: number } | null) {
    this.mine = ad ? { ...ad, ts: Date.now() } : null
    if (!ad) {
      this.scheduleClose()
      return
    }
    void this.open().then(() => this.emitAd())
  }

  /**
   * Abrir uma sala passa por advertise(null) seguido de advertise(ad) segundos depois.
   * Derrubar o lobby no meio disso perde o canal e o anúncio nunca sai.
   */
  private scheduleClose() {
    clearTimeout(this.closeTimer)
    this.closeTimer = setTimeout(() => {
      if (!this.watchers.size && !this.mine) this.close()
    }, GRACE_MS) as unknown as number
  }

  private takeAd(ad: RoomAd) {
    if (!ad || typeof ad.code !== 'string') return
    if (this.mine && ad.code === this.mine.code) return
    this.ads.set(ad.code, { ...ad, ts: Date.now() })
    this.notify()
  }

  private async open() {
    clearTimeout(this.closeTimer)
    if (this.wire) return
    if (this.opening) return this.opening
    const gen = ++this.gen
    this.opening = (async () => {
      const strategy = await pickStrategy()
      const wire = strategy === 'supabase'
        ? await this.openSupabase()
        : await this.openTrystero()
      if (gen !== this.gen) { wire.close(); return }
      this.wire = wire
      this.beat = setInterval(() => this.emitAd(), BEAT_MS) as unknown as number
      this.prune = setInterval(() => this.sweep(), 1500) as unknown as number
      this.emitAd()
    })()
    try { await this.opening } finally { this.opening = null }
  }

  /**
   * Broadcast no Realtime: entra, pede "hi" e quem já tem sala responde na hora.
   * Antes isso passava por datachannel, então dependia de um handshake WebRTC
   * com cada peer do lobby — daí a sala demorar tanto pra aparecer.
   */
  private openSupabase(): Promise<Wire> {
    const { url, key } = supabaseInfo()
    const client = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })
    const chan: RealtimeChannel = client.channel(CHANNEL, { config: { broadcast: { self: false } } })
    chan.on('broadcast', { event: 'ad' }, m => this.takeAd(m.payload as RoomAd))
    chan.on('broadcast', { event: 'hi' }, () => this.emitAd())
    return new Promise<Wire>(resolve => {
      let settled = false
      const wire: Wire = {
        send: ad => { void chan.send({ type: 'broadcast', event: 'ad', payload: ad }) },
        close: () => { void client.removeChannel(chan) },
      }
      const done = () => { if (!settled) { settled = true; resolve(wire) } }
      setTimeout(done, 6000)
      chan.subscribe(status => {
        if (status !== 'SUBSCRIBED') return
        void chan.send({ type: 'broadcast', event: 'hi', payload: {} })
        done()
      })
    })
  }

  /** Reserva pra quando o Supabase estiver dormindo: anúncio por datachannel mesmo. */
  private async openTrystero(): Promise<Wire> {
    const join = await loadStrategy(await pickStrategy())
    await ensureIce()
    const room: TRoom = join(LOBBY_ID)
    const [send, get] = room.makeAction<RoomAd>('ad')
    get(ad => this.takeAd(ad))
    room.onPeerJoin(() => this.emitAd())
    return { send: ad => { void send(ad) }, close: () => room.leave() }
  }

  private emitAd() {
    if (!this.wire || !this.mine) return
    this.wire.send({ ...this.mine, ts: Date.now() })
  }

  private sweep() {
    const now = Date.now()
    let dirty = false
    for (const [k, v] of this.ads) {
      if (now - v.ts > TTL_MS) { this.ads.delete(k); dirty = true }
    }
    if (dirty) this.notify()
  }

  private list(): RoomAd[] {
    return [...this.ads.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  private notify() {
    const l = this.list()
    for (const cb of this.watchers) cb(l)
  }

  close() {
    this.gen++
    clearTimeout(this.closeTimer)
    clearInterval(this.beat)
    clearInterval(this.prune)
    this.wire?.close()
    this.wire = null
    this.ads.clear()
  }
}
