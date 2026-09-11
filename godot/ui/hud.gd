class_name Hud
extends Control

## Placar, barra de especial e contador de rally. Nada aqui lê o mundo direto:
## o jogo empurra o estado a cada quadro.

const BAR_W := 170.0
const RALLY_MIN := 6
const RALLY_HOLD := 1.9
const BAR_H := 12.0

var _score := [null, null]
var _bar := [null, null]
var _fill := [null, null]
var _rally: Label
var _info: Label
var _big: Label
var _big_t := 0.0
var _big_pop := 0.0
var _band: TextureRect
var _pulse := [0.0, 0.0]
var _rally_shown := -1
var _rally_base := 0
var _rally_rec := false
var _rally_pulse := 0.0
var _rally_t := 0.0
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

	_band = TextureRect.new()
	var bg := GradientTexture2D.new()
	var bgr := Gradient.new()
	bgr.set_color(0, Color(0, 0, 0, 0))
	bgr.set_color(1, Color(0, 0, 0, 0))
	bgr.add_point(0.25, Color(0.02, 0.01, 0.0, 0.55))
	bgr.add_point(0.75, Color(0.02, 0.01, 0.0, 0.55))
	bg.gradient = bgr
	bg.fill_from = Vector2(0, 0.5)
	bg.fill_to = Vector2(1, 0.5)
	bg.width = 512
	bg.height = 8
	_band.texture = bg
	_band.set_anchors_preset(Control.PRESET_FULL_RECT)
	_band.anchor_top = 0.36
	_band.anchor_bottom = 0.36
	_band.offset_top = -64
	_band.offset_bottom = 64
	_band.stretch_mode = TextureRect.STRETCH_SCALE
	_band.modulate.a = 0.0
	_band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_band)

	_big = Label.new()
	_big.set_anchors_preset(Control.PRESET_CENTER)
	_big.anchor_left = 0.5
	_big.anchor_right = 0.5
	_big.anchor_top = 0.36
	_big.anchor_bottom = 0.36
	_big.offset_left = -460
	_big.offset_right = 460
	_big.offset_top = -56
	_big.offset_bottom = 56
	_big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_big.add_theme_font_size_override("font_size", 84)
	_big.add_theme_color_override("font_outline_color", Color(0.14, 0.07, 0.02, 0.95))
	_big.add_theme_constant_override("outline_size", 16)
	_big.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55))
	_big.add_theme_constant_override("shadow_offset_x", 0)
	_big.add_theme_constant_override("shadow_offset_y", 8)
	_big.add_theme_constant_override("shadow_outline_size", 12)
	_big.modulate.a = 0.0
	_big.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_big)

func shout(text: String, color := Color(1, 1, 1), hold := 1.8) -> void:
	_big.text = text
	_big.add_theme_color_override("font_color", color)
	_big_t = hold
	_big_pop = 1.0

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

	if g.rally != _rally_shown:
		_rally_shown = g.rally
		if g.rally == 0:
			_rally_base = g.rally_best
			_rally_rec = false
		elif g.rally >= RALLY_MIN:
			var rec := g.rally > _rally_base
			if rec and not _rally_rec:
				_rally_rec = true
				shout("NOVO RECORDE!", UiTheme.GOLD, 1.5)
			elif g.rally % 10 == 0:
				shout("RALLY %d!" % g.rally, Color(1.0, 0.6, 0.3), 1.2)
			_rally.text = ("RECORDE %d" if rec else "RALLY %d") % g.rally
			_rally_pulse = 1.0
			_rally_t = RALLY_HOLD
			_rally.add_theme_color_override("font_color",
				UiTheme.GOLD if rec else Color(1.0, 0.85, 0.35))
			_rally.add_theme_font_size_override("font_size", 24 + mini(g.rally, 30))
	_rally_t -= dt
	_rally_pulse = maxf(0.0, _rally_pulse - dt * 4.0)
	_rally.modulate.a = clampf(_rally_t * 3.0, 0.0, 1.0) if g.rally >= RALLY_MIN else 0.0
	_rally.pivot_offset = _rally.size * 0.5
	_rally.scale = Vector2.ONE * (1.0 + _rally_pulse * 0.4)
	_rally.rotation = _rally_pulse * 0.06 * sin(Time.get_ticks_msec() * 0.05)

	if _big_t > 0.0:
		_big_t -= dt
		_big_pop = maxf(0.0, _big_pop - dt * 4.5)
		var e := _big_pop * _big_pop
		_big.modulate.a = minf(1.0, _big_t * 2.5) * (1.0 - e * 0.6)
		_big.pivot_offset = _big.size * 0.5
		var wob := 1.0 + sin(Time.get_ticks_msec() * 0.004) * 0.015
		_big.scale = Vector2.ONE * ((1.0 + e * 1.6) * wob)
		_big.rotation = -e * 0.12 + sin(Time.get_ticks_msec() * 0.0021) * 0.012
		_band.modulate.a = minf(1.0, _big_t * 2.5) * (1.0 - e)
	elif _big.modulate.a > 0.0:
		_big.modulate.a = 0.0
		_band.modulate.a = 0.0
