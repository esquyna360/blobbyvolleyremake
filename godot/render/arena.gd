class_name Arena
extends Node3D

## O palco. Mantém a câmera, o cenário e a reação visual a cada evento da
## partida. A simulação roda a 60Hz fixos; aqui tudo é interpolado por `alpha`.

const CAM_FOV := 27.5
const CAM_FOV_MIN := 26.7
const CAM_Z := 28.2
const CAM_Z_MAX := 56.0
const CAM_TOP_MIN := 11.8
const CAM_TOP_PAD := 2.2
const CAM_MARGIN := 1.4
const CAM_LOOK := 0.14
const CAM_EYE_Y := 7.6
const CAM_LOOK_Y := 3.3
const OPEN_HALF := BV.OPEN_MARGIN * Map.S

const EMOJI := ["laugh", "cry", "rage", "finger", "taunt"]
const EMOJI_COLOR := [
	Color(1.0, 0.82, 0.34), Color(0.44, 0.79, 1.0), Color(1.0, 0.42, 0.24),
	Color(1.0, 0.37, 0.82), Color(0.62, 1.0, 0.56),
]

var quality := 2
var camera := Camera3D.new()
var stage := Stage.new()
var court := Court.new()
var ball: BallView
var fx := Fx.new()
var blobs: Array[BlobView] = []

var solo := false
var local_side := BV.LEFT
var walls_on := true
var time := 0.0
var tension := 0.0
var trauma := 0.0
var hitstop := 0.0
var aberration := 0.0
var flash := 0.0
var ball_speed := 0.0

var _cam_target_x := 0.0
var _cam_z := CAM_Z
var _cam_span := 0.0
var _cam_top := CAM_TOP_MIN
var _open_extra := 0.0
var _shake_seed := 0.0
var _squash_k := 0.0
var _squash_ang := 0.0
var _gib := PackedInt32Array([0, 0])
var _reach: Array[MeshInstance3D] = []
var _shadow: Array[MeshInstance3D] = []
var _reach_a := PackedFloat32Array([0.0, 0.0])
var _post: ColorRect
var _post_mat := ShaderMaterial.new()
var _emotes: Array = []
var _scorches: Array = []
var _emoji_tex := {}

# instantâneos pra interpolação
var _pbx := 0.0
var _pby := 0.0
var _pbrot := 0.0
var _ppx := PackedFloat64Array([0, 0])
var _ppy := PackedFloat64Array([0, 0])
var _pst := PackedFloat64Array([0, 0])
var _cbx := 0.0
var _cby := 0.0
var _cbrot := 0.0
var _cpx := PackedFloat64Array([0, 0])
var _cpy := PackedFloat64Array([0, 0])
var _cst := PackedFloat64Array([0, 0])

func build(q: int) -> void:
	quality = q
	_shake_seed = randf() * 100.0

	camera.fov = CAM_FOV
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.near = 0.1
	camera.far = 600.0
	camera.position = Vector3(0, CAM_EYE_Y, CAM_Z)
	camera.current = true
	add_child(camera)

	add_child(stage)
	stage.set_camera(camera)
	stage.build(q)
	add_child(court)
	court.build(q)

	fx.quality = 1.0 if q >= 3 else (0.7 if q == 2 else 0.35)
	add_child(fx)

	ball = BallView.new(true)
	add_child(ball)

	for i in 2:
		var b := BlobView.new(i, true)
		blobs.append(b)
		add_child(b)
		var m := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(1, 1)
		m.mesh = qm
		var rm := ShaderMaterial.new()
		rm.shader = load("res://render/ring.gdshader")
		rm.set_shader_parameter("tint", Color(1.0, 0.78, 0.28))
		rm.set_shader_parameter("alpha", 1.0)
		rm.set_shader_parameter("fade", 0.0)
		m.material_override = rm
		var r := BV.SPECIAL_REACH * Map.S * 2.0
		m.scale = Vector3(r, r, 1)
		m.visible = false
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(m)
		_reach.append(m)
		_shadow.append(_make_shadow())
	_shadow.append(_make_shadow())

	if q >= 2:
		_post_mat.shader = load("res://render/post.gdshader")
		_post = ColorRect.new()
		_post.set_anchors_preset(Control.PRESET_FULL_RECT)
		_post.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_post.material = _post_mat
		var layer := CanvasLayer.new()
		layer.layer = 1
		layer.add_child(_post)
		add_child(layer)

