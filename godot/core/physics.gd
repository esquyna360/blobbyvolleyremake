class_name PhysicWorld
extends RefCounted

## Porte do physics.ts do web, agora com N blobs e tudo que um nível pode
## mudar vindo de MatchParams. A ordem das contas segue a do original.

var P := MatchParams.new()
var nb := 2
var net_x := BV.NET_POSITION_X
var right_plane := BV.RIGHT_PLANE
var ball_r := BV.BALL_RADIUS
var net_top := BV.NET_SPHERE_POSITION

var blob_x := PackedFloat64Array()
var blob_y := PackedFloat64Array()
var blob_vx := PackedFloat64Array()
var blob_vy := PackedFloat64Array()
var blob_state := PackedFloat64Array()
var anim_speed := PackedFloat64Array()
var charge := PackedFloat64Array()
var knock := PackedFloat64Array()
var crouch := PackedFloat64Array()
var bs := PackedFloat64Array()

var ball_x := BV.NET_POSITION_X * 0.5
var ball_y := BV.STANDARD_BALL_HEIGHT
var ball_vx := 0.0
var ball_vy := 0.0
var ball_rot := 0.0
var ball_ang_vel := BV.STANDARD_BALL_ANGULAR_VELOCITY
var ball_spin := 0.0
var tempo := 1.0

var stun := PackedInt32Array()
var prev_up := PackedInt32Array()
var prev_special := PackedInt32Array()
var dive_frames := PackedInt32Array()
var dive_dir := PackedInt32Array()
var dive_cd := PackedInt32Array()
var dive_recover := PackedInt32Array()
var dive_wind := PackedInt32Array()
var dizzy := PackedInt32Array()
var block_t := PackedInt32Array()
var block_cd := PackedInt32Array()
var hang := PackedInt32Array()
var prev_jump := PackedInt32Array()
var parry_active := PackedInt32Array()
var parry_cd := PackedInt32Array()
var hold := PackedInt32Array()
var prev_down := PackedInt32Array()
var prev_dive := PackedInt32Array()
var dig_cd := PackedInt32Array()
var dig_active := PackedInt32Array()
var smash_cd := PackedInt32Array()
var spin_t := PackedInt32Array()
var spin_cd := PackedInt32Array()
var hit_cd := PackedInt32Array()
var knocked := PackedInt32Array()
var side := PackedInt32Array()

var super_frames := 0
var super_owner := -1
var parry_chain := 0
var ball_out := 0

## Bola batida no giro. Enquanto esfria, encostar nela custa caro pro outro lado.
var hot := 0
var hot_by := -1

## Especial em varias bolas. A bola principal continua sendo a do jogo -- e ela
## que marca ponto; as extras existem pra encher a tela e pra ter o que
## defender. `vol_left` conta quantas ainda nao foram lancadas.
var vol_n := 0
var vol_owner := -1
var vol_parried := 0
var vol_nx := 1.0
var vol_ny := -0.2
var ex_x := PackedFloat64Array()
var ex_y := PackedFloat64Array()
var ex_vx := PackedFloat64Array()
var ex_vy := PackedFloat64Array()
var ex_rot := PackedFloat64Array()
var ex_on := PackedInt32Array()
var ex_wait := PackedInt32Array()
var rally := 0
var scores := PackedInt32Array([0, 0])
var walls := true
var solo := false
var match_point := false

var _no_input := PlayerInput.new()
var _land := PackedInt32Array()

const SMASH_REACH := 118.0
const SMASH_CD := 22
const SMASH_V := BV.BALL_COLLISION_VELOCITY * 1.18
const SMASH_GAIN := 0.06
const SMASH_CLEARANCE := 14.0

func _init(params: MatchParams = null) -> void:
	configure(params if params != null else MatchParams.new())

func configure(params: MatchParams) -> void:
	P = params
	nb = P.nb()
	net_x = P.net_x()
	right_plane = P.court_w
	ball_r = P.ball_r
	net_top = BV.GROUND_PLANE_HEIGHT_MAX - (BV.GROUND_PLANE_HEIGHT_MAX - BV.NET_SPHERE_POSITION) * P.net_h
	walls = P.walls
	for a in [blob_x, blob_y, blob_vx, blob_vy, blob_state, anim_speed, charge, knock, crouch, bs]:
		a.resize(nb)
		a.fill(0.0)
	for a in [stun, prev_up, prev_special, dive_frames, dive_dir, dive_cd, dive_recover,
			dive_wind, dizzy, block_t, block_cd, hang, prev_jump, parry_active, parry_cd,
			hold, prev_down, prev_dive, dig_cd, dig_active, smash_cd, spin_t, spin_cd,
			hit_cd, knocked, side, _land]:
		a.resize(nb)
		a.fill(0)
	for a in [ex_x, ex_y, ex_vx, ex_vy, ex_rot]:
		a.resize(BV.MAX_EX)
		a.fill(0.0)
	for a in [ex_on, ex_wait]:
		a.resize(BV.MAX_EX)
		a.fill(0)
	for p in nb:
		var s := P.side_of(p)
		side[p] = s
		bs[p] = float(P.blob_scale[s])
		var n := int(P.per_side[s])
		var k := p - P.lead(s)
		var half := net_x
		var base := half * 0.5 if s == BV.LEFT else half * 1.5
		var spread := half * 0.5 / maxf(1.0, float(n))
		var off := (float(k) - (n - 1) * 0.5) * spread
		blob_x[p] = base + off
		blob_y[p] = ground_y(p)
	ball_x = net_x * 0.5
	ball_y = BV.STANDARD_BALL_HEIGHT

func float_count() -> int:
	return nb * 10 + 8 + BV.MAX_EX * 5 + 2

func int_count() -> int:
	return nb * 25 + 8 + BV.MAX_EX * 2

func side_of(p: int) -> int:
	return side[p]

func lead(s: int) -> int:
	return P.lead(s)

func dir_of(p: int) -> float:
	return 1.0 if side[p] == BV.LEFT else -1.0

func ground_y(p: int) -> float:
	return BV.GROUND_PLANE_HEIGHT_MAX - BV.BLOBBY_HEIGHT * 0.5 * bs[p]

func blob_hit_ground(p: int) -> bool:
	return blob_y[p] >= ground_y(p) - 0.001

