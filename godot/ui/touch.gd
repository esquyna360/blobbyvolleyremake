class_name TouchPad
extends Control

## Controle de toque sem alvo pequeno: a tela inteira é dividida em quatro
## zonas e cada toque vai para a zona em que caiu. Metade esquerda move,
## metade direita age. Os círculos são só o desenho; a área que vale é a zona,
## então não existe "errei o botão por um dedo".

var slot := 0
var charge := 0.0

var _font: Font
var _own := {}
var _flash := {"left": 0.0, "right": 0.0, "up": 0.0, "dive": 0.0}

signal emote(id: int)

## Faixa do topo reservada para o placar e o botão de pausa.
const TOP := 0.17
const SIDE_MARGIN := 26.0
const BOTTOM_MARGIN := 22.0

func build(slot_index := 0) -> void:
	slot = slot_index
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = UiTheme.font(0.7, 1)
	queue_redraw()


## Raio do desenho. Cresce com a altura da tela, com piso e teto para caber
## tanto no celular pequeno quanto no tablet.
func _r() -> float:
	return clampf(size.y * 0.15, 56.0, 92.0)

func _safe_x() -> float:
	var r := DisplayServer.get_display_safe_area()
	var w := DisplayServer.window_get_size()
	if r.size.x <= 0 or r.size == w or w.x <= 0:
		return SIDE_MARGIN
	var sc: float = size.x / float(w.x)
	return maxf(SIDE_MARGIN, r.position.x * sc + SIDE_MARGIN)

func _pos(act: String) -> Vector2:
	var r := _r()
	var sx := _safe_x()
	var bottom := size.y - BOTTOM_MARGIN - r
	match act:
		"up":
			return Vector2(size.x - sx - r, bottom)
		"dive":
			return Vector2(size.x - sx - r - r * 2.2, bottom - r * 0.9)
		"left":
			return Vector2(_move_split() - r * 1.05, bottom)
		_:
			return Vector2(_move_split() + r * 1.05, bottom)


## A linha que separa andar para trás de andar para frente. Fica no meio da
## metade esquerda, então as duas direções têm a mesma área.
func _move_split() -> float:
	return maxf(_safe_x() + _r() * 1.3, size.x * 0.25)


## A zona de cada ponto. Sem buraco e sem sobreposição: todo toque abaixo do
## placar faz alguma coisa. Andar é dividido por uma linha reta; do lado das
## ações vale quem está mais perto, com o pulo puxando mais território porque
## é o toque mais frequente e o mais reflexo.
const JUMP_PULL := 1.32

func zone(p: Vector2) -> String:
	if p.y < size.y * TOP:
		return ""
	if p.x < size.x * 0.5:
		return "left" if p.x < _move_split() else "right"
	var da: float = p.distance_to(_pos("dive"))
	var dj: float = p.distance_to(_pos("up")) / JUMP_PULL
	return "dive" if da <= dj else "up"

func _process(dt: float) -> void:
	if not visible:
		return
	for k in _flash:
		_flash[k] = maxf(0.0, _flash[k] - dt * 4.0)
	queue_redraw()


# ------------------------------------------------------------------ desenho

func _draw() -> void:
	var held := _own.values()
	_draw_zone_hint(held)
	_draw_btn("left", "◀", "", Color(0.92, 0.86, 0.66), held)
	_draw_btn("right", "▶", "MOVE", Color(0.92, 0.86, 0.66), held)
	_draw_btn("dive", "★", "ACTION", Color(0.55, 0.82, 1.0), held)
	_draw_btn("up", "▲", "JUMP", Color(0.55, 0.90, 0.45), held)


## Uma mancha fraca na metade tocada: ensina que a área toda vale, sem
## desenhar retângulo em cima da quadra.
func _draw_zone_hint(held: Array) -> void:
	for k in ["left", "right", "dive", "up"]:
		var f: float = _flash[k]
		if f <= 0.01 and not (k in held):
			continue
		var a: float = maxf(f * 0.09, 0.09 if k in held else 0.0)
		var c: Vector2 = _pos(k)
		var r := _r()
		draw_circle(c, r * 3.4, Color(1, 1, 1, a * 0.35))

func _draw_btn(act: String, icon: String, label: String, col: Color, held: Array) -> void:
	var p := _pos(act)
	var r := _r()
	var on: bool = act in held
	var c := col
	var ready: bool = act == "dive" and charge >= 1.0
	if ready:
		r += 3.0 + 3.0 * sin(Time.get_ticks_msec() * 0.008)
		c = Color(1.0, 0.80, 0.25)
	if on:
		r += 4.0
	# o anel fica opaco (é ele que diz onde apertar) e o miolo fica fraco: o
	# blob passa por baixo do dedo e você continua vendo o que está fazendo
	draw_circle(p + Vector2(0, 5), r, Color(0, 0, 0, 0.22))
	draw_circle(p, r, Color(0.16, 0.10, 0.05, 0.52 if on else 0.28))
	draw_circle(p, r - 7.0, Color(c.r, c.g, c.b, 0.48 if on else 0.14))
	draw_arc(p, r - 3.5, 0, TAU, 64, Color(c.r, c.g, c.b, 0.95), 5.0, true)
	if act == "dive" and charge < 1.0:
		draw_arc(p, r - 13.0, -PI * 0.5, -PI * 0.5 + TAU * charge, 48,
			Color(1, 1, 1, 0.5), 5.0, true)
	var fs := int(r * 0.78)
	var w := _font.get_string_size(icon, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string_outline(_font, p + Vector2(-w * 0.5, fs * 0.36), icon,
		HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 5, Color(0, 0, 0, 0.6))
	draw_string(_font, p + Vector2(-w * 0.5, fs * 0.36), icon,
		HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.96))
	var t := "SPECIAL!" if ready else label
	if t == "":
		return
	var lw := _font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
	var lp := p + Vector2(-lw * 0.5, -r - 14.0)
	draw_string_outline(_font, lp, t, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, 4, Color(0, 0, 0, 0.7))
	draw_string(_font, lp, t, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, c)


# ------------------------------------------------------------------ entrada

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		if e.pressed:
			_press(e.index, e.position)
		else:
			_release(e.index)
	elif e is InputEventScreenDrag:
		_drag(e.index, e.position)

func _press(idx: int, pos: Vector2) -> void:
	var z := zone(pos)
	if z == "":
		return
	_own[idx] = z
	_flash[z] = 1.0
	_apply()

## Dedo que escorrega continua valendo: só troca quando entra de fato na
## outra zona, e nunca solta sozinho.
func _drag(idx: int, pos: Vector2) -> void:
	if not _own.has(idx):
		return
	var z := zone(pos)
	if z != "" and z != _own[idx]:
		_own[idx] = z
		_flash[z] = 1.0
		_apply()

func _release(idx: int) -> void:
	_own.erase(idx)
	_apply()

func _apply() -> void:
	var t: Dictionary = Controls.touch[slot]
	for k in t:
		t[k] = false
	for a in _own.values():
		t[a] = true
