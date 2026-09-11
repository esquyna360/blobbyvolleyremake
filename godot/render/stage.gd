class_name Stage
extends Node3D

## O cenário. Camadas pintadas em 2D montadas como placas no mundo 3D: o fundo
## é luz, cada camada à frente é mais escura, e o primeiro plano quase preto
## emoldura a tela. Isso custa ~10 chamadas de desenho e roda em celular fraco,
## e é o que dá o contraste das referências -- mata modelada em 3D vira sopa
## verde sem valor nenhum a essa distância.

const DIR := "res://assets/stage/"

## Qual cenário montar. Quem troca é o menu; o Arena novo lê daqui.
static var theme := "selva"

const THEMES := {
	"selva": {
		"dir": "res://assets/stage/",
		"bg": Color(0.55, 0.78, 0.88), "ambient": Color(0.74, 0.84, 0.76),
		"fog": Color(0.82, 0.92, 0.86), "sat": 1.14, "sky_mult": 1.30, "sky_y": 6.0,
		"back_rot": Vector3(-34, 168, 0), "back_col": Color(1.0, 0.92, 0.62), "back_e": 0.8,
		"key_rot": Vector3(-50, 22, 0), "key_col": Color(1.0, 0.96, 0.86), "key_e": 1.15,
		"ground": Color(0.86, 0.84, 0.78),
		"water": {"shallow": Color(0.30, 0.70, 0.80), "deep": Color(0.08, 0.40, 0.62),
			"foam": Color(0.92, 0.98, 1.0), "sky": Color(0.55, 0.82, 0.96),
			"flow": 0.18, "wave": 0.16, "scale": 0.6},
		"falls": true, "rays": true, "ray_col": Color(1.0, 0.97, 0.72),
		"glow": {"col": Color(1.0, 0.94, 0.68, 0.28), "scale": Vector2(50, 34),
			"pos": Vector3(0.6, 9.0, -95.0)},
		"butterflies": true, "birds": false, "fire": null,
		"mote_col": Color(1.0, 0.98, 0.80, 0.35), "fog_col": Color(0.90, 0.96, 0.92, 0.22),
		"leaf_ramp": [Color(0.45, 0.72, 0.30), Color(0.80, 0.85, 0.30),
			Color(0.98, 0.78, 0.25), Color(0.95, 0.55, 0.20)],
		"props": [
			{"m": "tree_palmBend", "x": -11.5, "z": 10.5, "h": 9.5, "ry": 35, "tint": 0.5},
			{"m": "grass_leafsLarge", "x": 8.8, "z": 15.5, "h": 2.6, "ry": -20, "tint": 0.5},
			{"m": "log", "x": -6.5, "y": -0.1, "z": 17.5, "h": 1.1, "ry": 25, "tint": 0.55},
			{"m": "mushroom_redGroup", "x": -5.3, "z": 16.8, "h": 0.9, "tint": 0.7},
			{"m": "tree_fat", "x": -13.5, "z": 1.5, "h": 8.5, "ry": 10},
			{"m": "tree_detailed", "x": 14.5, "z": -1.0, "h": 9.0, "ry": -30},
			{"m": "tree_palmTall", "x": -17.0, "z": -7.0, "h": 10.0, "ry": 60},
			{"m": "tree_palmDetailedTall", "x": 18.0, "z": -6.0, "h": 9.5, "ry": 120},
			{"m": "tree_tall", "x": -20.0, "z": -12.0, "h": 11.0},
			{"m": "tree_oak", "x": 22.0, "z": -12.0, "h": 10.0, "ry": 40},
			{"m": "plant_bushLarge", "x": -11.0, "z": 5.5, "h": 1.6, "ry": 15},
			{"m": "plant_bushDetailed", "x": 12.0, "z": 6.0, "h": 1.8, "ry": -40},
			{"m": "plant_bush", "x": -11.8, "z": -3.0, "h": 1.4},
			{"m": "flower_redA", "x": -10.6, "z": 7.4, "h": 0.5},
			{"m": "flower_purpleA", "x": 11.2, "z": 7.8, "h": 0.5},
			{"m": "mushroom_red", "x": 10.4, "z": 4.6, "h": 0.55},
			{"m": "rock_largeB", "x": -8.5, "z": -13.5, "h": 1.8, "ry": 20},
			{"m": "stone_largeA", "x": 6.5, "z": -14.0, "h": 1.5, "ry": -50},
			{"m": "rock_tallA", "x": 12.5, "z": -14.5, "h": 2.4},
			{"m": "canoe", "x": -13.0, "y": 0.05, "z": -12.5, "h": 0.9, "ry": 70},
			{"m": "lily_large", "x": -4.0, "y": -0.02, "z": -20.0, "h": 0.25},
			{"m": "lily_large", "x": 5.5, "y": -0.02, "z": -24.0, "h": 0.25, "ry": 90},
			{"m": "lily_large", "x": 1.0, "y": -0.02, "z": -28.0, "h": 0.25, "ry": 40},
			{"m": "cliff_waterfall_rock", "x": -20.0, "y": -0.3, "z": -18.0, "h": 4.0, "ry": 15},
			{"m": "cliff_large_rock", "x": 21.0, "y": -0.3, "z": -20.0, "h": 4.5, "ry": -25},
		],
	},
	"praia": {
		"dir": "res://assets/stage/beach/",
		"bg": Color(0.95, 0.55, 0.35), "ambient": Color(0.80, 0.62, 0.72),
		"fog": Color(0.98, 0.70, 0.50), "sat": 1.10, "sky_mult": 1.15, "sky_y": 9.0,
		"back_rot": Vector3(-12, 176, 0), "back_col": Color(1.0, 0.70, 0.40), "back_e": 1.3,
		"key_rot": Vector3(-46, 18, 0), "key_col": Color(1.0, 0.86, 0.74), "key_e": 1.0,
		"ground": Color(0.92, 0.80, 0.72),
		"water": {"shallow": Color(0.30, 0.42, 0.62), "deep": Color(0.12, 0.18, 0.42),
			"foam": Color(1.0, 0.92, 0.82), "sky": Color(0.88, 0.62, 0.52),
			"flow": 0.22, "wave": 0.10, "scale": 0.5},
		"falls": false, "rays": false, "ray_col": Color(1.0, 0.8, 0.6),
		"glow": {"col": Color(1.0, 0.72, 0.40, 0.45), "scale": Vector2(90, 46),
			"pos": Vector3(0.0, 16.0, -149.0)},
		"butterflies": false, "birds": true, "fire": Vector3(11.8, 0.0, 6.5),
		"mote_col": Color(1.0, 0.80, 0.55, 0.30), "fog_col": Color(1.0, 0.80, 0.70, 0.16),
		"leaf_ramp": [Color(0.95, 0.30, 0.40), Color(1.0, 0.55, 0.30),
			Color(0.35, 0.60, 0.45), Color(1.0, 0.45, 0.65)],
		"props": [
			{"m": "tree_palmBend", "x": 10.5, "z": 12.0, "h": 11.5, "ry": -35, "flip": true, "tint": 0.5},
			{"m": "rock_largeC", "x": -8.4, "y": -0.2, "z": 16.5, "h": 1.8, "ry": 30, "tint": 0.55},
			{"m": "plant_flatTall", "x": -6.2, "z": 17.5, "h": 1.4, "tint": 0.55},
			{"m": "canoe", "x": -13.5, "y": 0.05, "z": 4.0, "h": 1.0, "ry": 65},
			{"m": "campfire_logs", "x": 11.8, "z": 6.5, "h": 0.6},
			{"m": "tree_palmDetailedTall", "x": -15.5, "z": -4.0, "h": 10.0, "ry": 30},
			{"m": "tree_palmTall", "x": 15.5, "z": -2.5, "h": 10.5, "ry": -80},
			{"m": "tree_palmShort", "x": -11.5, "z": -10.5, "h": 6.0, "ry": 100},
			{"m": "tree_palmDetailedShort", "x": 19.5, "z": -9.0, "h": 6.5},
			{"m": "tree_palmTall", "x": -21.0, "z": -12.0, "h": 11.0, "ry": 140},
			{"m": "rock_largeA", "x": -6.0, "z": -14.0, "h": 1.4, "ry": 20},
			{"m": "rock_tallB", "x": 7.5, "z": -13.5, "h": 2.2, "ry": -30},
			{"m": "stone_tallA", "x": 12.0, "z": -13.0, "h": 1.6},
			{"m": "log_large", "x": 13.0, "y": 0.0, "z": -8.5, "h": 0.9, "ry": 20},
			{"m": "grass_large", "x": -10.5, "z": 6.0, "h": 1.0},
			{"m": "grass_large", "x": 11.0, "z": -6.0, "h": 1.0, "ry": 60},
			{"m": "plant_flatShort", "x": -12.0, "z": 0.5, "h": 0.9},
		],
	},
	"galpao": {
		"dir": "res://assets/stage/hangar/", "hangar": true,
		"bg": Color(0.05, 0.07, 0.10), "ambient": Color(0.22, 0.28, 0.36),
		"fog": Color(0.16, 0.20, 0.27), "sat": 1.0, "sky_mult": 1.0, "sky_y": 6.0,
		"back_rot": Vector3(-20, 175, 0), "back_col": Color(0.55, 0.70, 0.95), "back_e": 0.55,
		"key_rot": Vector3(-62, 12, 0), "key_col": Color(0.95, 0.95, 1.0), "key_e": 0.75,
		"ground": Color(0.42, 0.44, 0.47),
		"water": {}, "falls": false, "rays": false, "ray_col": Color(0.6, 0.75, 1.0),
		"glow": {}, "butterflies": false, "birds": false, "fire": null, "leaves": false,
		"mote_col": Color(0.75, 0.85, 1.0, 0.25), "fog_col": Color(0.6, 0.7, 0.85, 0.12),
		"leaf_ramp": [Color(0.5, 0.5, 0.55), Color(0.6, 0.6, 0.65),
			Color(0.55, 0.55, 0.6), Color(0.45, 0.45, 0.5)],
		"props": [
			{"m": "shipping-container-a", "dir": "industrial", "x": -19.0, "z": -13.0, "h": 2.6, "ry": 8},
			{"m": "shipping-container-b", "dir": "industrial", "x": -19.2, "y": 2.6, "z": -13.2, "h": 2.6, "ry": 4},
			{"m": "shipping-container-c", "dir": "industrial", "x": 16.0, "z": -14.5, "h": 2.6, "ry": -12},
			{"m": "detail-tank", "dir": "industrial", "x": 21.5, "z": -9.0, "h": 3.2},
			{"m": "detail-tank-large", "dir": "industrial", "x": -23.0, "z": -6.0, "h": 4.2},
			{"m": "detail-tank", "dir": "industrial", "x": 9.0, "y": -0.4, "z": 16.5, "h": 2.6, "tint": 0.35},
		],
	},
}

