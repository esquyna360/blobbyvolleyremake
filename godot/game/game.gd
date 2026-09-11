class_name Game
extends Node3D

## Roda a partida: passo fixo de 60Hz, entrada por lado e o palco desenhando
## entre um passo e outro. O laço não conhece rede nem menu — quem controla um
## lado é só um `Source`.

signal round_over(winner: int)
signal match_over(winner: int)

const STEP := 1.0 / 60.0
const MAX_CATCHUP := 5

enum Source { LOCAL_P1, LOCAL_P2, LOCAL_SOLO, BOT, REMOTE, SCRIPT }

var arena := Arena.new()
var bv: BVMatch
var quality := 2

var src := [Source.LOCAL_SOLO, Source.BOT]
var bots: Array = [null, null]
var moods: Array = [null, null]
var _emote_at := [-1e9, -1e9]
var touch_slot := [-1, -1]

var script_input: Callable
var link: NetLink
var net_side := BV.NO_PLAYER
var rb: Rollback

var _in := [PlayerInput.new(), PlayerInput.new()]
var _remote_bits := [0, 0]
var _acc := 0.0
var _paused := false
var _stalled := false
var _send_t := 0.0
var _resim := false
var _last_winner := BV.NO_PLAYER
var _slow := 1.0
var _looks: Array = []

## Cenário ou preset novo no meio da partida: troca só o palco, a simulação
## nem percebe.
func rebuild_arena(q: int) -> void:
	quality = q
	var walls := arena.walls_on
	var ls := arena.local_side
	if arena.get_parent() != null:
		remove_child(arena)
	arena.queue_free()
	arena = Arena.new()
	add_child(arena)
	arena.build(q)
	arena.set_walls(walls)
	arena.local_side = ls
	if _looks.size() == 2:
		arena.set_looks(_looks[0], _looks[1])
	if bv != null:
		arena.capture(bv)
		arena.capture(bv)

func reset_arena() -> void:
	if arena.get_parent() != null:
		remove_child(arena)
	arena.queue_free()
	arena = Arena.new()

## No match point, quando a bola cai no lado de quem está perdendo, o tempo
## abre: é o lance que decide, e ele merece ser visto.
func _slowmo() -> float:
	if rb != null or bv.logic.winner != BV.NO_PLAYER:
		return 1.0
	var w := bv.world
	if not w.match_point:
		return 1.0
	var g := bv.logic
	var leader := BV.LEFT if g.scores[BV.LEFT] >= g.scores[BV.RIGHT] else BV.RIGHT
	var ball_side := BV.LEFT if w.ball_x < BV.NET_POSITION_X else BV.RIGHT
	if ball_side == leader or w.ball_vy <= 0.0:
		return 1.0
	var h := Map.gy(w.ball_y)
	if h > 4.5:
		return 1.0
	return 0.28

func slow_factor() -> float:
	return _slow

func start(rules: String, score_to_win: int, walls: bool, q: int,
		left_src: int, right_src: int, difficulty := "normal",
		looks: Array = []) -> void:
	quality = q
	Controls.setup()
	bv = BVMatch.new(rules, score_to_win, BV.LEFT, walls)
	src = [left_src, right_src]
	for i in 2:
		bots[i] = Bot.new(i, difficulty, randi()) if src[i] == Source.BOT else null
		moods[i] = BotMood.new(i, difficulty) if src[i] == Source.BOT else null
	if arena.get_parent() == null:
		add_child(arena)
		arena.build(q)
	arena.set_walls(walls)
	arena.local_side = net_side if net_side != BV.NO_PLAYER else BV.LEFT
	var lk: Array = looks if looks.size() == 2 \
		else [Looks.default_look(BV.LEFT), Looks.default_look(BV.RIGHT)]
	_looks = lk
	arena.set_looks(lk[0], lk[1])
	arena.capture(bv)
	arena.capture(bv)
	_acc = 0.0
	_paused = false
	_last_winner = BV.NO_PLAYER
	_slow = 1.0
	if net_side != BV.NO_PLAYER:
		rb = Rollback.new()
		rb.save(bv)

func set_paused(p: bool) -> void:
	_paused = p
	Aud.set_paused(p)

func set_remote_bits(side: int, bits: int) -> void:
	_remote_bits[side] = bits

