class_name PhysicWorld
extends RefCounted

## Porte literal de web/src/core/physics.ts. A ordem das operações e os
## arredondamentos são os mesmos de propósito: é o que faz o jogo continuar
## sendo o mesmo jogo, e é o que deixa os dois lados da rede concordarem.

var blob_x := PackedFloat64Array([BV.NET_POSITION_X * 0.5, BV.NET_POSITION_X * 1.5])
var blob_y := PackedFloat64Array([BV.GROUND_PLANE_HEIGHT, BV.GROUND_PLANE_HEIGHT])
var blob_vx := PackedFloat64Array([0.0, 0.0])
var blob_vy := PackedFloat64Array([0.0, 0.0])
var blob_state := PackedFloat64Array([0.0, 0.0])
var anim_speed := PackedFloat64Array([0.0, 0.0])

var ball_x := BV.NET_POSITION_X * 0.5
var ball_y := BV.STANDARD_BALL_HEIGHT
var ball_vx := 0.0
var ball_vy := 0.0
var ball_rot := 0.0
var ball_ang_vel := BV.STANDARD_BALL_ANGULAR_VELOCITY

var charge := PackedFloat64Array([0.0, 0.0])
var stun := PackedInt32Array([0, 0])
var knock := PackedFloat64Array([0.0, 0.0])
var prev_up := PackedInt32Array([0, 0])
var prev_special := PackedInt32Array([0, 0])
var ball_spin := 0.0
var dive_frames := PackedInt32Array([0, 0])
var dive_dir := PackedInt32Array([0, 0])
var dive_cd := PackedInt32Array([0, 0])
var dive_recover := PackedInt32Array([0, 0])
var rally := 0
var tempo := 1.0
var super_frames := 0
var super_owner := -1
var parry_active := PackedInt32Array([0, 0])
var parry_cd := PackedInt32Array([0, 0])
var parry_chain := 0
var scores := PackedInt32Array([0, 0])

var crouch := PackedFloat64Array([0.0, 0.0])
var prev_down := PackedInt32Array([0, 0])
var dig_cd := PackedInt32Array([0, 0])
var dig_active := PackedInt32Array([0, 0])

var walls := true
var solo := false
var ball_out := 0
var match_point := false

var _no_input := PlayerInput.new()

func blob_hit_ground(p: int) -> bool:
	return blob_y[p] >= BV.GROUND_PLANE_HEIGHT

func upper_y(p: int) -> float:
	return blob_y[p] - BV.BLOBBY_UPPER_SPHERE + crouch[p] * BV.CROUCH_DUCK

func upper_r(p: int) -> float:
	return BV.BLOBBY_UPPER_RADIUS - crouch[p] * BV.CROUCH_SLIM

func lower_r(p: int) -> float:
	return BV.BLOBBY_LOWER_RADIUS + crouch[p] * BV.CROUCH_SPREAD

func wide_x(p: int) -> float:
	var dive := 1.0 if dive_frames[p] > 0 else (0.5 if dive_recover[p] > 0 else 0.0)
	return 1.0 + crouch[p] * BV.CROUCH_WIDE + dive * BV.DIVE_WIDE

func diving(p: int) -> bool:
	return dive_frames[p] > 0

func _comeback(p: int) -> float:
	var diff := float(scores[BV.RIGHT if p == BV.LEFT else BV.LEFT] - scores[p])
	var m := 1.0 + diff * BV.SPECIAL_COMEBACK_STEP
	return maxf(BV.SPECIAL_COMEBACK_MIN, minf(BV.SPECIAL_COMEBACK_MAX, m))

func add_charge(p: int, amount: float, out: EventBuf) -> void:
	if charge[p] >= BV.SPECIAL_CAP:
		return
	var hot := BV.SPECIAL_RALLY_MUL if rally >= BV.SPECIAL_RALLY_HOT else 1.0
	var was := charge[p]
	charge[p] += amount * _comeback(p) * hot
	if charge[p] > BV.SPECIAL_CAP:
		charge[p] = BV.SPECIAL_CAP
	if was < BV.SPECIAL_FULL and charge[p] >= BV.SPECIAL_FULL:
		out.push(Ev.SPECIAL_READY, p, 1.0)

