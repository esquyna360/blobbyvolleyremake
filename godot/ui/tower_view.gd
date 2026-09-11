class_name TowerView
extends SubViewportContainer

## As torres do arcade em 3D: blocos de pedra empilhados, a cara de cada
## adversário gravada num bloco, a câmera sobe conforme você vence.

signal climbed

const BW := 3.0
const BH := 1.9
const BD := 2.2
const GAP := 7.4
const OVERVIEW := Vector3(-5.0, 8.6, 25.0)
const OVERLOOK := Vector3(-5.0, 7.9, 0.0)

var _vp := SubViewport.new()
var _cam := Camera3D.new()
var _sun := DirectionalLight3D.new()
var _env := Environment.new()
var _blocks: Array = []
var _frames: Array = []
var _faces: Array = []
var _marks: Array = []
var _lamps: Array = []
var _portraits := {}
var _cam_pos := Vector3.ZERO
var _cam_look := Vector3.ZERO
var _pos_t := Vector3.ZERO
var _look_t := Vector3.ZERO
var _t := 0.0
var _flash := 0.0
var _next_bolt := 2.0
var _focus := -1
var _frame_t := 0.0
var _done := []
var _fx: Fx
var _host: Node
var _enter_t := 0.0

func _init() -> void:
	stretch = true
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_vp.own_world_3d = true
	_vp.msaa_3d = Viewport.MSAA_2X
	_vp.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	add_child(_vp)

