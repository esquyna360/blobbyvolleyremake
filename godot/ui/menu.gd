class_name Menu
extends Control

## Menu em tela cheia, sem a partida atrás. Uma coluna central com título e
## itens. Funciona com mouse, teclado, gamepad (foco) e toque.

signal play_campaign(level: int)
signal play_versus(stw: int)
signal play_bots(skill: float)
signal quality_changed(q: int)
signal look_changed(look: Array)
signal quit_game()

const QUALS := ["Low", "Medium", "High", "Ultra"]
const MUTED := Color(1, 1, 1, 0.55)
const COL_W := 620.0
const COL_W_C := 430.0
const VERSION := "0.5"

var settings: Settings

var _left: VBoxContainer
var _list: VBoxContainer
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
var _scroll: ScrollContainer
var _grid_page := 0
var _page_pinned := false

func build(s: Settings) -> void:
	settings = s
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var base := ColorRect.new()
	base.set_anchors_preset(Control.PRESET_FULL_RECT)
	base.color = Color(0.043, 0.051, 0.070)
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(base)
	var pat := TextureRect.new()
	_shade = pat
	pat.set_anchors_preset(Control.PRESET_FULL_RECT)
	pat.texture = _pattern()
	pat.stretch_mode = TextureRect.STRETCH_TILE
	pat.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(pat)
	var glow := TextureRect.new()
	glow.set_anchors_preset(Control.PRESET_FULL_RECT)
	glow.texture = _glow_tex()
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.stretch_mode = TextureRect.STRETCH_SCALE
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)
	var vig := TextureRect.new()
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	vig.texture = _gradient([Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.55)], [0.55, 1.0],
		Vector2(0, 0), Vector2(0, 1))
	vig.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	vig.stretch_mode = TextureRect.STRETCH_SCALE
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vig)

	_left = VBoxContainer.new()
	_left.set_anchors_preset(Control.PRESET_VCENTER_WIDE)
	_left.anchor_left = 0.5
	_left.anchor_right = 0.5
	_left.anchor_top = 0.0
	_left.anchor_bottom = 1.0
	_left.offset_left = -COL_W * 0.5
	_left.offset_right = COL_W * 0.5
	_left.offset_top = 30
	_left.offset_bottom = -52
	_left.alignment = BoxContainer.ALIGNMENT_CENTER
	_left.add_theme_constant_override("separation", 4)
	add_child(_left)

	_eyebrow = UiTheme.eyebrow("")
	_eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_left.add_child(_eyebrow)
	_heading = UiTheme.heading("")
	_heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_left.add_child(_heading)
	_rule = ColorRect.new()
	_rule.color = UiTheme.GOLD
	_rule.custom_minimum_size = Vector2(56, 3)
	_rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_left.add_child(_rule)
	_sub = UiTheme.label("", 13, MUTED)
	_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_left.add_child(_sub)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 8)
	_left.add_child(gap)
	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.follow_focus = true
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# a barra de rolagem some: quando a lista passa de pouco, o polegar dela vira
	# uma régua vertical do lado da coluna centralizada e lê como enfeite torto
	var tr := StyleBoxEmpty.new()
	var vsb := _scroll.get_v_scroll_bar()
	for k in ["grabber", "grabber_highlight", "grabber_pressed", "scroll", "scroll_focus"]:
		vsb.add_theme_stylebox_override(k, tr)
	vsb.custom_minimum_size = Vector2(0, 0)
	_left.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	_list.alignment = BoxContainer.ALIGNMENT_CENTER
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)

	_foot_l = UiTheme.eyebrow("", MUTED, 12)
	_foot_l.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_foot_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_foot_l.offset_left = 64
	_foot_l.offset_top = -36
	_foot_l.offset_right = -64
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


## Telas baixas (celular deitado) ganham margens curtas, retrato menor e alvos
## de toque maiores. Chamado de novo quando a janela muda de tamanho.
func _compact() -> bool:
	return is_inside_tree() and get_viewport_rect().size.y < 560.0