## Sombra de contato pintada. A sombra da direcional some no ambiente forte da
## clareira, e sem mancha embaixo o blob parece flutuar.
func _make_shadow() -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	mi.mesh = qm
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load("res://assets/stage/puff.png")
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.02, 0.05, 0.03, 0.5)
	mat.disable_fog = true
	mi.material_override = mat
	mi.rotation_degrees = Vector3(-90, 0, 0)
	mi.position = Vector3(0, 0.02, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _blob_shadow(mi: MeshInstance3D, x: float, y: float, base: float) -> void:
	var k := clampf(1.0 - y / 11.0, 0.15, 1.0)
	var s: float = base * (1.0 + (1.0 - k) * 1.5)
	mi.scale = Vector3(s, s * 0.62, 1)
	mi.position = Vector3(x, 0.02, 0.35)
	var mat: StandardMaterial3D = mi.material_override
	mat.albedo_color = Color(0.02, 0.05, 0.03, 0.62 * k * k)


func set_looks(left: Array, right: Array) -> void:
	blobs[0].set_look(left)
	blobs[1].set_look(right)

func set_solo(on: bool) -> void:
	solo = on

func set_walls(on: bool) -> void:
	walls_on = on

## Guarda o estado da simulação pra interpolar. Chamar logo após cada passo fixo.
func capture(m: BVMatch) -> void:
	var w := m.world
	_pbx = _cbx; _pby = _cby; _pbrot = _cbrot
	_ppx[0] = _cpx[0]; _ppx[1] = _cpx[1]
	_ppy[0] = _cpy[0]; _ppy[1] = _cpy[1]
	_pst[0] = _cst[0]; _pst[1] = _cst[1]

	_cbx = w.ball_x
	_cby = w.ball_y
	if absf(w.ball_rot - _pbrot) > 3.5:
		_pbrot = w.ball_rot
	_cbrot = w.ball_rot
	_cpx[0] = w.blob_x[0]; _cpx[1] = w.blob_x[1]
	_cpy[0] = w.blob_y[0]; _cpy[1] = w.blob_y[1]
	_cst[0] = w.blob_state[0]; _cst[1] = w.blob_state[1]
	ball_speed = sqrt(w.ball_vx * w.ball_vx + w.ball_vy * w.ball_vy)

func on_events(m: BVMatch) -> void:
	var w := m.world
	var ev := m.events
	FaceRig.apply_events([blobs[0].face, blobs[1].face], ev,
		m.logic.scores, m.logic.score_to_win)
	for k in ev.n:
		_react(w, ev.kind[k], ev.side[k], ev.intensity[k])
	Aud.step_world(w)
	Aud.set_rally(m.logic.rally, w.match_point)

func _react(w: PhysicWorld, kind: int, side: int, intensity: float) -> void:
	Aud.on_event(kind, side, intensity, w, local_side)
	match kind:
		Ev.BALL_HIT_BLOB:
			var p := side
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			var inten := 0.35 + intensity * 0.65
			trauma = minf(1.0, trauma + 0.20 * inten)
			hitstop = maxf(hitstop, 0.035 * inten)
			aberration = maxf(aberration, 0.5 * inten)
			flash = maxf(flash, 0.035 * inten)
			fx.burst(Vector3(bx, by, 0), int(90 + 170 * inten), 3.2 + 5.5 * inten,
				1.5, 0.5, 0.75, 0.022, blobs[p].body_color, 2.4, 0.3)
			fx.burst(Vector3(bx, by, 0), 40, 6.0 + 8.0 * inten, 1.9, 0.2, 0.32,
				0.05, Color(1.0, 0.96, 0.85), 4.0)
			blobs[p].kick(minf(1.4, blobs[p].wobble + 0.9 * inten), 1.6 * inten)
			blobs[p].mouth = 1.0
			blobs[p].flash = 0.5 * inten
			ball.flash(1.4 * inten)
			_squash_ball(w, 0.10 + 0.07 * inten)

		Ev.BALL_HIT_GROUND:
			var bx := Map.gx(w.ball_x)
			var power := minf(1.0, absf(w.ball_vy) / 16.0)
			trauma = minf(1.0, trauma + 0.30 * power + 0.08)
			fx.burst(Vector3(bx, 0.05, 0), int(260 + 500 * power), 2.6 + 6.5 * power,
				2.2, 1.25, 1.5, 0.019, Color(0.80, 0.68, 0.50), 1.5, 0.22, false)
			fx.burst(Vector3(bx, 0.05, 0), 120, 1.2 + 2.0 * power, 3.4, 0.25, 2.4,
				0.075, Color(0.86, 0.78, 0.63), 3.4, 0.1, false)

		Ev.BALL_HIT_NET, Ev.BALL_HIT_NET_TOP:
			var by := Map.gy(w.ball_y)
			court.hit(by, 0.0)
			trauma = minf(1.0, trauma + 0.10)
			fx.burst(Vector3(Map.gx(w.ball_x), by, 0), 40, 2.2, 1.4, 0.6, 0.6,
				0.02, Color(0.7, 0.75, 0.85), 3.0)

		Ev.BALL_HIT_WALL:
			_squash_ball(w, 0.12)
			trauma = minf(1.0, trauma + 0.12)
			fx.burst(Vector3(Map.gx(w.ball_x), Map.gy(w.ball_y), 0), 60, 3.5, 0.6,
				0.4, 0.55, 0.03, Color(0.5, 0.85, 1.0), 3.2)

		Ev.PLAYER_ERROR:
			trauma = minf(1.0, trauma + 0.35)
			flash = maxf(flash, 0.06)

		Ev.SPECIAL_READY:
			var p := side
			fx.burst(Vector3(Map.gx(w.blob_x[p]), Map.gy(w.blob_y[p]), 0), 90, 2.2,
				0.5, 1.8, 1.1, 0.03, Color(1.0, 0.82, 0.34), 1.6, 0.2)

		Ev.SPECIAL_FIRED:
			var p := side
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			trauma = minf(1.0, trauma + 0.75)
			hitstop = maxf(hitstop, 0.11)
			aberration = maxf(aberration, 2.2)
			flash = maxf(flash, 0.30)
			fx.burst(Vector3(bx, by, 0), 520, 15.0, PI, 0.2, 0.85, 0.05,
				blobs[p].body_color, 2.0, 0.35)
			fx.burst(Vector3(bx, by, 0), 260, 24.0, 0.55, 0.1, 0.45, 0.075,
				Color(1.0, 0.95, 0.7), 3.0)
			fx.burst(Vector3(bx, by, 0), 140, 5.0, PI, 1.4, 1.5, 0.035,
				Color(1.0, 0.76, 0.2), 1.1, 0.25)
			ball.flash(4.5)
			blobs[p].kick(1.6, 3.4)
			blobs[p].mouth = 1.0
			blobs[p].flash = 1.0

		Ev.SPECIAL_GROUND:
			var bx := Map.gx(w.ball_x)
			trauma = 1.0
			hitstop = maxf(hitstop, 0.14)
			aberration = maxf(aberration, 3.4)
			flash = maxf(flash, 0.42)
			_scorch(bx)
			fx.burst(Vector3(bx, 0.1, 0), 520, 16.0, 1.5, 2.4, 1.1, 0.06,
				Color(1.0, 0.48, 0.08), 1.9, 0.4)
			fx.burst(Vector3(bx, 0.1, 0), 240, 6.0, PI, 3.2, 2.2, 0.08,
				Color(0.18, 0.14, 0.12), 1.0, 0.2, false)
			fx.burst(Vector3(bx, 0.1, 0), 180, 26.0, 0.35, 0.2, 0.5, 0.05,
				Color(1.0, 0.95, 0.72), 3.2)

		Ev.DIVE:
			var p := side
			var d: float = w.dive_dir[p] if w.dive_dir[p] != 0.0 else 1.0
			var px := Map.gx(w.blob_x[p])
			trauma = minf(1.0, trauma + 0.09)
			fx.burst(Vector3(px - d * 0.3, 0.06, 0), 160, 4.6, 1.5, 1.4, 1.0,
				0.02, Color(0.84, 0.72, 0.53), 2.2, 0.22, false)
			blobs[p].squash_vel -= 1.6

		Ev.DIVE_HIT:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			trauma = minf(1.0, trauma + 0.2)
			hitstop = maxf(hitstop, 0.045)
			fx.shock(Vector3(bx, by, 0.2), 0.1, BV.BALL_RADIUS * Map.S * 4.44, 0.34,
				Color(1.4, 1.3, 1.0))
			fx.burst(Vector3(bx, by, 0), 90, 7.5, 2.4, 1.0, 0.5, 0.03,
				Color(1.2, 1.1, 0.85), 3.0, 0.2)
			fx.burst(Vector3(px, 0.06, 0), 140, 3.6, 2.2, 1.2, 1.2, 0.022,
				Color(0.82, 0.70, 0.5), 2.0, 0.25, false)
			ball.flash(1.4)
			_squash_ball(w, 0.24)
			blobs[p].wobble = 1.0

		Ev.APEX_HIT:
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			fx.shock(Vector3(bx, by, 0.2), 0.05, 110.0 * Map.S, 0.26,
				Color(1.5, 1.35, 0.7), 0.7)
			fx.burst(Vector3(bx, by, 0), 34, 5.5, 2.0, 0.5, 0.3, 0.026,
				Color(1.4, 1.25, 0.7), 3.4)
			ball.flash(1.1)

		Ev.SPECIAL_WASTED:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p] - BV.BLOBBY_UPPER_SPHERE)
			trauma = minf(1.0, trauma + 0.14)
			fx.shock(Vector3(px, py, 0.2), 0.2, BV.SPECIAL_REACH * Map.S * 1.1, 0.42,
				Color(1.2, 0.65, 0.2))
			fx.burst(Vector3(px, py, 0), 90, 3.4, PI, 1.6, 0.9, 0.03,
				Color(0.85, 0.66, 0.28), 2.0, 0.3)
			blobs[p].kick(1.1, 1.4)

		Ev.RESET_BALL:
			_gib[0] = 0
			_gib[1] = 0

		Ev.PARRY_TRY:
			var p := side
			fx.burst(Vector3(Map.gx(w.blob_x[p]), Map.gy(w.blob_y[p]) + 1.3, 0), 22,
				2.6, PI, 0.8, 0.3, 0.026, Color(0.42, 0.78, 1.0), 3.6)

		Ev.PARRY:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p]) + 1.3
			trauma = minf(1.0, trauma + 0.5)
			hitstop = maxf(hitstop, 0.09)
			aberration = maxf(aberration, 2.6)
			flash = maxf(flash, 0.34)
			fx.shock(Vector3(px, py, 0.2), 0.5, 8.0, 0.5, Color(0.1, 0.85, 1.8))
			fx.shock(Vector3(px, py, 0.2), 0.4, 4.2, 0.24, Color(1.1, 1.4, 1.6))
			fx.burst(Vector3(px, py, 0), 200, 13.0, PI, 0.4, 0.7, 0.05,
				Color(0.36, 0.84, 1.0), 2.2, 0.3)
			fx.burst(Vector3(px, py, 0), 110, 22.0, 0.5, 0.1, 0.4, 0.062,
				Color(0.85, 0.98, 1.0), 3.2)
			ball.flash(3.6)
			blobs[p].kick(1.5, 3.0)
			blobs[p].flash = 1.0

		Ev.DIG:
			var p := side
			var dir := 1.0 if p == BV.LEFT else -1.0
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p] + BV.BLOBBY_LOWER_SPHERE)
			trauma = minf(1.0, trauma + 0.12)
			fx.shock(Vector3(px + dir * 0.5, py, 0.2), 0.3, 2.6, 0.3,
				Color(0.82, 0.94, 1.2))
			fx.burst(Vector3(px + dir * 0.4, 0.05, 0), 90, 3.4, 1.6, 0.9, 0.8,
				0.018, Color(0.84, 0.74, 0.56), 2.6, 0.2, false)
			fx.burst(Vector3(Map.gx(w.ball_x), Map.gy(w.ball_y), 0), 40, 4.2, 2.4,
				0.5, 0.45, 0.03, Color(0.9, 0.96, 1.1), 3.2)
			blobs[p].kick(0.8, 1.2)
			ball.flash(1.0)

		Ev.BALL_OUT:
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			trauma = minf(1.0, trauma + 0.08)
			fx.shock(Vector3(bx, by, 0.2), 0.3, 2.6, 0.4, Color(1.2, 0.5, 0.5))
			fx.burst(Vector3(bx, by, 0), 40, 4.5, 1.4, 0.4, 0.6, 0.03,
				Color(1.3, 0.6, 0.55), 3.0)

		Ev.FATALITY:
			var o := BV.other(side)
			var bx := Map.gx(w.blob_x[o])
			var by := Map.gy(w.blob_y[o])
			trauma = 1.0
			hitstop = maxf(hitstop, 0.3)
			aberration = maxf(aberration, 5.0)
			flash = maxf(flash, 0.75)
			_scorch(bx)
			for i in 3:
				fx.burst(Vector3(bx, by + 1.0 + i * 0.5, 0), 460, 13.0 + i * 5.0, PI,
					1.1, 2.4, 0.075, Color(0.62 - i * 0.12, 0.03, 0.03), 0.8, 0.3, false)
			fx.burst(Vector3(bx, by + 1.2, 0), 220, 5.0, PI, 2.2, 2.8, 0.05,
				Color(0.9, 0.75, 0.75), 1.2, 0.25, false)
			for i in 3:
				fx.burst(Vector3(bx, by + 0.6 + i * 0.6, 0), 300, 10.0 + i * 6.0, PI,
					1.4, 2.2, 0.11 - i * 0.02, blobs[o].body_color, 0.9, 0.45, false)
			fx.burst(Vector3(bx, by + 1.0, 0), 160, 24.0, 0.9, 0.3, 0.5, 0.07,
				Color(1.0, 0.94, 0.86), 3.0)
			blobs[o].kick(3.0, 7.0)
			blobs[o].mouth = 1.0
			blobs[o].flash = 1.0
			_gib[o] = 1

		Ev.SPECIAL_HIT:
			var p := side
			var bx := Map.gx(w.blob_x[p])
			var by := Map.gy(w.blob_y[p])
			trauma = minf(1.0, trauma + 0.95)
			hitstop = maxf(hitstop, 0.16)
			aberration = maxf(aberration, 3.0)
			flash = maxf(flash, 0.42)
			fx.burst(Vector3(bx, by, 0), 460, 17.0, PI, 0.6, 1.0, 0.055,
				Color(1.0, 0.35, 0.3), 2.2, 0.4)
			fx.burst(Vector3(bx, by, 0), 200, 7.0, PI, 1.9, 1.8, 0.04,
				Color(1.0, 0.92, 0.55), 1.0, 0.3)
			blobs[p].kick(2.2, 5.0)
			blobs[p].mouth = 1.0
			blobs[p].flash = 1.0

