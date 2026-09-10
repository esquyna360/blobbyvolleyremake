import {
  BALL_GRAVITATION, BALL_RADIUS, GRAVITATION, LEFT_PLANE, NET_POSITION_X, RIGHT_PLANE,
} from './constants.ts'

/**
 * Cenário que também é regra. Cada um mexe num eixo da física — inclinação,
 * vento, gravidade, arrasto, empuxo — e a partida vira outra sem virar outro
 * jogo.
 *
 * Tudo aqui é determinístico: só tabela, inteiro e as quatro operações. Não há
 * seno, potência nem sorteio, porque isto roda igual nas duas pontas do
 * rollback. O relógio é `frame`, e nada depende de quando a máquina desenhou.
 */
export type SceneRuleId = 'none' | 'tempestade' | 'rave' | 'fundo' | 'trem' | 'gameboy' | 'nuvens'

export const SCENE_RULE_IDS: SceneRuleId[] =
  ['none', 'tempestade', 'rave', 'fundo', 'trem', 'gameboy', 'nuvens']

export const sceneRuleCode = (id: SceneRuleId) => Math.max(0, SCENE_RULE_IDS.indexOf(id))
export const sceneRuleFromCode = (n: number): SceneRuleId => SCENE_RULE_IDS[n] ?? 'none'

/** sen(2πk/64) × 4096. A onda do navio sai daqui em vez de Math.sin. */
const SIN64 = [
  0, 401, 799, 1189, 1567, 1931, 2276, 2598,
  2896, 3166, 3406, 3612, 3784, 3920, 4017, 4076,
  4096, 4076, 4017, 3920, 3784, 3612, 3406, 3166,
  2896, 2598, 2276, 1931, 1567, 1189, 799, 401,
  0, -401, -799, -1189, -1567, -1931, -2276, -2598,
  -2896, -3166, -3406, -3612, -3784, -3920, -4017, -4076,
  -4096, -4076, -4017, -3920, -3784, -3612, -3406, -3166,
  -2896, -2598, -2276, -1931, -1567, -1189, -799, -401,
]

/** cos/sen dos 16 múltiplos de 22,5° × 4096: as únicas direções do Game Boy. */
const DIR16 = [
  4096, 0, 3784, 1567, 2896, 2896, 1567, 3784,
  0, 4096, -1567, 3784, -2896, 2896, -3784, 1567,
  -4096, 0, -3784, -1567, -2896, -2896, -1567, -3784,
  0, -4096, 1567, -3784, 2896, -2896, 3784, -1567,
]

/** Frames por batida a 124 BPM de base, acelerando com o rally até 186. */
const BEAT = [
  29, 28, 27, 26, 26, 25, 25, 24, 24,
  23, 23, 23, 22, 22, 22, 21, 21, 21,
  21, 20, 20, 20, 20, 20, 19,
]

// ---- tempestade ----
/** 6° de inclinação; a cada terceira onda a maré sobe pra 9,3°. */
export const TILT = GRAVITATION * 0.1051
export const TILT_BIG = 1.55
/** 512 frames por onda: oito segundos e meio de gangorra. */
export const WAVE_PERIOD = 512
/** Quanto da inclinação vira arrasto lateral no blob em pé. */
export const BLOB_SLIDE = 2.6
/** Areia molhada: o mergulho escorrega 30% mais longe que no seco. */
const RAIN_SLIDE = 0.923

// ---- rave ----
/** Fração da batida que ainda conta como no tempo. Encolhe junto com o BPM. */
const BEAT_WINDOW = 145
const BEAT_BOOST = 1.15

// ---- fundo do mar ----
const DEEP_GRAV = 0.6
/** −3% por segundo. Rally curto nem sente; rally longo a bola vai morrendo. */
const DEEP_DRAG = 0.9995
const CURRENT = 0.055
const CURRENT_PERIOD = 720
const BUBBLE_PERIOD = 360
const BUBBLE_UP = 120
const BUBBLE_BAND = 92
const BUBBLE_LIFT = BALL_GRAVITATION * 1.2

