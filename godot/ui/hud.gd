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
	_big.offset_left = -460
	_big.offset_right = 460
	_big.offset_top = -56
	_big.offset_bottom = 56
	_big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_big.add_theme_font_size_override("font_size", 58)
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
	_card.anchor_top = 0.76
	_card.anchor_bottom = 0.76
	_card.offset_left = -400
	_card.offset_right = 400
	_card.offset_top = -40
	_card.offset_bottom = 40
	_card.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_card.add_theme_font_size_override("font_size", 46)
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
	_info.text = "MATCH POINT" if mp else ("%s  vs  %s" % [names[0], names[1]] if names[0] != "" \
		else "%s · até %d" % [g.rules.name, stw])
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
	if _big_t > 0.0:
		_big_t -= dt
		_big_pop = maxf(0.0, _big_pop - dt * 5.0)
		var e := _big_pop * _big_pop
		_big.modulate.a = minf(1.0, _big_t * 3.0) * (1.0 - e)
		_big.pivot_offset = _big.size * 0.5
		_big.scale = Vector2.ONE * (1.0 + e * 0.08)
	elif _big.modulate.a > 0.0:
		_big.modulate.a = 0.0