## A arena aberta não cabe no enquadramento fixo: afasta a câmera até as duas
## paredes entrarem. O que sobrar de folga é o quanto ela ainda anda de lado.
func _fit_arena(aspect: float) -> void:
	var need := Map.court_half_w() * (1.0 + CAM_LOOK) + CAM_MARGIN + _open_extra
	var vt := tan(CAM_FOV_MIN * PI / 360.0)
	var ht := vt * maxf(0.5, aspect)
	# a bola alta puxa a câmera pra trás em vez de sair pelo teto da tela
	var zv := (_cam_top - CAM_LOOK_Y) / vt
	_cam_z = minf(CAM_Z_MAX, maxf(maxf(CAM_Z, need / ht), zv))
	_cam_span = maxf(0.0, _cam_z * ht - need)

func render(m: BVMatch, alpha: float, dt: float) -> void:
	time += dt
	tension += (FaceRig.rally_tension(m.logic.rally) - tension) * minf(1.0, dt * 2.2)
	Aud.set_tension(tension)

	if hitstop > 0.0:
		hitstop -= dt
		alpha = 0.0

	var bx := Map.gx(lerpf(_pbx, _cbx, alpha))
	var by := Map.gy(lerpf(_pby, _cby, alpha))
	var brot := lerpf(_pbrot, _cbrot, alpha)

	var w := m.world
	var vs := get_viewport().get_visible_rect().size
	var aspect := maxf(0.35, vs.x / maxf(1.0, vs.y))

	var far := 0.0
	if not walls_on:
		far = maxf(absf(Map.gx(w.ball_x)),
			maxf(absf(Map.gx(w.blob_x[BV.LEFT])), absf(Map.gx(w.blob_x[BV.RIGHT])))) \
			- Map.court_half_w()
	var want_open := maxf(0.0, minf(OPEN_HALF, far + 0.5))
	var open_rate := 5.5 if want_open > _open_extra else 1.4
	_open_extra += (want_open - _open_extra) * (1.0 - exp(-dt * open_rate))
	var want_top := maxf(CAM_TOP_MIN, by + CAM_TOP_PAD)
	_cam_top += (want_top - _cam_top) * (1.0 - exp(-dt * (7.0 if want_top > _cam_top else 1.1)))
	_fit_arena(aspect)

	_cam_target_x = lerpf(_cam_target_x, bx * 0.30, 1.0 - exp(-dt * 3.2))
	var sway := sin(time * 0.31) * 0.20 + sin(time * 0.17) * 0.11
	var sway_y := sin(time * 0.23 + 1.7) * 0.10

	trauma = maxf(0.0, trauma - dt * 1.5)
	var sh := trauma * trauma
	var t := time * 34.0 + _shake_seed
	var shx := (sin(t) + sin(t * 2.3)) * 0.5 * sh * 0.38
	var shy := (sin(t * 1.7 + 2.0) + sin(t * 3.1)) * 0.5 * sh * 0.30
	var shr := sin(t * 1.3) * sh * 0.022

	var px := clampf(_cam_target_x, -_cam_span, _cam_span)
	camera.position = Vector3(px + sway + shx, CAM_EYE_Y + sway_y + shy,
		_cam_z - trauma * 0.5)
	camera.look_at(Vector3(bx * CAM_LOOK, CAM_LOOK_Y + by * 0.07, 0.0), Vector3.UP)
	camera.rotate_object_local(Vector3.FORWARD, shr)
	camera.fov = CAM_FOV - minf(ball_speed, 22.0) * 0.036

	ball.update(bx, by, brot, sin(time * 0.7) * 0.25, dt)
	_blob_shadow(_shadow[2], bx, by, 1.5)
	if w.super_frames > 0:
		var col := blobs[w.super_owner].body_color if w.super_owner >= 0 \
			else Color(1.0, 0.7, 0.2)
		ball.flash(3.4 + sin(time * 30.0) * 0.8)
		fx.burst(Vector3(bx, by, 0), 13, 2.2, PI, 1.5, 0.55, 0.085,
			Color(1.0, 0.42, 0.05), 2.6, 0.3)
		fx.burst(Vector3(bx, by, 0), 5, 0.6, PI, 2.1, 1.4, 0.055,
			Color(0.16, 0.13, 0.12), 1.4, 0.15, false)
		fx.burst(Vector3(bx, by, 0), 3, 0.9, PI, 0.8, 0.7, 0.04, col, 2.0, 0.3)

	_squash_k = maxf(0.0, _squash_k - dt * 0.85)
	ball.squash(_squash_k, _squash_ang)

	FaceRig.crouch_moods([blobs[0].face, blobs[1].face], w.crouch)
	FaceRig.reach_moods([blobs[0].face, blobs[1].face], w, m.logic.is_ball_valid)
	_update_blob(BV.LEFT, alpha, dt, w, bx, by)
	_update_blob(BV.RIGHT, alpha, dt, w, bx, by)
	_update_reach(w, alpha, dt)

	court.step(dt)
	stage.step(dt)
	fx.step(dt)
	_update_emotes(dt)
	_update_scorches(dt)

	flash = maxf(0.0, flash - dt * 2.2)
	aberration = maxf(0.0, aberration - dt * 3.0)
	if _post != null:
		_post_mat.set_shader_parameter("flash", flash)
		_post_mat.set_shader_parameter("aberration", aberration)

