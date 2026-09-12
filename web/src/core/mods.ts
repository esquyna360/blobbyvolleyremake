/**
 * Modificadores de partida. Simétricos, sem input novo, só entram e saem com a
 * bola parada. Tudo que altera física vive no PhysicWorld; aqui é a tabela.
 */
export const enum Mod {
  LUNAR = 0, BOWLING = 1, BALLOON = 2, ICE = 3, SWELL = 4,
  NET = 5, SPLIT = 6, BOUNCE = 7, WIND = 8, JELLY = 9,
}
export const MOD_COUNT = 10

export interface ModInfo { id: Mod; key: string; name: string; desc: string; color: string }

export const MODS: ModInfo[] = [
  { id: 0, key: 'lunar', name: 'Gravidade Lunar', desc: 'tudo cai devagar: pulos altíssimos, rallies longos', color: '#c9d6ff' },
  { id: 1, key: 'bowling', name: 'Bola de Boliche', desc: 'bola pesada: cai rápido, quica pouco, empurra o blob', color: '#3b3550' },
  { id: 2, key: 'balloon', name: 'Bola Balão', desc: 'bola leve e maior: flutua, desce devagar, desvia', color: '#ff8fb8' },
  { id: 3, key: 'ice', name: 'Chão de Gelo', desc: 'sem atrito: o blob desliza e escorrega ao aterrissar', color: '#9be7ff' },
  { id: 4, key: 'swell', name: 'Inchaço', desc: 'quem perde o ponto incha: maior, mais lento, pula menos', color: '#ffb35c' },
  { id: 5, key: 'net', name: 'Rede Crescente', desc: 'a rede sobe um pouco a cada ponto', color: '#e8e8e8' },
  { id: 6, key: 'split', name: 'Bola Dividida', desc: 'bola na rede vira duas; o ponto acaba quando a última cai', color: '#ffe066' },
  { id: 7, key: 'bounce', name: 'Pula-Pula', desc: 'os blobs nunca param de pular', color: '#8dff9a' },
  { id: 8, key: 'wind', name: 'Ventania', desc: 'vento lateral que muda a cada ponto', color: '#bfe9d8' },
  { id: 9, key: 'jelly', name: 'Gelatina', desc: 'blobs moles demais: deformam muito e demoram a voltar', color: '#c48bff' },
]

export type ModMode = 'off' | 'custom' | 'roulette' | 'chaos'
export const MOD_MODES: [ModMode, string, string][] = [
  ['off', 'Nenhum', 'partida normal'],
  ['custom', 'Custom', 'você liga o que quiser, combinação livre'],
  ['roulette', 'Roleta', 'a cada ponto sorteia um modificador que substitui o anterior'],
  ['chaos', 'Caos', 'a cada ponto entra mais um e nada sai'],
]
export const MOD_MODE_ID: Record<ModMode, number> = { off: 0, custom: 1, roulette: 2, chaos: 3 }
export const MOD_MODE_BY_ID: ModMode[] = ['off', 'custom', 'roulette', 'chaos']

/** Pares que juntos não se sustentam (definido por teste). */
export const FORBIDDEN: [Mod, Mod][] = [
  [Mod.BOWLING, Mod.BALLOON],
  [Mod.LUNAR, Mod.BALLOON],
  [Mod.BOUNCE, Mod.ICE],
]

/** Intensidade quando empilhado com outros: três efeitos somados não podem quebrar a simulação. */
export const MOD_STACK: number[] = [0.7, 0.75, 0.7, 0.7, 0.8, 0.8, 1, 1, 0.7, 0.75]

export const hasMod = (mask: number, m: Mod) => ((mask >> m) & 1) === 1
export const modCount = (mask: number) => { let n = 0; for (let i = 0; i < MOD_COUNT; i++) if ((mask >> i) & 1) n++; return n }

export function forbiddenWith(mask: number, m: Mod): boolean {
  for (const [a, b] of FORBIDDEN) {
    if (a === m && hasMod(mask, b)) return true
    if (b === m && hasMod(mask, a)) return true
  }
  return false
}

/** Liga um modificador desligando o par proibido. */
export function toggleMod(mask: number, m: Mod): number {
  if (hasMod(mask, m)) return mask & ~(1 << m)
  let out = mask | (1 << m)
  for (const [a, b] of FORBIDDEN) {
    if (a === m) out &= ~(1 << b)
    if (b === m) out &= ~(1 << a)
  }
  return out
}

export function modList(mask: number): ModInfo[] { return MODS.filter(m => hasMod(mask, m.id)) }

export const modIds = (mask: number): number[] => { const r: number[] = []; for (let i = 0; i < MOD_COUNT; i++) if ((mask >> i) & 1) r.push(i); return r }
