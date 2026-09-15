class_name Hud
extends Control

## Placar, barra de especial e contador de rally. Nada aqui lê o mundo direto:
## o jogo empurra o estado a cada quadro.

const BAR_W := 175.0
const NAME_W := 96.0
const RALLY_MIN := 6
const RALLY_HOLD := 1.9
const BAR_H := 3.0

var _score := [null, null]
var _bar := [null, null]
var _fill := [null, null]
var _rally: Label
var _info: Label
var _big: Label
var _mark: Label
var _card: Label
var _card_t := 0.0
var _goo: Control
var _splats: Array = []
var names := ["", ""]
var _mark_a := 0.0
var _big_t := 0.0
var _big_pop := 0.0
var _pulse := [0.0, 0.0]
var _rally_shown := -1
var _rally_base := 0
var _rally_rec := false
var _rally_pulse := 0.0
var _rally_t := 0.0
var _disc := [null, null]
var pause_btn: Button
var _bub: Control
var _bub_t := 0.0
var _bub_side := 1
var _bub_pop := 0.0
var sub_text := ""
var _top: Control
var _panel: PanelContainer
var _pause_home: Node
var _pause_out := false

signal pause_pressed

## Barra fina no topo: pausa, nome, placar, nome. O resto da tela é o jogo.
static func _bar_style() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.05, 0.05, 0.07, 0.55)
	sb.set_corner_radius_all(9)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 5
	sb.content_margin_bottom = 6
	sb.border_color = Color(1, 1, 1, 0.08)
	sb.set_border_width_all(1)
	return sb

func set_colors(left: Color, right: Color) -> void:
	_score[0].add_theme_color_override("font_color", left)
	_score[1].add_theme_color_override("font_color", right)
	_fill[0].color = left
	_fill[1].color = right
	_disc[0].add_theme_color_override("font_color", left)
	_disc[1].add_theme_color_override("font_color", right)

