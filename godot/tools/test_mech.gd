extends SceneTree

## Teste headless das mecânicas novas: mergulho com antecipação, batida na
## parede/rede com tontura e bloqueio na rede.

func _inp(l := false, r := false, u := false, d := false, dive := false) -> PlayerInput:
	var i := PlayerInput.new()
	i.left = l; i.right = r; i.up = u; i.down = d; i.dive = dive
	return i

func _events(out: EventBuf) -> Array:
	var ks := []
	for k in out.n:
		ks.append([out.kind[k], out.side[k]])
	return ks

func _run(w: PhysicWorld, frames: int, li: Callable, ri: Callable) -> Array:
	var seen := []
	for f in frames:
		var out := EventBuf.new()
		w.step(li.call(f), ri.call(f), true, true, out)
		for e in _events(out):
			seen.append([f] + e)
	return seen

func _has(seen: Array, kind: int, side: int) -> int:
	for e in seen:
		if e[1] == kind and e[2] == side:
			return e[0]
	return -1

func _init() -> void:
	var fails := 0
	# 1. mergulho rápido contra a parede esquerda → tontura de 0,6–1 s
	var w := PhysicWorld.new()
	w.blob_x[0] = BV.LEFT_PLANE + 90.0
	w.ball_y = 100.0
	var seen := _run(w, 90, func(f): return _inp(true, false, false, false, f < 3), func(_f): return _inp())
	var bonk := _has(seen, Ev.BONK, 0)
	print("bonk parede frame=", bonk, " dizzy=", BV.BONK_FRAMES, " (", BV.BONK_FRAMES / 60.0, "s)")
	if bonk < 0 or BV.BONK_FRAMES < 36 or BV.BONK_FRAMES > 60:
		fails += 1
	# 2. andar normal contra a parede → nada
	w = PhysicWorld.new()
	w.blob_x[0] = BV.LEFT_PLANE + 60.0
	w.ball_y = 100.0
	seen = _run(w, 90, func(_f): return _inp(true), func(_f): return _inp())
	print("andar parede bonk=", _has(seen, Ev.BONK, 0))
	if _has(seen, Ev.BONK, 0) >= 0:
		fails += 1
	# 3. mergulho contra a rede
	w = PhysicWorld.new()
	w.blob_x[0] = BV.NET_POSITION_X - 140.0
	w.ball_y = 100.0
	seen = _run(w, 90, func(f): return _inp(false, true, false, false, f < 3), func(_f): return _inp())
	print("bonk rede frame=", _has(seen, Ev.BONK, 0), " x=", w.blob_x[0], " lim=", BV.NET_POSITION_X - BV.NET_RADIUS - BV.BLOBBY_LOWER_RADIUS, " eventos=", seen)
	if _has(seen, Ev.BONK, 0) < 0:
		fails += 1
	# 4. antecipação do mergulho: DIVE sai antes de andar
	w = PhysicWorld.new()
	var x0 := w.blob_x[0]
	w.ball_y = 100.0
	var out := EventBuf.new()
	w.step(_inp(false, true, false, false, true), _inp(), true, true, out)
	var x1 := w.blob_x[0]
	for k in BV.DIVE_WINDUP - 1:
		w.step(_inp(), _inp(), true, true, EventBuf.new())
	var moved := w.blob_x[0] - x1
	print("windup deslocamento=", moved, " wind=", w.dive_wind[0], " dive_frames=", w.dive_frames[0])
	w.step(_inp(), _inp(), true, true, EventBuf.new())
	if absf(moved) > 0.01 or w.dive_frames[0] == 0:
		fails += 1
	# 5. bloqueio: blob direito no ar junto à rede, bola vindo da esquerda
	w = PhysicWorld.new()
	w.blob_x[1] = BV.NET_POSITION_X + BV.NET_RADIUS + BV.BLOBBY_LOWER_RADIUS + 4.0
	w.blob_y[1] = BV.GROUND_PLANE_HEIGHT
	w.ball_x = BV.NET_POSITION_X - 170.0
	w.ball_y = BV.NET_SPHERE_POSITION - 70.0
	w.ball_vx = 6.0
	w.ball_vy = -1.0
	var ww := w
	seen = _run(w, 120, func(_f): return _inp(),
		func(f): return _inp(true, false, f < 10 or (f > 10 and ww.blob_y[1] < BV.GROUND_PLANE_HEIGHT and absf(ww.blob_vy[1]) < 3.5)))
	var blk := _has(seen, Ev.BLOCK, 1)
	print("block frame=", blk, " hit=", _has(seen, Ev.DIVE_HIT, 1), " ball_vx=", w.ball_vx, " miss=", _has(seen, Ev.BLOCK_MISS, 1))
	if blk < 0:
		fails += 1
	print("FAILS=", fails)
	quit(1 if fails > 0 else 0)
