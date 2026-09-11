export const LEFT = 0
export const RIGHT = 1
export const NO_PLAYER = -1
export type Side = 0 | 1
export type SideOrNone = -1 | 0 | 1

export const LEFT_PLANE = 0
export let RIGHT_PLANE = 880

/**
 * Quadra aberta: quanto dá pra sair da linha lateral, pra bola e pro blob. A
 * bola só é fora quando cai no chão fora da quadra; passar da linha no ar não
 * é nada. Daqui pra fora não existe mundo — bola que chega aqui é fora na hora.
 */
export const OPEN_MARGIN = 200

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
export const SPECIAL_GAIN_TOUCH = 0.03
export const SPECIAL_GAIN_FRAME = 0.00022
export const SPECIAL_REACH = 165
export const SPECIAL_VELOCITY = BALL_COLLISION_VELOCITY * 2.1
export const SPECIAL_BALL_FRAMES = 150
export const STUN_FRAMES = 165
export const SPECIAL_KNOCKBACK = 11
export const SPECIAL_POP = -9
export const KNOCK_DECAY = 0.9
export const SPECIAL_NET_CLEARANCE = 48
export const SPECIAL_GRAVITY_MUL = 3.2
export const SPECIAL_TARGET_DEPTH = 0.62
export const SPECIAL_TIME_MIN = 24
export const SPECIAL_TIME_STEP = 1.25
export const SPECIAL_TIME_STEPS = 30

/** Quem está atrás carrega mais rápido; quem lidera, mais devagar. */
export const SPECIAL_COMEBACK_STEP = 0.22
export const SPECIAL_COMEBACK_MIN = 0.6
export const SPECIAL_COMEBACK_MAX = 2.2

export const SPECIAL_DEPTH_JITTER = 0.2
export const SPECIAL_ARC_JITTER = 1

export const PARRY_ACTIVE = 5
export const PARRY_CD = 58
export const PARRY_REACH = 112
export const PARRY_BOOST = 0.1
export const PARRY_CHAIN_MAX = 4
export const PARRY_HOLD = 60
export const SPECIAL_HOLD = 120

/**
 * Agachar. `crouch` é 0..1: sobe enquanto o botão está apertado, desce sozinho.
 * Ele afunda a esfera de cima e engorda a de baixo — dá pra passar bola por cima
 * de quem está agachado, e é isso que faz ficar agachado custar alguma coisa.
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
export const DIG_GAIN = 0.03
/** A manchete levanta a bola reta no próprio campo, na altura de uma cortada. */
export const DIG_UP = 12.6
export const DIG_FORWARD = 1.4

/**
 * Batida. Segurar o botão arma o golpe e trava o blob; o direcional vira mira.
 * Soltar com a bola no raio manda ela na direção da mira, mais forte quanto
 * mais tempo segurou. Toque rápido é deixadinha.
 */
export const HIT_REACH = 136
export const HIT_CHARGE_MAX = 40
export const HIT_TAP = 7
export const HIT_V_MIN = BALL_COLLISION_VELOCITY * 0.9
export const HIT_V_MAX = BALL_COLLISION_VELOCITY * 1.8
export const HIT_LAG = 12
export const HIT_GAIN = 0.05
/** Bola no corpo enquanto arma a batida: o blob cai e fica um instante no chão. */
export const SWING_WINDOW = 10
export const FLOAT_KEEP = 0.4
export const FLOAT_G = 0.2
export const FLOAT_FRAMES = 22
export const FLOAT_RAMP = 26
export const FLOAT_DRAG = 0.985
export const PARRY_RETURN = 0.72

export const DROP_VELOCITY = BALL_COLLISION_VELOCITY * 0.66
export const DROP_TARGET_DEPTH = 0.14
export const DROP_NET_CLEARANCE = 6
export const DROP_TIME_MIN = 30
export const DROP_TIME_STEP = 3
export const DROP_TIME_STEPS = 24

/** Reversal: especial devolvido com o botão de especial na hora exata. */
export const REVERSAL_ACTIVE = 4
export const REVERSAL_CD = 70
export const REVERSAL_BOOST = 1.5
export const REVERSAL_SPIN = 22
export const REVERSAL_ORBIT = 62
export const REVERSAL_TURNS = 1.5
export const REVERSAL_PARRY_ACTIVE = 3

/**
 * Spin. A velocidade horizontal do blob no instante do toque vira rotação, e
 * rotação empurra a bola de lado enquanto ela voa. É daí que sai a direção:
 * de como você se moveu, não de uma tecla de mira.
 */
export const SPIN_FROM_VX = 0.085
export const SPIN_MAX = 0.55
export const SPIN_DECAY = 0.982
export const MAGNUS_K = 0.030
/** Quanto do spin vira giro visível na bola: sem isso ninguém lê o efeito. */
export const SPIN_ROT = 0.34

/** Bater no ápice do pulo vale mais que bater caindo. */
export const APEX_WINDOW = 2.6
export const APEX_MUL = 1.22
export const FALL_MUL = 0.88

/**
 * Mergulho. Baixo + lado no chão joga o blob de lado, esticado e rente à
 * areia. É último recurso: alcança o que a corrida não alcança, mas deita e
 * demora pra levantar.
 */
export const DIVE_SPEED = BLOBBY_SPEED * 3.2
export const DIVE_HOP = -3.4
export const DIVE_FRAMES = 24
export const DIVE_RECOVER = 26
export const DIVE_CD = 52
/** Ao tocar a areia o blob não para: guarda parte da velocidade e escorrega. */
export const DIVE_SLIDE_KEEP = 0.62
export const DIVE_SLIDE_DRAG = 0.9
export const DIVE_SLIDE_STOP = 0.3
/** Quanto a caixa de colisão de baixo estica na horizontal, 0 = redonda. */
export const DIVE_WIDE = 0.55
export const CROUCH_WIDE = 0.16
export const DIVE_VELOCITY = BALL_COLLISION_VELOCITY * 0.95
export const DIVE_TARGET_DEPTH = 0.42
export const DIVE_NET_CLEARANCE = 26
export const DIVE_TIME_MIN = 40
export const DIVE_TIME_STEP = 3
export const DIVE_TIME_STEPS = 26
export const DIVE_GAIN = 0.05

/** Barra: quem perde ponto carrega, rally longo carrega dobrado, cheia vaza. */
export const SPECIAL_GAIN_LOST = 0.12
export const SPECIAL_RALLY_HOT = 10
export const SPECIAL_RALLY_MUL = 2
export const SPECIAL_LEAK = 0.00035
/**
 * A barra continua enchendo depois de cheia, mas o excedente não aparece: é
 * reserva. Guardar o especial gasta essa reserva, e quando ela acaba a barra
 * cai abaixo do cheio e o especial some. Dá uns 9 segundos pra usar.
 */
export const SPECIAL_CAP = 1.2

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