## Ruído determinístico do estado: os dois lados calculam o mesmo valor.
func _noise(p: int, salt: int) -> float:
	var h := BV.imul(BV.js_round(ball_x * 32.0) ^ 0x9e3779b9, 2246822519)
	h = BV.imul(h ^ BV.js_round(ball_y * 32.0), 3266489917)
	h = BV.imul(h ^ BV.js_round(blob_x[p] * 32.0), 668265263)
	h = BV.imul(h ^ BV.js_round(blob_y[p] * 32.0), 374761393)
	h = BV.imul(h ^ (p + 1) ^ BV.imul(salt + 1, 2654435761), 2246822519)
	var u := h & 0xFFFFFFFF
	return float(u ^ (u >> 15)) / 4294967296.0

func _ball_g() -> float:
	var base := BV.BALL_GRAVITATION * BV.SPECIAL_GRAVITY_MUL if super_frames > 0 else BV.BALL_GRAVITATION
	return base * tempo * tempo

func _bump_tempo() -> void:
	if tempo >= BV.TEMPO_MAX:
		return
	var prev := tempo
	tempo = minf(BV.TEMPO_MAX, tempo + BV.TEMPO_STEP)
	var k := tempo / prev
	ball_vx *= k
	ball_vy *= k
	blob_vy[BV.LEFT] *= k
	blob_vy[BV.RIGHT] *= k
	knock[BV.LEFT] *= k
	knock[BV.RIGHT] *= k

func _scale_ball_v() -> void:
	ball_vx *= tempo
	ball_vy *= tempo

func _clears_net(vx: float, vy: float, g: float, clearance: float) -> bool:
	var band := BV.BALL_RADIUS + BV.NET_RADIUS + 4.0
	var ceiling := BV.NET_SPHERE_POSITION - clearance
	for k in range(-1, 2):
		var t := (BV.NET_POSITION_X + k * band - ball_x) / vx
		if t <= 0.0:
			continue
		if ball_y + vy * t + 0.5 * g * t * t > ceiling:
			return false
	return true

func _aim_special(p: int, boost := 1.0) -> void:
	var dir := 1.0 if p == BV.LEFT else -1.0
	var ty := BV.GROUND_PLANE_HEIGHT_MAX - BV.BALL_RADIUS
	var depth := BV.SPECIAL_TARGET_DEPTH + (_noise(p, 0) - 0.5) * BV.SPECIAL_DEPTH_JITTER
	var tx := BV.NET_POSITION_X + (BV.RIGHT_PLANE - BV.NET_POSITION_X) * depth if p == BV.LEFT \
		else BV.NET_POSITION_X - (BV.NET_POSITION_X - BV.LEFT_PLANE) * depth
	var vmax := BV.SPECIAL_VELOCITY * boost

	if dir * (tx - ball_x) < 60.0:
		ball_vx = dir * vmax * 0.25
		ball_vy = vmax * 0.97
		return

	var max2 := vmax * vmax
	var g := BV.BALL_GRAVITATION * BV.SPECIAL_GRAVITY_MUL
	var skip := int(floor(_noise(p, 1) * BV.SPECIAL_ARC_JITTER))
	var seen := 0
	var fx := 0.0
	var fy := 0.0
	var got := false
	for i in BV.SPECIAL_TIME_STEPS:
		var t := BV.SPECIAL_TIME_MIN + i * BV.SPECIAL_TIME_STEP
		var vx := (tx - ball_x) / t
		var vy := (ty - ball_y) / t - 0.5 * g * t
		if vx * vx + vy * vy > max2:
			continue
		if not _clears_net(vx, vy, g, BV.SPECIAL_NET_CLEARANCE):
			continue
		if not got:
			fx = vx
			fy = vy
			got = true
		if seen < skip:
			seen += 1
			continue
		seen += 1
		ball_vx = vx
		ball_vy = vy
		return

	if got:
		ball_vx = fx
		ball_vy = fy
		return
	ball_vx = dir * vmax * 0.5
	ball_vy = -vmax * 0.866

func _aim_shot_scaled(p: int, vmax: float, vmin: float, depth: float, clearance: float,
		t_min: float, t_step: float, t_steps: int, salt: int) -> void:
	_aim_shot(p, vmax, vmin, depth, clearance, t_min, t_step, t_steps, salt)
	_scale_ball_v()

