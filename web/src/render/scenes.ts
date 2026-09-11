/**
 * Cenário: só pintura. Céu, chão, luz, o que passa na frente e a música. Nada
 * aqui chega na simulação — trocar de cenário no meio da partida não muda uma
 * única trajetória.
 */
import type { DepthId } from './depth.ts'

export type SceneId = 'praia' | 'gruta' | 'luau' | 'ginasio'

/** Trilha do menu: fica fora da lista de cenários porque não é um. */
export const MENU_SONG = 'menu'

export type Foreground =
  | 'gulls' | 'fireflies' | 'confetti' | 'rain' | 'sparks' | 'bubbles' | 'dust' | 'pixels' | 'birds'

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
  /** camadas de silhueta atrás e na frente dos personagens; sem isso, cenário chapado */
  depth: DepthId
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
    depth: 'praia',
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

  gruta: {
    id: 'gruta',
    name: 'Gruta',
    hint: 'cenote aberto, agua que acende',
    music: 'fundo',
    depth: 'gruta',
    fg: 'sparks',
    night: true,
    d2: {
      sky: ['#04141d', '#0a2a35', '#0f4650'],
      mid: ['#0c5f66', '#25b8a2'],
      ground: ['#d6c39a', '#9d8358'],
      horizon: 418,
      shore: 470,
      cloud: null,
      clouds: 0,
      star: 'rgba(178,255,236,0.85)',
      stars: 46,
      orb: { x: 0.5, y: 286, r: 30, color: 'rgba(226,255,246,0.92)', halo: 'rgba(120,255,222,0.26)' },
      hills: null,
      foam: 'rgba(180,255,240,0.24)',
      line: 'rgba(206,255,246,0.55)',
      wash: 'rgba(5,38,46,0.20)',
      sand: '#d6c39a',
      sandDark: '#7f6942',
    },
    d3: {
      sun: [-0.05, 0.95, 0.30],
      exposure: 0.40,
      fog: [0.04, 0.16, 0.19],
      fogDensity: 0.0030,
      key: 0xcdf6ff,
      keyIntensity: 1.45,
      ambient: 0x3d5a6b,
      ambientIntensity: 0.40,
      sand: [1.18, 0.93, 0.64],
      ocean: true,
      oceanTint: [0.34, 1.05, 1.10],
      palms: false,
      fire: 0,
      indoor: false,
    },
  },
  luau: {
    id: 'luau',
    name: 'Luau',
    hint: 'noite, fogueira e lanterna',
    music: 'luau',
    depth: 'luau',
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
    depth: 'none',
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

}

export const SCENE_LIST: [SceneId, string, string][] =
  (Object.keys(SCENES) as SceneId[]).map(id => [id, SCENES[id].name, SCENES[id].hint])

export const getScene = (id: string): Scene => SCENES[id as SceneId] ?? SCENES.praia
