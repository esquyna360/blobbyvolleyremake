class_name BVMatch
extends RefCounted

## Partida: mundo + regras + eventos. `save`/`restore` servem ao rollback.

var params: MatchParams
var world: PhysicWorld
var logic: GameLogic
var events := EventBuf.new()
var frame := 0

## Segura o saque enquanto a apresentação do ponto roda: a física continua
## andando, então os blobs caem e pousam em vez de travar no ar.
var hold_serve := false

func _init(p: MatchParams = null, serving_player: int = BV.LEFT) -> void:
	params = p if p != null else MatchParams.new()
	world = PhysicWorld.new(params)
	logic = GameLogic.new(params.rules(), params.stw)
	logic.serving_player = serving_player
	world.reset_ball(serving_player)

func float_count() -> int:
	return world.float_count()

func int_count() -> int:
	return world.int_count() + 13

func _at_match_point() -> bool:
	return logic.at_match_point()

func _can_start_round(serving: int) -> bool:
	if serving == BV.NO_PLAYER:
		return false
	return world.blob_hit_ground(world.lead(serving)) and world.ball_vy < 1.5 \
		and world.ball_vy > -1.5 and world.ball_y > 430.0

func step(inputs: Array) -> void:
	events.clear()
	var w := world
	var g := logic

	w.scores[0] = g.scores[0]
	w.scores[1] = g.scores[1]
	w.rally = g.rally
	w.match_point = _at_match_point()
	w.step(inputs, g.is_ball_valid, g.is_game_running, events)
	g.step()

	for k in events.n:
		var e: int = events.kind[k]
		var s: int = events.side[k]
		match e:
			Ev.BALL_HIT_BLOB, Ev.PARRY, Ev.DIG, Ev.DIVE_HIT, Ev.SPECIAL_FIRED:
				g.on_ball_hits_player(w.side_of(s))
			Ev.BALL_HIT_GROUND:
				g.on_ball_hits_ground(s)
				if not g.is_ball_valid:
					w.ball_vx *= 0.6
					w.ball_vy *= 0.6
			Ev.BALL_HIT_NET:
				g.on_ball_hits_net(s)
			Ev.BALL_HIT_NET_TOP:
				g.on_ball_hits_net(BV.NO_PLAYER)
			Ev.BALL_HIT_WALL:
				g.on_ball_hits_wall(s)
			Ev.BALL_OUT:
				g.on_ball_out()
			Ev.SPECIAL_HIT:
				_try_fatality(w.side_of(s))

	var err := g.take_last_error()
	if err != BV.NO_PLAYER:
		events.push(Ev.PLAYER_ERROR, err, 0.0)
		for p in w.nb:
			if w.side_of(p) == err:
				w.add_charge(p, BV.SPECIAL_GAIN_LOST, events)
		w.ball_vx *= 0.6
		w.ball_vy *= 0.6

	if not g.is_ball_valid and not hold_serve and _can_start_round(g.serving_player):
		w.reset_ball(g.serving_player)
		g.on_serve()
		events.push(Ev.RESET_BALL, BV.NO_PLAYER, 0.0)

	frame += 1

func _try_fatality(victim: int) -> void:
	var g := logic
	if g.winner != BV.NO_PLAYER or not g.is_ball_valid:
		return
	var killer := BV.other(victim)
	var l := g.scores[BV.LEFT] + 1 if killer == BV.LEFT else g.scores[BV.LEFT]
	var r := g.scores[BV.RIGHT] + 1 if killer == BV.RIGHT else g.scores[BV.RIGHT]
	if not g._is_winning(l, r):
		return
	g.mistake(victim, killer, 1)
	events.push(Ev.FATALITY, killer, 1.0)

func save(f: PackedFloat64Array, i: PackedInt32Array) -> void:
	var g := logic
	var j := world.save(f, i)
	i[j] = g.scores[0]; i[j + 1] = g.scores[1]; i[j + 2] = g.touches[0]; i[j + 3] = g.touches[1]
	i[j + 4] = g.squish[0]; i[j + 5] = g.squish[1]; i[j + 6] = g.squish_wall; i[j + 7] = g.squish_ground
	i[j + 8] = g.serving_player
	i[j + 9] = (1 if g.is_ball_valid else 0) | (2 if g.is_game_running else 0)
	i[j + 10] = g.winner; i[j + 11] = frame
	i[j + 12] = g.rally | (g.rally_best << 16)

func restore(f: PackedFloat64Array, i: PackedInt32Array) -> void:
	var g := logic
	var j := world.restore(f, i)
	g.scores[0] = i[j]; g.scores[1] = i[j + 1]; g.touches[0] = i[j + 2]; g.touches[1] = i[j + 3]
	g.squish[0] = i[j + 4]; g.squish[1] = i[j + 5]; g.squish_wall = i[j + 6]; g.squish_ground = i[j + 7]
	g.serving_player = i[j + 8]
	g.is_ball_valid = (i[j + 9] & 1) != 0
	g.is_game_running = (i[j + 9] & 2) != 0
	g.winner = i[j + 10]
	frame = i[j + 11]
	g.rally = i[j + 12] & 0xFFFF
	g.rally_best = i[j + 12] >> 16
	g.last_error = BV.NO_PLAYER
	world.rally = g.rally
	world.match_point = _at_match_point()

func new_state() -> Array:
	var f := PackedFloat64Array()
	f.resize(float_count())
	var i := PackedInt32Array()
	i.resize(int_count())
	return [f, i]

func checksum() -> int:
	var st := new_state()
	save(st[0], st[1])
	var h := 2166136261
	for b in st[0].to_byte_array():
		h ^= b
		h = (h * 16777619) & 0xFFFFFFFF
	for b in st[1].to_byte_array():
		h ^= b
		h = (h * 16777619) & 0xFFFFFFFF
	return h & 0xFFFFFFFF