func _ready() -> void:
	relayout()

func _fit() -> void:
	if not is_inside_tree():
		return
	var c := _compact()
	UiTheme.compact = c
	var w := get_viewport_rect().size.x
	var cw := minf(COL_W_C if c else COL_W, w - 40.0)
	_left.offset_left = -cw * 0.5
	_left.offset_right = cw * 0.5
	_left.offset_top = 8.0 if c else 30.0
	_left.offset_bottom = -18.0 if c else -58.0
	_foot_l.offset_left = 24.0
	_foot_l.offset_right = -24.0
	_foot_r.offset_right = -(18.0 if c else 32.0)

func relayout() -> void:
	_fit()
	show_page(_page)

## Faixas diagonais bem discretas: dá textura à tela sem competir com o texto.
static func _pattern() -> ImageTexture:
	var n := 48
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var d := (x + y) % 16
			var a := 0.030 if d < 8 else 0.0
			if (x - y + n * 2) % 16 == 0:
				a = 0.055
			img.set_pixel(x, y, Color(0.55, 0.72, 1.0, a))
	return ImageTexture.create_from_image(img)

## Brilho quente atrás do título, pra tela não ficar chapada.
static func _glow_tex() -> GradientTexture2D:
	var gr := Gradient.new()
	gr.offsets = PackedFloat32Array([0.0, 1.0])
	gr.colors = PackedColorArray([Color(1.0, 0.76, 0.30, 0.13), Color(1.0, 0.76, 0.30, 0.0)])
	var g := GradientTexture2D.new()
	g.gradient = gr
	g.width = 256
	g.height = 256
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.42)
	g.fill_to = Vector2(1.05, 0.42)
	return g

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
	_left.visible = true
	_heading.visible = true
	_rule.visible = true
	_eyebrow.visible = true
	_sub.visible = true
	_shade.modulate.a = 1.0
	_sub.text = ""
	_heading.add_theme_font_size_override("font_size", 30 if _compact() else 40)
	var touch := DisplayServer.is_touchscreen_available() or _compact()
	var hint := "Enter · select      Esc · back" if p != "main" else "Enter · select"
	if Controls.has_pad():
		hint = "A · select      B · back" if p != "main" else "A · select"
	_foot_l.text = "" if touch else hint
	if p != "campaign":
		_page_pinned = false
	match p:
		"main": _main()
		"campaign": _campaign()
		"versus": _versus()
		"cpu": _cpu()
		"online": _online()
		"look": _look()
		"options": _options()
	_animate()
	if _scroll != null:
		_scroll.set_deferred("scroll_vertical", 0)
	var target := _first if _first != null else _focusable(_list)
	if _page == "options" or _page == "look":
		target = _focusable(_list)
	if target != null and is_inside_tree() and (not touch or Controls.has_pad()):
		target.grab_focus()
		_first = target

## Primeiro controle que aceita foco, em ordem de tela. Páginas feitas de chips
## e barras não passam por `_btn`, então sem isto o foco nascia no "Back". O
## campo de nome fica de fora: quem está no controle não tem como digitar nele.
func _focusable(n: Node) -> Control:
	for c in n.get_children():
		if c is Control and c.focus_mode == Control.FOCUS_ALL and c.visible \
				and not (c is BaseButton and c.disabled) and not c is LineEdit:
			return c
		var deep := _focusable(c)
		if deep != null:
			return deep
	return null

func _unhandled_input(e: InputEvent) -> void:
	if not visible:
		return
	if e.is_action_pressed("ui_back") and _page != "main":
		show_page("main")
		get_viewport().set_input_as_handled()
		return
	# sem foco o controle e as setas viram enfeite: qualquer tecla de navegação
	# devolve o cursor para o primeiro item em vez de não fazer nada
	if _first == null or get_viewport().gui_get_focus_owner() != null:
		return
	for a in ["ui_up", "ui_down", "ui_left", "ui_right", "ui_accept"]:
		if e.is_action_pressed(a):
			_first.grab_focus()
			get_viewport().set_input_as_handled()
			return

