class_name BallView
extends Node3D

## A bola é uma esfera com gomos e um brilho que pisca no toque. O achatamento
## na direção do impacto é o que faz o contato ter peso.

const R := BV.BALL_RADIUS * Map.S

var _mesh := MeshInstance3D.new()
var _mat := StandardMaterial3D.new()
var _squash := Node3D.new()
var _flash := 0.0
var _k := 0.0
var _ang := 0.0
var _energy := Node3D.new()
var _shell := MeshInstance3D.new()
var _shell_mat := ShaderMaterial.new()
var _rings: Array[MeshInstance3D] = []
var _ring_mat := StandardMaterial3D.new()
var _e := 0.0
var _e_on := false

func _init(shadows := true) -> void:
	var sm := SphereMesh.new()
	sm.radius = R
	sm.height = R * 2.0
	sm.radial_segments = 40
	sm.rings = 24
	_mesh.mesh = sm
	_mat.albedo_texture = load("res://assets/stage/ball.png")
	_mat.albedo_color = Color(1.0, 1.0, 1.0)
	_mat.roughness = 0.22
	_mat.metallic = 0.0
	_mat.clearcoat_enabled = true
	_mat.clearcoat = 0.9
	_mat.clearcoat_roughness = 0.12
	_mat.rim_enabled = true
	_mat.rim = 0.25
	_mat.rim_tint = 0.3
	_mat.emission_enabled = true
	_mat.emission = Color(1.0, 0.75, 0.2)
	_mat.emission_energy_multiplier = 0.0
	_mesh.material_override = _mat
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_squash.add_child(_mesh)
	add_child(_squash)

	var sh := SphereMesh.new()
	sh.radius = R * 1.9
	sh.height = R * 3.8
	sh.radial_segments = 32
	sh.rings = 16
	_shell.mesh = sh
	_shell_mat.shader = load("res://render/energy.gdshader")
	_shell.material_override = _shell_mat
	_shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_energy.add_child(_shell)
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_ring_mat.albedo_color = Color(1.0, 0.8, 0.4)
	_ring_mat.emission_enabled = true
	_ring_mat.emission = Color(1.0, 0.8, 0.4)
	_ring_mat.emission_energy_multiplier = 2.5
	_ring_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for i in 2:
		var tm := TorusMesh.new()
		tm.inner_radius = R * (2.4 + i * 0.5)
		tm.outer_radius = R * (2.6 + i * 0.5)
		tm.rings = 48
		tm.ring_segments = 8
		var r := MeshInstance3D.new()
		r.mesh = tm
		r.material_override = _ring_mat
		r.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_energy.add_child(r)
		_rings.append(r)
	_energy.visible = false
	add_child(_energy)

## Bola de energia: casca de plasma e anéis girando enquanto o especial vale.
func energy(on: bool, col: Color) -> void:
	_e_on = on
	if on:
		_shell_mat.set_shader_parameter("tint", Vector3(col.r, col.g, col.b) * 1.3)
		var rc := col.lightened(0.4)
		_ring_mat.albedo_color = rc
		_ring_mat.emission = rc

func flash(v: float) -> void:
	_flash = maxf(_flash, v)

func squash(k: float, ang: float) -> void:
	_k = maxf(_k, k)
	_ang = ang

func update(x: float, y: float, rot: float, tilt: float, dt: float) -> void:
	position = Vector3(x, y, 0.0)
	_mesh.rotation = Vector3(tilt, 0.0, -rot)
	_k = maxf(0.0, _k - dt * 3.0)
	_squash.rotation.z = _ang
	_squash.scale = Vector3(1.0 - _k, 1.0 + _k * 0.8, 1.0 - _k * 0.4)
	_flash = maxf(0.0, _flash - dt * 6.0)
	_mat.emission_energy_multiplier = _flash
	_e = clampf(_e + (dt * 9.0 if _e_on else -dt * 5.0), 0.0, 1.0)
	_energy.visible = _e > 0.01
	if _energy.visible:
		var t := Time.get_ticks_msec() * 0.001
		var pop := 1.0 + (1.0 - _e) * 0.9
		_energy.scale = Vector3.ONE * (_e * pop * (1.0 + sin(t * 21.0) * 0.06))
		_shell_mat.set_shader_parameter("power", 0.8 + _e * 1.2)
		_rings[0].rotation = Vector3(t * 4.1, t * 2.7, 0.0)
		_rings[1].rotation = Vector3(0.0, t * 3.3, t * 5.2 + 1.0)
		_energy.rotation.z = -rot * 0.5
