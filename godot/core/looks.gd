class_name Looks
extends RefCounted

## Porte de web/src/core/looks.ts. Só pintura: nada aqui entra na física. A
## curva de cada mecha sai daqui e não do renderizador, então o penteado é o
## mesmo desenho que o da versão web.

## Tuft: [ângulo em graus, comprimento em raios de cabeça, meia-largura, dobra]
## Puff: [ângulo, distância do centro em raios, raio]

static func _fan(from_a: float, to_a: float, n: int, d: float, r: float) -> Array:
	var out := []
	for i in n:
		out.append([from_a + ((to_a - from_a) * i) / float(n - 1), d, r])
	return out

static var HAIR_STYLES: Array = _styles()

static func _styles() -> Array:
	return [
		{"id": "careca", "name": "Careca", "tufts": [], "puffs": []},
		{"id": "espeto", "name": "Espetado", "puffs": [], "tufts": [
			[-52, 0.72, 0.15, -0.16], [-26, 0.92, 0.16, -0.08], [0, 1.02, 0.17, 0.02],
			[26, 0.92, 0.16, 0.12], [52, 0.74, 0.15, 0.2]]},
		{"id": "moicano", "name": "Moicano", "puffs": [], "tufts": [
			[-26, 0.5, 0.11, 0.0], [-13, 0.86, 0.12, 0.0], [0, 1.12, 0.13, 0.0],
			[13, 0.9, 0.12, 0.06], [26, 0.56, 0.11, 0.1]]},
		{"id": "cachos", "name": "Cachos", "tufts": [],
			"puffs": _fan(-104, 104, 9, 0.94, 0.26) + _fan(-62, 62, 5, 1.16, 0.23)},
		{"id": "black", "name": "Black power", "tufts": [],
			"puffs": _fan(-124, 124, 10, 1.12, 0.4) + _fan(-78, 78, 6, 1.46, 0.36)},
		{"id": "cuia", "name": "Corte de cuia",
			"tufts": [[86, 0.44, 0.24, 1.0], [-86, 0.44, 0.24, -1.0]],
			"puffs": _fan(-132, 132, 13, 0.92, 0.3)},
		{"id": "rabo", "name": "Rabo de cavalo",
			"tufts": [[-104, 1.7, 0.3, -0.55], [-22, 0.42, 0.14, -0.3], [6, 0.38, 0.13, 0.26]],
			"puffs": _fan(-92, 44, 6, 0.92, 0.25) + [[-108, 1.14, 0.2]]},
		{"id": "franja", "name": "Franja",
			"tufts": [[8, 0.62, 0.2, 0.62], [30, 0.72, 0.21, 0.66], [52, 0.66, 0.2, 0.6],
				[-30, 0.44, 0.17, -0.3]],
			"puffs": _fan(-70, 20, 5, 0.9, 0.24)},
		{"id": "coque", "name": "Coque", "tufts": [],
			"puffs": [[-8, 1.42, 0.34], [-30, 1.2, 0.2], [14, 1.22, 0.2]]
				+ _fan(-102, 102, 8, 0.88, 0.23)},
		{"id": "longo", "name": "Cabelo longo",
			"tufts": [[-78, 0.95, 0.26, -1.8], [-96, 1.1, 0.28, -1.6], [-114, 0.95, 0.25, -1.3],
				[78, 0.92, 0.26, 1.8], [96, 1.08, 0.28, 1.6], [114, 0.95, 0.25, 1.3]],
			"puffs": _fan(-62, 62, 7, 0.9, 0.27) + [[-100, 1.02, 0.3], [100, 1.02, 0.3]]},
		{"id": "antenas", "name": "Antenas",
			"tufts": [[-24, 1.5, 0.075, -0.42], [22, 1.55, 0.075, 0.44]],
			"puffs": [[-58, 1.86, 0.15], [56, 1.92, 0.15]]},
		{"id": "chama", "name": "Chama", "puffs": [], "tufts": [
			[-24, 1.24, 0.19, 0.3], [-6, 1.66, 0.21, 0.26], [14, 1.4, 0.2, 0.34],
			[34, 0.94, 0.17, 0.42]]},
		{"id": "bone", "name": "Boné", "tufts": [], "puffs": [], "hat": [
			["dome", 0.0, 0.72, 0.62, 0.0],
			["disc", 0.58, 0.74, 0.50, 0.0, 0.06],
			["puff", 0.0, 1.32, 0.09]]},
		{"id": "chapeu", "name": "Chapéu de praia", "tufts": [], "puffs": [], "hat": [
			["disc", 0.0, 0.70, 1.28, 0.0, 0.10],
			["cyl", 0.0, 0.70, 0.62, 0.50],
			["disc", 0.0, 1.20, 0.64, 0.0, 0.06],
			["band", 0.0, 0.78, 0.66, 0.08]]},
		{"id": "gorro", "name": "Gorro", "tufts": [], "puffs": [], "hat": [
			["dome", 0.0, 0.66, 0.68, 0.0],
			["band", 0.0, 0.62, 0.72, 0.16],
			["puff", 0.0, 1.42, 0.2]]},
		{"id": "coroa", "name": "Coroa", "tufts": [], "puffs": [], "hat": [
			["cyl", 0.0, 0.72, 0.56, 0.3],
			["spikes", 0.0, 1.02, 0.56, 0.3, 6]]},
		{"id": "bandana", "name": "Bandana", "tufts": [[-96, 0.62, 0.11, -0.7], [-104, 0.5, 0.1, -0.45]], "puffs": [], "hat": [
			["band", 0.0, 0.70, 0.70, 0.13]]},
	]

