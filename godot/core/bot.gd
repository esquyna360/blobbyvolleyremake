class_name Bot
extends RefCounted

## Porte de web/src/ai/bot.ts. Ele não trapaceia: simula a bola com as mesmas
## contas da física, testa onde parar e quando pular, e escolhe a devolução que
## cai mais longe de onde o outro consegue chegar.

const HORIZON := 200

const LOWER_REACH := BV.BALL_RADIUS + BV.BLOBBY_LOWER_RADIUS
const UPPER_REACH := BV.BALL_RADIUS + BV.BLOBBY_UPPER_RADIUS
const GROUND_BALL_Y := BV.GROUND_PLANE_HEIGHT_MAX - BV.BALL_RADIUS
const NET_TOP_Y := BV.NET_SPHERE_POSITION - BV.BALL_RADIUS - BV.NET_RADIUS

const PARAMS := {
	"easy": {"reaction": 12, "horizon": 30, "aim_err": 42.0, "shot_err": 0.8, "speed": 0.7,
		"attack": 0.05, "parry": 0.1, "offsets": 6, "clear": 30.0, "foe_lead": 0.0},
	"normal": {"reaction": 6, "horizon": 62, "aim_err": 22.0, "shot_err": 0.42, "speed": 0.92,
		"attack": 0.32, "parry": 0.34, "offsets": 9, "clear": 26.0, "foe_lead": 0.0},
	"hard": {"reaction": 3, "horizon": 125, "aim_err": 8.0, "shot_err": 0.12, "speed": 1.0,
		"attack": 0.72, "parry": 0.66, "offsets": 14, "clear": 22.0, "foe_lead": 5.0},
	"insane": {"reaction": 1, "horizon": 200, "aim_err": 0.0, "shot_err": 0.0, "speed": 1.0,
		"attack": 1.0, "parry": 0.94, "offsets": 22, "clear": 18.0, "foe_lead": 10.0},
}

static var _jump: PackedFloat64Array = _build_jump()

static func _build_jump() -> PackedFloat64Array:
	var a := PackedFloat64Array()
	var g := BV.GRAVITATION - BV.BLOBBY_JUMP_BUFFER
	var y := BV.GROUND_PLANE_HEIGHT
	var vy := BV.BLOBBY_JUMP_ACCELERATION
	for i in 90:
		y += 0.5 * g + vy
		vy += g
		if y >= BV.GROUND_PLANE_HEIGHT:
			break
		a.append(y)
	return a

var side := BV.LEFT
var diff := "normal"

var _px := PackedFloat64Array()
var _py := PackedFloat64Array()
var _ay := PackedFloat64Array()
var _seed := 12345
var _cool := 0
var _aim := 0.0
var _up_held := false
var _sp_held := false
var _dive_held := false
var _dig_lock := 0
var _out := PlayerInput.new()

var _stand_x := BV.NET_POSITION_X
var _hit_t := 999
var _jump_at := -99
var _dig := false
var _dive_dir := 0
var _dive_t := 999

var _ctx_dir := 1.0
var _ctx_foe_x := 0.0
var _ctx_clear := 24.0
var _ctx_walls := true
var _nx := 0.0
var _ny := 0.0

func _init(s: int, d := "normal", seed := 12345) -> void:
	side = s
	diff = d if PARAMS.has(d) else "normal"
	_seed = seed & 0xFFFFFFFF
	_px.resize(HORIZON + 2)
	_py.resize(HORIZON + 2)
	_ay.resize(HORIZON + 2)
	_clear_plan()

func _rng() -> float:
	_seed = (_seed * 1664525 + 1013904223) & 0xFFFFFFFF
	return float(_seed) / 4294967296.0

func _dir() -> float:
	return 1.0 if side == BV.LEFT else -1.0

func _clear_plan() -> void:
	_stand_x = BV.NET_POSITION_X
	_hit_t = 999
	_jump_at = -99
	_dig = false
	_dive_dir = 0
	_dive_t = 999