## z, altura em metros, y da base (negativo = enterrado, o chão esconde),
## multiplicador de cor (acima de 1 estoura pro bloom) e parallax manual.
const LAYERS := [
	{"tex": "l5_canopy.png", "z": -150.0, "h": 40.0, "y": -3.0, "k": 1.04, "px": 0.06, "sw": 0.0},
	{"tex": "l4_far.png", "z": -112.0, "h": 30.0, "y": -2.4, "k": 1.0, "px": 0.12, "sw": 0.004},
	{"tex": "l3_mid.png", "z": -88.0, "h": 22.0, "y": -1.8, "k": 0.96, "px": 0.20, "sw": 0.006},
	{"tex": "l2_near.png", "z": -72.0, "h": 16.0, "y": -1.2, "k": 0.92, "px": 0.30, "sw": 0.008},
	{"tex": "l1_back.png", "z": -61.0, "h": 11.0, "y": -0.8, "k": 0.92, "px": 0.44, "sw": 0.010},
]

const SKY_Z := -320.0
## folga transparente que as texturas repetidas levam no topo (ver pad_v)
const PADK := 1.05
const GROUND_FAR := -16.0
const WATER_FAR := -62.0
const GROUND_NEAR := 64.0

var quality := 2
var env: Environment
var _t: Dictionary
var _torch_fx: Array = []

