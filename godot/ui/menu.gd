class_name Menu
extends Control

## Menu em cima da partida de demonstração. Título e lista à esquerda, painel
## de conteúdo à direita. Funciona com mouse, teclado, gamepad (foco) e toque.

signal play_campaign(level: int)
signal play_versus(stw: int)
signal quality_changed(q: int)
signal look_changed(look: Array)
signal quit_game()

const QUALS := ["Low", "Medium", "High", "Ultra"]
const MUTED := Color(1, 1, 1, 0.55)
const VERSION := "0.3"

var settings: Settings

var _left: VBoxContainer
var _list: VBoxContainer
var _side: Control
var _side_box: VBoxContainer
var _eyebrow: Label
var _heading: Label
var _sub: Label
var _foot_l: Label
var _foot_r: Label
var _page := "main"
var _first: Control
var _shade: TextureRect
var _sel_level := 1
var _detail: VBoxContainer
var _rule: ColorRect

func build(s: Settings) -> void:
	settings = s
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var shade := TextureRect.new()
	_shade = shade
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.texture = _gradient([Color(0.01, 0.02, 0.02, 0.94), Color(0.01, 0.02, 0.02, 0.78),
		Color(0.01, 0.02, 0.02, 0.18)], [0.0, 0.42, 1.0], Vector2(0, 0), Vector2(1, 0))
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var vig := TextureRect.new()
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	vig.texture = _gradient([Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.55)], [0.72, 1.0],
		Vector2(0, 0), Vector2(0, 1))
	vig.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	vig.stretch_mode = TextureRect.STRETCH_SCALE
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vig)

	_left = VBoxContainer.new()
	_left.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_left.offset_left = 64
	_left.offset_top = 36
	_left.offset_right = 64 + 470
	_left.offset_bottom = -56
	_left.add_theme_constant_override("separation", 6)
	add_child(_left)

	_eyebrow = UiTheme.eyebrow("")
	_left.add_child(_eyebrow)
	_heading = UiTheme.heading("")
	_left.add_child(_heading)
	_rule = ColorRect.new()
	_rule.color = UiTheme.GOLD
	_rule.custom_minimum_size = Vector2(56, 3)
	_rule.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_left.add_child(_rule)
	_sub = UiTheme.label("", 15, MUTED)
	_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_left.add_child(_sub)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 8)
	_left.add_child(gap)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_left.add_child(_list)

	_side = MarginContainer.new()
	_side.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	_side.offset_left = -760
	_side.offset_right = -48
	_side.offset_top = 36
	_side.offset_bottom = -56
	_side.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_side)
	_side_box = VBoxContainer.new()
	_side_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_side_box.size_flags_horizontal = Control.SIZE_SHRINK_END
	_side_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_side.add_child(_side_box)

	_foot_l = UiTheme.eyebrow("", MUTED, 12)
	_foot_l.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_foot_l.offset_left = 64
	_foot_l.offset_top = -36
	_foot_l.offset_right = 700
	_foot_l.offset_bottom = -18
	add_child(_foot_l)
	_foot_r = UiTheme.eyebrow("BLORP  ·  " + VERSION, MUTED, 12)
	_foot_r.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_foot_r.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_foot_r.offset_left = -600
	_foot_r.offset_right = -48
	_foot_r.offset_top = -36
	_foot_r.offset_bottom = -18
	add_child(_foot_r)

	show_page("main")

static func _gradient(cols: Array, offs: Array, from: Vector2, to: Vector2) -> GradientTexture2D:
	var gr := Gradient.new()
	gr.offsets = PackedFloat32Array(offs)
	gr.colors = PackedColorArray(cols)
	var g := GradientTexture2D.new()
	g.gradient = gr
	g.width = 256
	g.height = 256
	g.fill_from = from
	g.fill_to = to
	return g

func page() -> String:
	return _page

