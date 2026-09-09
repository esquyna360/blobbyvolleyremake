import type { RealtimeChannel } from '@supabase/supabase-js'
import { ensureIce, loadStrategy, pickStrategy } from './transport.ts'
import { supa } from './supa.ts'

type Mod = typeof import('trystero/nostr')
type TRoom = ReturnType<Mod['joinRoom']>

export interface AdInput {
  code: string
  name: string
  rule: string
  lock: number
  /** 1 = partida rolando, dá pra assistir. */
  live: number
  foe: string
  sl: number
  sr: number
}

export interface RoomAd extends AdInput {
  ts: number
  [k: string]: string | number
}

export const openAd = (code: string, name: string, rule: string, lock: number): AdInput =>
  ({ code, name, rule, lock, live: 0, foe: '', sl: 0, sr: 0 })

const LOBBY_ID = 'lobby-v1'
const CHANNEL = 'blobby-lobby-v1'
const BEAT_MS = 2000
/** Entrar no canal pode levar 10s+ em máquina com IPv6 quebrado: esperar de verdade. */
const JOIN_MS = 22000
const JOIN_TRIES = 3
const TTL_MS = 7000
const GRACE_MS = 20000

/** Em que rede o lobby está de fato — antes isso era invisível quando dava errado. */
export type LobbyNet = 'off' | 'connecting' | 'on' | 'fallback'

/** Como os anúncios saem daqui. O canal do Supabase é WebSocket puro, sem P2P. */
interface Wire {
  send(ad: RoomAd): void
  close(): void
}

export class Lobby {
  net: LobbyNet = 'off'
  netInfo = 'lobby desligado'
  private netCbs = new Set<(n: LobbyNet, info: string) => void>()
  private wire: Wire | null = null
  private opening: Promise<void> | null = null
  private ads = new Map<string, RoomAd>()
  private watchers = new Set<(rooms: RoomAd[]) => void>()
  private mine: RoomAd | null = null
  private beat = 0
  private prune = 0
  private closeTimer = 0
  private gen = 0

  onNet(cb: (n: LobbyNet, info: string) => void): () => void {
    this.netCbs.add(cb)
    cb(this.net, this.netInfo)
    return () => { this.netCbs.delete(cb) }
  }

  private setNet(n: LobbyNet, info: string) {
    if (this.net === n && this.netInfo === info) return
    this.net = n
    this.netInfo = info
    for (const cb of this.netCbs) cb(n, info)
  }

  watch(cb: (rooms: RoomAd[]) => void): () => void {
    this.watchers.add(cb)
    void this.open().then(() => cb(this.list()))
    cb(this.list())
    return () => {
      this.watchers.delete(cb)
      this.scheduleClose()
    }
  }

  advertise(ad: AdInput | null) {
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

  /** Placar muda no meio da partida: atualiza o anúncio sem reabrir o canal. */
  patchAd(p: Partial<AdInput>) {
    const mine = this.mine
    if (!mine) return
    let dirty = false
    for (const [k, v] of Object.entries(p)) {
      if (v !== undefined && mine[k] !== v) { mine[k] = v as string | number; dirty = true }
    }
    if (dirty) this.emitAd()
  }

  private takeAd(ad: RoomAd) {
    if (!ad || typeof ad.code !== 'string') return
    if (this.mine && ad.code === this.mine.code) return
    this.ads.set(ad.code, {
      ...ad,
      live: Number(ad.live) || 0,
      foe: String(ad.foe ?? ''),
      sl: Number(ad.sl) || 0,
      sr: Number(ad.sr) || 0,
      ts: Date.now(),
    })
    this.notify()
  }

  private async open() {
    clearTimeout(this.closeTimer)
    if (this.wire) return
    if (this.opening) return this.opening
    const gen = ++this.gen
    this.opening = (async () => {
      this.setNet('connecting', 'lobby: conectando…')
      const strategy = await pickStrategy()
      let wire: Wire
      let net: LobbyNet = 'fallback'
      try {
        if (strategy === 'supabase') { wire = await this.openSupabase(); net = 'on' }
        else wire = await this.openTrystero()
      } catch {
        try { wire = await this.openTrystero() } catch {
          this.setNet('off', 'lobby: sem conexão — outras salas não aparecem')
          return
        }
      }
      if (gen !== this.gen) { wire.close(); return }
      this.wire = wire
      this.setNet(net, net === 'on' ? 'lobby: conectado' : 'lobby: rede reserva (mais lento)')
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
  private async openSupabase(): Promise<Wire> {
    const client = supa()
    for (let t = 1; ; t++) {
      try { return await this.joinChannel(client) } catch (e) {
        if (t >= JOIN_TRIES) throw e
        this.setNet('connecting', `lobby: reconectando (${t}/${JOIN_TRIES})…`)
        await new Promise(r => setTimeout(r, 500 * t))
      }
    }
  }

  /**
   * Só devolve quando o canal entrou mesmo. Antes isso resolvia por timeout de 6s
   * e seguia com um canal morto: quem demorava mais que isso pra abrir o WebSocket
   * ficava invisível no lobby, sem um único erro na tela.
   */
  private joinChannel(client: ReturnType<typeof supa>): Promise<Wire> {
    const chan: RealtimeChannel = client.channel(CHANNEL, { config: { broadcast: { self: false } } })
    chan.on('broadcast', { event: 'ad' }, m => this.takeAd(m.payload as RoomAd))
    chan.on('broadcast', { event: 'hi' }, () => this.emitAd())
    return new Promise<Wire>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => fail('demorou demais'), JOIN_MS)
      function fail(why: string) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void client.removeChannel(chan)
        reject(new Error(why))
      }
      chan.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (settled) return
          settled = true
          clearTimeout(timer)
          void chan.send({ type: 'broadcast', event: 'hi', payload: {} })
          resolve({
            send: ad => { void chan.send({ type: 'broadcast', event: 'ad', payload: ad }) },
            close: () => { void client.removeChannel(chan) },
          })
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') fail(status)
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
    this.setNet('off', 'lobby desligado')
  }
}
