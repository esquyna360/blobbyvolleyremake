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

// ---------- conta com usuário e senha ----------

/** O Supabase exige e-mail; o nome vira um endereço num domínio nosso que nunca recebe nada. */
const MAIL_DOMAIN = 'blobby.esquyna360.github.io'
const NAME_RE = /^[a-z0-9_]{3,16}$/

export interface Account { name: string }

export function validName(raw: string): string | null {
  const n = raw.trim().toLowerCase()
  return NAME_RE.test(n) ? n : null
}

export async function account(): Promise<Account | null> {
  try {
    const { data } = await supa().auth.getUser()
    const u = data.user
    if (!u || u.is_anonymous || !u.email) return null
    return { name: u.email.split('@')[0] }
  } catch { return null }
}

function authError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('already') || m.includes('registered') || m.includes('exists')) return 'esse nome já tem dono'
  if (m.includes('invalid login') || m.includes('credentials')) return 'nome ou senha errados'
  if (m.includes('password')) return 'senha fraca: mínimo 6 caracteres'
  if (m.includes('rate') || m.includes('limit')) return 'muitas tentativas, espera um pouco'
  if (m.includes('confirm') || m.includes('not confirmed')) return 'cadastro ainda não liberado no servidor'
  return 'não deu: ' + msg.slice(0, 60)
}

/**
 * Criar conta em cima do usuário anônimo: o id não muda, então o rating que
 * ele já tinha neste aparelho vai junto.
 */
export async function signUp(rawName: string, pass: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = validName(rawName)
  if (!name) return { ok: false, error: 'nome: 3 a 16 letras minúsculas, números ou _' }
  if (pass.length < 6) return { ok: false, error: 'senha: mínimo 6 caracteres' }
  const email = `${name}@${MAIL_DOMAIN}`
  try {
    const c = supa()
    await ensureUser()
    const { data } = await c.auth.getUser()
    const r = data.user?.is_anonymous
      ? await c.auth.updateUser({ email, password: pass })
      : await c.auth.signUp({ email, password: pass })
    if (r.error) return { ok: false, error: authError(r.error.message) }
    if (!data.user?.is_anonymous) {
      const s = await c.auth.signInWithPassword({ email, password: pass })
      if (s.error) return { ok: false, error: authError(s.error.message) }
    }
    return { ok: true, name }
  } catch (e) {
    return { ok: false, error: authError(String(e)) }
  }
}

export async function signIn(rawName: string, pass: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = validName(rawName)
  if (!name) return { ok: false, error: 'nome inválido' }
  try {
    const r = await supa().auth.signInWithPassword({ email: `${name}@${MAIL_DOMAIN}`, password: pass })
    if (r.error) return { ok: false, error: authError(r.error.message) }
    authP = Promise.resolve(r.data.user?.id ?? null)
    return { ok: true, name }
  } catch (e) {
    return { ok: false, error: authError(String(e)) }
  }
}

/** Sair volta pra um anônimo novo: o aparelho continua podendo jogar e pontuar. */
export async function signOut() {
  try { await supa().auth.signOut() } catch { /* offline */ }
  authP = null
  void ensureUser()
}
