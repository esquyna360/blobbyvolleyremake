extends Node

## Junta tudo: a partida de demonstração roda desde o começo e o menu fica em
## cima dela. Entrar num jogo é só trocar quem controla cada lado. O fim da
## partida é uma máquina de estados em _process, sem await, pra nunca travar.

var settings := Settings.new()
var game := Game.new()
var menu := Menu.new()
var hud := Hud.new()
var touch: TouchPad
var link := NetLink.new()

var _ui := CanvasLayer.new()
const MATCH_SONGS := ["rally", "blitz", "sunset"]

enum Mode { NONE, CAMPAIGN, VERSUS, NET, BOTS }
var mode := Mode.NONE
var level := 1
var _in_match := false
var _intro_was := false
var _net_pending := false
var _pause_ui: PanelContainer
var _paused := false
var _result_ui: PanelContainer
var _result_eyebrow: Label
var _result_title: Label
var _result_score: Label
var _result_line: Label
var _result_next: Button
var _result_again: Button
var _card_step := 0
var _over_t := -1.0
var _over_winner := BV.NO_PLAYER
var _over_shown := false
var _foe: Dictionary = {}
var _foe_line_t := 0.0
var _voice_left := 0
var _voice_t := 0.0
var _last_foe_score := 0
var _rotate_ui: Control
var _nat_tag := ["", ""]
var _bots_skill := 2.4
var _bots_run := 0

func _ready() -> void:
	UiTheme.install_glyphs()
	settings.load_all()
	Stage.theme = "anoitecer"
	settings.scene = "anoitecer"
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
	_build_rotate()
	get_tree().set_quit_on_go_back(false)

	menu.build(settings)
	menu.play_campaign.connect(_play_campaign)
	menu.play_versus.connect(_play_versus)
	menu.play_bots.connect(_play_bots)
	menu.quality_changed.connect(_requality)
	menu.look_changed.connect(_relook)
	menu.quit_game.connect(func(): get_tree().quit())
	_ui.add_child(menu)

	link.connected.connect(_on_connected)
	link.closed.connect(_on_closed)
	link.hello.connect(_on_hello)

	_setup_touch()
	get_viewport().size_changed.connect(_refit_ui)
	_refit_ui()
	game.match_over.connect(_on_match_over)
	game.arena.goo.connect(hud.splat)
	_dev_net()
	_dev_shot()

## Celular: a tela é pequena em centímetros, não em pixels. Sem isto a interface
## desenhada para 1280x720 vira letra de bula e alvo de toque de 3 mm.
func _refit_ui() -> void:
	var win := get_window()
	var want := 1.0
	if _want_touch():
		var sc := maxf(1.0, DisplayServer.screen_get_scale())
		var css_h := float(DisplayServer.window_get_size().y) / sc
		if "--touch" in OS.get_cmdline_user_args():
			css_h = float(DisplayServer.window_get_size().y)
		want = clampf(720.0 / maxf(340.0, css_h * 1.15), 1.0, 2.0)
	if absf(win.content_scale_factor - want) > 0.02:
		win.content_scale_factor = want
		if menu != null:
			menu.relayout.call_deferred()
	if hud != null:
		hud.fit(want > 1.02 or get_viewport().get_visible_rect().size.y < 560.0)


func _want_touch() -> bool:
	if settings.touch >= 0:
		return settings.touch == 1
	return OS.get_name() in ["Android", "iOS"] or DisplayServer.is_touchscreen_available() \
		or "--touch" in OS.get_cmdline_user_args()

func _setup_touch() -> void:
	if touch != null:
		_ui.remove_child(touch)
		touch.queue_free()
		touch = null
	if not _want_touch():
		return
	touch = TouchPad.new()
	touch.build(0)
	touch.visible = false
	touch.emote.connect(func(id):
		game.emote(game.net_side if game.net_side != BV.NO_PLAYER else BV.LEFT, id))
	_ui.add_child(touch)
	_refit_ui()

func _demo() -> void:
	mode = Mode.NONE
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.start(MatchParams.classic("default", 15, true), settings.quality,
		Game.Source.BOT, Game.Source.BOT, "hard", [Looks.roll_look(-1), Looks.roll_look(-1)])
	_in_match = false
	_over_t = -1.0
	hud.visible = false
	Aud.set_song("menu")
	if touch != null:
		touch.visible = false