func _simulate(m: BVMatch, horizon: int) -> int:
	var w := m.world
	var running := m.logic.is_game_running
	var n := mini(horizon, HORIZON)
	var x := w.ball_x
	var y := w.ball_y
	var vx := w.ball_vx if running else 0.0
	var vy := w.ball_vy if running else 0.0
	var g := 0.0
	if running:
		g = BV.BALL_GRAVITATION * BV.SPECIAL_GRAVITY_MUL if w.super_frames > 0 else BV.BALL_GRAVITATION

	for t in range(1, n + 1):
		x += vx
		y += 0.5 * g + vy
		vy += g

		if _ctx_walls and x - BV.BALL_RADIUS <= BV.LEFT_PLANE and vx < 0.0:
			vx = -vx
			x = BV.LEFT_PLANE + BV.BALL_RADIUS
		elif _ctx_walls and x + BV.BALL_RADIUS >= BV.RIGHT_PLANE and vx > 0.0:
			vx = -vx
			x = BV.RIGHT_PLANE - BV.BALL_RADIUS
		elif y > BV.NET_SPHERE_POSITION and absf(x - BV.NET_POSITION_X) < BV.BALL_RADIUS + BV.NET_RADIUS:
			var right := x - BV.NET_POSITION_X > 0.0
			vx = -vx
			x = BV.NET_POSITION_X + (BV.BALL_RADIUS + BV.NET_RADIUS if right else -(BV.BALL_RADIUS + BV.NET_RADIUS))

		_px[t] = x
		_py[t] = y
		if y >= GROUND_BALL_Y:
			return t
	return n

func _fold_x(x: float) -> float:
	var lo := BV.LEFT_PLANE + BV.BALL_RADIUS
	var span := BV.RIGHT_PLANE - BV.BALL_RADIUS - lo
	if span <= 0.0:
		return lo
	var u := x - lo
	u -= 2.0 * span * floorf(u / (2.0 * span))
	if u > span:
		u = 2.0 * span - u
	return lo + u

func _contact_normal(bx: float, by: float, ballx: float, bally: float) -> bool:
	var dx := ballx - bx
	var dy := bally - (by + BV.BLOBBY_LOWER_SPHERE)
	var d := sqrt(dx * dx + dy * dy)
	if d >= LOWER_REACH:
		dy = bally - (by - BV.BLOBBY_UPPER_SPHERE)
		d = sqrt(dx * dx + dy * dy)
		if d >= UPPER_REACH:
			return false
	if d < 2.0:
		return false
	_nx = dx / d
	_ny = dy / d
	return true

func _shot_score(x0: float, y0: float, vx: float, vy: float) -> float:
	var g := BV.BALL_GRAVITATION
	var disc := vy * vy + 2.0 * g * (GROUND_BALL_Y - y0)
	if disc <= 0.0:
		return -900.0
	var tf := (-vy + sqrt(disc)) / g
	if tf <= 0.0:
		return -900.0

	var dir := _ctx_dir
	if dir * vx > 0.0:
		var tn := (BV.NET_POSITION_X - x0) / vx
		if tn > 0.0 and tn < tf:
			var yn := y0 + vy * tn + 0.5 * g * tn * tn
			if yn > NET_TOP_Y - _ctx_clear:
				return -900.0 + yn * -0.01

	var raw := x0 + vx * tf
	if not _ctx_walls and (raw < BV.LEFT_PLANE or raw > BV.RIGHT_PLANE):
		return -800.0
	var land := _fold_x(raw) if _ctx_walls else raw
	var bounced := absf(land - raw) > 0.5
	if dir * vx <= 0.0 and bounced:
		return -700.0
	if dir * (land - BV.NET_POSITION_X) > 30.0:
		var gap := absf(land - _ctx_foe_x) - BV.BLOBBY_SPEED * tf
		return gap * 2.2 + absf(land - BV.NET_POSITION_X) * 0.3 - tf * 0.2 - (45.0 if bounced else 0.0)

	return -700.0

