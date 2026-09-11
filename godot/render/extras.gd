class_name Extras
extends RefCounted

## Peças construídas por código pros cenários que os kits não cobrem: prédios
## acesos, teto de caverna, muro de ruína, lanterna de acampamento, boneco de
## neve. Cada uma é uma função; o tema diz qual chamar.

static func mat(col: Color, rough := 0.9, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	return m

static func glow(col: Color, energy: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.emission_enabled = true
	m.emission = col
	m.emission_energy_multiplier = energy
	return m

static func box(parent: Node3D, size: Vector3, pos: Vector3, m: Material,
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

static func cyl(parent: Node3D, r_top: float, r_bot: float, h: float, pos: Vector3,
		m: Material, rot := Vector3.ZERO) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = r_top
	cm.bottom_radius = r_bot
	cm.height = h
	cm.radial_segments = 10
	var mi := MeshInstance3D.new()
	mi.mesh = cm
	mi.material_override = m
	mi.position = pos
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

static func sphere(parent: Node3D, r: float, pos: Vector3, m: Material) -> MeshInstance3D:
	var sm := SphereMesh.new()
	sm.radius = r
	sm.height = r * 2.0
	sm.radial_segments = 14
	sm.rings = 8
	var mi := MeshInstance3D.new()
	mi.mesh = sm
	mi.material_override = m
	mi.position = pos
	parent.add_child(mi)
	return mi

static func light(parent: Node3D, col: Color, e: float, range_: float, pos: Vector3,
		shadow := false) -> OmniLight3D:
	var l := OmniLight3D.new()
	l.light_color = col
	l.light_energy = e
	l.omni_range = range_
	l.shadow_enabled = shadow
	l.position = pos
	parent.add_child(l)
	return l

# ------------------------------------------------------------------ telhado

static func city(st: Node3D, q: int, rng: RandomNumberGenerator) -> void:
	var win: Texture2D = load("res://assets/stage/roof/windows.png")
	var n := 34 if q >= 1 else 20
	for i in n:
		var w := rng.randf_range(4.0, 10.0)
		var h := rng.randf_range(8.0, 34.0)
		var x := rng.randf_range(-70.0, 70.0)
		var z := -22.0 - rng.randf_range(0.0, 60.0)
		if absf(x) < 14.0 and z > -40.0:
			h *= 0.5
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.06, 0.06, 0.1)
		m.emission_enabled = true
		m.emission_texture = win
		m.emission_energy_multiplier = 1.4
		m.uv1_scale = Vector3(0.11, 0.11, 0.11)
		m.uv1_triplanar = true
		m.uv1_triplanar_sharpness = 8.0
		m.roughness = 0.8
		box(st, Vector3(w, h, w * rng.randf_range(0.6, 1.2)), Vector3(x, h * 0.5 - 1.0, z), m,
			Vector3.ZERO, false)
	var par := mat(Color(0.28, 0.29, 0.33), 0.95)
	box(st, Vector3(120.0, 1.1, 0.7), Vector3(0.0, 0.55, -15.6), par)
	box(st, Vector3(120.0, 0.25, 0.9), Vector3(0.0, 1.2, -15.6), mat(Color(0.5, 0.5, 0.54)))
	var dark := mat(Color(0.12, 0.12, 0.15), 0.85)
	for k in 4:
		var x: float = [-20.0, -12.5, 13.0, 21.0][k]
		box(st, Vector3(1.8, 1.2, 1.8), Vector3(x, 0.6, -11.5 - k * 0.6), dark)
		box(st, Vector3(1.4, 0.15, 1.4), Vector3(x, 1.28, -11.5 - k * 0.6), mat(Color(0.3, 0.3, 0.34)))
	cyl(st, 0.05, 0.08, 14.0, Vector3(-24.0, 7.0, -19.0), dark)
	var blink := light(st, Color(1.0, 0.15, 0.1), 2.5, 9.0, Vector3(-24.0, 14.2, -19.0))
	blink.set_meta("blink", true)
	st.get("_torch_fx").append(blink)
	var neon := glow(Color(1.0, 0.25, 0.7), 4.0)
	box(st, Vector3(7.0, 2.2, 0.3), Vector3(15.5, 7.5, -15.0), neon, Vector3.ZERO, false)
	box(st, Vector3(7.4, 2.6, 0.2), Vector3(15.5, 7.5, -15.2), mat(Color(0.05, 0.05, 0.07)), Vector3.ZERO, false)
	cyl(st, 0.1, 0.1, 6.0, Vector3(13.0, 3.3, -15.1), dark)
	cyl(st, 0.1, 0.1, 6.0, Vector3(18.0, 3.3, -15.1), dark)
	light(st, Color(1.0, 0.3, 0.75), 3.5, 20.0, Vector3(15.5, 7.0, -12.0), q >= 2)
	var cyan := glow(Color(0.3, 0.9, 1.0), 3.0)
	box(st, Vector3(0.35, 5.0, 0.35), Vector3(-17.0, 3.0, -15.0), cyan, Vector3.ZERO, false)
	light(st, Color(0.3, 0.85, 1.0), 2.0, 14.0, Vector3(-17.0, 3.5, -12.5))
	var pipe := mat(Color(0.35, 0.3, 0.28), 0.7, 0.3)
	cyl(st, 0.35, 0.35, 30.0, Vector3(0.0, 0.5, 17.5), pipe, Vector3(0, 0, 90))
	cyl(st, 0.5, 0.5, 1.2, Vector3(-7.0, 0.5, 17.5), pipe, Vector3(0, 0, 90))
	cyl(st, 0.5, 0.5, 1.2, Vector3(6.0, 0.5, 17.5), pipe, Vector3(0, 0, 90))

# ------------------------------------------------------------------ caverna

static func cave(st: Node3D, q: int, rng: RandomNumberGenerator) -> void:
	var rock := mat(Color(0.30, 0.20, 0.17), 0.95)
	var dark := mat(Color(0.16, 0.10, 0.09), 1.0)
	var ceil_pm := PlaneMesh.new()
	ceil_pm.size = Vector2(160, 120)
	var ceil_mi := MeshInstance3D.new()
	ceil_mi.mesh = ceil_pm
	ceil_mi.material_override = dark
	ceil_mi.position = Vector3(0, 16.0, -20.0)
	ceil_mi.rotation_degrees = Vector3(180, 0, 0)
	st.add_child(ceil_mi)
	var n := 38 if q >= 1 else 18
	for i in n:
		var x := rng.randf_range(-40.0, 40.0)
		var z := rng.randf_range(-40.0, 14.0)
		var h := rng.randf_range(2.0, 6.5)
		var r := rng.randf_range(0.35, 1.1)
		if absf(x) < 12.0 and z > -8.0:
			h *= 0.6
		cyl(st, 0.0, r, h, Vector3(x, 16.0 - h * 0.5, z), rock, Vector3(180, 0, 0))
	for i in 10:
		var x := rng.randf_range(-34.0, 34.0)
		var z := rng.randf_range(-30.0, -14.0)
		var h := rng.randf_range(1.5, 4.5)
		cyl(st, 0.0, rng.randf_range(0.4, 1.0), h, Vector3(x, h * 0.5, z), rock)
	var back := mat(Color(0.22, 0.14, 0.12), 1.0)
	box(st, Vector3(180, 40, 4), Vector3(0, 12, -46), back, Vector3.ZERO, false)
	box(st, Vector3(6, 40, 120), Vector3(-36, 12, -10), back, Vector3.ZERO, false)
	box(st, Vector3(6, 40, 120), Vector3(36, 12, -10), back, Vector3.ZERO, false)
	var cols := [Color(0.35, 0.95, 1.0), Color(1.0, 0.4, 0.9), Color(0.5, 1.0, 0.6)]
	var spots := [Vector3(-14.5, 0, 3.0), Vector3(15.0, 0, 1.0), Vector3(-10.0, 0, -12.0),
		Vector3(11.5, 0, -13.5), Vector3(-22.0, 0, -8.0), Vector3(23.0, 0, -6.0),
		Vector3(8.5, 0, 16.5), Vector3(-6.0, 15.5, 8.0)]
	for k in spots.size():
		var p: Vector3 = spots[k]
		var c: Color = cols[k % cols.size()]
		var gm := glow(c, 2.4)
		gm.albedo_color = c.darkened(0.4)
		var down := p.y > 10.0
		for j in 4:
			var h := rng.randf_range(1.0, 2.6) * (0.6 if k >= 6 else 1.0)
			var off := Vector3(rng.randf_range(-0.6, 0.6), 0, rng.randf_range(-0.5, 0.5))
			var tilt := Vector3(rng.randf_range(-25, 25) + (180.0 if down else 0.0), rng.randf_range(0, 360), rng.randf_range(-25, 25))
			cyl(st, 0.0, rng.randf_range(0.15, 0.32), h, p + off + Vector3(0, (-h if down else h) * 0.45, 0), gm, tilt)
		light(st, c, 1.6, 9.0, p + Vector3(0, -1.2 if down else 1.4, 0))
	var lava_pm := PlaneMesh.new()
	lava_pm.size = Vector2(420, 46)
	var lava := MeshInstance3D.new()
	lava.mesh = lava_pm
	var lm := StandardMaterial3D.new()
	var lt: Texture2D = load("res://assets/stage/cave/lava.png")
	lm.albedo_texture = lt
	lm.emission_enabled = true
	lm.emission_texture = lt
	lm.emission_energy_multiplier = 1.6
	lm.uv1_scale = Vector3(40, 4.5, 1)
	lm.texture_repeat = true
	lava.material_override = lm
	lava.position = Vector3(0, -0.05, -39.0)
	lava.set_meta("lava", true)
	st.add_child(lava)
	light(st, Color(1.0, 0.45, 0.12), 2.6, 40.0, Vector3(0, 3.0, -30.0))
	light(st, Color(1.0, 0.5, 0.15), 1.4, 30.0, Vector3(-20, 2.0, -24.0))
	light(st, Color(1.0, 0.5, 0.15), 1.4, 30.0, Vector3(20, 2.0, -24.0))

# ------------------------------------------------------------------- ruínas

static func ruins(st: Node3D, q: int, rng: RandomNumberGenerator) -> void:
	var stone := mat(Color(0.62, 0.62, 0.52), 0.92)
	var moss := mat(Color(0.42, 0.52, 0.32), 0.95)
	for i in 22:
		var x := -22.0 + i * 2.1 + rng.randf_range(-0.3, 0.3)
		if absf(x) < 4.5:
			continue
		var levels := 1 + int(rng.randf() * 3.5)
		for l in levels:
			var w := rng.randf_range(1.6, 2.2)
			var h := rng.randf_range(0.9, 1.3)
			box(st, Vector3(w, h, 1.8), Vector3(x + rng.randf_range(-0.15, 0.15), h * 0.5 + l * 1.1, -14.5 + rng.randf_range(-0.2, 0.2)),
				moss if rng.randf() < 0.3 else stone, Vector3(0, rng.randf_range(-6, 6), 0))
	box(st, Vector3(9.0, 1.3, 1.3), Vector3(-10.5, 11.4, 13.0), stone, Vector3(0, 10, -6))
	box(st, Vector3(1.4, 12.0, 1.4), Vector3(-14.5, 6.0, 13.6), stone)
	box(st, Vector3(1.6, 0.5, 1.6), Vector3(-14.5, 12.2, 13.6), stone)
	for k in 6:
		box(st, Vector3(1.4, 0.7, 1.2), Vector3(-6.2 + k * 0.5, 0.35 + k * 0.0, 16.0 + k * 0.4), moss if k % 2 else stone,
			Vector3(0, k * 17.0, 0))
	box(st, Vector3(2.0, 0.8, 1.6), Vector3(10.5, 0.4, 15.5), stone, Vector3(0, -20, 0))
	box(st, Vector3(1.6, 0.7, 1.4), Vector3(11.3, 1.15, 15.9), moss, Vector3(0, 12, 8))
	var steps := 4
	for s in steps:
		box(st, Vector3(30.0, 0.5, 1.2), Vector3(0, 0.25 + s * 0.5, -10.5 - s * 1.2), stone)

# -------------------------------------------------------------- acampamento

static func camp(st: Node3D, q: int, rng: RandomNumberGenerator) -> void:
	var wood := mat(Color(0.32, 0.22, 0.14), 0.9)
	var post := cyl(st, 0.09, 0.11, 7.5, Vector3(9.5, 3.75, 14.0), wood)
	cyl(st, 0.05, 0.05, 2.4, Vector3(8.3, 7.4, 14.0), wood, Vector3(0, 0, 90))
	cyl(st, 0.02, 0.02, 1.2, Vector3(7.2, 6.7, 14.0), mat(Color(0.1, 0.1, 0.1)))
	var lamp := glow(Color(1.0, 0.8, 0.45), 3.0)
	box(st, Vector3(0.5, 0.7, 0.5), Vector3(7.2, 5.8, 14.0), lamp, Vector3.ZERO, false)
	box(st, Vector3(0.7, 0.12, 0.7), Vector3(7.2, 6.2, 14.0), mat(Color(0.15, 0.12, 0.1)))
	box(st, Vector3(0.7, 0.12, 0.7), Vector3(7.2, 5.4, 14.0), mat(Color(0.15, 0.12, 0.1)))
	var l := light(st, Color(1.0, 0.75, 0.4), 2.4, 12.0, Vector3(7.2, 5.6, 13.6), q >= 2)
	st.get("_torch_fx").append(l)
	var bulbs := [Color(1.0, 0.5, 0.4), Color(1.0, 0.9, 0.4), Color(0.5, 0.9, 1.0), Color(0.7, 1.0, 0.5)]
	for k in 12:
		var t := float(k) / 11.0
		var x := lerpf(-15.0, 9.3, t)
		var y := 7.3 - sin(t * PI) * 1.6
		var c: Color = bulbs[k % 4]
		sphere(st, 0.13, Vector3(x, y, 13.6), glow(c, 2.5))
	var im := ImmediateMesh.new()
	im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for k in 24:
		var t := float(k) / 23.0
		im.surface_add_vertex(Vector3(lerpf(-15.0, 9.3, t), 7.3 - sin(t * PI) * 1.6 + 0.13, 13.6))
	im.surface_end()
	var wire := MeshInstance3D.new()
	wire.mesh = im
	wire.material_override = mat(Color(0.05, 0.05, 0.05))
	st.add_child(wire)
	cyl(st, 0.09, 0.11, 7.5, Vector3(-15.0, 3.75, 13.6), wood)

# -------------------------------------------------------------------- neve

static func snow(st: Node3D, q: int, rng: RandomNumberGenerator) -> void:
	var white := mat(Color(0.96, 0.97, 1.0), 0.8)
	var base := Vector3(12.5, 0, 4.5)
	sphere(st, 1.0, base + Vector3(0, 0.9, 0), white)
	sphere(st, 0.72, base + Vector3(0, 2.3, 0), white)
	sphere(st, 0.52, base + Vector3(0, 3.35, 0), white)
	cyl(st, 0.0, 0.09, 0.7, base + Vector3(-0.45, 3.35, 0.1), mat(Color(1.0, 0.5, 0.15)), Vector3(0, 0, 90))
	var coal := mat(Color(0.08, 0.08, 0.08))
	sphere(st, 0.07, base + Vector3(-0.35, 3.55, 0.2), coal)
	sphere(st, 0.07, base + Vector3(-0.35, 3.55, -0.2), coal)
	for k in 3:
		sphere(st, 0.06, base + Vector3(-0.66, 2.55 - k * 0.3, 0), coal)
	cyl(st, 0.45, 0.45, 0.5, base + Vector3(0, 3.95, 0), coal)
	cyl(st, 0.7, 0.7, 0.08, base + Vector3(0, 3.75, 0), coal)
	cyl(st, 0.03, 0.03, 1.6, base + Vector3(0.1, 2.3, 0.5), mat(Color(0.35, 0.22, 0.12)), Vector3(0, 0, -50))
	var wood := mat(Color(0.42, 0.28, 0.16), 0.9)
	cyl(st, 0.08, 0.1, 3.0, Vector3(-12.5, 1.5, 6.5), wood)
	box(st, Vector3(1.8, 0.6, 0.1), Vector3(-12.2, 2.6, 6.5), wood, Vector3(0, 0, 8))
	box(st, Vector3(1.9, 0.18, 0.14), Vector3(-12.2, 2.95, 6.5), white, Vector3(0, 0, 8))
	var fence := mat(Color(0.36, 0.25, 0.15))
	for k in 9:
		var x := -22.0 + k * 1.6
		cyl(st, 0.06, 0.07, 1.2, Vector3(x, 0.6, -12.5), fence)
	box(st, Vector3(13.0, 0.12, 0.08), Vector3(-15.6, 0.95, -12.5), fence)
	box(st, Vector3(13.0, 0.12, 0.08), Vector3(-15.6, 0.55, -12.5), fence)