func _finish_enter() -> void:
	hud.set_colors(game.arena.lead_blob(BV.LEFT).body_color, game.arena.lead_blob(BV.RIGHT).body_color)
	_in_match = true
	_over_t = -1.0
	_over_shown = false
	_result_ui.visible = false
	_card_step = 0
	_last_foe_score = 0
	Aud.set_song(MATCH_SONGS[randi() % MATCH_SONGS.size()])
	menu.visible = false
	hud.visible = true
	if game.net_side == BV.NO_PLAYER:
		game.arena.start_intro()
	else:
		hud.shout("GO!", UiTheme.GOLD, 1.4)
	if touch != null:
		touch.visible = mode != Mode.BOTS
		Controls.clear_touch()

## Campanha: o nível escolhe o país, os modificadores e a regra. O bot recebe
## a habilidade contínua do nível.
func _play_campaign(n: int) -> void:
	level = clampi(n, 1, Campaign.LAST)
	mode = Mode.CAMPAIGN
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.touch_slot = [0, -1]
	var info := Campaign.level_info(level)
	_foe = info.nation
	var p := Campaign.params(level)
	var k: float = info.skill
	var tier := "easy" if k < 1.0 else ("normal" if k < 2.0 else ("hard" if k < 3.0 else "insane"))
	var foe_look := Campaign.look_of(_foe)
	game.start(p, settings.quality, Game.Source.LOCAL_SOLO, Game.Source.BOT, tier,
		[settings.look, foe_look])
	for b in game.bots:
		if b != null:
			b.set_skill(k)
	hud.names = [settings.player_name if settings.player_name != "" else "YOU", _foe.p]
	hud.sub_text = "LEVEL %d · %s of %s" % [level, _foe.p, _foe.n]
	_nat_tag = ["", str(_foe.n)]
	_finish_enter()

func _play_versus(stw: int) -> void:
	mode = Mode.VERSUS
	settings.score_to_win = stw
	settings.save()
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.touch_slot = [-1, -1]
	var lk: Array = [settings.look.duplicate(), Looks.roll_look(settings.look[0])]
	lk[1][0] = Looks.pair_body(lk[0][0], lk[1][0])
	game.start(MatchParams.classic("default", stw, true), settings.quality,
		Game.Source.LOCAL_P1, Game.Source.LOCAL_P2, "normal", lk)
	hud.names = ["P1", "P2"]
	hud.sub_text = ""
	_nat_tag = ["", ""]
	_foe = {}
	_finish_enter()

func _host() -> void:
	link.stop()
	if link.host():
		_net_pending = true

func _join(addr: String) -> void:
	link.stop()
	if link.join(addr):
		_net_pending = true

func _on_connected(is_host: bool) -> void:
	if not is_host:
		return
	link.send_hello(BV.RIGHT, settings.look, "default", settings.score_to_win, true)
	_start_net(BV.LEFT, [settings.look, Looks.roll_look(settings.look[0])],
		"default", settings.score_to_win, true)

func _on_hello(my_side: int, host_look: Array, rules: String, stw: int, walls: bool) -> void:
	var looks := [host_look, settings.look] if my_side == BV.RIGHT else [settings.look, host_look]
	link.send_hello(BV.other(my_side), settings.look, rules, stw, walls)
	_start_net(my_side, looks, rules, stw, walls)

func _start_net(side: int, looks: Array, rules: String, stw: int, walls: bool) -> void:
	if _in_match and game.net_side != BV.NO_PLAYER:
		return
	mode = Mode.NET
	game.touch_slot = [0 if side == BV.LEFT else -1, 0 if side == BV.RIGHT else -1]
	game.attach_link(link, side)
	game.start(MatchParams.classic(rules, stw, walls), settings.quality,
		game.src[BV.LEFT], game.src[BV.RIGHT], "normal", looks)
	_net_pending = false
	hud.names = ["", ""]
	hud.sub_text = ""
	_nat_tag = ["", ""]
	_finish_enter()
	hud.shout("ONLINE", Color(0.36, 0.82, 1.0), 1.4)