func build(done: Array, host: Node) -> void:
	_host = host
	_done = done.duplicate()
	var we := WorldEnvironment.new()
	var sky := ProceduralSkyMaterial.new()
	sky.sky_top_color = Color(0.01, 0.01, 0.03)
	sky.sky_horizon_color = Color(0.16, 0.07, 0.16)
	sky.ground_bottom_color = Color(0.0, 0.0, 0.0)
	sky.ground_horizon_color = Color(0.10, 0.05, 0.10)
	sky.sky_curve = 0.25
	var s := Sky.new()
	s.sky_material = sky
	_env.background_mode = Environment.BG_SKY
	_env.sky = s
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color(0.22, 0.2, 0.32)
	_env.ambient_light_energy = 1.1
	_env.fog_enabled = true
	_env.fog_light_color = Color(0.12, 0.06, 0.12)
	_env.fog_density = 0.028
	_env.fog_sky_affect = 0.3
	_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_env.glow_enabled = true
	_env.glow_intensity = 0.5
	_env.glow_bloom = 0.1
	_env.glow_hdr_threshold = 1.0
	we.environment = _env
	_vp.add_child(we)

	_sun.rotation_degrees = Vector3(-52, -30, 0)
	_sun.light_color = Color(0.55, 0.6, 0.9)
	_sun.light_energy = 1.5
	_sun.shadow_enabled = true
	_vp.add_child(_sun)

	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(120, 120)
	ground.mesh = pm
	ground.material_override = _stone(Color(0.10, 0.09, 0.11), 3.0)
	_vp.add_child(ground)

	var stone := _stone(Color(0.36, 0.33, 0.36), 0.8)
	var stone_dark := _stone(Color(0.22, 0.20, 0.24), 0.8)
	for t in Roster.TOWERS.size():
		var tw: Dictionary = Roster.TOWERS[t]
		var steps: Array = tw.steps
		var x := (t - 1) * GAP
		var blocks := []
		var frames := []
		var faces := []
		var marks := []
		for k in steps.size():
			var ch: Dictionary = Roster.CHARS[steps[k]]
			var b := MeshInstance3D.new()
			var bm := BoxMesh.new()
			bm.size = Vector3(BW, BH, BD)
			b.mesh = bm
			b.material_override = stone if k % 2 == 0 else stone_dark
			b.position = Vector3(x + sin(k * 1.7) * 0.05, BH * 0.5 + k * BH, 0.0)
			b.rotation.y = sin(k * 2.3 + t) * 0.02
			_vp.add_child(b)
			blocks.append(b)
			var face := MeshInstance3D.new()
			var qm := QuadMesh.new()
			qm.size = Vector2(1.35, 1.35)
			face.mesh = qm
			var fm := StandardMaterial3D.new()
			fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			fm.albedo_texture = _portrait(ch)
			face.material_override = fm
			face.position = Vector3(x - 0.55, BH * 0.5 + k * BH + 0.02, BD * 0.5 + 0.02)
			_vp.add_child(face)
			faces.append(face)
			var nl := Label3D.new()
			nl.text = ch.name.to_upper()
			nl.font_size = 44
			nl.pixel_size = 0.006
			nl.modulate = Color(0.95, 0.85, 0.6)
			nl.outline_modulate = Color(0, 0, 0, 0.8)
			nl.outline_size = 10
			nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			nl.position = Vector3(x + 0.18, BH * 0.5 + k * BH + 0.28, BD * 0.5 + 0.02)
			_vp.add_child(nl)
			var dl := Label3D.new()
			dl.text = "%dº" % (k + 1)
			dl.font_size = 30
			dl.pixel_size = 0.006
			dl.modulate = Color(1, 1, 1, 0.45)
			dl.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			dl.position = Vector3(x + 0.18, BH * 0.5 + k * BH - 0.1, BD * 0.5 + 0.02)
			_vp.add_child(dl)
			var mk := Label3D.new()
			mk.text = "✓"
			mk.font_size = 90
			mk.pixel_size = 0.006
			mk.modulate = Color(1.0, 0.82, 0.3)
			mk.outline_modulate = Color(0, 0, 0, 0.9)
			mk.outline_size = 12
			mk.position = Vector3(x - 0.55, BH * 0.5 + k * BH, BD * 0.5 + 0.04)
			mk.visible = false
			_vp.add_child(mk)
			marks.append(mk)
			frames.append(_frame(x, BH * 0.5 + k * BH))
		var cap := MeshInstance3D.new()
		var cm := BoxMesh.new()
		cm.size = Vector3(BW + 0.4, 0.35, BD + 0.4)
		cap.mesh = cm
		cap.material_override = stone_dark
		cap.position = Vector3(x, steps.size() * BH + 0.17, 0.0)
		_vp.add_child(cap)
		var tl := Label3D.new()
		tl.text = tw.name
		tl.font_size = 72
		tl.pixel_size = 0.008
		tl.modulate = [Color(0.55, 0.95, 0.5), Color(1.0, 0.82, 0.3), Color(1.0, 0.45, 0.3)][t]
		tl.outline_modulate = Color(0, 0, 0, 0.9)
		tl.outline_size = 14
		tl.position = Vector3(x, steps.size() * BH + 0.9, 0.0)
		tl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		_vp.add_child(tl)
		var lamp := OmniLight3D.new()
		lamp.light_color = Color(1.0, 0.7, 0.35)
		lamp.light_energy = 3.2
		lamp.omni_range = 9.0
		lamp.position = Vector3(x, 0.4, BD * 0.5 + 2.2)
		lamp.shadow_enabled = false
		_vp.add_child(lamp)
		_lamps.append(lamp)
		_blocks.append(blocks)
		_frames.append(frames)
		_faces.append(faces)
		_marks.append(marks)

	_fx = Fx.new()
	_fx.quality = 1.0
	_vp.add_child(_fx)
	_embers()

	_cam.fov = 42.0
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-18, 15, 0)
	fill.light_color = Color(1.0, 0.8, 0.6)
	fill.light_energy = 0.7
	fill.shadow_enabled = false
	_vp.add_child(fill)
	_vp.add_child(_cam)
	_cam_pos = Vector3(0.0, 1.2, 14.0)
	_cam_look = Vector3(0.0, 9.0, 0.0)
	_pos_t = OVERVIEW
	_look_t = OVERLOOK
	_apply_state()