var _cam: Camera3D
var _sky: MeshInstance3D
var _layers: Array = []
var _fringe: MeshInstance3D
var _shafts: Array = []
var _falls_anim: StandardMaterial3D
var _time := 0.0
var _aspect := 1.7778
var _cam_z := 39.0
var _look_x := 0.0
var _rng := RandomNumberGenerator.new()

static var _tex_cache := {}


static func tex(name: String) -> Texture2D:
	var dir: String = THEMES[theme].dir
	var key := dir + name
	if not _tex_cache.has(key):
		var path := key if ResourceLoader.exists(key) else DIR + name
		_tex_cache[key] = load(path)
	return _tex_cache[key]


func build(q: int) -> void:
	quality = q
	_t = THEMES[theme] if THEMES.has(theme) else THEMES["selva"]
	_rng.seed = 0x5EEDBA5E
	_env()
	_light()
	if not _t.get("hangar", false):
		_backdrop()
	_ground()
	if not _t.get("hangar", false):
		_water()
	if _t.falls:
		_falls()
	if not _t.get("hangar", false):
		_glow()
	_props()
	if _t.get("hangar", false):
		Hangar.build(self, quality)
	_air()


func set_camera(c: Camera3D) -> void:
	_cam = c


# ------------------------------------------------------------------ ambiente

