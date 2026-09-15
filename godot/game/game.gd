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
var params := MatchParams.new()

var script_input: Callable
var link: NetLink
var net_side := BV.NO_PLAYER
var rb: Rollback

var _in: Array = [PlayerInput.new(), PlayerInput.new()]
var _remote_bits := [0, 0]
var _acc := 0.0
var _paused := false
var _stalled := false
var _send_t := 0.0
var _resim := false
var _last_winner := BV.NO_PLAYER
var _slow := 1.0
var _looks: Array = []

const HIST := 210
const REP_LEN := 118
const REP_SPEED := 0.55
var _hf: Array = []
var _hi: Array = []
var _he: Array = []
var _hn := 0
var _rep: BVMatch = null
var _rep_at := 0
var _rep_end := 0
var _rep_acc := 0.0
var _rep_score := 0
var _rep_tag := ""
var _rep_last := -9000
signal replay(tag: String, on: bool)

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
	if bv != null:
		arena.setup_blobs(bv.world)
		arena.set_looks(_looks)
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
	var g := bv.logic
	if not g.is_ball_valid or not g.would_win(w.ball_side()):
		return 1.0
	if w.ball_vy <= 0.0:
		return 1.0
	var h := Map.gy(w.ball_y)
	if h > 4.5:
		return 1.0
	return 0.28

func replaying() -> bool:
	return _rep_at < _rep_end

func slow_factor() -> float:
	return _slow

func start(p: MatchParams, q: int, left_src: int, right_src: int,
		difficulty := "normal", looks: Array = [], bot_seed := -1) -> void:
	quality = q
	Controls.setup()
	params = p
	bv = BVMatch.new(p, BV.LEFT)
	var w := bv.world
	Map.configure(w)
	src = [left_src, right_src]
	var nb := w.nb
	_in.resize(nb)
	bots.resize(nb)
	for i in nb:
		_in[i] = PlayerInput.new()
		var s := w.side_of(i)
		var is_bot: bool = src[s] == Source.BOT or i != w.lead(s)
		var seed := randi() if bot_seed < 0 else bot_seed + i * 7919
		bots[i] = Bot.new(s, difficulty, seed, i) if is_bot else null
	for s in 2:
		moods[s] = BotMood.new(s, difficulty) if src[s] == Source.BOT else null
	if arena.get_parent() == null:
		add_child(arena)
		arena.build(q)
	arena.set_walls(w.walls)
	arena.local_side = net_side if net_side != BV.NO_PLAYER else BV.LEFT
	var lk: Array = []
	for i in nb:
		var s := w.side_of(i)
		var base: Array = looks[s] if looks.size() >= 2 else Looks.default_look(s)
		if looks.size() == nb:
			base = looks[i]
		elif i != w.lead(s):
			var hc = base[2] if base[2] is Color else (int(base[2]) + 3) % 10
			base = [base[0], (int(base[1]) + 5 + i) % 16, hc]
		lk.append(base)
	_looks = lk
	arena.setup_blobs(w)
	arena.set_looks(lk)
	arena.capture(bv)
	arena.capture(bv)
	_acc = 0.0
	_paused = false
	_last_winner = BV.NO_PLAYER
	_slow = 1.0
	_rep = null
	_rep_at = 0
	_rep_end = 0
	_rep_score = 0
	_rep_last = -9000
	_hn = 0
	_hf.clear()
	_hi.clear()
	_he.clear()
	if net_side == BV.NO_PLAYER:
		for k in HIST:
			var st := bv.new_state()
			_hf.append(st[0])
			_hi.append(st[1])
			_he.append([])
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
	if _rep_at < _rep_end and not _paused:
		_rep_step(dt)
		return
	if _paused or _last_winner != BV.NO_PLAYER or arena.intro_active():
		arena.render(bv, 1.0, dt)
		return

	arena.tick_real(dt)
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
	for i in bv.world.nb:
		_read_side(i)
	_step()

func _step() -> void:
	bv.step(_in)
	arena.capture(bv)
	if not _resim:
		_record()
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
		Rumble.finish(_last_winner)
		for i in 2:
			if moods[i] != null:
				_emote_later(i, moods[i].finish(_last_winner == i), 0.7)
		match_over.emit(_last_winner)

