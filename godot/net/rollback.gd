class_name Rollback
extends RefCounted

## Anéis de estado e de entrada. A física é determinista e não usa trigonometria,
## então resimular dá exatamente o mesmo resultado nos dois lados: basta voltar
## ao quadro em que a previsão errou e rodar de novo.

const STATES := 32
const INPUTS := 256
const MAX_ROLLBACK := 20
## Quanto o lado local pode correr na frente sem confirmação do outro. Acima
## disso ele espera: é o que segura o rollback dentro do orçamento.
const MAX_AHEAD := 9
## Quadros repetidos por pacote. Com 8, só uma rajada de perda trava a partida.
const REDUNDANCY := 8

var frame := 0
var confirmed := -1
var rewind_to := -1
var desynced := false

var _sf: Array[PackedFloat64Array] = []
var _si: Array[PackedInt32Array] = []
var _sframe := PackedInt32Array()
var _local := PackedInt32Array()
var _remote := PackedInt32Array()
var _remote_at := PackedInt32Array()
var _last_remote := 0

func _init() -> void:
	_sframe.resize(STATES)
	_local.resize(INPUTS)
	_remote.resize(INPUTS)
	_remote_at.resize(INPUTS)
	for i in STATES:
		_sf.append(PackedFloat64Array())
		_si.append(PackedInt32Array())
		_sf[i].resize(BVMatch.STATE_FLOATS)
		_si[i].resize(BVMatch.STATE_INTS)
		_sframe[i] = -1
	for i in INPUTS:
		_remote_at[i] = -1

func reset() -> void:
	frame = 0
	confirmed = -1
	rewind_to = -1
	desynced = false
	_last_remote = 0
	for i in STATES:
		_sframe[i] = -1
	for i in INPUTS:
		_remote_at[i] = -1
		_local[i] = 0
		_remote[i] = 0

func save(m: BVMatch) -> void:
	var k := frame % STATES
	m.save(_sf[k], _si[k])
	_sframe[k] = frame

func restore(m: BVMatch, f: int) -> bool:
	var k := f % STATES
	if _sframe[k] != f:
		return false
	m.restore(_sf[k], _si[k])
	frame = f
	return true

func set_local(f: int, bits: int) -> void:
	_local[f % INPUTS] = bits

func local_at(f: int) -> int:
	return _local[f % INPUTS]

## Entrada do outro lado: o que chegou vale, o resto é a última conhecida.
func remote_at(f: int) -> int:
	var k := f % INPUTS
	return _remote[k] if _remote_at[k] == f else _last_remote

func has_remote(f: int) -> bool:
	return _remote_at[f % INPUTS] == f

## Guarda uma janela recebida e diz a partir de que quadro é preciso voltar.
func take_remote(start: int, bits: PackedInt32Array) -> void:
	for i in bits.size():
		var f := start + i
		if f < 0 or f <= confirmed:
			continue
		var k := f % INPUTS
		if _remote_at[k] == f:
			continue
		var predicted := remote_at(f)
		_remote[k] = bits[i]
		_remote_at[k] = f
		if f < frame and bits[i] != predicted:
			rewind_to = f if rewind_to < 0 else mini(rewind_to, f)
	# o confirmado avança enquanto houver quadro seguido
	while has_remote(confirmed + 1):
		confirmed += 1
		_last_remote = _remote[confirmed % INPUTS]

## Janela de entradas locais a mandar: repete as últimas por redundância.
func window() -> Array:
	var start := maxi(0, frame - REDUNDANCY)
	var out := PackedInt32Array()
	for f in range(start, frame):
		out.append(_local[f % INPUTS])
	return [start, out]

func too_far_ahead() -> bool:
	return frame - confirmed > MAX_AHEAD

func rewind_frame() -> int:
	if rewind_to < 0:
		return -1
	var f := maxi(rewind_to, frame - MAX_ROLLBACK)
	rewind_to = -1
	return f