func show_page(p: String) -> void:
	_page = p
	_first = null
	for c in _list.get_children():
		_list.remove_child(c)
		c.queue_free()
	for c in _side_box.get_children():
		_side_box.remove_child(c)
		c.queue_free()
	_left.visible = true
	_heading.visible = true
	_rule.visible = true
	_shade.modulate.a = 1.0
	_sub.text = ""
	_heading.add_theme_font_size_override("font_size", 52)
	var touch := DisplayServer.is_touchscreen_available()
	_foot_l.text = "" if touch else ("Enter · select      Esc · back" if p != "main" else "Enter · select")
	match p:
		"main": _main()
		"campaign": _campaign()
		"versus": _versus()
		"online": _online()
		"look": _look()
		"options": _options()
	_animate()
	if _first != null and not touch and is_inside_tree():
		_first.grab_focus()

func _unhandled_input(e: InputEvent) -> void:
	if not visible:
		return
	if e.is_action_pressed("ui_back") and _page != "main":
		show_page("main")
		get_viewport().set_input_as_handled()

func _animate() -> void:
	for n in [_left, _side]:
		n.modulate.a = 0.0
		var base: float = 64.0 if n == _left else size.x + _side.offset_left
		n.position.x = base + (-28.0 if n == _left else 28.0)
		var tw := create_tween().set_parallel(true).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		tw.tween_property(n, "modulate:a", 1.0, 0.22)
		tw.tween_property(n, "position:x", base, 0.3)

func _title(text: String, eyebrow := "BLORP", sub := "") -> void:
	_heading.text = text.to_upper()
	_eyebrow.text = eyebrow.to_upper()
	_sub.text = sub

func _btn(text: String, cb: Callable, sub := "", col := UiTheme.GOLD) -> Button:
	var b := UiTheme.item(Button.new(), col)
	b.text = text
	b.pressed.connect(func():
		Aud.play("ui", 0.6)
		cb.call())
	_list.add_child(b)
	if sub != "":
		var l := UiTheme.label(sub, 13, MUTED)
		l.add_theme_constant_override("outline_size", 3)
		var m := MarginContainer.new()
		m.add_theme_constant_override("margin_left", 26)
		m.add_theme_constant_override("margin_bottom", 4)
		m.add_theme_constant_override("margin_top", -8)
		m.add_child(l)
		_list.add_child(m)
	if _first == null:
		_first = b
	return b

func _spacer(h := 12) -> void:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	_list.add_child(c)

func _back(to := "main") -> void:
	_btn("Back", func(): show_page(to), "", Color(0.6, 0.65, 0.62))

# ------------------------------------------------------------------ páginas

func _main() -> void:
	_eyebrow.text = ""
	_heading.visible = false
	_rule.visible = false
	_logo()
	var lvl := settings.campaign_level
	_btn("The Hundred", func(): show_page("campaign"),
		"world championship · level %d of 100" % mini(lvl, 100) if settings.campaign_best > 0 else "world championship · 100 levels")
	_btn("Versus", func(): show_page("versus"), "two players, one keyboard or two pads", UiTheme.LEAF)
	_btn("Online", func(): show_page("online"), "coming soon", Color(0.36, 0.72, 1.0))
	_spacer()
	_btn("You", func(): show_page("look"), "", Color(0.9, 0.45, 0.8))
	_btn("Settings", func(): show_page("options"), "", Color(0.7, 0.75, 0.8))
	if OS.get_name() != "Web":
		_btn("Quit", func(): quit_game.emit(), "", Color(0.8, 0.35, 0.3))
	_side_hero()

## Logo: o nome em fonte de cartaz e o seu blob espiando por cima.
func _logo() -> void:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", -6)
	var pr := Portrait.new(settings.look, "laugh", 104, BV.LEFT)
	pr.size_flags_vertical = Control.SIZE_SHRINK_END
	box.add_child(pr)
	var l := UiTheme.display("BLORP", 110, UiTheme.GOLD)
	l.size_flags_vertical = Control.SIZE_SHRINK_END
	box.add_child(l)
	_list.add_child(box)
	var tag := UiTheme.eyebrow("Volleyball, but goo.", MUTED, 12)
	var tm := MarginContainer.new()
	tm.add_theme_constant_override("margin_left", 112)
	tm.add_theme_constant_override("margin_top", -10)
	tm.add_theme_constant_override("margin_bottom", 10)
	tm.add_child(tag)
	_list.add_child(tm)

