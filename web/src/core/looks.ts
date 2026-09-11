/**
 * Aparência do blobby: cor do corpo, penteado e cor do cabelo. É só pintura —
 * nada aqui entra na física. A curva de cada mecha sai daqui e não de cada
 * renderizador, então o cabelo do 2D e o do 3D são o mesmo desenho.
 */

export interface Tuft {
  /** graus na cabeça: 0 é o topo, positivo vai pro lado que o blob encara */
  a: number
  /** comprimento em raios de cabeça */
  len: number
  /** meia-largura na raiz, em raios */
  w: number
  /** dobra: positivo curva pra frente */
  curve: number
}

/** Massa redonda: cacho, coque, franja cheia. */
export interface Puff {
  a: number
  /** distância do centro da cabeça, em raios */
  d: number
  r: number
}

export interface HairStyle {
  id: string
  name: string
  tufts: Tuft[]
  puffs: Puff[]
}

const T = (a: number, len: number, w: number, curve = 0): Tuft => ({ a, len, w, curve })
const P = (a: number, d: number, r: number): Puff => ({ a, d, r })

const fan = (from: number, to: number, n: number, f: (a: number, i: number) => Puff) =>
  Array.from({ length: n }, (_, i) => f(from + ((to - from) * i) / (n - 1), i))

export const HAIR_STYLES: HairStyle[] = [
  { id: 'careca', name: 'Careca', tufts: [], puffs: [] },
  {
    id: 'espeto',
    name: 'Espetado',
    tufts: [
      T(-52, 0.72, 0.15, -0.16), T(-26, 0.92, 0.16, -0.08), T(0, 1.02, 0.17, 0.02),
      T(26, 0.92, 0.16, 0.12), T(52, 0.74, 0.15, 0.2),
    ],
    puffs: [],
  },
  {
    id: 'moicano',
    name: 'Moicano',
    tufts: [
      T(-26, 0.5, 0.11), T(-13, 0.86, 0.12), T(0, 1.12, 0.13),
      T(13, 0.9, 0.12, 0.06), T(26, 0.56, 0.11, 0.1),
    ],
    puffs: [],
  },
  {
    id: 'cachos',
    name: 'Cachos',
    tufts: [],
    puffs: [
      ...fan(-104, 104, 9, a => P(a, 0.94, 0.26)),
      ...fan(-62, 62, 5, a => P(a, 1.16, 0.23)),
    ],
  },
  {
    id: 'black',
    name: 'Black power',
    tufts: [],
    puffs: [
      ...fan(-124, 124, 10, a => P(a, 1.12, 0.4)),
      ...fan(-78, 78, 6, a => P(a, 1.46, 0.36)),
    ],
  },
  {
    id: 'cuia',
    name: 'Corte de cuia',
    tufts: [T(86, 0.44, 0.24, 1.0), T(-86, 0.44, 0.24, -1.0)],
    puffs: fan(-132, 132, 13, a => P(a, 0.92, 0.3)),
  },
  {
    id: 'rabo',
    name: 'Rabo de cavalo',
    tufts: [T(-104, 1.7, 0.3, -0.55), T(-22, 0.42, 0.14, -0.3), T(6, 0.38, 0.13, 0.26)],
    puffs: [...fan(-92, 44, 6, a => P(a, 0.92, 0.25)), P(-108, 1.14, 0.2)],
  },
  {
    id: 'franja',
    name: 'Franja',
    tufts: [
      T(8, 0.62, 0.2, 0.62), T(30, 0.72, 0.21, 0.66), T(52, 0.66, 0.2, 0.6),
      T(-30, 0.44, 0.17, -0.3),
    ],
    puffs: fan(-70, 20, 5, a => P(a, 0.9, 0.24)),
  },
  {
    id: 'coque',
    name: 'Coque',
    tufts: [],
    puffs: [
      P(-8, 1.42, 0.34), P(-30, 1.2, 0.2), P(14, 1.22, 0.2),
      ...fan(-102, 102, 8, a => P(a, 0.88, 0.23)),
    ],
  },
  {
    id: 'longo',
    name: 'Cabelo longo',
    tufts: [
      T(-78, 0.95, 0.26, -1.8), T(-96, 1.1, 0.28, -1.6), T(-114, 0.95, 0.25, -1.3),
      T(78, 0.92, 0.26, 1.8), T(96, 1.08, 0.28, 1.6), T(114, 0.95, 0.25, 1.3),
    ],
    puffs: [...fan(-62, 62, 7, a => P(a, 0.9, 0.27)), P(-100, 1.02, 0.3), P(100, 1.02, 0.3)],
  },
  {
    id: 'antenas',
    name: 'Antenas',
    tufts: [T(-24, 1.5, 0.075, -0.42), T(22, 1.55, 0.075, 0.44)],
    puffs: [P(-58, 1.86, 0.15), P(56, 1.92, 0.15)],
  },
  {
    id: 'chama',
    name: 'Chama',
    tufts: [
      T(-24, 1.24, 0.19, 0.3), T(-6, 1.66, 0.21, 0.26), T(14, 1.4, 0.2, 0.34),
      T(34, 0.94, 0.17, 0.42),
    ],
    puffs: [],
  },
]

export interface ColorOpt { id: string; name: string; hex: string }

