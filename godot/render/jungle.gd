class_name Jungle
extends Node3D

## O cenário. Uma clareira de areia na beira de um rio, com mata em camadas até
## o fundo. Tudo que se repete entra em MultiMesh: uma chamada de desenho por
## espécie é o que deixa isso rodar em celular fraco sem cortar árvore.

const NEAR_Z := -8.0
const RIVER_Z := -30.0
const RIVER_W := 20.0
const COURT_HALF := 13.2
const COURT_DEPTH := 13.0

const TEX := {
	"PalmTree_Trunk": "PalmTree_Trunk",
	"PalmTree_Leaves": "PalmTree_Leaves",
	"NormalTree_Bark": "NormalTree_Bark",
	"NormalTree_Leaves": "NormalTree_Leaves",
	"MapleTree_Bark": "MapleTree_Bark",
	"MapleTree_Leaves": "NormalTree_Leaves_Dark",
	"Bush_Leaves": "Bush_Leaves",
	"Flowers": "Flowers",
	"Grass": "Grass",
	"Rock": "Rocks",
}

## Quanto cada material balança e o verde que a selva pede em cima dele.
const LOOK := {
	"PalmTree_Trunk": {"sway": 0.010, "tint": Color(0.72, 0.66, 0.52)},
	"PalmTree_Leaves": {"sway": 0.055, "tint": Color(0.50, 0.76, 0.42)},
	"NormalTree_Bark": {"sway": 0.006, "tint": Color(0.60, 0.52, 0.42)},
	"NormalTree_Leaves": {"sway": 0.030, "tint": Color(0.46, 0.74, 0.40)},
	"MapleTree_Bark": {"sway": 0.006, "tint": Color(0.54, 0.47, 0.39)},
	"MapleTree_Leaves": {"sway": 0.034, "tint": Color(0.40, 0.70, 0.36)},
	"Bush_Leaves": {"sway": 0.060, "tint": Color(0.44, 0.74, 0.40)},
	"Flowers": {"sway": 0.070, "tint": Color(0.90, 0.80, 0.76)},
	"Grass": {"sway": 0.090, "tint": Color(0.50, 0.80, 0.38)},
	"Rock": {"sway": 0.0, "tint": Color(0.62, 0.64, 0.58)},
}

var quality := 2
var _rng := RandomNumberGenerator.new()
var _mats := {}
var _sun: DirectionalLight3D
var _birds: Array[Node3D] = []
var _bird_t := 0.0
var env: Environment

func build(q: int) -> void:
	quality = q
	_rng.seed = 0x5EEDBA5E
	_sky()
	_light()
	_ground()
	_river()
	_vegetation()
	_foreground()
	_air()

func _mat_for(name: String) -> ShaderMaterial:
	if _mats.has(name):
		return _mats[name]
	var m := ShaderMaterial.new()
	m.shader = load("res://render/foliage.gdshader")
	var tex := load("res://assets/nature/tex/%s.jpg" % TEX.get(name, "Grass"))
	m.set_shader_parameter("albedo_tex", tex)
	var look: Dictionary = LOOK.get(name, {"sway": 0.03, "tint": Color.WHITE})
	m.set_shader_parameter("tint", look.tint)
	m.set_shader_parameter("sway", look.sway)
	_mats[name] = m
	return m

var _mesh_cache := {}

func _mesh(name: String) -> ArrayMesh:
	if _mesh_cache.has(name):
		return _mesh_cache[name]
	var ps: PackedScene = load("res://assets/nature/%s.fbx" % name)
	var root := ps.instantiate()
	var mi: MeshInstance3D = root.get_child(0)
	var src: ArrayMesh = mi.mesh
	var out := ArrayMesh.new()
	for s in src.get_surface_count():
		out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, src.surface_get_arrays(s))
		var old := src.surface_get_material(s)
		out.surface_set_material(s, _mat_for(old.resource_name if old else "Grass"))
	root.free()
	_mesh_cache[name] = out
	return out

func _model_height(name: String) -> float:
	return _mesh(name).get_aabb().size.y