func _clamp_x(x: float) -> float:
	var out := 0.0 if _ctx_walls else BV.OPEN_MARGIN
	var lo := BV.LEFT_PLANE + 8.0 - out if side == BV.LEFT \
		else BV.NET_POSITION_X + BV.NET_RADIUS + BV.BLOBBY_LOWER_RADIUS + 2.0
	var hi := BV.NET_POSITION_X - BV.NET_RADIUS - BV.BLOBBY_LOWER_RADIUS - 2.0 if side == BV.LEFT \
		else BV.RIGHT_PLANE - 8.0 + out
	return maxf(lo, minf(hi, x))

func think(m: BVMatch) -> PlayerInput:
	var p: Dictionary = PARAMS[diff]
	var w := m.world
	var g := m.logic
	_ctx_walls = w.walls
	var me := side
	var bx := w.blob_x[me]
	var on_ground := w.blob_y[me] >= BV.GROUND_PLANE_HEIGHT - 0.001

	if _dig_lock > 0:
		_dig_lock -= 1

	_out.clear()
	if w.stun[me] > 0:
		_up_held = false
		_sp_held = false
		_dive_held = false
		return _out

	_cool -= 1
	if _cool <= 0:
		_cool = int(p.reaction)
		_aim = (_rng() * 2.0 - 1.0) * float(p.aim_err)
		_replan(m, p)
	else:
		_hit_t -= 1
		_jump_at -= 1
		_dive_t -= 1

	var dive_dir := _want_dive(w, me, on_ground)
	if dive_dir != 0:
		_dive_held = true
		_up_held = false
		_sp_held = false
		_out.left = dive_dir < 0
		_out.right = dive_dir > 0
		_out.down = true
		return _out
	_dive_held = false

	var down := _want_down(w, me, on_ground)

	var target := _clamp_x(_stand_x + _aim)
	if not g.is_ball_valid:
		target = _clamp_x(BV.NET_POSITION_X - _dir() * (BV.RIGHT_PLANE * 0.24))
	var dx := target - bx
	var left := dx < -2.5
	var right := dx > 2.5
	if _rng() > float(p.speed):
		left = false
		right = false

	var up := false
	if not down and on_ground and _jump_at <= 0 and _jump_at > -5:
		up = true
	if not on_ground and w.blob_vy[me] < 0.0 and (_up_held or w.charge[me] < BV.SPECIAL_FULL):
		up = true
	_up_held = up

	var special := _want_special(w, me, on_ground, p)
	_out.left = left
	_out.right = right
	_out.up = up
	_out.special = special
	_out.down = down
	return _out

func _want_dive(w: PhysicWorld, me: int, on_ground: bool) -> int:
	if _dive_held:
		return 0
	if not on_ground or w.dive_cd[me] > 0 or w.dive_frames[me] > 0 or w.dive_recover[me] > 0:
		return 0
	if w.super_frames > 0 and w.super_owner != me:
		return 0
	if _dive_dir == 0 or _dive_t > 4 or _dive_t < -2:
		return 0
	return _dive_dir

func _jump_for(t: int, want: float, land_in: int) -> int:
	if land_in < 0:
		return -1
	var kmax := mini(_jump.size() - 1, t - land_in)
	var bk := -1
	var be := 1e9
	for k in range(0, kmax + 1):
		var e := absf(_jump[k] - BV.BLOBBY_UPPER_SPHERE - want)
		if e < be:
			be = e
			bk = k
	if bk < 0 or be > UPPER_REACH * 0.8:
		return -1
	return t - bk

var _best := 0.0
var _b_stand := 0.0
var _b_t := 0
var _b_jump := -99
var _b_ground := true
var _found := false
var _bx0 := 0.0
var _charge_ready := false
var _t0 := 0
var _t1 := 0
var _land_in := 0
var _shot_err := 0.0
var _attack := 0.0

