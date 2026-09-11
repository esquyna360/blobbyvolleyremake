class_name Stage
extends Node3D

## O cenário. Camadas pintadas em 2D montadas como placas no mundo 3D: o fundo
## é luz, cada camada à frente é mais escura, e o primeiro plano quase preto
## emoldura a tela. Isso custa ~10 chamadas de desenho e roda em celular fraco,
## e é o que dá o contraste das referências -- mata modelada em 3D vira sopa
## verde sem valor nenhum a essa distância.

const DIR := "res://assets/stage/"

## z, altura em metros, y da base (negativo = enterrado, o chão esconde),
## multiplicador de cor (acima de 1 estoura pro bloom) e parallax manual.
const LAYERS := [
	{"tex": "l5_canopy.png", "z": -150.0, "h": 40.0, "y": -3.0, "k": 1.06, "px": 0.06},
	{"tex": "l4_far.png", "z": -96.0, "h": 30.0, "y": -2.4, "k": 1.02, "px": 0.12},
	{"tex": "l3_mid.png", "z": -62.0, "h": 22.0, "y": -1.8, "k": 1.0, "px": 0.20},
	{"tex": "l2_near.png", "z": -40.0, "h": 16.0, "y": -1.2, "k": 1.0, "px": 0.30},
	{"tex": "l1_back.png", "z": -26.0, "h": 11.0, "y": -0.8, "k": 1.0, "px": 0.44},
]

const SKY_Z := -320.0
## folga transparente que as texturas repetidas levam no topo (ver pad_v)
const PADK := 1.05
const GROUND_FAR := -30.0
const GROUND_NEAR := 42.0

var quality := 2
var env: Environment

var _cam: Camera3D
var _sky: MeshInstance3D
var _layers: Array = []
var _fringe: MeshInstance3D
var _fg: Array = []
var _shafts: Array = []
var _time := 0.0
var _aspect := 1.7778
var _cam_z := 39.0
var _look_x := 0.0
var _rng := RandomNumberGenerator.new()

static var _tex_cache := {}


static func tex(name: String) -> Texture2D:
	if not _tex_cache.has(name):
		_tex_cache[name] = load(DIR + name)
	return _tex_cache[name]


func build(q: int) -> void:
	quality = q
	_rng.seed = 0x5EEDBA5E
	_env()
	_light()
	_backdrop()
	_ground()
	_foreground()
	_air()


func set_camera(c: Camera3D) -> void:
	_cam = c


# ------------------------------------------------------------------ ambiente

func _env() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.05, 0.05)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.44, 0.62, 0.47)
	env.ambient_light_energy = 0.78
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 4.0
	env.tonemap_exposure = 0.95

	# névoa curta só pro 3D encostar na camada pintada de trás
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color(0.36, 0.55, 0.42)
	env.fog_light_energy = 1.0
	env.fog_density = 0.03
	env.fog_depth_begin = 16.0
	env.fog_depth_end = 70.0
	env.fog_sky_affect = 0.0
	env.fog_aerial_perspective = 0.0

	env.glow_enabled = true
	env.glow_intensity = 0.9 if quality >= 2 else 0.55
	env.glow_strength = 1.05
	env.glow_bloom = 0.22
	env.glow_hdr_threshold = 0.92
	env.glow_hdr_scale = 2.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	if quality >= 2:
		env.set("glow_levels/3", 1.0)
		env.set("glow_levels/4", 0.8)
		env.set("glow_levels/5", 0.5)

	env.adjustment_enabled = true
	env.adjustment_saturation = 1.16
	env.adjustment_contrast = 1.08
	env.adjustment_brightness = 1.0
	we.environment = env
	add_child(we)