func _scatter(names: Array, n: int, z0: float, z1: float, x0: float, x1: float,
		h0: float, h1: float, shadows: bool, y := 0.0, keep_clear := 0.0) -> void:
	var per := {}
	for name in names:
		per[name] = []
	for i in n:
		var name: String = names[_rng.randi() % names.size()]
		var x := _rng.randf_range(x0, x1)
		var z := _rng.randf_range(z0, z1)
		if keep_clear > 0.0 and absf(x) < keep_clear and z > NEAR_Z:
			continue
		var want := _rng.randf_range(h0, h1)
		var s := want / maxf(0.001, _model_height(name))
		var xf := Transform3D(Basis(), Vector3(x, y, z))
		xf.basis = Basis(Vector3.UP, _rng.randf_range(0.0, TAU)).scaled(
			Vector3(s * _rng.randf_range(0.92, 1.08), s, s * _rng.randf_range(0.92, 1.08)))
		xf.basis = xf.basis.rotated(Vector3.FORWARD, _rng.randf_range(-0.05, 0.05))
		per[name].append(xf)
	for name in names:
		var list: Array = per[name]
		if list.is_empty():
			continue
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = true
		mm.mesh = _mesh(name)
		mm.instance_count = list.size()
		for i in list.size():
			mm.set_instance_transform(i, list[i])
			mm.set_instance_custom_data(i, Color(_rng.randf(), 0, 0, 0))
		var node := MultiMeshInstance3D.new()
		node.multimesh = mm
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(node)

func _sky() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	var sky := Sky.new()
	var pano := PanoramaSkyMaterial.new()
	pano.panorama = load("res://assets/sky/rainforest_trail_2k.hdr")
	pano.energy_multiplier = 0.30
	sky.sky_material = pano
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.45
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0
	env.tonemap_exposure = 0.85

	# neblina: é ela que separa as camadas de mata e dá a profundidade
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color(0.30, 0.44, 0.34)
	env.fog_light_energy = 1.0
	env.fog_sun_scatter = 0.18
	env.fog_density = 0.016
	env.fog_depth_begin = 24.0
	env.fog_depth_end = 190.0
	env.fog_aerial_perspective = 0.5
	env.fog_sky_affect = 0.85

	if quality >= 2:
		env.glow_enabled = true
		env.glow_intensity = 0.55
		env.glow_bloom = 0.08
		env.glow_hdr_threshold = 1.05
		env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	if quality >= 3:
		env.ssao_enabled = true
		env.ssao_radius = 1.2
		env.ssao_intensity = 1.4
		env.volumetric_fog_enabled = true
		env.volumetric_fog_density = 0.015
		env.volumetric_fog_gi_inject = 0.6
		env.volumetric_fog_length = 90.0

	env.adjustment_enabled = true
	env.adjustment_saturation = 1.12
	env.adjustment_contrast = 1.04
	we.environment = env
	add_child(we)

func _light() -> void:
	_sun = DirectionalLight3D.new()
	# o sol vem de cima e de trás da mata: é o contraluz que recorta as folhas
	_sun.rotation_degrees = Vector3(-46, 34, 0)
	_sun.light_color = Color(1.0, 0.94, 0.80)
	_sun.light_energy = 1.05
	_sun.light_specular = 0.6
	# sombra sempre ligada: além de ancorar o blob no chão, no Forward+ a luz
	# direcional sem sombra saiu mais cara que com ela na medição
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS \
		if quality >= 2 else DirectionalLight3D.SHADOW_ORTHOGONAL
	_sun.directional_shadow_max_distance = 42.0 if quality >= 2 else 26.0
	_sun.directional_shadow_blend_splits = quality >= 2
	_sun.shadow_bias = 0.04
	_sun.shadow_normal_bias = 1.4
	add_child(_sun)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-18, -150, 0)
	fill.light_color = Color(0.52, 0.74, 0.62)
	fill.light_energy = 0.22
	fill.shadow_enabled = false
	add_child(fill)