func upper_y(p: int) -> float:
	return blob_y[p] - (BV.BLOBBY_UPPER_SPHERE - crouch[p] * BV.CROUCH_DUCK) * bs[p]

func upper_r(p: int) -> float:
	return (BV.BLOBBY_UPPER_RADIUS - crouch[p] * BV.CROUCH_SLIM) * bs[p]

func lower_y(p: int) -> float:
	return blob_y[p] + BV.BLOBBY_LOWER_SPHERE * bs[p]

func lower_r(p: int) -> float:
	return (BV.BLOBBY_LOWER_RADIUS + crouch[p] * BV.CROUCH_SPREAD) * bs[p]

func body_r(p: int) -> float:
	return BV.BLOBBY_LOWER_RADIUS * bs[p]

func wide_x(p: int) -> float:
	var dive := 1.0 if dive_frames[p] > 0 else (0.5 if dive_recover[p] > 0 else 0.0)
	return 1.0 + crouch[p] * BV.CROUCH_WIDE + dive * BV.DIVE_WIDE

func diving(p: int) -> bool:
	return dive_frames[p] > 0

func blocking(p: int) -> bool:
	return block_t[p] > 0

func over_net(p: int) -> bool:
	return not blob_hit_ground(p) and upper_y(p) - upper_r(p) < net_top + 18.0

func speed_of(p: int) -> float:
	return BV.BLOBBY_SPEED * float(P.blob_speed[side[p]])

func _blob_g() -> float:
	return BV.GRAVITATION * P.gravity

func _comeback(p: int) -> float:
	var s := side[p]
	var diff := float(scores[BV.other(s)] - scores[s])
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

func _noise(p: int, salt: int) -> float:
	var h := BV.imul(BV.js_round(ball_x * 32.0) ^ 0x9e3779b9, 2246822519)
	h = BV.imul(h ^ BV.js_round(ball_y * 32.0), 3266489917)
	h = BV.imul(h ^ BV.js_round(blob_x[p] * 32.0), 668265263)
	h = BV.imul(h ^ BV.js_round(blob_y[p] * 32.0), 374761393)
	h = BV.imul(h ^ (p + 1) ^ BV.imul(salt + 1, 2654435761), 2246822519)
	var u := h & 0xFFFFFFFF
	return float(u ^ (u >> 15)) / 4294967296.0

func _ball_g0() -> float:
	return BV.BALL_GRAVITATION * P.ball_g

func _ball_g() -> float:
	var base := _ball_g0() * BV.VOLLEY_G if super_frames > 0 else _ball_g0()
	return base * tempo * tempo

func _hit_v() -> float:
	return BV.BALL_COLLISION_VELOCITY * P.ball_hit

func _bump_tempo() -> void:
	if tempo >= BV.TEMPO_MAX:
		return
	var prev := tempo
	tempo = minf(BV.TEMPO_MAX, tempo + BV.TEMPO_STEP)
	var k := tempo / prev
	ball_vx *= k
	ball_vy *= k
	for p in nb:
		blob_vy[p] *= k
		knock[p] *= k

func _scale_ball_v() -> void:
	ball_vx *= tempo
	ball_vy *= tempo

func _clears_net(vx: float, vy: float, g: float, clearance: float) -> bool:
	var band := ball_r + BV.NET_RADIUS + 4.0
	var ceiling := net_top - clearance
	for k in range(-1, 2):
		var t := (net_x + k * band - ball_x) / vx
		if t <= 0.0:
			continue
		if ball_y + vy * t + 0.5 * g * t * t > ceiling:
			return false
	return true

func _target_x(p: int, depth: float) -> float:
	return net_x + (right_plane - net_x) * depth if side[p] == BV.LEFT \
		else net_x - net_x * depth

func _aim_shot_scaled(p: int, vmax: float, vmin: float, depth: float, clearance: float,
		t_min: float, t_step: float, t_steps: int, salt: int) -> void:
	_aim_shot(p, vmax, vmin, depth, clearance, t_min, t_step, t_steps, salt)
	_scale_ball_v()

func _aim_shot(p: int, vmax: float, vmin: float, depth: float, clearance: float,
		t_min: float, t_step: float, t_steps: int, salt: int, jitter := 0.2) -> bool:
	var dir := dir_of(p)
	var g := _ball_g0()
	var ty := BV.GROUND_PLANE_HEIGHT_MAX - ball_r
	var jit := (_noise(p, salt) - 0.5) * jitter
	var max2 := vmax * vmax
	var bx := 0.0
	var by := 0.0
	var best := -1.0

	for d in 3:
		var dd := minf(0.94, depth + jit + d * 0.16)
		var tx := _target_x(p, dd)
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
		return true

	ball_vx = dir * _hit_v() * 0.4
	ball_vy = -_hit_v() * 0.78
	return false

func _try_crouch(p: int, raw: PlayerInput) -> void:
	var ground := blob_hit_ground(p)
	var held := raw.down and stun[p] <= 0
	if held:
		crouch[p] = minf(1.0, crouch[p] + (BV.CROUCH_RATE if ground else BV.CROUCH_RATE_AIR))
	else:
		crouch[p] = maxf(0.0, crouch[p] - BV.CROUCH_RELEASE)

	if raw.down and prev_down[p] == 0 and stun[p] <= 0 and dig_cd[p] == 0:
		dig_active[p] = BV.DIG_WINDOW
		dig_cd[p] = BV.DIG_CD

func _try_dig(p: int, out: EventBuf) -> bool:
	if dig_active[p] <= 0 or stun[p] > 0:
		return false
	if super_frames > 0:
		return false
	var cy := lower_y(p)
	var dx := ball_x - blob_x[p]
	var dy := ball_y - cy
	var d2 := dx * dx + dy * dy
	var reach := BV.DIG_REACH * bs[p]
	if d2 > reach * reach:
		return false

	dig_active[p] = 0
	dig_cd[p] = BV.DIG_CD
	_bump_tempo()
	_aim_shot_scaled(p, BV.DIG_VELOCITY * P.ball_hit, 0.0, BV.DIG_TARGET_DEPTH, BV.DIG_NET_CLEARANCE,
		BV.DIG_TIME_MIN, BV.DIG_TIME_STEP, BV.DIG_TIME_STEPS, 2)
	_push_out(p, cy, dx, dy, sqrt(d2), lower_r(p))
	add_charge(p, BV.DIG_GAIN, out)
	out.push(Ev.DIG, p, 1.0)
	return true