func _env() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = _t.bg
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = _t.ambient
	env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 4.0
	env.tonemap_exposure = 0.95

	# névoa curta só pro 3D encostar na camada pintada de trás
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = _t.fog
	env.fog_light_energy = 1.0
	env.fog_density = 0.006
	env.fog_depth_begin = 40.0
	env.fog_depth_end = 150.0
	env.fog_sky_affect = 0.0
	env.fog_aerial_perspective = 0.0

	env.glow_enabled = true
	env.glow_intensity = 0.55 if quality >= 2 else 0.35
	env.glow_strength = 1.0
	env.glow_bloom = 0.10
	env.glow_hdr_threshold = 1.0
	env.glow_hdr_scale = 2.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
	if quality >= 2:
		env.set("glow_levels/3", 1.0)
		env.set("glow_levels/4", 0.8)
		env.set("glow_levels/5", 0.5)

	env.adjustment_enabled = true
	env.adjustment_saturation = _t.sat
	env.adjustment_contrast = 1.05
	env.adjustment_brightness = 1.0
	we.environment = env
	add_child(we)


func _light() -> void:
	# contraluz: o sol está atrás da mata, como nas referências
	var back := DirectionalLight3D.new()
	back.rotation_degrees = _t.back_rot
	back.light_color = _t.back_col
	back.light_energy = _t.back_e
	back.light_specular = 0.9
	back.shadow_enabled = false
	add_child(back)

	# chave frontal fraca: sem ela o blob vira silhueta e some a cara dele
	var key := DirectionalLight3D.new()
	key.rotation_degrees = _t.key_rot
	key.light_color = _t.key_col
	key.light_energy = _t.key_e
	key.light_specular = 0.35
	key.shadow_enabled = true
	key.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	key.directional_shadow_max_distance = 72.0 if quality >= 2 else 56.0
	key.shadow_bias = 0.035
	key.shadow_normal_bias = 1.2
	add_child(key)


# ------------------------------------------------------------------ camadas

static var _sway_shader: Shader


func _set_uv(mi: MeshInstance3D, sc: Vector2, off := Vector2.ZERO) -> void:
	var m: Material = mi.material_override
	if m is ShaderMaterial:
		m.set_shader_parameter("uv_scale", sc)
		m.set_shader_parameter("uv_offset", off)
	else:
		m.uv1_scale = Vector3(sc.x, sc.y, 1)
		m.uv1_offset = Vector3(off.x, off.y, 0)


func _tex_of(mi: MeshInstance3D) -> Texture2D:
	var m: Material = mi.material_override
	if m is ShaderMaterial:
		return m.get_shader_parameter("tex")
	return m.albedo_texture