func _aim_shot(p: int, vmax: float, vmin: float, depth: float, clearance: float,
		t_min: float, t_step: float, t_steps: int, salt: int) -> void:
	var dir := 1.0 if p == BV.LEFT else -1.0
	var g := BV.BALL_GRAVITATION
	var ty := BV.GROUND_PLANE_HEIGHT_MAX - BV.BALL_RADIUS
	var jit := (_noise(p, salt) - 0.5) * 0.2
	var max2 := vmax * vmax
	var bx := 0.0
	var by := 0.0
	var best := -1.0

	for d in 3:
		var dd := minf(0.94, depth + jit + d * 0.16)
		var tx := BV.NET_POSITION_X + (BV.RIGHT_PLANE - BV.NET_POSITION_X) * dd if p == BV.LEFT \
			else BV.NET_POSITION_X - (BV.NET_POSITION_X - BV.LEFT_PLANE) * dd
		if dir * (tx - ball_x) < 40.0:
			continue
		for i in t_steps:
			var t := t_min + i * t_step
			var vx := (tx - ball_x) / t
			var vy := (ty - ball_y) / t - 0.5 * g * t
			var v2 := vx * vx + vy * vy
			if v2 > max2:
				continue
			if not _clears_net(vx, vy, g, clearance):
				continue
			if v2 > best:
				best = v2
				bx = vx
				by = vy
			break
		if best >= vmin * vmin:
			break

	if best >= 0.0:
		ball_vx = bx
		ball_vy = by
		return

	ball_vx = dir * BV.BALL_COLLISION_VELOCITY * 0.4
	ball_vy = -BV.BALL_COLLISION_VELOCITY * 0.78

func _try_crouch(p: int, raw: PlayerInput) -> void:
	var ground := blob_hit_ground(p)
	var held := raw.down and stun[p] <= 0
	if held:
		crouch[p] = minf(1.0, crouch[p] + (BV.CROUCH_RATE if ground else BV.CROUCH_RATE_AIR))
	else:
		crouch[p] = maxf(0.0, crouch[p] - BV.CROUCH_RELEASE)

	if raw.down and prev_down[p] == 0 and stun[p] <= 0 and dig_cd[p] == 0 \
			and not _dive_press(p, raw):
		dig_active[p] = BV.DIG_WINDOW
		dig_cd[p] = BV.DIG_CD

func _try_dig(p: int, out: EventBuf) -> bool:
	if dig_active[p] <= 0 or stun[p] > 0:
		return false
	if super_frames > 0:
		return false
	var cy := blob_y[p] + BV.BLOBBY_LOWER_SPHERE
	var dx := ball_x - blob_x[p]
	var dy := ball_y - cy
	var d2 := dx * dx + dy * dy
	if d2 > BV.DIG_REACH * BV.DIG_REACH:
		return false

	dig_active[p] = 0
	dig_cd[p] = BV.DIG_CD
	_bump_tempo()
	_aim_shot_scaled(p, BV.DIG_VELOCITY, 0.0, BV.DIG_TARGET_DEPTH, BV.DIG_NET_CLEARANCE,
		BV.DIG_TIME_MIN, BV.DIG_TIME_STEP, BV.DIG_TIME_STEPS, 2)
	_push_out(p, cy, dx, dy, sqrt(d2), lower_r(p))
	add_charge(p, BV.DIG_GAIN, out)
	out.push(Ev.DIG, p, 1.0)
	return true

func _push_out(p: int, cy: float, dx: float, dy: float, l: float, r: float) -> void:
	var need := BV.BALL_RADIUS + r + 2.0
	if l >= need:
		return
	var k := l if l != 0.0 else 1.0
	ball_x = blob_x[p] + (dx / k) * need
	ball_y = cy + (dy / k) * need

func _dive_press(p: int, raw: PlayerInput) -> bool:
	return raw.left != raw.right and stun[p] == 0 and dive_cd[p] == 0 \
		and dive_frames[p] == 0 and dive_recover[p] == 0 and blob_hit_ground(p)

