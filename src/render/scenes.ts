/**
 * Cenário. Os três primeiros são só pintura — céu, chão, luz, o que passa na
 * frente e a música. Os seis novos também são regra: cada um carrega um
 * `rule` que o simulador lê, então trocar de cenário no meio de uma partida
 * online muda a física dos dois lados e entra no aperto de mão.
 */
import type { SceneRuleId } from '../core/scene-rules.ts'

export type SceneId =
  | 'praia' | 'luau' | 'ginasio'
  | 'tempestade' | 'rave' | 'fundo' | 'trem' | 'gameboy' | 'nuvens'

/** Trilha do menu: fica fora da lista de cenários porque não é um. */
export const MENU_SONG = 'menu'

export type Foreground = 'gulls' | 'fireflies' | 'confetti' | 'rain' | 'sparks' | 'bubbles' | 'dust' | 'pixels' | 'birds'

/**
 * Mobília extra do cenário. Fica separado de Scene3D porque só os cenários
 * novos usam: assim praia, luau e ginásio continuam do jeito que estavam.
 */
export interface SceneFX {
  /** chuva de convés, 0..1 */
  rain?: number
  /** tábuas, mastro no lugar do poste da rede, lampião */
  deck?: boolean
  /** cidade neon ao fundo e luz que pulsa na batida */
  neon?: number
  /** cáustica, alga, cardume e coluna de bolha */
  water?: number
  /** paisagem correndo, postes e o escuro do túnel */
  train?: number
  /** quatro tons de verde e a moldura do console */
  lcd?: number
  /** ilhas flutuantes e as três nuvens que servem de chão */
  islands?: number
  /** lua gigante subindo ao longo da partida */
  moon?: number
}

export interface Scene2D {
  /** faixas do topo até o horizonte */
  sky: string[]
  /** faixas do horizonte até o fim do mar/fundo */
  mid: string[]
  /** faixas do chão */
  ground: string[]
  /** y do horizonte em unidades de quadra */
  horizon: number
  /** onde o mar acaba e a areia começa */
  shore: number
  cloud: string | null
  clouds: number
  star: string | null
  stars: number
  /** disco no céu: sol, lua ou nada */
  orb: { x: number; y: number; r: number; color: string; halo: string } | null
  hills: string | null
  /** riscos de espuma no mar */
  foam: string | null
  /** cor das linhas da quadra e das paredes */
  line: string
  /** véu de cor por cima de tudo, pra unificar a paleta */
  wash: string | null
  sand: string
  sandDark: string
}

export interface Scene3D {
  sun: [number, number, number]
  /** multiplica o céu inteiro: < 1 escurece pra noite */
  exposure: number
  fog: [number, number, number]
  fogDensity: number
  /** cor da luz direcional e da ambiente */
  key: number
  keyIntensity: number
  ambient: number
  ambientIntensity: number
  sand: [number, number, number]
  fx?: SceneFX
  ocean: boolean
  oceanTint: [number, number, number]
  palms: boolean
  /** fogueira ao lado da quadra: 0 desliga */
  fire: number
  /** ginásio: teto, arquibancada e refletores no lugar do céu aberto */
  indoor: boolean
}

export interface Scene {
  id: SceneId
  name: string
  hint: string
  /** id da trilha em public/music */
  music: string
  /** regra que este cenário impõe à simulação; 'none' = cenário só de pintura */
  rule: SceneRuleId
  fg: Foreground
  night: boolean
  d2: Scene2D
  d3: Scene3D
}