func _quad(t: Texture2D, mult: float, unshaded := true, repeat := false,
		sway := 0.0, anchor := 0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	mi.mesh = qm
	if sway > 0.0:
		qm.subdivide_width = 10
		qm.subdivide_depth = 10
		if _sway_shader == null:
			_sway_shader = load("res://render/sway.gdshader")
		var sm := ShaderMaterial.new()
		sm.shader = _sway_shader
		sm.set_shader_parameter("tex", t)
		sm.set_shader_parameter("tint", Color(mult, mult, mult, 1.0))
		sm.set_shader_parameter("amp", sway)
		sm.set_shader_parameter("anchor", anchor)
		sm.set_shader_parameter("phase", _rng.randf() * TAU)
		sm.set_shader_parameter("speed", 0.9 + _rng.randf() * 0.6)
		mi.material_override = sm
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.gi_mode = GeometryInstance3D.GI_MODE_DISABLED
		add_child(mi)
		return mi
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
	_sky = _quad(tex("sky.png"), _t.sky_mult)
	_sky.position = Vector3(0, 0, SKY_Z)
	for spec in LAYERS:
		var mi := _quad(tex(spec.tex), spec.k, true, true, float(spec.sw), 1)
		mi.set_meta("spec", spec)
		_layers.append(mi)


## Cada placa é esticada até cobrir o tronco de visão na profundidade dela. A
## textura fecha na horizontal, então o excesso vira repetição em vez de borda.
func _fit_layers() -> void:
	if _sky == null:
		return
	var fov := _cam.fov if _cam != null else 27.5
	var ht := tan(deg_to_rad(fov) * 0.5)
	var d := _cam_z - SKY_Z
	var vh := 2.0 * ht * d
	_sky.scale = Vector3(vh * maxf(_aspect, 2.1) * 1.1, vh * 1.05, 1)
	_sky.position = Vector3(0, float(_t.sky_y), SKY_Z)

	for mi in _layers:
		var spec: Dictionary = mi.get_meta("spec")
		var dd: float = _cam_z - float(spec.z)
		var vhh := 2.0 * ht * dd
		var w: float = vhh * _aspect * 1.35
		var h: float = float(spec.h) * PADK
		mi.scale = Vector3(w, h, 1)
		mi.position = Vector3(-_look_x * float(spec.px), float(spec.y) + h * 0.5,
			float(spec.z))
		var t := _tex_of(mi)
		_set_uv(mi, Vector2((w / h) / (float(t.get_width()) / float(t.get_height())), 1.0))


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
	m.albedo_color = _t.ground
	m.uv1_scale = Vector3(52, 10.0, 1)
	m.texture_repeat = true
	m.roughness = 1.0
	m.metallic = 0.0
	mi.material_override = m
	mi.position = Vector3(0, 0, (GROUND_FAR + GROUND_NEAR) * 0.5)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

	if _t.get("hangar", false):
		return
	# franja de capim na emenda entre o chão 3D e a mata pintada
	for zz in [GROUND_FAR + 0.6, WATER_FAR + 1.2]:
		_fringe = _quad(tex("fringe.png"), 1.0, true, true, 0.002, 1)
		_fringe.position = Vector3(0, -0.2 + 1.1 * PADK, zz)
		_fringe.scale = Vector3(240, 2.2 * PADK, 1)
		_set_uv(_fringe, Vector2(12, 1))





func _water() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(420, GROUND_FAR - WATER_FAR)
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	var m := ShaderMaterial.new()
	m.shader = load("res://render/water.gdshader")
	var wt: Dictionary = _t.water
	m.set_shader_parameter("shallow_color", wt.shallow)
	m.set_shader_parameter("deep_color", wt.deep)
	m.set_shader_parameter("foam_color", wt.foam)
	m.set_shader_parameter("sky_tint", wt.sky)
	m.set_shader_parameter("flow", wt.flow)
	m.set_shader_parameter("wave", wt.wave)
	m.set_shader_parameter("scale", wt.scale)
	mi.material_override = m
	mi.position = Vector3(0, -0.05, (GROUND_FAR + WATER_FAR) * 0.5)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


## Cachoeira: veu pintado, fios que descem em loop por cima e nevoa no pe.
func _falls() -> void:
	var h := 14.0
	var w := 11.0
	var cliff := _quad(tex("cliff.png"), 1.0)
	cliff.scale = Vector3(w * 2.1, h * 0.92, 1)
	cliff.position = Vector3(0.6, h * 0.46 - 0.6, WATER_FAR - 1.4)
	var body := _quad(tex("falls.png"), 1.15)
	body.scale = Vector3(w, h, 1)
	body.position = Vector3(0.6, h * 0.5 - 0.4, WATER_FAR - 0.6)
	var anim := _quad(tex("falls_anim.png"), 1.0)
	anim.scale = Vector3(w * 0.7, h, 1)
	anim.position = Vector3(0.6, h * 0.5 - 0.4, WATER_FAR - 0.4)
	_falls_anim = anim.material_override
	_falls_anim.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_falls_anim.albedo_color = Color(0.85, 0.92, 0.95, 1.0)
	_falls_anim.texture_repeat = true
	_falls_anim.uv1_scale = Vector3(1, 2.5, 1)
	_falls_anim.uv1_offset = Vector3.ZERO
	var pm := _box(Vector3(3.2, 0.4, 0.8))
	pm.direction = Vector3(0, 1, 0.3)
	pm.spread = 50.0
	pm.initial_velocity_min = 0.4
	pm.initial_velocity_max = 1.2
	pm.gravity = Vector3(0, -0.15, 0)
	pm.scale_min = 0.6
	pm.scale_max = 1.6
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.25, Color(1, 1, 1, 1))
	g.add_point(0.6, Color(1, 1, 1, 0.6))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	_add_particles(pm, tex("puff.png"), 18 if quality >= 2 else 8,
		Color(0.95, 0.98, 1.0, 0.45), 3.4, Vector3(0.6, 0.8, WATER_FAR + 0.6), 3.2, false)