func _try_dive(p: int, raw: PlayerInput, out: EventBuf) -> void:
	if not raw.down or prev_down[p] != 0:
		return
	if not _dive_press(p, raw):
		return
	var dir := 1 if raw.right else -1

	dive_frames[p] = BV.DIVE_FRAMES
	dive_dir[p] = dir
	dive_cd[p] = BV.DIVE_CD
	blob_vx[p] = dir * BV.DIVE_SPEED * tempo
	blob_vy[p] = BV.DIVE_HOP * tempo
	out.push(Ev.DIVE, p, 0.0)

func _try_special(p: int, raw: PlayerInput, is_ball_valid: bool, was_ground: bool, out: EventBuf) -> void:
	if not is_ball_valid or stun[p] > 0:
		return
	if super_frames > 0 and super_owner != p:
		return
	if charge[p] < BV.SPECIAL_FULL:
		return
	var pressed := (raw.up and prev_up[p] == 0) or (raw.special and prev_special[p] == 0)
	if not pressed:
		return
	if was_ground:
		return

	var nx := ball_x - blob_x[p]
	var ny := ball_y - upper_y(p)
	if sqrt(nx * nx + ny * ny) > BV.SPECIAL_REACH:
		charge[p] = 0.0
		out.push(Ev.SPECIAL_WASTED, p, 1.0)
		return

	charge[p] = 0.0
	_bump_tempo()
	_aim_special(p)
	_scale_ball_v()
	super_frames = BV.SPECIAL_BALL_FRAMES
	super_owner = p
	out.push(Ev.SPECIAL_FIRED, p, 1.0)

func _try_parry(p: int, raw: PlayerInput, out: EventBuf) -> void:
	if stun[p] > 0:
		return
	if super_frames <= 0 or super_owner == p:
		return
	var pressed := (raw.up and prev_up[p] == 0) or (raw.special and prev_special[p] == 0)
	if pressed and parry_cd[p] == 0 and parry_active[p] == 0:
		parry_active[p] = BV.PARRY_ACTIVE
		parry_cd[p] = BV.PARRY_CD
		out.push(Ev.PARRY_TRY, p, 0.0)
	if parry_active[p] <= 0:
		return
	var closing := ball_vx < 0.0 if p == BV.LEFT else ball_vx > 0.0
	if not closing:
		return
	var dx := ball_x - blob_x[p]
	var dy := ball_y - upper_y(p)
	if dx * dx + dy * dy > BV.PARRY_REACH * BV.PARRY_REACH:
		return
	parry_active[p] = 0
	parry_cd[p] = 0
	parry_chain = mini(parry_chain + 1, BV.PARRY_CHAIN_MAX)
	super_owner = p
	super_frames = BV.SPECIAL_BALL_FRAMES
	_bump_tempo()
	_aim_special(p, 1.0 + parry_chain * BV.PARRY_BOOST)
	_scale_ball_v()
	add_charge(p, BV.SPECIAL_GAIN_TOUCH, out)
	out.push(Ev.PARRY, p, 1.0)

func _top_ball_collision(p: int) -> bool:
	var dx := ball_x - blob_x[p]
	var dy := ball_y - upper_y(p)
	var r := BV.BALL_RADIUS + upper_r(p)
	return dx * dx + dy * dy < r * r

func _bottom_ball_collision(p: int) -> bool:
	var dx := (ball_x - blob_x[p]) / wide_x(p)
	var dy := ball_y - (blob_y[p] + BV.BLOBBY_LOWER_SPHERE)
	var r := BV.BALL_RADIUS + lower_r(p)
	return dx * dx + dy * dy < r * r

func _anim_step(p: int) -> void:
	if blob_state[p] < 0.0:
		anim_speed[p] = 0.0
		blob_state[p] = 0.0
	if blob_state[p] >= 4.5:
		anim_speed[p] = -BV.BLOBBY_ANIMATION_SPEED
	blob_state[p] += anim_speed[p]
	if blob_state[p] >= 5.0:
		blob_state[p] = 4.99

func _start_anim(p: int) -> void:
	if anim_speed[p] == 0.0:
		anim_speed[p] = BV.BLOBBY_ANIMATION_SPEED