func _update_blob(i: int, alpha: float, dt: float, w: PhysicWorld,
		bx: float, by: float) -> void:
	var b := blobs[i]
	if _gib[i] > 0 or (solo and i == BV.RIGHT):
		b.visible = false
		_reach[i].visible = false
		_shadow[i].visible = false
		return
	_shadow[i].visible = true
	b.visible = true

	var gxp := lerpf(_ppx[i], _cpx[i], alpha)
	var gyp := lerpf(_ppy[i], _cpy[i], alpha)
	var st := lerpf(_pst[i], _cst[i], alpha)
	var wx := Map.gx(gxp)
	var grounded := w.blob_y[i] >= BV.GROUND_PLANE_HEIGHT - 0.001

	# pouso e impulso levantam areia; ler o estado antes do update, que o zera
	if grounded and not b.was_grounded:
		var impact := minf(1.0, absf(b.last_vy) / 16.0)
		b.squash_vel -= 2.6 * impact
		b.wobble = minf(1.5, b.wobble + impact)
		if impact > 0.15:
			fx.burst(Vector3(wx, 0.04, 0), int(50 + 220 * impact),
				1.6 + 3.4 * impact, 2.6, 0.7, 1.1, 0.017,
				Color(0.80, 0.69, 0.52), 2.0, 0.2, false)
			trauma = minf(1.0, trauma + 0.09 * impact)
	elif not grounded and b.was_grounded:
		fx.burst(Vector3(wx, 0.05, 0), 70, 1.8, 2.4, 0.55, 0.9, 0.016,
			Color(0.82, 0.71, 0.54), 2.4, 0.0, false)

	b.update(w, gxp, gyp, st, bx, by, time, dt, tension)
	_blob_shadow(_shadow[i], wx, Map.gy(gyp), 3.2)

	# areia do mergulho: no ar é rastro, no chão é arrasto
	if b.dive > 0.01 and randf() < dt * 60.0:
		var air := w.dive_frames[i] > 0
		var wy := Map.gy(gyp)
		fx.burst(Vector3(wx - w.dive_dir[i] * 0.45,
			maxf(0.06, wy * 0.35) if air else 0.05, (randf() - 0.5) * 0.5),
			8, 2.2 if air else 1.2, 1.8, 0.5 if air else 1.0, 0.85, 0.019,
			Color(0.84, 0.72, 0.53), 2.4, 0.2, false)

	if w.stun[i] > 0 and randf() < dt * 30.0:
		var a := time * 3.4 + randf() * TAU
		fx.burst(Vector3(wx + cos(a) * 0.8, Map.gy(gyp) + 1.4 + sin(a * 2.0) * 0.14,
			sin(a) * 0.55), 6, 0.3, 1.2, 0.5, 0.8, 0.05,
			Color(1.0, 0.88, 0.32), 1.2)

