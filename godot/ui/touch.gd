class_name TouchPad
extends Control

## Controle de toque: manche de direção à esquerda, pular e especial à direita.
## Cada dedo é rastreado por índice, então dois dedos de uma vez funcionam.

const DEAD := 18.0

var slot := 0
var _stick_center := Vector2.ZERO
var _stick_touch := -1
var _stick_vec := Vector2.ZERO
var _btn_touch := {}
var _buttons: Array = []

func build(slot_index := 0) -> void:
	slot = slot_index
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_buttons = [
		{"act": "up", "label": "▲", "ax": 1.0, "pos": Vector2(-210, -150), "r": 62.0,
			"col": Color(0.30, 0.78, 1.0)},
		{"act": "special", "label": "★", "ax": 1.0, "pos": Vector2(-92, -230), "r": 56.0,
			"col": Color(1.0, 0.76, 0.25)},
		{"act": "down", "label": "▼", "ax": 1.0, "pos": Vector2(-92, -96), "r": 48.0,
			"col": Color(0.75, 0.82, 0.9)},
	]
	queue_redraw()

func _stick_origin() -> Vector2:
	return Vector2(150.0, size.y - 150.0)

func _btn_pos(b: Dictionary) -> Vector2:
	return Vector2(size.x + b.pos.x, size.y + b.pos.y)

func _draw() -> void:
	var o := _stick_center if _stick_touch >= 0 else _stick_origin()
	draw_circle(o, 86.0, Color(1, 1, 1, 0.10))
	draw_arc(o, 86.0, 0, TAU, 48, Color(1, 1, 1, 0.22), 2.0, true)
	draw_circle(o + _stick_vec * 50.0, 34.0, Color(1, 1, 1, 0.22))
	for b in _buttons:
		var p := _btn_pos(b)
		var on := _btn_touch.values().has(b.act)
		var c: Color = b.col
		draw_circle(p, b.r, Color(c.r, c.g, c.b, 0.30 if on else 0.16))
		draw_arc(p, b.r, 0, TAU, 40, Color(c.r, c.g, c.b, 0.75), 2.5, true)

func _gui_input(_e: InputEvent) -> void:
	pass

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_press(e.index, e.position)
		else:
			_release(e.index)
	elif e is InputEventScreenDrag:
		_drag(e.index, e.position)

func _press(idx: int, pos: Vector2) -> void:
	for b in _buttons:
		if pos.distance_to(_btn_pos(b)) <= b.r * 1.25:
			_btn_touch[idx] = b.act
			_apply()
			queue_redraw()
			return
	if pos.x < size.x * 0.5:
		_stick_touch = idx
		_stick_center = pos
		_stick_vec = Vector2.ZERO
		_apply()
		queue_redraw()

func _drag(idx: int, pos: Vector2) -> void:
	if idx != _stick_touch:
		return
	var d := pos - _stick_center
	_stick_vec = d / 86.0 if d.length() < 86.0 else d.normalized()
	_apply()
	queue_redraw()

func _release(idx: int) -> void:
	if idx == _stick_touch:
		_stick_touch = -1
		_stick_vec = Vector2.ZERO
	_btn_touch.erase(idx)
	_apply()
	queue_redraw()

func _apply() -> void:
	var t: Dictionary = Controls.touch[slot]
	var dx := _stick_vec.x * 86.0
	var dy := _stick_vec.y * 86.0
	t.left = dx < -DEAD
	t.right = dx > DEAD
	t.up = dy < -DEAD * 2.2
	t.down = dy > DEAD * 2.2
	t.special = false
	for a in _btn_touch.values():
		t[a] = true