func _handle_blob(p: int, inp: PlayerInput) -> void:
	var ground := blob_hit_ground(p)
	var t := tempo
	var t2 := t * t
	var g := BV.GRAVITATION
	if inp.up and not inp.down:
		if ground:
			blob_vy[p] = BV.BLOBBY_JUMP_ACCELERATION * t
			_start_anim(p)
		g -= BV.BLOBBY_JUMP_BUFFER
	if not ground and inp.down:
		g += BV.GRAVITATION * BV.CROUCH_FALL_MUL
	if (inp.left or inp.right) and ground:
		_start_anim(p)
	g *= t2

	if dive_frames[p] > 0:
		blob_x[p] += blob_vx[p] + knock[p]
		if knock[p] != 0.0:
			knock[p] *= BV.KNOCK_DECAY
			if absf(knock[p]) < 0.05:
				knock[p] = 0.0
		blob_y[p] += 0.5 * g + blob_vy[p]
		blob_vy[p] += g
		if blob_y[p] >= BV.GROUND_PLANE_HEIGHT:
			blob_y[p] = BV.GROUND_PLANE_HEIGHT
			blob_vy[p] = 0.0
			dive_frames[p] = 0
			dive_recover[p] = BV.DIVE_RECOVER
			blob_vx[p] *= BV.DIVE_SLIDE_KEEP
		return

	var stuck := dive_recover[p] > 0
	var slow := (1.0 - crouch[p] * (1.0 - BV.CROUCH_SPEED_MUL)) * t
	if stuck:
		blob_vx[p] *= BV.DIVE_SLIDE_DRAG
		if absf(blob_vx[p]) < BV.DIVE_SLIDE_STOP:
			blob_vx[p] = 0.0
	else:
		blob_vx[p] = ((BV.BLOBBY_SPEED if inp.right else 0.0) - (BV.BLOBBY_SPEED if inp.left else 0.0)) * slow

	blob_x[p] += blob_vx[p] + knock[p]
	if knock[p] != 0.0:
		knock[p] *= BV.KNOCK_DECAY
		if absf(knock[p]) < 0.05:
			knock[p] = 0.0
	blob_y[p] += 0.5 * g + blob_vy[p]
	blob_vy[p] += g

	if blob_y[p] > BV.GROUND_PLANE_HEIGHT:
		if blob_vy[p] > 3.5:
			_start_anim(p)
		blob_y[p] = BV.GROUND_PLANE_HEIGHT
		blob_vy[p] = 0.0
	_anim_step(p)

func _handle_blob_ball_collision(p: int, out: EventBuf) -> bool:
	var cy := blob_y[p] + BV.BLOBBY_LOWER_SPHERE
	var cr := lower_r(p)
	if not _bottom_ball_collision(p):
		if not _top_ball_collision(p):
			return false
		cy = upper_y(p)
		cr = upper_r(p)

	if super_owner == p and super_frames > BV.SPECIAL_BALL_FRAMES - 12:
		return false

	_bump_tempo()

	if (dive_frames[p] > 0 or dive_recover[p] > 0) and super_frames == 0:
		var ddx := ball_x - blob_x[p]
		var ddy := ball_y - cy
		ball_spin = 0.0
		_aim_shot_scaled(p, BV.DIVE_VELOCITY, BV.DIVE_VELOCITY * 0.7, BV.DIVE_TARGET_DEPTH,
			BV.DIVE_NET_CLEARANCE, BV.DIVE_TIME_MIN, BV.DIVE_TIME_STEP, BV.DIVE_TIME_STEPS, 5)
		_push_out(p, cy, ddx, ddy, sqrt(ddx * ddx + ddy * ddy), cr)
		add_charge(p, BV.DIVE_GAIN, out)
		out.push(Ev.DIVE_HIT, p, 1.0)
		return true

	var rx := ball_vx - blob_vx[p]
	var ry := ball_vy - blob_vy[p]
	var intensity := minf(1.0, sqrt(rx * rx + ry * ry) / 25.0)

	var nx := (ball_x - blob_x[p]) / wide_x(p)
	var ny := ball_y - cy
	var l := sqrt(nx * nx + ny * ny)
	if l == 0.0:
		l = 1.0
	nx /= l
	ny /= l

	var bvy := blob_vy[p]
	var apex := 1.0
	if bvy < 0.0 or bvy > 0.0:
		if bvy > -BV.APEX_WINDOW and bvy < BV.APEX_WINDOW:
			apex = BV.APEX_MUL
		elif bvy > 0.0:
			apex = BV.FALL_MUL
		else:
			apex = 1.0
	var v := BV.BALL_COLLISION_VELOCITY * tempo * apex
	ball_vx = nx * v
	ball_vy = ny * v
	var raw := blob_vx[p] * BV.SPIN_FROM_VX
	ball_spin = BV.SPIN_MAX if raw > BV.SPIN_MAX else (-BV.SPIN_MAX if raw < -BV.SPIN_MAX else raw)
	if apex == BV.APEX_MUL:
		out.push(Ev.APEX_HIT, p, 1.0)
	ball_x += ball_vx
	ball_y += ball_vy

	out.push(Ev.BALL_HIT_BLOB, p, intensity)
	add_charge(p, BV.SPECIAL_GAIN_TOUCH, out)

	if super_frames > 0:
		if super_owner != p:
			stun[p] = BV.STUN_FRAMES
			knock[p] = (-1.0 if p == BV.LEFT else 1.0) * BV.SPECIAL_KNOCKBACK * tempo
			blob_vy[p] = BV.SPECIAL_POP * tempo
			out.push(Ev.SPECIAL_HIT, p, 1.0)
		super_frames = 0
		super_owner = -1
		parry_chain = 0
	return true

