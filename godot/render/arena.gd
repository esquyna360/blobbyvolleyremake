class_name Arena
extends Node3D

## O palco. Mantém a câmera, o cenário e a reação visual a cada evento da
## partida. A simulação roda a 60Hz fixos; aqui tudo é interpolado por `alpha`.

const CAM_FOV := 26.0
const CAM_Z := 12.8
const CAM_Z_MAX := 32.0
const CAM_TOP_MIN := 5.1
const CAM_TOP_PAD := 0.9
const CAM_TOP_MAX := 9.2
const CAM_BALL_TOP := 8.0
const CAM_BOTTOM := 0.55
const CAM_MARGIN := 1.6
const CAM_LOOK := 0.34
const CAM_EYE_Y := 3.3
const CAM_LOOK_Y := 2.3
const CAM_NEED := 1.0
const CAM_BOX_PAD := 1.35
const CAM_SIDE := 1.0
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
var _aura: Array[MeshInstance3D] = []
var _stars: Array = []
var outro_t := -1.0
var _outro_winner := 0
const OUTRO_LEN := 4.6
var ball_speed := 0.0

var _cam_target_x := 0.0
var _cam_z := CAM_Z
var _cam_span := 0.0
var _cam_top := CAM_TOP_MIN
var _cam_ly := CAM_LOOK_Y
var _last_scores := PackedInt32Array([0, 0])
var _pt_t := 0.0
var _pt_x := 0.0
var _rec_t := 0.0
var _rec_base := 0
var _rec_fired := false
const PT_HOLD := 1.3
const REC_HOLD := 1.2
const RALLY_MIN := 6
var intro_t := -1.0
const INTRO_LEN := 5.6

func start_intro() -> void:
	intro_t = 0.0
	for i in blobs.size():
		blobs[i].face.set_mood("smug" if blobs[i].side == 0 else "focus", 2.0, 3)

func lead_blob(side: int) -> BlobView:
	return blobs[_lead[side]] if blobs.size() > 0 else null

func skip_intro() -> void:
	if intro_t >= 0.0:
		intro_t = INTRO_LEN - 0.35

func intro_active() -> bool:
	return intro_t >= 0.0

func intro_phase() -> float:
	return clampf(intro_t / INTRO_LEN, 0.0, 1.0) if intro_t >= 0.0 else 1.0

static func _ease(k: float) -> float:
	return k * k * (3.0 - 2.0 * k)

## Câmera passeia pelo cenário, encosta na cara de cada blob e assenta na
## posição de jogo. A física não anda durante o passeio.
func _intro_cam(dt: float, w: PhysicWorld) -> bool:
	if intro_t < 0.0:
		return false
	intro_t += dt
	var lx := Map.gx(w.blob_x[w.lead(BV.LEFT)])
	var rx := Map.gx(w.blob_x[w.lead(BV.RIGHT)])
	var hy := Map.gy(w.blob_y[w.lead(BV.LEFT)]) + 0.75
	var t := intro_t
	var pos: Vector3
	var look: Vector3
	var fov := 34.0
	if t < 1.9:
		var k := _ease(t / 1.9)
		pos = Vector3(lerpf(-11.0, -5.0, k), lerpf(13.5, 9.5, k), lerpf(9.0, 24.0, k))
		look = Vector3(lerpf(3.0, 0.0, k), lerpf(1.5, 4.5, k), lerpf(-7.0, -2.0, k))
		fov = lerpf(42.0, 31.0, k)
	elif t < 3.3:
		var k := clampf((t - 1.9) / 0.35, 0.0, 1.0)
		var d := (t - 1.9) * 0.18
		pos = Vector3(lx + 0.4, hy + 0.1, 3.3 - d)
		look = Vector3(lx, hy, 0.0)
		fov = 30.0
		if k < 1.0:
			_cut = 1.0 - k
	elif t < 4.7:
		var k := clampf((t - 3.3) / 0.35, 0.0, 1.0)
		var d := (t - 3.3) * 0.18
		pos = Vector3(rx - 0.4, hy + 0.1, 3.3 - d)
		look = Vector3(rx, hy, 0.0)
		fov = 30.0
		if k < 1.0:
			_cut = 1.0 - k
	else:
		var k := _ease(clampf((t - 4.7) / (INTRO_LEN - 4.7), 0.0, 1.0))
		var gp := Vector3(_cam_target_x, CAM_EYE_Y, _cam_z)
		pos = Vector3(rx - 0.4, hy + 0.1, 3.05).lerp(gp, k)
		look = Vector3(rx, hy, 0.0).lerp(Vector3(0.0, _cam_ly, 0.0), k)
		fov = lerpf(30.0, CAM_FOV, k)
	camera.position = pos
	camera.look_at(look, Vector3.UP)
	camera.fov = fov
	if intro_t >= INTRO_LEN:
		intro_t = -1.0
	return true

var _cut := 0.0

## Fator de tempo do jogo: para no fim da partida (ver Game._process).
func drama() -> float:
	if outro_t >= 0.0:
		return 0.0
	return 1.0

func tick_real(dt: float) -> void:
	if outro_t < 0.0:
		return
	flash = maxf(0.0, flash - dt * 3.2)
	aberration = maxf(0.0, aberration - dt * 5.0)
	if _post != null:
		_post_mat.set_shader_parameter("flash", flash)
		_post_mat.set_shader_parameter("aberration", aberration)

const WIN_MOVES := 4
const LOSE_MOVES := 3

## Fim de partida sem explosão: um comemora do seu jeito, o outro sofre do dele.
func start_outro(winner: int) -> void:
	outro_t = 0.0
	_outro_anim = 0.0
	_outro_winner = winner
	_win_move = randi() % WIN_MOVES
	_lose_move = randi() % LOSE_MOVES
	_kick_beat = 0
	_outro_base.resize(blobs.size() * 2)
	for p in blobs.size():
		_outro_base[p * 2] = blobs[p].position.x
		_outro_base[p * 2 + 1] = blobs[p].position.y
	trauma = 0.45
	hitstop = maxf(hitstop, 0.10)
	flash = maxf(flash, 0.18)
	for p in blobs.size():
		var mine := blobs[p].side == winner
		blobs[p].face.set_mood("laugh" if mine else _lose_face(), 30.0, 9)
	var wb := blobs[_lead[winner]]
	fx.burst(wb.position + Vector3(0, 1.0, 0), 320, 6.0, PI, 1.0, 2.6, 0.05,
		wb.body_color.lightened(0.3), 1.6, 0.5)

