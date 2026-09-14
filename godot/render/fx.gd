class_name Fx
extends Node3D

## Poço de emissores reaproveitados. Criar um GPUParticles3D por explosão engasga
## celular fraco; aqui a contagem já está alocada e o que muda é `amount_ratio`.

const POOL := 14
const RINGS := 8
const MAX_PARTICLES := 360

var quality := 1.0

var _pool: Array[GPUParticles3D] = []
var _mats: Array[StandardMaterial3D] = []
var _next := 0
var _rings: Array[MeshInstance3D] = []
var _ring_life := PackedFloat32Array()
var _ring_max := PackedFloat32Array()
var _ring_from := PackedFloat32Array()
var _ring_to := PackedFloat32Array()
var _ring_next := 0
var _goo: Array[GPUParticles3D] = []
var _goo_next := 0
const GOO_POOL := 6

func _ready() -> void:
	# some ao longo da vida: sem isso a partícula pisca fora de existência
	var fade := Curve.new()
	fade.add_point(Vector2(0.0, 1.0))
	fade.add_point(Vector2(0.55, 0.85))
	fade.add_point(Vector2(1.0, 0.0))
	var fade_tex := CurveTexture.new()
	fade_tex.curve = fade

	for i in POOL:
		var p := GPUParticles3D.new()
		var pm := ParticleProcessMaterial.new()
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		pm.emission_sphere_radius = 0.06
		pm.gravity = Vector3(0, -5.5, 0)
		pm.damping_min = 2.0
		pm.damping_max = 3.0
		pm.scale_min = 0.6
		pm.scale_max = 1.4
		pm.alpha_curve = fade_tex
		p.process_material = pm
		var qm := QuadMesh.new()
		qm.size = Vector2(0.05, 0.05)
		var sm := StandardMaterial3D.new()
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		sm.vertex_color_use_as_albedo = true
		sm.disable_receive_shadows = true
		qm.material = sm
		p.draw_pass_1 = qm
		_mats.append(sm)
		p.amount = MAX_PARTICLES
		p.one_shot = true
		p.explosiveness = 1.0
		p.emitting = false
		p.local_coords = false
		add_child(p)
		_pool.append(p)

	var grow := Curve.new()
	grow.add_point(Vector2(0.0, 0.55))
	grow.add_point(Vector2(0.25, 1.0))
	grow.add_point(Vector2(1.0, 0.15))
	var grow_tex := CurveTexture.new()
	grow_tex.curve = grow
	for i in GOO_POOL:
		var p := GPUParticles3D.new()
		var pm := ParticleProcessMaterial.new()
		pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		pm.emission_sphere_radius = 0.18
		pm.gravity = Vector3(0, -11.0, 0)
		pm.damping_min = 3.2
		pm.damping_max = 5.0
		pm.scale_min = 0.8
		pm.scale_max = 1.3
		pm.scale_curve = grow_tex
		pm.alpha_curve = fade_tex
		pm.particle_flag_align_y = true
		p.process_material = pm
		var qm := QuadMesh.new()
		qm.size = Vector2(0.16, 0.30)
		var sm := StandardMaterial3D.new()
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sm.vertex_color_use_as_albedo = true
		sm.disable_receive_shadows = true
		sm.albedo_texture = _drop_tex()
		sm.cull_mode = BaseMaterial3D.CULL_DISABLED
		qm.material = sm
		p.draw_pass_1 = qm
		p.amount = 12
		p.one_shot = true
		p.explosiveness = 1.0
		p.emitting = false
		p.local_coords = false
		add_child(p)
		_goo.append(p)

	var ring_mat := ShaderMaterial.new()
	ring_mat.shader = load("res://render/ring.gdshader")
	for i in RINGS:
		var m := MeshInstance3D.new()
		var qm := QuadMesh.new()
		qm.size = Vector2(1, 1)
		m.mesh = qm
		m.material_override = ring_mat.duplicate()
		m.visible = false
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(m)
		_rings.append(m)
	_ring_life.resize(RINGS)
	_ring_max.resize(RINGS)
	_ring_from.resize(RINGS)
	_ring_to.resize(RINGS)

