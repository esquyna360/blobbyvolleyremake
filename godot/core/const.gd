class_name BV
extends RefCounted

const LEFT := 0
const RIGHT := 1
const NO_PLAYER := -1

const LEFT_PLANE := 0.0
const RIGHT_PLANE := 880.0
const OPEN_MARGIN := 200.0

const BLOBBY_HEIGHT := 89.0
const BLOBBY_UPPER_SPHERE := 19.0
const BLOBBY_UPPER_RADIUS := 25.0
const BLOBBY_LOWER_SPHERE := 13.0
const BLOBBY_LOWER_RADIUS := 33.0

const GROUND_PLANE_HEIGHT_MAX := 500.0
const GROUND_PLANE_HEIGHT := GROUND_PLANE_HEIGHT_MAX - BLOBBY_HEIGHT / 2.0
const BLOBBY_MAX_JUMP_HEIGHT := GROUND_PLANE_HEIGHT - 206.375
const BLOBBY_JUMP_ACCELERATION := -15.1
const GRAVITATION := (BLOBBY_JUMP_ACCELERATION * BLOBBY_JUMP_ACCELERATION) / BLOBBY_MAX_JUMP_HEIGHT
const BLOBBY_JUMP_BUFFER := GRAVITATION / 2.0

const BALL_RADIUS := 31.5
const BALL_GRAVITATION := 0.287
const BALL_COLLISION_VELOCITY := 13.762993860348844

const NET_POSITION_X := RIGHT_PLANE / 2.0
const NET_POSITION_Y := 438.0
const NET_RADIUS := 7.0
const NET_SPHERE_POSITION := 284.0

const STANDARD_BALL_HEIGHT := 269.0 + BALL_RADIUS
const BLOBBY_SPEED := 4.5
const STANDARD_BALL_ANGULAR_VELOCITY := 0.1
const BLOBBY_ANIMATION_SPEED := 0.5
const SQUISH_TOLERANCE := 11

const DEFAULT_SCORE_TO_WIN := 15

const SPECIAL_FULL := 1.0
const SPECIAL_GAIN_TOUCH := 0.04
const SPECIAL_GAIN_FRAME := 0.0003
const SPECIAL_REACH := 165.0
const SPECIAL_VELOCITY := BALL_COLLISION_VELOCITY * 2.45
const SPECIAL_BALL_FRAMES := 150
const STUN_FRAMES := 165
const SPECIAL_KNOCKBACK := 11.0
const SPECIAL_POP := -9.0
const KNOCK_DECAY := 0.9
const SPECIAL_NET_CLEARANCE := 48.0
const SPECIAL_GRAVITY_MUL := 4.2
const SPECIAL_TARGET_DEPTH := 0.72
const SPECIAL_TIME_MIN := 18.0
const SPECIAL_TIME_STEP := 1.25
const SPECIAL_TIME_STEPS := 30
const SPECIAL_COMEBACK_STEP := 0.22
const SPECIAL_COMEBACK_MIN := 0.6
const SPECIAL_COMEBACK_MAX := 2.2
const SPECIAL_DEPTH_JITTER := 0.36
const SPECIAL_ARC_JITTER := 3.0

const PARRY_ACTIVE := 5
const PARRY_CD := 58
const PARRY_REACH := 112.0
const PARRY_BOOST := 0.1
const PARRY_CHAIN_MAX := 4
const PARRY_HOLD := 60

const CROUCH_RATE := 0.16
const CROUCH_RATE_AIR := 0.09
const CROUCH_RELEASE := 0.2
const CROUCH_DUCK := 16.0
const CROUCH_SLIM := 5.0
const CROUCH_SPREAD := 7.0
const CROUCH_SPEED_MUL := 0.55
const CROUCH_FALL_MUL := 0.8

const DIG_REACH := 128.0
const DIG_CD := 26
const DIG_WINDOW := 7
const DIG_VELOCITY := BALL_COLLISION_VELOCITY * 1.05
const DIG_TARGET_DEPTH := 0.52
const DIG_NET_CLEARANCE := 10.0
const DIG_TIME_MIN := 34.0
const DIG_TIME_STEP := 3.0
const DIG_TIME_STEPS := 26
const DIG_GAIN := 0.03

const SPIN_FROM_VX := 0.085
const SPIN_MAX := 0.55
const SPIN_DECAY := 0.982
const MAGNUS_K := 0.030
const SPIN_ROT := 0.34

const APEX_WINDOW := 2.6
const APEX_MUL := 1.22
const FALL_MUL := 0.88

const DIVE_SPEED := BLOBBY_SPEED * 3.2
const DIVE_HOP := -3.4
const DIVE_FRAMES := 24
const DIVE_RECOVER := 26
const DIVE_CD := 52
const DIVE_SLIDE_KEEP := 0.62
const DIVE_SLIDE_DRAG := 0.9
const DIVE_SLIDE_STOP := 0.3
const DIVE_WIDE := 0.55
const CROUCH_WIDE := 0.16
const DIVE_VELOCITY := BALL_COLLISION_VELOCITY * 0.95
const DIVE_TARGET_DEPTH := 0.42
const DIVE_NET_CLEARANCE := 26.0
const DIVE_TIME_MIN := 40.0
const DIVE_TIME_STEP := 3.0
const DIVE_TIME_STEPS := 26
const DIVE_GAIN := 0.05

const SPECIAL_GAIN_LOST := 0.15
const SPECIAL_RALLY_HOT := 10
const SPECIAL_RALLY_MUL := 2.0
const SPECIAL_LEAK := 0.00035
const SPECIAL_CAP := 1.2

const TEMPO_MAX := 1.1
const TEMPO_STEP := 0.0125

const TICK_RATE := 60
const TICK_MS := 1000.0 / 60.0

static func other(s: int) -> int:
	return RIGHT if s == LEFT else LEFT

## `Math.round` do JS: empate vai pra cima, não pra longe do zero.
static func js_round(x: float) -> int:
	return int(floor(x + 0.5))

## Inteiro de 32 bits com sinal, como o `|0` do JS.
static func i32(v: int) -> int:
	v &= 0xFFFFFFFF
	return v - 0x100000000 if v >= 0x80000000 else v

## `Math.imul`: multiplicação que trunca em 32 bits antes de estourar.
static func imul(a: int, b: int) -> int:
	return i32(i32(a) * i32(b))
