class_name Roster
extends RefCounted

## Os oito do arcade. Cada um tem uma cara, um cenário de casa e um jeito de
## jogar. A torre sobe deles: quanto mais alto, mais forte o bot.

const CHARS := [
	{"id": "tico", "name": "Tico", "look": [2, 5, 1], "scene": "selva", "mood": "laugh",
		"line": "A clareira é minha!"},
	{"id": "marina", "name": "Marina", "look": [6, 6, 2], "scene": "praia", "mood": "smug",
		"line": "Vem pegar sol."},
	{"id": "bruto", "name": "Bruto", "look": [4, 2, 0], "scene": "galpao", "mood": "angry",
		"line": "Aqui dentro não tem vento pra te ajudar."},
	{"id": "lua", "name": "Lua", "look": [3, 9, 5], "scene": "acampamento", "mood": "calm",
		"line": "Shh. Os vagalumes estão olhando."},
	{"id": "frida", "name": "Frida", "look": [5, 8, 3], "scene": "neve", "mood": "focus",
		"line": "Bola gelada, mão firme."},
	{"id": "kaz", "name": "Kaz", "look": [10, 1, 7], "scene": "telhado", "mood": "slick",
		"line": "Cuidado com a beirada."},
	{"id": "itaca", "name": "Ítaca", "look": [9, 4, 4], "scene": "ruinas", "mood": "smug",
		"line": "Mil anos de jogo nessas pedras."},
	{"id": "magma", "name": "Magma", "look": [0, 11, 3], "scene": "caverna", "mood": "angry",
		"line": "Você vai derreter."},
]

const TOWERS := [
	{"id": "novato", "name": "NOVATO", "steps": [0, 1, 2, 3]},
	{"id": "guerreiro", "name": "GUERREIRO", "steps": [1, 0, 3, 2, 4, 5]},
	{"id": "mestre", "name": "MESTRE", "steps": [0, 1, 2, 3, 4, 5, 6, 7]},
]

const DIFFS := ["easy", "normal", "hard", "insane"]

static func by_id(id: String) -> Dictionary:
	for c in CHARS:
		if c.id == id:
			return c
	return CHARS[0]

static func scene_char(scene: String) -> Dictionary:
	for c in CHARS:
		if c.scene == scene:
			return c
	return {}

## Dificuldade do degrau: a torre novata para no normal, a mestre termina insana.
static func difficulty(tower: int, step: int) -> String:
	var n: int = TOWERS[tower].steps.size()
	var top: int = [1, 2, 3][tower]
	var k := int(floor(float(step) * (top + 1) / float(n)))
	return DIFFS[clampi(k, 0, top)]