func _handle_ball_world_collisions(out: EventBuf) -> void:
	if ball_y + BV.BALL_RADIUS > BV.GROUND_PLANE_HEIGHT_MAX:
		if not walls and ball_out == 0 and (ball_x < BV.LEFT_PLANE or ball_x > BV.RIGHT_PLANE):
			ball_out = 1
			out.push(Ev.BALL_OUT, BV.LEFT if ball_x < BV.LEFT_PLANE else BV.RIGHT, 0.0)
		if super_frames > 0:
			super_frames = 0
			super_owner = -1
			parry_chain = 0
			out.push(Ev.SPECIAL_GROUND, BV.RIGHT if ball_x > BV.NET_POSITION_X else BV.LEFT, 1.0)
		ball_vy = -ball_vy * 0.95
		ball_vx *= 0.95
		ball_y = BV.GROUND_PLANE_HEIGHT_MAX - BV.BALL_RADIUS
		ball_spin = 0.0
		out.push(Ev.BALL_HIT_GROUND, BV.RIGHT if ball_x > BV.NET_POSITION_X else BV.LEFT, 0.0)

	var on_left := ball_x - BV.BALL_RADIUS <= BV.LEFT_PLANE and ball_vx < 0.0
	var on_right := ball_x + BV.BALL_RADIUS >= BV.RIGHT_PLANE and ball_vx > 0.0

	if not walls and ball_out == 0 \
			and (ball_x < BV.LEFT_PLANE - BV.OPEN_MARGIN or ball_x > BV.RIGHT_PLANE + BV.OPEN_MARGIN):
		ball_out = 1
		out.push(Ev.BALL_OUT, BV.LEFT if ball_x < BV.LEFT_PLANE else BV.RIGHT, 0.0)
	if walls and on_left:
		ball_spin = 0.0
		ball_vx = -ball_vx
		ball_x = BV.LEFT_PLANE + BV.BALL_RADIUS
		out.push(Ev.BALL_HIT_WALL, BV.LEFT, 0.0)
	elif walls and on_right:
		ball_spin = 0.0
		ball_vx = -ball_vx
		ball_x = BV.RIGHT_PLANE - BV.BALL_RADIUS
		out.push(Ev.BALL_HIT_WALL, BV.RIGHT, 0.0)
	elif ball_y > BV.NET_SPHERE_POSITION and absf(ball_x - BV.NET_POSITION_X) < BV.BALL_RADIUS + BV.NET_RADIUS:
		var right := ball_x - BV.NET_POSITION_X > 0.0
		ball_vx = -ball_vx
		ball_x = BV.NET_POSITION_X + (BV.BALL_RADIUS + BV.NET_RADIUS if right else -BV.BALL_RADIUS - BV.NET_RADIUS)
		ball_spin = 0.0
		out.push(Ev.BALL_HIT_NET, BV.RIGHT if right else BV.LEFT, 0.0)
	else:
		var dx := ball_x - BV.NET_POSITION_X
		var dy := ball_y - BV.NET_SPHERE_POSITION
		var d := sqrt(dx * dx + dy * dy)
		if d < BV.NET_RADIUS + BV.BALL_RADIUS:
			var dd := d if d != 0.0 else 1.0
			var nx := dx / dd
			var ny := dy / dd
			var perp := nx * ball_vx + ny * ball_vy
			perp *= perp
			var para := ball_vx * ball_vx + ball_vy * ball_vy - perp
			perp *= 0.7
			para *= 0.9
			var speed := sqrt(perp + para)
			var dot := ball_vx * nx + ball_vy * ny
			var rx := ball_vx - 2.0 * dot * nx
			var ry := ball_vy - 2.0 * dot * ny
			var rl := sqrt(rx * rx + ry * ry)
			if rl == 0.0:
				rl = 1.0
			ball_vx = (rx / rl) * speed
			ball_vy = (ry / rl) * speed
			ball_x = BV.NET_POSITION_X - nx * (BV.NET_RADIUS + BV.BALL_RADIUS)
			ball_y = BV.NET_SPHERE_POSITION - ny * (BV.NET_RADIUS + BV.BALL_RADIUS)
			out.push(Ev.BALL_HIT_NET_TOP, -1, 0.0)