## Luz da clareira: um brilho quente atras da cachoeira, sem repetir com a
## camada -- as placas pintadas repetem no x, o brilho nao pode.
func _glow() -> void:
	var mi := _quad(tex("glow.png"), 1.0)
	var m: StandardMaterial3D = mi.material_override
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	var gl: Dictionary = _t.glow
	m.albedo_color = gl.col
	mi.scale = Vector3(gl.scale.x, gl.scale.y, 1)
	mi.position = gl.pos


# ---------------------------------------------------------- primeiro plano







# ---------------------------------------------------------------- objetos

## Cenário de verdade é objeto no lugar certo: tronco atravessando o canto da
## tela, pedra no pé, árvore ao lado da quadra. Nada de moldura.
func _props() -> void:
	for spec in _t.props:
		Props.place(self, spec, quality)


func _campfire() -> void:
	var top: Vector3 = _t.fire + Vector3(0, 0.35, 0)
	var pm := _box(Vector3(0.5, 0.1, 0.5))
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 14.0
	pm.initial_velocity_min = 0.9
	pm.initial_velocity_max = 1.7
	pm.gravity = Vector3(0, 1.4, 0)
	pm.scale_min = 0.5
	pm.scale_max = 1.1
	pm.damping_min = 0.6
	pm.damping_max = 1.0
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 0.95, 0.6, 1))
	g.set_color(1, Color(0.6, 0.1, 0.0, 0))
	g.add_point(0.3, Color(1.0, 0.55, 0.15, 0.9))
	g.add_point(0.7, Color(0.8, 0.2, 0.05, 0.4))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var fire := _add_particles(pm, tex("puff.png"), 22 if quality >= 2 else 12,
		Color(1, 1, 1, 1), 1.3, top, 0.9)
	fire.preprocess = 1.0
	var sm := _box(Vector3(0.4, 0.1, 0.4))
	sm.direction = Vector3(0, 1, 0)
	sm.spread = 35.0
	sm.initial_velocity_min = 1.5
	sm.initial_velocity_max = 3.2
	sm.gravity = Vector3(0, -0.6, 0)
	sm.turbulence_enabled = true
	sm.turbulence_noise_strength = 1.5
	sm.scale_min = 0.4
	sm.scale_max = 0.9
	var sg := Gradient.new()
	sg.set_color(0, Color(1.0, 0.9, 0.5, 1))
	sg.set_color(1, Color(1.0, 0.3, 0.0, 0))
	var sgt := GradientTexture1D.new()
	sgt.gradient = sg
	sm.color_ramp = sgt
	_add_particles(sm, tex("mote.png"), 12, Color(1, 1, 1, 1), 0.12, top, 1.8)
	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.6, 0.25)
	light.light_energy = 2.2
	light.omni_range = 11.0
	light.shadow_enabled = false
	light.position = top + Vector3(0, 0.8, 0)
	add_child(light)
	_torch_fx.append(light)


# ------------------------------------------------------------------- ar