const BODY_COLORS := [
	{"id": "rosa", "name": "Rosa", "hex": "#F07FBB"},
	{"id": "lima", "name": "Lima", "hex": "#B8E05C"},
	{"id": "coral", "name": "Coral", "hex": "#FF9A6B"},
	{"id": "menta", "name": "Menta", "hex": "#6FD9A8"},
	{"id": "lavanda", "name": "Lavanda", "hex": "#A47DFF"},
	{"id": "creme", "name": "Creme", "hex": "#F0E2C0"},
	{"id": "ciano", "name": "Ciano", "hex": "#63C8E8"},
	{"id": "ambar", "name": "Âmbar", "hex": "#F5C451"},
]

const PAIR_MIN_LUMA := 30.0

const HAIR_COLORS := [
	{"id": "preto", "name": "Preto", "hex": "#221d2a"},
	{"id": "castanho", "name": "Castanho", "hex": "#6b4326"},
	{"id": "loiro", "name": "Loiro", "hex": "#e8c66a"},
	{"id": "ruivo", "name": "Ruivo", "hex": "#d1522a"},
	{"id": "branco", "name": "Branco", "hex": "#f0f3f8"},
	{"id": "prata", "name": "Prata", "hex": "#aab6c9"},
	{"id": "rosa", "name": "Rosa", "hex": "#ff6fb5"},
	{"id": "azul", "name": "Azul", "hex": "#4aa8ff"},
	{"id": "verde", "name": "Verde", "hex": "#3ec46e"},
	{"id": "roxo", "name": "Roxo", "hex": "#a06bff"},
]

static func widx(v: int, n: int) -> int:
	return ((v % n) + n) % n

static func default_look(side: int) -> Array:
	return [0 if side == 0 else 1, 0, 0]

static func luma(c: Color) -> float:
	return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * 255.0

static func body_luma(idx: int) -> float:
	return luma(Color(BODY_COLORS[widx(idx, BODY_COLORS.size())].hex))

static func pair_ok(a: int, b: int) -> bool:
	return absf(body_luma(a) - body_luma(b)) >= PAIR_MIN_LUMA

## Os dois da partida precisam ler diferente até sem cor: distância mínima de
## luminosidade. Quem cede é o segundo (bot ou convidado), nunca o jogador.
static func pair_body(keep: int, other: int) -> int:
	if pair_ok(keep, other):
		return widx(other, BODY_COLORS.size())
	var best := -1
	var best_d := 0.0
	for i in BODY_COLORS.size():
		var d := absf(body_luma(keep) - body_luma(i))
		if d >= PAIR_MIN_LUMA and (best < 0 or d < best_d):
			best = i
			best_d = d
	return best if best >= 0 else widx(other + 1, BODY_COLORS.size())

static func roll_look(avoid_body: int) -> Array:
	var n := BODY_COLORS.size()
	var body := pair_body(avoid_body, (avoid_body + 1 + randi() % (n - 1)) % n)
	return [body, randi() % HAIR_STYLES.size(), randi() % HAIR_COLORS.size()]

static func body_color(look: Array) -> Color:
	return Color(BODY_COLORS[widx(look[0], BODY_COLORS.size())].hex)

static func hair_color(look: Array) -> Color:
	return Color(HAIR_COLORS[widx(look[2], HAIR_COLORS.size())].hex)

static func hair_style(look: Array) -> Dictionary:
	return HAIR_STYLES[widx(look[1], HAIR_STYLES.size())]

const ROOT := 0.84

## Pontos de uma mecha: centro e meia-largura, em raios de cabeça, y pra cima.
static func tuft_beads(t: Array, steps := 9) -> Array:
	var rad := deg_to_rad(float(t[0]))
	var tlen := float(t[1])
	var tw := float(t[2])
	var tc := float(t[3])
	var nx := sin(rad)
	var ny := cos(rad)
	var px := ny
	var py := -nx
	var rx := nx * ROOT
	var ry := ny * ROOT
	var tx := rx + nx * tlen + px * tc * tlen
	var ty := ry + ny * tlen + py * tc * tlen
	var cx := rx + nx * tlen * 0.5 + px * tc * tlen * 0.22
	var cy := ry + ny * tlen * 0.5 + py * tc * tlen * 0.22
	var out := []
	for i in steps + 1:
		var s := float(i) / steps
		var u := 1.0 - s
		out.append([
			u * u * rx + 2.0 * u * s * cx + s * s * tx,
			u * u * ry + 2.0 * u * s * cy + s * s * ty,
			tw * (0.14 + 0.86 * pow(1.0 - s, 0.7))])
	return out

static func puff_center(p: Array) -> Vector2:
	var rad := deg_to_rad(float(p[0]))
	return Vector2(sin(rad) * float(p[1]), cos(rad) * float(p[1]))

static func shade(c: Color, k: float) -> Color:
	return Color(clampf(c.r * k, 0.0, 1.0), clampf(c.g * k, 0.0, 1.0), clampf(c.b * k, 0.0, 1.0))