func _animate() -> void:
	_left.modulate.a = 0.0
	var tw := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(_left, "modulate:a", 1.0, 0.2)

func _title(text: String, eyebrow := "BLORP", sub := "") -> void:
	_heading.text = text.to_upper()
	_eyebrow.text = eyebrow.to_upper()
	_sub.text = sub

## Item de menu: nome centralizado e nada mais. Sem descrição, sem mistério.
func _btn(text: String, cb: Callable, _sub := "", col := UiTheme.GOLD) -> Button:
	var b := UiTheme.item(Button.new(), col)
	b.alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	b.custom_minimum_size = Vector2(230.0 if _compact() else 280.0, 0)
	for k in ["normal", "hover", "pressed", "focus"]:
		var sb: StyleBoxFlat = b.get_theme_stylebox(k)
		sb.border_width_left = 0
		sb.set_corner_radius_all(8)
		if k != "normal":
			sb.bg_color = Color(1, 1, 1, 0.09)
			sb.set_border_width_all(2)
			sb.border_color = col
		sb.content_margin_top = 6.0 if _compact() else 7.0
		sb.content_margin_bottom = 6.0 if _compact() else 7.0
	b.text = text
	b.pressed.connect(func():
		Aud.play("ui", 0.6)
		cb.call())
	_list.add_child(b)
	if _first == null:
		_first = b
	return b

func _spacer(h := 12) -> void:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h * (0.5 if _compact() else 1.0))
	_list.add_child(c)

func _back(to := "main") -> void:
	_btn("Back", func(): show_page(to), "", Color(0.6, 0.65, 0.62))

# ------------------------------------------------------------------ páginas

func _main() -> void:
	_eyebrow.text = ""
	_heading.visible = false
	_rule.visible = false
	if _compact():
		_eyebrow.visible = false
		_sub.visible = false
	_logo()
	var lvl := settings.campaign_level
	_btn("The Hundred", func(): show_page("campaign"),
		"world championship · level %d of 100" % mini(lvl, 100) if settings.campaign_best > 0 else "world championship · 100 levels")
	_btn("Versus", func(): show_page("versus"), "two players, one keyboard or two pads", UiTheme.LEAF)
	_btn("Online", func(): show_page("online"), "coming soon", Color(0.36, 0.72, 1.0))
	_btn("CPU vs CPU", func(): show_page("cpu"), "sit back and watch the goo fight", Color(1.0, 0.62, 0.26))
	if not _compact():
		_spacer()
	_btn("You", func(): show_page("look"), "", Color(0.9, 0.45, 0.8))
	_btn("Settings", func(): show_page("options"), "", Color(0.7, 0.75, 0.8))
	if OS.get_name() != "Web":
		_btn("Quit", func(): quit_game.emit(), "", Color(0.8, 0.35, 0.3))

## Logo: o nome em fonte de cartaz e o seu blob espiando por cima.
func _logo() -> void:
	var c := _compact()
	var box := HBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", -6)
	var pr := Portrait.new(settings.look, "laugh", 36 if c else 60, BV.LEFT)
	pr.size_flags_vertical = Control.SIZE_SHRINK_END
	box.add_child(pr)
	var l := UiTheme.display("BLORP", 38 if c else 62, UiTheme.GOLD)
	l.size_flags_vertical = Control.SIZE_SHRINK_END
	box.add_child(l)
	var top_gap := Control.new()
	top_gap.custom_minimum_size = Vector2(0, 2 if c else 0)
	_list.add_child(top_gap)
	_list.move_child(top_gap, 0)
	_list.add_child(box)
	var tag := UiTheme.eyebrow("Volleyball, but goo.", MUTED, 11)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var tm := MarginContainer.new()
	tm.add_theme_constant_override("margin_top", 2)
	tm.add_theme_constant_override("margin_bottom", 8)
	tm.add_child(tag)
	_list.add_child(tm)