func _probe(sx: float, j: int) -> void:
	var adx := absf(sx - _bx0)
	var sgn := -1.0 if sx < _bx0 else 1.0
	for t in range(maxi(1, _t0 - 2), _t1 + 1):
		var bxt := _bx0 + sgn * minf(BV.BLOBBY_SPEED * t, adx)
		var byt := 0.0
		if j >= 0 and t > j:
			var k := t - j - 1
			byt = _jump[k] if k < _jump.size() else BV.GROUND_PLANE_HEIGHT
		else:
			byt = _ay[t] if (_land_in < 0 or t < _land_in) else BV.GROUND_PLANE_HEIGHT
		if not _contact_normal(bxt, byt, _px[t], _py[t]):
			continue
		var vx := _nx * BV.BALL_COLLISION_VELOCITY
		var vy := _ny * BV.BALL_COLLISION_VELOCITY
		var s := _shot_score(_px[t] + vx, _py[t] + vy, vx, vy)
		if _charge_ready and byt < BV.GROUND_PLANE_HEIGHT - 20.0:
			s += 90.0 * _attack
		if _shot_err > 0.0:
			s += (_rng() * 2.0 - 1.0) * _shot_err * 120.0
		if s > _best:
			_best = s
			_b_stand = sx
			_b_t = t
			_b_jump = j
			_b_ground = byt >= BV.GROUND_PLANE_HEIGHT - 1.0
		_found = true
		return

func _replan(m: BVMatch, p: Dictionary) -> void:
	var w := m.world
	var me := side
	var foe := BV.other(me)
	var dir := _dir()
	var n := _simulate(m, int(p.horizon))

	_land_in = 0 if w.blob_y[me] >= BV.GROUND_PLANE_HEIGHT - 0.001 else -1
	var y := w.blob_y[me]
	var vy := w.blob_vy[me]
	for t in range(1, n + 1):
		var gg := BV.GRAVITATION - BV.BLOBBY_JUMP_BUFFER if vy < 0.0 else BV.GRAVITATION
		y += 0.5 * gg + vy
		vy += gg
		if y >= BV.GROUND_PLANE_HEIGHT:
			y = BV.GROUND_PLANE_HEIGHT
			vy = 0.0
			if _land_in < 0:
				_land_in = t
		_ay[t] = y

	_t0 = -1
	_t1 = -1
	for t in range(1, n + 1):
		if dir * (_px[t] - BV.NET_POSITION_X) >= 0.0:
			continue
		if _py[t] < 120.0:
			continue
		if _t0 < 0:
			_t0 = t
		_t1 = t

	if _t0 < 0:
		var depth := 108.0 + absf(w.blob_x[foe] - BV.NET_POSITION_X) * 0.42
		_clear_plan()
		_stand_x = BV.NET_POSITION_X - dir * depth
		return

	if w.super_frames > 0 and w.super_owner != me:
		var jat := -99
		if _py[_t0] < BV.GROUND_PLANE_HEIGHT - 150.0:
			jat = _jump_for(_t0, _py[_t0], _land_in)
		_clear_plan()
		_stand_x = _clamp_x(_px[_t0])
		_hit_t = _t0
		_jump_at = jat
		return

	_ctx_dir = dir
	_ctx_clear = float(p.clear)
	_ctx_foe_x = w.blob_x[foe] + w.blob_vx[foe] * float(p.foe_lead)

	var jumps: Array[int] = [-99]
	var t := _t0
	while t <= _t1:
		for want in [_py[t] - UPPER_REACH * 0.4, _py[t] + UPPER_REACH * 0.15]:
			var j := _jump_for(t, want, _land_in)
			if j >= 0 and jumps.find(j) < 0 and jumps.size() < 11:
				jumps.append(j)
		t += 3

	_bx0 = w.blob_x[me]
	_charge_ready = w.charge[me] >= BV.SPECIAL_FULL
	_shot_err = float(p.shot_err)
	_attack = float(p.attack)
	var reach := BV.BLOBBY_SPEED * _t1
	var lo := _clamp_x(_bx0 - reach)
	var hi := _clamp_x(_bx0 + reach)

	_best = -1e9
	_b_stand = _clamp_x(_px[_t1])
	_b_t = _t1
	_b_jump = -99
	_b_ground = true
	_found = false

	var coarse := maxi(6, int(p.offsets))
	for i in range(0, coarse + 1):
		var sx := lo + ((hi - lo) * i) / coarse
		for j in jumps:
			_probe(sx, j)
	if _found and int(p.offsets) > 8:
		var c := _b_stand
		var js := jumps.duplicate()
		for i in range(-4, 5):
			if i == 0:
				continue
			var sx := _clamp_x(c + i * 5.5)
			for j in js:
				_probe(sx, j)

	var dig := false
	if _b_ground and _best < -300.0:
		var dxb := _px[_b_t] - _b_stand
		var dyb := _py[_b_t] - (BV.GROUND_PLANE_HEIGHT + BV.BLOBBY_LOWER_SPHERE)
		dig = dxb * dxb + dyb * dyb < BV.DIG_REACH * BV.DIG_REACH * 0.8

	var dive_dir := 0
	var dive_t := 999
	if _b_ground and not dig and _best < -300.0:
		for tt in range(_t0, _t1 + 1):
			if _py[tt] < BV.GROUND_PLANE_HEIGHT - 160.0:
				continue
			var gap := _px[tt] - _bx0
			var ad := absf(gap)
			if ad <= BV.BLOBBY_SPEED * tt + LOWER_REACH * 0.8:
				continue
			if ad > LOWER_REACH * 1.4 + BV.DIVE_SPEED * tt * 0.55:
				continue
			dive_dir = 1 if gap > 0.0 else -1
			dive_t = tt - 6
			break

	_stand_x = _b_stand
	_hit_t = _b_t
	_jump_at = _b_jump
	_dig = dig
	_dive_dir = dive_dir
	_dive_t = dive_t

