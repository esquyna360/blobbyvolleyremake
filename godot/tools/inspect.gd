extends SceneTree

func _initialize() -> void:
	var d := DirAccess.open("res://assets/nature")
	var names := []
	for f in d.get_files():
		if f.ends_with(".fbx"):
			names.append(f.get_basename())
	names.sort()
	for f in names:
		var ps := load("res://assets/nature/%s.fbx" % f)
		var n = ps.instantiate()
		var mi: MeshInstance3D = n.get_child(0)
		var tris := 0
		var mats := []
		for s in mi.mesh.get_surface_count():
			var a := mi.mesh.surface_get_arrays(s)
			tris += (a[Mesh.ARRAY_INDEX].size() / 3) if a[Mesh.ARRAY_INDEX] else 0
			var m := mi.mesh.surface_get_material(s)
			mats.append(m.resource_name if m else "?")
		var ab := mi.mesh.get_aabb()
		print("%-24s tris=%-6d h=%.3f  %s" % [f, tris, ab.size.y, mats])
		n.free()
	quit()