func _campaign() -> void:
	var c := _compact()
	_heading.add_theme_font_size_override("font_size", 30 if c else 38)
	_title("The Hundred", "world championship", "")
	_sel_level = clampi(settings.campaign_level, 1, Campaign.LAST)
	if not _page_pinned:
		_grid_page = (_sel_level - 1) / PER_PAGE
	_detail = VBoxContainer.new()
	_detail.add_theme_constant_override("separation", 4)
	_list.add_child(_detail)
	_spacer(10)
	_list.add_child(_grid_block())
	_spacer()
	_back()
	_fill_detail()

const PER_PAGE := 20

## No celular a grade de 100 vira alvo de alfinete. Vinte por página, células
## grandes e setas pra virar a folha.
func _grid_block() -> Control:
	var c := _compact()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	var grid := GridContainer.new()
	grid.columns = 5 if c else 10
	grid.add_theme_constant_override("h_separation", 7 if c else 5)
	grid.add_theme_constant_override("v_separation", 7 if c else 5)
	var unlocked: int = settings.campaign_level
	if c:
		var last := (Campaign.LAST - 1) / PER_PAGE
		_grid_page = clampi(_grid_page, 0, last)
		var from := _grid_page * PER_PAGE + 1
		for n in range(from, mini(from + PER_PAGE, Campaign.LAST + 1)):
			grid.add_child(_level_cell(n, n <= unlocked))
		box.add_child(grid)
		box.add_child(_pager(last))
		_first = grid.get_child(0)
	else:
		for n in range(1, Campaign.LAST + 1):
			grid.add_child(_level_cell(n, n <= unlocked))
		box.add_child(grid)
		_first = grid.get_child(_sel_level - 1)
	return box

func _pager(last: int) -> Control:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	for d in [-1, 1]:
		var b := UiTheme.chip(Button.new(), false, 20)
		b.text = "‹" if d < 0 else "›"
		b.disabled = (_grid_page + d) < 0 or (_grid_page + d) > last
		b.pressed.connect(func():
			_grid_page = clampi(_grid_page + d, 0, last)
			_page_pinned = true
			Aud.play("ui", 0.5)
			show_page("campaign"))
		if d < 0:
			row.add_child(b)
			var l := UiTheme.eyebrow("%d – %d" % [_grid_page * PER_PAGE + 1,
				mini((_grid_page + 1) * PER_PAGE, Campaign.LAST)], MUTED, 14)
			l.custom_minimum_size = Vector2(120, 0)
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(l)
		else:
			row.add_child(b)
	return row

func _level_cell(n: int, open: bool) -> Button:
	var b := Button.new()
	var boss := Campaign.is_boss(n)
	var nat := Campaign.nation(n)
	var col := Color(nat.b) if open else Color(0.3, 0.32, 0.34)
	b.custom_minimum_size = Vector2(74, 56) if _compact() else Vector2(54, 44)
	b.text = str(n)
	b.focus_mode = Control.FOCUS_ALL
	b.add_theme_font_override("font", UiTheme.display_font(0))
	var fs := (26 if boss else 23) if _compact() else (22 if boss else 19)
	b.add_theme_font_size_override("font_size", fs)
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
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	var pr := Portrait.new(Campaign.look_of(nat), "smug" if open else "calm", 84 if _compact() else 120, BV.RIGHT)
	row.add_child(pr)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 0)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	v.add_child(UiTheme.eyebrow(("BOSS · " if info.boss else "") + "LEVEL %d" % n, Color(nat.h).lightened(0.2), 12))
	v.add_child(UiTheme.display(nat.p, 30 if _compact() else 40, Color(nat.b).lightened(0.35)))
	v.add_child(UiTheme.label(info.rule, 14, Color(1, 1, 1, 0.8)))
	row.add_child(v)
	_detail.add_child(row)
	if info.mods.size() > 0:
		var mods := HBoxContainer.new()
		mods.alignment = BoxContainer.ALIGNMENT_CENTER
		mods.add_theme_constant_override("h_separation", 6)
		mods.add_theme_constant_override("v_separation", 4)
		for m in info.mods:
			var md: Dictionary = Campaign.MODS[m]
			var chip := UiTheme.chip(Button.new(), false, 13)
			chip.text = md.name
			chip.focus_mode = Control.FOCUS_NONE
			chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
			mods.add_child(chip)
		_detail.add_child(mods)
	var go := UiTheme.solid(Button.new(), Color(nat.b) if open else Color(0.3, 0.32, 0.34), 20)
	go.text = ("PLAY LEVEL %d" % n) if open else "LOCKED"
	go.disabled = not open
	go.pressed.connect(func():
		Aud.play("ui", 0.6)
		play_campaign.emit(n))
	var gm := MarginContainer.new()
	gm.add_theme_constant_override("margin_top", 8)
	gm.add_child(go)
	_detail.add_child(gm)

