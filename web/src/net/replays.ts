import { SIM_VERSION, decodeReplay, encodeReplay } from '../core/replay.ts'
import type { ReplayMeta } from '../core/replay.ts'
import { rpc } from './rank.ts'

export interface ReplayCard {
  id: string
  meta: ReplayMeta
  at: number
  views: number
  local: boolean
}

interface StoredReplay { id: string; sim: number; meta: ReplayMeta; data: string; at: number }

const LOCAL_KEY = 'bv.replays'
const LOCAL_MAX = 10
/** localStorage costuma ter 5 MB no total; o jogo não pode comer tudo. */
const LOCAL_BUDGET = 900_000

function readLocal(): StoredReplay[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as StoredReplay[]
    return Array.isArray(arr) ? arr.filter(r => r && typeof r.data === 'string') : []
  } catch { return [] }
}

function writeLocal(list: StoredReplay[]) {
  let out = list.slice(0, LOCAL_MAX)
  let size = out.reduce((n, r) => n + r.data.length, 0)
  while (out.length > 1 && size > LOCAL_BUDGET) {
    size -= out[out.length - 1].data.length
    out = out.slice(0, -1)
  }
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(out)) } catch { /* cota cheia */ }
}

export function localReplays(): ReplayCard[] {
  return readLocal()
    .filter(r => r.sim === SIM_VERSION)
    .map(r => ({ id: r.id, meta: r.meta, at: r.at, views: 0, local: true }))
}

export async function saveLocalReplay(meta: ReplayMeta, l: Uint8Array, r: Uint8Array) {
  const data = await encodeReplay(l, r)
  const id = `l${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
  writeLocal([{ id, sim: SIM_VERSION, meta, data, at: Date.now() }, ...readLocal()])
  return id
}

/**
 * Online os dois lados sobem o mesmo replay: o id vem do matchKey, então o
 * segundo upload cai no `on conflict do nothing` em vez de duplicar.
 */
export async function saveOnlineReplay(id: string, meta: ReplayMeta, l: Uint8Array, r: Uint8Array) {
  const data = await encodeReplay(l, r)
  if (data.length > 230_000) return false
  const ok = await rpc<boolean>('save_replay_v2', {
    p_id: id, p_sim: SIM_VERSION, p_meta: meta, p_data: data,
  })
  return ok === true
}

interface ListRow { id: string; meta: ReplayMeta; created_at: string; views: number }

export async function onlineReplays(limit = 20): Promise<ReplayCard[]> {
  const rows = await rpc<ListRow[]>('list_replays', { p_sim: SIM_VERSION, p_limit: limit }, false)
  if (!rows) return []
  return rows.map(r => ({
    id: r.id, meta: r.meta, at: Date.parse(r.created_at) || 0, views: r.views ?? 0, local: false,
  }))
}

export async function loadReplay(card: ReplayCard): Promise<{ meta: ReplayMeta; l: Uint8Array; r: Uint8Array } | null> {
  let data = ''
  let meta = card.meta
  if (card.local) {
    const hit = readLocal().find(r => r.id === card.id)
    if (!hit) return null
    data = hit.data
    meta = hit.meta
  } else {
    const rows = await rpc<{ sim: number; meta: ReplayMeta; data: string }[]>('get_replay', { p_id: card.id }, false)
    const hit = rows?.[0]
    if (!hit || hit.sim !== SIM_VERSION) return null
    data = hit.data
    meta = hit.meta
  }
  const bits = await decodeReplay(data)
  if (!bits) return null
  return { meta, l: bits.l, r: bits.r }
}