func _on_closed() -> void:
	if _in_match and game.net_side != BV.NO_PLAYER:
		hud.shout("CONNECTION LOST", Color(1.0, 0.5, 0.4), 2.2)
		_over_t = 2.5
		_over_winner = BV.NO_PLAYER

# ------------------------------------------------------------------ fim

func _on_match_over(winner: int) -> void:
	if not _in_match or _over_t >= 0.0:
		return
	_over_winner = winner
	_over_t = 0.0
	_over_shown = false
	if touch != null:
		touch.visible = false
	Controls.clear_touch()
	if game.net_side == BV.NO_PLAYER:
		game.arena.start_outro(winner)
	if mode == Mode.CAMPAIGN:
		var won := winner == BV.LEFT
		if won:
			settings.campaign_best = maxi(settings.campaign_best, level)
			settings.campaign_level = clampi(maxi(settings.campaign_level, level + 1), 1, Campaign.LAST)
			settings.save()

## Sequência de fim sem await: cada marco é checado pelo tempo.
func _step_over(dt: float) -> void:
	if _over_t < 0.0:
		return
	var was := _over_t
	_over_t += dt
	var winner := _over_winner
	var mine := winner == BV.LEFT if game.net_side == BV.NO_PLAYER else winner == game.net_side
	if was < 1.0 and _over_t >= 1.0 and winner != BV.NO_PLAYER:
		var wname: String = hud.names[winner] if hud.names[winner] != "" else ("YOU" if mine else "THEM")
		hud.card(wname.to_upper() + (" WIN" if wname == "YOU" else " WINS"),
			game.arena.lead_blob(winner).body_color.lightened(0.3), 2.4)
		if mode == Mode.CAMPAIGN:
			_say(Campaign.line(_foe, "lose" if mine else "win", level + game.bv.frame), 3.4)
	if _over_t >= 3.6 and not _over_shown:
		_over_shown = true
		if mode == Mode.BOTS and not _paused:
			_play_bots(_bots_skill)
			return
		game.set_paused(true)
		_show_result(winner, mine)

func _show_result(winner: int, mine: bool) -> void:
	var m := game.bv
	var col := game.arena.lead_blob(winner).body_color if winner != BV.NO_PLAYER else UiTheme.GOLD
	var title := ""
	var eyebrow := "match over"
	var line := ""
	_result_next.visible = false
	_result_again.visible = true
	_result_again.text = "Rematch"
	match mode:
		Mode.CAMPAIGN:
			eyebrow = "level %d · %s of %s" % [level, _foe.p, _foe.n]
			if mine:
				if level >= Campaign.LAST:
					title = "WORLD CHAMPION"
					eyebrow = "you beat the hundred"
					line = "Brazil bows. The goo is yours."
					_result_again.text = "Play again"
				else:
					title = "LEVEL %d CLEAR" % level
					var nx := Campaign.nation(level + 1)
					line = "Next: %s of %s" % [nx.p, nx.n]
					_result_next.visible = true
					_result_next.text = "Next level"
					_result_again.text = "Replay"
			else:
				title = "DEFEATED"
				line = "%s stays in the bracket." % _foe.p
				_result_again.text = "Retry"
		Mode.VERSUS:
			title = "P1 WINS" if winner == BV.LEFT else "P2 WINS"
		Mode.NET:
			title = ("VICTORY" if mine else "DEFEAT") if winner != BV.NO_PLAYER else "DISCONNECTED"
			_result_again.visible = false
		_:
			title = "MATCH OVER"
	_result_eyebrow.text = eyebrow.to_upper()
	_result_title.text = title
	_result_title.add_theme_color_override("font_color", col.lightened(0.3))
	_result_score.text = "%d  —  %d" % [m.logic.scores[BV.LEFT], m.logic.scores[BV.RIGHT]]
	_result_line.text = line
	_result_line.visible = line != ""
	_result_ui.visible = true
	_result_ui.pivot_offset = _result_ui.size * 0.5
	_result_ui.scale = Vector2.ONE * 0.94
	_result_ui.modulate.a = 0.0
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_result_ui, "scale", Vector2.ONE, 0.3) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_result_ui, "modulate:a", 1.0, 0.25)
	if not DisplayServer.is_touchscreen_available():
		(_result_next if _result_next.visible else _result_again).grab_focus.call_deferred()
	Aud.finish(mine if mode != Mode.VERSUS else true)

