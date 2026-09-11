class_name Court
extends Node3D

## Rede e marcação da quadra. A rede é uma malha em YZ com a ondulação do
## impacto no vértice, igual à versão web.

const NET_TOP := (500.0 - BV.NET_SPHERE_POSITION) * Map.S
const NET_R := BV.NET_RADIUS * Map.S
const DEPTH := Map.COURT_DEPTH + 1.0
const CELL := 17.0

var _mat: ShaderMaterial
var _impacts := PackedVector3Array([Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO])
var _ages := PackedFloat32Array([0, 0, 0, 0])
var _slot := 0

func build(quality: int) -> void:
	_cloth(quality)
	_post(quality)
	_lines()

func _cloth(quality: int) -> void:
	var cols := 60 if quality >= 2 else 26
	var rows := 40 if quality >= 2 else 18
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for j in rows + 1:
		for i in cols + 1:
			var u := float(i) / cols
			var v := float(j) / rows
			st.set_uv(Vector2(u, v))
			st.set_normal(Vector3(1, 0, 0))
			st.add_vertex(Vector3(0.0, v * NET_TOP, (u - 0.5) * DEPTH))
	for j in rows:
		for i in cols:
			var a := j * (cols + 1) + i
			var b := a + 1
			var c := a + cols + 1
			var d := c + 1
			st.add_index(a); st.add_index(c); st.add_index(b)
			st.add_index(b); st.add_index(c); st.add_index(d)
	var mesh := st.commit()
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://render/net.gdshader")
	_mat.set_shader_parameter("cell", CELL)
	_mat.set_shader_parameter("net_top", NET_TOP)
	_mat.set_shader_parameter("cord_color", Color(0.06, 0.07, 0.09))
	_mat.set_shader_parameter("sun_color", Color(1.0, 0.93, 0.8))
	_push_uniforms()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-0.6, -0.1, -DEPTH), Vector3(1.2, NET_TOP + 0.4, DEPTH * 2.0))
	add_child(mi)

## Só o poste da frente: a câmera olha a rede de lado e o de trás encobre
## exatamente o da frente — vira poste duplicado, não profundidade.
func _post(quality: int) -> void:
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color(0.60, 0.64, 0.68)
	metal.roughness = 0.35
	metal.metallic = 0.85

	var z := DEPTH * 0.5
	var pole := CylinderMesh.new()
	pole.top_radius = NET_R
	pole.bottom_radius = NET_R * 1.35
	pole.height = NET_TOP + 0.35
	pole.radial_segments = 20 if quality >= 2 else 10
	pole.rings = 1
	var p := MeshInstance3D.new()
	p.mesh = pole
	p.material_override = metal
	p.position = Vector3(0, (NET_TOP + 0.35) * 0.5 - 0.15, z)
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if quality >= 2 \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(p)

	var cap := SphereMesh.new()
	cap.radius = NET_R * 1.15
	cap.height = NET_R * 2.3
	cap.radial_segments = 16 if quality >= 2 else 8
	cap.rings = 8 if quality >= 2 else 4
	var cm := MeshInstance3D.new()
	cm.mesh = cap
	cm.material_override = metal
	cm.position = Vector3(0, NET_TOP + 0.2, z)
	add_child(cm)

	var pad := CylinderMesh.new()
	pad.top_radius = NET_R * 1.75
	pad.bottom_radius = NET_R * 1.75
	pad.height = 1.25
	pad.radial_segments = 18 if quality >= 2 else 9
	pad.rings = 1
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.11, 0.31, 0.85)
	pmat.roughness = 0.72
	var pd := MeshInstance3D.new()
	pd.mesh = pad
	pd.material_override = pmat
	pd.position = Vector3(0, 0.60, z)
	pd.cast_shadow = p.cast_shadow
	add_child(pd)

## Fita de marcação na areia, como em quadra de praia.
func _lines() -> void:
	var half := Map.court_half_w()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.93, 0.90, 0.82)
	mat.roughness = 0.9
	var w := 0.09
	var segs := [
		[Vector3(-half, 0.012, 0), Vector3(w * 2.0, 0.0, Map.COURT_DEPTH)],
		[Vector3(half, 0.012, 0), Vector3(w * 2.0, 0.0, Map.COURT_DEPTH)],
		[Vector3(0, 0.012, -Map.COURT_DEPTH * 0.5), Vector3(half * 2.0, 0.0, w * 2.0)],
		[Vector3(0, 0.012, Map.COURT_DEPTH * 0.5), Vector3(half * 2.0, 0.0, w * 2.0)],
	]
	for s in segs:
		var bm := BoxMesh.new()
		bm.size = Vector3(s[1].x, 0.02, s[1].z)
		var mi := MeshInstance3D.new()
		mi.mesh = bm
		mi.material_override = mat
		mi.position = s[0]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)

func hit(world_y: float, world_z: float) -> void:
	_impacts[_slot] = Vector3(0.0, world_y, world_z)
	_ages[_slot] = 0.0001
	_slot = (_slot + 1) % 4
	_push_uniforms()

func _push_uniforms() -> void:
	_mat.set_shader_parameter("impacts", _impacts)
	_mat.set_shader_parameter("impact_t", _ages)

func step(dt: float) -> void:
	var any := false
	for i in 4:
		if _ages[i] > 0.0:
			_ages[i] += dt
			if _ages[i] > 1.4:
				_ages[i] = 0.0
			any = true
	if any:
		_mat.set_shader_parameter("impact_t", _ages)