func _embers() -> void:
	var p := GPUParticles3D.new()
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(16, 0.5, 8)
	pm.gravity = Vector3(0, 0.6, 0)
	pm.initial_velocity_min = 0.2
	pm.initial_velocity_max = 0.8
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 40.0
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.6
	pm.turbulence_noise_scale = 3.0
	pm.scale_min = 0.5
	pm.scale_max = 1.3
	p.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(0.05, 0.05)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	sm.albedo_color = Color(1.0, 0.55, 0.2, 0.8)
	qm.material = sm
	p.draw_pass_1 = qm
	p.amount = 160
	p.lifetime = 9.0
	p.preprocess = 6.0
	p.position = Vector3(0, 0.5, 2.0)
	_vp.add_child(p)

func _stone(col: Color, scale: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	var n := NoiseTexture2D.new()
	var fn := FastNoiseLite.new()
	fn.noise_type = FastNoiseLite.TYPE_CELLULAR
	fn.frequency = 0.05
	fn.fractal_octaves = 4
	n.noise = fn
	n.width = 256
	n.height = 256
	m.albedo_color = col
	m.albedo_texture = n
	m.uv1_triplanar = true
	m.uv1_scale = Vector3.ONE * scale
	m.roughness = 0.92
	return m

func _frame(x: float, y: float) -> Node3D:
	var f := Node3D.new()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.8, 0.3)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.8, 0.3)
	mat.emission_energy_multiplier = 3.0
	var th := 0.06
	for e in [[Vector3(BW + th, th, th), Vector3(0, BH * 0.5, BD * 0.5)],
			[Vector3(BW + th, th, th), Vector3(0, -BH * 0.5, BD * 0.5)],
			[Vector3(th, BH + th, th), Vector3(BW * 0.5, 0, BD * 0.5)],
			[Vector3(th, BH + th, th), Vector3(-BW * 0.5, 0, BD * 0.5)]]:
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = e[0]
		m.mesh = bm
		m.material_override = mat
		m.position = e[1]
		f.add_child(m)
	f.position = Vector3(x, y, 0.02)
	f.visible = false
	f.set_meta("mat", mat)
	_vp.add_child(f)
	return f

## Retrato gravado: o Portrait renderiza uma vez e vira textura.
func _portrait(ch: Dictionary) -> Texture2D:
	if _portraits.has(ch.id):
		return _portraits[ch.id]
	var pr := Portrait.new(ch.look, ch.mood, 192, BV.LEFT)
	pr.position = Vector2(-4000, 0)
	_host.add_child(pr)
	var tex := ImageTexture.new()
	_portraits[ch.id] = tex
	_bake(pr, tex)
	return tex

func _bake(pr: Portrait, tex: ImageTexture) -> void:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := pr._vp.get_texture().get_image()
	tex.set_image(img)
	pr.queue_free()

func _apply_state() -> void:
	for t in _blocks.size():
		var done: int = _done[t]
		for k in _blocks[t].size():
			var fm: StandardMaterial3D = _faces[t][k].material_override
			fm.albedo_color = Color(0.45, 0.45, 0.45) if k < done else Color(1, 1, 1)
			_marks[t][k].visible = k < done
			_frames[t][k].visible = k == done

## Página aberta: visão geral das três torres, câmera subindo do chão.
func enter(done: Array) -> void:
	_done = done.duplicate()
	_apply_state()
	_cam_pos = Vector3(-2.0, 1.0, 16.0)
	_cam_look = Vector3(-2.0, 12.0, 0.0)
	_focus = -1
	_enter_t = _t
	_pos_t = OVERVIEW
	_look_t = OVERLOOK

func focus_tower(t: int) -> void:
	_focus = t
	if t < 0:
		_pos_t = OVERVIEW
		_look_t = OVERLOOK
		return
	if _t - _enter_t < 1.4:
		return
	var h: float = _blocks[t].size() * BH
	var x: float = (t - 1) * GAP
	_pos_t = Vector3(x + 1.5, h * 0.55 + 0.5, 6.0 + h * 1.15)
	_look_t = Vector3(x, h * 0.5, 0.0)

