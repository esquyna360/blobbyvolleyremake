export const LEFT = 0
export const RIGHT = 1
export const NO_PLAYER = -1
export type Side = 0 | 1
export type SideOrNone = -1 | 0 | 1

export const LEFT_PLANE = 0
export let RIGHT_PLANE = 880

export const BLOBBY_HEIGHT = 89
export const BLOBBY_UPPER_SPHERE = 19
export const BLOBBY_UPPER_RADIUS = 25
export const BLOBBY_LOWER_SPHERE = 13
export const BLOBBY_LOWER_RADIUS = 33

export const GROUND_PLANE_HEIGHT_MAX = 500
export const GROUND_PLANE_HEIGHT = GROUND_PLANE_HEIGHT_MAX - BLOBBY_HEIGHT / 2

export const BLOBBY_MAX_JUMP_HEIGHT = GROUND_PLANE_HEIGHT - 206.375
export const BLOBBY_JUMP_ACCELERATION = -15.1
export const GRAVITATION = (BLOBBY_JUMP_ACCELERATION * BLOBBY_JUMP_ACCELERATION) / BLOBBY_MAX_JUMP_HEIGHT
export const BLOBBY_JUMP_BUFFER = GRAVITATION / 2

export const BALL_RADIUS = 31.5
export const BALL_GRAVITATION = 0.287
export const BALL_COLLISION_VELOCITY = Math.sqrt(0.75 * RIGHT_PLANE * BALL_GRAVITATION)

export let NET_POSITION_X = RIGHT_PLANE / 2
export const NET_POSITION_Y = 438
export const NET_RADIUS = 7
export const NET_SPHERE_POSITION = 284

export const STANDARD_BALL_HEIGHT = 269 + BALL_RADIUS
export const BLOBBY_SPEED = 4.5
export const STANDARD_BALL_ANGULAR_VELOCITY = 0.1
export const BLOBBY_ANIMATION_SPEED = 0.5

export const SQUISH_TOLERANCE = 11
export const DEFAULT_SCORE_TO_WIN = 15

export const SPECIAL_FULL = 1
export const SPECIAL_GAIN_TOUCH = 0.055
export const SPECIAL_GAIN_FRAME = 0.00045
export const SPECIAL_REACH = 165
export const SPECIAL_VELOCITY = BALL_COLLISION_VELOCITY * 2.45
export const SPECIAL_BALL_FRAMES = 150
export const STUN_FRAMES = 165
export const SPECIAL_KNOCKBACK = 11
export const SPECIAL_POP = -9
export const KNOCK_DECAY = 0.9
export const SPECIAL_NET_CLEARANCE = 48
export const SPECIAL_GRAVITY_MUL = 4.2
export const SPECIAL_TARGET_DEPTH = 0.72
export const SPECIAL_TIME_MIN = 18
export const SPECIAL_TIME_STEP = 1.25
export const SPECIAL_TIME_STEPS = 30

/** Quem está atrás carrega mais rápido; quem lidera, mais devagar. */
export const SPECIAL_COMEBACK_STEP = 0.22
export const SPECIAL_COMEBACK_MIN = 0.6
export const SPECIAL_COMEBACK_MAX = 2.2

export const SPECIAL_DEPTH_JITTER = 0.36
export const SPECIAL_ARC_JITTER = 3

export const PARRY_ACTIVE = 5
export const PARRY_CD = 58
export const PARRY_REACH = 112
export const PARRY_BOOST = 0.1
export const PARRY_CHAIN_MAX = 4

/**
 * Agachar. `crouch` é 0..1: sobe enquanto o botão está apertado, desce sozinho.
 * Ele afunda a esfera de cima e engorda a de baixo — dá pra passar bola por cima
 * de quem está agachado, e é isso que faz segurar a cortada custar alguma coisa.
 */
export const CROUCH_RATE = 0.16
export const CROUCH_RATE_AIR = 0.09
export const CROUCH_RELEASE = 0.2
export const CROUCH_DUCK = 16
export const CROUCH_SLIM = 5
export const CROUCH_SPREAD = 7
export const CROUCH_SPEED_MUL = 0.55
export const CROUCH_FALL_MUL = 0.8

/** Manchete: toque de defesa, lento e alto. Vale pelo controle, nunca pela força. */
export const DIG_REACH = 128
export const DIG_CD = 26
export const DIG_WINDOW = 7
export const DIG_VELOCITY = BALL_COLLISION_VELOCITY * 1.05
export const DIG_TARGET_DEPTH = 0.52
export const DIG_NET_CLEARANCE = 10
export const DIG_TIME_MIN = 34
export const DIG_TIME_STEP = 3
export const DIG_TIME_STEPS = 26
export const DIG_GAIN = 0.03

