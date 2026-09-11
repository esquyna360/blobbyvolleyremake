class_name Portrait
extends SubViewportContainer

## Cara do blob em miniatura pra menu e torre: um mundinho próprio com o mesmo
## shader do jogo, então o retrato é o personagem, não um desenho dele.

var blob: BlobView
var _vp := SubViewport.new()
var _t := randf() * 10.0
var mood := "calm"

func _init(look: Array, m: String, px := 128, facing := BV.LEFT) -> void:
	mood = m
	stretch = true
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	custom_minimum_size = Vector2(px, px)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_vp.own_world_3d = true
	_vp.transparent_bg = true
	_vp.size = Vector2i(px, px)
	_vp.msaa_3d = Viewport.MSAA_2X
	_vp.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	add_child(_vp)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0, 0, 0, 0)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.7, 0.75, 0.8)
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.environment = e
	_vp.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-40, 25, 0)
	key.light_energy = 1.3
	key.shadow_enabled = false
	_vp.add_child(key)
	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-20, 170, 0)
	rim.light_color = Color(1.0, 0.9, 0.7)
	rim.light_energy = 0.8
	rim.shadow_enabled = false
	_vp.add_child(rim)
	var cam := Camera3D.new()
	cam.fov = 26.0
	cam.position = Vector3(0.0, 0.45, 3.4)
	cam.look_at_from_position(cam.position, Vector3(0.0, 0.3, 0.0), Vector3.UP)
	cam.fov = 30.0
	_vp.add_child(cam)
	blob = BlobView.new(facing, false)
	blob.set_look(look)
	blob.position = Vector3(0.0, 0.0, 0.0)
	blob.rotation.y = 0.2 if facing == BV.LEFT else -0.2
	blob.face.set_mood(m, 999.0, 9)
	_vp.add_child(blob)

func set_look(look: Array) -> void:
	blob.set_look(look)

func _process(dt: float) -> void:
	if not is_visible_in_tree():
		return
	_t += dt
	blob.face.set_mood(mood, 999.0, 9)
	blob.pose(dt, _t)
