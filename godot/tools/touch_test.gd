extends SceneTree

## Mede o controle de toque como o dedo o encontra: varre a tela inteira, vê o
## que cada ponto aciona e traduz para milímetros de tela real.
## `godot --headless --path . -s tools/touch_test.gd`

const CASES := [
	{"n": "iPhone 14 landscape", "px": Vector2(844, 390)},
	{"n": "Pixel 7 landscape", "px": Vector2(915, 412)},
	{"n": "iPhone SE landscape", "px": Vector2(667, 375)},
	{"n": "tablet landscape", "px": Vector2(1180, 820)},
]

const MM_PER_CSS := 25.4 / 160.0
const ACTS := ["left", "right", "dive", "up"]
var fails: Array = []

func _init() -> void:
	for c in CASES:
		_run(c.n, c.px)
	print("")
	for f in fails:
		print("FAIL: ", f)
	print("TOUCH FAILS=", fails.size())
	quit()

func _logical(px: Vector2) -> Vector2:
	var s: float = minf(px.x / 1280.0, px.y / 720.0)
	var f: float = clampf(720.0 / maxf(340.0, px.y * 1.15), 1.0, 2.0)
	return px / (s * f)

func _run(name: String, px: Vector2) -> void:
	var pad := TouchPad.new()
	var logical := _logical(px)
	pad.size = logical
	var to_mm: float = (px.y / logical.y) * MM_PER_CSS
	var step := 3.0
	var area := {}
	var x := 0.0
	while x < logical.x:
		var y := 0.0
		while y < logical.y:
			var a: String = pad.zone(Vector2(x, y))
			if a != "":
				area[a] = area.get(a, 0) + 1
			y += step
		x += step
	print("\n== %s  (%d x %d css)  viewport %d x %d" % [name, px.x, px.y, logical.x, logical.y])
	var r: float = pad._r()
	print("   circulo desenhado: %.1f mm de diametro" % (r * 2.0 * to_mm))
	if r * 2.0 * to_mm < 14.0:
		fails.append("%s: circulo com %.1f mm, abaixo dos 14 mm" % [name, r * 2.0 * to_mm])
	var total: float = logical.x * logical.y
	for a in ACTS:
		var cells: int = area.get(a, 0)
		var pct: float = 100.0 * cells * step * step / total
		var slack := _slack(pad, a, logical)
		print("   %-6s %5.1f%% da tela   folga do centro ate a fronteira: %.1f mm" % [a, pct, slack * to_mm])
		if cells == 0:
			fails.append("%s: zona %s vazia" % [name, a])
		if slack * to_mm < 6.0:
			fails.append("%s: %s com so %.1f mm de folga ate a zona vizinha" % [name, a, slack * to_mm])
	_check(pad, logical, Vector2(logical.x - 30.0, logical.y - 30.0), "up",
		"%s: o canto onde o polegar direito descansa nao pula" % name)
	_check(pad, logical, Vector2(30.0, logical.y - 30.0), "left",
		"%s: o canto esquerdo nao anda para tras" % name)
	_check(pad, logical, Vector2(logical.x - 60.0, 20.0), "",
		"%s: o canto do botao de pausa esta roubando toque" % name)
	var c: Vector2 = pad._pos("dive")
	_check(pad, logical, c, "dive", "%s: o centro do ACTION nao aciona o ACTION" % name)
	_check(pad, logical, c + Vector2(0, r * 0.9), "dive",
		"%s: um dedo pousado abaixo do ACTION cai no JUMP" % name)
	pad.free()


## Quanto o dedo pode errar do centro do botão antes de cair na zona vizinha.
func _slack(pad: TouchPad, act: String, logical: Vector2) -> float:
	var c: Vector2 = pad._pos(act)
	var best := INF
	for deg in range(0, 360, 5):
		var dir := Vector2.RIGHT.rotated(deg_to_rad(deg))
		var d := 4.0
		while d < 400.0:
			var p := c + dir * d
			if p.x < 0.0 or p.y < 0.0 or p.x > logical.x or p.y > logical.y:
				break
			if pad.zone(p) != act:
				best = minf(best, d)
				break
			d += 4.0
	return best

func _check(pad: TouchPad, _logical: Vector2, p: Vector2, want: String, msg: String) -> void:
	if pad.zone(p) != want:
		fails.append(msg + " (deu %s)" % [pad.zone(p) if pad.zone(p) != "" else "nada"])
