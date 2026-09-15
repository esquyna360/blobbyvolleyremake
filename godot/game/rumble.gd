class_name Rumble
extends RefCounted

## Vibração do controle. Fala a mesma língua do áudio: cada evento da partida
## vira um tranco de intensidade e duração próprias. Só treme o controle do lado
## que sofreu (ou fez) a coisa, e só se aquele lado for gente.

static var on := true
static var human := [false, false]
static var _until := [0.0, 0.0]

static func setup(is_human: Array) -> void:
	human = [bool(is_human[0]), bool(is_human[1])]
	stop()

static func stop() -> void:
	for slot in 2:
		var d := Controls.pad_of(slot)
		if d >= 0:
			Input.stop_joy_vibration(d)
		_until[slot] = 0.0

## weak é o motor agudo (textura), strong é o grave (peso). Os dois existem no
## Xbox e no DualSense; num controle sem motor a chamada não faz nada.
static func hit(slot: int, weak: float, strong: float, seconds: float) -> void:
	if not on or slot < 0 or slot > 1 or not human[slot]:
		return
	var d := Controls.pad_of(slot)
	if d < 0:
		return
	var now := Time.get_ticks_msec() / 1000.0
	# tranco fraco não interrompe tranco forte que ainda está tocando
	if now < _until[slot] and strong < 0.5:
		return
	_until[slot] = now + seconds
	Input.start_joy_vibration(d, clampf(weak, 0.0, 1.0), clampf(strong, 0.0, 1.0), seconds)

static func both(weak: float, strong: float, seconds: float) -> void:
	for slot in 2:
		hit(slot, weak, strong, seconds)

## `side` vem como índice de blob na maioria dos eventos -- com o modificador de
## dupla são quatro blobs em dois lados -- então passa por side_of. A exceção é
## PLAYER_ERROR, que já chega como lado, igual no áudio.
static func on_event(kind: int, side: int, intensity: float, w: PhysicWorld) -> void:
	if not on:
		return
	var i := clampf(intensity, 0.0, 1.0)
	var s := w.side_of(side) if kind != Ev.PLAYER_ERROR else side
	match kind:
		Ev.BALL_HIT_BLOB:
			hit(s, 0.20 + i * 0.35, 0.10 + i * 0.25, 0.06 + i * 0.05)
		Ev.SMASH:
			hit(s, 0.9, 0.8, 0.16)
		Ev.BLOCK:
			hit(s, 0.7, 0.55, 0.12)
		Ev.PARRY:
			hit(s, 1.0, 0.45, 0.10)
		Ev.DIG:
			hit(s, 0.45, 0.30, 0.09)
		Ev.DIVE:
			hit(s, 0.30, 0.45, 0.14)
		Ev.DIVE_HIT, Ev.DIVE_LAND:
			hit(s, 0.55, 0.70, 0.12)
		Ev.BONK:
			hit(s, 0.85, 0.95, 0.30)
		Ev.SPECIAL_READY:
			hit(s, 0.25, 0.10, 0.18)
		Ev.SPECIAL_FIRED:
			hit(s, 0.8, 1.0, 0.28)
		Ev.SPECIAL_HIT, Ev.SPECIAL_GROUND:
			both(0.6, 1.0, 0.34)
		Ev.FATALITY:
			both(1.0, 1.0, 0.7)
		Ev.PLAYER_ERROR:
			# quem perdeu o ponto leva o tranco seco; quem ganhou, o tapinha
			hit(s, 0.3, 0.75, 0.26)
			hit(BV.other(s), 0.45, 0.15, 0.14)
		_:
			pass

static func finish(winner: int) -> void:
	if winner == BV.NO_PLAYER:
		return
	hit(winner, 0.7, 0.55, 0.6)
	hit(BV.other(winner), 0.12, 0.35, 0.4)