func _side_hero() -> void:
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 2)
	var pr := Portrait.new(settings.look, "smug", 300, BV.LEFT)
	v.add_child(pr)
	var n := UiTheme.eyebrow(settings.player_name if settings.player_name != "" else "YOU",
		Looks.body_color(settings.look).lightened(0.35), 16)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(n)
	if settings.campaign_best > 0:
		var s := UiTheme.label("best: level %d" % settings.campaign_best, 13, MUTED)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(s)
	_side_box.add_child(v)

func _campaign() -> void:
	_heading.add_theme_font_size_override("font_size", 46)
	_title("The\nHundred", "world championship", "one nation per level. Brazil waits at 100.")
	_sel_level = clampi(settings.campaign_level, 1, Campaign.LAST)
	_detail = VBoxContainer.new()
	_detail.add_theme_constant_override("separation", 4)
	_list.add_child(_detail)
	_spacer()
	_back()
	var grid := GridContainer.new()
	grid.columns = 10
	grid.add_theme_constant_override("h_separation", 5)
	grid.add_theme_constant_override("v_separation", 5)
	var unlocked := settings.campaign_level
	for n in range(1, Campaign.LAST + 1):
		grid.add_child(_level_cell(n, n <= unlocked))
	_side_box.add_child(grid)
	_first = grid.get_child(_sel_level - 1)
	_fill_detail()

func _level_cell(n: int, open: bool) -> Button:
	var b := Button.new()
	var boss := Campaign.is_boss(n)
	var nat := Campaign.nation(n)
	var col := Color(nat.b) if open else Color(0.3, 0.32, 0.34)
	b.custom_minimum_size = Vector2(54, 44)
	b.text = str(n)
	b.focus_mode = Control.FOCUS_ALL
	b.add_theme_font_override("font", UiTheme.display_font(0))
	b.add_theme_font_size_override("font_size", 22 if boss else 19)
	for k in 3:
		var s := StyleBoxFlat.new()
		s.bg_color = col.darkened(0.55 - k * 0.12) if open else Color(0.05, 0.06, 0.07, 0.7)
		s.border_color = Color(nat.h) if (open and (boss or k > 0)) else Color(1, 1, 1, 0.08)
		s.set_border_width_all(2 if (boss or k > 0) else 1)
		s.set_corner_radius_all(5)
		b.add_theme_stylebox_override(["normal", "hover", "pressed"][k], s)
		if k == 1:
			b.add_theme_stylebox_override("focus", s)
	b.add_theme_color_override("font_color", Color(1, 1, 1, 0.92 if open else 0.28))
	b.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	b.add_theme_constant_override("outline_size", 4)
	b.focus_entered.connect(func():
		_sel_level = n
		_fill_detail())
	b.mouse_entered.connect(func():
		_sel_level = n
		_fill_detail())
	b.pressed.connect(func():
		_sel_level = n
		if open:
			Aud.play("ui", 0.6)
			play_campaign.emit(n)
		else:
			Aud.play("special_wasted", 0.4))
	return b

func _fill_detail() -> void:
	if _detail == null or not is_instance_valid(_detail):
		return
	for c in _detail.get_children():
		_detail.remove_child(c)
		c.queue_free()
	var n := _sel_level
	var info := Campaign.level_info(n)
	var nat: Dictionary = info.nation
	var open: bool = n <= settings.campaign_level
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var pr := Portrait.new(Campaign.look_of(nat), "smug" if open else "calm", 120, BV.RIGHT)
	row.add_child(pr)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	v.add_child(UiTheme.eyebrow(("BOSS · " if info.boss else "") + "LEVEL %d" % n, Color(nat.h).lightened(0.2), 12))
	v.add_child(UiTheme.display(nat.n, 40, Color(nat.b).lightened(0.35)))
	v.add_child(UiTheme.label(info.rule, 14, Color(1, 1, 1, 0.8)))
	row.add_child(v)
	_detail.add_child(row)
	if info.mods.size() > 0:
		var mods := HFlowContainer.new()
		mods.add_theme_constant_override("h_separation", 6)
		mods.add_theme_constant_override("v_separation", 4)
		for m in info.mods:
			var md: Dictionary = Campaign.MODS[m]
			var chip := UiTheme.chip(Button.new(), false, 13)
			chip.text = md.icon + " " + md.name
			chip.focus_mode = Control.FOCUS_NONE
			chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
			mods.add_child(chip)
		var mm := MarginContainer.new()
		mm.add_theme_constant_override("margin_left", 4)
		mm.add_child(mods)
		_detail.add_child(mm)
	var go := UiTheme.solid(Button.new(), Color(nat.b) if open else Color(0.3, 0.32, 0.34), 20)
	go.text = ("PLAY LEVEL %d" % n) if open else "LOCKED"
	go.disabled = not open
	go.focus_mode = Control.FOCUS_NONE
	go.pressed.connect(func():
		Aud.play("ui", 0.6)
		play_campaign.emit(n))
	var gm := MarginContainer.new()
	gm.add_theme_constant_override("margin_top", 8)
	gm.add_child(go)
	_detail.add_child(gm)