func _versus() -> void:
	_title("Versus", "local match", "")
	_versus_sub()
	var hero := HBoxContainer.new()
	hero.alignment = BoxContainer.ALIGNMENT_CENTER
	hero.add_theme_constant_override("separation", 16)
	var hs := 96 if _compact() else 150
	hero.add_child(Portrait.new(settings.look, "smug", hs, BV.LEFT))
	hero.add_child(UiTheme.display("VS", 36 if _compact() else 54, UiTheme.GOLD))
	hero.add_child(Portrait.new(Looks.roll_look(settings.look[0]), "focus", hs, BV.RIGHT))
	_list.add_child(hero)
	_spacer(10)
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
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_list.add_child(row)
	_spacer(6)
	var who := HBoxContainer.new()
	who.add_theme_constant_override("separation", 6)
	who.alignment = BoxContainer.ALIGNMENT_CENTER
	var diff := HBoxContainer.new()
	diff.add_theme_constant_override("separation", 6)
	diff.alignment = BoxContainer.ALIGNMENT_CENTER
	diff.visible = settings.versus_cpu
	var wchips := []
	for opt in [["2 players", false], ["vs CPU", true]]:
		var b := UiTheme.chip(Button.new(), settings.versus_cpu == opt[1], 13)
		b.text = opt[0]
		b.pressed.connect(func():
			settings.versus_cpu = opt[1]
			settings.save()
			diff.visible = opt[1]
			_versus_sub()
			for c in wchips:
				UiTheme.chip(c, (c.text == "vs CPU") == opt[1], 13))
		wchips.append(b)
		who.add_child(b)
	_list.add_child(who)
	var dchips := []
	for opt in [["Chill", "easy"], ["Normal", "normal"], ["Hard", "hard"], ["Insane", "insane"]]:
		var b := UiTheme.chip(Button.new(), settings.versus_diff == opt[1], 13)
		b.text = opt[0]
		b.pressed.connect(func():
			settings.versus_diff = opt[1]
			settings.save()
			for c in dchips:
				UiTheme.chip(c, c.text == opt[0], 13))
		dchips.append(b)
		diff.add_child(b)
	_list.add_child(diff)
	_spacer(10)
	_btn("Play", func(): play_versus.emit(stw[0]), "", UiTheme.LEAF)
	_spacer()
	_back()

func _versus_sub() -> void:
	_sub.text = "you against the computer" if settings.versus_cpu \
		else "same keyboard (WASD + arrows) or two gamepads"

