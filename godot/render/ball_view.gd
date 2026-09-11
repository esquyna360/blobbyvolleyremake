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

func _init(shadows := true) -> void:
	var sm := SphereMesh.new()
	sm.radius = R
	sm.height = R * 2.0
	sm.radial_segments = 32
	sm.rings = 16
	_mesh.mesh = sm
	_mat.albedo_color = Color(1.0, 0.92, 0.42)
	_mat.roughness = 0.38
	_mat.metallic = 0.0
	_mat.emission_enabled = true
	_mat.emission = Color(1.0, 0.75, 0.2)
	_mat.emission_energy_multiplier = 0.0
	_mesh.material_override = _mat
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_squash.add_child(_mesh)
	add_child(_squash)

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