func _push_out(p: int, cy: float, dx: float, dy: float, l: float, r: float) -> void:
	var need := ball_r + r + 2.0
	if l >= need:
		return
	var k := l if l != 0.0 else 1.0
	ball_x = blob_x[p] + (dx / k) * need
	ball_y = cy + (dy / k) * need

func _dive_press(p: int) -> bool:
	return stun[p] == 0 and dizzy[p] == 0 and dive_cd[p] == 0 \
		and dive_frames[p] == 0 and dive_recover[p] == 0 and dive_wind[p] == 0

func _action_pressed(p: int, raw: PlayerInput) -> bool:
	return (raw.dive and prev_dive[p] == 0) or (raw.special and prev_special[p] == 0)

## Ataque no ar: segundo toque no pulo. Vira um parafuso -- se relar na bola,
## ela sai forte na direção do contato; se não relar, não acontece nada.
func _try_spin(p: int, raw: PlayerInput, grounded: bool, out: EventBuf) -> void:
	if stun[p] > 0 or dizzy[p] > 0 or hold[p] > 0:
		return
	if grounded or blob_hit_ground(p) or spin_cd[p] > 0 or spin_t[p] > 0:
		return
	if dive_frames[p] > 0 or dive_wind[p] > 0 or block_t[p] > 0:
		return
	if not (raw.up and prev_up[p] == 0):
		return
	if _would_block(p):
		return
	spin_t[p] = BV.SPIN_FRAMES
	spin_cd[p] = BV.SPIN_LOCK
	out.push(Ev.SPIN, p, 0.0)

func _spin_hit(p: int, out: EventBuf) -> bool:
	if spin_t[p] <= 0 or super_frames > 0:
		return false
	var cy := upper_y(p)
	var dx := ball_x - blob_x[p]
	var dy := ball_y - cy
	var d2 := dx * dx + dy * dy
	var reach := BV.SPIN_REACH * bs[p]
	if d2 > reach * reach:
		return false
	var l := sqrt(d2)
	if l < 0.001:
		dx = dir_of(p)
		dy = -0.4
		l = sqrt(dx * dx + dy * dy)
	spin_t[p] = 0
	hit_cd[p] = 10
	_bump_tempo()
	var v := BV.SPIN_V * P.ball_hit * tempo
	ball_vx = (dx / l) * v
	ball_vy = (dy / l) * v
	ball_spin = clampf(blob_vx[p] * BV.SPIN_FROM_VX, -BV.SPIN_MAX, BV.SPIN_MAX)
	hot = BV.HOT_FRAMES
	hot_by = p
	_push_out(p, cy, dx, dy, l, upper_r(p))
	add_charge(p, BV.SPIN_GAIN, out)
	out.push(Ev.BALL_HIT_BLOB, p, 1.0)
	out.push(Ev.SPIN_HIT, p, 1.0)
	return true

func _try_dive(p: int, raw: PlayerInput, out: EventBuf) -> void:
	if not _dive_press(p):
		return
	var dir: int
	if raw.left != raw.right:
		dir = 1 if raw.right else -1
	else:
		dir = 1 if side[p] == BV.LEFT else -1
	dive_dir[p] = dir
	dive_cd[p] = BV.DIVE_CD
	dive_wind[p] = BV.DIVE_WINDUP
	out.push(Ev.DIVE, p, 0.0)

func _dive_launch(p: int) -> void:
	var ground := blob_hit_ground(p)
	dive_frames[p] = BV.DIVE_FRAMES
	blob_vx[p] = dive_dir[p] * BV.DIVE_SPEED * tempo * float(P.blob_speed[side[p]])
	blob_vy[p] = BV.DIVE_HOP * tempo if ground else maxf(blob_vy[p], BV.DIVE_HOP * tempo)

func _bonk(p: int, out: EventBuf) -> void:
	if dizzy[p] > 0:
		return
	dive_frames[p] = 0
	dive_recover[p] = BV.DIVE_RECOVER
	dizzy[p] = BV.BONK_FRAMES
	blob_vx[p] = -dive_dir[p] * BV.BONK_BOUNCE
	if blob_vy[p] > 0.0:
		blob_vy[p] = -1.4
	out.push(Ev.BONK, p, 0.0)

## Colado na rede e acima dela o mesmo botão vira bloqueio: devolve reto em vez
## de mandar a bola pro ângulo do contato, que ali quase sempre é o próprio campo.
func _would_block(p: int) -> bool:
	return block_t[p] <= 1 and block_cd[p] <= 1 and hang[p] <= 1 \
			and absf(blob_x[p] - net_x) < BV.BLOCK_REACH * bs[p] and over_net(p) \
			and absf(blob_vy[p]) < 4.0

func _try_block(p: int, raw: PlayerInput, out: EventBuf) -> bool:
	if block_t[p] > 0:
		block_t[p] -= 1
		if block_t[p] == 0 and hang[p] == 0:
			hang[p] = BV.BLOCK_HANG
			out.push(Ev.BLOCK_MISS, p, 0.0)
	if block_cd[p] > 0:
		block_cd[p] -= 1
	if hang[p] > 0:
		hang[p] -= 1
		if blob_hit_ground(p):
			hang[p] = 0
	var near := absf(blob_x[p] - net_x) < BV.BLOCK_REACH * bs[p]
	if block_t[p] == 0 and block_cd[p] == 0 and hang[p] == 0 and near and over_net(p) \
			and stun[p] == 0 and dizzy[p] == 0 and dive_frames[p] == 0 \
			and raw.up and prev_jump[p] == 0 and absf(blob_vy[p]) < 4.0:
		block_t[p] = BV.BLOCK_WINDOW
		block_cd[p] = BV.BLOCK_WINDOW + BV.BLOCK_HANG + 20
		out.push(Ev.BLOCK, p, 0.0)
	if block_t[p] == 0:
		return false
	var toward := (ball_vx > 0.0) if side[p] == BV.RIGHT else (ball_vx < 0.0)
	var dx := ball_x - blob_x[p]
	var dy := ball_y - (upper_y(p) - upper_r(p) * 0.3)
	var rr := upper_r(p) + ball_r + 8.0
	if toward and dx * dx + dy * dy < rr * rr:
		var dir := dir_of(p)
		ball_vx = dir * BV.BLOCK_SPEED * tempo * P.ball_hit
		ball_vy = -3.0 * tempo
		ball_spin = 0.0
		ball_x = blob_x[p] + dir * (upper_r(p) + ball_r + 2.0)
		block_t[p] = 0
		hang[p] = 0
		out.push(Ev.BALL_HIT_BLOB, p, 1.0)
		out.push(Ev.DIVE_HIT, p, 1.0)
		return true
	return false