func _light() -> void:
	# contraluz: o sol está atrás da mata, como nas referências
	var back := DirectionalLight3D.new()
	back.rotation_degrees = Vector3(-34.0, 168.0, 0.0)
	back.light_color = Color(1.0, 0.98, 0.76)
	back.light_energy = 1.25
	back.light_specular = 0.9
	back.shadow_enabled = false
	add_child(back)

	# chave frontal fraca: sem ela o blob vira silhueta e some a cara dele
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-52.0, 24.0, 0.0)
	key.light_color = Color(0.86, 0.95, 0.82)
	key.light_energy = 0.70
	key.light_specular = 0.35
	key.shadow_enabled = true
	key.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	key.directional_shadow_max_distance = 72.0 if quality >= 2 else 56.0
	key.shadow_bias = 0.035
	key.shadow_normal_bias = 1.2
	add_child(key)


# ------------------------------------------------------------------ camadas

func _quad(t: Texture2D, mult: float, unshaded := true, repeat := false) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	mi.mesh = qm
	var m := StandardMaterial3D.new()
	m.albedo_texture = t
	m.albedo_color = Color(mult, mult, mult, 1.0)
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	m.texture_repeat = repeat
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.disable_receive_shadows = true
	m.disable_fog = true
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
	add_child(mi)
	return mi


func _backdrop() -> void:
	_sky = _quad(tex("sky.png"), 1.30)
	_sky.position = Vector3(0, 0, SKY_Z)
	for spec in LAYERS:
		var mi := _quad(tex(spec.tex), spec.k, true, true)
		mi.set_meta("spec", spec)
		_layers.append(mi)


## Cada placa é esticada até cobrir o tronco de visão na profundidade dela. A
## textura fecha na horizontal, então o excesso vira repetição em vez de borda.
func _fit_layers() -> void:
	var fov := _cam.fov if _cam != null else 27.5
	var ht := tan(deg_to_rad(fov) * 0.5)
	var d := _cam_z - SKY_Z
	var vh := 2.0 * ht * d
	_sky.scale = Vector3(vh * maxf(_aspect, 2.1) * 1.1, vh * 1.05, 1)
	_sky.position = Vector3(0, _cam_z * 0.0 + 6.0, SKY_Z)

	for mi in _layers:
		var spec: Dictionary = mi.get_meta("spec")
		var dd: float = _cam_z - float(spec.z)
		var vhh := 2.0 * ht * dd
		var w: float = vhh * _aspect * 1.35
		var h: float = float(spec.h) * PADK
		mi.scale = Vector3(w, h, 1)
		mi.position = Vector3(-_look_x * float(spec.px), float(spec.y) + h * 0.5,
			float(spec.z))
		var mat: StandardMaterial3D = mi.material_override
		var t: Texture2D = mat.albedo_texture
		mat.uv1_scale = Vector3((w / h) / (float(t.get_width()) / float(t.get_height())),
			1.0, 1.0)


# --------------------------------------------------------------------- chão

func _ground() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(420, GROUND_NEAR - GROUND_FAR)
	pm.subdivide_width = 1
	pm.subdivide_depth = 1
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	var m := StandardMaterial3D.new()
	m.albedo_texture = tex("ground.png")
	m.albedo_color = Color(0.74, 0.76, 0.70)
	m.uv1_scale = Vector3(52, 11.0, 1)
	m.texture_repeat = true
	m.roughness = 1.0
	m.metallic = 0.0
	mi.material_override = m
	mi.position = Vector3(0, 0, (GROUND_FAR + GROUND_NEAR) * 0.5)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

	# franja de capim na emenda entre o chão 3D e a mata pintada
	_fringe = _quad(tex("fringe.png"), 1.0, true, true)
	_fringe.position = Vector3(0, -0.2 + 1.3 * PADK, GROUND_FAR + 1.6)
	_fringe.scale = Vector3(240, 2.6 * PADK, 1)
	var fm: StandardMaterial3D = _fringe.material_override
	fm.uv1_scale = Vector3(12, 1, 1)


# ---------------------------------------------------------- primeiro plano

## As peças do primeiro plano são filhas da câmera: assim emolduram a tela em
## qualquer proporção, de 16:9 a celular esticado.
func _foreground() -> void:
	for spec in [
		{"tex": "fg_left.png", "side": "left", "f": 0.155},
		{"tex": "fg_right.png", "side": "right", "f": 0.155},
		{"tex": "fg_top.png", "side": "top", "f": 0.30},
		{"tex": "fg_bottom.png", "side": "bottom", "f": 0.17},
	]:
		var rep: bool = spec.side == "top" or spec.side == "bottom"
		var mi := _quad(tex(spec.tex), 1.0, true, rep)
		mi.set_meta("spec", spec)
		remove_child(mi)
		_cam.add_child(mi)
		_fg.append(mi)


