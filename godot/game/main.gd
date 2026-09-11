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
var _in_match := false
var _net_pending := false

func _ready() -> void:
	settings.load_all()
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
	_ui.add_child(hud)

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

	if _is_mobile():
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
	menu.visible = false
	hud.visible = true
	hud.shout("VALENDO", UiTheme.GOLD, 1.4)
	if touch != null:
		touch.visible = true
		Controls.clear_touch()

func _play_bot(diff: String) -> void:
	settings.difficulty = diff
	settings.save()
	game.touch_slot = [0, -1]
	_enter_match(Game.Source.LOCAL_SOLO, Game.Source.BOT, diff,
		[settings.look, Looks.roll_look(settings.look[0])])

func _play_local() -> void:
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
	var mine := winner == BV.LEFT
	if game.net_side != BV.NO_PLAYER:
		mine = winner == game.net_side
	elif game.src[BV.RIGHT] == Game.Source.LOCAL_P2:
		mine = true
	hud.shout("GANHOU!" if mine else "PERDEU", UiTheme.GOLD if mine
		else Color(0.8, 0.4, 0.4), 3.0)

func _requality(q: int) -> void:
	settings.quality = q
	settings.save()
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

func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("pause"):
		if _in_match:
			_to_menu()
		get_viewport().set_input_as_handled()


## Ferramenta de desenvolvimento: `-- --shot=arquivo.png --wait=N` salva um
## quadro e sai. É como eu confiro o visual sem deixar janela aberta.
func _dev_shot() -> void:
	var path := ""
	var wait := 200
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
	if path == "":
		return
	for i in wait:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
	print("shot: ", path)
	get_tree().quit()


## Teste de rede sem ninguém no teclado: os dois lados geram a mesma sequência
## pseudoaleatória de entrada e comparam checksum. Se a resimulação do rollback
## divergisse, aparecia aqui.
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