func build(left: Color, right: Color) -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_top = Control.new()
	_top.set_anchors_preset(Control.PRESET_FULL_RECT)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var panel := PanelContainer.new()
	_panel = panel
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.offset_left = -BAR_W
	panel.offset_right = BAR_W
	panel.offset_top = 10
	panel.add_theme_stylebox_override("panel", _bar_style())
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(panel)
	var top := HBoxContainer.new()
	top.alignment = BoxContainer.ALIGNMENT_CENTER
	top.add_theme_constant_override("separation", 10)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(top)

	pause_btn = Button.new()
	pause_btn.text = "❚❚"
	pause_btn.custom_minimum_size = Vector2(26, 26)
	pause_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	pause_btn.flat = true
	pause_btn.add_theme_font_size_override("font_size", 12)
	pause_btn.add_theme_color_override("font_color", Color(1, 1, 1, 0.6))
	pause_btn.add_theme_color_override("font_hover_color", Color(1, 1, 1, 0.95))
	pause_btn.focus_mode = Control.FOCUS_NONE
	pause_btn.pressed.connect(func(): pause_pressed.emit())
	top.add_child(pause_btn)
	_pause_home = top

	for i in 2:
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 2)
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.custom_minimum_size = Vector2(NAME_W, 0)
		var nm := Label.new()
		nm.text = ""
		nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if i == 0 else HORIZONTAL_ALIGNMENT_LEFT
		nm.add_theme_font_size_override("font_size", 15)
		nm.add_theme_color_override("font_color", left if i == 0 else right)
		nm.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_disc[i] = nm
		var back := ColorRect.new()
		back.color = Color(1, 1, 1, 0.13)
		back.custom_minimum_size = Vector2(NAME_W, BAR_H)
		back.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var fill := ColorRect.new()
		fill.color = left if i == 0 else right
		fill.set_anchors_preset(Control.PRESET_LEFT_WIDE if i == 0 else Control.PRESET_RIGHT_WIDE)
		if i == 0:
			fill.offset_right = 0.0
		else:
			fill.offset_left = 0.0
		fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		back.add_child(fill)
		col.add_child(nm)
		col.add_child(back)
		_bar[i] = back
		_fill[i] = fill

		var sc := Label.new()
		sc.text = "0"
		sc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		sc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		sc.add_theme_font_size_override("font_size", 26)
		sc.add_theme_color_override("font_color", left if i == 0 else right)
		sc.custom_minimum_size = Vector2(30, 0)
		sc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_score[i] = sc

		if i == 0:
			top.add_child(col)
			top.add_child(sc)
			var sep := Label.new()
			sep.text = ":"
			sep.add_theme_font_size_override("font_size", 22)
			sep.add_theme_color_override("font_color", Color(1, 1, 1, 0.45))
			sep.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			sep.mouse_filter = Control.MOUSE_FILTER_IGNORE
			top.add_child(sep)
		else:
			top.add_child(sc)
			top.add_child(col)

	_info = Label.new()
	_info.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_info.anchor_left = 0.5
	_info.anchor_right = 0.5
	_info.offset_left = -220
	_info.offset_right = 220
	_info.offset_top = 58
	_info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_info.add_theme_font_size_override("font_size", 15)
	_info.add_theme_color_override("font_color", Color(1, 1, 1, 0.5))
	_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(_info)

	_rally = Label.new()
	_rally.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_rally.anchor_left = 0.5
	_rally.anchor_right = 0.5
	_rally.offset_left = -140
	_rally.offset_right = 140
	_rally.offset_top = 82
	_rally.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rally.add_theme_font_size_override("font_size", 22)
	_rally.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	_rally.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_rally.add_theme_constant_override("outline_size", 6)
	_rally.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(_rally)

	_big = Label.new()
	_big.set_anchors_preset(Control.PRESET_CENTER)
	_big.anchor_left = 0.5
	_big.anchor_right = 0.5
	_big.anchor_top = 0.24
	_big.anchor_bottom = 0.24
	_big.offset_left = -460
	_big.offset_right = 460
	_big.offset_top = -56
	_big.offset_bottom = 56
	_big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_big.add_theme_font_override("font", UiTheme.display_font(2))
	_big.add_theme_font_size_override("font_size", 64)
	_big.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03, 0.75))
	_big.add_theme_constant_override("outline_size", 7)
	_big.modulate.a = 0.0
	_big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_big)
	_mark = Label.new()
	_mark.text = "▲"
	_mark.add_theme_font_size_override("font_size", 30)
	_mark.add_theme_color_override("font_color", Color(1.0, 0.86, 0.3))
	_mark.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03, 0.8))
	_mark.add_theme_constant_override("outline_size", 6)
	_mark.size = Vector2(60, 40)
	_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mark.modulate.a = 0.0
	_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_mark)
	_card = Label.new()
	_card.set_anchors_preset(Control.PRESET_CENTER)
	_card.anchor_left = 0.5
	_card.anchor_right = 0.5
	_card.anchor_top = 0.87
	_card.anchor_bottom = 0.87
	_card.offset_left = -400
	_card.offset_right = 400
	_card.offset_top = -40
	_card.offset_bottom = 40
	_card.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_card.add_theme_font_override("font", UiTheme.display_font(2))
	_card.add_theme_font_size_override("font_size", 50)
	_card.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03, 0.8))
	_card.add_theme_constant_override("outline_size", 8)
	_card.modulate.a = 0.0
	_card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card)
	_goo = Control.new()
	_goo.set_anchors_preset(Control.PRESET_FULL_RECT)
	_goo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_goo.draw.connect(_draw_goo)
	add_child(_goo)
	_bub = Control.new()
	_bub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bub.draw.connect(_draw_bubble)
	_bub.visible = false
	add_child(_bub)

## Balão de fala do adversário (ou do jogador): fica abaixo do placar, do lado
## de quem fala. Desenhado à mão pra ter tamanho exato com quebra de linha.
var _bub_text := ""
var _bub_col := Color(0.1, 0.1, 0.12)
var _bub_w := 300.0
var _bub_font: Font
const BUB_FS := 24
const BUB_PAD := Vector2(22, 14)

func bubble(text: String, side: int, col := Color(0.1, 0.1, 0.12), hold := 3.2) -> void:
	if _bub_font == null:
		_bub_font = UiTheme.font(0.6, 0)
	_bub_text = text
	_bub_col = col.darkened(0.5)
	_bub_side = side
	_bub_t = hold
	_bub_pop = 1.0
	_bub.visible = text != ""
	_bub.modulate.a = 0.0
	var w := clampf(size.x * 0.34, 280.0, 460.0)
	var ts := _bub_font.get_multiline_string_size(text, HORIZONTAL_ALIGNMENT_CENTER, w - BUB_PAD.x * 2.0, BUB_FS)
	_bub_w = minf(w, ts.x + BUB_PAD.x * 2.0)
	_bub.size = Vector2(_bub_w, ts.y + BUB_PAD.y * 2.0 + 10.0)
	_place_bubble()
	_bub.queue_redraw()