## Anel dourado do especial pronto. Some quando não dá pra usar.
func _update_reach(w: PhysicWorld, alpha: float, dt: float) -> void:
	for i in 2:
		var m := _reach[i]
		var hidden := _gib[i] > 0 or w.stun[i] > 0 or (solo and i == BV.RIGHT)
		var on := not hidden and w.charge[i] >= BV.SPECIAL_FULL
		var want := (0.34 + sin(time * 2.6) * 0.07) if on else 0.0
		_reach_a[i] += (want - _reach_a[i]) * minf(1.0, dt * 9.0)
		m.visible = _reach_a[i] > 0.004
		if not m.visible:
			continue
		var mat: ShaderMaterial = m.material_override
		mat.set_shader_parameter("fade", _reach_a[i])
		m.position = Vector3(
			Map.gx(lerpf(_ppx[i], _cpx[i], alpha)),
			Map.gy(lerpf(_ppy[i], _cpy[i], alpha) - BV.BLOBBY_UPPER_SPHERE), 0.0)

func _squash_ball(w: PhysicWorld, k: float) -> void:
	var v := sqrt(w.ball_vx * w.ball_vx + w.ball_vy * w.ball_vy)
	_squash_ang = atan2(-w.ball_vy, w.ball_vx) if v > 0.001 else 0.0
	_squash_k = maxf(_squash_k, k)