## Botão de ação: defende o especial do outro, ataca ou mergulha. O especial
## agora mora num botão só dele -- ver `_try_special`.
func _try_action(p: int, raw: PlayerInput, is_ball_valid: bool, out: EventBuf) -> void:
	if stun[p] > 0 or dizzy[p] > 0:
		return
	if super_frames > 0 and super_owner != p:
		# parry aceita os dois botões: ninguém perde o lance por ter a mão no
		# botão errado enquanto três bolas vêm na cara
		if (_action_pressed(p, raw) or _special_pressed(p, raw)) and is_ball_valid \
				and parry_cd[p] == 0 and parry_active[p] == 0:
			parry_active[p] = BV.PARRY_ACTIVE
			parry_cd[p] = BV.PARRY_CD
			out.push(Ev.PARRY_TRY, p, 0.0)
		return
	if not _action_pressed(p, raw):
		return
	if is_ball_valid and super_frames == 0 and _try_smash(p, raw, out):
		return
	_try_dive(p, raw, out)

func _special_pressed(p: int, raw: PlayerInput) -> bool:
	return raw.special and prev_special[p] == 0

## Especial: congela, carrega a pose e solta a rajada. O ângulo é o do contato,
## igual ao giro -- quem posiciona mal manda três bolas pro próprio campo.
func _try_special(p: int, raw: PlayerInput, is_ball_valid: bool, out: EventBuf) -> void:
	if stun[p] > 0 or dizzy[p] > 0 or hold[p] > 0:
		return
	if not _special_pressed(p, raw):
		return
	if not is_ball_valid or super_frames > 0 or charge[p] < BV.SPECIAL_FULL:
		return
	var nx := ball_x - blob_x[p]
	var ny := ball_y - upper_y(p)
	var l := sqrt(nx * nx + ny * ny)
	if l > BV.SPECIAL_REACH * bs[p]:
		return
	if l < 0.001:
		nx = dir_of(p)
		ny = -0.3
		l = sqrt(nx * nx + ny * ny)
	charge[p] = 0.0
	super_frames = BV.SPECIAL_BALL_FRAMES
	super_owner = p
	hold[p] = BV.SUPER_WINDUP
	vol_owner = p
	vol_n = BV.VOLLEY_N
	vol_parried = 0
	_aim_volley(p, nx / l, ny / l)
	_arm_volley(p, BV.VOLLEY_N, BV.SUPER_WINDUP)
	ball_vx = 0.0
	ball_vy = 0.0
	ball_spin = 0.0
	_anchor_held(p)
	out.push(Ev.SPECIAL_HOLD, p, 1.0)

## Sobe um pouco a mira e garante que a rajada saia pra frente: reto no chão
## as três bolas morriam no próprio pé.
func _aim_volley(p: int, nx: float, ny: float) -> void:
	var dir := dir_of(p)
	if dir * nx < 0.30:
		nx = dir * 0.30
	if ny > -0.10:
		ny = -0.10
	var l := sqrt(nx * nx + ny * ny)
	vol_nx = nx / l
	vol_ny = ny / l

## Cada bola extra espera sua vez; a principal é a última a sair. O intervalo
## muda de rajada pra rajada: com tempo fixo o parry das três vira decoreba.
func _arm_volley(p: int, n: int, total: int) -> void:
	for i in BV.MAX_EX:
		ex_on[i] = 0
		ex_wait[i] = 0
	var k := mini(n - 1, BV.MAX_EX)
	if k <= 0:
		return
	var gap := maxi(4, mini(BV.VOLLEY_GAP, int(total / (k + 1))))
	var acc := 0
	for i in k:
		acc += gap + int(floor(_noise(p, 20 + i) * BV.VOLLEY_GAP_JIT))
		ex_on[i] = 1
		ex_wait[i] = maxi(1, total - acc)
		ex_x[i] = ball_x
		ex_y[i] = ball_y
		ex_vx[i] = 0.0
		ex_vy[i] = 0.0
		ex_rot[i] = 0.0

func _try_smash(p: int, raw: PlayerInput, out: EventBuf) -> bool:
	if smash_cd[p] > 0 or hold[p] > 0:
		return false
	var mine := dir_of(p) * (ball_x - net_x) < 0.0
	if not mine:
		return false
	var cy := upper_y(p)
	var dx := ball_x - blob_x[p]
	var dy := ball_y - cy
	var d2 := dx * dx + dy * dy
	var reach := SMASH_REACH * bs[p]
	if d2 > reach * reach:
		return false
	smash_cd[p] = SMASH_CD
	var fwd := dir_of(p)
	var push := (1.0 if raw.right else 0.0) - (1.0 if raw.left else 0.0)
	var depth := 0.62
	if push * fwd > 0.0:
		depth = 0.88
	elif push * fwd < 0.0:
		depth = 0.30
	var air := not blob_hit_ground(p)
	_bump_tempo()
	var v := SMASH_V * P.ball_hit * (1.12 if air else 1.0)
	ball_spin = 0.0
	if not _aim_shot(p, v, v * 0.75, depth, SMASH_CLEARANCE if air else BV.DIVE_NET_CLEARANCE,
			14.0, 2.0, 30, 7, 0.08):
		ball_vx = fwd * v * 0.28
		ball_vy = -v * 0.96
	_scale_ball_v()
	_push_out(p, cy, dx, dy, sqrt(d2), upper_r(p))
	add_charge(p, SMASH_GAIN, out)
	out.push(Ev.BALL_HIT_BLOB, p, 1.0)
	out.push(Ev.SMASH, p, 1.0 if air else 0.6)
	return true