func _draw_bubble() -> void:
	var sz := _bub.size
	var body := Rect2(Vector2.ZERO, Vector2(sz.x, sz.y - 10.0))
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.95)
	sb.set_corner_radius_all(18)
	sb.shadow_color = Color(0, 0, 0, 0.3)
	sb.shadow_size = 8
	sb.shadow_offset = Vector2(0, 4)
	_bub.draw_style_box(sb, body)
	var tx := sz.x * (0.78 if _bub_side == 1 else 0.22)
	_bub.draw_colored_polygon(PackedVector2Array([Vector2(tx - 10, body.size.y - 1), Vector2(tx + 10, body.size.y - 1), Vector2(tx + (6 if _bub_side == 1 else -6), sz.y)]), Color(1, 1, 1, 0.95))
	_bub.draw_multiline_string(_bub_font, Vector2(BUB_PAD.x, BUB_PAD.y + BUB_FS * 0.8), _bub_text,
		HORIZONTAL_ALIGNMENT_CENTER, sz.x - BUB_PAD.x * 2.0, BUB_FS, -1, _bub_col)

func _place_bubble() -> void:
	var w := _bub.size.x
	var x := size.x * 0.05 if _bub_side == 0 else size.x * 0.95 - w
	_bub.position = Vector2(x, 128.0)
	_bub.pivot_offset = Vector2(w * (0.2 if _bub_side == 0 else 0.8), _bub.size.y)

## Placar some na abertura; cartões e balões continuam visíveis.
## Celular: o placar de 500 px de largura comia um quarto da tela. Encolhe o
## painel e solta o botão de pausa no canto, onde o dedo alcança.
func fit(compact: bool) -> void:
	var k := 0.86 if compact else 1.0
	_panel.scale = Vector2(k, k)
	_panel.pivot_offset = Vector2(BAR_W, 0.0)
	_info.offset_top = 56.0 * k
	_rally.offset_top = 82.0 * k
	if compact == _pause_out or pause_btn == null:
		return
	_pause_out = compact
	pause_btn.get_parent().remove_child(pause_btn)
	if compact:
		pause_btn.custom_minimum_size = Vector2(62, 62)
		pause_btn.add_theme_font_size_override("font_size", 20)
		pause_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
		pause_btn.anchor_left = 1.0
		pause_btn.anchor_right = 1.0
		pause_btn.offset_left = -84
		pause_btn.offset_right = -22
		pause_btn.offset_top = 16
		pause_btn.offset_bottom = 78
		_top.add_child(pause_btn)
	else:
		pause_btn.custom_minimum_size = Vector2(26, 26)
		pause_btn.add_theme_font_size_override("font_size", 12)
		pause_btn.set_anchors_preset(Control.PRESET_TOP_LEFT)
		_pause_home.add_child(pause_btn)
		_pause_home.move_child(pause_btn, 0)

func top_alpha(a: float) -> void:
	_top.modulate.a = a

func card(text: String, color: Color, hold := 1.2) -> void:
	_card.text = text
	_card.add_theme_color_override("font_color", color)
	_card_t = hold
	_card.modulate.a = 0.0

func splat(color: Color) -> void:
	var vs := size
	var n := 3 + randi() % 4
	var cx := randf_range(vs.x * 0.15, vs.x * 0.85)
	var cy := randf_range(vs.y * 0.15, vs.y * 0.85)
	for k in n:
		_splats.append({"p": Vector2(cx + randf_range(-90, 90), cy + randf_range(-70, 70)),
			"r": randf_range(22, 70) * (1.6 if k == 0 else 1.0), "c": color, "t": 0.0,
			"vy": randf_range(6.0, 22.0)})
	_goo.queue_redraw()

func _draw_goo() -> void:
	for s in _splats:
		var a: float = 0.86 * clampf(1.0 - (s.t - 2.2) / 1.6, 0.0, 1.0)
		var c: Color = s.c
		_goo.draw_circle(s.p, s.r, Color(c.r, c.g, c.b, a))
		_goo.draw_circle(s.p + Vector2(-s.r * 0.3, -s.r * 0.3), s.r * 0.3,
			Color(1, 1, 1, a * 0.35))
		_goo.draw_circle(s.p + Vector2(0, s.r * 0.9), s.r * 0.45, Color(c.r, c.g, c.b, a))

func ball_hint(h: Vector3, dt: float) -> void:
	var want := 1.0 if h.z > 0.5 else 0.0
	_mark_a += (want - _mark_a) * (1.0 - exp(-dt * 10.0))
	_mark.modulate.a = _mark_a
	if h.z > 0.5:
		var vs := size
		var x := clampf(h.x - 30.0, 8.0, vs.x - 68.0)
		var y := clampf(h.y - 6.0, 68.0, vs.y - 48.0)
		_mark.position = Vector2(x, y)
		_mark.rotation = 0.0 if h.y < 0.0 else (-PI * 0.5 if h.x < 0.0 else PI * 0.5)

