extends Node

## Junta tudo: a partida de demonstração roda desde o começo e o menu fica em
## cima dela. Entrar num jogo é só trocar quem controla cada lado.

var settings := Settings.new()
var game := Game.new()
var menu := Menu.new()
var hud := Hud.new()
var touch: TouchPad
var link := NetLink.new()

var _ui := CanvasLayer.new()
const MATCH_SONGS := ["luau", "fundo", "praia"]

var _in_match := false
var _intro_was := false
var _net_pending := false
var _pause_ui: PanelContainer
var _paused := false
var _result_ui: PanelContainer
var _result_title: Label
var _result_score: Label
var _result_again: Button
var _restart: Callable

func _ready() -> void:
	settings.load_all()
	Stage.theme = settings.scene
	Controls.setup()
	randomize()

	add_child(game)
	link.name = "Net"
	add_child(link)

	_ui.layer = 3
	add_child(_ui)

	_demo()

	hud.build(Looks.body_color(settings.look), Color(0.25, 0.55, 1.0))
	hud.visible = false
	hud.pause_pressed.connect(func(): _set_pause(true))
	_ui.add_child(hud)
	_build_pause()
	_build_result()
	get_tree().set_quit_on_go_back(false)

	menu.build(settings)
	menu.play_bot.connect(_play_bot)
	menu.play_local.connect(_play_local)
	menu.host_room.connect(_host)
	menu.join_room.connect(_join)
	menu.quality_changed.connect(_requality)
	menu.look_changed.connect(_relook)
	menu.quit_game.connect(func(): get_tree().quit())
	_ui.add_child(menu)

	link.connected.connect(_on_connected)
	link.failed.connect(func(r): menu.set_status(r))
	link.closed.connect(_on_closed)
	link.hello.connect(_on_hello)

	if _is_mobile() or "--touch" in OS.get_cmdline_user_args():
		touch = TouchPad.new()
		touch.build(0)
		touch.visible = false
		_ui.add_child(touch)

	game.match_over.connect(_on_match_over)
	_dev_net()
	_dev_shot()

static func _is_mobile() -> bool:
	return OS.get_name() in ["Android", "iOS"] or DisplayServer.is_touchscreen_available()

func _demo() -> void:
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.start(settings.rules, settings.score_to_win, settings.walls, settings.quality,
		Game.Source.BOT, Game.Source.BOT, "hard",
		[Looks.roll_look(-1), Looks.roll_look(-1)])
	_in_match = false
	hud.visible = false
	Aud.set_song("menu")
	if touch != null:
		touch.visible = false

func _enter_match(left: int, right: int, diff: String, looks: Array) -> void:
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.start(settings.rules, settings.score_to_win, settings.walls, settings.quality,
		left, right, diff, looks)
	_finish_enter()

func _finish_enter() -> void:
	hud.set_colors(game.arena.blobs[BV.LEFT].body_color, game.arena.blobs[BV.RIGHT].body_color)
	_in_match = true
	Aud.set_song(MATCH_SONGS[randi() % MATCH_SONGS.size()])
	menu.visible = false
	hud.visible = true
	if game.net_side == BV.NO_PLAYER:
		game.arena.start_intro()
	else:
		hud.shout("VALENDO", UiTheme.GOLD, 1.4)
	if touch != null:
		touch.visible = true
		Controls.clear_touch()

func _play_bot(diff: String) -> void:
	settings.difficulty = diff
	settings.save()
	_restart = _play_bot.bind(diff)
	game.touch_slot = [0, -1]
	_enter_match(Game.Source.LOCAL_SOLO, Game.Source.BOT, diff,
		[settings.look, Looks.roll_look(settings.look[0])])

func _play_local() -> void:
	_restart = _play_local
	game.touch_slot = [-1, -1]
	_enter_match(Game.Source.LOCAL_P1, Game.Source.LOCAL_P2, "normal",
		[settings.look, Looks.roll_look(settings.look[0])])

func _host() -> void:
	link.stop()
	if link.host():
		_net_pending = true

func _join(addr: String) -> void:
	link.stop()
	if link.join(addr):
		_net_pending = true

## Quem abriu a sala joga na esquerda e manda as regras; quem entrou aceita.
func _on_connected(is_host: bool) -> void:
	if not is_host:
		return
	link.send_hello(BV.RIGHT, settings.look, settings.rules, settings.score_to_win,
		settings.walls)
	_start_net(BV.LEFT, [settings.look, Looks.roll_look(settings.look[0])],
		settings.rules, settings.score_to_win, settings.walls)

func _on_hello(my_side: int, host_look: Array, rules: String, stw: int, walls: bool) -> void:
	var looks := [host_look, settings.look] if my_side == BV.RIGHT else [settings.look, host_look]
	link.send_hello(BV.other(my_side), settings.look, rules, stw, walls)
	_start_net(my_side, looks, rules, stw, walls)