func _pbr(diff: String, nor: String, arm: String, uv: Vector3) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_texture = load("res://assets/jungle/%s_Diffuse.jpg" % diff)
	m.uv1_scale = uv
	if quality >= 2:
		m.normal_enabled = true
		m.normal_texture = load("res://assets/jungle/%s_nor_gl.jpg" % nor)
		m.normal_scale = 0.9
		m.ao_enabled = true
		m.ao_texture = load("res://assets/jungle/%s_arm.jpg" % arm)
		m.ao_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
		m.roughness_texture = load("res://assets/jungle/%s_arm.jpg" % arm)
		m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	m.roughness = 0.95
	m.metallic = 0.0
	return m

func _plane(size: Vector2, pos: Vector3, mat: Material) -> MeshInstance3D:
	var pm := PlaneMesh.new()
	pm.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = pm
	mi.material_override = mat
	mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func _ground() -> void:
	# o chão é cortado no rio: duas placas, e o leito no meio faz o buraco
	var soil := _pbr("mud_forest", "mud_forest", "mud_forest", Vector3(30, 30, 1))
	var near_far := RIVER_Z + RIVER_W * 0.5
	var near_len := 120.0 - near_far
	_plane(Vector2(300, near_len), Vector3(0, -0.02, near_far + near_len * 0.5), soil)
	var far_near := RIVER_Z - RIVER_W * 0.5
	_plane(Vector2(300, 170), Vector3(0, -0.02, far_near - 85.0), soil)

	# a clareira: areia batida, onde a quadra cabe
	var sand := _pbr("playground_sand", "playground_sand", "playground_sand", Vector3(12, 9, 1))
	_plane(Vector2(COURT_HALF * 2.0 + 8.0, COURT_DEPTH * 2.0), Vector3(0, 0.005, 2.0), sand)

func _river() -> void:
	var rock := _pbr("coast_sand_rocks_02", "coast_sand_rocks_02", "coast_sand_rocks_02",
		Vector3(24, 3, 1))
	var near_edge := RIVER_Z + RIVER_W * 0.5
	var far_edge := RIVER_Z - RIVER_W * 0.5

	# leito e barrancos: sem eles o corte no chão vira buraco no nada
	var bed := StandardMaterial3D.new()
	bed.albedo_color = Color(0.10, 0.12, 0.09)
	bed.roughness = 1.0
	_plane(Vector2(300, RIVER_W + 4.0), Vector3(0, -1.05, RIVER_Z), bed)
	for e in [[near_edge, 1.0], [far_edge, -1.0]]:
		var wall := BoxMesh.new()
		wall.size = Vector3(300, 1.1, 0.6)
		var mi := MeshInstance3D.new()
		mi.mesh = wall
		mi.material_override = rock
		mi.position = Vector3(0, -0.55, e[0] + e[1] * 0.3)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)

	var w := PlaneMesh.new()
	w.size = Vector2(300, RIVER_W)
	w.subdivide_width = 40 if quality >= 2 else 8
	w.subdivide_depth = 8 if quality >= 2 else 2
	var m := MeshInstance3D.new()
	m.mesh = w
	var sm := ShaderMaterial.new()
	sm.shader = load("res://render/water.gdshader")
	sm.set_shader_parameter("flow", 0.30)
	m.material_override = sm
	m.position = Vector3(0, -0.16, RIVER_Z)
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(m)

	# pedra no meio da correnteza: é ela que dá escala e movimento à água
	_scatter(["Rock_2", "Rock_4", "Rock_5"], 18 if quality >= 2 else 8,
		RIVER_Z - RIVER_W * 0.3, RIVER_Z + RIVER_W * 0.3, -60, 60, 0.7, 1.9,
		false, -0.55)
	_mist()

	# pedras nas duas margens
	var rocks := ["Rock_1", "Rock_2", "Rock_3", "Rock_4", "Rock_5"]
	_scatter(rocks, 30 if quality >= 2 else 14, near_edge - 0.2, near_edge + 2.6,
		-70, 70, 0.5, 1.8, quality >= 3, -0.15)
	_scatter(rocks, 26 if quality >= 2 else 12, far_edge - 2.6, far_edge + 0.2,
		-70, 70, 0.6, 2.2, false, -0.15)

