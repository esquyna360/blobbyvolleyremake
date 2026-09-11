const API = 'https://vzxnnixegwfdtexmqbos.supabase.co/rest/v1/rpc'
const KEY = 'sb_publishable_6EHgiq7g9D1vE0s2yyoqtA_PdS2EZiG'

const PID_KEY = 'blobby.pid'

export interface RankRow { name: string; rating: number; wins: number; losses: number }

export function playerId(): string {
  let id = ''
  try { id = localStorage.getItem(PID_KEY) ?? '' } catch { /* modo privado */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID()
    try { localStorage.setItem(PID_KEY, id) } catch { /* modo privado */ }
  }
  return id
}

export async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${API}/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

/**
 * Mesma partida tem que gerar o mesmo id nos dois lados sem tráfego extra:
 * sala, nomes, placar e o frame final — que o rollback mantém idêntico.
 */
export function matchKey(room: string, nameL: string, nameR: string, sl: number, sr: number, frame: number) {
  const raw = `${room}|${nameL}|${nameR}|${sl}:${sr}|${frame}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619) }
  let h2 = 5381
  for (let i = raw.length - 1; i >= 0; i--) h2 = (Math.imul(h2, 33) ^ raw.charCodeAt(i)) >>> 0
  return `${(h >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`
}

export async function leaderboard(limit = 30): Promise<RankRow[]> {
  const rows = await rpc<RankRow[]>('leaderboard', { p_limit: limit })
  return rows ?? []
}

export async function reportMatch(
  match: string, name: string, won: boolean, my: number, their: number,
): Promise<{ rating: number; applied: boolean } | null> {
  const rows = await rpc<{ rating: number; applied: boolean }[]>('report_match', {
    p_match: match,
    p_player: playerId(),
    p_name: name.slice(0, 24) || 'blob',
    p_won: won,
    p_my: my,
    p_their: their,
  })
  return rows?.[0] ?? null
}
