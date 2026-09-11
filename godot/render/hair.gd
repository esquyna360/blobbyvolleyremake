class_name Hair3D
extends Node3D

## Mecha como tubo de raio variável: a curva e a espessura vêm de Looks, então o
## penteado é o mesmo desenho da versão web.

const RING := 8

var _mesh := MeshInstance3D.new()
var _mat := StandardMaterial3D.new()
var _current := -1

func _init() -> void:
	_mat.roughness = 0.62
	_mat.metallic = 0.04
	_mesh.material_override = _mat
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(_mesh)

static func _tube(beads: Array) -> Array:
	var n := beads.size()
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var idx := PackedInt32Array()
	for i in n:
		var b: Array = beads[i]
		var a: Array = beads[maxi(0, i - 1)]
		var c: Array = beads[mini(n - 1, i + 1)]
		var tx := float(c[0]) - float(a[0])
		var ty := float(c[1]) - float(a[1])
		var l := sqrt(tx * tx + ty * ty)
		if l == 0.0:
			l = 1.0
		tx /= l
		ty /= l
		for j in RING:
			var th := (float(j) / RING) * TAU
			var cs := cos(th)
			var sn := sin(th)
			var dx := -ty * cs
			var dy := tx * cs
			var dz := sn
			pos.append(Vector3(float(b[0]) + dx * float(b[2]), float(b[1]) + dy * float(b[2]), dz * float(b[2])))
			nor.append(Vector3(dx, dy, dz))
	for i in n - 1:
		for j in RING:
			var a := i * RING + j
			var b := i * RING + ((j + 1) % RING)
			idx.append_array([a, a + RING, b, b, a + RING, b + RING])
	var tip: Array = beads[n - 1]
	var tip_at := pos.size()
	pos.append(Vector3(float(tip[0]), float(tip[1]), 0.0))
	nor.append(Vector3(0, 0, 1))
	for j in RING:
		idx.append_array([(n - 1) * RING + j, tip_at, (n - 1) * RING + ((j + 1) % RING)])
	return [pos, nor, idx]

static func _sphere(center: Vector2, r: float, seg := 10, rings := 8) -> Array:
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var idx := PackedInt32Array()
	for j in rings + 1:
		var v := float(j) / rings * PI
		for i in seg + 1:
			var u := float(i) / seg * TAU
			var d := Vector3(sin(v) * sin(u), cos(v), sin(v) * cos(u))
			pos.append(Vector3(center.x, center.y, 0.0) + d * r)
			nor.append(d)
	var row := seg + 1
	for j in rings:
		for i in seg:
			var a := j * row + i
			idx.append_array([a, a + row, a + 1, a + 1, a + row, a + row + 1])
	return [pos, nor, idx]

func set_look(look: Array) -> void:
	if look[1] != _current:
		_current = look[1]
		_build(look)
	var hex := Looks.hair_color(look)
	_mat.albedo_color = hex
	# cabelo escuro sumia na sombra da mata: um resto de emissão o mantém lido
	_mat.emission_enabled = true
	_mat.emission = Looks.shade(hex, 0.34)
	_mat.emission_energy_multiplier = 0.35

func _build(look: Array) -> void:
	var st := Looks.hair_style(look)
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var idx := PackedInt32Array()
	var parts := []
	for t in st.tufts:
		parts.append(_tube(Looks.tuft_beads(t)))
	for p in st.puffs:
		parts.append(_sphere(Looks.puff_center(p), float(p[2])))
	for part in parts:
		var base := pos.size()
		pos.append_array(part[0])
		nor.append_array(part[1])
		for i in part[2]:
			idx.append(base + i)
	if pos.is_empty():
		_mesh.mesh = null
		return
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = pos
	arr[Mesh.ARRAY_NORMAL] = nor
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	_mesh.mesh = m