## Bruma subindo do rio. Vista quase de lado, a água só se lê pelo que sobe
## dela: sem isso o rio vira uma faixa cinza no meio da mata.
func _mist() -> void:
	var p := GPUParticles3D.new()
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(60, 0.2, RIVER_W * 0.45)
	pm.direction = Vector3(0.3, 1, 0)
	pm.spread = 18.0
	pm.initial_velocity_min = 0.15
	pm.initial_velocity_max = 0.5
	pm.gravity = Vector3(0.15, 0.05, 0)
	pm.scale_min = 6.0
	pm.scale_max = 16.0
	pm.color = Color(0.86, 0.94, 0.90, 0.16)
	p.process_material = pm
	var q := QuadMesh.new()
	q.size = Vector2(1, 1)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	sm.vertex_color_use_as_albedo = true
	sm.disable_receive_shadows = true
	q.material = sm
	p.draw_pass_1 = q
	p.amount = 40 if quality >= 2 else 14
	p.lifetime = 11.0
	p.preprocess = 8.0
	p.position = Vector3(0, 0.0, RIVER_Z)
	p.visibility_aabb = AABB(Vector3(-70, -2, -RIVER_W), Vector3(140, 20, RIVER_W * 2))
	add_child(p)

func _vegetation() -> void:
	var dense := quality >= 2
	var palms := ["PalmTree_1", "PalmTree_2", "PalmTree_3", "PalmTree_4", "PalmTree_5"]
	var big := ["NormalTree_1", "NormalTree_2", "NormalTree_3", "NormalTree_4"]
	var mid := ["MapleTree_1", "MapleTree_3", "MapleTree_5", "NormalTree_5"]
	var bushes := ["Bush", "Bush_Large", "Bush_Small", "Bush_Flowers", "Plant_1",
		"Plant_2", "Plant_Flowers"]
	var grass := ["Grass_Small", "Grass_Large_Extruded"]
	var flowers := ["Flower_1_Clump", "Flower_3_Clump", "Flower_5_Clump"]
	var dead := ["DeadTree_1", "DeadTree_3", "DeadTree_7"]

	var near_bank := RIVER_Z + RIVER_W * 0.5
	var far_bank := RIVER_Z - RIVER_W * 0.5

	# fundo: mata fechada que some na névoa. Fica abaixo do topo do quadro de
	# propósito — é a réstia de céu lá em cima que dá o tamanho da floresta
	_scatter(palms, 130 if dense else 48, -130, -62, -130, 130, 8, 16, false)
	if dense:
		_scatter(big, 54, -120, -62, -110, 110, 9, 18, false)
	else:
		_scatter(palms, 40, -120, -62, -110, 110, 9, 18, false)

	# do outro lado do rio: primeira linha de árvore inteira que se lê
	_scatter(palms, 40 if dense else 18, -60, far_bank - 1.5, -80, 80, 7, 12, false)
	_scatter(mid, 16 if dense else 5, -58, far_bank - 2.0, -60, 60, 8, 13, false)
	_scatter(bushes, 60 if dense else 26, -58, far_bank - 1.0, -70, 70, 0.9, 3.0, false)
	_scatter(dead, 5, -56, far_bank - 2.0, -50, 50, 5, 9, false)

	# margem de cá: só mato baixo, pra deixar o rio aparecer por cima
	_scatter(bushes, 64 if dense else 28, near_bank + 0.5, NEAR_Z - 1.0, -40, 40,
		0.7, 2.4, quality >= 3)
	_scatter(grass, 150 if dense else 60, near_bank + 0.5, NEAR_Z - 1.0, -40, 40,
		0.3, 0.9, false)
	# árvore alta só fora da faixa de jogo: emoldura sem tapar a bola
	_scatter(palms, 12 if dense else 6, near_bank, NEAR_Z - 2.0, -40, -15, 8, 13, quality >= 2)
	_scatter(palms, 12 if dense else 6, near_bank, NEAR_Z - 2.0, 15, 40, 8, 13, quality >= 2)
	_scatter(dead, 3, near_bank, NEAR_Z - 2.0, -34, 34, 5, 8, quality >= 2)

	# beira da clareira
	_scatter(bushes, 34 if dense else 16, NEAR_Z - 0.5, COURT_DEPTH * 0.9, -30, 30,
		0.6, 1.9, false, 0.0, COURT_HALF + 2.0)
	_scatter(grass, 260 if dense else 100, NEAR_Z - 2.0, COURT_DEPTH + 4.0, -30, 30,
		0.25, 0.8, false, 0.0, COURT_HALF + 0.6)
	_scatter(flowers, 46 if dense else 18, NEAR_Z - 2.0, COURT_DEPTH, -28, 28,
		0.25, 0.7, false, 0.0, COURT_HALF + 1.0)
	# mato e pedra na quina de baixo do quadro: profundidade também na frente
	_scatter(bushes, 22 if dense else 10, COURT_DEPTH + 1.0, COURT_DEPTH + 7.0,
		-30, -12, 1.0, 2.8, false)
	_scatter(bushes, 22 if dense else 10, COURT_DEPTH + 1.0, COURT_DEPTH + 7.0,
		12, 30, 1.0, 2.8, false)
	_scatter(["Rock_1", "Rock_3", "Rock_5"], 14 if dense else 6,
		COURT_DEPTH + 0.5, COURT_DEPTH + 6.0, -28, 28, 0.5, 1.6, false, -0.1,
		COURT_HALF + 3.0)

