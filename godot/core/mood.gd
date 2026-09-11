class_name BotMood
extends RefCounted

## Temperamento do bot. Nada disso entra na simulação: é reação a evento que já
## aconteceu, sorteada na hora. Mesmos números da versão web.

const LAUGH := 0
const CRY := 1
const RAGE := 2
const FINGER := 3
const TAUNT := 4
const NONE := -1

const TEMPER := {
	"easy": {"talk": 0.28, "salt": 0.18, "smug": 0.20, "rude": 0.00, "cool": 5.0},
	"normal": {"talk": 0.44, "salt": 0.52, "smug": 0.46, "rude": 0.06, "cool": 3.6},
	"hard": {"talk": 0.62, "salt": 0.72, "smug": 0.70, "rude": 0.20, "cool": 2.8},
	"insane": {"talk": 0.82, "salt": 0.86, "smug": 0.90, "rude": 0.44, "cool": 2.0},
}

var side := 0
var _t: Dictionary
var _last_at := -1e9
var _lost := 0
var _won := 0

func _init(s: int, diff: String) -> void:
	side = s
	_t = TEMPER[diff] if TEMPER.has(diff) else TEMPER["normal"]

func react(ev: EventBuf) -> int:
	for k in ev.n:
		var mine: bool = ev.side[k] == side
		var kind: int = ev.kind[k]
		if kind == Ev.FATALITY:
			if mine:
				return _say(FINGER if randf() < _t.rude else LAUGH, true)
			return _say(CRY, true)
		if kind == Ev.PLAYER_ERROR:
			if mine:
				_lost += 1
				_won = 0
				if not _rolls(_lost):
					return NONE
				return _say(RAGE if randf() < _t.salt else CRY)
			_won += 1
			_lost = 0
			if not _rolls(_won):
				return NONE
			return _say(TAUNT if randf() < _t.smug else LAUGH)
		if kind == Ev.SPECIAL_WASTED and mine and randf() < _t.talk * 0.45:
			return _say(RAGE)
		if kind == Ev.PARRY and mine and randf() < _t.talk * 0.4:
			return _say(TAUNT)
	return NONE

## Provocação do humano. O bot não deixa barato.
func answer(id: int) -> int:
	if randf() > _t.talk:
		return NONE
	if id == FINGER:
		return _say(FINGER if randf() < _t.rude else RAGE, true)
	if id == LAUGH or id == TAUNT:
		return _say(RAGE if randf() < _t.salt else TAUNT, true)
	if id == CRY:
		return _say(LAUGH, true)
	return NONE

func finish(won: bool) -> int:
	if won:
		return _say(FINGER if randf() < _t.rude else LAUGH, true)
	return _say(CRY, true)

func _rolls(streak: int) -> bool:
	if streak >= 3:
		return true
	return randf() < _t.talk

func _say(id: int, force := false) -> int:
	var now := Time.get_ticks_msec() / 1000.0
	if not force and now - _last_at < _t.cool:
		return NONE
	_last_at = now
	return id
