class_name Bot
extends RefCounted

## Porte de web/src/ai/bot.ts. Ele não trapaceia: simula a bola com as mesmas
## contas da física, testa onde parar e quando pular, e escolhe a devolução que
## cai mais longe de onde o outro consegue chegar.

const HORIZON := 200

var LOWER_REACH := BV.BALL_RADIUS + BV.BLOBBY_LOWER_RADIUS
var UPPER_REACH := BV.BALL_RADIUS + BV.BLOBBY_UPPER_RADIUS
var GROUND_BALL_Y := BV.GROUND_PLANE_HEIGHT_MAX - BV.BALL_RADIUS
var NET_TOP_Y := BV.NET_SPHERE_POSITION - BV.BALL_RADIUS - BV.NET_RADIUS
var GROUND := BV.GROUND_PLANE_HEIGHT
var SPEED := BV.BLOBBY_SPEED
var BALL_R := BV.BALL_RADIUS
var NET_X := BV.NET_POSITION_X
var RIGHT := BV.RIGHT_PLANE
var NET_TOP := BV.NET_SPHERE_POSITION
var BALL_G := BV.BALL_GRAVITATION
var HIT_V := BV.BALL_COLLISION_VELOCITY
var UP_SPH := BV.BLOBBY_UPPER_SPHERE
var LO_SPH := BV.BLOBBY_LOWER_SPHERE
var LO_R := BV.BLOBBY_LOWER_RADIUS
var G := BV.GRAVITATION
var G_BUF := BV.BLOBBY_JUMP_BUFFER
var JUMP_V := BV.BLOBBY_JUMP_ACCELERATION
var _cfg := false

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

var _jump := PackedFloat64Array()

func _build_jump() -> PackedFloat64Array:
	var a := PackedFloat64Array()
	var g := G - G_BUF
	var y := GROUND
	var vy := JUMP_V
	for i in 120:
		y += 0.5 * g + vy
		vy += g
		if y >= GROUND:
			break
		a.append(y)
	return a

## Lê do mundo tudo que o nível pode ter mudado.
func _configure(w: PhysicWorld) -> void:
	_cfg = true
	var me := index
	var s := w.bs[me]
	BALL_R = w.ball_r
	NET_X = w.net_x
	RIGHT = w.right_plane
	NET_TOP = w.net_top
	BALL_G = BV.BALL_GRAVITATION * w.P.ball_g
	HIT_V = BV.BALL_COLLISION_VELOCITY * w.P.ball_hit
	UP_SPH = BV.BLOBBY_UPPER_SPHERE * s
	LO_SPH = BV.BLOBBY_LOWER_SPHERE * s
	LO_R = BV.BLOBBY_LOWER_RADIUS * s
	LOWER_REACH = BALL_R + LO_R
	UPPER_REACH = BALL_R + BV.BLOBBY_UPPER_RADIUS * s
	GROUND_BALL_Y = BV.GROUND_PLANE_HEIGHT_MAX - BALL_R
	NET_TOP_Y = NET_TOP - BALL_R - BV.NET_RADIUS
	GROUND = w.ground_y(me)
	SPEED = w.speed_of(me)
	G = BV.GRAVITATION * w.P.gravity
	G_BUF = BV.BLOBBY_JUMP_BUFFER * w.P.gravity
	JUMP_V = BV.BLOBBY_JUMP_ACCELERATION * float(w.P.blob_jump[side])
	_jump = _build_jump()
	var n := int(w.P.per_side[side])
	var k := me - w.lead(side)
	var half := NET_X
	var base := half * 0.5 if side == BV.LEFT else half * 1.5
	_home = base + (float(k) - (n - 1) * 0.5) * (half * 0.5 / maxf(1.0, float(n)))
	_partners = n > 1

var side := BV.LEFT
var index := 0
var diff := "normal"
var _home := 0.0
var _partners := false
var _mine := true

var _px := PackedFloat64Array()
var _py := PackedFloat64Array()
var _ay := PackedFloat64Array()
var _seed := 12345
var _cool := 0
var _aim := 0.0
var _up_held := false
var _sp_held := false
var _spin_arm := false
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

var _blend := {}

func _init(s: int, d := "normal", seed := 12345, idx := -1) -> void:
	side = s
	index = idx if idx >= 0 else s
	diff = d if PARAMS.has(d) else "normal"
	_blend = PARAMS[diff]
	_seed = seed & 0xFFFFFFFF
	_px.resize(HORIZON + 2)
	_py.resize(HORIZON + 2)
	_ay.resize(HORIZON + 2)
	_clear_plan()