func _restart() -> void:
	match mode:
		Mode.CAMPAIGN:
			_play_campaign(level if not _result_next.visible else level)
		Mode.VERSUS:
			_play_versus(settings.score_to_win)
		Mode.BOTS:
			_play_bots(_bots_skill)
		_:
			_to_menu()

func _build_result() -> void:
	_result_ui = PanelContainer.new()
	_result_ui.set_anchors_preset(Control.PRESET_CENTER)
	_result_ui.anchor_left = 0.5
	_result_ui.anchor_right = 0.5
	_result_ui.anchor_top = 0.5
	_result_ui.anchor_bottom = 0.5
	_result_ui.offset_left = -250
	_result_ui.offset_right = 250
	_result_ui.offset_top = -190
	_result_ui.offset_bottom = 190
	_result_ui.add_theme_stylebox_override("panel", UiTheme.glass())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_result_ui.add_child(v)
	_result_eyebrow = UiTheme.eyebrow("match over", Menu.MUTED, 12)
	_result_eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_result_eyebrow)
	_result_title = UiTheme.display("", 50, UiTheme.GOLD)
	_result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_result_title)
	_result_score = UiTheme.heading("", 34)
	_result_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_result_score)
	_result_line = UiTheme.label("", 15, Color(1, 1, 1, 0.75))
	_result_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(_result_line)
	var rule := ColorRect.new()
	rule.color = UiTheme.GOLD
	rule.custom_minimum_size = Vector2(48, 3)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	v.add_child(rule)
	var g0 := Control.new()
	g0.custom_minimum_size = Vector2(0, 6)
	v.add_child(g0)
	_result_next = UiTheme.item(Button.new(), Color(1.0, 0.55, 0.25), 20)
	_result_next.text = "Next level"
	_result_next.pressed.connect(func():
		_result_ui.visible = false
		_play_campaign(level + 1))
	v.add_child(_result_next)
	_result_again = UiTheme.item(Button.new(), UiTheme.LEAF, 20)
	_result_again.text = "Rematch"
	_result_again.pressed.connect(func():
		_result_ui.visible = false
		_restart())
	v.add_child(_result_again)
	var q := UiTheme.item(Button.new(), Color(0.6, 0.65, 0.62), 20)
	q.text = "Menu"
	q.pressed.connect(func():
		_result_ui.visible = false
		_to_menu())
	v.add_child(q)
	_result_ui.visible = false
	_ui.add_child(_result_ui)

func _requality(q: int) -> void:
	settings.quality = q
	settings.save()
	_setup_touch()
	if _in_match:
		game.rebuild_arena(q)
		game.arena.goo.connect(hud.splat)
		if touch != null:
			touch.visible = true
		return
	game.reset_arena()
	game.arena.goo.connect(hud.splat)
	game.bv = null
	_demo()

func _relook(look: Array) -> void:
	if game.bv != null:
		game.arena.lead_blob(BV.LEFT).set_look(look)

func _to_menu() -> void:
	_paused = false
	hud.names = ["", ""]
	hud.sub_text = ""
	_pause_ui.visible = false
	_result_ui.visible = false
	link.stop()
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	_demo()
	menu.visible = true
	menu.show_page("main")

# ------------------------------------------------------------------ voz

## Fala do adversário: balão no HUD e uns bipes no tom do país.
func _say(text: String, hold := 3.2) -> void:
	if _foe.is_empty():
		return
	hud.bubble(text, BV.RIGHT, Color(_foe.b), hold)
	_voice_left = clampi(text.length() / 6, 3, 9)
	_voice_t = 0.0

func _step_voice(dt: float) -> void:
	if _voice_left <= 0:
		return
	_voice_t -= dt
	if _voice_t <= 0.0:
		_voice_left -= 1
		_voice_t = 0.07 + randf() * 0.05
		var base: float = float(_foe.get("v", 1.0))
		Aud.play("blip", 0.5, base * (0.9 + randf() * 0.25))

