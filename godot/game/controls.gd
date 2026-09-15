class_name Controls
extends RefCounted

## O InputMap é montado em código: assim o teclado, o gamepad e o toque moram
## num lugar só e não somem num merge de project.godot.

const PAD_ANY := -1

## Zona morta do analógico. 0.5 obriga a empurrar o manche até a metade antes de
## o blob sair do lugar -- parece que o controle está atrasado. 0.3 anda assim
## que você inclina e ainda ignora manche gasto parado fora do centro.
const DEAD_STICK := 0.3
const DEAD_BTN := 0.5

## Gatilho descansa em 0 e vai até 1, então pede corte mais alto que o manche.
const DEAD_TRIGGER := 0.45

static var _ready := false

## Controles conectados, na ordem em que o sistema os lista. O slot 0 é o P1 e o
## slot 1 é o P2; os ids do Godot não são 0 e 1 garantidos -- um controle que
## reconecta pode voltar como 3 -- então o vínculo é refeito a cada mudança.
static var pads: Array[int] = []

static func setup() -> void:
	if _ready:
		return
	_ready = true
	_keys()
	refresh_pads()

static func _keys() -> void:
	_act("p1_left", [KEY_A], DEAD_STICK)
	_act("p1_right", [KEY_D], DEAD_STICK)
	_act("p1_up", [KEY_W], DEAD_STICK)
	_act("p1_special", [KEY_R, KEY_F], DEAD_BTN)
	_act("p1_down", [KEY_S], DEAD_STICK)
	_act("p1_dive", [KEY_E, KEY_Q, KEY_SHIFT], DEAD_BTN)

	_act("p2_left", [KEY_LEFT], DEAD_STICK)
	_act("p2_right", [KEY_RIGHT], DEAD_STICK)
	_act("p2_up", [KEY_UP], DEAD_STICK)
	_act("p2_special", [KEY_KP_2, KEY_PERIOD], DEAD_BTN)
	_act("p2_down", [KEY_DOWN], DEAD_STICK)
	_act("p2_dive", [KEY_CTRL, KEY_KP_0, KEY_KP_1, KEY_ENTER, KEY_SLASH], DEAD_BTN)

	# jogando sozinho, os dois lados do teclado e qualquer controle valem
	_act("solo_left", [KEY_A, KEY_LEFT], DEAD_STICK)
	_act("solo_right", [KEY_D, KEY_RIGHT], DEAD_STICK)
	_act("solo_up", [KEY_W, KEY_UP, KEY_SPACE], DEAD_STICK)
	_act("solo_special", [KEY_R, KEY_F, KEY_KP_2, KEY_PERIOD], DEAD_BTN)
	_act("solo_down", [KEY_S, KEY_DOWN], DEAD_STICK)
	_act("solo_dive", [KEY_E, KEY_Q, KEY_SHIFT, KEY_CTRL, KEY_KP_0, KEY_KP_1,
		KEY_ENTER, KEY_SLASH], DEAD_BTN)
	_mouse("solo_dive")

	_act("ui_ok", [KEY_ENTER, KEY_SPACE, KEY_KP_ENTER], DEAD_BTN)
	_act("ui_back", [KEY_ESCAPE, KEY_BACKSPACE], DEAD_BTN)
	_act("pause", [KEY_ESCAPE], DEAD_BTN)
	for i in 5:
		_act("emote_%d" % i, [KEY_1 + i], DEAD_BTN)
	_pad_binds()

## Relê a lista de controles e refaz os vínculos. Chamado no boot e sempre que
## um controle entra ou sai.
static func refresh_pads() -> void:
	var was := pads.duplicate()
	pads.clear()
	for d in Input.get_connected_joypads():
		pads.append(d)
	if was != pads:
		_pad_binds()

static func pad_of(slot: int) -> int:
	return pads[slot] if slot >= 0 and slot < pads.size() else -1

static func pad_name(slot: int) -> String:
	var d := pad_of(slot)
	return "" if d < 0 else Input.get_joy_name(d)

static func has_pad() -> bool:
	return pads.size() > 0

