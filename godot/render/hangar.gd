class_name Hangar
extends RefCounted

## Cenário fechado: galpão industrial de noite. Teto com vigas, luminárias
## penduradas com luz de verdade sobre a quadra, janelões azuis no fundo e um
## guindaste atravessando o canto da tela em silhueta.

static func _mat(col: Color, rough := 0.9, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	return m

static func _glow_mat(col: Color, energy: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.emission_enabled = true
	m.emission = col
	m.emission_energy_multiplier = energy
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	return m

static func _box(parent: Node3D, size: Vector3, pos: Vector3, m: Material,
		rot := Vector3.ZERO, shadow := true) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = m
	mi.position = pos
	mi.rotation_degrees = rot
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi

static func _cyl(parent: Node3D, r: float, h: float, pos: Vector3, m: Material,
		rot := Vector3.ZERO) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = r
	cm.bottom_radius = r
	cm.height = h
	cm.radial_segments = 8
	cm.rings = 1
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = m
	mi.position = pos
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

static func build(st: Node3D, quality: int) -> void:
	var steel := _mat(Color(0.20, 0.22, 0.26), 0.7, 0.4)
	var dark := _mat(Color(0.06, 0.065, 0.08), 0.95)
	var wall := _mat(Color(0.17, 0.19, 0.24), 0.95)
	var ceil_h := 17.0

	var cm := PlaneMesh.new()
	cm.size = Vector2(110, 80)
	var ceil := MeshInstance3D.new()
	ceil.mesh = cm
	ceil.material_override = _mat(Color(0.10, 0.11, 0.14), 0.95)
	ceil.position = Vector3(0, ceil_h, 2)
	ceil.rotation_degrees = Vector3(180, 0, 0)
	ceil.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	st.add_child(ceil)

	for x in [-28.0, -20.0, -12.0, -4.0, 4.0, 12.0, 20.0, 28.0]:
		_box(st, Vector3(0.5, 1.1, 76), Vector3(x, ceil_h - 0.55, 0), steel, Vector3.ZERO, false)
	for z in [-16.0, -4.0, 8.0, 20.0]:
		_box(st, Vector3(80, 0.9, 0.5), Vector3(0, ceil_h - 1.2, z), steel, Vector3.ZERO, false)
		for x in [-28.0, 28.0]:
			_box(st, Vector3(0.9, ceil_h, 0.9), Vector3(x, ceil_h * 0.5, z), steel, Vector3.ZERO, false)

	_box(st, Vector3(110, 24, 1), Vector3(0, 12, -24), wall, Vector3.ZERO, false)
	_box(st, Vector3(1, 24, 80), Vector3(-32, 12, 0), wall, Vector3.ZERO, false)
	_box(st, Vector3(1, 24, 80), Vector3(32, 12, 0), wall, Vector3.ZERO, false)
	# rodapé sujo e faixa amarela de segurança na parede do fundo
	_box(st, Vector3(110, 1.2, 0.2), Vector3(0, 0.6, -23.4), _mat(Color(0.30, 0.28, 0.20)), Vector3.ZERO, false)
	_box(st, Vector3(110, 0.12, 0.05), Vector3(0, 1.3, -23.4), _mat(Color(0.85, 0.70, 0.15)), Vector3.ZERO, false)

	# janelões: vidro claro com grade escura, e a luz que entra por eles
	var glass := _glow_mat(Color(0.62, 0.78, 0.98), 1.6)
	var shaft_t: Texture2D = Stage.tex("shaft.png")
	for wx in [-16.0, 0.0, 16.0]:
		_box(st, Vector3(11, 7, 0.2), Vector3(wx, 12.5, -23.3), glass, Vector3.ZERO, false)
		for i in 6:
			_box(st, Vector3(0.22, 7.2, 0.3), Vector3(wx - 5.5 + i * 2.2, 12.5, -23.2), dark, Vector3.ZERO, false)
		for j in 4:
			_box(st, Vector3(11.2, 0.22, 0.3), Vector3(wx, 9.0 + j * 2.33, -23.2), dark, Vector3.ZERO, false)
		var sh := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(1, 1)
		sh.mesh = q
		var sm := StandardMaterial3D.new()
		sm.albedo_texture = shaft_t
		sm.albedo_color = Color(0.45, 0.62, 0.95, 0.55)
		sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		sm.cull_mode = BaseMaterial3D.CULL_DISABLED
		sm.disable_fog = true
		sh.material_override = sm
		sh.scale = Vector3(13, 24, 1)
		sh.position = Vector3(wx, 5.0, -16.0)
		sh.rotation_degrees = Vector3(-38, 0, 0)
		sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		st.add_child(sh)

	# luminárias sobre a quadra, com luz real
	var lamp_glow := _glow_mat(Color(0.92, 0.96, 1.0), 4.0)
	var k := 0
	for lx in [-8.5, 0.0, 8.5]:
		var ly := 11.2
		_cyl(st, 0.04, ceil_h - ly, Vector3(lx, (ceil_h + ly) * 0.5, 0), dark)
		_box(st, Vector3(2.6, 0.22, 0.7), Vector3(lx, ly, 0), dark, Vector3.ZERO, false)
		_box(st, Vector3(2.3, 0.06, 0.5), Vector3(lx, ly - 0.13, 0), lamp_glow, Vector3.ZERO, false)
		var l := SpotLight3D.new()
		l.position = Vector3(lx, ly - 0.2, 0)
		l.rotation_degrees = Vector3(-90, 0, 0)
		l.light_color = Color(0.88, 0.93, 1.0)
		l.light_energy = 3.2
		l.spot_range = 18.0
		l.spot_angle = 48.0
		l.spot_angle_attenuation = 0.6
		l.shadow_enabled = quality >= 2 and k == 1
		st.add_child(l)
		k += 1

	# guindaste em silhueta no canto de cima, entre a câmera e a quadra
	_box(st, Vector3(16, 0.55, 0.55), Vector3(-6.0, 9.4, 14.0), dark, Vector3(0, 14, 0), false)
	_box(st, Vector3(1.4, 0.8, 1.0), Vector3(-9.5, 8.8, 14.8), dark, Vector3.ZERO, false)
	_cyl(st, 0.05, 3.4, Vector3(-9.3, 7.0, 14.9), dark)
	_cyl(st, 0.05, 3.4, Vector3(-9.7, 7.0, 14.7), dark)
	_box(st, Vector3(0.5, 0.5, 0.5), Vector3(-9.5, 5.2, 14.8), dark, Vector3.ZERO, false)
	var hook := TorusMesh.new()
	hook.inner_radius = 0.22
	hook.outer_radius = 0.42
	var hm := MeshInstance3D.new()
	hm.mesh = hook
	hm.material_override = dark
	hm.position = Vector3(-9.5, 4.5, 14.8)
	st.add_child(hm)
	# lâmpada pendurada perto da câmera, apagada, só o vulto
	_cyl(st, 0.03, 5.0, Vector3(7.5, 9.0, 15.5), dark)
	_cyl(st, 0.9, 0.6, Vector3(7.5, 6.4, 15.5), dark)
	# caixotes no chão do fundo
	for b in [[-9.0, -18.0, 1.4, 20.0], [-7.4, -18.4, 1.1, -10.0], [10.5, -19.0, 1.5, 35.0]]:
		_box(st, Vector3(b[2], b[2], b[2]), Vector3(b[0], b[2] * 0.5, b[1]),
			_mat(Color(0.30, 0.24, 0.16)), Vector3(0, b[3], 0))