func emote(side: int, id: int) -> void:
	var key: String = EMOJI[clampi(id, 0, EMOJI.size() - 1)]
	if not _emoji_tex.has(key):
		_emoji_tex[key] = load("res://assets/emoji/%s.png" % key)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = _emoji_tex[key]
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.no_depth_test = true
	mat.render_priority = 15
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var mi := MeshInstance3D.new()
	mi.mesh = q
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var base := blobs[side].position
	mi.position = Vector3(base.x, base.y + 1.5, 0.9)
	mi.scale = Vector3.ONE * 0.05
	add_child(mi)
	_emotes.append({"n": mi, "life": 0.0, "max": 1.9, "spin": (randf() - 0.5) * 1.4})

	var col: Color = EMOJI_COLOR[clampi(id, 0, EMOJI_COLOR.size() - 1)]
	fx.burst(Vector3(base.x, base.y + 1.1, 0.4), 220 if id == 1 else 90,
		4.2 if id == 1 else 2.0, PI, -0.5 if id == 0 else 1.0,
		2.4 if id == 1 else 1.2, 0.05, col, 1.5, 0.6 if id == 1 else 0.2)
	blobs[side].kick(1.0, 3.0 if id == 1 else 1.6)

func _update_emotes(dt: float) -> void:
	if _emotes.is_empty():
		return
	var keep := []
	for e in _emotes:
		e.life += dt
		var u: float = e.life / e.max
		if u >= 1.0:
			e.n.queue_free()
			continue
		var pop: float = u / 0.16 if u < 0.16 else 1.0
		var ease := 1.0 - pow(1.0 - pop, 3.0)
		var s: float = 1.5 * ease * (1.0 + sin(time * 11.0 + e.spin) * 0.05)
		e.n.scale = Vector3.ONE * s
		e.n.position.y += dt * 0.55
		e.n.position.x += sin(time * 3.0 + e.spin * 4.0) * dt * 0.25
		e.n.rotation.z = sin(time * 5.0 + e.spin * 3.0) * 0.18
		var mat: StandardMaterial3D = e.n.material_override
		var a: float = 1.0 - (u - 0.72) / 0.28 if u > 0.72 else 1.0
		mat.albedo_color = Color(1, 1, 1, a)
		keep.append(e)
	_emotes = keep

