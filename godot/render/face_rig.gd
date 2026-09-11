class_name FaceRig
extends RefCounted

## Porte de web/src/render/face.ts. Uma cara por jogador, com prioridade: levar
## um especial na fuça não pode ser atropelado pelo rosto de concentração do
## frame seguinte.

const POSES := {
	"calm":   {"open": 0.04, "curve": 0.20, "brow": 0.00, "lid": 1.00, "tear": 0.0},
	"focus":  {"open": 0.02, "curve": -0.08, "brow": -0.22, "lid": 0.84, "tear": 0.0},
	"worry":  {"open": 0.22, "curve": -0.45, "brow": 0.75, "lid": 1.12, "tear": 0.0},
	"panic":  {"open": 0.70, "curve": -0.60, "brow": 1.00, "lid": 1.40, "tear": 0.2},
	"shock":  {"open": 1.00, "curve": -0.05, "brow": 0.90, "lid": 1.50, "tear": 0.0},
	"laugh":  {"open": 0.82, "curve": 1.00, "brow": 0.30, "lid": 0.14, "tear": 0.4},
	"sad":    {"open": 0.14, "curve": -0.88, "brow": 0.95, "lid": 0.60, "tear": 1.0},
	"angry":  {"open": 0.48, "curve": -0.72, "brow": -1.00, "lid": 0.70, "tear": 0.0},
	"smug":   {"open": 0.04, "curve": 0.78, "brow": -0.40, "lid": 0.52, "tear": 0.0},
	"hurt":   {"open": 0.88, "curve": -0.95, "brow": -0.50, "lid": 0.26, "tear": 0.5},
	"aim":    {"open": 0.05, "curve": -0.05, "brow": -0.62, "lid": 0.36, "tear": 0.0},
	"slick":  {"open": 0.30, "curve": 0.95, "brow": -0.22, "lid": 0.32, "tear": 0.0},
	"whiff":  {"open": 0.26, "curve": -0.58, "brow": 0.28, "lid": 0.08, "tear": 0.25},
	"dumb":   {"open": 1.00, "curve": -0.28, "brow": 1.00, "lid": 0.30, "tear": 0.85},
	"strain": {"open": 0.62, "curve": -0.42, "brow": -0.95, "lid": 0.16, "tear": 0.0},
}

var open := 0.04
var curve := 0.20
var brow := 0.0
var lid := 1.0
var tear := 0.0
var blink := 1.0

var _target: Dictionary = POSES.calm
var _mood := "calm"
var _hold := 0.0
var _prio := 0
var _blink_at := randf() * 4.0
var _shake := 0.0

func set_mood(m: String, hold: float, prio := 1) -> void:
	if _hold > 0.0 and prio < _prio:
		return
	_mood = m
	_hold = hold
	_prio = prio
	_target = POSES[m]
	if m == "shock" or m == "hurt" or m == "panic":
		_shake = 1.0

func reset() -> void:
	_hold = 0.0
	_prio = 0
	_mood = "calm"
	_target = POSES.calm
	open = 0.04
	curve = 0.20
	brow = 0.0
	lid = 1.0
	tear = 0.0

func current() -> String:
	return _mood

func jitter() -> float:
	return _shake

static func _mix(a: Dictionary, b: Dictionary, k: float) -> Dictionary:
	return {
		"open": a.open + (b.open - a.open) * k,
		"curve": a.curve + (b.curve - a.curve) * k,
		"brow": a.brow + (b.brow - a.brow) * k,
		"lid": a.lid + (b.lid - a.lid) * k,
		"tear": a.tear + (b.tear - a.tear) * k,
	}

## Cara neutra puxada pela tensão do rally: tranquilo, concentrado, preocupado.
static func _idle(t: float) -> Dictionary:
	if t <= 0.02:
		return POSES.calm
	if t < 0.5:
		return _mix(POSES.calm, POSES.focus, t / 0.5)
	return _mix(POSES.focus, POSES.worry, (t - 0.5) / 0.5)