func step(li: PlayerInput, ri: PlayerInput, is_ball_valid: bool, is_game_running: bool, out: EventBuf) -> void:
	if stun[BV.LEFT] > 0:
		stun[BV.LEFT] -= 1
	if stun[BV.RIGHT] > 0:
		stun[BV.RIGHT] -= 1
	if super_frames > 0:
		super_frames -= 1
		if super_frames == 0:
			super_owner = -1
			parry_chain = 0
	if dive_cd[BV.LEFT] > 0:
		dive_cd[BV.LEFT] -= 1
	if dive_cd[BV.RIGHT] > 0:
		dive_cd[BV.RIGHT] -= 1
	if dive_recover[BV.LEFT] > 0:
		dive_recover[BV.LEFT] -= 1
	if dive_recover[BV.RIGHT] > 0:
		dive_recover[BV.RIGHT] -= 1
	if parry_active[BV.LEFT] > 0:
		parry_active[BV.LEFT] -= 1
	if parry_active[BV.RIGHT] > 0:
		parry_active[BV.RIGHT] -= 1
	if parry_cd[BV.LEFT] > 0:
		parry_cd[BV.LEFT] -= 1
	if parry_cd[BV.RIGHT] > 0:
		parry_cd[BV.RIGHT] -= 1
	if dig_cd[BV.LEFT] > 0:
		dig_cd[BV.LEFT] -= 1
	if dig_cd[BV.RIGHT] > 0:
		dig_cd[BV.RIGHT] -= 1
	if dig_active[BV.LEFT] > 0:
		dig_active[BV.LEFT] -= 1
	if dig_active[BV.RIGHT] > 0:
		dig_active[BV.RIGHT] -= 1

	var el := _no_input if stun[BV.LEFT] > 0 else li
	var er := _no_input if stun[BV.RIGHT] > 0 else ri
	var ground_l := blob_hit_ground(BV.LEFT)
	var ground_r := blob_hit_ground(BV.RIGHT)

	_try_crouch(BV.LEFT, li)
	_try_crouch(BV.RIGHT, ri)
	_handle_blob(BV.LEFT, el)
	_handle_blob(BV.RIGHT, er)

	if is_game_running:
		var g := _ball_g()
		if ball_spin != 0.0:
			var k := ball_spin * BV.MAGNUS_K * tempo
			var vx := ball_vx
			var vy := ball_vy
			ball_vx = vx - vy * k
			ball_vy = vy + vx * k
			ball_spin *= BV.SPIN_DECAY
			if ball_spin < 0.006 and ball_spin > -0.006:
				ball_spin = 0.0
		ball_x += ball_vx
		ball_y += 0.5 * g + ball_vy
		ball_vy += g
		add_charge(BV.LEFT, BV.SPECIAL_GAIN_FRAME, out)
		add_charge(BV.RIGHT, BV.SPECIAL_GAIN_FRAME, out)
		if charge[BV.LEFT] >= BV.SPECIAL_FULL:
			charge[BV.LEFT] = maxf(0.0, charge[BV.LEFT] - BV.SPECIAL_LEAK)
		if charge[BV.RIGHT] >= BV.SPECIAL_FULL:
			charge[BV.RIGHT] = maxf(0.0, charge[BV.RIGHT] - BV.SPECIAL_LEAK)

	_try_dive(BV.LEFT, li, out)
	_try_dive(BV.RIGHT, ri, out)

	if is_ball_valid:
		_try_parry(BV.LEFT, li, out)
		_try_parry(BV.RIGHT, ri, out)
		if not _try_dig(BV.LEFT, out):
			_handle_blob_ball_collision(BV.LEFT, out)
		if not solo:
			if not _try_dig(BV.RIGHT, out):
				_handle_blob_ball_collision(BV.RIGHT, out)

	_try_special(BV.LEFT, li, is_ball_valid, ground_l, out)
	_try_special(BV.RIGHT, ri, is_ball_valid, ground_r, out)
	prev_up[BV.LEFT] = 1 if li.up else 0
	prev_up[BV.RIGHT] = 1 if ri.up else 0
	prev_special[BV.LEFT] = 1 if li.special else 0
	prev_special[BV.RIGHT] = 1 if ri.special else 0
	prev_down[BV.LEFT] = 1 if li.down else 0
	prev_down[BV.RIGHT] = 1 if ri.down else 0

	_handle_ball_world_collisions(out)

	if blob_x[BV.LEFT] + BV.BLOBBY_LOWER_RADIUS > BV.NET_POSITION_X - BV.NET_RADIUS:
		blob_x[BV.LEFT] = BV.NET_POSITION_X - BV.NET_RADIUS - BV.BLOBBY_LOWER_RADIUS
	if blob_x[BV.RIGHT] - BV.BLOBBY_LOWER_RADIUS < BV.NET_POSITION_X + BV.NET_RADIUS:
		blob_x[BV.RIGHT] = BV.NET_POSITION_X + BV.NET_RADIUS + BV.BLOBBY_LOWER_RADIUS
	var outer := 0.0 if walls else BV.OPEN_MARGIN
	if blob_x[BV.LEFT] < BV.LEFT_PLANE - outer:
		blob_x[BV.LEFT] = BV.LEFT_PLANE - outer
	if blob_x[BV.RIGHT] > BV.RIGHT_PLANE + outer:
		blob_x[BV.RIGHT] = BV.RIGHT_PLANE + outer

	var speed := sqrt(ball_vx * ball_vx + ball_vy * ball_vy)
	if not is_game_running:
		ball_rot -= ball_ang_vel
	else:
		var base := (1.0 if ball_vx > 0.0 else -1.0) * ball_ang_vel * (speed / 6.0)
		ball_rot += base + ball_spin * BV.SPIN_ROT

	if ball_rot <= 0.0:
		ball_rot = 6.25 + ball_rot
	elif ball_rot >= 6.25:
		ball_rot = ball_rot - 6.25

