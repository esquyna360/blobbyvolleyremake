extends Node3D

var _t := 0.0
var _blobs: Array = []
var _states := [0.0, -0.42, 0.40]
var _out := ""

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			_out = a.substr(6)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0.5, 0.5, 0.5)
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(0.5, 0.5, 0.5)
	env.environment.ambient_light_energy = 1.0
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 25, 0)
	sun.light_energy = 1.2
	add_child(sun)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 9.6
	cam.position = Vector3(0, 0, 12)
	add_child(cam)
	var ids: Array = ["bone", "chapeu", "gorro", "coroa", "bandana", "coque", "longo", "antenas"]
	var rosa := 0
	for k in Looks.BODY_COLORS.size():
		if Looks.BODY_COLORS[k]["id"] == "rosa":
			rosa = k
	var col := 0
	for id in ids:
		var si := 0
		for k in Looks.HAIR_STYLES.size():
			if Looks.HAIR_STYLES[k]["id"] == id:
				si = k
		for row in 3:
			var b := BlobView.new(BV.LEFT, false)
			b.set_look([rosa, si, 0 if row != 1 else 4])
			b.position = Vector3(-7.7 + col * 2.2, 2.55 - row * 2.7 - 0.75, 0)
			add_child(b)
			_blobs.append([b, _states[row]])
		col += 1

func _process(dt: float) -> void:
	_t += dt
	for e in _blobs:
		var b: BlobView = e[0]
		var d: float = e[1]
		b.pose(dt, _t)
		var sy := 1.0 + d
		var sxz := 1.0 / sqrt(maxf(0.45, 1.0 + d))
		b._mat.set_shader_parameter("squash", Vector3(sxz, sy, sxz))
		b._hair.position.y = (b.HEAD_OFF + b.HEAD_R * 0.7) * sy - b.HEAD_R * 0.7
		b._hair.scale = Vector3.ONE * b.HEAD_R
	if _t > 1.0 and _out != "":
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(_out)
		get_tree().quit()