// ---- topo do trem ----
const TREM_WIND = 0.03
const TREM_WIND_RALLY = 0.0055
const TREM_WIND_MAX = 0.14
const TUNNEL_PERIOD = 1200
const TUNNEL_LEN = 96
const BRIDGE_PERIOD = 1800
const BRIDGE_LEN = 420

// ---- game boy ----
/** Três velocidades e nada entre elas. */
export const GB_SPEEDS = [9.5, 14.5, 19.5]
export const GB_GLITCH_TOUCHES = 10
export const GB_TELEPORT = 2

// ---- nuvens ----
const GUST_PERIOD = 600
const GUST_WARN = 60
const GUST_LEN = 90
const GUST = 0.17
const MOON_GRAV = 0.7
export const CLOUD_COUNT = 3
export const CLOUD_HALF_W = 78
export const CLOUD_THICK = 13
export const CLOUD_RESTITUTION = 0.6
export const CLOUD_RESPAWN = 260

/** Onde cada nuvem mora. Simétrico: nenhum lado ganha plataforma de graça. */
export function cloudX(i: number) {
  return i === 0 ? NET_POSITION_X - 190 : i === 1 ? NET_POSITION_X + 190 : NET_POSITION_X
}
export function cloudY(i: number) {
  return i === 2 ? 236 : 332
}

/** O que o cenário está fazendo com a física neste frame. */
export interface SceneField {
  /** aceleração horizontal do chão inclinado: pega bola e blob */
  tilt: number
  /** vento: pega só a bola */
  wind: number
  /** multiplica a gravidade de bola e blob */
  grav: number
  /** multiplica a velocidade da bola a cada frame */
  drag: number
  /** empuxo pra cima na bola, já com sinal de subir */
  lift: number
  /** frames por batida; 0 = cenário sem batida */
  beat: number
  /** 1 quando o frame cai dentro da janela da batida */
  onBeat: number
  /** 0 força quadra aberta; -1 respeita o que o jogador escolheu */
  walls: number
  /** arrasto do escorregão do mergulho; 0 = usa o padrão */
  slide: number
  /** direção fixa e velocidade fixa depois de cada toque */
  quantize: number
  /** nuvens ligadas */
  clouds: number
  /** só apresentação: túnel, rajada anunciada, inversão de paleta */
  fx: number
}

export const newSceneField = (): SceneField => ({
  tilt: 0, wind: 0, grav: 1, drag: 1, lift: 0, beat: 0, onBeat: 0,
  walls: -1, slide: 0, quantize: 0, clouds: 0, fx: 0,
})

export const FX_TUNNEL = 1
export const FX_GUST_WARN = 2
export const FX_GUST = 4
export const FX_INVERT = 8
export const FX_BUBBLE = 16
export const FX_WAVE_BIG = 32

const wave = (frame: number) => {
  const k = Math.floor((frame % WAVE_PERIOD) * 64 / WAVE_PERIOD)
  return SIN64[k] / 4096
}

/**
 * Preenche o campo do frame. Sem alocar: o mundo guarda um `SceneField` só e
 * o rollback reescreve por cima quantas vezes precisar.
 */
