import { supa } from './supa.ts'

export interface RankRow { name: string; tag: string; rating: number; wins: number; losses: number }
export interface MyRank { name: string; tag: string; rating: number; wins: number; losses: number; pos: number }

let authP: Promise<string | null> | null = null

/**
 * Usuário único por aparelho via login anônimo do Supabase: o servidor só
 * aceita resultado assinado por esse token, então ninguém reporta em nome
 * de outro. Sem token (provider desligado, sem rede) o ranking fica off.
 */
export function ensureUser(): Promise<string | null> {
  if (authP) return authP
  authP = (async () => {
    try {
      const c = supa()
      const { data } = await c.auth.getSession()
      if (data.session?.user) return data.session.user.id
      const r = await c.auth.signInAnonymously()
      return r.data.user?.id ?? null
    } catch {
      return null
    }
  })()
  return authP
}

export async function rpc<T>(fn: string, body: Record<string, unknown>, auth = true): Promise<T | null> {
  try {
    if (auth && !(await ensureUser())) return null
    const { data, error } = await supa().rpc(fn, body)
    if (error) return null
    return data as T
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
  const rows = await rpc<RankRow[]>('leaderboard_v2', { p_limit: limit }, false)
  return rows ?? []
}

export async function myRank(): Promise<MyRank | null> {
  const rows = await rpc<MyRank[]>('my_rank', {})
  return rows?.[0] ?? null
}

export async function reportMatch(
  match: string, name: string, won: boolean, my: number, their: number, frames: number,
): Promise<{ rating: number; applied: boolean } | null> {
  const rows = await rpc<{ rating: number; applied: boolean }[]>('report_match_v2', {
    p_match: match,
    p_name: name.slice(0, 24) || 'blob',
    p_won: won,
    p_my: my,
    p_their: their,
    p_frames: frames,
  })
  return rows?.[0] ?? null
}