## Parry na bola principal -- a última da rajada. Se as extras já foram todas
## defendidas, isso fecha as três e vira o jogo: seis bolas de volta. Se ficou
## alguma pra trás, é só uma devolvida rápida.
func _try_parry(p: int, out: EventBuf) -> void:
	if stun[p] > 0:
		return
	if super_frames <= 0 or super_owner == p:
		return
	if parry_active[p] <= 0:
		return
	var closing := ball_vx < 0.0 if side[p] == BV.LEFT else ball_vx > 0.0
	if not closing:
		return
	var dx := ball_x - blob_x[p]
	var dy := ball_y - upper_y(p)
	var reach := BV.PARRY_REACH * bs[p]
	if dx * dx + dy * dy > reach * reach:
		return
	parry_active[p] = 0
	parry_cd[p] = 0
	vol_parried += 1
	var full := vol_parried >= vol_n
	parry_chain = mini(parry_chain + 1, BV.PARRY_CHAIN_MAX)
	super_owner = p
	vol_owner = p
	super_frames = BV.SPECIAL_BALL_FRAMES
	ball_vx = 0.0
	ball_vy = 0.0
	ball_spin = 0.0
	_anchor_held(p)
	out.push(Ev.PARRY, p, 1.0 if full else 0.5)
	if full:
		vol_n = BV.VOLLEY_REV
		vol_parried = 0
		hold[p] = BV.VOLLEY_REV_WINDUP
		_aim_volley(p, dir_of(p), -0.28)
		_arm_volley(p, BV.VOLLEY_REV, BV.VOLLEY_REV_WINDUP)
		out.push(Ev.REVERSAL, p, 1.0)
	else:
		vol_n = 1
		vol_parried = 0
		hold[p] = BV.PARRY_HOLD
		_aim_volley(p, dir_of(p), -0.34)
		_arm_volley(p, 1, BV.PARRY_HOLD)

func _anchor_held(p: int) -> void:
	var dir := dir_of(p)
	ball_x = blob_x[p] + dir * (upper_r(p) + ball_r) * 0.55
	ball_y = upper_y(p) - ball_r * 0.9

func holding() -> bool:
	for p in nb:
		if hold[p] > 0:
			return true
	return false

## A pose de carregar tem tempo fixo: o jogador aperta e assiste, como num
## super de luta. Segurar o botão não muda mais nada.
func _hold_step(p: int, _raw: PlayerInput, out: EventBuf) -> void:
	if hold[p] <= 0:
		return
	hold[p] -= 1
	_anchor_held(p)
	if hold[p] > 0 and stun[p] == 0:
		return
	hold[p] = 0
	_bump_tempo()
	var v := BV.VOLLEY_V * P.ball_hit * (1.0 + parry_chain * BV.PARRY_BOOST)
	ball_vx = vol_nx * v
	ball_vy = vol_ny * v
	ball_spin = 0.0
	_scale_ball_v()
	out.push(Ev.SPECIAL_FIRED, p, 0.5 if parry_chain > 0 else 1.0)

## Bolas extras: saem da mão de quem lançou, voam no mesmo ângulo com uma
## abertura mínima e passam direto pelo lado de quem atirou.
func _step_extras(is_game_running: bool, out: EventBuf) -> void:
	if vol_owner < 0:
		return
	var g := _ball_g()
	var any := false
	for i in BV.MAX_EX:
		if ex_on[i] == 0:
			continue
		any = true
		if ex_on[i] == 1:
			ex_wait[i] -= 1
			ex_x[i] = ball_x
			ex_y[i] = ball_y
			if ex_wait[i] > 0:
				continue
			ex_on[i] = 2
			var spread := (float(i) - (BV.MAX_EX - 1) * 0.5) * BV.VOLLEY_SPREAD
			var v := BV.VOLLEY_V * P.ball_hit * tempo
			ex_vx[i] = (vol_nx - vol_ny * spread) * v
			ex_vy[i] = (vol_ny + vol_nx * spread) * v
			out.push(Ev.VOLLEY_FIRE, vol_owner, 1.0)
			continue
		if not is_game_running:
			continue
		ex_x[i] += ex_vx[i]
		ex_y[i] += 0.5 * g + ex_vy[i]
		ex_vy[i] += g
		ex_rot[i] += 0.28
		_extra_world(i, out)
		_extra_blobs(i, out)
	if not any and super_frames <= 0:
		vol_owner = -1

func _kill_extra(i: int) -> void:
	ex_on[i] = 0
	ex_wait[i] = 0

func _extra_world(i: int, out: EventBuf) -> void:
	var ground := BV.GROUND_PLANE_HEIGHT_MAX - ball_r
	if ex_y[i] > ground:
		# a primeira bola que toca o chão fecha o ponto, seja ela qual for
		var s := BV.RIGHT if ex_x[i] > net_x else BV.LEFT
		out.push(Ev.BALL_HIT_GROUND, s, 0.0)
		out.push(Ev.SPECIAL_GROUND, s, 0.6)
		_kill_extra(i)
		return
	if walls and ex_x[i] - ball_r <= BV.LEFT_PLANE and ex_vx[i] < 0.0:
		ex_vx[i] = -ex_vx[i]
		ex_x[i] = BV.LEFT_PLANE + ball_r
		out.push(Ev.BALL_HIT_WALL, BV.LEFT, 0.0)
	elif walls and ex_x[i] + ball_r >= right_plane and ex_vx[i] > 0.0:
		ex_vx[i] = -ex_vx[i]
		ex_x[i] = right_plane - ball_r
		out.push(Ev.BALL_HIT_WALL, BV.RIGHT, 0.0)
	elif not walls and (ex_x[i] < BV.LEFT_PLANE - BV.OPEN_MARGIN \
			or ex_x[i] > right_plane + BV.OPEN_MARGIN):
		_kill_extra(i)
	elif ex_y[i] > net_top and absf(ex_x[i] - net_x) < ball_r + BV.NET_RADIUS:
		var right := ex_x[i] - net_x > 0.0
		ex_vx[i] = -ex_vx[i]
		ex_x[i] = net_x + (ball_r + BV.NET_RADIUS if right else -ball_r - BV.NET_RADIUS)
		out.push(Ev.BALL_HIT_NET, BV.RIGHT if right else BV.LEFT, 0.0)