func _lose_face() -> String:
	return ["sad", "angry", "angry"][_lose_move]

func outro_active() -> bool:
	return outro_t >= 0.0

## Fim de partida: plano médio nos dois, com a lente puxando pro lado de quem
## ganhou. Perto demais e a comemoração some pra fora do quadro.
func _outro_cam(dt: float, w: PhysicWorld) -> bool:
	if outro_t < 0.0:
		return false
	outro_t += dt
	var i: int = _lead[_outro_winner]
	var j: int = _lead[BV.other(_outro_winner)]
	var wx: float = blobs[i].position.x
	var hy: float = blobs[i].position.y + 0.75
	var lx: float = blobs[j].position.x
	var ly: float = blobs[j].position.y + 0.75
	var d := 1.0 if _outro_winner == BV.LEFT else -1.0
	var t := outro_t
	if t < 0.9:
		return false
	var k := _ease(clampf((t - 0.9) / 1.2, 0.0, 1.0))
	var gp := camera.position
	var orbit := sin((t - 2.0) * 0.5) * 0.7
	# os dois no quadro: quem ganhou puxa a lente, mas a cara de quem perdeu
	# e metade da graca. O plano abre conforme eles se afastam.
	var mid := wx * 0.58 + lx * 0.42
	var spread := absf(wx - lx)
	var cx := mid + d * 0.25 + orbit
	var zc := clampf(12.6 + spread * 0.42, 12.6, 19.5) - (t - 2.0) * 0.1
	var pos := Vector3(cx, maxf(2.2, (hy + ly) * 0.18 + 1.7), zc)
	var look := Vector3(mid, maxf(1.1, (hy + ly) * 0.2), 0.0)
	camera.position = gp.lerp(pos, k)
	camera.look_at(Vector3(_cam_target_x * CAM_LOOK, _cam_ly, 0.0).lerp(look, k), Vector3.UP)
	camera.fov = lerpf(CAM_FOV, 38.0, k)
	if outro_t >= OUTRO_LEN:
		outro_t = OUTRO_LEN
	return true

func ball_screen_hint(bx: float, by: float) -> Vector3:
	var p := Vector3(bx, by, 0.0)
	var vs := get_viewport().get_visible_rect().size
	if camera.is_position_behind(p):
		return Vector3(-1, -1, 0)
	var s := camera.unproject_position(p)
	var off := s.y < -8.0 or s.x < -8.0 or s.x > vs.x + 8.0
	return Vector3(s.x, s.y, 1.0 if off else 0.0)
var _open_extra := 0.0
var _shake_seed := 0.0
var _kick_t := 0.0
var _stars_n: Array = []
var _squash_k := 0.0
var _squash_ang := 0.0
var _gib := PackedInt32Array([0, 0])
var _shadow: Array[MeshInstance3D] = []
var _ball_shadow: MeshInstance3D
var rep_want := 0.0
var _rep_k := 0.0
var _rep_z := 1.0
var _outro_anim := 0.0
var _win_move := 0
var _lose_move := 0
var _outro_base := PackedFloat64Array()
var _kick_beat := 0
var _win_beat := 0
var _lead := [0, 1]
var _blob_nodes: Array = []
const TRAIL_N := 12
const GHOST_N := 14
var _trail: Array[MeshInstance3D] = []
var _trail_t := PackedFloat64Array()
var _trail_i := 0
var _trail_acc := 0.0
var _ghost: Array[MeshInstance3D] = []
var _ghost_t := PackedFloat64Array()
var _ghost_i := 0
var _spin_acc := 0.0
var _ghost_mesh: ArrayMesh
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

	_ball_shadow = _make_shadow()
	setup_blobs(null)

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

## Blobs, bola e tudo que é por blob nascem por partida: o nível decide
## quantos são e de que tamanho.
func setup_blobs(w: PhysicWorld) -> void:
	if w != null:
		stage.set_dark(w.P.dark)
	for n in _blob_nodes:
		n.queue_free()
	_blob_nodes.clear()
	blobs.clear()
	_shadow.clear()
	_aura.clear()
	_stars.clear()
	var nb := 2 if w == null else w.nb
	var br := BV.BALL_RADIUS * Map.S if w == null else w.ball_r * Map.S
	var kind := "normal" if w == null else w.P.ball_kind
	_lead = [0, 1] if w == null else [w.lead(0), w.lead(1)]
	if w != null and court.get_parent() != null:
		court.rebuild()
		court.set_walls_visible(walls_on)
	_gib.resize(nb)
	_gib.fill(0)
	outro_t = -1.0
	intro_t = -1.0
	trauma = 0.0
	hitstop = 0.0
	for a in [_ppx, _ppy, _pst, _cpx, _cpy, _cst]:
		a.resize(nb)
		a.fill(0.0)
	ball = BallView.new(true, br, kind)
	add_child(ball)
	_blob_nodes.append(ball)
	_build_afterimages(br)

	for i in nb:
		var side_i := i if w == null else w.side_of(i)
		var bsc := 1.0 if w == null else w.bs[i]
		var b := BlobView.new(side_i, true, i, bsc)
		blobs.append(b)
		add_child(b)
		_blob_nodes.append(b)
		var sh := _make_shadow()
		_shadow.append(sh)
		_blob_nodes.append(sh)

	for i in nb:
		var am := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(1, 1)
		am.mesh = qm
		var mat := StandardMaterial3D.new()
		mat.albedo_texture = load("res://assets/stage/glow.png")
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		mat.disable_fog = true
		mat.disable_receive_shadows = true
		am.material_override = mat
		am.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		am.visible = false
		add_child(am)
		_blob_nodes.append(am)
		_aura.append(am)
		var group := []
		for k in 3:
			var st := Label3D.new()
			st.text = "★"
			st.font_size = 96
			st.pixel_size = 0.005
			st.modulate = Color(1.0, 0.9, 0.3)
			st.outline_modulate = Color(0.4, 0.25, 0.0, 0.9)
			st.outline_size = 14
			st.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			st.no_depth_test = true
			st.visible = false
			add_child(st)
			_blob_nodes.append(st)
			group.append(st)
		_stars.append(group)