func _versus() -> void:
	_title("Versus", "two players", "same keyboard (WASD + arrows) or two gamepads")
	var stw := [settings.score_to_win]
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var chips := []
	for n in [5, 10, 15]:
		var b := UiTheme.chip(Button.new(), n == stw[0], 15)
		b.text = "First to %d" % n
		b.pressed.connect(func():
			stw[0] = n
			settings.score_to_win = n
			settings.save()
			for c in chips:
				UiTheme.chip(c, c.text.ends_with(" %d" % n), 15))
		chips.append(b)
		row.add_child(b)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", 22)
	m.add_theme_constant_override("margin_bottom", 10)
	m.add_child(row)
	_list.add_child(m)
	_btn("Play", func(): play_versus.emit(stw[0]), "", UiTheme.LEAF)
	_spacer()
	_back()
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 20)
	h.add_child(Portrait.new(settings.look, "smug", 220, BV.LEFT))
	h.add_child(UiTheme.display("VS", 72, UiTheme.GOLD))
	h.add_child(Portrait.new(Looks.roll_look(settings.look[0]), "focus", 220, BV.RIGHT))
	v.add_child(h)
	_side_box.add_child(v)

func _online() -> void:
	_title("Online", "coming soon", "cross-play ranked matches are on the way. Meanwhile: beat the Hundred.")
	_back()
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(Portrait.new(Looks.roll_look(-1), "sad", 260, BV.RIGHT))
	var l := UiTheme.display("COMING SOON", 54, Color(0.36, 0.72, 1.0))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	_side_box.add_child(v)

func _look() -> void:
	_title("You", "profile", "name, body, hair and color")
	_look_editor()
	_spacer()
	_back()

func _look_editor() -> void:
	var ne := UiTheme.line_edit(LineEdit.new(), 22)
	ne.placeholder_text = "your name"
	ne.max_length = 12
	ne.text = settings.player_name
	ne.custom_minimum_size = Vector2(300, 0)
	ne.text_changed.connect(func(t):
		settings.player_name = t.strip_edges()
		settings.save())
	var nm := MarginContainer.new()
	nm.add_theme_constant_override("margin_left", 22)
	nm.add_theme_constant_override("margin_bottom", 10)
	nm.add_child(ne)
	_list.add_child(nm)
	var pr := Portrait.new(settings.look, "smug", 320, BV.LEFT)
	var look: Array = settings.look.duplicate()
	var names := ["Body", "Hair", "Color"]
	var sizes := [Looks.BODY_COLORS.size(), Looks.HAIR_STYLES.size(), Looks.HAIR_COLORS.size()]
	for i in 3:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var m := MarginContainer.new()
		m.add_theme_constant_override("margin_left", 22)
		var name_l := UiTheme.eyebrow(names[i], MUTED, 12)
		name_l.custom_minimum_size = Vector2(80, 0)
		name_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(name_l)
		var value := UiTheme.label(_look_name(i, look[i]), 17, Color(1, 1, 1, 0.95))
		value.add_theme_font_override("font", UiTheme.font(0.5, 0))
		value.custom_minimum_size = Vector2(150, 0)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		value.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for d in [-1, 1]:
			var b := UiTheme.chip(Button.new(), false, 15)
			b.text = "‹" if d < 0 else "›"
			b.pressed.connect(func():
				look[i] = Looks.widx(look[i] + d, sizes[i])
				value.text = _look_name(i, look[i])
				settings.look = look.duplicate()
				settings.save()
				pr.set_look(look)
				Aud.play("ui", 0.5)
				look_changed.emit(look))
			if d < 0:
				if _first == null:
					_first = b
				row.add_child(b)
				row.add_child(value)
			else:
				row.add_child(b)
		m.add_child(row)
		_list.add_child(m)
	var roll := UiTheme.item(Button.new(), Color(0.9, 0.45, 0.8), 18)
	roll.text = "Random"
	roll.pressed.connect(func():
		settings.look = Looks.roll_look(-1)
		settings.save()
		look_changed.emit(settings.look)
		show_page(_page))
	_list.add_child(roll)
	_spacer(6)
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(pr)
	_side_box.add_child(v)

