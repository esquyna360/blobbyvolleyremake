type Mod = typeof import('trystero/nostr')
type TRoom = ReturnType<Mod['joinRoom']>

export interface RoomAd {
  code: string
  name: string
  rule: string
  ts: number
  [k: string]: string | number
}

const LOBBY_ID = 'lobby-v1'
const BEAT_MS = 2000
const TTL_MS = 7000

export class Lobby {
  private room: TRoom | null = null
  private opening: Promise<void> | null = null
  private push: ((d: RoomAd) => void) | null = null
  private ads = new Map<string, RoomAd>()
  private watchers = new Set<(rooms: RoomAd[]) => void>()
  private mine: RoomAd | null = null
  private beat = 0
  private prune = 0

  watch(cb: (rooms: RoomAd[]) => void): () => void {
    this.watchers.add(cb)
    void this.open().then(() => cb(this.list()))
    cb(this.list())
    return () => {
      this.watchers.delete(cb)
      if (!this.watchers.size && !this.mine) this.close()
    }
  }

  advertise(ad: { code: string; name: string; rule: string } | null) {
    this.mine = ad ? { ...ad, ts: Date.now() } : null
    if (!ad) {
      if (!this.watchers.size) this.close()
      return
    }
    void this.open().then(() => this.emitAd())
  }

  private async open() {
    if (this.room) return
    if (this.opening) return this.opening
    this.opening = (async () => {
      const mod = await import('trystero/nostr')
      const room = mod.joinRoom({ appId: 'blobbyremake-v1' }, LOBBY_ID)
      const [send, get] = room.makeAction<RoomAd>('ad')
      get(ad => {
        if (!ad || typeof ad.code !== 'string') return
        if (this.mine && ad.code === this.mine.code) return
        this.ads.set(ad.code, { ...ad, ts: Date.now() })
        this.notify()
      })
      room.onPeerJoin(() => this.emitAd())
      this.room = room
      this.push = send
      this.beat = setInterval(() => this.emitAd(), BEAT_MS) as unknown as number
      this.prune = setInterval(() => this.sweep(), 1500) as unknown as number
      this.emitAd()
    })()
    try { await this.opening } finally { this.opening = null }
  }

  private emitAd() {
    if (!this.push || !this.mine) return
    this.push({ ...this.mine, ts: Date.now() })
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
    clearInterval(this.beat)
    clearInterval(this.prune)
    this.room?.leave()
    this.room = null
    this.push = null
    this.ads.clear()
  }
}