## CPU vs CPU: só escolhe o nível de habilidade e assiste. As partidas se
## emendam sozinhas, com países e modificadores sorteados a cada uma.
func _cpu() -> void:
	_title("CPU vs CPU", "no hands", "two bots, random rules, one match after another")
	var a: Dictionary = Campaign.NATIONS[randi() % Campaign.NATIONS.size()]
	var b2: Dictionary = Campaign.NATIONS[randi() % Campaign.NATIONS.size()]
	var hero := HBoxContainer.new()
	hero.alignment = BoxContainer.ALIGNMENT_CENTER
	hero.add_theme_constant_override("separation", 14)
	var hs := 96 if _compact() else 150
	hero.add_child(Portrait.new(Campaign.look_of(a), "focus", hs, BV.LEFT))
	hero.add_child(UiTheme.display("VS", 36 if _compact() else 54, Color(1.0, 0.62, 0.26)))
	hero.add_child(Portrait.new(Campaign.look_of(b2), "smug", hs, BV.RIGHT))
	_list.add_child(hero)
	var tag := UiTheme.eyebrow("%s  vs  %s" % [a.p, b2.p], MUTED, 14)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_list.add_child(tag)
	_spacer(10)
	var sk := [settings.bots_skill]
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var chips := []
	var opts := [["Chill", 1.0], ["Pro", 2.4], ["Insane", 3.6]]
	for o in opts:
		var b := UiTheme.chip(Button.new(), absf(float(o[1]) - sk[0]) < 0.01, 15)
		b.text = str(o[0])
		b.pressed.connect(func():
			sk[0] = float(o[1])
			settings.bots_skill = sk[0]
			settings.save()
			for c in chips:
				UiTheme.chip(c, c.text == str(o[0]), 15))
		chips.append(b)
		row.add_child(b)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_list.add_child(row)
	_spacer(10)
	_btn("Watch", func(): play_bots.emit(sk[0]), "", Color(1.0, 0.62, 0.26))
	_spacer()
	_back()

func _online() -> void:
	_title("Online", "coming soon", "cross-play ranked matches are on the way. Meanwhile: beat the Hundred.")
	var hero := HBoxContainer.new()
	hero.alignment = BoxContainer.ALIGNMENT_CENTER
	hero.add_child(Portrait.new(Looks.roll_look(-1), "sad", 130 if _compact() else 190, BV.RIGHT))
	_list.add_child(hero)
	var l := UiTheme.display("COMING SOON", 30 if _compact() else 44, Color(0.36, 0.72, 1.0))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_list.add_child(l)
	_spacer(12)
	_back()

func _look() -> void:
	_title("You", "profile", "name, body, hair and color")
	_look_editor()
	_spacer()
	_back()

func _look_editor() -> void:
	var pr := Portrait.new(settings.look, "smug", 120 if _compact() else 190, BV.LEFT)
	var pw := HBoxContainer.new()
	pw.alignment = BoxContainer.ALIGNMENT_CENTER
	pw.add_child(pr)
	_list.add_child(pw)
	_spacer(10)
	var ne := UiTheme.line_edit(LineEdit.new(), 22)
	ne.placeholder_text = "your name"
	ne.max_length = 12
	ne.text = settings.player_name
	ne.custom_minimum_size = Vector2(300, 0)
	ne.text_changed.connect(func(t):
		settings.player_name = t.strip_edges()
		settings.save())
	var nm := HBoxContainer.new()
	nm.alignment = BoxContainer.ALIGNMENT_CENTER
	nm.add_child(ne)
	_list.add_child(nm)
	_spacer(10)
	var look: Array = settings.look.duplicate()
	var names := ["Body", "Hair", "Color"]
	var sizes := [Looks.BODY_COLORS.size(), Looks.HAIR_STYLES.size(), Looks.HAIR_COLORS.size()]
	for i in 3:
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_theme_constant_override("separation", 6)
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
		_list.add_child(row)
	var roll := UiTheme.item(Button.new(), Color(0.9, 0.45, 0.8), 18)
	roll.alignment = HORIZONTAL_ALIGNMENT_CENTER
	roll.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	roll.custom_minimum_size = Vector2(260, 0)
	roll.text = "Random"
	roll.pressed.connect(func():
		settings.look = Looks.roll_look(-1)
		settings.save()
		look_changed.emit(settings.look)
		show_page(_page))
	_list.add_child(roll)
	_spacer(6)

