export const LEFT = 0
export const RIGHT = 1
export const NO_PLAYER = -1
export type Side = 0 | 1
export type SideOrNone = -1 | 0 | 1

export const LEFT_PLANE = 0
export const RIGHT_PLANE = 800

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

export const NET_POSITION_X = RIGHT_PLANE / 2
export const NET_POSITION_Y = 438
export const NET_RADIUS = 7
export const NET_SPHERE_POSITION = 284

export const STANDARD_BALL_HEIGHT = 269 + BALL_RADIUS
export const BLOBBY_SPEED = 4.5
export const STANDARD_BALL_ANGULAR_VELOCITY = 0.1
export const BLOBBY_ANIMATION_SPEED = 0.5

export const SQUISH_TOLERANCE = 11
export const DEFAULT_SCORE_TO_WIN = 15

export const TICK_RATE = 60
export const TICK_MS = 1000 / TICK_RATE

export const other = (s: Side): Side => (s === LEFT ? RIGHT : LEFT)