func _fit_fg(d: float) -> void:
	if _cam == null:
		return
	var hh := tan(deg_to_rad(_cam.fov) * 0.5) * d
	var hw := hh * _aspect
	for mi in _fg:
		var spec: Dictionary = mi.get_meta("spec")
		var f: float = spec.f
		var sway := sin(_time * 0.27 + float(spec.f) * 9.0) * 0.02
		match spec.side:
			"left":
				mi.scale = Vector3(hw * f * 2.0, hh * 2.0, 1)
				mi.position = Vector3(-hw + hw * f - _look_x * 0.012, sway, -d)
			"right":
				mi.scale = Vector3(hw * f * 2.0, hh * 2.0, 1)
				mi.position = Vector3(hw - hw * f - _look_x * 0.012, sway, -d)
			"top":
				mi.scale = Vector3(hw * 2.4, hh * f * 2.0 * PADK, 1)
				mi.position = Vector3(-_look_x * 0.02,
					hh - hh * f * (2.0 - PADK) + sway, -d)
			"bottom":
				mi.scale = Vector3(hw * 2.4, hh * f * 2.0 * PADK, 1)
				mi.position = Vector3(-_look_x * 0.02,
					-hh + hh * f * (2.0 - PADK), -d)
		var mat: StandardMaterial3D = mi.material_override
		var t: Texture2D = mat.albedo_texture
		var ar: float = (mi.scale.x / mi.scale.y) \
			/ (float(t.get_width()) / float(t.get_height()))
		var sx := ar if spec.side == "top" or spec.side == "bottom" else 1.0
		mat.uv1_scale = Vector3(sx, 1.0, 1.0)


# ------------------------------------------------------------------- ar

func _air() -> void:
	if quality >= 1:
		_god_rays()
	_motes()
	if quality >= 2:
		_fireflies()
		_leaves()
	_ground_fog()


func _add_particles(mat: ParticleProcessMaterial, t: Texture2D, n: int,
		col: Color, size: float, pos: Vector3, life: float,
		additive := true) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = n
	p.lifetime = life
	p.preprocess = life
	p.process_material = mat
	var qm := QuadMesh.new()
	qm.size = Vector2(size, size)
	p.draw_pass_1 = qm
	var m := StandardMaterial3D.new()
	m.albedo_texture = t
	m.albedo_color = col
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.vertex_color_use_as_albedo = true
	m.disable_receive_shadows = true
	m.disable_fog = true
	m.no_depth_test = false
	p.material_override = m
	p.position = pos
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(p)
	return p


func _box(size: Vector3) -> ParticleProcessMaterial:
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = size
	pm.gravity = Vector3.ZERO
	return pm


func _motes() -> void:
	var pm := _box(Vector3(30, 9, 14))
	pm.direction = Vector3(0.4, 1, 0)
	pm.spread = 40.0
	pm.initial_velocity_min = 0.12
	pm.initial_velocity_max = 0.5
	pm.gravity = Vector3(0.08, 0.04, 0)
	pm.scale_min = 0.4
	pm.scale_max = 1.4
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.35
	pm.turbulence_noise_scale = 1.6
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.3, Color(1, 1, 1, 1))
	g.add_point(0.75, Color(1, 1, 1, 1))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	_add_particles(pm, tex("mote.png"), 110 if quality >= 2 else 55,
		Color(1.0, 0.98, 0.72, 0.5), 0.22, Vector3(0, 7, -9), 9.0)