## Celular em pé: pede pra girar. O jogo é largo por natureza.
func _build_rotate() -> void:
	_rotate_ui = ColorRect.new()
	_rotate_ui.color = Color(0.02, 0.03, 0.03, 0.96)
	_rotate_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	var v := VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_CENTER)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.grow_horizontal = Control.GROW_DIRECTION_BOTH
	v.grow_vertical = Control.GROW_DIRECTION_BOTH
	var ic := UiTheme.display("↻", 120, UiTheme.GOLD)
	ic.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(ic)
	var l := UiTheme.display("ROTATE YOUR PHONE", 44)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	_rotate_ui.add_child(v)
	_rotate_ui.visible = false
	_ui.add_child(_rotate_ui)

func _process(dt: float) -> void:
	var vs := get_viewport().get_visible_rect().size
	_rotate_ui.visible = vs.x < vs.y
	_step_over(dt)
	_step_voice(dt)
	if game.bv != null and _in_match:
		hud.update(game.bv, dt)
		var w := game.bv.world
		var intro := game.arena.intro_active()
		var cine := intro or game.arena.outro_active()
		hud.ball_hint(game.arena.ball_screen_hint(Map.gx(w.ball_x), Map.gy(w.ball_y)) \
			if not cine else Vector3(-1, -1, 0), dt)
		hud.top_alpha(clampf(hud._top.modulate.a + ((-1.0 if intro else 1.0) * dt * 3.0), 0.0, 1.0))
		if touch != null:
			touch.visible = not cine and not _paused
		if intro:
			var it: float = game.arena.intro_t
			var step := 1 if it >= 0.3 and it < 1.9 else (2 if it >= 1.9 and it < 3.3 else (3 if it >= 3.3 and it < 4.7 else 0))
			if step != _card_step and step > 0:
				_intro_step(step)
			_card_step = step
		elif _card_step != 0:
			_card_step = 0
		if _intro_was and not intro:
			hud.shout("GO!", UiTheme.GOLD, 1.2)
		_intro_was = intro
		if mode == Mode.CAMPAIGN and not cine:
			_foe_line_t = maxf(0.0, _foe_line_t - dt)
			var fs: int = game.bv.logic.scores[BV.RIGHT]
			if fs != _last_foe_score:
				_last_foe_score = fs
				if fs > 0 and _foe_line_t <= 0.0 and randf() < 0.35:
					_foe_line_t = 14.0
					_say(Campaign.line(_foe, "say", fs * 7 + level), 2.6)
		if touch != null:
			var side := game.net_side if game.net_side != BV.NO_PLAYER else BV.LEFT
			touch.charge = game.bv.world.charge[game.bv.world.lead(side)] / BV.SPECIAL_FULL

## Cartões da abertura: nível e regra no passeio, nome de cada lado na cara.
func _intro_step(step: int) -> void:
	match step:
		1:
			if mode == Mode.CAMPAIGN:
				var info := Campaign.level_info(level)
				var mods := ""
				for m in info.mods:
					mods += Campaign.MODS[m].icon + " "
				hud.shout(("BOSS · " if info.boss else "") + "LEVEL %d" % level, Color(_foe.h).lightened(0.2), 1.6)
				hud.card((info.rule + ("   " + mods if mods != "" else "")), UiTheme.GOLD, 1.6)
			elif mode == Mode.VERSUS:
				hud.shout("FIRST TO %d" % game.bv.logic.score_to_win, UiTheme.GOLD, 1.6)
		2:
			if hud.names[0] != "":
				hud.card(_name_card(0), game.arena.lead_blob(0).body_color.lightened(0.35), 1.3)
		3:
			if hud.names[1] != "":
				hud.card(_name_card(1), game.arena.lead_blob(1).body_color.lightened(0.35), 1.3)
			if mode == Mode.CAMPAIGN:
				_say(Campaign.line(_foe, "say", level), 2.4)

func _unhandled_input(e: InputEvent) -> void:
	if _in_match and game.arena.intro_active() and e.is_pressed() \
			and not e.is_action_pressed("pause"):
		game.arena.skip_intro()
		hud.bubble("", BV.RIGHT, Color.WHITE, 0.0)
		_voice_left = 0
		return
	if e.is_action_pressed("pause"):
		if _in_match and not _result_ui.visible:
			_set_pause(not _paused)
		get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if _in_match:
			_set_pause(not _paused)
		elif menu.visible and menu.page() != "main":
			menu.show_page("main")
	elif what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		if _in_match and not _paused and game.net_side == BV.NO_PLAYER and _over_t < 0.0:
			_set_pause(true)