## Sombra de contato pintada. A sombra da direcional some no ambiente forte da
## clareira, e sem mancha embaixo o blob parece flutuar.
static var _shadow_tex: ImageTexture

static func _shadow_texture() -> ImageTexture:
	if _shadow_tex != null:
		return _shadow_tex
	var n := 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for yy in n:
		for xx in n:
			var dx := (xx + 0.5) / n * 2.0 - 1.0
			var dy := (yy + 0.5) / n * 2.0 - 1.0
			var r := sqrt(dx * dx + dy * dy)
			var a := 1.0 - smoothstep(0.62, 1.0, r)
			var core := 1.0 - smoothstep(0.0, 0.7, r)
			img.set_pixel(xx, yy, Color(1, 1, 1, minf(1.0, a * 0.75 + core * 0.35)))
	img.generate_mipmaps()
	_shadow_tex = ImageTexture.create_from_image(img)
	return _shadow_tex

func _ghost_mat(col: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_color = col
	mat.disable_fog = true
	mat.cull_mode = BaseMaterial3D.CULL_BACK
	return mat

func _build_afterimages(br: float) -> void:
	_trail.clear()
	_ghost.clear()
	_trail_t.resize(TRAIL_N)
	_trail_t.fill(0.0)
	_ghost_t.resize(GHOST_N)
	_ghost_t.fill(0.0)
	if _ghost_mesh == null:
		_ghost_mesh = BlobMesh.build(28, 18)
	var sm := SphereMesh.new()
	sm.radius = br
	sm.height = br * 2.0
	sm.radial_segments = 16
	sm.rings = 8
	for i in TRAIL_N:
		var mi := MeshInstance3D.new()
		mi.mesh = sm
		mi.material_override = _ghost_mat(Color(0.25, 0.55, 1.0, 0.5))
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visible = false
		add_child(mi)
		_blob_nodes.append(mi)
		_trail.append(mi)
	for i in GHOST_N:
		var mi := MeshInstance3D.new()
		mi.mesh = _ghost_mesh
		mi.material_override = _ghost_mat(Color(0.25, 0.55, 1.0, 0.5))
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.custom_aabb = AABB(Vector3(-1.5, -1.5, -1.5), Vector3(3.0, 3.5, 3.0))
		mi.visible = false
		add_child(mi)
		_blob_nodes.append(mi)
		_ghost.append(mi)

func _trail_push(bx: float, by: float, dt: float) -> void:
	_trail_acc += dt
	if _trail_acc < 0.026:
		return
	_trail_acc = 0.0
	var mi := _trail[_trail_i]
	_trail_t[_trail_i] = 1.0
	_trail_i = (_trail_i + 1) % TRAIL_N
	mi.position = Vector3(bx, by, -0.08)
	mi.visible = true

func _ghost_push(b: BlobView, col: Color, off := Vector3.ZERO, rot := 0.0) -> void:
	var mi := _ghost[_ghost_i]
	_ghost_t[_ghost_i] = 1.0
	_ghost_i = (_ghost_i + 1) % GHOST_N
	mi.position = b.position + off + Vector3(0, 0, -0.06)
	mi.rotation = b.rotation + Vector3(0, 0, rot)
	mi.scale = b.scale * b.sq_now * 1.1
	var mat: StandardMaterial3D = mi.material_override
	mat.albedo_color = col
	mi.visible = true

func _ghost_burst(p: int, w: PhysicWorld, col: Color, n := 6) -> void:
	var b := blobs[p]
	var back := Vector3(-w.dir_of(p), 0.0, 0.0)
	for k in n:
		_ghost_push(b, col, back * (0.22 * (k + 1)) + Vector3(0, 0.03 * k, 0))
		_ghost_t[(_ghost_i - 1 + GHOST_N) % GHOST_N] = 1.0 - 0.12 * k

func _trail_step(dt: float) -> void:
	for i in TRAIL_N:
		if _trail_t[i] <= 0.0:
			continue
		_trail_t[i] -= dt * 4.2
		var mi := _trail[i]
		if _trail_t[i] <= 0.0:
			mi.visible = false
			continue
		var t := _trail_t[i]
		mi.scale = Vector3.ONE * (0.55 + 0.45 * t)
		var mat: StandardMaterial3D = mi.material_override
		mat.albedo_color = Color(0.3 + 0.3 * t, 0.6 + 0.3 * t, 1.0, 0.5 * t)
	for i in GHOST_N:
		if _ghost_t[i] <= 0.0:
			continue
		_ghost_t[i] -= dt * 3.4
		var mi := _ghost[i]
		if _ghost_t[i] <= 0.0:
			mi.visible = false
			continue
		var mat: StandardMaterial3D = mi.material_override
		var c := mat.albedo_color
		mat.albedo_color = Color(c.r, c.g, c.b, 0.55 * _ghost_t[i])

func _make_shadow() -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	mi.mesh = qm
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = _shadow_texture()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.05, 0.07, 0.05, 0.8)
	mat.disable_fog = true
	mat.disable_receive_shadows = true
	mi.material_override = mat
	mi.rotation_degrees = Vector3(-90, 0, 0)
	mi.position = Vector3(0, 0.02, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


func _blob_shadow(mi: MeshInstance3D, x: float, y: float, base: float, spread := 1.0) -> void:
	var k := clampf(1.0 - y / 9.0, 0.12, 1.0)
	var s: float = base * (0.55 + 0.45 * k) * spread
	mi.scale = Vector3(s, s * 0.85, 1)
	mi.position = Vector3(x, 0.02, 0.45)
	var mat: StandardMaterial3D = mi.material_override
	mat.albedo_color = Color(0.03, 0.05, 0.03, 0.95 * k * k)


func set_looks(looks: Array) -> void:
	for i in mini(looks.size(), blobs.size()):
		blobs[i].set_look(looks[i])

func set_solo(on: bool) -> void:
	solo = on

func set_walls(on: bool) -> void:
	walls_on = on
	court.set_walls_visible(on)

## Guarda o estado da simulação pra interpolar. Chamar logo após cada passo fixo.
func capture(m: BVMatch) -> void:
	var w := m.world
	_pbx = _cbx; _pby = _cby; _pbrot = _cbrot
	for i in blobs.size():
		_ppx[i] = _cpx[i]
		_ppy[i] = _cpy[i]
		_pst[i] = _cst[i]

	_cbx = w.ball_x
	_cby = w.ball_y
	if absf(w.ball_rot - _pbrot) > 3.5:
		_pbrot = w.ball_rot
	_cbrot = w.ball_rot
	for i in blobs.size():
		_cpx[i] = w.blob_x[i]
		_cpy[i] = w.blob_y[i]
		_cst[i] = w.blob_state[i]
	ball_speed = sqrt(w.ball_vx * w.ball_vx + w.ball_vy * w.ball_vy)

func on_events(m: BVMatch) -> void:
	var w := m.world
	var ev := m.events
	FaceRig.apply_events(_faces(), ev, m.logic.scores, m.logic.score_to_win, w)
	for k in ev.n:
		_react(w, ev.kind[k], ev.side[k], ev.intensity[k])
	Aud.step_world(w)
	Aud.set_rally(m.logic.rally, w.match_point)

func _faces() -> Array:
	var out := []
	for b in blobs:
		out.append(b.face)
	return out

func _react(w: PhysicWorld, kind: int, side: int, intensity: float) -> void:
	Aud.on_event(kind, side, intensity, w, local_side)
	Rumble.on_event(kind, side, intensity, w)
	match kind:
		Ev.SMASH:
			var p := side
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			trauma = minf(1.0, trauma + 0.25 * intensity)
			hitstop = maxf(hitstop, 0.05)
			aberration = maxf(aberration, 0.8)
			fx.shock(Vector3(bx, by, 0.2), 0.1, 2.4, 0.3, Color(1.5, 1.2, 0.7), 0.8)
			var fwd := Vector3(w.dir_of(p), -0.35, 0.0).normalized()
			fx.burst(Vector3(bx, by, 0) + fwd * 0.6, 80, 9.0, 0.7, 0.3, 0.5, 0.04,
				Color(1.3, 1.1, 0.7), 2.4, 0.2, true, fwd)
			ball.flash(1.6)
			_squash_ball(w, 0.3)
			blobs[p].kick(1.3, 3.5)
			blobs[p].mouth = 1.0
			blobs[p].face.set_mood("angry", 0.5, 3)
		Ev.BALL_HIT_BLOB:
			var p := side
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			var inten := 0.35 + intensity * 0.65
			trauma = minf(1.0, trauma + 0.20 * inten)
			hitstop = maxf(hitstop, 0.035 * inten)
			aberration = maxf(aberration, 0.5 * inten)
			flash = maxf(flash, 0.035 * inten)
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
			court.wall_hit(w.ball_side(), Map.gy(w.ball_y))
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
			if intensity >= 1.0:
				blobs[p].face.set_mood("angry", 0.6, 8)
				var sfwd := Vector3(w.dir_of(p), 0.0, 0.0)
				fx.shock(Vector3(bx, by, 0.2) + sfwd * 1.0, 0.1, 2.6, 0.4, Color(1.6, 1.1, 0.5), 0.6)
				fx.shock(Vector3(bx, by, 0.2) + sfwd * 1.0, 0.05, 1.4, 0.28, blobs[p].body_color * 1.5, 0.6)
			trauma = minf(1.0, trauma + 0.75)
			_kick_t = 0.2
			hitstop = maxf(hitstop, 0.05)
			aberration = maxf(aberration, 1.4)
			flash = maxf(flash, 0.06)
			var fwd := Vector3(w.dir_of(p), 0.0, 0.0)
			var muzzle := Vector3(bx, by, 0) + fwd * 1.3
			fx.burst(muzzle, 200, 14.0, 0.5, 0.2, 0.7, 0.05,
				Color(0.35, 0.7, 1.0), 1.6, 0.35, true, fwd)
			fx.burst(muzzle, 120, 22.0, 0.25, 0.1, 0.4, 0.07,
				Color(0.8, 0.95, 1.0), 2.4, 0.0, true, fwd)
			_ghost_burst(p, w, Color(0.3, 0.6, 1.0, 0.55), 7)
			ball.flash(1.0)
			blobs[p].kick(0.9, 1.0)
			blobs[p].recoil = 1.0
			blobs[p].parry_glow = maxf(blobs[p].parry_glow, 0.8)
			blobs[p].throw()
			blobs[p].charge_k = 0.0
			blobs[p].mouth = 1.0
			blobs[p].flash = 0.4

		Ev.SPECIAL_GROUND:
			var bx := Map.gx(w.ball_x)
			trauma = 1.0
			_kick_t = 0.18
			hitstop = maxf(hitstop, 0.10)
			aberration = maxf(aberration, 2.0)
			flash = maxf(flash, 0.14)
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
			blobs[p].squash_vel -= 3.2

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
			var py := Map.gy(w.upper_y(p))
			trauma = minf(1.0, trauma + 0.14)
			fx.shock(Vector3(px, py, 0.2), 0.2, BV.SPECIAL_REACH * Map.S * 1.1 * w.bs[p], 0.42,
				Color(1.2, 0.65, 0.2))
			fx.burst(Vector3(px, py, 0), 90, 3.4, PI, 1.6, 0.9, 0.03,
				Color(0.85, 0.66, 0.28), 2.0, 0.3)
			blobs[p].kick(1.1, 1.4)

		Ev.DIVE_LAND:
			var p := side
			blobs[p].dive_land()
			fx.burst(Vector3(Map.gx(w.blob_x[p]), 0.05, 0), 120, 2.4, 2.4, 0.9, 1.0,
				0.02, Color(0.82, 0.70, 0.52), 2.2, 0.2, false)

		Ev.BONK:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p]) + 0.9
			hitstop = maxf(hitstop, 0.05)
			blobs[p].kick(1.4, 4.0)
			blobs[p].face.set_mood("dumb", 0.9, 6)
			fx.shock(Vector3(px + w.dive_dir[p] * 0.5, py, 0.2), 0.05, 1.1, 0.3, Color(1.3, 1.2, 0.9), 0.8)
			if absf(w.blob_x[p] - w.net_x) < 120.0 * w.bs[p]:
				court.hit(py, 0.0)
			else:
				court.wall_hit(w.side_of(p), py)

		Ev.BLOCK:
			var p := side
			blobs[p].face.set_mood("aim", 0.5, 4)
			blobs[p].squash_vel += 4.0

		Ev.BLOCK_MISS:
			var p := side
			blobs[p].face.set_mood("whiff", 0.8, 4)

		Ev.RESET_BALL:
			for i in blobs.size():
				_gib[i] = 0
				blobs[i].charge_k = 0.0

		Ev.PARRY_TRY:
			var p := side
			blobs[p].parry_glow = maxf(blobs[p].parry_glow, 0.45)
			fx.burst(Vector3(Map.gx(w.blob_x[p]), Map.gy(w.blob_y[p]) + 1.3, 0), 22,
				2.6, PI, 0.8, 0.3, 0.026, Color(0.42, 0.78, 1.0), 3.6)

		Ev.PARRY:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p]) + 1.3
			trauma = minf(1.0, trauma + 0.5)
			hitstop = maxf(hitstop, 0.09)
			aberration = maxf(aberration, 1.6)
			flash = maxf(flash, 0.16)
			var pdir := w.dir_of(p)
			# anel curto e colado: o parry do SF3 é um estalo azul no corpo, não
			# uma onda que cobre a quadra
			fx.shock(Vector3(px + pdir * 1.2, py, 0.2), 0.4, 2.2, 0.28, Color(0.1, 0.85, 1.8))
			fx.burst(Vector3(px + pdir * 1.1, py, 0), 70, 13.0, 0.9, 0.4, 0.6, 0.05,
				Color(0.36, 0.84, 1.0), 2.2, 0.3, true, Vector3(pdir, 0.0, 0.0))
			blobs[p].parry_glow = 1.0
			_ghost_burst(p, w, Color(0.3, 0.6, 1.0, 0.55), 4)
			fx.burst(Vector3(px + pdir * 1.1, py, 0), 40, 22.0, 0.4, 0.1, 0.4, 0.062,
				Color(0.85, 0.98, 1.0), 3.2, 0.0, true, Vector3(pdir, 0.0, 0.0))
			ball.flash(2.0)
			blobs[p].kick(1.5, 3.0)
			blobs[p].flash = 1.0
			blobs[p].parry_glow = 1.0

		Ev.DIG:
			var p := side
			var dir := w.dir_of(p)
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.lower_y(p))
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
			var o := w.lead(BV.other(side))
			var bx := Map.gx(w.blob_x[o])
			var by := Map.gy(w.blob_y[o])
			trauma = 1.0
			hitstop = maxf(hitstop, 0.22)
			aberration = maxf(aberration, 3.0)
			flash = maxf(flash, 0.4)
			fx.burst(Vector3(bx, by + 0.8, 0), 260, 11.0, PI, 1.2, 1.6, 0.06,
				blobs[o].body_color, 1.4, 0.4)
			fx.burst(Vector3(bx, 0.06, 0), 320, 6.5, 2.4, 1.4, 1.3, 0.024,
				Color(0.82, 0.70, 0.52), 2.0, 0.25, false)
			blobs[o].kick(2.2, 6.0)
			blobs[o].mouth = 1.0
			blobs[o].flash = 1.0
			blobs[o].face.set_mood("dumb", 2.4, 9)

		Ev.SPECIAL_HIT:
			var p := side
			var bx := Map.gx(w.blob_x[p])
			var by := Map.gy(w.blob_y[p])
			trauma = minf(1.0, trauma + 0.95)
			_kick_t = 0.22
			hitstop = maxf(hitstop, 0.10)
			aberration = maxf(aberration, 2.0)
			flash = maxf(flash, 0.12)
			var vdir := Vector3(signf(w.ball_vx) if w.ball_vx != 0.0 else -w.dir_of(p), 0.25, 0.0).normalized()
			fx.burst(Vector3(bx, by, 0) + vdir * 1.3, 150, 15.0, 0.55, 0.3, 0.9, 0.05,
				Color(1.0, 0.35, 0.3), 2.2, 0.4, true, vdir)
			fx.burst(Vector3(bx, by, 0) + vdir * 1.3, 80, 6.0, 0.8, 0.6, 1.4, 0.04,
				Color(1.0, 0.92, 0.55), 1.0, 0.3, true, vdir)
			blobs[p].kick(1.3, 3.0)
			blobs[p].mouth = 1.0
			blobs[p].flash = 0.35
			blobs[p].knock_face = 1.0

		Ev.SPIN:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p]) + 0.6
			blobs[p].face.set_mood("strain", 0.45, 5)
			hitstop = maxf(hitstop, 0.03)
			fx.shock(Vector3(px, py + 0.4, 0.2), 0.2, 2.4, 0.3, Color(1.4, 1.4, 1.6), 0.7)
			fx.burst(Vector3(px, py, 0), 70, 5.0, PI, 0.4, 0.45, 0.03,
				Color(0.95, 0.95, 1.0), 2.0, 0.15)

		Ev.SPIN_HIT:
			var p := side
			var bx := Map.gx(w.ball_x)
			var by := Map.gy(w.ball_y)
			trauma = minf(1.0, trauma + 0.42)
			hitstop = maxf(hitstop, 0.07)
			aberration = maxf(aberration, 1.2)
			flash = maxf(flash, 0.07)
			var d := Vector3(w.ball_vx, -w.ball_vy, 0.0).normalized()
			fx.shock(Vector3(bx, by, 0.2), 0.1, 3.2, 0.32, Color(1.5, 1.25, 0.8), 0.8)
			fx.burst(Vector3(bx, by, 0) + d * 0.5, 120, 13.0, 0.6, 0.3, 0.6, 0.045,
				Color(1.3, 1.15, 0.8), 2.4, 0.25, true, d)
			ball.flash(1.8)
			_squash_ball(w, 0.32)
			blobs[p].kick(1.2, 2.2)

		Ev.STAGGER:
			var p := side
			var px := Map.gx(w.blob_x[p])
			var py := Map.gy(w.blob_y[p])
			trauma = minf(1.0, trauma + 0.45)
			hitstop = maxf(hitstop, 0.08)
			flash = maxf(flash, 0.1)
			blobs[p].kick(1.6, 4.5)
			blobs[p].mouth = 1.0
			blobs[p].flash = 0.8
			blobs[p].knock_face = 1.0
			blobs[p].face.set_mood("hurt", 1.1, 6)
			fx.burst(Vector3(px, py + 0.7, 0), 70, 6.0, PI, 0.8, 0.8, 0.04,
				Color(1.0, 0.85, 0.5), 2.0, 0.3)
			fx.burst(Vector3(px, 0.05, 0), 90, 3.0, 2.2, 1.0, 0.9, 0.02,
				Color(0.82, 0.70, 0.52), 2.0, 0.2, false)

		Ev.KNOCKDOWN:
			var p := side
			blobs[p].face.set_mood("hurt", 1.8, 7)
			blobs[p].knock_face = 1.0

