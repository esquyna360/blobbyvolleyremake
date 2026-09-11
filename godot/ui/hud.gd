class_name Hud
extends Control

## Placar, barra de especial e contador de rally. Nada aqui lê o mundo direto:
## o jogo empurra o estado a cada quadro.

const BAR_W := 170.0
const BAR_H := 12.0

var _score := [null, null]
var _bar := [null, null]
var _fill := [null, null]
var _rally: Label
var _info: Label
var _big: Label
var _big_t := 0.0
var _pulse := [0.0, 0.0]
var _disc := [null, null]
var pause_btn: Button

signal pause_pressed

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

	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.offset_left = -250
	panel.offset_right = 250
	panel.offset_top = 10
	panel.add_theme_stylebox_override("panel", UiTheme.wood())
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)
	var top := HBoxContainer.new()
	top.alignment = BoxContainer.ALIGNMENT_CENTER
	top.add_theme_constant_override("separation", 14)
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(top)

	for i in 2:
		if i == 1:
			pause_btn = Button.new()
			pause_btn.text = "❚❚"
			pause_btn.custom_minimum_size = Vector2(58, 58)
			pause_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			UiTheme.style(pause_btn, Color(0.45, 0.85, 0.40), 20)
			pause_btn.focus_mode = Control.FOCUS_NONE
			pause_btn.pressed.connect(func(): pause_pressed.emit())
			top.add_child(pause_btn)
		var col := VBoxContainer.new()
		col.custom_minimum_size = Vector2(BAR_W, 0)
		col.alignment = BoxContainer.ALIGNMENT_BEGIN
		col.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_theme_constant_override("separation", 10)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var disc := Label.new()
		disc.text = "●"
		disc.add_theme_font_size_override("font_size", 44)
		disc.add_theme_color_override("font_color", left if i == 0 else right)
		disc.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
		disc.add_theme_constant_override("outline_size", 6)
		disc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_disc[i] = disc
		var s := Label.new()
		s.text = "0"
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		s.add_theme_font_size_override("font_size", 50)
		s.add_theme_color_override("font_color", left if i == 0 else right)
		s.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
		s.add_theme_constant_override("outline_size", 8)
		s.custom_minimum_size = Vector2(80, 0)
		if i == 0:
			row.add_child(disc)
			row.add_child(s)
		else:
			row.add_child(s)
			row.add_child(disc)
		col.add_child(row)
		_score[i] = s

		var back := ColorRect.new()
		back.color = Color(0, 0, 0, 0.42)
		back.custom_minimum_size = Vector2(BAR_W, BAR_H)
		back.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var fill := ColorRect.new()
		fill.color = left if i == 0 else right
		fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
		fill.offset_right = 0.0
		fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
		back.add_child(fill)
		col.add_child(back)
		_bar[i] = back
		_fill[i] = fill
		top.add_child(col)

	_info = Label.new()
	_info.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_info.anchor_left = 0.5
	_info.anchor_right = 0.5
	_info.offset_left = -180
	_info.offset_right = 180
	_info.offset_top = 112
	_info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_info.add_theme_font_size_override("font_size", 16)
	_info.add_theme_color_override("font_color", Color(1, 1, 1, 0.78))
	_info.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_info.add_theme_constant_override("outline_size", 5)
	_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_info)

	_rally = Label.new()
	_rally.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_rally.anchor_left = 0.5
	_rally.anchor_right = 0.5
	_rally.offset_left = -140
	_rally.offset_right = 140
	_rally.offset_top = 136
	_rally.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rally.add_theme_font_size_override("font_size", 22)
	_rally.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	_rally.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_rally.add_theme_constant_override("outline_size", 6)
	_rally.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_rally)

	_big = Label.new()
	_big.set_anchors_preset(Control.PRESET_CENTER)
	_big.anchor_left = 0.5
	_big.anchor_right = 0.5
	_big.anchor_top = 0.36
	_big.anchor_bottom = 0.36
	_big.offset_left = -340
	_big.offset_right = 340
	_big.offset_top = -40
	_big.offset_bottom = 40
	_big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_big.add_theme_font_size_override("font_size", 64)
	_big.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_big.add_theme_constant_override("outline_size", 10)
	_big.modulate.a = 0.0
	_big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_big)

func shout(text: String, color := Color(1, 1, 1), hold := 1.8) -> void:
	_big.text = text
	_big.add_theme_color_override("font_color", color)
	_big_t = hold

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
		var c: float = clampf(m.world.charge[i] / BV.SPECIAL_FULL, 0.0, 1.0)
		_fill[i].offset_right = BAR_W * c
		_fill[i].modulate.a = 0.55 + 0.45 * c
		if c >= 1.0:
			_fill[i].modulate.a = 0.8 + 0.2 * sin(Time.get_ticks_msec() * 0.006)

	var stw := g.score_to_win
	var mp := maxi(g.scores[0], g.scores[1]) >= stw - 1 and g.winner == BV.NO_PLAYER
	_info.text = "MATCH POINT" if mp else "%s · até %d" % [g.rules.name, stw]
	_info.add_theme_color_override("font_color",
		Color(1.0, 0.5, 0.35) if mp else Color(1, 1, 1, 0.78))

	_rally.text = "rally %d" % g.rally if g.rally >= 4 else ""

	if _big_t > 0.0:
		_big_t -= dt
		_big.modulate.a = minf(1.0, _big_t * 2.5)
		_big.pivot_offset = _big.size * 0.5
		_big.scale = Vector2.ONE * (1.0 + maxf(0.0, _big_t - 1.4) * 0.5)
	elif _big.modulate.a > 0.0:
		_big.modulate.a = 0.0