## `glow` liga o blend aditivo: serve pra faísca e brilho. Areia e fumaça
## precisam de alpha normal, senão clareiam o cenário inteiro.
func burst(pos: Vector3, count: int, speed: float, spread: float, up: float,
		life: float, size: float, color: Color, drag := 2.4, jitter := 0.0,
		glow := true, dir := Vector3.ZERO) -> void:
	var n := int(count * quality)
	if n < 4:
		return
	var p := _pool[_next]
	_mats[_next].blend_mode = BaseMaterial3D.BLEND_MODE_ADD if glow \
		else BaseMaterial3D.BLEND_MODE_MIX
	_next = (_next + 1) % POOL
	var pm: ParticleProcessMaterial = p.process_material
	pm.initial_velocity_min = speed * 0.45
	pm.initial_velocity_max = speed
	pm.spread = rad_to_deg(minf(spread, 3.1415)) * 0.5
	pm.direction = dir if dir != Vector3.ZERO \
		else (Vector3(0, 1, 0) if up > 0.9 else Vector3(0, clampf(up, 0.05, 1.0), 0))
	pm.gravity = Vector3(0, -5.5 * (1.0 - up * 0.4), 0)
	pm.damping_min = drag * 0.6
	pm.damping_max = drag
	pm.scale_min = size * 12.0 * 0.7
	pm.scale_max = size * 12.0 * 1.3
	pm.color = color
	if jitter > 0.0:
		pm.color_initial_ramp = null
		pm.hue_variation_min = -jitter * 0.12
		pm.hue_variation_max = jitter * 0.12
	else:
		pm.hue_variation_min = 0.0
		pm.hue_variation_max = 0.0
	p.lifetime = life
	p.amount_ratio = clampf(float(n) / MAX_PARTICLES, 0.02, 1.0)
	p.global_position = pos
	p.restart()
	p.emitting = true

static var _drop: ImageTexture

static func _drop_tex() -> ImageTexture:
	if _drop != null:
		return _drop
	var n := 32
	var img := Image.create(n, n * 2, false, Image.FORMAT_RGBA8)
	for y in n * 2:
		for x in n:
			var u := (float(x) + 0.5) / n * 2.0 - 1.0
			var v := (float(y) + 0.5) / (n * 2) * 2.0 - 1.0
			var r := sqrt(u * u + (v * 1.15) * (v * 1.15) * (1.0 + 0.35 * v))
			var a := clampf((0.92 - r) / 0.12, 0.0, 1.0)
			var hl := clampf((0.35 - Vector2(u + 0.28, v + 0.35).length()) / 0.2, 0.0, 1.0) * 0.55
			img.set_pixel(x, y, Color(1.0 + hl, 1.0 + hl, 1.0 + hl, a))
	_drop = ImageTexture.create_from_image(img)
	return _drop

## Gosma: poucas gotas grandes, em arco, esticadas na direção do voo e freando.
func goo_burst(pos: Vector3, dir: Vector3, color: Color, power := 1.0) -> void:
	var p := _goo[_goo_next]
	_goo_next = (_goo_next + 1) % GOO_POOL
	var pm: ParticleProcessMaterial = p.process_material
	pm.direction = (dir + Vector3(0, 0.55, 0)).normalized()
	pm.spread = 38.0
	pm.initial_velocity_min = 2.2 + 2.0 * power
	pm.initial_velocity_max = 3.6 + 3.2 * power
	pm.color = color
	p.lifetime = 0.9
	p.amount_ratio = clampf((6.0 + 4.0 * power) / 12.0, 0.5, 1.0)
	p.global_position = pos
	p.restart()
	p.emitting = true

func shock(pos: Vector3, from_r: float, to_r: float, life: float, color: Color, alpha := 1.0) -> void:
	var m := _rings[_ring_next]
	var k := _ring_next
	_ring_next = (_ring_next + 1) % RINGS
	m.global_position = pos
	m.visible = true
	var mat: ShaderMaterial = m.material_override
	mat.set_shader_parameter("tint", color)
	mat.set_shader_parameter("alpha", alpha)
	_ring_life[k] = life
	_ring_max[k] = life
	_ring_from[k] = from_r
	_ring_to[k] = to_r

func step(dt: float) -> void:
	for k in RINGS:
		if _ring_life[k] <= 0.0:
			continue
		_ring_life[k] -= dt
		var m := _rings[k]
		if _ring_life[k] <= 0.0:
			m.visible = false
			continue
		var u := 1.0 - _ring_life[k] / _ring_max[k]
		var r: float = lerpf(_ring_from[k], _ring_to[k], 1.0 - pow(1.0 - u, 2.4))
		m.scale = Vector3(r * 2.0, r * 2.0, 1.0)
		var mat: ShaderMaterial = m.material_override
		mat.set_shader_parameter("fade", 1.0 - u)