export const SCENES: Record<SceneId, Scene> = {
  praia: {
    id: 'praia',
    name: 'Praia',
    hint: 'sol a pino, mar aberto',
    music: 'praia',
    rule: 'none',
    fg: 'gulls',
    night: false,
    d2: {
      sky: ['#0d4a9c', '#4d9dd8', '#c6e6f4'],
      mid: ['#1c7f92', '#41cbbe'],
      ground: ['#e6d0a2', '#c9a771'],
      horizon: 418,
      shore: 470,
      cloud: 'rgba(255,255,255,0.55)',
      clouds: 4,
      star: null,
      stars: 0,
      orb: { x: 0.78, y: 250, r: 34, color: 'rgba(255,242,205,0.95)', halo: 'rgba(255,240,190,0.30)' },
      hills: 'rgba(112,133,156,0.55)',
      foam: 'rgba(255,255,255,0.30)',
      line: 'rgba(255,255,255,0.55)',
      wash: null,
      sand: '#e6d0a2',
      sandDark: '#9c7c4c',
    },
    d3: {
      sun: [-0.62, 0.58, 0.53],
      exposure: 1.0,
      fog: [0.62, 0.74, 0.86],
      fogDensity: 0.0009,
      key: 0xfff2dc,
      keyIntensity: 2.5,
      ambient: 0xbcd8ff,
      ambientIntensity: 0.55,
      sand: [1.0, 1.0, 1.0],
      ocean: true,
      oceanTint: [1.0, 1.0, 1.0],
      palms: true,
      fire: 0,
      indoor: false,
    },
  },

  luau: {
    id: 'luau',
    name: 'Luau',
    hint: 'noite, fogueira e lanterna',
    music: 'luau',
    rule: 'none',
    fg: 'fireflies',
    night: true,
    d2: {
      sky: ['#080c2c', '#1b2160', '#3b3b7d', '#6b4a72'],
      mid: ['#101b3e', '#1d3a5c'],
      ground: ['#5a4a3e', '#3c2f28'],
      horizon: 418,
      shore: 470,
      cloud: 'rgba(122,132,190,0.28)',
      clouds: 3,
      star: 'rgba(255,255,235,0.9)',
      stars: 60,
      orb: { x: 0.2, y: 292, r: 40, color: 'rgba(246,246,226,0.96)', halo: 'rgba(220,226,255,0.22)' },
      hills: 'rgba(24,28,58,0.85)',
      foam: 'rgba(190,210,255,0.22)',
      line: 'rgba(255,214,150,0.5)',
      wash: 'rgba(20,16,60,0.24)',
      sand: '#6a5847',
      sandDark: '#3a2c22',
    },
    d3: {
      sun: [0.34, 0.42, 0.62],
      exposure: 0.22,
      fog: [0.07, 0.09, 0.2],
      fogDensity: 0.0022,
      key: 0xa8c0ff,
      keyIntensity: 1.6,
      ambient: 0x3a4a90,
      ambientIntensity: 1.5,
      sand: [0.74, 0.70, 0.78],
      ocean: true,
      oceanTint: [0.34, 0.42, 0.62],
      palms: true,
      fire: 1,
      indoor: false,
    },
  },

  ginasio: {
    id: 'ginasio',
    name: 'Ginásio',
    hint: 'quadra coberta, torcida no pé do ouvido',
    music: 'ginasio',
    rule: 'none',
    fg: 'confetti',
    night: false,
    d2: {
      sky: ['#171b28', '#232a3d', '#2e3850', '#38405c'],
      mid: ['#2b3147', '#3a415c'],
      ground: ['#c98f4e', '#a06f37'],
      horizon: 300,
      shore: 430,
      cloud: null,
      clouds: 0,
      star: null,
      stars: 0,
      orb: null,
      hills: null,
      foam: null,
      line: 'rgba(255,255,255,0.72)',
      wash: null,
      sand: '#c98f4e',
      sandDark: '#7a5326',
    },
    d3: {
      sun: [-0.2, 0.92, 0.34],
      exposure: 0.34,
      fog: [0.1, 0.11, 0.16],
      fogDensity: 0.0032,
      key: 0xffffff,
      keyIntensity: 2.1,
      ambient: 0x8ea0c8,
      ambientIntensity: 0.8,
      sand: [1.15, 0.86, 0.6],
      ocean: false,
      oceanTint: [1.0, 1.0, 1.0],
      palms: false,
      fire: 0,
      indoor: true,
    },
  },

  // ============================ os seis que também são regra ============================

  tempestade: {
    id: 'tempestade',
    name: 'Convés',
    hint: 'navio na tempestade — a quadra inclina com a onda',
    music: 'tempestade',
    rule: 'tempestade',
    fg: 'rain',
    night: true,
    d2: {
      sky: ['#05070f', '#0d1524', '#1b2637', '#2c3a4c'],
      mid: ['#101a26', '#1b2c3a'],
      ground: ['#4a3a26', '#2e2419'],
      horizon: 402,
      shore: 462,
      cloud: 'rgba(96,110,132,0.42)',
      clouds: 7,
      star: null,
      stars: 0,
      orb: null,
      hills: 'rgba(12,18,28,0.9)',
      foam: 'rgba(198,216,236,0.34)',
      line: 'rgba(226,214,184,0.44)',
      wash: 'rgba(10,16,28,0.3)',
      sand: '#5a4630',
      sandDark: '#2b2016',
    },
    d3: {
      sun: [0.2, 0.34, 0.5],
      exposure: 0.19,
      fog: [0.07, 0.09, 0.13],
      fogDensity: 0.0042,
      key: 0x9fb6d8,
      keyIntensity: 1.1,
      ambient: 0x2c3a55,
      ambientIntensity: 1.35,
      sand: [0.72, 0.6, 0.46],
      fx: { rain: 1, deck: true },
      ocean: true,
      oceanTint: [0.26, 0.34, 0.5],
      palms: false,
      fire: 0.35,
      indoor: false,
    },
  },

  rave: {
    id: 'rave',
    name: 'Cobertura',
    hint: 'rave no telhado — bater no tempo da batida vale mais',
    music: 'rave',
    rule: 'rave',
    fg: 'sparks',
    night: true,
    d2: {
      sky: ['#08040f', '#160a24', '#2a0f3c', '#3d1450'],
      mid: ['#180a28', '#26103a'],
      ground: ['#2a2030', '#171020'],
      horizon: 392,
      shore: 440,
      cloud: 'rgba(180,90,230,0.16)',
      clouds: 2,
      star: 'rgba(255,220,255,0.7)',
      stars: 30,
      orb: null,
      hills: 'rgba(20,8,32,0.92)',
      foam: null,
      line: 'rgba(255,120,240,0.6)',
      wash: 'rgba(50,0,70,0.2)',
      sand: '#2a2030',
      sandDark: '#120c18',
    },
    d3: {
      sun: [0.1, 0.7, 0.6],
      exposure: 0.18,
      fog: [0.08, 0.03, 0.13],
      fogDensity: 0.0034,
      key: 0xff5ce0,
      keyIntensity: 1.5,
      ambient: 0x5a2a8c,
      ambientIntensity: 1.5,
      sand: [0.6, 0.52, 0.72],
      fx: { neon: 1 },
      ocean: false,
      oceanTint: [1, 1, 1],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },

  fundo: {
    id: 'fundo',
    name: 'Fundo do Mar',
    hint: 'ruínas de Atlântida — gravidade fraca e bola com arrasto',
    music: 'fundo',
    rule: 'fundo',
    fg: 'bubbles',
    night: false,
    d2: {
      sky: ['#04222e', '#075063', '#0b7a8c'],
      mid: ['#063f52', '#0a6274'],
      ground: ['#8a9c86', '#5a6a58'],
      horizon: 360,
      shore: 470,
      cloud: 'rgba(140,220,235,0.14)',
      clouds: 3,
      star: null,
      stars: 0,
      orb: { x: 0.5, y: 120, r: 60, color: 'rgba(190,255,250,0.30)', halo: 'rgba(150,240,255,0.16)' },
      hills: 'rgba(6,52,66,0.72)',
      foam: 'rgba(180,255,250,0.16)',
      line: 'rgba(200,255,250,0.5)',
      wash: 'rgba(4,60,80,0.3)',
      sand: '#8a9c86',
      sandDark: '#41503f',
    },
    d3: {
      sun: [-0.06, 0.97, 0.22],
      exposure: 0.12,
      fog: [0.015, 0.10, 0.15],
      fogDensity: 0.022,
      key: 0x7fd6ee,
      keyIntensity: 0.85,
      ambient: 0x0a3c50,
      ambientIntensity: 0.9,
      sand: [0.42, 0.62, 0.54],
      fx: { water: 1 },
      ocean: false,
      oceanTint: [1, 1, 1],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },

  trem: {
    id: 'trem',
    name: 'Topo do Trem',
    hint: 'vagão em movimento — vento contra e ponte sem parapeito',
    music: 'trem',
    rule: 'trem',
    fg: 'dust',
    night: false,
    d2: {
      sky: ['#2a4a86', '#7a90c0', '#e0b78a', '#f0cf9a'],
      mid: ['#a4744a', '#8a5f3c'],
      ground: ['#4a4038', '#2c2620'],
      horizon: 410,
      shore: 452,
      cloud: 'rgba(255,240,220,0.4)',
      clouds: 5,
      star: null,
      stars: 0,
      orb: { x: 0.16, y: 300, r: 30, color: 'rgba(255,220,160,0.9)', halo: 'rgba(255,180,110,0.3)' },
      hills: 'rgba(120,80,58,0.8)',
      foam: null,
      line: 'rgba(255,235,200,0.5)',
      wash: 'rgba(80,40,10,0.12)',
      sand: '#4a4038',
      sandDark: '#241e18',
    },
    d3: {
      sun: [0.7, 0.34, -0.2],
      exposure: 0.72,
      fog: [0.62, 0.48, 0.36],
      fogDensity: 0.0026,
      key: 0xffd0a0,
      keyIntensity: 2.2,
      ambient: 0x9ab0d8,
      ambientIntensity: 0.7,
      sand: [0.62, 0.56, 0.5],
      fx: { train: 1 },
      ocean: false,
      oceanTint: [1, 1, 1],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },

  gameboy: {
    id: 'gameboy',
    name: 'Game Boy',
    hint: 'dentro do console — a bola só conhece 16 direções',
    music: 'gameboy',
    rule: 'gameboy',
    fg: 'pixels',
    night: false,
    d2: {
      sky: ['#9bbc0f', '#8bac0f'],
      mid: ['#8bac0f', '#306230'],
      ground: ['#306230', '#0f380f'],
      horizon: 380,
      shore: 448,
      cloud: 'rgba(155,188,15,0.5)',
      clouds: 3,
      star: null,
      stars: 0,
      orb: null,
      hills: 'rgba(48,98,48,0.9)',
      foam: null,
      line: 'rgba(15,56,15,0.75)',
      wash: 'rgba(139,172,15,0.10)',
      sand: '#306230',
      sandDark: '#0f380f',
    },
    d3: {
      sun: [-0.3, 0.9, 0.3],
      exposure: 0.85,
      fog: [0.34, 0.42, 0.06],
      fogDensity: 0.0014,
      key: 0xd8f068,
      keyIntensity: 2.3,
      ambient: 0x6b8f2a,
      ambientIntensity: 1.0,
      sand: [0.66, 0.86, 0.3],
      fx: { lcd: 1 },
      ocean: false,
      oceanTint: [1, 1, 1],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },

  nuvens: {
    id: 'nuvens',
    name: 'Nuvens',
    hint: 'plataforma no céu — três nuvens são chão e a bola cai pra sempre',
    music: 'nuvens',
    rule: 'nuvens',
    fg: 'birds',
    night: true,
    d2: {
      sky: ['#100c2e', '#22194e', '#452a66', '#7a4470'],
      mid: ['#2c1f52', '#472e63'],
      ground: ['#6a6480', '#3a3450'],
      horizon: 386,
      shore: 448,
      cloud: 'rgba(230,220,255,0.30)',
      clouds: 6,
      star: 'rgba(255,250,235,0.85)',
      stars: 80,
      orb: { x: 0.5, y: 226, r: 96, color: 'rgba(250,246,226,0.95)', halo: 'rgba(220,220,255,0.20)' },
      hills: 'rgba(30,22,52,0.7)',
      foam: null,
      line: 'rgba(240,232,255,0.5)',
      wash: 'rgba(30,18,60,0.2)',
      sand: '#6a6480',
      sandDark: '#2e2842',
    },
    d3: {
      sun: [0.0, 0.5, 0.86],
      exposure: 0.3,
      fog: [0.14, 0.11, 0.24],
      fogDensity: 0.0028,
      key: 0xe4e0ff,
      keyIntensity: 1.7,
      ambient: 0x4a3a7c,
      ambientIntensity: 1.4,
      sand: [0.72, 0.7, 0.86],
      fx: { islands: 1, moon: 1 },
      ocean: false,
      oceanTint: [1, 1, 1],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },
}

export const SCENE_LIST: [SceneId, string, string][] =
  (Object.keys(SCENES) as SceneId[]).map(id => [id, SCENES[id].name, SCENES[id].hint])

export const getScene = (id: string): Scene => SCENES[id as SceneId] ?? SCENES.praia