func _start_net(side: int, looks: Array, rules: String, stw: int, walls: bool) -> void:
	if _in_match and game.net_side != BV.NO_PLAYER:
		return
	game.touch_slot = [0 if side == BV.LEFT else -1, 0 if side == BV.RIGHT else -1]
	game.attach_link(link, side)
	game.start(rules, stw, walls, settings.quality,
		game.src[BV.LEFT], game.src[BV.RIGHT], "normal", looks)
	_net_pending = false
	_finish_enter()
	hud.shout("ONLINE", Color(0.36, 0.82, 1.0), 1.4)

func _on_closed() -> void:
	if _in_match and game.net_side != BV.NO_PLAYER:
		hud.shout("O OUTRO CAIU", Color(1.0, 0.5, 0.4), 2.2)
		await get_tree().create_timer(2.0).timeout
		_to_menu()

func _on_match_over(winner: int) -> void:
	if not _in_match:
		return
	var local2: bool = game.src[BV.RIGHT] == Game.Source.LOCAL_P2
	var mine := winner == BV.LEFT
	if game.net_side != BV.NO_PLAYER:
		mine = winner == game.net_side
	var title := ("P1 VENCE" if winner == BV.LEFT else "P2 VENCE") if local2 \
		else ("VITÓRIA!" if mine else "DERROTA")
	var col := game.arena.blobs[winner].body_color
	hud.shout(title, col.lightened(0.3), 3.0)
	_over_seq(title, col)

func _over_seq(title: String, col: Color) -> void:
	var m := game.bv
	if touch != null:
		touch.visible = false
	Controls.clear_touch()
	await get_tree().create_timer(2.6).timeout
	if not _in_match or game.bv != m:
		return
	game.set_paused(true)
	_result_title.text = title
	_result_title.add_theme_color_override("font_color", col.lightened(0.3))
	_result_score.text = "%d  —  %d" % [m.logic.scores[BV.LEFT], m.logic.scores[BV.RIGHT]]
	_result_again.visible = game.net_side == BV.NO_PLAYER
	_result_ui.visible = true
	_result_ui.pivot_offset = _result_ui.size * 0.5
	_result_ui.scale = Vector2.ONE * 0.96
	_result_ui.modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_result_ui, "scale", Vector2.ONE, 0.3) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(_result_ui, "modulate:a", 1.0, 0.3)

func _build_result() -> void:
	_result_ui = PanelContainer.new()
	_result_ui.set_anchors_preset(Control.PRESET_CENTER)
	_result_ui.anchor_left = 0.5
	_result_ui.anchor_right = 0.5
	_result_ui.anchor_top = 0.5
	_result_ui.anchor_bottom = 0.5
	_result_ui.offset_left = -230
	_result_ui.offset_right = 230
	_result_ui.offset_top = -170
	_result_ui.offset_bottom = 170
	_result_ui.add_theme_stylebox_override("panel", UiTheme.wood())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_result_ui.add_child(v)
	_result_title = UiTheme.label("", 44, UiTheme.GOLD)
	_result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_result_title)
	_result_score = UiTheme.label("", 40)
	_result_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_result_score)
	_result_again = Button.new()
	_result_again.text = "Jogar de novo"
	UiTheme.style(_result_again, Color(0.45, 0.85, 0.40))
	_result_again.pressed.connect(func():
		_result_ui.visible = false
		if _restart.is_valid():
			_restart.call())
	v.add_child(_result_again)
	var q := Button.new()
	q.text = "Menu"
	UiTheme.style(q, Color(0.6, 0.65, 0.62))
	q.pressed.connect(func():
		_result_ui.visible = false
		_to_menu())
	v.add_child(q)
	_result_ui.visible = false
	_ui.add_child(_result_ui)

func _requality(q: int) -> void:
	settings.quality = q
	settings.save()
	Stage.theme = settings.scene
	var old := game.arena
	game.remove_child(old)
	old.queue_free()
	game.arena = Arena.new()
	game.bv = null
	if _in_match:
		_demo()
		_to_menu()
	else:
		_demo()

func _relook(look: Array) -> void:
	if game.bv != null:
		game.arena.blobs[BV.LEFT].set_look(look)

func _to_menu() -> void:
	_paused = false
	_pause_ui.visible = false
	_result_ui.visible = false
	link.stop()
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	_demo()
	menu.visible = true
	menu.show_page("main")

func _process(dt: float) -> void:
	if game.bv != null and _in_match:
		hud.update(game.bv, dt)
		var w := game.bv.world
		var intro := game.arena.intro_active()
		hud.ball_hint(game.arena.ball_screen_hint(Map.gx(w.ball_x), Map.gy(w.ball_y)) \
			if not intro else Vector3(-1, -1, 0), dt)
		hud.modulate.a = clampf(hud.modulate.a + (( -1.0 if intro else 1.0) * dt * 3.0), 0.0, 1.0)
		if touch != null:
			touch.visible = not intro and not _paused
		if _intro_was and not intro:
			hud.shout("VALENDO", UiTheme.GOLD, 1.2)
		_intro_was = intro
		if touch != null:
			var side := game.net_side if game.net_side != BV.NO_PLAYER else BV.LEFT
			touch.charge = game.bv.world.charge[side] / BV.SPECIAL_FULL

