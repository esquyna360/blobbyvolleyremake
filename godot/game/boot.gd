extends Node

## Entrada de teste. `--q=0..3` escolhe a qualidade, `--shot=arquivo.png` salva
## um quadro depois de alguns segundos e sai — é como eu confiro o cenário sem
## deixar uma janela aberta na cara de ninguém.

var _shot := ""
var _frames := 0
var _wait := 150
var _zoom := false
var _g: Game
var _fps_sum := 0.0
var _fps_n := 0.0

func _ready() -> void:
	process_priority = 100
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0
	var q := 1
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--q="):
			q = int(a.substr(4))
		elif a.begins_with("--shot="):
			_shot = a.substr(7)
		elif a == "--zoom":
			_zoom = true
		elif a.begins_with("--wait="):
			_wait = int(a.substr(7))
	var g := Game.new()
	add_child(g)
	g.start("default", 15, true, q, Game.Source.BOT, Game.Source.BOT, "normal", [[0, 1, 3], [7, 4, 6]])
	_g = g

func _process(_dt: float) -> void:
	if _shot == "":
		return
	_frames += 1
	if _frames > _wait - 300:
		_fps_sum += Engine.get_frames_per_second()
		_fps_n += 1
	if _zoom and _g != null:
		var b := _g.arena.blobs[0]
		_g.arena.camera.position = b.position + Vector3(0.0, 0.35, 3.0)
		_g.arena.camera.look_at(b.position + Vector3(0, 0.35, 0), Vector3.UP)
		_g.arena.camera.fov = 45.0
	if _frames < _wait:
		return
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(_shot)
	print("shot: ", _shot)
	print("process: %.2fms  fisica: %.2fms  objetos: %d" % [
		Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		Performance.get_monitor(Performance.OBJECT_COUNT)])
	print("fps medio: %.1f  draw calls: %d  tris: %d" % [
		_fps_sum / maxf(1.0, _fps_n),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])
	get_tree().quit()
