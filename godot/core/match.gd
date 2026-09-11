class_name BVMatch
extends RefCounted

## Porte de web/src/core/match.ts. `save`/`restore` existem pro rollback: o
## estado inteiro cabe em dois vetores e voltar no tempo é copiar dois vetores.

const STATE_FLOATS := 26
const STATE_INTS := 46

var world := PhysicWorld.new()
var logic: GameLogic
var events := EventBuf.new()
var frame := 0

func _init(rules: Variant = "default", score_to_win: int = -1,
		serving_player: int = BV.LEFT, walls := true) -> void:
	var r: Dictionary = GameLogic.get_rules(rules) if rules is String else rules
	logic = GameLogic.new(r, score_to_win)
	logic.serving_player = serving_player
	world.walls = walls
	world.reset_ball(serving_player)

func _at_match_point() -> bool:
	return maxi(logic.scores[BV.LEFT], logic.scores[BV.RIGHT]) >= logic.score_to_win - 1

func _can_start_round(serving: int) -> bool:
	if serving == BV.NO_PLAYER:
		return false
	return world.blob_hit_ground(serving) and world.ball_vy < 1.5 \
		and world.ball_vy > -1.5 and world.ball_y > 430.0

func step(li: PlayerInput, ri: PlayerInput) -> void:
	events.clear()
	var w := world
	var g := logic

	w.scores[0] = g.scores[0]
	w.scores[1] = g.scores[1]
	w.rally = g.rally
	w.match_point = _at_match_point()
	w.step(li, ri, g.is_ball_valid, g.is_game_running, events)
	g.step()

	for k in events.n:
		var e: int = events.kind[k]
		var s: int = events.side[k]
		match e:
			Ev.BALL_HIT_BLOB, Ev.PARRY, Ev.DIG, Ev.DIVE_HIT, Ev.SPECIAL_FIRED:
				g.on_ball_hits_player(s)
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
				_try_fatality(s)

	var err := g.take_last_error()
	if err != BV.NO_PLAYER:
		events.push(Ev.PLAYER_ERROR, err, 0.0)
		w.add_charge(err, BV.SPECIAL_GAIN_LOST, events)
		w.ball_vx *= 0.6
		w.ball_vy *= 0.6

	if not g.is_ball_valid and _can_start_round(g.serving_player):
		w.reset_ball(g.serving_player)
		g.on_serve()
		events.push(Ev.RESET_BALL, BV.NO_PLAYER, 0.0)

	frame += 1

func _try_fatality(victim: int) -> void:
	var g := logic
	if g.winner != BV.NO_PLAYER or not g.is_ball_valid:
		return
	var killer := BV.RIGHT if victim == BV.LEFT else BV.LEFT
	var l := g.scores[BV.LEFT] + 1 if killer == BV.LEFT else g.scores[BV.LEFT]
	var r := g.scores[BV.RIGHT] + 1 if killer == BV.RIGHT else g.scores[BV.RIGHT]
	if not g._is_winning(l, r):
		return
	g.mistake(victim, killer, 1)
	events.push(Ev.FATALITY, killer, 1.0)

func save(f: PackedFloat64Array, i: PackedInt32Array) -> void:
	var w := world
	var g := logic
	f[0] = w.blob_x[0]; f[1] = w.blob_x[1]; f[2] = w.blob_y[0]; f[3] = w.blob_y[1]
	f[4] = w.blob_vx[0]; f[5] = w.blob_vx[1]; f[6] = w.blob_vy[0]; f[7] = w.blob_vy[1]
	f[8] = w.blob_state[0]; f[9] = w.blob_state[1]; f[10] = w.anim_speed[0]; f[11] = w.anim_speed[1]
	f[12] = w.ball_x; f[13] = w.ball_y; f[14] = w.ball_vx; f[15] = w.ball_vy
	f[16] = w.ball_rot; f[17] = w.ball_ang_vel
	f[18] = w.charge[0]; f[19] = w.charge[1]
	f[20] = w.knock[0]; f[21] = w.knock[1]
	f[22] = w.crouch[0]; f[23] = w.crouch[1]
	f[24] = w.tempo; f[25] = w.ball_spin
	i[0] = g.scores[0]; i[1] = g.scores[1]; i[2] = g.touches[0]; i[3] = g.touches[1]
	i[4] = g.squish[0]; i[5] = g.squish[1]; i[6] = g.squish_wall; i[7] = g.squish_ground
	i[8] = g.serving_player
	i[9] = (1 if g.is_ball_valid else 0) | (2 if g.is_game_running else 0)
	i[10] = g.winner; i[11] = frame
	i[12] = w.stun[0]; i[13] = w.stun[1]
	i[14] = w.super_frames; i[15] = w.super_owner
	i[16] = w.prev_up[0]; i[17] = w.prev_up[1]
	i[18] = w.prev_special[0]; i[19] = w.prev_special[1]
	i[20] = w.dive_frames[0]; i[21] = w.dive_frames[1]
	i[22] = w.dive_cd[0]; i[23] = w.dive_cd[1]
	i[24] = w.parry_active[0]; i[25] = w.parry_active[1]
	i[26] = w.parry_cd[0]; i[27] = w.parry_cd[1]
	i[28] = w.parry_chain
	i[29] = g.rally; i[30] = g.rally_best
	i[31] = w.prev_down[0]; i[32] = w.prev_down[1]
	i[33] = w.dig_cd[0]; i[34] = w.dig_cd[1]
	i[35] = w.dig_active[0]; i[36] = w.dig_active[1]
	i[37] = w.dive_recover[0]; i[38] = w.dive_recover[1]
	i[39] = w.dive_dir[0]; i[40] = w.dive_dir[1]
	i[41] = w.ball_out
	i[42] = w.prev_dive[0]; i[43] = w.prev_dive[1]
	i[44] = w.hold[0]; i[45] = w.hold[1]