func _look_name(kind: int, v: int) -> String:
	match kind:
		1: return Looks.HAIR_STYLES[Looks.widx(v, Looks.HAIR_STYLES.size())].name.capitalize()
		2: return Looks.HAIR_COLORS[Looks.widx(v, Looks.HAIR_COLORS.size())].name.capitalize()
		_: return Looks.BODY_COLORS[Looks.widx(v, Looks.BODY_COLORS.size())].name.capitalize()

func _options() -> void:
	_title("Settings", "graphics, sound, controls")
	var m := HBoxContainer.new()
	m.alignment = BoxContainer.ALIGNMENT_CENTER
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(0 if _compact() else 430, 0)
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
	v.add_child(UiTheme.eyebrow("Gamepad", MUTED, 12))
	v.add_child(_pad_list())
	var rr := HBoxContainer.new()
	rr.add_theme_constant_override("separation", 6)
	for o in [[true, "Vibration on"], [false, "Vibration off"]]:
		var b := UiTheme.chip(Button.new(), settings.rumble == o[0], 15)
		b.text = str(o[1])
		b.pressed.connect(func():
			settings.rumble = bool(o[0])
			settings.save()
			Rumble.on = settings.rumble
			if settings.rumble:
				Rumble.human = [true, true]
				Rumble.both(0.5, 0.5, 0.18)
			else:
				Rumble.stop()
			show_page("options"))
		rr.add_child(b)
	v.add_child(rr)
	var g4 := Control.new()
	g4.custom_minimum_size = Vector2(0, 8)
	v.add_child(g4)
	m.add_child(v)
	_list.add_child(m)
	_spacer()
	_back()
	_legend_block()

## Lista o que está plugado. Sem isso, controle que não responde vira adivinhação:
## aqui dá pra ver na hora se o jogo enxergou o aparelho e em que lado ele caiu.
func _pad_list() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	if not Controls.has_pad():
		v.add_child(UiTheme.label("None detected. In the browser, press a button on it once.", 13, MUTED))
		return v
	for slot in Controls.pads.size():
		var nm := Controls.pad_name(slot)
		var who := "P1" if slot == 0 else ("P2" if slot == 1 else "extra")
		v.add_child(UiTheme.label("%s · %s" % [who, nm], 13, Color(0.62, 0.86, 0.55)))
	return v


## A legenda vai para o lado direito, que nesta página está vazio: a coluna da
## esquerda já passa da altura da tela e empurrar mais texto lá embaixo esconde
## justamente quem precisa da legenda.
func _legend_block() -> void:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	v.add_child(UiTheme.eyebrow("Controls", MUTED, 12))
	for line in _legend().split("\n"):
		var l := UiTheme.label(line, 13, MUTED)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(l)
	_spacer(14)
	_list.add_child(v)


## Só o que vale para o aparelho que está na mão. A lista inteira vira parede de
## texto no celular, e o dono do controle não precisa da tabela do teclado.
func _legend() -> String:
	var out: Array[String] = []
	if DisplayServer.is_touchscreen_available() or _compact():
		out.append("Touch: the whole left half moves · JUMP, ACTION and SPECIAL on the right")
	if Controls.has_pad():
		out.append("Gamepad: stick or d-pad · A jumps (again in the air = spin) · X, B or shoulders act · Y charges the special · Start pauses")
		if Controls.pads.size() < 2:
			out.append("A second gamepad becomes P2; with only one, P2 plays on the arrows")
	if out.is_empty() or not (DisplayServer.is_touchscreen_available() or _compact()):
		out.append("Move: A/D or arrows · Jump: W / Up / Space, again in the air to spin")
		out.append("Action: E, Shift, Ctrl or Enter · Special: R or F")
		out.append("Esc pauses and goes back")
	return "\n".join(out)


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
