class_name TouchPad
extends Control

## Controle de toque: esquerda/direita/baixo à esquerda, pular (que também é o
## especial com a barra cheia) e se jogar à direita. Cada dedo é rastreado por índice, então dois dedos de uma vez
## funcionam, e o dedo pode deslizar de um botão pro outro sem soltar.

var slot := 0
var charge := 0.0
var _btn_touch := {}
var _buttons: Array = []
var _font: Font
var _emotes: Array = []
var _emote_flash := {}

signal emote(id: int)

func build(slot_index := 0) -> void:
	slot = slot_index
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = get_theme_default_font()
	_buttons = [
		{"act": "left", "icon": "◀", "label": "", "pos": Vector2(96, -200), "r": 64.0,
			"col": Color(0.92, 0.86, 0.66), "side": 0},
		{"act": "right", "icon": "▶", "label": "", "pos": Vector2(240, -200), "r": 64.0,
			"col": Color(0.92, 0.86, 0.66), "side": 0},
		{"act": "down", "icon": "▼", "label": "", "pos": Vector2(168, -92), "r": 50.0,
			"col": Color(0.92, 0.86, 0.66), "side": 0},
		{"act": "up", "icon": "⤒", "label": "PULAR", "pos": Vector2(-112, -128), "r": 74.0,
			"col": Color(0.55, 0.90, 0.45), "side": 1},
		{"act": "dive", "icon": "↯", "label": "SE JOGAR", "pos": Vector2(-268, -104),
			"r": 58.0, "col": Color(0.55, 0.82, 1.0), "side": 1},
	]
	_emotes = [
		{"id": 0, "tex": "laugh", "col": Color(1.0, 0.82, 0.34)},
		{"id": 1, "tex": "cry", "col": Color(0.44, 0.79, 1.0)},
		{"id": 2, "tex": "rage", "col": Color(1.0, 0.42, 0.24)},
		{"id": 3, "tex": "finger", "col": Color(1.0, 0.37, 0.82)},
		{"id": 4, "tex": "taunt", "col": Color(0.62, 1.0, 0.56)},
	]
	for e in _emotes:
		e["img"] = load("res://assets/emoji/%s.png" % e.tex)
	queue_redraw()

const EMO_R := 26.0

func _emote_pos(k: int) -> Vector2:
	return Vector2(size.x - 44.0, 150.0 + k * 62.0)

func _btn_pos(b: Dictionary) -> Vector2:
	return Vector2(b.pos.x if b.side == 0 else size.x + b.pos.x, size.y + b.pos.y)

func _process(_dt: float) -> void:
	if visible:
		queue_redraw()

func _draw() -> void:
	for k in _emotes.size():
		var e: Dictionary = _emotes[k]
		var p := _emote_pos(k)
		var fl: float = _emote_flash.get(k, 0.0)
		var c: Color = e.col
		draw_circle(p, EMO_R + fl * 6.0, Color(0.1, 0.07, 0.05, 0.42 + fl * 0.3))
		draw_arc(p, EMO_R - 1.0 + fl * 6.0, 0, TAU, 32, Color(c.r, c.g, c.b, 0.6 + fl * 0.4), 2.0, true)
		var tex: Texture2D = e.img
		if tex != null:
			var s := EMO_R * 1.3
			draw_texture_rect(tex, Rect2(p - Vector2(s, s) * 0.5, Vector2(s, s)), false, Color(1, 1, 1, 0.9))
		_emote_flash[k] = maxf(0.0, fl - 0.05)
	for b in _buttons:
		var p := _btn_pos(b)
		var on := _btn_touch.values().has(b.act)
		var c: Color = b.col
		var r: float = b.r
		var ready: bool = b.act == "up" and charge >= 1.0
		if ready:
			r += 3.0 + 3.0 * sin(Time.get_ticks_msec() * 0.008)
			c = Color(1.0, 0.80, 0.25)
		draw_circle(p + Vector2(0, 4), r, Color(0, 0, 0, 0.28))
		draw_circle(p, r, Color(0.16, 0.10, 0.05, 0.62 if on else 0.48))
		draw_circle(p, r - 5.0, Color(c.r, c.g, c.b, 0.50 if on else 0.22))
		draw_arc(p, r - 2.0, 0, TAU, 48, Color(c.r, c.g, c.b, 0.9), 3.0, true)
		if b.act == "up" and charge < 1.0:
			draw_arc(p, r - 9.0, -PI * 0.5, -PI * 0.5 + TAU * charge, 40,
				Color(1, 1, 1, 0.55), 4.0, true)
		var fs: int = int(r * 0.9)
		var w := _font.get_string_size(b.icon, HORIZONTAL_ALIGNMENT_CENTER, -1, fs).x
		draw_string_outline(_font, p + Vector2(-w * 0.5, fs * 0.36), b.icon,
			HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0, 0, 0, 0.6))
		draw_string(_font, p + Vector2(-w * 0.5, fs * 0.36), b.icon,
			HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.95))
		var label: String = b.label
		if b.act == "up" and ready:
			label = "ESPECIAL!"
		if label != "":
			var lw := _font.get_string_size(label, HORIZONTAL_ALIGNMENT_CENTER, -1, 16).x
			var lp := p + Vector2(-lw * 0.5, r + 20.0)
			draw_string_outline(_font, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, 4,
				Color(0, 0, 0, 0.7))
			draw_string(_font, lp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, c)

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_press(e.index, e.position)
		else:
			_release(e.index)
	elif e is InputEventScreenDrag:
		_drag(e.index, e.position)

func _hit(pos: Vector2, slack: float) -> Dictionary:
	var best := {}
	var bd := INF
	for b in _buttons:
		var d := pos.distance_to(_btn_pos(b))
		if d <= b.r * slack and d < bd:
			bd = d
			best = b
	return best

func _press(idx: int, pos: Vector2) -> void:
	for k in _emotes.size():
		if pos.distance_to(_emote_pos(k)) <= EMO_R * 1.25:
			_emote_flash[k] = 1.0
			emote.emit(_emotes[k].id)
			return
	var b := _hit(pos, 1.3)
	if b.is_empty():
		return
	_btn_touch[idx] = b.act
	_apply()

func _drag(idx: int, pos: Vector2) -> void:
	if not _btn_touch.has(idx):
		return
	var b := _hit(pos, 1.6)
	if not b.is_empty() and b.act != _btn_touch[idx]:
		_btn_touch[idx] = b.act
		_apply()

func _release(idx: int) -> void:
	_btn_touch.erase(idx)
	_apply()

func _apply() -> void:
	var t: Dictionary = Controls.touch[slot]
	for k in t:
		t[k] = false
	for a in _btn_touch.values():
		t[a] = true