/**
 * Cortada: segurar agachado carrega, soltar dá um salto mais alto com janela de
 * ataque. Sai rápida e mira fundo, mas não atordoa, não vira fatality e não
 * passa de ~1.85x a velocidade normal — o especial (2.45x + gravidade 4.2x)
 * continua sendo a arma da casa.
 */
export const SPIKE_MIN_HOLD = 18
export const SPIKE_MAX_HOLD = 48
export const SPIKE_JUMP_BOOST = 0.15
export const SPIKE_WINDOW = 40
export const SPIKE_VELOCITY = BALL_COLLISION_VELOCITY * 1.85
export const SPIKE_WEAK = 0.78
export const SPIKE_FLOOR = 1.25
export const SPIKE_FLOOR_GAIN = 0.5
export const SPIKE_TARGET_DEPTH = 0.62
export const SPIKE_NET_CLEARANCE = 8
export const SPIKE_TIME_MIN = 12
export const SPIKE_TIME_STEP = 1.5
export const SPIKE_TIME_STEPS = 26
export const SPIKE_GAIN = 0.075

/**
 * Mão dirigida. Ela não empurra o adversário nem dá força à bola: pega a bola
 * de raspão — perto mas sem encostar, porque encostar é o toque normal — e vira
 * a velocidade dela pra direção escolhida. Errar custa recarga e alguns frames
 * parado, senão dá pra martelar o botão de graça.
 */
export const HAND_REACH = 108
export const HAND_CD = 60
export const HAND_FREEZE = 22
export const HAND_MIN_SPEED = 6

/** Direção: 32 passos de 11.25°, 0 = direita, 8 = cima. Tabela literal porque
 * a simulação é determinística e não pode chamar cos/sin. */
export const AIM_STEPS = 32
export const AIM_DIRS: readonly number[] = [
  1.000000000, -0.000000000,
  0.980785280, -0.195090322,
  0.923879533, -0.382683432,
  0.831469612, -0.555570233,
  0.707106781, -0.707106781,
  0.555570233, -0.831469612,
  0.382683432, -0.923879533,
  0.195090322, -0.980785280,
  0.000000000, -1.000000000,
  -0.195090322, -0.980785280,
  -0.382683432, -0.923879533,
  -0.555570233, -0.831469612,
  -0.707106781, -0.707106781,
  -0.831469612, -0.555570233,
  -0.923879533, -0.382683432,
  -0.980785280, -0.195090322,
  -1.000000000, -0.000000000,
  -0.980785280, 0.195090322,
  -0.923879533, 0.382683432,
  -0.831469612, 0.555570233,
  -0.707106781, 0.707106781,
  -0.555570233, 0.831469612,
  -0.382683432, 0.923879533,
  -0.195090322, 0.980785280,
  -0.000000000, 1.000000000,
  0.195090322, 0.980785280,
  0.382683432, 0.923879533,
  0.555570233, 0.831469612,
  0.707106781, 0.707106781,
  0.831469612, 0.555570233,
  0.923879533, 0.382683432,
  0.980785280, 0.195090322,
]

/**
 * Ritmo do rally: cada toque acelera o jogo inteiro um degrau até o teto. É
 * escala de tempo de verdade — velocidade vezes T, aceleração vezes T² — então
 * a trajetória é a mesma, só percorrida mais rápido.
 */
export const TEMPO_MAX = 1.1
export const TEMPO_STEP = 0.0125

export type ArenaId = 'default' | 'wide'

export const ARENAS: [ArenaId, string, string][] = [
  ['default', 'Padrão', '880'],
  ['wide', 'Estendida', '1210'],
]

export const ARENA_WIDTH: Record<ArenaId, number> = { default: 880, wide: 1210 }

/**
 * Largura da quadra é global e viva: física, bot e render leem os bindings.
 * Trocar sempre antes de criar o Match e o renderer — nunca no meio da partida.
 */
export function setArena(id: ArenaId) {
  RIGHT_PLANE = ARENA_WIDTH[id] ?? ARENA_WIDTH.default
  NET_POSITION_X = RIGHT_PLANE / 2
}

export const arenaId = (): ArenaId => (RIGHT_PLANE === ARENA_WIDTH.wide ? 'wide' : 'default')

export const TICK_RATE = 60
export const TICK_MS = 1000 / TICK_RATE

export const other = (s: Side): Side => (s === LEFT ? RIGHT : LEFT)
