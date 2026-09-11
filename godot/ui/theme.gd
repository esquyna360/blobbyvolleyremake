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

static func wood() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.27, 0.16, 0.08, 0.90)
	s.border_color = Color(0.78, 0.58, 0.30)
	s.set_border_width_all(3)
	s.set_corner_radius_all(20)
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 6
	s.content_margin_bottom = 8
	s.shadow_color = Color(0, 0, 0, 0.35)
	s.shadow_size = 8
	s.shadow_offset = Vector2(0, 4)
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

static func font(bold := 0.0, spacing := 0) -> FontVariation:
	var f := FontVariation.new()
	f.base_font = ThemeDB.fallback_font
	f.variation_embolden = bold
	f.spacing_glyph = spacing
	return f

static func glass(alpha := 0.82) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.03, 0.05, 0.05, alpha)
	s.border_color = Color(1, 1, 1, 0.09)
	s.set_border_width_all(1)
	s.set_corner_radius_all(6)
	s.set_content_margin_all(22)
	s.shadow_color = Color(0, 0, 0, 0.45)
	s.shadow_size = 24
	return s

static func heading(text: String, size := 52, col := Color(1, 1, 1, 0.97)) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font(0.9, 2))
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5))
	l.add_theme_constant_override("shadow_offset_y", 3)
	l.add_theme_constant_override("shadow_outline_size", 6)
	return l

static func eyebrow(text: String, col := GOLD, size := 14) -> Label:
	var l := Label.new()
	l.text = text.to_upper()
	l.add_theme_font_override("font", font(0.4, 5))
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l

## Item de lista: sem caixa, texto à esquerda, barra de destaque ao passar.
static func item(b: Button, accent := GOLD, size := 22) -> Button:
	for k in 3:
		var s := StyleBoxFlat.new()
		var lit: float = [0.0, 0.10, 0.16][k]
		s.bg_color = Color(1, 1, 1, lit)
		s.border_color = accent if k > 0 else Color(0, 0, 0, 0)
		s.border_width_left = 4
		s.set_corner_radius_all(3)
		s.content_margin_left = 22
		s.content_margin_right = 22
		s.content_margin_top = 8
		s.content_margin_bottom = 8
		b.add_theme_stylebox_override(["normal", "hover", "pressed"][k], s)
		if k == 1:
			b.add_theme_stylebox_override("focus", s)
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.add_theme_font_override("font", font(0.5, 1))
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_color_override("font_color", Color(1, 1, 1, 0.80))
	b.add_theme_color_override("font_hover_color", Color(1, 1, 1))
	b.add_theme_color_override("font_focus_color", Color(1, 1, 1))
	b.add_theme_color_override("font_pressed_color", accent.lightened(0.3))
	b.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.55))
	b.add_theme_constant_override("outline_size", 4)
	b.focus_mode = Control.FOCUS_ALL
	return b

## Botão de ação cheio (Pronto, Entrar, torre): sólido, cantos curtos.
static func solid(b: Button, base := GOLD, size := 18) -> Button:
	for k in 3:
		var s := StyleBoxFlat.new()
		s.bg_color = base.lightened([0.0, 0.12, -0.1][k])
		s.set_corner_radius_all(4)
		s.content_margin_left = 22
		s.content_margin_right = 22
		s.content_margin_top = 10
		s.content_margin_bottom = 10
		b.add_theme_stylebox_override(["normal", "hover", "pressed"][k], s)
		if k == 1:
			b.add_theme_stylebox_override("focus", s)
	b.add_theme_font_override("font", font(0.7, 2))
	b.add_theme_font_size_override("font_size", size)
	var ink := Color(0.06, 0.05, 0.03) if base.get_luminance() > 0.45 else Color(1, 1, 1)
	for n in ["font_color", "font_hover_color", "font_focus_color", "font_pressed_color"]:
		b.add_theme_color_override(n, ink)
	b.focus_mode = Control.FOCUS_ALL
	return b

## Segmento de controle (qualidade): pílula com o ativo aceso.
static func chip(b: Button, on: bool, size := 15) -> Button:
	for k in 3:
		var s := StyleBoxFlat.new()
		s.bg_color = GOLD if on else Color(1, 1, 1, [0.06, 0.14, 0.2][k])
		s.border_color = Color(1, 1, 1, 0.12)
		s.set_border_width_all(0 if on else 1)
		s.set_corner_radius_all(4)
		s.content_margin_left = 16
		s.content_margin_right = 16
		s.content_margin_top = 8
		s.content_margin_bottom = 8
		b.add_theme_stylebox_override(["normal", "hover", "pressed"][k], s)
		if k == 1:
			b.add_theme_stylebox_override("focus", s)
	b.add_theme_font_override("font", font(0.6, 1))
	b.add_theme_font_size_override("font_size", size)
	var ink := Color(0.06, 0.05, 0.03) if on else Color(1, 1, 1, 0.85)
	for n in ["font_color", "font_hover_color", "font_focus_color", "font_pressed_color"]:
		b.add_theme_color_override(n, ink)
	b.focus_mode = Control.FOCUS_ALL
	return b

static func slider_style(sl: HSlider) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.14)
	bg.set_corner_radius_all(2)
	bg.content_margin_top = 2
	bg.content_margin_bottom = 2
	var fg := StyleBoxFlat.new()
	fg.bg_color = GOLD
	fg.set_corner_radius_all(2)
	fg.content_margin_top = 2
	fg.content_margin_bottom = 2
	sl.add_theme_stylebox_override("slider", bg)
	sl.add_theme_stylebox_override("grabber_area", fg)
	sl.add_theme_stylebox_override("grabber_area_highlight", fg)
	var g := GradientTexture2D.new()
	g.width = 18
	g.height = 18
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.5)
	g.fill_to = Vector2(0.5, 1.0)
	var gr := Gradient.new()
	gr.set_color(0, Color(1, 1, 1))
	gr.set_color(1, Color(1, 1, 1, 0))
	gr.set_offset(1, 1.0)
	gr.add_point(0.82, Color(1, 1, 1))
	gr.add_point(0.9, Color(1, 1, 1, 0))
	g.gradient = gr
	sl.add_theme_icon_override("grabber", g)
	sl.add_theme_icon_override("grabber_highlight", g)
	sl.add_theme_icon_override("grabber_disabled", g)

static func line_edit(e: LineEdit, size := 20) -> LineEdit:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(1, 1, 1, 0.07)
	s.border_color = Color(1, 1, 1, 0.18)
	s.border_width_bottom = 2
	s.set_corner_radius_all(3)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	var f := s.duplicate()
	f.border_color = GOLD
	e.add_theme_stylebox_override("normal", s)
	e.add_theme_stylebox_override("focus", f)
	e.add_theme_font_override("font", font(0.4, 1))
	e.add_theme_font_size_override("font_size", size)
	e.add_theme_color_override("font_color", Color(1, 1, 1, 0.95))
	e.add_theme_color_override("font_placeholder_color", Color(1, 1, 1, 0.35))
	e.add_theme_color_override("caret_color", GOLD)
	return e