func _extra_blobs(i: int, out: EventBuf) -> void:
	var os := BV.other(side[vol_owner])
	for q in nb:
		if side[q] != os or stun[q] > 0:
			continue
		var dx := ex_x[i] - blob_x[q]
		var dy := ex_y[i] - upper_y(q)
		var d2 := dx * dx + dy * dy
		if parry_active[q] > 0:
			var pr := BV.PARRY_REACH * bs[q]
			if d2 <= pr * pr:
				parry_active[q] = 0
				parry_cd[q] = BV.PARRY_CD
				vol_parried += 1
				_kill_extra(i)
				out.push(Ev.VOLLEY_BLOCKED, q, float(vol_parried) / maxf(1.0, float(vol_n)))
				return
		var r := ball_r + upper_r(q)
		var rl := ball_r + lower_r(q)
		var dyl := ex_y[i] - lower_y(q)
		if d2 > r * r and dx * dx + dyl * dyl > rl * rl:
			continue
		# levou: cai no chão e a bola fica do lado dele, quicando
		stun[q] = BV.STUN_FRAMES
		knocked[q] = BV.STUN_FRAMES
		knock[q] = -dir_of(q) * BV.SPECIAL_KNOCKBACK * tempo / maxf(0.5, bs[q])
		blob_vy[q] = BV.SPECIAL_POP * tempo
		ex_vx[i] = -ex_vx[i] * 0.22
		ex_vy[i] = -absf(ex_vy[i]) * 0.30 - 5.2
		out.push(Ev.SPECIAL_HIT, q, 1.0)
		out.push(Ev.VOLLEY_PASS, q, 1.0)
		return

func _top_ball_collision(p: int) -> bool:
	var dx := ball_x - blob_x[p]
	var dy := ball_y - upper_y(p)
	var r := ball_r + upper_r(p)
	return dx * dx + dy * dy < r * r

func _bottom_ball_collision(p: int) -> bool:
	var dx := (ball_x - blob_x[p]) / wide_x(p)
	var dy := ball_y - lower_y(p)
	var r := ball_r + lower_r(p)
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
	var gy := ground_y(p)
	var t := tempo
	var t2 := t * t
	var g := _blob_g()
	var jm := float(P.blob_jump[side[p]])
	if inp.up and not inp.down:
		if ground:
			blob_vy[p] = BV.BLOBBY_JUMP_ACCELERATION * t * jm
			_start_anim(p)
		g -= BV.BLOBBY_JUMP_BUFFER * P.gravity
	if not ground and inp.down:
		g += _blob_g() * BV.CROUCH_FALL_MUL
	if (inp.left or inp.right) and ground:
		_start_anim(p)
	g *= t2
	if hang[p] > 0 and blob_vy[p] > 0.0:
		g *= BV.BLOCK_HANG_G

	if dive_wind[p] > 0:
		dive_wind[p] -= 1
		blob_vx[p] = 0.0
		if dive_wind[p] == 0:
			_dive_launch(p)
		blob_y[p] += 0.5 * g + blob_vy[p]
		blob_vy[p] += g
		if blob_y[p] >= gy:
			blob_y[p] = gy
			blob_vy[p] = 0.0
		return

	if dive_frames[p] > 0:
		blob_x[p] += blob_vx[p] + knock[p]
		if knock[p] != 0.0:
			knock[p] *= BV.KNOCK_DECAY
			if absf(knock[p]) < 0.05:
				knock[p] = 0.0
		blob_y[p] += 0.5 * g + blob_vy[p]
		blob_vy[p] += g
		if blob_y[p] >= gy:
			blob_y[p] = gy
			blob_vy[p] = 0.0
			dive_frames[p] = 0
			dive_recover[p] = BV.DIVE_RECOVER
			blob_vx[p] *= BV.DIVE_SLIDE_KEEP
			_land[p] = 1
		return

	var stuck := dive_recover[p] > 0
	var slow := (1.0 - crouch[p] * (1.0 - BV.CROUCH_SPEED_MUL)) * t
	if stuck:
		blob_vx[p] *= BV.DIVE_SLIDE_DRAG
		if absf(blob_vx[p]) < BV.DIVE_SLIDE_STOP:
			blob_vx[p] = 0.0
	else:
		var sp := speed_of(p)
		var want := ((sp if inp.right else 0.0) - (sp if inp.left else 0.0)) * slow
		if P.ice > 0.0 and ground:
			blob_vx[p] += (want - blob_vx[p]) * (1.0 - P.ice)
			if absf(blob_vx[p]) < 0.02:
				blob_vx[p] = 0.0
		else:
			blob_vx[p] = want

	blob_x[p] += blob_vx[p] + knock[p]
	if knock[p] != 0.0:
		knock[p] *= BV.KNOCK_DECAY
		if absf(knock[p]) < 0.05:
			knock[p] = 0.0
	blob_y[p] += 0.5 * g + blob_vy[p]
	blob_vy[p] += g

	if blob_y[p] > gy:
		if blob_vy[p] > 3.5:
			_start_anim(p)
		blob_y[p] = gy
		blob_vy[p] = 0.0
	_anim_step(p)

func _handle_blob_ball_collision(p: int, out: EventBuf) -> bool:
	var cy := lower_y(p)
	var cr := lower_r(p)
	if not _bottom_ball_collision(p):
		if not _top_ball_collision(p):
			return false
		cy = upper_y(p)
		cr = upper_r(p)

	if super_owner == p and super_frames > BV.SPECIAL_BALL_FRAMES - 12:
		return false
	# mergulhar em cima da bola tocava nela todo quadro: um toque só, e o
	# blob fica alguns quadros sem poder tocar de novo
	if hit_cd[p] > 0:
		return false
	hit_cd[p] = 9

	_bump_tempo()

	if hot > 0 and hot_by >= 0 and side[hot_by] != side[p] and stun[p] == 0:
		hot = 0
		hot_by = -1
		stun[p] = BV.HOT_STAGGER
		knock[p] = -dir_of(p) * BV.HOT_KNOCK * tempo / maxf(0.5, bs[p])
		blob_vy[p] = minf(blob_vy[p], BV.HOT_POP * tempo)
		out.push(Ev.STAGGER, p, 1.0)

	if (dive_frames[p] > 0 or dive_recover[p] > 0) and super_frames == 0:
		var ddx := ball_x - blob_x[p]
		var ddy := ball_y - cy
		ball_spin = 0.0
		_aim_shot_scaled(p, BV.DIVE_VELOCITY * P.ball_hit, BV.DIVE_VELOCITY * 0.7 * P.ball_hit,
			BV.DIVE_TARGET_DEPTH, BV.DIVE_NET_CLEARANCE, BV.DIVE_TIME_MIN, BV.DIVE_TIME_STEP,
			BV.DIVE_TIME_STEPS, 5)
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
	if bvy != 0.0:
		if bvy > -BV.APEX_WINDOW and bvy < BV.APEX_WINDOW:
			apex = BV.APEX_MUL
		elif bvy > 0.0:
			apex = BV.FALL_MUL
	var v := _hit_v() * tempo * apex
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
			knock[p] = -dir_of(p) * BV.SPECIAL_KNOCKBACK * tempo
			blob_vy[p] = BV.SPECIAL_POP * tempo
			out.push(Ev.SPECIAL_HIT, p, 1.0)
		super_frames = 0
		super_owner = -1
		parry_chain = 0
	return true