## Habilidade contínua: 0 = easy, 1 = normal, 2 = hard, 3 = insane, e acima
## de 3 continua apertando reação e erro até o limite.
func set_skill(k: float) -> void:
	var tiers := ["easy", "normal", "hard", "insane"]
	var kk := clampf(k, 0.0, 3.6)
	var i := mini(2, int(floor(kk)))
	var t := kk - i
	var a: Dictionary = PARAMS[tiers[i]]
	var b: Dictionary = PARAMS[tiers[i + 1]]
	var out := {}
	for key in a:
		out[key] = lerpf(float(a[key]), float(b[key]), minf(t, 1.0))
	if kk > 3.0:
		var e := kk - 3.0
		out["reaction"] = 1.0
		out["horizon"] = 200.0
		out["speed"] = 1.0
		out["foe_lead"] = 10.0 + e * 8.0
	out["reaction"] = maxf(1.0, round(float(out["reaction"])))
	out["horizon"] = round(float(out["horizon"]))
	out["offsets"] = round(float(out["offsets"]))
	_blend = out

func _rng() -> float:
	_seed = (_seed * 1664525 + 1013904223) & 0xFFFFFFFF
	return float(_seed) / 4294967296.0

func _dir() -> float:
	return 1.0 if side == BV.LEFT else -1.0

func _clear_plan() -> void:
	_stand_x = NET_X
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
		g = BALL_G * BV.SPECIAL_GRAVITY_MUL if w.super_frames > 0 else BALL_G
	var wind := w.P.wind

	for t in range(1, n + 1):
		if wind != 0.0 and running:
			vx += wind
		x += vx
		y += 0.5 * g + vy
		vy += g

		if _ctx_walls and x - BALL_R <= BV.LEFT_PLANE and vx < 0.0:
			vx = -vx
			x = BV.LEFT_PLANE + BALL_R
		elif _ctx_walls and x + BALL_R >= RIGHT and vx > 0.0:
			vx = -vx
			x = RIGHT - BALL_R
		elif y > NET_TOP and absf(x - NET_X) < BALL_R + BV.NET_RADIUS:
			var right := x - NET_X > 0.0
			vx = -vx
			x = NET_X + (BALL_R + BV.NET_RADIUS if right else -(BALL_R + BV.NET_RADIUS))

		_px[t] = x
		_py[t] = y
		if y >= GROUND_BALL_Y:
			return t
	return n

func _fold_x(x: float) -> float:
	var lo := BV.LEFT_PLANE + BALL_R
	var span := RIGHT - BALL_R - lo
	if span <= 0.0:
		return lo
	var u := x - lo
	u -= 2.0 * span * floorf(u / (2.0 * span))
	if u > span:
		u = 2.0 * span - u
	return lo + u

func _contact_normal(bx: float, by: float, ballx: float, bally: float) -> bool:
	var dx := ballx - bx
	var dy := bally - (by + LO_SPH)
	var d := sqrt(dx * dx + dy * dy)
	if d >= LOWER_REACH:
		dy = bally - (by - UP_SPH)
		d = sqrt(dx * dx + dy * dy)
		if d >= UPPER_REACH:
			return false
	if d < 2.0:
		return false
	_nx = dx / d
	_ny = dy / d
	return true

func _shot_score(x0: float, y0: float, vx: float, vy: float) -> float:
	var g := BALL_G
	var disc := vy * vy + 2.0 * g * (GROUND_BALL_Y - y0)
	if disc <= 0.0:
		return -900.0
	var tf := (-vy + sqrt(disc)) / g
	if tf <= 0.0:
		return -900.0

	var dir := _ctx_dir
	if dir * vx > 0.0:
		var tn := (NET_X - x0) / vx
		if tn > 0.0 and tn < tf:
			var yn := y0 + vy * tn + 0.5 * g * tn * tn
			if yn > NET_TOP_Y - _ctx_clear:
				return -900.0 + yn * -0.01

	var raw := x0 + vx * tf
	if not _ctx_walls and (raw < BV.LEFT_PLANE or raw > RIGHT):
		return -800.0
	var land := _fold_x(raw) if _ctx_walls else raw
	var bounced := absf(land - raw) > 0.5
	if dir * vx <= 0.0 and bounced:
		return -700.0
	if dir * (land - NET_X) > 30.0:
		var gap := absf(land - _ctx_foe_x) - SPEED * tf
		return gap * 2.2 + absf(land - NET_X) * 0.3 - tf * 0.2 - (45.0 if bounced else 0.0)

	return -700.0

func _clamp_x(x: float) -> float:
	var out := 0.0 if _ctx_walls else BV.OPEN_MARGIN
	var lo := BV.LEFT_PLANE + 8.0 - out if side == BV.LEFT \
		else NET_X + BV.NET_RADIUS + LO_R + 2.0
	var hi := NET_X - BV.NET_RADIUS - LO_R - 2.0 if side == BV.LEFT \
		else RIGHT - 8.0 + out
	return maxf(lo, minf(hi, x))