## Cinemática entre partidas: a cara vencida ganha a marca, a câmera sobe
## até o próximo bloco. Se acabou a torre, sobe até o topo.
func climb(t: int, from: int, to: int) -> void:
	_done[t] = from
	_apply_state()
	var bf: MeshInstance3D = _blocks[t][from]
	_cam_pos = Vector3(bf.position.x + 2.0, bf.position.y + 0.9, 8.0)
	_cam_look = Vector3(bf.position.x, bf.position.y + 0.4, 0.0)
	_pos_t = _cam_pos
	_look_t = _cam_look
	_focus = t
	await get_tree().create_timer(0.7).timeout
	_flash = 1.0
	_fx.burst(Vector3(bf.position.x - 0.55, bf.position.y, BD * 0.5 + 0.2), 120, 3.0, PI, 1.4, 1.1, 0.06,
		Color(1.0, 0.8, 0.35), 1.6, 0.25)
	_fx.burst(Vector3(bf.position.x - 0.55, bf.position.y, BD * 0.5 + 0.2), 40, 2.0, PI, 0.4, 1.6, 0.12,
		Color(0.5, 0.45, 0.5), 1.2, 0.2, false)
	_fx.shock(Vector3(bf.position.x - 0.55, bf.position.y, BD * 0.5 + 0.3), 0.1, 2.4, 0.5, Color(1.5, 1.1, 0.4), 0.8)
	_done[t] = from + 1
	_apply_state()
	await get_tree().create_timer(0.9).timeout
	if to < _blocks[t].size():
		var bt: MeshInstance3D = _blocks[t][to]
		_pos_t = Vector3(bt.position.x + 2.4, bt.position.y + 1.2, 9.5)
		_look_t = Vector3(bt.position.x, bt.position.y + 0.6, 0.0)
		await get_tree().create_timer(2.2).timeout
		_frame_t = 1.0
		await get_tree().create_timer(0.8).timeout
	else:
		var top: float = _blocks[t].size() * BH + 0.6
		_pos_t = Vector3(bf.position.x + 3.0, top + 2.0, 11.0)
		_look_t = Vector3(bf.position.x, top, 0.0)
		await get_tree().create_timer(2.0).timeout
		_flash = 1.0
		_fx.burst(Vector3(bf.position.x, top + 0.4, 1.5), 260, 5.0, PI, 2.4, 1.8, 0.07,
			Color(1.0, 0.85, 0.4), 1.0, 0.3)
		await get_tree().create_timer(1.6).timeout
	climbed.emit()

func _process(dt: float) -> void:
	if not is_visible_in_tree():
		return
	_t += dt
	_cam_pos += (_pos_t - _cam_pos) * (1.0 - exp(-dt * 2.2))
	_cam_look += (_look_t - _cam_look) * (1.0 - exp(-dt * 2.6))
	var sway := Vector3(sin(_t * 0.4) * 0.12, sin(_t * 0.31) * 0.08, 0.0)
	_cam.position = _cam_pos + sway
	_cam.look_at(_cam_look, Vector3.UP)
	_next_bolt -= dt
	if _next_bolt <= 0.0:
		_flash = 1.0
		_next_bolt = randf_range(3.0, 8.0)
	_flash = maxf(0.0, _flash - dt * 3.5)
	var fl := _flash * _flash * (0.6 + 0.4 * sin(_t * 60.0))
	_sun.light_energy = 1.5 + fl * 5.0
	_env.ambient_light_energy = 1.1 + fl * 2.0
	_frame_t = maxf(0.0, _frame_t - dt * 1.5)
	for t in _frames.size():
		for f in _frames[t]:
			if f.visible:
				var mat: StandardMaterial3D = f.get_meta("mat")
				mat.emission_energy_multiplier = 2.4 + sin(_t * 5.0) * 1.0 + _frame_t * 8.0
	for t in _lamps.size():
		_lamps[t].light_energy = (3.2 if _focus < 0 or _focus == t else 1.4) + sin(_t * 7.0 + t) * 0.3