func ball_side() -> int:
	return BV.RIGHT if ball_x > net_x else BV.LEFT

func _handle_ball_world_collisions(out: EventBuf) -> void:
	var ground := BV.GROUND_PLANE_HEIGHT_MAX - ball_r
	if ball_y > ground:
		if not walls and ball_out == 0 and (ball_x < BV.LEFT_PLANE or ball_x > right_plane):
			ball_out = 1
			out.push(Ev.BALL_OUT, BV.LEFT if ball_x < BV.LEFT_PLANE else BV.RIGHT, 0.0)
		if super_frames > 0:
			super_frames = 0
			super_owner = -1
			parry_chain = 0
			out.push(Ev.SPECIAL_GROUND, ball_side(), 1.0)
		ball_vy = -ball_vy * 0.95 * P.ball_bounce
		ball_vx *= 0.95
		ball_y = ground
		ball_spin = 0.0
		out.push(Ev.BALL_HIT_GROUND, ball_side(), 0.0)

	var on_left := ball_x - ball_r <= BV.LEFT_PLANE and ball_vx < 0.0
	var on_right := ball_x + ball_r >= right_plane and ball_vx > 0.0

	if not walls and ball_out == 0 \
			and (ball_x < BV.LEFT_PLANE - BV.OPEN_MARGIN or ball_x > right_plane + BV.OPEN_MARGIN):
		ball_out = 1
		out.push(Ev.BALL_OUT, BV.LEFT if ball_x < BV.LEFT_PLANE else BV.RIGHT, 0.0)
	if walls and on_left:
		ball_spin = 0.0
		ball_vx = -ball_vx
		ball_x = BV.LEFT_PLANE + ball_r
		out.push(Ev.BALL_HIT_WALL, BV.LEFT, 0.0)
	elif walls and on_right:
		ball_spin = 0.0
		ball_vx = -ball_vx
		ball_x = right_plane - ball_r
		out.push(Ev.BALL_HIT_WALL, BV.RIGHT, 0.0)
	elif ball_y > net_top and absf(ball_x - net_x) < ball_r + BV.NET_RADIUS:
		var right := ball_x - net_x > 0.0
		ball_vx = -ball_vx
		ball_x = net_x + (ball_r + BV.NET_RADIUS if right else -ball_r - BV.NET_RADIUS)
		ball_spin = 0.0
		out.push(Ev.BALL_HIT_NET, BV.RIGHT if right else BV.LEFT, 0.0)
	else:
		var dx := ball_x - net_x
		var dy := ball_y - net_top
		var d := sqrt(dx * dx + dy * dy)
		if d < BV.NET_RADIUS + ball_r:
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
			ball_x = net_x - nx * (BV.NET_RADIUS + ball_r)
			ball_y = net_top - ny * (BV.NET_RADIUS + ball_r)
			out.push(Ev.BALL_HIT_NET_TOP, -1, 0.0)

func _dec(a: PackedInt32Array) -> void:
	for p in nb:
		if a[p] > 0:
			a[p] -= 1

## Parceiros do mesmo lado não atravessam um ao outro.
func _separate_partners() -> void:
	for a in nb:
		for b in range(a + 1, nb):
			if side[a] != side[b]:
				continue
			var need := body_r(a) + body_r(b)
			var dx := blob_x[b] - blob_x[a]
			if absf(dx) >= need:
				continue
			var push := (need - absf(dx)) * 0.5
			var sgn := 1.0 if dx >= 0.0 else -1.0
			blob_x[a] -= sgn * push
			blob_x[b] += sgn * push

func step(inputs: Array, is_ball_valid: bool, is_game_running: bool, out: EventBuf) -> void:
	_dec(stun)
	if super_frames > 0 and not holding():
		super_frames -= 1
		if super_frames == 0:
			super_owner = -1
			parry_chain = 0
	if hot > 0:
		hot -= 1
		if hot == 0:
			hot_by = -1
	for a in [dive_cd, dive_recover, dizzy, parry_active, parry_cd, dig_cd, dig_active,
			smash_cd, spin_t, hit_cd, knocked]:
		_dec(a)

	var eff: Array = []
	var was_ground := PackedInt32Array()
	was_ground.resize(nb)
	for p in nb:
		var raw: PlayerInput = inputs[p]
		eff.append(_no_input if stun[p] > 0 or dizzy[p] > 0 else raw)
		was_ground[p] = 1 if blob_hit_ground(p) else 0
		_try_crouch(p, raw)
	for p in nb:
		_handle_blob(p, eff[p])
		if blob_hit_ground(p):
			spin_cd[p] = 0
		if _land[p] == 1:
			_land[p] = 0
			out.push(Ev.DIVE_LAND, p, 0.0)
	_separate_partners()

	for p in nb:
		_hold_step(p, inputs[p], out)
	var is_holding := holding()

	if is_game_running and not is_holding:
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
		if P.wind != 0.0 and super_frames == 0:
			ball_vx += P.wind
		ball_x += ball_vx
		ball_y += 0.5 * g + ball_vy
		ball_vy += g
		for p in nb:
			add_charge(p, BV.SPECIAL_GAIN_FRAME, out)
			if charge[p] >= BV.SPECIAL_FULL:
				charge[p] = maxf(0.0, charge[p] - BV.SPECIAL_LEAK)

	var valid := is_ball_valid and not is_holding
	for p in nb:
		_try_special(p, inputs[p], is_ball_valid, out)
		_try_action(p, inputs[p], valid, out)
		_try_spin(p, eff[p], was_ground[p] == 1, out)

	_step_extras(is_game_running, out)

	if valid:
		for p in nb:
			_try_parry(p, out)
		for p in nb:
			if solo and side[p] == BV.RIGHT:
				continue
			if _spin_hit(p, out):
				continue
			if not _try_block(p, eff[p], out) and not _try_dig(p, out):
				_handle_blob_ball_collision(p, out)

	for p in nb:
		var li: PlayerInput = inputs[p]
		prev_up[p] = 1 if li.up else 0
		prev_special[p] = 1 if li.special else 0
		prev_down[p] = 1 if li.down else 0
		prev_dive[p] = 1 if li.dive else 0
		prev_jump[p] = 1 if eff[p].up else 0

	if not is_holding:
		_handle_ball_world_collisions(out)

	var outer := 0.0 if walls else BV.OPEN_MARGIN
	for p in nb:
		var over := BV.BLOCK_OVER * bs[p] if over_net(p) else 0.0
		var fast := (dive_frames[p] > 0 or dive_recover[p] > 0) and absf(blob_vx[p]) > BV.BONK_SPEED
		var br := body_r(p)
		if side[p] == BV.LEFT:
			if blob_x[p] + br - over > net_x - BV.NET_RADIUS:
				blob_x[p] = net_x - BV.NET_RADIUS - br + over
				if fast and blob_vx[p] > 0.0:
					_bonk(p, out)
			if blob_x[p] < BV.LEFT_PLANE - outer:
				blob_x[p] = BV.LEFT_PLANE - outer
				if walls and fast and blob_vx[p] < 0.0:
					_bonk(p, out)
		else:
			if blob_x[p] - br + over < net_x + BV.NET_RADIUS:
				blob_x[p] = net_x + BV.NET_RADIUS + br - over
				if fast and blob_vx[p] < 0.0:
					_bonk(p, out)
			if blob_x[p] > right_plane + outer:
				blob_x[p] = right_plane + outer
				if walls and fast and blob_vx[p] > 0.0:
					_bonk(p, out)

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