func think(m: BVMatch) -> PlayerInput:
	var p: Dictionary = _blend
	var w := m.world
	var g := m.logic
	_ctx_walls = w.walls
	if not _cfg:
		_configure(w)
	var me := index
	var bx := w.blob_x[me]
	var on_ground := w.blob_y[me] >= GROUND - 0.001

	if _dig_lock > 0:
		_dig_lock -= 1

	_out.clear()
	if w.stun[me] > 0 or w.knocked[me] > 0:
		_up_held = false
		_sp_held = false
		_spin_arm = false
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
		_out.dive = true
		return _out
	_dive_held = false

	var down := _want_down(w, me, on_ground)

	var target := _clamp_x(_stand_x + _aim)
	if not g.is_ball_valid or not _mine:
		target = _clamp_x(_home if _partners else NET_X - _dir() * (RIGHT * 0.24))
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
	if w.hold[me] > 0:
		up = false
	# giro: o botão é o mesmo do pulo, então solta um frame antes de bater
	if _spin_arm and not _up_held:
		up = true
		_spin_arm = false
	elif _want_spin(w, me, on_ground, p):
		if _up_held:
			up = false
			_spin_arm = true
		else:
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
		var e := absf(_jump[k] - UP_SPH - want)
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
		var bxt := _bx0 + sgn * minf(SPEED * t, adx)
		var byt := 0.0
		if j >= 0 and t > j:
			var k := t - j - 1
			byt = _jump[k] if k < _jump.size() else GROUND
		else:
			byt = _ay[t] if (_land_in < 0 or t < _land_in) else GROUND
		if not _contact_normal(bxt, byt, _px[t], _py[t]):
			continue
		var vx := _nx * HIT_V
		var vy := _ny * HIT_V
		var s := _shot_score(_px[t] + vx, _py[t] + vy, vx, vy)
		if _charge_ready and byt < GROUND - 20.0:
			s += 90.0 * _attack
		if _shot_err > 0.0:
			s += (_rng() * 2.0 - 1.0) * _shot_err * 120.0
		if s > _best:
			_best = s
			_b_stand = sx
			_b_t = t
			_b_jump = j
			_b_ground = byt >= GROUND - 1.0
		_found = true
		return

func _replan(m: BVMatch, p: Dictionary) -> void:
	var w := m.world
	var me := index
	var foe := w.lead(BV.other(side))
	var dir := _dir()
	var n := _simulate(m, int(p.horizon))
	_mine = _claim(w, n)

	_land_in = 0 if w.blob_y[me] >= GROUND - 0.001 else -1
	var y := w.blob_y[me]
	var vy := w.blob_vy[me]
	for t in range(1, n + 1):
		var gg := G - G_BUF if vy < 0.0 else G
		y += 0.5 * gg + vy
		vy += gg
		if y >= GROUND:
			y = GROUND
			vy = 0.0
			if _land_in < 0:
				_land_in = t
		_ay[t] = y

	_t0 = -1
	_t1 = -1
	for t in range(1, n + 1):
		if dir * (_px[t] - NET_X) >= 0.0:
			continue
		if _py[t] < 120.0:
			continue
		if _t0 < 0:
			_t0 = t
		_t1 = t

	if _t0 < 0 or not _mine:
		var depth := 108.0 + absf(w.blob_x[foe] - NET_X) * 0.42
		_clear_plan()
		_stand_x = _home if _partners else NET_X - dir * depth
		return

	if w.super_frames > 0 and w.super_owner != me:
		var jat := -99
		if _py[_t0] < GROUND - 150.0:
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
	var reach := SPEED * _t1
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
	var dig_tight := false
	if _b_ground and _best < -300.0:
		var dxb := _px[_b_t] - _b_stand
		var dyb := _py[_b_t] - (GROUND + LO_SPH)
		var dd := dxb * dxb + dyb * dyb
		dig = dd < BV.DIG_REACH * BV.DIG_REACH * 0.8
		dig_tight = dd < BV.DIG_REACH * BV.DIG_REACH * 0.42

	# cavada folgada resolve sentado; cavada no limite do braço é onde o mergulho
	# vale a pena -- e é dele que sai a defesa que rende replay
	var dive_dir := 0
	var dive_t := 999
	if _b_ground and not dig_tight and _best < -300.0:
		for tt in range(_t0, _t1 + 1):
			if _py[tt] < GROUND - 160.0:
				continue
			var gap := _px[tt] - _bx0
			var ad := absf(gap)
			if ad <= SPEED * tt + LOWER_REACH * 0.8:
				continue
			if ad > LOWER_REACH * 1.4 + BV.DIVE_SPEED * tt * 0.55:
				continue
			dive_dir = 1 if gap > 0.0 else -1
			dive_t = tt - 6
			break
	if dive_dir != 0:
		dig = false

	_stand_x = _b_stand
	_hit_t = _b_t
	_jump_at = _b_jump
	_dig = dig
	_dive_dir = dive_dir
	_dive_t = dive_t