func restore(f: PackedFloat64Array, i: PackedInt32Array) -> void:
	var w := world
	var g := logic
	w.blob_x[0] = f[0]; w.blob_x[1] = f[1]; w.blob_y[0] = f[2]; w.blob_y[1] = f[3]
	w.blob_vx[0] = f[4]; w.blob_vx[1] = f[5]; w.blob_vy[0] = f[6]; w.blob_vy[1] = f[7]
	w.blob_state[0] = f[8]; w.blob_state[1] = f[9]; w.anim_speed[0] = f[10]; w.anim_speed[1] = f[11]
	w.ball_x = f[12]; w.ball_y = f[13]; w.ball_vx = f[14]; w.ball_vy = f[15]
	w.ball_rot = f[16]; w.ball_ang_vel = f[17]
	w.charge[0] = f[18]; w.charge[1] = f[19]
	w.knock[0] = f[20]; w.knock[1] = f[21]
	w.crouch[0] = f[22]; w.crouch[1] = f[23]
	w.tempo = f[24]; w.ball_spin = f[25]
	w.stun[0] = i[12]; w.stun[1] = i[13]
	w.super_frames = i[14]; w.super_owner = i[15]
	w.prev_up[0] = i[16]; w.prev_up[1] = i[17]
	w.prev_special[0] = i[18]; w.prev_special[1] = i[19]
	w.dive_frames[0] = i[20]; w.dive_frames[1] = i[21]
	w.dive_cd[0] = i[22]; w.dive_cd[1] = i[23]
	w.parry_active[0] = i[24]; w.parry_active[1] = i[25]
	w.parry_cd[0] = i[26]; w.parry_cd[1] = i[27]
	w.parry_chain = i[28]
	g.rally = i[29]; g.rally_best = i[30]
	g.scores[0] = i[0]; g.scores[1] = i[1]; g.touches[0] = i[2]; g.touches[1] = i[3]
	g.squish[0] = i[4]; g.squish[1] = i[5]; g.squish_wall = i[6]; g.squish_ground = i[7]
	g.serving_player = i[8]
	g.is_ball_valid = (i[9] & 1) != 0
	g.is_game_running = (i[9] & 2) != 0
	g.winner = i[10]
	frame = i[11]
	g.last_error = BV.NO_PLAYER
	w.prev_down[0] = i[31]; w.prev_down[1] = i[32]
	w.dig_cd[0] = i[33]; w.dig_cd[1] = i[34]
	w.dig_active[0] = i[35]; w.dig_active[1] = i[36]
	w.dive_recover[0] = i[37]; w.dive_recover[1] = i[38]
	w.dive_dir[0] = i[39]; w.dive_dir[1] = i[40]
	w.ball_out = i[41]
	w.prev_dive[0] = i[42]; w.prev_dive[1] = i[43]
	w.hold[0] = i[44]; w.hold[1] = i[45]
	w.rally = g.rally
	w.match_point = _at_match_point()

static func new_state() -> Array:
	var f := PackedFloat64Array()
	f.resize(STATE_FLOATS)
	var i := PackedInt32Array()
	i.resize(STATE_INTS)
	return [f, i]

func checksum() -> int:
	var f := PackedFloat64Array()
	f.resize(STATE_FLOATS)
	var i := PackedInt32Array()
	i.resize(STATE_INTS)
	save(f, i)
	var h := 2166136261
	for b in f.to_byte_array():
		h ^= b
		h = (h * 16777619) & 0xFFFFFFFF
	for b in i.to_byte_array():
		h ^= b
		h = (h * 16777619) & 0xFFFFFFFF
	return h & 0xFFFFFFFF