func _look_name(kind: int, v: int) -> String:
	match kind:
		1: return Looks.HAIR_STYLES[Looks.widx(v, Looks.HAIR_STYLES.size())].name.capitalize()
		2: return Looks.HAIR_COLORS[Looks.widx(v, Looks.HAIR_COLORS.size())].name.capitalize()
		_: return Looks.BODY_COLORS[Looks.widx(v, Looks.BODY_COLORS.size())].name.capitalize()

func _options() -> void:
	_title("Settings", "graphics, sound, controls")
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", 22)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.add_child(UiTheme.eyebrow("Quality", MUTED, 12))
	v.add_child(quality_row(settings, func(q):
		quality_changed.emit(q)
		show_page("options")))
	v.add_child(UiTheme.label("Low keeps the scenery and runs on weak phones and laptops.", 13, MUTED))
	var g := Control.new()
	g.custom_minimum_size = Vector2(0, 8)
	v.add_child(g)
	v.add_child(UiTheme.eyebrow("Sound", MUTED, 12))
	v.add_child(slider("Music", Aud.music_vol, func(x): Aud.set_volume("music", x)))
	v.add_child(slider("Effects", Aud.sfx_vol, func(x): Aud.set_volume("sfx", x)))
	var g2 := Control.new()
	g2.custom_minimum_size = Vector2(0, 8)
	v.add_child(g2)
	v.add_child(UiTheme.eyebrow("Touch controls", MUTED, 12))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var opts := [[-1, "Auto"], [1, "On"], [0, "Off"]]
	for o in opts:
		var b := UiTheme.chip(Button.new(), settings.touch == o[0], 15)
		b.text = o[1]
		b.pressed.connect(func():
			settings.touch = o[0]
			settings.save()
			quality_changed.emit(settings.quality)
			show_page("options"))
		row.add_child(b)
	v.add_child(row)
	var g3 := Control.new()
	g3.custom_minimum_size = Vector2(0, 8)
	v.add_child(g3)
	v.add_child(UiTheme.eyebrow("Keys", MUTED, 12))
	v.add_child(UiTheme.label("Move: A/D or arrows · Jump: W / Up / Space · Action: E, Shift, Ctrl, Enter or mouse click\nGamepad: stick + A jump + X/B action · Esc pauses", 13, MUTED))
	m.add_child(v)
	_list.add_child(m)
	_spacer()
	_back()

static func quality_row(s: Settings, cb: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for q in 4:
		var b := UiTheme.chip(Button.new(), q == s.quality)
		b.text = QUALS[q]
		b.pressed.connect(func():
			s.quality = q
			s.save()
			cb.call(q))
		row.add_child(b)
	return row

static func slider(name: String, value: float, cb: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var l := UiTheme.label(name, 15, Color(1, 1, 1, 0.85))
	l.custom_minimum_size = Vector2(78, 0)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(l)
	var sl := HSlider.new()
	sl.min_value = 0.0
	sl.max_value = 1.0
	sl.step = 0.05
	sl.value = value
	sl.custom_minimum_size = Vector2(230, 24)
	sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.slider_style(sl)
	sl.value_changed.connect(cb)
	row.add_child(sl)
	return row