func _unhandled_input(e: InputEvent) -> void:
	if _in_match and game.arena.intro_active() and e.is_pressed() \
			and not e.is_action_pressed("pause"):
		game.arena.skip_intro()
		return
	if e.is_action_pressed("pause"):
		if _in_match:
			_set_pause(not _paused)
		get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if _in_match:
			_set_pause(not _paused)
		elif menu.visible and menu._page != "main":
			menu.show_page("main")

func _build_pause() -> void:
	_pause_ui = PanelContainer.new()
	_pause_ui.set_anchors_preset(Control.PRESET_CENTER)
	_pause_ui.anchor_left = 0.5
	_pause_ui.anchor_right = 0.5
	_pause_ui.anchor_top = 0.5
	_pause_ui.anchor_bottom = 0.5
	_pause_ui.offset_left = -170
	_pause_ui.offset_right = 170
	_pause_ui.offset_top = -120
	_pause_ui.offset_bottom = 120
	_pause_ui.add_theme_stylebox_override("panel", UiTheme.wood())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_pause_ui.add_child(v)
	var t := UiTheme.label("PAUSA", 30, UiTheme.GOLD)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var c := Button.new()
	c.text = "Continuar"
	UiTheme.style(c, Color(0.45, 0.85, 0.40))
	c.pressed.connect(func(): _set_pause(false))
	v.add_child(c)
	var q := Button.new()
	q.text = "Sair da partida"
	UiTheme.style(q, Color(0.9, 0.45, 0.35))
	q.pressed.connect(func():
		_set_pause(false)
		_to_menu())
	v.add_child(q)
	_pause_ui.visible = false
	_ui.add_child(_pause_ui)

func _set_pause(p: bool) -> void:
	# online não para o mundo: o outro lado continua, então só abre o painel
	_paused = p
	_pause_ui.visible = p
	if game.net_side == BV.NO_PLAYER:
		game.set_paused(p)
	if touch != null:
		touch.visible = _in_match and not p
		Controls.clear_touch()


## Ferramenta de desenvolvimento: `-- --shot=arquivo.png --wait=N` salva um
## quadro e sai. É como eu confiro o visual sem deixar janela aberta.
func _dev_shot() -> void:
	var path := ""
	var wait := 200
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--scene="):
			settings.scene = a.substr(8)
			_requality(settings.quality)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			path = a.substr(7)
		elif a.begins_with("--wait="):
			wait = int(a.substr(7))
		elif a == "--nomenu":
			menu.visible = false
		elif a == "--auto":
			_play_bot(settings.difficulty)
		elif a.begins_with("--page="):
			menu.show_page(a.substr(7))
		elif a.begins_with("--quality="):
			_requality(int(a.substr(10)))
		elif a.begins_with("--stw="):
			settings.score_to_win = int(a.substr(6))
		elif a == "--bots":
			_restart = _dev_bots
			_dev_bots()
	if path == "":
		return
	for i in wait:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
	if game.bv != null:
		print("frame=%d placar=%d-%d rally=%d slow=%.2f" % [game.bv.frame,
			game.bv.logic.scores[0], game.bv.logic.scores[1], game.bv.logic.rally,
			game.slow_factor()])
	print("shot: ", path)
	get_tree().quit()


## Teste de rede sem ninguém no teclado: os dois lados geram a mesma sequência
## pseudoaleatória de entrada e comparam checksum. Se a resimulação do rollback
## divergisse, aparecia aqui.
func _dev_bots() -> void:
	game.touch_slot = [-1, -1]
	_enter_match(Game.Source.BOT, Game.Source.BOT, "hard",
		[Looks.roll_look(-1), Looks.roll_look(-1)])

func _dev_net() -> void:
	var mode := ""
	var frames := 1800
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--nettest="):
			mode = a.substr(10)
		elif a.begins_with("--frames="):
			frames = int(a.substr(9))
	if mode == "":
		return
	game.script_input = func(f: int, side: int) -> int:
		var h := (f * 2654435761 + side * 40503) & 0xFFFFFFFF
		h ^= h >> 13
		h = (h * 1274126177) & 0xFFFFFFFF
		return (h >> 7) & 31
	if mode == "host":
		_host()
	else:
		_join("127.0.0.1")
	while not (_in_match and game.rb != null):
		await get_tree().process_frame
	game.src[BV.LEFT] = Game.Source.SCRIPT
	game.src[BV.RIGHT] = Game.Source.SCRIPT
	var t0 := Time.get_ticks_msec()
	while game.rb.frame < frames and Time.get_ticks_msec() - t0 < 90000:
		await get_tree().process_frame
	# congela e deixa o que estava no fio chegar: só o estado confirmado dos
	# dois lados pode ser comparado
	game.set_paused(true)
	var stop := game.rb.frame
	for i in 120:
		game._net_catchup()
		await get_tree().process_frame
	var cmp := stop - 10
	var ok := game.rb.restore(game.bv, cmp)
	print("nettest %s quadro=%d confirmado=%d comparado=%d(%s) checksum=%d placar=%d-%d" % [
		mode, stop, game.rb.confirmed, cmp, "ok" if ok else "faltou",
		game.bv.checksum(), game.bv.logic.scores[0], game.bv.logic.scores[1]])
	get_tree().quit()