## Com parceiro, só o mais perto da bola vai nela; o outro cobre a casa.
func _claim(w: PhysicWorld, n: int) -> bool:
	if not _partners:
		return true
	var tx := _px[n] if n > 0 else w.ball_x
	if _dir() * (tx - NET_X) > 0.0:
		return true
	var best := -1
	var bd := 1e9
	for q in w.nb:
		if w.side_of(q) != side or w.stun[q] > 0:
			continue
		var d := absf(w.blob_x[q] - tx)
		if d < bd:
			bd = d
			best = q
	return best == index

func _want_down(w: PhysicWorld, me: int, on_ground: bool) -> bool:
	if w.super_frames > 0 and w.super_owner != me:
		return false
	if _dig and _hit_t <= 3 and on_ground and w.dig_cd[me] == 0 and _dig_lock == 0:
		_dig_lock = 14
		return true
	return false

## Giro no ar: o planejador já escolheu o ângulo do contato, e o giro manda a
## bola nessa mesma direção só que muito mais forte. Então basta girar sempre
## que o plano é bater no ar.
func _want_spin(w: PhysicWorld, me: int, on_ground: bool, p: Dictionary) -> bool:
	if on_ground or w.spin_t[me] > 0 or w.spin_cd[me] > 0 or w.hold[me] > 0:
		return false
	if w.super_frames > 0 or w.dive_frames[me] > 0 or w.block_t[me] > 0:
		return false
	if _b_ground or not _mine or _hit_t < 0 or _hit_t > BV.SPIN_FRAMES - 8:
		return false
	if _dir() * (w.ball_x - NET_X) > 0.0:
		return false
	return _rng() < 0.1 + float(p.attack) * 0.9

func _want_special(w: PhysicWorld, me: int, on_ground: bool, p: Dictionary) -> bool:
	if w.super_frames > 0 and w.super_owner != me:
		return _want_parry(w, me, p)
	if w.hold[me] > 0:
		_sp_held = false
		return false
	var mine := _dir() * (w.ball_x - NET_X) < 0.0
	if not (w.charge[me] >= BV.SPECIAL_FULL and not on_ground and mine):
		_sp_held = false
		return false
	var dx := w.ball_x - w.blob_x[me]
	var dy := w.ball_y - (w.blob_y[me] - UP_SPH)
	var near := dx * dx + dy * dy < BV.SPECIAL_REACH * BV.SPECIAL_REACH * 0.5
	if not (near and _rng() < 0.3 + float(p.attack) * 0.7):
		_sp_held = false
		return false
	if _sp_held:
		return false
	_sp_held = true
	return true

## A rajada vem em três (ou seis): o parry mira a bola mais perto que ainda
## está vindo, seja a principal ou uma das extras.
func _threat(w: PhysicWorld, me: int) -> Vector3:
	var best := Vector3(0.0, 0.0, -1.0)
	var bd := 1e9
	var dir := _dir()
	var cands: Array = [[w.ball_x, w.ball_y, w.ball_vx, w.ball_vy]]
	for i in BV.MAX_EX:
		if w.ex_on[i] == 2:
			cands.append([w.ex_x[i], w.ex_y[i], w.ex_vx[i], w.ex_vy[i]])
	for c in cands:
		if dir * float(c[2]) > 0.0:
			continue
		var dx: float = float(c[0]) - w.blob_x[me]
		var dy: float = float(c[1]) - (w.blob_y[me] - UP_SPH)
		var d := sqrt(dx * dx + dy * dy)
		var v := sqrt(float(c[2]) * float(c[2]) + float(c[3]) * float(c[3]))
		var eta := d / maxf(1.0, v)
		if eta < bd:
			bd = eta
			best = Vector3(d, v, eta)
	return best

func _want_parry(w: PhysicWorld, me: int, p: Dictionary) -> bool:
	if w.parry_cd[me] > 0 or w.parry_active[me] > 0:
		_sp_held = false
		return false
	var t := _threat(w, me)
	if t.z < 0.0:
		_sp_held = false
		return false
	if not (t.x < BV.PARRY_REACH + t.y * 2.5 and t.z < 6.0 and _rng() < float(p.parry)):
		_sp_held = false
		return false
	if _sp_held:
		return false
	_sp_held = true
	return true