func update(dt: float, tension: float, ball_near: bool) -> void:
	if _hold > 0.0:
		_hold -= dt
		if _hold <= 0.0:
			_prio = 0
			_mood = "calm"
	if _hold <= 0.0:
		_target = _idle(tension)

	var k := minf(1.0, dt * 10.0)
	open += (maxf(_target.open, 0.3 if (ball_near and _hold <= 0.0) else 0.0) - open) * k
	curve += (_target.curve - curve) * k
	brow += (_target.brow - brow) * k
	lid += (_target.lid - lid) * k
	tear += (_target.tear - tear) * minf(1.0, dt * 4.0)

	_shake = maxf(0.0, _shake - dt * 3.5)

	_blink_at -= dt
	if _blink_at <= 0.0:
		_blink_at = 2.5 + randf() * 4.0
		blink = 0.0
	blink = minf(1.0, blink + dt * 7.0)

static func rally_tension(rally: int) -> float:
	return clampf((rally - 3) / 14.0, 0.0, 1.0)

## Mesmas reações da versão web: quem desenha só lê os campos.
static func apply_events(rigs: Array, events: EventBuf, scores: PackedInt32Array, stw: int) -> void:
	for k in events.n:
		var s: int = events.side[k]
		if s < 0:
			continue
		var o := BV.other(s)
		match events.kind[k]:
			Ev.PARRY:
				rigs[s].set_mood("smug", 1.0, 3)
				rigs[o].set_mood("shock", 1.0, 3)
			Ev.PARRY_TRY:
				rigs[s].set_mood("panic", 0.45, 2)
			Ev.SPECIAL_READY:
				rigs[s].set_mood("smug", 0.9, 2)
			Ev.SPECIAL_FIRED:
				rigs[s].set_mood("angry", 0.8, 2)
				rigs[o].set_mood("shock", 0.9, 3)
			Ev.SPECIAL_HIT:
				rigs[s].set_mood("laugh", 1.3, 3)
				rigs[o].set_mood("hurt", 1.5, 4)
			Ev.DIG:
				rigs[s].set_mood("focus", 0.55, 2)
			Ev.DIVE:
				rigs[s].set_mood("strain", 0.78, 3)
			Ev.DIVE_HIT:
				rigs[s].set_mood("strain", 0.5, 3)
				rigs[o].set_mood("shock", 0.7, 2)
			Ev.APEX_HIT:
				rigs[s].set_mood("slick", 0.55, 2)
			Ev.SPECIAL_WASTED:
				rigs[s].set_mood("dumb", 1.7, 4)
				rigs[o].set_mood("laugh", 1.3, 3)
			Ev.FATALITY:
				rigs[s].set_mood("laugh", 2.6, 5)
				rigs[o].set_mood("hurt", 2.6, 5)
			Ev.PLAYER_ERROR:
				var gap := scores[o] - scores[s]
				var bitter := gap >= 3 or scores[o] >= stw - 1 or randf() < 0.3
				rigs[s].set_mood("angry" if bitter else "sad", 2.0, 3)
				rigs[o].set_mood("smug" if gap >= 3 else "laugh", 2.0, 3)

## Agachar não é evento, é estado: a cara tem que acompanhar o frame inteiro.
static func crouch_moods(rigs: Array, crouch: PackedFloat64Array) -> void:
	for s in 2:
		if crouch[s] < 0.45:
			continue
		rigs[s].set_mood("focus", 0.06, 1)

## Bola no alcance do especial pronto: a cara mira antes do botão.
static func reach_moods(rigs: Array, w: PhysicWorld, valid: bool) -> void:
	if not valid:
		return
	for s in 2:
		if w.charge[s] < BV.SPECIAL_FULL:
			continue
		var dx := w.ball_x - w.blob_x[s]
		var dy := w.ball_y - (w.blob_y[s] - BV.BLOBBY_UPPER_SPHERE)
		if dx * dx + dy * dy < BV.SPECIAL_REACH * BV.SPECIAL_REACH:
			rigs[s].set_mood("aim", 0.06, 1)