export const BODY_COLORS: ColorOpt[] = [
  { id: 'vermelho', name: 'Vermelho', hex: '#ec2f3f' },
  { id: 'azul', name: 'Azul', hex: '#2f7ff0' },
  { id: 'verde', name: 'Verde', hex: '#2fbf5c' },
  { id: 'roxo', name: 'Roxo', hex: '#9b5cf0' },
  { id: 'laranja', name: 'Laranja', hex: '#ff8a2b' },
  { id: 'rosa', name: 'Rosa', hex: '#ff5fa8' },
  { id: 'ciano', name: 'Ciano', hex: '#22cfd4' },
  { id: 'amarelo', name: 'Amarelo', hex: '#f5c62e' },
  { id: 'menta', name: 'Menta', hex: '#79e0b4' },
  { id: 'areia', name: 'Areia', hex: '#d9ac72' },
  { id: 'grafite', name: 'Grafite', hex: '#4a5364' },
  { id: 'neve', name: 'Neve', hex: '#e6ecf5' },
]

export const HAIR_COLORS: ColorOpt[] = [
  { id: 'preto', name: 'Preto', hex: '#221d2a' },
  { id: 'castanho', name: 'Castanho', hex: '#6b4326' },
  { id: 'loiro', name: 'Loiro', hex: '#e8c66a' },
  { id: 'ruivo', name: 'Ruivo', hex: '#d1522a' },
  { id: 'branco', name: 'Branco', hex: '#f0f3f8' },
  { id: 'prata', name: 'Prata', hex: '#aab6c9' },
  { id: 'rosa', name: 'Rosa', hex: '#ff6fb5' },
  { id: 'azul', name: 'Azul', hex: '#4aa8ff' },
  { id: 'verde', name: 'Verde', hex: '#3ec46e' },
  { id: 'roxo', name: 'Roxo', hex: '#a06bff' },
]

export interface PlayerLook {
  body: number
  hair: number
  hairColor: number
}

const wrap = (v: number, n: number) => ((v % n) + n) % n

export const defaultLook = (side: number): PlayerLook => ({
  body: side === 0 ? 0 : 1, hair: 0, hairColor: 0,
})

/**
 * Visual do bot, sorteado a cada partida. Só pintura, então `Math.random` aqui
 * não encosta na simulação — e `avoidBody` existe pra ele nunca sair da mesma
 * cor que a minha.
 */
export function rollLook(avoidBody: number): PlayerLook {
  const pick = (n: number) => Math.floor(Math.random() * n)
  const n = BODY_COLORS.length
  const body = (avoidBody + 1 + pick(n - 1)) % n
  return { body, hair: pick(HAIR_STYLES.length), hairColor: pick(HAIR_COLORS.length) }
}

export const bodyHex = (l: PlayerLook) => BODY_COLORS[wrap(l.body, BODY_COLORS.length)].hex
export const hairHex = (l: PlayerLook) => HAIR_COLORS[wrap(l.hairColor, HAIR_COLORS.length)].hex
export const hairStyle = (l: PlayerLook) => HAIR_STYLES[wrap(l.hair, HAIR_STYLES.length)]

/** Ponto de uma mecha: centro e meia-largura, em raios de cabeça e com y pra cima. */
export interface Bead { x: number; y: number; hw: number }

/** A raiz entra um pouco na cabeça: encostada na superfície a mecha descola. */
const ROOT = 0.84

export function tuftBeads(t: Tuft, steps = 9): Bead[] {
  const rad = (t.a * Math.PI) / 180
  const nx = Math.sin(rad), ny = Math.cos(rad)
  const px = ny, py = -nx
  const rx = nx * ROOT, ry = ny * ROOT
  const tx = rx + nx * t.len + px * t.curve * t.len
  const ty = ry + ny * t.len + py * t.curve * t.len
  const cx = rx + nx * t.len * 0.5 + px * t.curve * t.len * 0.22
  const cy = ry + ny * t.len * 0.5 + py * t.curve * t.len * 0.22
  const out: Bead[] = []
  for (let i = 0; i <= steps; i++) {
    const s = i / steps
    const u = 1 - s
    out.push({
      x: u * u * rx + 2 * u * s * cx + s * s * tx,
      y: u * u * ry + 2 * u * s * cy + s * s * ty,
      hw: t.w * (0.14 + 0.86 * Math.pow(1 - s, 0.7)),
    })
  }
  return out
}

export const puffCenter = (p: Puff) => {
  const rad = (p.a * Math.PI) / 180
  return { x: Math.sin(rad) * p.d, y: Math.cos(rad) * p.d }
}

/** k<1 escurece, k>1 clareia. Serve pro contorno e pro brilho. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255))
    .toString(16).padStart(6, '0')}`
}

export function packLook(l: PlayerLook): [number, number, number] {
  return [wrap(l.body, BODY_COLORS.length), wrap(l.hair, HAIR_STYLES.length),
    wrap(l.hairColor, HAIR_COLORS.length)]
}

export function unpackLook(a: number, b: number, c: number): PlayerLook {
  return { body: wrap(a, BODY_COLORS.length), hair: wrap(b, HAIR_STYLES.length),
    hairColor: wrap(c, HAIR_COLORS.length) }
}

const KEY = 'bv.look'

/** Guardado por id e não por índice: mexer na ordem das listas não repinta ninguém. */
export function saveLook(l: PlayerLook) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      body: BODY_COLORS[wrap(l.body, BODY_COLORS.length)].id,
      hair: HAIR_STYLES[wrap(l.hair, HAIR_STYLES.length)].id,
      hairColor: HAIR_COLORS[wrap(l.hairColor, HAIR_COLORS.length)].id,
    }))
  } catch { /* sem storage, sem problema */ }
}

export function loadLook(): PlayerLook {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLook(0)
    const j = JSON.parse(raw) as Record<string, string>
    const at = <T extends { id: string }>(list: T[], id: string) =>
      Math.max(0, list.findIndex(x => x.id === id))
    return {
      body: at(BODY_COLORS, j.body), hair: at(HAIR_STYLES, j.hair),
      hairColor: at(HAIR_COLORS, j.hairColor),
    }
  } catch { return defaultLook(0) }
}