func _want_down(w: PhysicWorld, me: int, on_ground: bool) -> bool:
	if w.super_frames > 0 and w.super_owner != me:
		return false
	if _dig and _hit_t <= 3 and on_ground and w.dig_cd[me] == 0 and _dig_lock == 0:
		_dig_lock = 14
		return true
	return false

func _want_special(w: PhysicWorld, me: int, on_ground: bool, p: Dictionary) -> bool:
	if w.super_frames > 0 and w.super_owner != me:
		return _want_parry(w, me, p)
	var mine := _dir() * (w.ball_x - BV.NET_POSITION_X) < 0.0
	if not (w.charge[me] >= BV.SPECIAL_FULL and not on_ground and mine):
		_sp_held = false
		return false
	var dx := w.ball_x - w.blob_x[me]
	var dy := w.ball_y - (w.blob_y[me] - BV.BLOBBY_UPPER_SPHERE)
	var near := dx * dx + dy * dy < BV.SPECIAL_REACH * BV.SPECIAL_REACH * 0.5
	if not (near and _rng() < 0.3 + float(p.attack) * 0.7):
		_sp_held = false
		return false
	if _sp_held:
		return false
	_sp_held = true
	return true

func _want_parry(w: PhysicWorld, me: int, p: Dictionary) -> bool:
	if w.parry_cd[me] > 0 or w.parry_active[me] > 0:
		_sp_held = false
		return false
	var closing := w.ball_vx < 0.0 if me == BV.LEFT else w.ball_vx > 0.0
	if not closing:
		_sp_held = false
		return false
	var dx := w.ball_x - w.blob_x[me]
	var dy := w.ball_y - (w.blob_y[me] - BV.BLOBBY_UPPER_SPHERE)
	var d := sqrt(dx * dx + dy * dy)
	var v := sqrt(w.ball_vx * w.ball_vx + w.ball_vy * w.ball_vy)
	if not (d < BV.PARRY_REACH + v * 2.5 and _rng() < float(p.parry)):
		_sp_held = false
		return false
	if _sp_held:
		return false
	_sp_held = true
	return true