func reset_ball(side: int) -> void:
	if side == BV.LEFT:
		ball_x = BV.NET_POSITION_X * 0.5
		ball_y = BV.STANDARD_BALL_HEIGHT
	elif side == BV.RIGHT:
		ball_x = BV.NET_POSITION_X * 1.5
		ball_y = BV.STANDARD_BALL_HEIGHT
	else:
		ball_x = BV.NET_POSITION_X
		ball_y = 450.0
	ball_vx = 0.0
	ball_vy = 0.0
	ball_ang_vel = (-1.0 if side == BV.RIGHT else 1.0) * BV.STANDARD_BALL_ANGULAR_VELOCITY
	super_frames = 0
	super_owner = -1
	parry_chain = 0
	parry_active[BV.LEFT] = 0
	parry_active[BV.RIGHT] = 0
	parry_cd[BV.LEFT] = 0
	parry_cd[BV.RIGHT] = 0
	stun[BV.LEFT] = 0
	stun[BV.RIGHT] = 0
	dig_active[BV.LEFT] = 0
	dig_active[BV.RIGHT] = 0
	ball_out = 0
	dig_cd[BV.LEFT] = 0
	dig_cd[BV.RIGHT] = 0
	dive_frames[BV.LEFT] = 0
	dive_frames[BV.RIGHT] = 0
	dive_recover[BV.LEFT] = 0
	dive_recover[BV.RIGHT] = 0
	dive_cd[BV.LEFT] = 0
	dive_cd[BV.RIGHT] = 0
	ball_spin = 0.0
	tempo = 1.0