func serve_x(s: int) -> float:
	var p := lead(s)
	if int(P.per_side[s]) > 1:
		return net_x * (0.5 if s == BV.LEFT else 1.5)
	return blob_x[p] if absf(blob_x[p] - net_x * (0.5 if s == BV.LEFT else 1.5)) < net_x * 0.35 \
		else net_x * (0.5 if s == BV.LEFT else 1.5)

func reset_ball(s: int) -> void:
	if s == BV.LEFT:
		ball_x = net_x * 0.5
		ball_y = BV.STANDARD_BALL_HEIGHT
	elif s == BV.RIGHT:
		ball_x = net_x * 1.5
		ball_y = BV.STANDARD_BALL_HEIGHT
	else:
		ball_x = net_x
		ball_y = 450.0
	ball_vx = 0.0
	ball_vy = 0.0
	ball_ang_vel = (-1.0 if s == BV.RIGHT else 1.0) * BV.STANDARD_BALL_ANGULAR_VELOCITY
	super_frames = 0
	super_owner = -1
	parry_chain = 0
	ball_out = 0
	hot = 0
	hot_by = -1
	vol_n = 0
	vol_owner = -1
	vol_parried = 0
	for i in BV.MAX_EX:
		ex_on[i] = 0
		ex_wait[i] = 0
	for a in [parry_active, parry_cd, hold, stun, dig_active, dig_cd, dive_frames,
			dive_recover, dive_cd, smash_cd, spin_t, spin_cd, hit_cd, knocked]:
		a.fill(0)
	ball_spin = 0.0
	tempo = 1.0

func save(f: PackedFloat64Array, i: PackedInt32Array) -> int:
	var k := 0
	for a in [blob_x, blob_y, blob_vx, blob_vy, blob_state, anim_speed, charge, knock, crouch, bs]:
		for p in nb:
			f[k] = a[p]
			k += 1
	f[k] = ball_x; f[k + 1] = ball_y; f[k + 2] = ball_vx; f[k + 3] = ball_vy
	f[k + 4] = ball_rot; f[k + 5] = ball_ang_vel; f[k + 6] = tempo; f[k + 7] = ball_spin
	k += 8
	for a in [ex_x, ex_y, ex_vx, ex_vy, ex_rot]:
		for e in BV.MAX_EX:
			f[k] = a[e]
			k += 1
	f[k] = vol_nx; f[k + 1] = vol_ny
	var j := 0
	for a in _int_arrays():
		for p in nb:
			i[j] = a[p]
			j += 1
	for a in [ex_on, ex_wait]:
		for e in BV.MAX_EX:
			i[j] = a[e]
			j += 1
	i[j] = super_frames; i[j + 1] = super_owner; i[j + 2] = parry_chain; i[j + 3] = ball_out
	i[j + 4] = hot; i[j + 5] = hot_by; i[j + 6] = vol_n; i[j + 7] = vol_owner
	return j + 8

func restore(f: PackedFloat64Array, i: PackedInt32Array) -> int:
	var k := 0
	for a in [blob_x, blob_y, blob_vx, blob_vy, blob_state, anim_speed, charge, knock, crouch, bs]:
		for p in nb:
			a[p] = f[k]
			k += 1
	ball_x = f[k]; ball_y = f[k + 1]; ball_vx = f[k + 2]; ball_vy = f[k + 3]
	ball_rot = f[k + 4]; ball_ang_vel = f[k + 5]; tempo = f[k + 6]; ball_spin = f[k + 7]
	k += 8
	for a in [ex_x, ex_y, ex_vx, ex_vy, ex_rot]:
		for e in BV.MAX_EX:
			a[e] = f[k]
			k += 1
	vol_nx = f[k]; vol_ny = f[k + 1]
	var j := 0
	for a in _int_arrays():
		for p in nb:
			a[p] = i[j]
			j += 1
	for a in [ex_on, ex_wait]:
		for e in BV.MAX_EX:
			a[e] = i[j]
			j += 1
	super_frames = i[j]; super_owner = i[j + 1]; parry_chain = i[j + 2]; ball_out = i[j + 3]
	hot = i[j + 4]; hot_by = i[j + 5]; vol_n = i[j + 6]; vol_owner = i[j + 7]
	return j + 8

func _int_arrays() -> Array:
	return [stun, prev_up, prev_special, dive_frames, dive_dir, dive_cd, dive_recover,
		dive_wind, dizzy, block_t, block_cd, hang, prev_jump, parry_active, parry_cd,
		hold, prev_down, prev_dive, dig_cd, dig_active, smash_cd, spin_t, spin_cd,
		hit_cd, knocked]
