class_name Controls
extends RefCounted

## O InputMap é montado em código: assim o teclado, o gamepad e o toque moram
## num lugar só e não somem num merge de project.godot.

const PAD_ANY := -1

static var _ready := false

static func setup() -> void:
	if _ready:
		return
	_ready = true
	_act("p1_left", [KEY_A], [JOY_BUTTON_DPAD_LEFT], 0, JOY_AXIS_LEFT_X, -1)
	_act("p1_right", [KEY_D], [JOY_BUTTON_DPAD_RIGHT], 0, JOY_AXIS_LEFT_X, 1)
	_act("p1_up", [KEY_W, KEY_SPACE], [JOY_BUTTON_A, JOY_BUTTON_DPAD_UP], 0, JOY_AXIS_LEFT_Y, -1)
	_act("p1_special", [KEY_SPACE], [JOY_BUTTON_B, JOY_BUTTON_Y,
		JOY_BUTTON_RIGHT_SHOULDER], 0)
	_act("p1_down", [KEY_S], [JOY_BUTTON_DPAD_DOWN], 0, JOY_AXIS_LEFT_Y, 1)
	_act("p1_dive", [KEY_E, KEY_Q], [JOY_BUTTON_X, JOY_BUTTON_LEFT_SHOULDER], 0)
	_mouse("p1_dive")

	_act("p2_left", [KEY_LEFT], [JOY_BUTTON_DPAD_LEFT], 1, JOY_AXIS_LEFT_X, -1)
	_act("p2_right", [KEY_RIGHT], [JOY_BUTTON_DPAD_RIGHT], 1, JOY_AXIS_LEFT_X, 1)
	_act("p2_up", [KEY_UP], [JOY_BUTTON_A, JOY_BUTTON_DPAD_UP], 1, JOY_AXIS_LEFT_Y, -1)
	_act("p2_special", [KEY_SHIFT, KEY_KP_0], [JOY_BUTTON_B,
		JOY_BUTTON_Y, JOY_BUTTON_RIGHT_SHOULDER], 1)
	_act("p2_down", [KEY_DOWN], [JOY_BUTTON_DPAD_DOWN], 1, JOY_AXIS_LEFT_Y, 1)
	_act("p2_dive", [KEY_CTRL, KEY_KP_1, KEY_ENTER], [JOY_BUTTON_X, JOY_BUTTON_LEFT_SHOULDER], 1)

	# jogando sozinho, os dois lados do teclado valem
	_act("solo_left", [KEY_A, KEY_LEFT], [JOY_BUTTON_DPAD_LEFT], PAD_ANY, JOY_AXIS_LEFT_X, -1)
	_act("solo_right", [KEY_D, KEY_RIGHT], [JOY_BUTTON_DPAD_RIGHT], PAD_ANY, JOY_AXIS_LEFT_X, 1)
	_act("solo_up", [KEY_W, KEY_UP, KEY_SPACE], [JOY_BUTTON_A, JOY_BUTTON_DPAD_UP],
		PAD_ANY, JOY_AXIS_LEFT_Y, -1)
	_act("solo_special", [KEY_SPACE], [JOY_BUTTON_B, JOY_BUTTON_Y,
		JOY_BUTTON_RIGHT_SHOULDER], PAD_ANY)
	_act("solo_down", [KEY_S, KEY_DOWN], [JOY_BUTTON_DPAD_DOWN], PAD_ANY, JOY_AXIS_LEFT_Y, 1)
	_act("solo_dive", [KEY_E, KEY_Q, KEY_CTRL, KEY_KP_1, KEY_ENTER],
		[JOY_BUTTON_X, JOY_BUTTON_LEFT_SHOULDER], PAD_ANY)
	_mouse("solo_dive")

	_act("pause", [KEY_ESCAPE], [JOY_BUTTON_START], PAD_ANY)
	for i in 5:
		_act("emote_%d" % i, [KEY_1 + i], [], PAD_ANY)

static func _mouse(name: String) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	InputMap.action_add_event(name, e)

static func _act(name: String, keys: Array, buttons: Array, device := PAD_ANY,
		axis := -1, axis_dir := 0) -> void:
	if InputMap.has_action(name):
		InputMap.erase_action(name)
	InputMap.add_action(name, 0.5)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(name, e)
	for b in buttons:
		var e := InputEventJoypadButton.new()
		e.button_index = b
		e.device = device
		InputMap.action_add_event(name, e)
	if axis >= 0:
		var e := InputEventJoypadMotion.new()
		e.axis = axis
		e.axis_value = float(axis_dir)
		e.device = device
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
	out.dive = Input.is_action_pressed(prefix + "_dive")
	if touch_slot >= 0:
		var t: Dictionary = touch[touch_slot]
		out.left = out.left or t.left
		out.right = out.right or t.right
		out.up = out.up or t.up
		out.special = out.special or t.special
		out.down = out.down or t.down
		out.dive = out.dive or t.dive
	return out
