class_name Game
extends Node3D

## Roda a partida: passo fixo de 60Hz, entrada por lado e o palco desenhando
## entre um passo e outro. O laço não conhece rede nem menu — quem controla um
## lado é só um `Source`.

signal round_over(winner: int)
signal match_over(winner: int)

const STEP := 1.0 / 60.0
const MAX_CATCHUP := 5

enum Source { LOCAL_P1, LOCAL_P2, LOCAL_SOLO, BOT, REMOTE }

var arena := Arena.new()
var bv: BVMatch
var quality := 2

var src := [Source.LOCAL_SOLO, Source.BOT]
var bots: Array = [null, null]
var touch_slot := [-1, -1]

var _in := [PlayerInput.new(), PlayerInput.new()]
var _remote_bits := [0, 0]
var _acc := 0.0
var _paused := false
var _last_winner := BV.NO_PLAYER

func start(rules: String, score_to_win: int, walls: bool, q: int,
		left_src: int, right_src: int, difficulty := "normal",
		looks: Array = []) -> void:
	quality = q
	Controls.setup()
	bv = BVMatch.new(rules, score_to_win, BV.LEFT, walls)
	src = [left_src, right_src]
	for i in 2:
		bots[i] = Bot.new(i, difficulty, randi()) if src[i] == Source.BOT else null
	if arena.get_parent() == null:
		add_child(arena)
		arena.build(q)
	arena.set_walls(walls)
	var lk: Array = looks if looks.size() == 2 \
		else [Looks.default_look(BV.LEFT), Looks.default_look(BV.RIGHT)]
	arena.set_looks(lk[0], lk[1])
	arena.capture(bv)
	arena.capture(bv)
	_acc = 0.0
	_paused = false

func set_paused(p: bool) -> void:
	_paused = p

func set_remote_bits(side: int, bits: int) -> void:
	_remote_bits[side] = bits

func _process(dt: float) -> void:
	if bv == null:
		return
	if _paused:
		arena.render(bv, 1.0, dt)
		return

	_acc += minf(dt, 0.25)
	var n := 0
	while _acc >= STEP and n < MAX_CATCHUP:
		_acc -= STEP
		n += 1
		_tick()
	if n == MAX_CATCHUP:
		_acc = 0.0

	arena.render(bv, clampf(_acc / STEP, 0.0, 1.0), dt)

func _tick() -> void:
	for i in 2:
		_read_side(i)
	bv.step(_in[BV.LEFT], _in[BV.RIGHT])
	arena.capture(bv)
	arena.on_events(bv)

	if bv.logic.winner != BV.NO_PLAYER and _last_winner == BV.NO_PLAYER:
		_last_winner = bv.logic.winner
		arena.celebrate(_last_winner)
		match_over.emit(_last_winner)

func _read_side(i: int) -> void:
	var o: PlayerInput = _in[i]
	match src[i]:
		Source.LOCAL_P1:
			Controls.read("p1", o, touch_slot[i])
		Source.LOCAL_P2:
			Controls.read("p2", o, touch_slot[i])
		Source.LOCAL_SOLO:
			Controls.read("solo", o, touch_slot[i])
		Source.BOT:
			o.copy_from(bots[i].think(bv))
		Source.REMOTE:
			o.unpack(_remote_bits[i])

func emote(side: int, id: int) -> void:
	arena.emote(side, id)

func _unhandled_input(e: InputEvent) -> void:
	if bv == null or not e.is_pressed() or e.is_echo():
		return
	for i in 5:
		if e.is_action_pressed("emote_%d" % i):
			var me := BV.LEFT if src[BV.LEFT] != Source.REMOTE else BV.RIGHT
			emote(me, i)
			return