func _air() -> void:
	if quality >= 1 and _t.rays:
		_god_rays()
	_motes()
	if quality >= 2 and _t.butterflies:
		_fireflies()
	if _t.birds:
		_birds()
	if _t.get("fire", null) != null:
		_campfire()
	if _t.get("leaves", true):
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
	_add_particles(pm, tex("mote.png"), 70 if quality >= 2 else 35,
		_t.mote_col, 0.22, Vector3(0, 7, -9), 9.0)


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
	var ramp := Gradient.new()
	ramp.set_color(0, Color(1.0, 0.85, 0.2))
	ramp.set_color(1, Color(1.0, 0.45, 0.7))
	ramp.add_point(0.5, Color(0.4, 0.75, 1.0))
	var rt := GradientTexture1D.new()
	rt.gradient = ramp
	pm.color_initial_ramp = rt
	var p := _add_particles(pm, tex("butterfly.png"), 22, Color(1, 1, 1, 1), 0.42,
		Vector3(0, 4.5, -13), 7.0, false)
	var m: StandardMaterial3D = p.material_override
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES


## Gaivotas ao longe, contra o sol: sprites em V que batem asa mudando de escala.
func _birds() -> void:
	var pm := _box(Vector3(60, 10, 6))
	pm.direction = Vector3(1, 0.05, 0)
	pm.spread = 6.0
	pm.initial_velocity_min = 1.6
	pm.initial_velocity_max = 2.6
	pm.scale_min = 0.6
	pm.scale_max = 1.3
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.5
	pm.turbulence_noise_scale = 1.0
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.1, Color(1, 1, 1, 0.85))
	g.add_point(0.9, Color(1, 1, 1, 0.85))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var p := _add_particles(pm, tex("bird.png"), 9, Color(1, 1, 1, 1), 1.6,
		Vector3(0, 22, -100), 30.0, false)
	p.preprocess = 30.0
	var m: StandardMaterial3D = p.material_override
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED





func _leaves() -> void:
	var pm := _box(Vector3(36, 1, 22))
	pm.direction = Vector3(0.5, -1, 0)
	pm.spread = 25.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 1.5
	pm.gravity = Vector3(0.4, -0.85, 0)
	pm.angular_velocity_min = -140.0
	pm.angular_velocity_max = 140.0
	pm.scale_min = 0.55
	pm.scale_max = 1.3
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 1.6
	pm.turbulence_noise_scale = 1.1
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 0))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.08, Color(1, 1, 1, 1))
	g.add_point(0.88, Color(1, 1, 1, 1))
	var gt := GradientTexture1D.new()
	gt.gradient = g
	pm.color_ramp = gt
	var ci := Gradient.new()
	var lr: Array = _t.leaf_ramp
	ci.set_color(0, lr[0])
	ci.set_color(1, lr[3])
	ci.add_point(0.4, lr[1])
	ci.add_point(0.7, lr[2])
	var cit := GradientTexture1D.new()
	cit.gradient = ci
	pm.color_initial_ramp = cit
	var p := _add_particles(pm, tex("leaf.png"), 46 if quality >= 2 else 26, Color(1, 1, 1, 1),
		0.62, Vector3(0, 13, -2), 12.0, false)
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
		_t.fog_col, 7.0, Vector3(0, 0.9, -30), 16.0, false)


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
		mi.position = Vector3(x, h * 0.40, -34.0 - _rng.randf() * 10.0)
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
	for mi in _shafts:
		var ph: float = mi.get_meta("ph")
		var m: StandardMaterial3D = mi.material_override
		var a := 0.30 + 0.16 * sin(_time * 0.5 + ph) + 0.08 * sin(_time * 1.31 + ph * 2.0)
		var rc: Color = _t.ray_col
		m.albedo_color = Color(rc.r * a, rc.g * a, rc.b * a, 1.0)
		mi.position.x = float(mi.get_meta("x0")) + sin(_time * 0.21 + ph) * 0.8
	if _falls_anim != null:
		_falls_anim.uv1_offset.y = fmod(_falls_anim.uv1_offset.y - dt * 1.1, 1.0)
	for i in _torch_fx.size():
		var l: OmniLight3D = _torch_fx[i]
		l.light_energy = 1.2 + 0.35 * sin(_time * 9.0 + i * 1.7) + 0.2 * sin(_time * 23.0 + i)
