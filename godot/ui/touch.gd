class_name TouchPad
extends Control

## Controle de toque em duas mãos. A mão esquerda usa um analógico que nasce
## onde o dedo encosta: arrastar pro lado anda, arrastar pra baixo mergulha o
## peso. A direita tem só dois botões grandes, PULAR e AÇÃO. Nada de setinha.

var slot := 0
var charge := 0.0

var _font: Font
var _stick := -1
var _home := Vector2.ZERO
var _at := Vector2.ZERO
var _btn := {}
var _flash := {}

signal emote(id: int)

const DEAD := 18.0
const SWING := 78.0
const DOWN_A := 0.62

func build(slot_index := 0) -> void:
	slot = slot_index
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = UiTheme.font(0.7, 1)
	queue_redraw()


## Raio dos botões: acompanha a altura da tela pra caber igual em qualquer
## celular, com piso e teto pra não virar alvo minúsculo nem tampar a quadra.
func _r() -> float:
	return clampf(size.y * 0.135, 52.0, 80.0)

func _safe() -> Vector2:
	var r := DisplayServer.get_display_safe_area()
	var w := DisplayServer.window_get_size()
	if r.size.x <= 0 or r.size == w:
		return Vector2(26.0, 22.0)
	var sc: float = float(size.x) / maxf(1.0, float(w.x))
	return Vector2(maxf(26.0, r.position.x * sc + 16.0), maxf(22.0, 22.0))

func _jump_pos() -> Vector2:
	var r := _r()
	var s := _safe()
	return Vector2(size.x - r - s.x, size.y - r - s.y)

func _act_pos() -> Vector2:
	var r := _r()
	return _jump_pos() - Vector2(r * 2.35, r * 0.30)

func _stick_home() -> Vector2:
	var s := _safe()
	return Vector2(s.x + SWING + 24.0, size.y - SWING - s.y - 10.0)

func _in_stick_zone(p: Vector2) -> bool:
	return p.x < size.x * 0.46 and p.y > size.y * 0.24

func _process(_dt: float) -> void:
	if visible:
		queue_redraw()


# ------------------------------------------------------------------ desenho

func _draw() -> void:
	var r := _r()
	_draw_stick()
	_draw_btn(_act_pos(), r * 0.86, "★", "ACTION", Color(0.55, 0.82, 1.0), "dive")
	_draw_btn(_jump_pos(), r, "▲", "JUMP", Color(0.55, 0.90, 0.45), "up")

func _draw_stick() -> void:
	var home := _home if _stick >= 0 else _stick_home()
	var live := _stick >= 0
	var base := Color(0.92, 0.86, 0.66)
	draw_circle(home, SWING, Color(0.08, 0.06, 0.04, 0.30 if live else 0.20))
	draw_arc(home, SWING - 2.0, 0, TAU, 56, Color(base.r, base.g, base.b, 0.5 if live else 0.26), 3.0, true)
	var knob := home
	if live:
		var d := _at - home
		if d.length() > SWING:
			d = d.normalized() * SWING
		knob = home + d
	var kr := SWING * 0.46
	draw_circle(knob + Vector2(0, 3), kr, Color(0, 0, 0, 0.30))
	draw_circle(knob, kr, Color(0.18, 0.12, 0.06, 0.70 if live else 0.50))
	draw_circle(knob, kr - 4.0, Color(base.r, base.g, base.b, 0.42 if live else 0.20))
	draw_arc(knob, kr - 2.0, 0, TAU, 40, Color(base.r, base.g, base.b, 0.95), 3.0, true)
	if not live:
		var fs := int(SWING * 0.42)
		var t := "MOVE"
		var w := _font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		draw_string_outline(_font, home + Vector2(-w * 0.5, SWING + 26.0), t,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 16, 4, Color(0, 0, 0, 0.7))
		draw_string(_font, home + Vector2(-w * 0.5, SWING + 26.0), t,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(base.r, base.g, base.b, 0.75))
		fs = fs

func _draw_btn(p: Vector2, r: float, icon: String, label: String, col: Color, act: String) -> void:
	var on := _btn.values().has(act)
	var ready: bool = act == "dive" and charge >= 1.0
	var c := col
	if ready:
		r += 3.0 + 3.0 * sin(Time.get_ticks_msec() * 0.008)
		c = Color(1.0, 0.80, 0.25)
	draw_circle(p + Vector2(0, 5), r, Color(0, 0, 0, 0.30))
	draw_circle(p, r, Color(0.16, 0.10, 0.05, 0.66 if on else 0.50))
	draw_circle(p, r - 6.0, Color(c.r, c.g, c.b, 0.52 if on else 0.24))
	draw_arc(p, r - 3.0, 0, TAU, 56, Color(c.r, c.g, c.b, 0.92), 4.0, true)
	if act == "dive" and charge < 1.0:
		draw_arc(p, r - 11.0, -PI * 0.5, -PI * 0.5 + TAU * charge, 48,
			Color(1, 1, 1, 0.55), 5.0, true)
	var fs := int(r * 0.74)
	var w := _font.get_string_size(icon, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string_outline(_font, p + Vector2(-w * 0.5, fs * 0.36), icon,
		HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0, 0, 0, 0.6))
	draw_string(_font, p + Vector2(-w * 0.5, fs * 0.36), icon,
		HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.96))
	var t := "SPECIAL!" if ready else label
	var lw := _font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
	var lp := p + Vector2(-lw * 0.5, -r - 12.0)
	draw_string_outline(_font, lp, t, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, 4, Color(0, 0, 0, 0.7))
	draw_string(_font, lp, t, HORIZONTAL_ALIGNMENT_LEFT, -1, 17, c)


# ------------------------------------------------------------------ entrada

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_press(e.index, e.position)
		else:
			_release(e.index)
	elif e is InputEventScreenDrag:
		_drag(e.index, e.position)

func _hit(pos: Vector2) -> String:
	var r := _r()
	if pos.distance_to(_jump_pos()) <= r * 1.35:
		return "up"
	if pos.distance_to(_act_pos()) <= r * 0.86 * 1.45:
		return "dive"
	return ""

func _press(idx: int, pos: Vector2) -> void:
	var a := _hit(pos)
	if a != "":
		_btn[idx] = a
		_apply()
		return
	if _stick < 0 and _in_stick_zone(pos):
		_stick = idx
		_home = pos
		_at = pos
		_apply()

func _drag(idx: int, pos: Vector2) -> void:
	if idx == _stick:
		_at = pos
		_apply()
		return
	if not _btn.has(idx):
		return
	var a := _hit(pos)
	if a != "" and a != _btn[idx]:
		_btn[idx] = a
		_apply()

func _release(idx: int) -> void:
	if idx == _stick:
		_stick = -1
	_btn.erase(idx)
	_apply()

func _apply() -> void:
	var t: Dictionary = Controls.touch[slot]
	for k in t:
		t[k] = false
	for a in _btn.values():
		t[a] = true
	if _stick >= 0:
		var d := _at - _home
		if absf(d.x) > DEAD:
			t["left" if d.x < 0.0 else "right"] = true
		if d.y > SWING * DOWN_A:
			t["down"] = true
