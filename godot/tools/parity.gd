extends SceneTree

## Roda a física do Godot com a mesma sequência de entradas do dumper em TS e
## cospe o estado byte a byte. Se um arquivo sair diferente do outro, o porte
## não é o mesmo jogo.

const FRAMES := 12000

var _walls := true
var _rules := "default"

var _seed := 12345

func _next() -> int:
	_seed = (_seed * 1664525 + 1013904223) & 0xFFFFFFFF
	return _seed

func _initialize() -> void:
	for a in OS.get_cmdline_user_args():
		if a == "--open":
			_walls = false
		elif a.begins_with("--rules="):
			_rules = a.substr(8)
	var m := BVMatch.new(_rules, 99, BV.LEFT, _walls)
	var li := PlayerInput.new()
	var ri := PlayerInput.new()
	var lbits := 0
	var rbits := 0
	var f := PackedFloat64Array()
	f.resize(BVMatch.STATE_FLOATS)
	var i := PackedInt32Array()
	i.resize(BVMatch.STATE_INTS)
	var out := PackedStringArray()
	for n in FRAMES:
		if (_next() & 7) == 0:
			lbits = (_next() >> 3) & 31
		if (_next() & 7) == 0:
			rbits = (_next() >> 3) & 31
		li.unpack(lbits)
		ri.unpack(rbits)
		m.step(li, ri)
		m.save(f, i)
		var b := f.to_byte_array()
		b.append_array(i.to_byte_array())
		out.append(b.hex_encode())
	var file := FileAccess.open("user://parity_godot.txt", FileAccess.WRITE)
	file.store_string("\n".join(out))
	file.close()
	print("wrote ", ProjectSettings.globalize_path("user://parity_godot.txt"))
	quit()