## Um controle sozinho é o P1; o segundo teclado (setas) continua valendo pro
## P2. Com dois controles, cada um pega um lado.
static func _pad_binds() -> void:
	for slot in 2:
		var d := pad_of(slot)
		var p := "p%d_" % (slot + 1)
		_clear_joy(p + "left"); _clear_joy(p + "right"); _clear_joy(p + "up")
		_clear_joy(p + "down"); _clear_joy(p + "dive")
		if d < 0:
			continue
		_joy_btn(p + "left", [JOY_BUTTON_DPAD_LEFT], d)
		_joy_axis(p + "left", JOY_AXIS_LEFT_X, -1, d)
		_joy_btn(p + "right", [JOY_BUTTON_DPAD_RIGHT], d)
		_joy_axis(p + "right", JOY_AXIS_LEFT_X, 1, d)
		_joy_btn(p + "up", [JOY_BUTTON_A, JOY_BUTTON_DPAD_UP], d)
		_joy_axis(p + "up", JOY_AXIS_LEFT_Y, -1, d)
		_joy_btn(p + "down", [JOY_BUTTON_DPAD_DOWN], d)
		_joy_axis(p + "down", JOY_AXIS_LEFT_Y, 1, d)
		_joy_btn(p + "dive", ACTION_BTNS, d)
		_joy_btn(p + "special", SPECIAL_BTNS, d)

	for a in ["solo_left", "solo_right", "solo_up", "solo_down", "solo_dive",
			"solo_special", "ui_ok", "ui_back", "pause"]:
		_clear_joy(a)
	_joy_btn("solo_left", [JOY_BUTTON_DPAD_LEFT], PAD_ANY)
	_joy_axis("solo_left", JOY_AXIS_LEFT_X, -1, PAD_ANY)
	_joy_btn("solo_right", [JOY_BUTTON_DPAD_RIGHT], PAD_ANY)
	_joy_axis("solo_right", JOY_AXIS_LEFT_X, 1, PAD_ANY)
	_joy_btn("solo_up", [JOY_BUTTON_A, JOY_BUTTON_DPAD_UP], PAD_ANY)
	_joy_axis("solo_up", JOY_AXIS_LEFT_Y, -1, PAD_ANY)
	_joy_btn("solo_down", [JOY_BUTTON_DPAD_DOWN], PAD_ANY)
	_joy_axis("solo_down", JOY_AXIS_LEFT_Y, 1, PAD_ANY)
	_joy_btn("solo_dive", ACTION_BTNS, PAD_ANY)
	_joy_btn("solo_special", SPECIAL_BTNS, PAD_ANY)
	_joy_btn("ui_ok", [JOY_BUTTON_A], PAD_ANY)
	_joy_btn("ui_back", [JOY_BUTTON_B], PAD_ANY)
	_joy_btn("pause", [JOY_BUTTON_START, JOY_BUTTON_BACK], PAD_ANY)

## X e B no Xbox, Quadrado e Círculo no DualSense, mais os dois ombros e os dois
## gatilhos: muita gente aperta o gatilho por reflexo, e ficar sem resposta ali
## passa a impressão de que o controle não pegou.
const ACTION_BTNS := [JOY_BUTTON_X, JOY_BUTTON_B,
	JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]

## Triângulo no DualSense, Y no Xbox: botão só do especial. Ficar junto com a
## ação fazia o especial sair no meio de um mergulho.
const SPECIAL_BTNS := [JOY_BUTTON_Y]

static func _clear_joy(name: String) -> void:
	if not InputMap.has_action(name):
		return
	for e in InputMap.action_get_events(name):
		if e is InputEventJoypadButton or e is InputEventJoypadMotion:
			InputMap.action_erase_event(name, e)

static func _joy_btn(name: String, buttons: Array, device: int) -> void:
	for b in buttons:
		var e := InputEventJoypadButton.new()
		e.button_index = b
		e.device = device
		InputMap.action_add_event(name, e)

static func _joy_axis(name: String, axis: int, dir: int, device: int) -> void:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = float(dir)
	e.device = device
	InputMap.action_add_event(name, e)

static func _mouse(name: String) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	InputMap.action_add_event(name, e)

static func _act(name: String, keys: Array, dead := DEAD_BTN) -> void:
	if InputMap.has_action(name):
		InputMap.erase_action(name)
	InputMap.add_action(name, dead)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(name, e)

## Estado do toque, preenchido pelos botões da tela. Um por lado.
static var touch := [
	{"left": false, "right": false, "up": false, "special": false, "down": false, "dive": false},
	{"left": false, "right": false, "up": false, "special": false, "down": false, "dive": false},
]

static func clear_touch() -> void:
	for t in touch:
		for k in t:
			t[k] = false

static func read(prefix: String, out: PlayerInput, touch_slot := -1) -> PlayerInput:
	out.left = Input.is_action_pressed(prefix + "_left")
	out.right = Input.is_action_pressed(prefix + "_right")
	out.up = Input.is_action_pressed(prefix + "_up")
	out.special = Input.is_action_pressed(prefix + "_special")
	out.down = Input.is_action_pressed(prefix + "_down")
	out.dive = Input.is_action_pressed(prefix + "_dive") or _trigger(prefix)
	if touch_slot >= 0:
		var t: Dictionary = touch[touch_slot]
		out.left = out.left or t.left
		out.right = out.right or t.right
		out.up = out.up or t.up
		out.special = out.special or t.special
		out.down = out.down or t.down
		out.dive = out.dive or t.dive
	return out

## Gatilho é eixo, não botão: lido direto pra não depender da zona morta da ação.
static func _trigger(prefix: String) -> bool:
	var slots: Array = pads
	if prefix == "p1":
		slots = [pad_of(0)] if pad_of(0) >= 0 else []
	elif prefix == "p2":
		slots = [pad_of(1)] if pad_of(1) >= 0 else []
	for d in slots:
		if Input.get_joy_axis(d, JOY_AXIS_TRIGGER_LEFT) > DEAD_TRIGGER \
				or Input.get_joy_axis(d, JOY_AXIS_TRIGGER_RIGHT) > DEAD_TRIGGER:
			return true
	return false