func _process(dt: float) -> void:
	if bv == null:
		return
	if _paused or _last_winner != BV.NO_PLAYER or arena.intro_active():
		arena.render(bv, 1.0, dt)
		return

	var slow := _slowmo()
	_slow += (slow - _slow) * (1.0 - exp(-dt * (12.0 if slow < _slow else 4.0)))
	dt *= _slow * arena.drama()
	_acc += minf(dt, 0.25)
	var n := 0
	while _acc >= STEP and n < MAX_CATCHUP:
		if rb != null:
			_net_catchup()
			if rb.too_far_ahead():
				_stalled = true
				break
			_stalled = false
		_acc -= STEP
		n += 1
		_tick()
	if n == MAX_CATCHUP:
		_acc = 0.0

	if rb != null:
		_pump(dt)
	arena.render(bv, clampf(_acc / STEP, 0.0, 1.0), dt)

func _tick() -> void:
	if rb != null:
		_net_tick()
		return
	for i in 2:
		_read_side(i)
	_step()

func _step() -> void:
	bv.step(_in[BV.LEFT], _in[BV.RIGHT])
	arena.capture(bv)
	if not _resim:
		arena.on_events(bv)
		for i in 2:
			if moods[i] != null:
				var id: int = moods[i].react(bv.events)
				if id >= 0:
					_emote_later(i, id, 0.26 + randf() * 0.32)

	if bv.logic.winner != BV.NO_PLAYER and _last_winner == BV.NO_PLAYER:
		_last_winner = bv.logic.winner
		arena.celebrate(_last_winner)
		Aud.finish(_last_winner == arena.local_side)
		for i in 2:
			if moods[i] != null:
				_emote_later(i, moods[i].finish(_last_winner == i), 0.7)
		match_over.emit(_last_winner)

## A janela de entradas sai todo quadro, inclusive quando o lado local está
## esperando o outro. Mandar só dentro do passo trancava os dois: quem espera
## não avança, quem não avança não manda, e ninguém sai do lugar.
func _pump(dt: float) -> void:
	_send_t -= dt
	if _send_t > 0.0:
		return
	_send_t = 0.008
	var w: Array = rb.window()
	if w[1].size() > 0:
		link.send_inputs(w[0], w[1])

## Um quadro em rede: manda a entrada local, prevê a do outro e segue. A
## correção vem depois, quando a entrada de verdade chegar.
func _net_tick() -> void:
	var me := net_side
	var other := BV.other(me)
	_read_side(me)
	rb.set_local(rb.frame, _in[me].pack())
	_in[other].unpack(rb.remote_at(rb.frame))
	_step()
	rb.frame += 1
	rb.save(bv)

	# checksum esparso: barato e pega desencontro antes de virar bagunça
	if rb.frame % 30 == 0:
		link.send_check(rb.frame, bv.checksum())

## Volta ao quadro em que a previsão errou e roda de novo com a entrada certa.
func _net_catchup() -> void:
	var f := rb.rewind_frame()
	if f < 0:
		return
	var target := rb.frame
	if not rb.restore(bv, f):
		return
	_resim = true
	while rb.frame < target:
		_in[net_side].unpack(rb.local_at(rb.frame))
		_in[BV.other(net_side)].unpack(rb.remote_at(rb.frame))
		_step()
		rb.frame += 1
		rb.save(bv)
	_resim = false

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
		Source.SCRIPT:
			o.unpack(script_input.call(rb.frame if rb != null else bv.frame, i))

func emote(side: int, id: int) -> void:
	if bv == null or id < 0:
		return
	var now := Time.get_ticks_msec() / 1000.0
	if now - _emote_at[side] < 0.7:
		return
	_emote_at[side] = now
	arena.emote(side, id)
	Aud.play("emote_%d" % mini(id, 2), 0.7)
	if link != null and link.online() and side == net_side:
		link.send_emote(side, id)
	var o := BV.other(side)
	if moods[o] != null and bots[side] == null:
		var back: int = moods[o].answer(id)
		if back >= 0:
			_emote_later(o, back, 0.52 + randf() * 0.38)

func _emote_later(side: int, id: int, delay: float) -> void:
	if id < 0:
		return
	var m := bv
	await get_tree().create_timer(delay).timeout
	if bv == m and is_inside_tree():
		emote(side, id)

func attach_link(l: NetLink, side: int) -> void:
	link = l
	net_side = side
	src[side] = Source.LOCAL_SOLO
	src[BV.other(side)] = Source.REMOTE
	l.inputs.connect(func(start, bits): if rb != null: rb.take_remote(start, bits))
	l.emote_in.connect(func(s, id): arena.emote(s, id))

func stalled() -> bool:
	return _stalled

func _unhandled_input(e: InputEvent) -> void:
	if bv == null or not e.is_pressed() or e.is_echo():
		return
	for i in 5:
		if e.is_action_pressed("emote_%d" % i):
			var me := net_side if net_side != BV.NO_PLAYER else BV.LEFT
			emote(me, i)
			return