func shout(text: String, color := Color(1, 1, 1), hold := 1.8) -> void:
	_big.text = text
	_big.add_theme_color_override("font_color", color)
	_big_t = hold
	_big_pop = 1.0
	_rally_t = 0.0

func update(m: BVMatch, dt: float) -> void:
	var g := m.logic
	for i in 2:
		var s := str(g.scores[i])
		if _score[i].text != s:
			_score[i].text = s
			_pulse[i] = 1.0
		_pulse[i] = maxf(0.0, _pulse[i] - dt * 3.0)
		_score[i].scale = Vector2.ONE * (1.0 + _pulse[i] * 0.22)
		_score[i].pivot_offset = _score[i].size * 0.5
		if _disc[i].text != names[i]:
			_disc[i].text = names[i]
		var c: float = clampf(m.world.charge[m.world.lead(i)] / BV.SPECIAL_FULL, 0.0, 1.0)
		if i == 0:
			_fill[i].offset_right = NAME_W * c
		else:
			_fill[i].offset_left = -NAME_W * c
		_fill[i].modulate.a = 0.55 + 0.45 * c
		if c >= 1.0:
			_fill[i].modulate.a = 0.8 + 0.2 * sin(Time.get_ticks_msec() * 0.006)

	var stw := g.score_to_win
	var mp := maxi(g.scores[0], g.scores[1]) >= stw - 1 and g.winner == BV.NO_PLAYER
	_info.text = "MATCH POINT" if mp else sub_text
	_info.add_theme_color_override("font_color",
		Color(1.0, 0.5, 0.35) if mp else Color(1, 1, 1, 0.5))

	if g.rally != _rally_shown:
		_rally_shown = g.rally
		if g.rally == 0:
			_rally_base = g.rally_best
			_rally_rec = false
		elif g.rally >= RALLY_MIN:
			var rec := g.rally > _rally_base
			if rec and not _rally_rec:
				_rally_rec = true
				shout("NEW RECORD!", UiTheme.GOLD, 1.5)
			elif g.rally % 10 == 0:
				shout("RALLY %d!" % g.rally, Color(1.0, 0.6, 0.3), 1.2)
			_rally.text = ("RECORD %d" if rec else "RALLY %d") % g.rally
			_rally_pulse = 1.0
			_rally_t = 0.0 if _big_t > 0.0 else RALLY_HOLD
			_rally.add_theme_color_override("font_color",
				UiTheme.GOLD if rec else Color(1.0, 0.85, 0.35))
			_rally.add_theme_font_size_override("font_size", 24 + mini(g.rally, 30))
	_rally_t -= dt
	_rally_pulse = maxf(0.0, _rally_pulse - dt * 4.0)
	_rally.modulate.a = clampf(_rally_t * 3.0, 0.0, 1.0) if g.rally >= RALLY_MIN and _big_t <= 0.0 else 0.0
	_rally.pivot_offset = _rally.size * 0.5
	_rally.scale = Vector2.ONE * (1.0 + _rally_pulse * 0.10)

	if _card_t > 0.0:
		_card_t -= dt
		_card.modulate.a = clampf(minf(_card_t * 4.0, 1.0), 0.0, 1.0)
		_card.pivot_offset = _card.size * 0.5
		_card.scale = Vector2.ONE * (1.0 + clampf(_card_t - 0.9, 0.0, 0.3) * 0.15)
	elif _card.modulate.a > 0.0:
		_card.modulate.a = 0.0
	if _splats.size() > 0:
		var keep := []
		for s in _splats:
			s.t += dt
			s.p.y += s.vy * dt * (1.0 + s.t)
			if s.t < 3.8:
				keep.append(s)
		_splats = keep
		_goo.queue_redraw()
	if _bub_t > 0.0:
		_bub_t -= dt
		_bub_pop = maxf(0.0, _bub_pop - dt * 6.0)
		var e := _bub_pop * _bub_pop
		_bub.modulate.a = clampf(minf(1.0, _bub_t * 3.0), 0.0, 1.0)
		_bub.scale = Vector2.ONE * (0.6 + 0.4 * (1.0 - e))
		_place_bubble()
	elif _bub.visible:
		_bub.visible = false
	if _big_t > 0.0:
		_big_t -= dt
		_big_pop = maxf(0.0, _big_pop - dt * 5.0)
		var e := _big_pop * _big_pop
		_big.modulate.a = minf(1.0, _big_t * 3.0) * (1.0 - e)
		_big.pivot_offset = _big.size * 0.5
		_big.scale = Vector2.ONE * (1.0 + e * 0.08)
	elif _big.modulate.a > 0.0:
		_big.modulate.a = 0.0
