class_name UiTheme
extends RefCounted

const GOLD := Color(1.0, 0.78, 0.28)
const INK := Color(0.05, 0.08, 0.06)
const LEAF := Color(0.32, 0.62, 0.30)

static func panel(bg := Color(0.04, 0.07, 0.05, 0.80), border := Color(1, 1, 1, 0.10)) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(14)
	s.set_content_margin_all(18)
	return s

static func button(base: Color) -> Array:
	var out := []
	for k in 3:
		var s := StyleBoxFlat.new()
		var a: float = [0.16, 0.30, 0.44][k]
		s.bg_color = Color(base.r, base.g, base.b, a)
		s.border_color = Color(base.r, base.g, base.b, 0.55 + k * 0.15)
		s.set_border_width_all(2)
		s.set_corner_radius_all(12)
		s.content_margin_left = 22
		s.content_margin_right = 22
		s.content_margin_top = 13
		s.content_margin_bottom = 13
		out.append(s)
	return out

static func style(b: Button, base := GOLD, size := 22) -> Button:
	var st := button(base)
	b.add_theme_stylebox_override("normal", st[0])
	b.add_theme_stylebox_override("hover", st[1])
	b.add_theme_stylebox_override("pressed", st[2])
	b.add_theme_stylebox_override("focus", st[1])
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_color_override("font_color", Color(1, 1, 1, 0.94))
	b.add_theme_color_override("font_hover_color", Color(1, 1, 1))
	b.add_theme_color_override("font_focus_color", Color(1, 1, 1))
	b.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	b.add_theme_constant_override("outline_size", 4)
	b.focus_mode = Control.FOCUS_ALL
	return b

static func label(text: String, size := 18, col := Color(1, 1, 1, 0.85)) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	l.add_theme_constant_override("outline_size", 5)
	return l
