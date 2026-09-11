class_name Props
extends RefCounted

## Objetos 3D soltos (modelos CC0 do Kenney) postos à mão no cenário. Cada um
## entra com altura em metros: o modelo é medido e escalado pra caber nela.

static var _cache := {}

static func scene(dir: String, name: String) -> PackedScene:
	var path := "res://assets/models/%s/%s.glb" % [dir, name]
	if not _cache.has(path):
		_cache[path] = load(path)
	return _cache[path]

static func aabb(n: Node3D) -> AABB:
	var box := AABB()
	var first := true
	for c in n.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = c
		var b := mi.get_aabb()
		b = mi.transform * b
		var p := mi.get_parent()
		while p != n and p is Node3D:
			b = (p as Node3D).transform * b
			p = p.get_parent()
		if first:
			box = b
			first = false
		else:
			box = box.merge(b)
	return box

## `spec`: {m: modelo, dir: pasta, x, y, z, h: altura, ry: giro em graus,
## rz: inclinação, flip: espelha em x, tint: multiplicador de cor, shadow}
static func place(parent: Node3D, spec: Dictionary, quality: int) -> Node3D:
	var dir: String = spec.get("dir", "nature")
	var n: Node3D = scene(dir, spec.m).instantiate()
	var box := aabb(n)
	var h: float = spec.h
	var k := h / maxf(0.001, box.size.y)
	var root := Node3D.new()
	root.add_child(n)
	n.scale = Vector3(-k if spec.get("flip", false) else k, k, k)
	n.position = Vector3(-box.position.x * k - box.size.x * k * 0.5, -box.position.y * k, -box.position.z * k - box.size.z * k * 0.5)
	root.position = Vector3(spec.x, spec.get("y", 0.0), spec.z)
	root.rotation_degrees = Vector3(spec.get("rx", 0.0), spec.get("ry", 0.0), spec.get("rz", 0.0))
	var tint: float = spec.get("tint", 1.0)
	var shadow: bool = spec.get("shadow", quality >= 2)
	for c in n.find_children("*", "MeshInstance3D", true, false):
		var mi: MeshInstance3D = c
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if tint != 1.0:
			for i in mi.mesh.get_surface_count():
				var m := mi.mesh.surface_get_material(i)
				if m is StandardMaterial3D:
					var d: StandardMaterial3D = m.duplicate()
					d.albedo_color = Color(d.albedo_color.r * tint, d.albedo_color.g * tint,
						d.albedo_color.b * tint, 1.0)
					d.roughness = 0.95
					mi.set_surface_override_material(i, d)
	parent.add_child(root)
	return root
