class_name NetLink
extends Node

## Transporte. ENet direto por IP: sem serviço no meio, sem conta em loja —
## um abre a sala, o outro digita o endereço.

signal connected(is_host: bool)
signal failed(reason: String)
signal closed()
signal hello(side: int, look: Array, rules: String, stw: int, walls: bool)
signal inputs(start: int, bits: PackedInt32Array)
signal emote_in(side: int, id: int)
signal desync(frame: int)

const PORT := 27331

var is_host := false
var peer: ENetMultiplayerPeer

func host(port := PORT) -> bool:
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_server(port, 1)
	if err != OK:
		failed.emit("não consegui abrir a porta %d" % port)
		peer = null
		return false
	is_host = true
	multiplayer.multiplayer_peer = peer
	_wire()
	return true

func join(address: String, port := PORT) -> bool:
	peer = ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		failed.emit("endereço inválido")
		peer = null
		return false
	is_host = false
	multiplayer.multiplayer_peer = peer
	_wire()
	return true

func stop() -> void:
	if peer != null:
		peer.close()
		peer = null
	multiplayer.multiplayer_peer = null

func _wire() -> void:
	if not multiplayer.peer_connected.is_connected(_on_peer):
		multiplayer.peer_connected.connect(_on_peer)
		multiplayer.peer_disconnected.connect(_on_gone)
		multiplayer.connection_failed.connect(_on_fail)
		multiplayer.server_disconnected.connect(_on_gone.bind(1))

func _on_peer(_id: int) -> void:
	connected.emit(is_host)

func _on_gone(_id: int) -> void:
	closed.emit()

func _on_fail() -> void:
	failed.emit("não achei ninguém nesse endereço")

func online() -> bool:
	return peer != null and multiplayer.get_peers().size() > 0

func send_hello(side: int, look: Array, rules: String, stw: int, walls: bool) -> void:
	_hello.rpc(side, look, rules, stw, walls)

func send_inputs(start: int, bits: PackedInt32Array) -> void:
	_inputs.rpc(start, bits)

func send_emote(side: int, id: int) -> void:
	_emote.rpc(side, id)

func send_check(frame: int, sum: int) -> void:
	_check.rpc(frame, sum)

@rpc("any_peer", "reliable")
func _hello(side: int, look: Array, rules: String, stw: int, walls: bool) -> void:
	hello.emit(side, look, rules, stw, walls)

## Vai sem garantia e sem ordem: cada pacote carrega uma janela de quadros, e
## quem chegar primeiro já serve. Perder um pacote não trava a partida.
@rpc("any_peer", "unreliable")
func _inputs(start: int, bits: PackedInt32Array) -> void:
	inputs.emit(start, bits)

@rpc("any_peer", "reliable")
func _emote(side: int, id: int) -> void:
	emote_in.emit(side, id)

var _checks := {}

@rpc("any_peer", "reliable")
func _check(frame: int, sum: int) -> void:
	_checks[frame] = sum

## Devolve o checksum que o outro lado mandou pra esse quadro, ou 0.
func remote_check(frame: int) -> int:
	return _checks.get(frame, 0)

func drop_checks(before: int) -> void:
	for f in _checks.keys():
		if f < before:
			_checks.erase(f)
