class_name Sfx
extends RefCounted

## Os efeitos são renderizados fora do jogo (tools/make_sfx.py) e entram prontos.
## Antes eram sintetizados no boot a 22050 Hz: o teto ficava em 11 kHz -- justo
## onde mora o estalo de um impacto -- e custavam 0,7 s de carregamento. Agora
## cada som tem transiente, corpo e cauda a 44,1 kHz e o jogo só abre o arquivo.

const DIR := "res://assets/sfx/"

const NAMES := [
	"ui", "blip", "hit_blob", "hit_ground", "hit_net", "hit_wall", "land",
	"serve", "point_win", "point_lose", "emote_0", "emote_1", "emote_2",
	"special_ready", "special_fired", "special_hit", "ground_burn", "dive",
	"dive_hit", "bonk", "block", "apex", "special_wasted", "parry",
	"parry_whiff", "dig", "ball_out", "whistle", "cheer", "thunder", "glitch",
	"fatality", "finish_win", "finish_lose",
	"shinkuu", "spin", "spin_hit", "knockdown", "volley", "reversal",
]


static func bank() -> Dictionary:
	var out := {}
	for n in NAMES:
		var s: AudioStream = load(DIR + n + ".wav")
		if s != null:
			out[n] = s
	return out