export function sceneField(
  rule: SceneRuleId, frame: number, rally: number, matchPoint: boolean,
  ballX: number, out: SceneField,
) {
  out.tilt = 0; out.wind = 0; out.grav = 1; out.drag = 1; out.lift = 0
  out.beat = 0; out.onBeat = 0; out.walls = -1; out.slide = 0
  out.quantize = 0; out.clouds = 0; out.fx = 0
  if (frame < 0) frame = 0

  switch (rule) {
    case 'tempestade': {
      const big = Math.floor(frame / WAVE_PERIOD) % 3 === 2
      out.tilt = TILT * wave(frame) * (big ? TILT_BIG : 1)
      out.slide = RAIN_SLIDE
      if (big) out.fx |= FX_WAVE_BIG
      break
    }

    case 'rave': {
      const b = BEAT[Math.min(24, Math.max(0, rally))]
      out.beat = b
      const win = Math.max(2, Math.floor(b * BEAT_WINDOW / 1000))
      const ph = frame % b
      out.onBeat = ph < win || ph >= b - win ? 1 : 0
      break
    }

    case 'fundo': {
      out.grav = DEEP_GRAV
      out.drag = DEEP_DRAG
      const half = Math.floor(frame / CURRENT_PERIOD) % 2
      out.wind = half === 0 ? -CURRENT : CURRENT
      if (frame % BUBBLE_PERIOD < BUBBLE_UP) {
        const w = RIGHT_PLANE - LEFT_PLANE
        const c1 = LEFT_PLANE + w * 0.25
        const c2 = LEFT_PLANE + w * 0.75
        const near = Math.min(Math.abs(ballX - c1), Math.abs(ballX - c2))
        out.fx |= FX_BUBBLE
        if (near < BUBBLE_BAND) out.lift = BUBBLE_LIFT
      }
      break
    }

    case 'trem': {
      const w = TREM_WIND + Math.min(24, Math.max(0, rally)) * TREM_WIND_RALLY
      out.wind = -Math.min(TREM_WIND_MAX, w)
      if (frame % TUNNEL_PERIOD < TUNNEL_LEN) out.fx |= FX_TUNNEL
      // trecho de ponte: sem parapeito, a bola sai e o ponto vai embora
      if (frame % BRIDGE_PERIOD >= BRIDGE_PERIOD - BRIDGE_LEN) out.walls = 0
      break
    }

    case 'gameboy': {
      out.quantize = 1
      // a inversão dura um compasso e volta: piscar é o susto, ficar é o bug
      if (rally >= 20 && frame % 288 < 72) out.fx |= FX_INVERT
      break
    }

    case 'nuvens': {
      out.clouds = 1
      out.walls = 0
      if (matchPoint) out.grav = MOON_GRAV
      const ph = frame % GUST_PERIOD
      if (ph >= GUST_PERIOD - GUST_WARN) out.fx |= FX_GUST_WARN
      else if (ph < GUST_LEN) {
        out.fx |= FX_GUST
        out.wind = Math.floor(frame / GUST_PERIOD) % 2 === 0 ? GUST : -GUST
      }
      break
    }
  }
}

/**
 * Game Boy: a bola só anda em múltiplos de 22,5° e só tem três velocidades.
 * Devolve [vx, vy] arredondados pra grade mais próxima, mantendo o sentido.
 */
export function quantizeVelocity(vx: number, vy: number): [number, number] {
  const len = Math.sqrt(vx * vx + vy * vy)
  if (len < 0.001) return [0, GB_SPEEDS[0]]

  // acha a direção da grade com maior projeção: sem atan2, é só produto escalar
  let best = 0
  let bestDot = -1e9
  for (let k = 0; k < 16; k++) {
    const d = (vx * DIR16[k * 2] + vy * DIR16[k * 2 + 1]) / 4096
    if (d > bestDot) { bestDot = d; best = k }
  }

  let speed = GB_SPEEDS[0]
  let bestGap = Math.abs(len - GB_SPEEDS[0])
  for (let k = 1; k < GB_SPEEDS.length; k++) {
    const gap = Math.abs(len - GB_SPEEDS[k])
    if (gap < bestGap) { bestGap = gap; speed = GB_SPEEDS[k] }
  }

  return [(DIR16[best * 2] / 4096) * speed, (DIR16[best * 2 + 1] / 4096) * speed]
}

/** Bater dentro da janela vale +15% e enche a barra em dobro. */
export const BEAT_HIT_BOOST = BEAT_BOOST

export const cloudTop = (i: number) => cloudY(i) - CLOUD_THICK / 2
export const cloudHits = (i: number, x: number) => Math.abs(x - cloudX(i)) < CLOUD_HALF_W + BALL_RADIUS * 0.4