## A câmera fica perto e persegue a bola: precisa ver um pedaço da quadra
## (CAM_NEED), não ela inteira. A folga entre a janela e a lateral da quadra
## é o quanto ela anda de lado. Na vertical o quadro vai de um palmo abaixo
## do chão até `_cam_top`; a distância e a altura do olhar saem daí.
func _fit_arena(aspect: float, vt: float, box_half: float, dt: float) -> void:
	var half := Map.court_half_w() + CAM_MARGIN + _open_extra
	var need := maxf(Map.court_half_w() * CAM_NEED + CAM_MARGIN, box_half)
	var ht := vt * maxf(0.5, aspect)
	var zv := (_cam_top + CAM_BOTTOM) / (2.0 * vt)
	var want_z := minf(CAM_Z_MAX, maxf(maxf(CAM_Z, need / ht), zv))
	_cam_z += (want_z - _cam_z) * (1.0 - exp(-dt * (6.0 if want_z > _cam_z else 1.6)))
	_cam_span = maxf(0.0, half - _cam_z * ht)
	_cam_ly = vt * _cam_z - CAM_BOTTOM

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
		far = absf(Map.gx(w.ball_x))
		for i in blobs.size():
			far = maxf(far, absf(Map.gx(w.blob_x[i])))
		far -= Map.court_half_w()
	var want_open := maxf(0.0, minf(OPEN_HALF, far + 0.5))
	var open_rate := 5.5 if want_open > _open_extra else 1.4
	_open_extra += (want_open - _open_extra) * (1.0 - exp(-dt * open_rate))
	var want_top := CAM_TOP_MAX
	_cam_top += (want_top - _cam_top) * (1.0 - exp(-dt * (7.0 if want_top > _cam_top else 1.1)))
	var fov := CAM_FOV
	var g := m.logic
	for i in 2:
		if g.scores[i] != _last_scores[i]:
			if g.scores[i] > _last_scores[i]:
				_pt_t = PT_HOLD
				_pt_x = Map.gx(w.blob_x[w.lead(1 - i)])
			_last_scores[i] = g.scores[i]
	if g.rally == 0:
		_rec_base = g.rally_best
		_rec_fired = false
	elif g.rally >= RALLY_MIN and g.rally > _rec_base and not _rec_fired:
		_rec_fired = true
		_rec_t = REC_HOLD
	_pt_t = maxf(0.0, _pt_t - dt)
	_rec_t = maxf(0.0, _rec_t - dt)
	var kp := smoothstep(0.0, 1.0, minf(1.0, (PT_HOLD - _pt_t) * 2.5)) * \
		smoothstep(0.0, 1.0, minf(1.0, _pt_t * 2.0)) if _pt_t > 0.0 else 0.0
	var full_half := Map.court_half_w() + CAM_MARGIN + _open_extra
	_fit_arena(aspect, tan(deg_to_rad(fov) * 0.5), full_half, dt)

	# no replay a lente cola na bola, mas só aperta quando ela está baixa: bola
	# alta com zoom fechado é quadro vazio, não é close
	_rep_k += (rep_want - _rep_k) * (1.0 - exp(-dt * 3.4))
	var want_x := _pt_x * kp
	if _rep_k > 0.01:
		want_x = lerpf(want_x, bx * 0.8, _rep_k)
	_cam_target_x = lerpf(_cam_target_x, want_x, 1.0 - exp(-dt * (7.0 if _rep_k > 0.4 else 4.0)))
	var rep_z := lerpf(0.72, 0.9, clampf((by - 1.4) / 3.6, 0.0, 1.0))
	_rep_z += (rep_z - _rep_z) * (1.0 - exp(-dt * 2.6))
	# o aperto do ponto e o do replay se multiplicavam: dava close em cima do
	# blob, sem bola, sem quadra e sem dar pra entender o lance
	var zoom := (1.0 - 0.32 * kp * (1.0 - _rep_k)) * lerpf(1.0, _rep_z, _rep_k)
	var sway := 0.0
	var sway_y := 0.0

	trauma = maxf(0.0, trauma - dt * 1.5)
	_kick_t = maxf(0.0, _kick_t - dt)
	var sh := minf(1.0, _kick_t / 0.22) * 0.9
	var t := time * 34.0 + _shake_seed
	var shx := (sin(t) + sin(t * 2.3)) * 0.5 * sh * 0.38
	var shy := (sin(t * 1.7 + 2.0) + sin(t * 3.1)) * 0.5 * sh * 0.30
	var shr := sin(t * 1.3) * sh * 0.022

	var zc := _cam_z * zoom
	var span := maxf(0.0, full_half - zc * tan(deg_to_rad(fov) * 0.5) * maxf(0.5, aspect))
	var px := clampf(_cam_target_x, -span, span)
	if not _intro_cam(dt, w):
		var rk := _rep_k
		camera.position = Vector3(px + CAM_SIDE + sway + shx + rk * 1.8, CAM_EYE_Y + sway_y + shy - rk * 1.0,
			zc - trauma * 0.9)
		camera.look_at(Vector3(px + CAM_SIDE * 0.45, _cam_ly - (_cam_z - zc) * 0.12 - rk * 0.45, 0.0), Vector3.UP)
		camera.rotate_object_local(Vector3.FORWARD, shr - px * 0.004 + rk * 0.045)
		camera.fov = fov
		_outro_cam(dt, w)
	_cut = maxf(0.0, _cut - dt * 6.0)

	ball.update(bx, by, brot, sin(time * 0.7) * 0.25, dt)
	if stage.dark and stage.spot != null:
		stage.spot.position = Vector3(bx, by + 1.2, 2.6)
	_blob_shadow(_ball_shadow, bx, by, 1.5 * ball.R / (BV.BALL_RADIUS * Map.S))
	if w.super_frames > 0:
		var col := Color(0.35, 0.72, 1.0)
		ball.flash(0.55 + sin(time * 30.0) * 0.12)
		ball.energy(true, col, 0.5, Vector3.ZERO)
		_trail_push(bx, by, dt)
		fx.burst(Vector3(bx, by, 0), 6, 1.4, PI, 0.6, 0.5, 0.07, Color(0.6, 0.85, 1.0), 2.4, 0.3)
	else:
		ball.energy(false, Color.WHITE)

	_squash_k = maxf(0.0, _squash_k - dt * 0.85)
	ball.squash(_squash_k, _squash_ang)

	var faces := _faces()
	FaceRig.crouch_moods(faces, w.crouch)
	FaceRig.reach_moods(faces, w, m.logic.is_ball_valid)
	if outro_t < 0.0:
		FaceRig.doom_moods(faces, w, m.logic.is_ball_valid, m.logic.would_win(w.ball_side()))
	for i in blobs.size():
		_update_blob(i, alpha, dt, w, bx, by)
	for i in blobs.size():
		var b := blobs[i]
		var bsc := b.body_scale
		var am := _aura[i]
		var ready := w.charge[i] >= BV.SPECIAL_FULL and b.visible
		am.visible = ready
		if ready:
			var pulse := 0.5 + 0.5 * sin(time * 5.0 + i)
			var s := (3.0 + pulse * 0.5) * bsc
			am.scale = Vector3(s, s * 1.15, 1)
			am.position = b.position + Vector3(0, 0.9 * bsc, -0.35)
			var mat: StandardMaterial3D = am.material_override
			var c := b.body_color.lightened(0.35)
			mat.albedo_color = Color(c.r, c.g, c.b, 0.17 + pulse * 0.10)
			if int(time * 12.0 + i * 5) % 4 == 0:
				fx.burst(b.position + Vector3((randf() - 0.5) * 1.2, 0.2, 0.3), 4, 1.2,
					0.5, 1.0, 0.9, 0.05, c, 1.2, 0.2)
		if w.spin_t[i] > 0 and b.visible:
			_spin_acc += dt
			if _spin_acc >= 0.03:
				_spin_acc = 0.0
				var c2 := b.body_color.lightened(0.3)
				_ghost_push(b, Color(c2.r, c2.g, c2.b, 0.45), Vector3.ZERO, 0.55 * w.dir_of(i))
				var a2 := time * 40.0
				var tang := Vector3(cos(a2), sin(a2), 0.0)
				fx.burst(b.position + Vector3(0, 0.9 * bsc, 0.2) + tang * 0.9 * bsc, 6, 5.0,
					0.3, 0.0, 0.28, 0.035, Color(1.0, 1.0, 1.0), 3.0, 0.0, true,
					Vector3(-tang.y, tang.x, 0.0) * -w.dir_of(i))
		var stunned := w.stun[i] > 0 and b.visible
		for k in 3:
			var st: Label3D = _stars[i][k]
			st.visible = stunned
			if stunned:
				var a := time * 5.0 + k * TAU / 3.0
				st.position = b.position + Vector3(cos(a) * 0.55 * bsc, (1.75 + sin(a * 2.0) * 0.08) * bsc, sin(a) * 0.55 * bsc)
				st.scale = Vector3.ONE * (0.8 + 0.25 * sin(time * 9.0 + k))
	_trail_step(dt)
	if outro_t >= 0.0:
		_outro_pose(dt)

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
	if _gib[i] > 0 or (solo and b.side == BV.RIGHT):
		b.visible = false
		_shadow[i].visible = false
		return
	_shadow[i].visible = true
	b.visible = true

	var gxp := lerpf(_ppx[i], _cpx[i], alpha)
	var gyp := lerpf(_ppy[i], _cpy[i], alpha)
	var st := lerpf(_pst[i], _cst[i], alpha)
	var wx := Map.gx(gxp)
	var grounded := w.blob_hit_ground(i)

	# pouso e impulso levantam areia; ler o estado antes do update, que o zera
	if grounded and not b.was_grounded:
		var impact := minf(1.0, absf(b.last_vy) / 14.0)
		b.land(impact)
		if impact > 0.15:
			fx.burst(Vector3(wx, 0.04, 0), int(50 + 220 * impact),
				1.6 + 3.4 * impact, 2.6, 0.7, 1.1, 0.017,
				Color(0.80, 0.69, 0.52), 2.0, 0.2, false)
			trauma = minf(1.0, trauma + 0.09 * impact)
	elif not grounded and b.was_grounded:
		b.takeoff()
		fx.burst(Vector3(wx, 0.05, 0), 70, 1.8, 2.4, 0.55, 0.9, 0.016,
			Color(0.82, 0.71, 0.54), 2.4, 0.0, false)

	b.update(w, gxp, gyp, st, bx, by, time, dt, tension)
	_blob_shadow(_shadow[i], wx, Map.gy(gyp), 3.0 * b.body_scale, b.spread)

	# areia do mergulho: no ar é rastro, no chão é arrasto
	if b.dive > 0.01 and randf() < dt * 60.0:
		var air := w.dive_frames[i] > 0
		var wy := Map.gy(gyp)
		fx.burst(Vector3(wx - w.dive_dir[i] * 0.45,
			maxf(0.06, wy * 0.35) if air else 0.05, (randf() - 0.5) * 0.5),
			8, 2.2 if air else 1.2, 1.8, 0.5 if air else 1.0, 0.85, 0.019,
			Color(0.84, 0.72, 0.53), 2.4, 0.2, false)

	if w.dizzy[i] > 0 and randf() < dt * 22.0:
		var a := time * 5.0 + (0.0 if randf() < 0.5 else PI)
		fx.burst(Vector3(wx + cos(a) * 0.55, Map.gy(gyp) + 1.55 + sin(time * 4.2) * 0.06,
			sin(a) * 0.4), 5, 0.2, 1.0, 0.3, 0.35, 0.07,
			Color(1.0, 0.9, 0.35), 1.0)
	if w.stun[i] > 0 and randf() < dt * 30.0:
		var a := time * 3.4 + randf() * TAU
		fx.burst(Vector3(wx + cos(a) * 0.8, Map.gy(gyp) + 1.4 + sin(a * 2.0) * 0.14,
			sin(a) * 0.55), 6, 0.3, 1.2, 0.5, 0.8, 0.05,
			Color(1.0, 0.88, 0.32), 1.2)