func celebrate(side: int) -> void:
	blobs[side].face.set_mood("laugh", 6.0, 9)
	blobs[BV.other(side)].face.set_mood("sad", 6.0, 9)
	var x := -Map.court_half_w() * 0.5 if side == BV.LEFT else Map.court_half_w() * 0.5
	for k in 3:
		fx.burst(Vector3(x + (randf() - 0.5) * 6.0, 3.0 + randf() * 4.0,
			-2.0 + randf() * 4.0), 300, 5.0 + randf() * 4.0, 1.6, 1.1, 3.2, 0.05,
			Color.from_hsv(randf(), 0.85, 0.6), 1.1, 0.5)
	trauma = minf(1.0, trauma + 0.4)

## Mancha de queimado no chão depois do especial e da fatality.
func _scorch(x: float) -> void:
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var mi := MeshInstance3D.new()
	mi.mesh = q
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = _scorch_tex()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(1, 1, 1, 0.95)
	mi.mesh = q
	mi.material_override = mat
	mi.rotation_degrees = Vector3(-90, 0, 0)
	mi.position = Vector3(x, 0.03, 0)
	mi.scale = Vector3.ONE * (3.4 + randf() * 0.8)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	_scorches.append({"n": mi, "life": 0.0})
	if _scorches.size() > 5:
		var old = _scorches.pop_front()
		old.n.queue_free()

func _update_scorches(dt: float) -> void:
	if _scorches.is_empty():
		return
	var keep := []
	for s in _scorches:
		s.life += dt
		if s.life > 16.0:
			s.n.queue_free()
			continue
		var mat: StandardMaterial3D = s.n.material_override
		mat.albedo_color = Color(1, 1, 1, 0.95 * maxf(0.0, 1.0 - s.life / 16.0))
		keep.append(s)
	_scorches = keep

static var _scorch_cache: ImageTexture

static func _scorch_tex() -> ImageTexture:
	if _scorch_cache != null:
		return _scorch_cache
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for y in n:
		for x in n:
			var u := (float(x) / n - 0.5) * 2.0
			var v := (float(y) / n - 0.5) * 2.0
			var d := sqrt(u * u + v * v)
			var edge := 0.62 + 0.22 * sin(atan2(v, u) * 5.0) + rng.randf() * 0.10
			var a := clampf(1.0 - d / edge, 0.0, 1.0)
			a = pow(a, 1.7)
			img.set_pixel(x, y, Color(0.05, 0.04, 0.035, a))
	_scorch_cache = ImageTexture.create_from_image(img)
	return _scorch_cache