func _fireflies() -> void:
	var pm := _box(Vector3(26, 5, 10))
	pm.direction = Vector3(1, 0.4, 0)
	pm.spread = 70.0
	pm.initial_velocity_min = 0.25
	pm.initial_velocity_max = 0.9
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 1.1
	pm.turbulence_noise_scale = 2.4
	pm.scale_min = 0.5
	pm.scale_max = 1.3
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.18, Color(1, 1, 1, 1))
	g.add_point(0.4, Color(1, 1, 1, 0.25))
	g.add_point(0.62, Color(1, 1, 1, 1))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	_add_particles(pm, tex("mote.png"), 44, Color(1.5, 1.6, 0.5, 1.0), 0.3,
		Vector3(0, 4.5, -13), 7.0)


func _leaves() -> void:
	var pm := _box(Vector3(26, 1, 9))
	pm.direction = Vector3(0.6, -1, 0)
	pm.spread = 20.0
	pm.initial_velocity_min = 0.7
	pm.initial_velocity_max = 1.6
	pm.gravity = Vector3(0.5, -0.7, 0)
	pm.angular_velocity_min = -110.0
	pm.angular_velocity_max = 110.0
	pm.scale_min = 0.5
	pm.scale_max = 1.2
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 1.4
	pm.turbulence_noise_scale = 1.2
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.1, Color(1, 1, 1, 1))
	g.add_point(0.85, Color(1, 1, 1, 1))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var p := _add_particles(pm, tex("leaf.png"), 26, Color(0.55, 0.75, 0.35, 1.0),
		0.5, Vector3(0, 12, -10), 11.0, false)
	var m: StandardMaterial3D = p.material_override
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.particles_anim_h_frames = 1
	m.particles_anim_v_frames = 1


func _ground_fog() -> void:
	var pm := _box(Vector3(34, 0.6, 10))
	pm.direction = Vector3(1, 0.05, 0)
	pm.spread = 8.0
	pm.initial_velocity_min = 0.15
	pm.initial_velocity_max = 0.45
	pm.scale_min = 0.8
	pm.scale_max = 2.2
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.35, Color(1, 1, 1, 1))
	g.add_point(0.7, Color(1, 1, 1, 1))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	_add_particles(pm, tex("puff.png"), 26 if quality >= 2 else 12,
		Color(0.58, 0.78, 0.60, 0.30), 7.0, Vector3(0, 0.9, -18), 16.0, false)


## Raios de luz: placas verticais aditivas atrás da mata do meio. É o efeito que
## mais aproxima das fotos e custa 6 quads.
func _god_rays() -> void:
	var n := 7 if quality >= 2 else 4
	for i in n:
		var mi := _quad(tex("shaft.png"), 1.0)
		var m: StandardMaterial3D = mi.material_override
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.albedo_color = Color(0.9, 1.0, 0.5, 1.0)
		m.no_depth_test = false
		var x := -17.0 + 34.0 * (float(i) + _rng.randf() * 0.6) / float(n)
		var h := 22.0 + _rng.randf() * 10.0
		mi.scale = Vector3(1.6 + _rng.randf() * 2.6, h, 1)
		mi.position = Vector3(x, h * 0.40, -16.0 - _rng.randf() * 10.0)
		mi.rotation_degrees = Vector3(0, 0, -8.0 - _rng.randf() * 9.0)
		mi.set_meta("ph", _rng.randf() * TAU)
		mi.set_meta("x0", x)
		_shafts.append(mi)


# ------------------------------------------------------------------ frame

func step(dt: float) -> void:
	_time += dt
	if _cam == null:
		return
	var vs := get_viewport().get_visible_rect().size
	_aspect = maxf(0.5, vs.x / maxf(1.0, vs.y))
	_cam_z = _cam.global_position.z
	_look_x = _cam.global_position.x
	_fit_layers()
	_fit_fg(9.0)
	for mi in _shafts:
		var ph: float = mi.get_meta("ph")
		var m: StandardMaterial3D = mi.material_override
		var a := 0.55 + 0.28 * sin(_time * 0.5 + ph) + 0.12 * sin(_time * 1.31 + ph * 2.0)
		m.albedo_color = Color(0.95 * a, 1.05 * a, 0.48 * a, 1.0)
		mi.position.x = float(mi.get_meta("x0")) + sin(_time * 0.21 + ph) * 0.8