func _foreground() -> void:
	# palmeiras muito na frente, quase fora de quadro: são elas que emolduram
	var palms := ["PalmTree_1", "PalmTree_2", "PalmTree_4"]
	_scatter(palms, 7, 7.0, 13.0, -26, -15, 7, 12, false)
	_scatter(palms, 7, 7.0, 13.0, 15, 26, 7, 12, false)

	# cipós pendurados no topo do quadro
	var vine_mat := ShaderMaterial.new()
	vine_mat.shader = load("res://render/leafcard.gdshader")
	vine_mat.set_shader_parameter("tint", Color(0.26, 0.28, 0.16))
	vine_mat.set_shader_parameter("sway", 0.035)
	var vine := CylinderMesh.new()
	vine.top_radius = 0.035
	vine.bottom_radius = 0.018
	vine.height = 1.0
	vine.radial_segments = 5
	vine.rings = 1
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = vine
	var n := 26 if quality >= 2 else 12
	mm.instance_count = n
	for i in n:
		var side := -1.0 if i % 2 == 0 else 1.0
		var x := side * _rng.randf_range(6.5, 17.0)
		var z := _rng.randf_range(4.0, 11.0)
		var len_v := _rng.randf_range(3.0, 8.5)
		var xf := Transform3D(Basis().scaled(Vector3(1, len_v, 1)), Vector3(x, 11.5 - len_v * 0.5, z))
		mm.set_instance_transform(i, xf)
		mm.set_instance_custom_data(i, Color(_rng.randf(), 0, 0, 0))
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.material_override = vine_mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)

	# folhagem pendurada na ponta do cipó: é o que faz ler como selva e não
	# como vareta no meio da tela
	_hanging(n)

func _hanging(n: int) -> void:
	var names := ["Plant_1", "Plant_2", "Bush_Small", "Plant_Flowers"]
	var per := {}
	for name in names:
		per[name] = []
	for i in n:
		var name: String = names[_rng.randi() % names.size()]
		var side := -1.0 if i % 2 == 0 else 1.0
		var x := side * _rng.randf_range(6.0, 18.0)
		var z := _rng.randf_range(4.0, 11.5)
		var y := _rng.randf_range(4.5, 10.5)
		var want := _rng.randf_range(1.1, 2.4)
		var sc := want / maxf(0.001, _model_height(name))
		var b := Basis(Vector3.UP, _rng.randf_range(0.0, TAU))
		b = b.rotated(Vector3.FORWARD, PI)
		per[name].append(Transform3D(b.scaled(Vector3(sc, sc, sc)), Vector3(x, y, z)))
	for name in names:
		var list: Array = per[name]
		if list.is_empty():
			continue
		var mm2 := MultiMesh.new()
		mm2.transform_format = MultiMesh.TRANSFORM_3D
		mm2.use_custom_data = true
		mm2.mesh = _mesh(name)
		mm2.instance_count = list.size()
		for i in list.size():
			mm2.set_instance_transform(i, list[i])
			mm2.set_instance_custom_data(i, Color(_rng.randf(), 0, 0, 0))
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm2
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)

