class_name GameLogic
extends RefCounted

## Porte de web/src/core/logic.ts. As quatro regras do original cabem em três
## campos: quantos toques o lado tem, quantos pontos ganham e se precisa de dois
## de vantagem. Não vale inventar classe pra isso.
const RULES := [
	{"id": "default", "name": "Clássico", "desc": "3 toques por lado, 2 de vantagem.",
		"touches": 3, "stw": BV.DEFAULT_SCORE_TO_WIN, "two_ahead": true},
	{"id": "tennis", "name": "Tennis", "desc": "Um toque só. Devolve ou perde.",
		"touches": 1, "stw": BV.DEFAULT_SCORE_TO_WIN, "two_ahead": true},
	{"id": "blitz", "name": "Blitz", "desc": "Rally curto: 5 pontos.",
		"touches": 3, "stw": 5, "two_ahead": false},
	{"id": "jumpingjack", "name": "Jumping Jack", "desc": "Só pontua quem acerta no ar.",
		"touches": 3, "stw": BV.DEFAULT_SCORE_TO_WIN, "two_ahead": true},
]

static func get_rules(id: String) -> Dictionary:
	for r in RULES:
		if r.id == id:
			return r
	return RULES[0]

var scores := PackedInt32Array([0, 0])
var touches := PackedInt32Array([0, 0])
var squish := PackedInt32Array([0, 0])
var squish_wall := 0
var squish_ground := 0
var last_error := BV.NO_PLAYER
var serving_player := BV.NO_PLAYER
var is_ball_valid := true
var is_game_running := false
var winner := BV.NO_PLAYER
var rally := 0
var rally_best := 0
var frames := 0
var rules: Dictionary
var score_to_win: int

func _init(r: Dictionary = RULES[0], stw: int = -1) -> void:
	rules = r
	score_to_win = stw if stw > 0 else int(r.stw)

func step() -> void:
	frames += 1
	squish[0] -= 1
	squish[1] -= 1
	squish_wall -= 1
	squish_ground -= 1

func on_serve() -> void:
	is_ball_valid = true
	is_game_running = false
	rally = 0

func _is_winning(l: int, r: int) -> bool:
	if rules.two_ahead:
		return (l >= score_to_win and l >= r + 2) or (r >= score_to_win and r >= l + 2)
	return l >= score_to_win or r >= score_to_win

func on_ball_hits_ground(side: int) -> void:
	if not (squish_ground <= 0 and is_ball_valid):
		return
	squish_ground = BV.SQUISH_TOLERANCE
	touches[BV.other(side)] = 0
	mistake(side, BV.other(side), 1)

func on_ball_hits_player(side: int) -> void:
	if squish[side] > 0:
		return
	squish[side] = BV.SQUISH_TOLERANCE
	squish[BV.other(side)] = 0
	is_game_running = true
	touches[side] += 1
	rally += 1
	if rally > rally_best:
		rally_best = rally
	if touches[side] > int(rules.touches):
		mistake(side, BV.other(side), 1)
	touches[BV.other(side)] = 0

func on_ball_out() -> void:
	if not is_ball_valid:
		return
	var last := BV.LEFT
	if touches[BV.LEFT] > 0:
		last = BV.LEFT
	elif touches[BV.RIGHT] > 0:
		last = BV.RIGHT
	else:
		last = BV.RIGHT if serving_player == BV.RIGHT else BV.LEFT
	mistake(last, BV.other(last), 1)

func on_ball_hits_wall(_side: int) -> void:
	if not (squish_wall <= 0 and is_ball_valid):
		return
	squish_wall = BV.SQUISH_TOLERANCE

func on_ball_hits_net(_side: int) -> void:
	if not (squish_wall <= 0 and is_ball_valid):
		return
	squish_wall = BV.SQUISH_TOLERANCE

func score(side: int, amount: int) -> void:
	scores[side] += amount
	if scores[side] < 0:
		scores[side] = 0
	if _is_winning(scores[BV.LEFT], scores[BV.RIGHT]):
		winner = BV.LEFT if scores[BV.LEFT] > scores[BV.RIGHT] else BV.RIGHT

func mistake(mistake_side: int, serve_side: int, amount: int) -> void:
	score(BV.other(mistake_side), amount)
	last_error = mistake_side
	rally = 0
	is_ball_valid = false
	touches[0] = 0
	touches[1] = 0
	squish[0] = 0
	squish[1] = 0
	squish_wall = 0
	squish_ground = 0
	serving_player = serve_side

func take_last_error() -> int:
	var t := last_error
	last_error = BV.NO_PLAYER
	return t