## Fim de partida: um comemora, o outro sofre, cada um de um jeito sorteado.
func _outro_pose(dt: float) -> void:
	_outro_anim += dt
	var t := _outro_anim
	var half := Map.court_half_w()
	for p in blobs.size():
		var b := blobs[p]
		if _gib[p] > 0 or (solo and b.side == BV.RIGHT):
			continue
		if _outro_base.size() < (p + 1) * 2:
			continue
		var bx: float = _outro_base[p * 2]
		var by: float = _outro_base[p * 2 + 1]
		b.set_squash(Vector3.ONE)
		if b.side == _outro_winner:
			_win_pose(b, bx, by, t)
		else:
			_lose_pose(b, bx, by, t, dt, half)
		_shadow[p].visible = b.visible
		if b.visible:
			_blob_shadow(_shadow[p], b.position.x, b.position.y, 3.0 * b.body_scale, b.spread)

func _win_pose(b: BlobView, bx: float, by: float, t: float) -> void:
	var x := bx
	var y := by
	var rz := 0.0
	var sq := Vector3.ONE
	match _win_move:
		0:
			var beat := t * 5.2
			x += sin(beat * 0.5) * 0.6
			y -= absf(sin(beat)) * 0.48
			rz = sin(beat * 0.5) * 0.36
			sq = Vector3(1.0 - 0.10 * sin(beat), 1.0 + 0.15 * sin(beat), 1.0)
		1:
			x += sin(t * 2.3) * 2.9
			y -= absf(sin(t * 9.0)) * 0.44
			rz = -cos(t * 2.3) * 0.32
		2:
			var k := absf(sin(t * 2.1))
			y -= k * 2.0
			rz = t * TAU * 1.3
			sq = Vector3(1.0 - 0.12 * k, 1.0 + 0.22 * k, 1.0)
		_:
			var pulse := 0.5 + 0.5 * sin(t * 4.2)
			sq = Vector3(1.0 + 0.24 * pulse, 1.0 + 0.18 * pulse, 1.0 + 0.24 * pulse)
			y -= absf(sin(t * 4.2)) * 0.24
			rz = sin(t * 8.4) * 0.07
	b.position = Vector3(x, y, 0.0)
	b.rotation = Vector3(0.0, 0.0, rz)
	b.scale = Vector3(sq.x, sq.y, sq.z) * b.body_scale
	b.mouth = 1.0
	var beat2 := int(t * 3.0)
	if beat2 != _win_beat:
		_win_beat = beat2
		fx.burst(b.position + Vector3((randf() - 0.5) * 1.2, 1.5, 0.3), 110,
			4.4, PI, 0.9, 1.9, 0.05, Color.from_hsv(randf(), 0.85, 0.75), 1.2, 0.55)