func _air() -> void:
	# pó de luz parado no ar: o que faz a mata parecer quente e úmida
	var motes := GPUParticles3D.new()
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(22, 6, 12)
	pm.direction = Vector3(0.4, 1, 0)
	pm.spread = 40.0
	pm.initial_velocity_min = 0.06
	pm.initial_velocity_max = 0.3
	pm.gravity = Vector3(0.05, 0.02, 0)
	pm.scale_min = 0.5
	pm.scale_max = 1.6
	pm.color = Color(1.0, 0.95, 0.72, 0.55)
	motes.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(0.035, 0.035)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	sm.vertex_color_use_as_albedo = true
	qm.material = sm
	motes.draw_pass_1 = qm
	motes.amount = 260 if quality >= 2 else 90
	motes.lifetime = 9.0
	motes.preprocess = 6.0
	motes.position = Vector3(0, 5, -3)
	motes.visibility_aabb = AABB(Vector3(-30, -4, -20), Vector3(60, 22, 40))
	add_child(motes)

	# folha caindo: movimento lento que o olho pega sem atrapalhar o jogo
	var leaves := GPUParticles3D.new()
	var lp := ParticleProcessMaterial.new()
	lp.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	lp.emission_box_extents = Vector3(26, 1, 14)
	lp.direction = Vector3(0.5, -1, 0)
	lp.spread = 25.0
	lp.initial_velocity_min = 0.35
	lp.initial_velocity_max = 0.9
	lp.gravity = Vector3(0.2, -0.5, 0)
	lp.angular_velocity_min = -180
	lp.angular_velocity_max = 180
	lp.scale_min = 0.7
	lp.scale_max = 1.5
	lp.color = Color(0.72, 0.88, 0.42, 0.9)
	leaves.process_material = lp
	var lq := QuadMesh.new()
	lq.size = Vector2(0.11, 0.06)
	var lm := StandardMaterial3D.new()
	lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	lm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	lm.vertex_color_use_as_albedo = true
	lm.cull_mode = BaseMaterial3D.CULL_DISABLED
	lm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	lq.material = lm
	leaves.draw_pass_1 = lq
	leaves.amount = 60 if quality >= 2 else 24
	leaves.lifetime = 14.0
	leaves.preprocess = 10.0
	leaves.position = Vector3(0, 11, -4)
	leaves.visibility_aabb = AABB(Vector3(-34, -14, -22), Vector3(68, 30, 44))
	add_child(leaves)

	if quality >= 2:
		_shafts()
	_bird_flock()

## Feixes de luz entre as árvores: quads aditivos, que é o truque barato que
## funciona igual em GPU integrada e em celular.
func _shafts() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_color = Color(1.0, 0.93, 0.62, 0.055)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.disable_receive_shadows = true
	for i in 7:
		var q := QuadMesh.new()
		q.size = Vector2(_rng.randf_range(1.6, 4.2), 26.0)
		var m := MeshInstance3D.new()
		m.mesh = q
		m.material_override = mat
		m.position = Vector3(_rng.randf_range(-24, 24), 9.0, _rng.randf_range(-30, -6))
		m.rotation_degrees = Vector3(0, _rng.randf_range(-24, 24), _rng.randf_range(14, 30))
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(m)

func _bird_flock() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.08, 0.10, 0.09)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	for i in 5:
		var b := Node3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(0.5, 0.16)
		var m := MeshInstance3D.new()
		m.mesh = q
		m.material_override = mat
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		b.add_child(m)
		b.set_meta("t0", _rng.randf_range(0.0, 40.0))
		b.set_meta("y", _rng.randf_range(12.0, 19.0))
		b.set_meta("z", _rng.randf_range(-70.0, -26.0))
		b.set_meta("sp", _rng.randf_range(2.2, 4.0))
		add_child(b)
		_birds.append(b)

func step(dt: float) -> void:
	_bird_t += dt
	for b in _birds:
		var t: float = _bird_t + float(b.get_meta("t0"))
		var sp: float = b.get_meta("sp")
		var span := 150.0
		var x := fmod(t * sp, span) - span * 0.5
		b.position = Vector3(x, float(b.get_meta("y")) + sin(t * 0.8) * 0.7, float(b.get_meta("z")))