func _build_pause() -> void:
	_pause_ui = PanelContainer.new()
	_pause_ui.set_anchors_preset(Control.PRESET_CENTER)
	_pause_ui.anchor_left = 0.5
	_pause_ui.anchor_right = 0.5
	_pause_ui.anchor_top = 0.5
	_pause_ui.anchor_bottom = 0.5
	_pause_ui.offset_left = -250
	_pause_ui.offset_right = 250
	_pause_ui.offset_top = -215
	_pause_ui.offset_bottom = 215
	_pause_ui.add_theme_stylebox_override("panel", UiTheme.glass())
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_pause_ui.add_child(v)
	v.add_child(UiTheme.eyebrow("match", Menu.MUTED, 12))
	v.add_child(UiTheme.heading("Paused", 40))
	var rule := ColorRect.new()
	rule.color = UiTheme.GOLD
	rule.custom_minimum_size = Vector2(48, 3)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	v.add_child(rule)
	var g0 := Control.new()
	g0.custom_minimum_size = Vector2(0, 6)
	v.add_child(g0)
	var c := UiTheme.item(Button.new(), UiTheme.LEAF, 20)
	c.text = "Continue"
	c.pressed.connect(func(): _set_pause(false))
	v.add_child(c)
	var opts := MarginContainer.new()
	opts.add_theme_constant_override("margin_left", 22)
	opts.add_theme_constant_override("margin_top", 6)
	opts.add_theme_constant_override("margin_bottom", 6)
	var ov := VBoxContainer.new()
	ov.add_theme_constant_override("separation", 8)
	ov.add_child(UiTheme.eyebrow("quality", Menu.MUTED, 11))
	ov.add_child(Menu.quality_row(settings, func(q):
		_requality(q)
		_pause_ui.visible = false
		_build_pause_refresh()))
	ov.add_child(UiTheme.eyebrow("sound", Menu.MUTED, 11))
	ov.add_child(Menu.slider("Music", Aud.music_vol, func(x): Aud.set_volume("music", x)))
	ov.add_child(Menu.slider("Effects", Aud.sfx_vol, func(x): Aud.set_volume("sfx", x)))
	opts.add_child(ov)
	v.add_child(opts)
	var q := UiTheme.item(Button.new(), Color(0.9, 0.45, 0.35), 20)
	q.text = "Leave match"
	q.pressed.connect(func():
		_set_pause(false)
		_to_menu())
	v.add_child(q)
	c.grab_focus.call_deferred()
	_pause_ui.visible = false
	_ui.add_child(_pause_ui)

func _build_pause_refresh() -> void:
	_ui.remove_child(_pause_ui)
	_pause_ui.queue_free()
	_build_pause()
	_pause_ui.visible = true

func _set_pause(p: bool) -> void:
	_paused = p
	_pause_ui.visible = p
	if game.net_side == BV.NO_PLAYER:
		game.set_paused(p)
	if touch != null:
		touch.visible = _in_match and not p
		Controls.clear_touch()


## Ferramenta de desenvolvimento: `-- --shot=arquivo.png --wait=N` salva um
## quadro e sai.
func _dev_shot() -> void:
	var path := ""
	var wait := 200
	var every := 0
	var from := 0
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--every="):
			every = int(a.substr(8))
		if a.begins_with("--from="):
			from = int(a.substr(7))
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			path = a.substr(7)
		elif a.begins_with("--wait="):
			wait = int(a.substr(7))
		elif a == "--nomenu":
			menu.visible = false
		elif a.begins_with("--level="):
			_play_campaign(int(a.substr(8)))
		elif a == "--versus":
			_play_versus(5)
		elif a.begins_with("--page="):
			menu.show_page(a.substr(7))
		elif a.begins_with("--quality="):
			_requality(int(a.substr(10)))
		elif a == "--bots":
			_play_bots(settings.bots_skill)
		elif a == "--paused":
			_set_pause.call_deferred(true)
		elif a == "--skipintro":
			game.arena.skip_intro.call_deferred()
	if path == "":
		return
	var n := 0
	var force_over := "--over" in OS.get_cmdline_user_args()
	for i in wait:
		await get_tree().process_frame
		if force_over and game.bv != null and i == 30 and _in_match:
			game.bv.logic.scores[BV.LEFT] = game.bv.logic.score_to_win - 1
		if every > 0 and i % every == 0 and i >= from:
			await RenderingServer.frame_post_draw
			_shot_img().save_png(path.replace(".png", "_%03d.png" % n))
			n += 1
	await RenderingServer.frame_post_draw
	_shot_img().save_png(path)
	if game.bv != null:
		print("frame=%d score=%d-%d rally=%d over=%.1f result=%s" % [game.bv.frame,
			game.bv.logic.scores[0], game.bv.logic.scores[1], game.bv.logic.rally,
			_over_t, str(_result_ui.visible)])
	print("shot: ", path)
	get_tree().quit()