func _lose_pose(b: BlobView, bx: float, by: float, t: float, dt: float, half: float) -> void:
	var x := bx
	var y := by
	var rz := 0.0
	var ry := 0.0
	var sq := Vector3.ONE
	match _lose_move:
		0:
			var k := _ease(minf(1.0, t * 0.5))
			y += 0.32 * k
			sq = Vector3(1.0 + 0.36 * k, 1.0 - 0.38 * k, 1.0 + 0.22 * k)
			rz = sin(t * 1.3) * 0.05 * k
			if randf() < dt * 7.0 * k:
				fx.burst(b.position + Vector3((randf() - 0.5) * 0.6, 0.85, 0.4), 5,
					1.2, 0.5, 1.7, 1.2, 0.035, Color(0.45, 0.78, 1.0), 2.4, 0.3)
		1:
			var k1 := _ease(minf(1.0, t * 0.8))
			ry = sin(t * 2.3) * 0.62 * k1
			rz = sin(t * 1.15) * 0.08 * k1
			y += 0.10 * k1
			sq = Vector3(1.0 + 0.06 * k1, 1.0 - 0.08 * k1, 1.0)
		_:
			var dir := -1.0 if bx < 0.0 else 1.0
			var k2 := _ease(minf(1.0, t * 0.9))
			x = bx + dir * minf(maxf(0.0, t - 0.5) * 0.95, 2.6)
			y -= absf(sin(t * 3.1)) * 0.16 * k2
			rz = (-dir * 0.16 + sin(t * 3.1) * 0.08) * k2
			var beat := int(t * 1.55)
			if beat != _kick_beat:
				_kick_beat = beat
				trauma = minf(1.0, trauma + 0.07)
				fx.burst(Vector3(x + dir * 0.7, 0.06, 0.0), 140, 5.2, 1.8, 1.2, 1.0,
					0.022, Color(0.84, 0.72, 0.53), 2.2, 0.25, false)
			b.visible = absf(x) < half + 14.0
	b.position = Vector3(x, y, 0.0)
	b.rotation = Vector3(0.0, ry, rz)
	b.scale = Vector3(sq.x, sq.y, sq.z) * b.body_scale

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
	var base := blobs[_lead[side]].position
	mi.position = Vector3(base.x, base.y + 1.5, 0.9)
	mi.scale = Vector3.ONE * 0.05
	add_child(mi)
	_emotes.append({"n": mi, "life": 0.0, "max": 1.9, "spin": (randf() - 0.5) * 1.4})

	var col: Color = EMOJI_COLOR[clampi(id, 0, EMOJI_COLOR.size() - 1)]
	fx.burst(Vector3(base.x, base.y + 1.1, 0.4), 220 if id == 1 else 90,
		4.2 if id == 1 else 2.0, PI, -0.5 if id == 0 else 1.0,
		2.4 if id == 1 else 1.2, 0.05, col, 1.5, 0.6 if id == 1 else 0.2)
	blobs[_lead[side]].kick(1.0, 3.0 if id == 1 else 1.6)

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
		var s: float = 1.5 * ease * (1.0 + sin(time * 11.0 + e.spin) * 0.05) \
			* lerpf(1.0, 0.55, _rep_k)
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
	for b in blobs:
		b.face.set_mood("laugh" if b.side == side else "sad", 6.0, 9)
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