## Grava o rally inteiro num anel de estados. Quando o ponto acaba, se o lance
## valeu a pena, ele volta em câmera lenta e com a lente colada na bola.
func _record() -> void:
	if _hf.is_empty():
		return
	var k := _hn % HIST
	bv.save(_hf[k], _hi[k])
	var ev := bv.events
	var list: Array = []
	for j in ev.n:
		list.append([ev.kind[j], ev.side[j], ev.intensity[j]])
		_score_event(ev.kind[j], ev.intensity[j])
	_he[k] = list
	_hn += 1
	for j in ev.n:
		if ev.kind[j] == Ev.PLAYER_ERROR:
			_maybe_replay()

func _score_event(kind: int, inten: float) -> void:
	match kind:
		Ev.REVERSAL:
			_rep_score += 5
			_rep_tag = "PARRY x3"
		Ev.PARRY:
			_rep_score += 3 if inten >= 1.0 else 1
			if inten >= 1.0 and _rep_tag == "":
				_rep_tag = "PARRY"
		Ev.SPECIAL_GROUND:
			_rep_score += 4
			_rep_tag = "SHINKUU"
		Ev.SPECIAL_HIT:
			_rep_score += 3
			if _rep_tag == "":
				_rep_tag = "SHINKUU"
		Ev.SPIN_HIT:
			_rep_score += 1
		Ev.STAGGER:
			_rep_score += 2
			if _rep_tag == "":
				_rep_tag = "SPIN"
		Ev.DIG, Ev.DIVE_HIT:
			if bv.world.ball_y > BV.GROUND_PLANE_HEIGHT_MAX - 90.0:
				_rep_score += 4
				if _rep_tag == "":
					_rep_tag = "WHAT A SAVE"
			else:
				_rep_score += 1

func _maybe_replay() -> void:
	var score := _rep_score
	var tag := _rep_tag if _rep_tag != "" else "REPLAY"
	_rep_score = 0
	_rep_tag = ""
	if rb != null or score < 6 or _hn < 60 or _last_winner != BV.NO_PLAYER:
		return
	if _hn - _rep_last < 900:
		return
	_rep_last = _hn
	if _rep == null:
		_rep = BVMatch.new(params, BV.LEFT)
	_rep_end = _hn
	_rep_at = _hn - mini(_hn, REP_LEN)
	_rep_acc = 0.0
	arena.rep_want = 1.0
	replay.emit(tag, true)

func _rep_step(dt: float) -> void:
	_rep_acc += dt * REP_SPEED
	var n := 0
	while _rep_acc >= STEP and _rep_at < _rep_end and n < MAX_CATCHUP:
		_rep_acc -= STEP
		n += 1
		var k := _rep_at % HIST
		_rep.restore(_hf[k], _hi[k])
		_rep.events.clear()
		for e in _he[k]:
			_rep.events.push(e[0], e[1], e[2])
		arena.capture(_rep)
		arena.on_events(_rep)
		_rep_at += 1
	arena.render(_rep, clampf(_rep_acc / STEP, 0.0, 1.0), dt)
	if _rep_at >= _rep_end:
		arena.rep_want = 0.0
		arena.capture(bv)
		arena.capture(bv)
		replay.emit("", false)

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
	var me := bv.world.lead(net_side)
	var other := bv.world.lead(BV.other(net_side))
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
		_in[bv.world.lead(net_side)].unpack(rb.local_at(rb.frame))
		_in[bv.world.lead(BV.other(net_side))].unpack(rb.remote_at(rb.frame))
		_step()
		rb.frame += 1
		rb.save(bv)
	_resim = false

func _read_side(i: int) -> void:
	var o: PlayerInput = _in[i]
	var s := bv.world.side_of(i)
	if bots[i] != null:
		o.copy_from(bots[i].think(bv))
		return
	match src[s]:
		Source.LOCAL_P1:
			Controls.read("p1", o, touch_slot[s])
		Source.LOCAL_P2:
			Controls.read("p2", o, touch_slot[s])
		Source.LOCAL_SOLO:
			Controls.read("solo", o, touch_slot[s])
		Source.REMOTE:
			o.unpack(_remote_bits[s])
		Source.SCRIPT:
			o.unpack(script_input.call(rb.frame if rb != null else bv.frame, s))

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
	if moods[o] != null and bots[bv.world.lead(side)] == null:
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