## CPU contra CPU: dois países sorteados, regra e modificadores de um nível
## qualquer, e no fim começa outra sozinha. Serve de demo e de tela de espera.
func _play_bots(sk: float) -> void:
	mode = Mode.BOTS
	_bots_skill = clampf(sk, 0.4, 3.6)
	_bots_run += 1
	game.net_side = BV.NO_PLAYER
	game.link = null
	game.rb = null
	game.touch_slot = [-1, -1]
	var pool: Array = Campaign.NATIONS
	var a: Dictionary = pool[randi() % pool.size()]
	var b: Dictionary = pool[randi() % pool.size()]
	# dois times da mesma cor viram uma bola de confusão: sorteia até separar
	for _i in 40:
		if b.c != a.c and _far_apart(Color(a.b), Color(b.b)):
			break
		b = pool[randi() % pool.size()]
	var lv := 1 + randi() % Campaign.LAST
	var p := Campaign.params(lv)
	var k := _bots_skill
	var tier := "easy" if k < 1.0 else ("normal" if k < 2.0 else ("hard" if k < 3.0 else "insane"))
	game.start(p, settings.quality, Game.Source.BOT, Game.Source.BOT, tier,
		[Campaign.look_of(a), Campaign.look_of(b)])
	for bot in game.bots:
		if bot != null:
			bot.set_skill(clampf(k + randf_range(-0.35, 0.35), 0.3, 3.6))
	hud.names = [a.p, b.p]
	hud.sub_text = "CPU vs CPU · match %d · %s" % [_bots_run, Campaign.rule_of(lv).name]
	_nat_tag = [str(a.n), str(b.n)]
	_foe = {}
	_finish_enter()
	mode = Mode.BOTS

func _far_apart(x: Color, y: Color) -> bool:
	var dh: float = absf(x.h - y.h)
	dh = minf(dh, 1.0 - dh)
	return dh > 0.09 or absf(x.get_luminance() - y.get_luminance()) > 0.18


func _name_card(i: int) -> String:
	var nm: String = str(hud.names[i]).to_upper()
	if _nat_tag[i] != "":
		nm += "  ·  " + _nat_tag[i].to_upper()
	return nm

func _dev_net() -> void:
	var m := ""
	var frames := 1800
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--nettest="):
			m = a.substr(10)
		elif a.begins_with("--frames="):
			frames = int(a.substr(9))
	if m == "":
		return
	game.script_input = func(f: int, side: int) -> int:
		var h := (f * 2654435761 + side * 40503) & 0xFFFFFFFF
		h ^= h >> 13
		h = (h * 1274126177) & 0xFFFFFFFF
		return (h >> 7) & 31
	if m == "host":
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
	game.set_paused(true)
	var stop := game.rb.frame
	for i in 120:
		game._net_catchup()
		await get_tree().process_frame
	var cmp := stop - 10
	var ok := game.rb.restore(game.bv, cmp)
	print("nettest %s frame=%d confirmed=%d compared=%d(%s) checksum=%d score=%d-%d" % [
		m, stop, game.rb.confirmed, cmp, "ok" if ok else "missing",
		game.bv.checksum(), game.bv.logic.scores[0], game.bv.logic.scores[1]])
	get_tree().quit()


func _shot_img() -> Image:
	var img := get_viewport().get_texture().get_image()
	var sz := img.get_size()
	if sz.y != 720:
		img.resize(int(round(sz.x * 720.0 / sz.y)), 720, Image.INTERPOLATE_BILINEAR)
	return img
