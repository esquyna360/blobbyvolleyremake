export const LEFT = 0
export const RIGHT = 1
export const NO_PLAYER = -1
export type Side = 0 | 1
export type SideOrNone = -1 | 0 | 1

export const LEFT_PLANE = 0
export let RIGHT_PLANE = 800

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

export const PARRY_ACTIVE = 8
export const PARRY_CD = 42
export const PARRY_REACH = 190
export const PARRY_BOOST = 0.1
export const PARRY_CHAIN_MAX = 4

export const PUSH_REACH_X = 152
export const PUSH_REACH_Y = 130
export const PUSH_FORCE = 10
export const PUSH_POP = -5.5
export const PUSH_CD = 48

export type ArenaId = 'default' | 'wide'

export const ARENAS: [ArenaId, string, string][] = [
  ['default', 'Padrão', '800'],
  ['wide', 'Estendida', '1100'],
]

export const ARENA_WIDTH: Record<ArenaId, number> = { default: 800, wide: 1100 }

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
