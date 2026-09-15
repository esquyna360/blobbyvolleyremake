extends SceneTree

## Teste headless das mecânicas novas: mergulho com antecipação, batida na
## parede/rede com tontura e bloqueio na rede.

func _inp(l := false, r := false, u := false, d := false, dive := false, sp := false) -> PlayerInput:
	var i := PlayerInput.new()
	i.left = l; i.right = r; i.up = u; i.down = d; i.dive = dive; i.special = sp
	return i

func _count(seen: Array, kind: int) -> int:
	var n := 0
	for e in seen:
		if e[1] == kind:
			n += 1
	return n

func _events(out: EventBuf) -> Array:
	var ks := []
	for k in out.n:
		ks.append([out.kind[k], out.side[k]])
	return ks

func _run(w: PhysicWorld, frames: int, li: Callable, ri: Callable) -> Array:
	var seen := []
	for f in frames:
		var out := EventBuf.new()
		w.step([li.call(f), ri.call(f)], true, true, out)
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
	w.step([_inp(false, true, false, false, true), _inp()], true, true, out)
	var x1 := w.blob_x[0]
	for k in BV.DIVE_WINDUP - 1:
		w.step([_inp(), _inp()], true, true, EventBuf.new())
	var moved := w.blob_x[0] - x1
	print("windup deslocamento=", moved, " wind=", w.dive_wind[0], " dive_frames=", w.dive_frames[0])
	w.step([_inp(), _inp()], true, true, EventBuf.new())
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
	# 6. acao perto da bola nao ataca: o botao so mergulha
	w = PhysicWorld.new()
	w.blob_x[0] = 300.0
	w.ball_x = 400.0
	w.ball_y = w.upper_y(0)
	seen = _run(w, 40, func(f): return _inp(false, true, false, false, f < 2), func(_f): return _inp())
	var sm := _has(seen, Ev.SMASH, 0)
	print("acao perto: smash=", sm, " dive=", _has(seen, Ev.DIVE, 0))
	if sm >= 0 or _has(seen, Ev.DIVE, 0) < 0:
		fails += 1
	# 7. ação longe da bola → mergulho
	w = PhysicWorld.new()
	w.ball_y = 100.0
	seen = _run(w, 10, func(f): return _inp(false, true, false, false, f < 2), func(_f): return _inp())
	print("dive longe=", _has(seen, Ev.DIVE, 0), " smash=", _has(seen, Ev.SMASH, 0))
	if _has(seen, Ev.DIVE, 0) < 0 or _has(seen, Ev.SMASH, 0) >= 0:
		fails += 1
	# 8. mundo com 3 blobs (2 parceiros à direita), quadra larga e bola de boliche
	var mp := MatchParams.new()
	mp.per_side = [1, 2]
	mp.court_w = 1200.0
	mp.ball_r = 42.0
	mp.blob_scale = [0.8, 1.4]
	var m := BVMatch.new(mp)
	var bots := [Bot.new(0, "normal", 1, 0), Bot.new(1, "normal", 2, 1), Bot.new(1, "normal", 3, 2)]
	for f in 1800:
		m.step([bots[0].think(m), bots[1].think(m), bots[2].think(m)])
	var st := m.new_state()
	m.save(st[0], st[1])
	var c1 := m.checksum()
	m.restore(st[0], st[1])
	print("3 blobs: placar=", m.logic.scores, " frame=", m.frame, " nb=", m.world.nb, " checksum ok=", c1 == m.checksum())
	if m.world.nb != 3 or c1 != m.checksum() or m.logic.scores[0] + m.logic.scores[1] == 0:
		fails += 1
	# 9. giro no ar: segundo toque no pulo vira ataque e a bola sai forte
	w = PhysicWorld.new()
	w.ball_x = w.blob_x[0] + 50.0
	w.ball_y = 345.0
	w.ball_vy = 0.0
	seen = _run(w, 40, func(f): return _inp(false, false, f < 2 or (f > 8 and f < 11)),
		func(_f): return _inp())
	var spin := _has(seen, Ev.SPIN, 0)
	var spin_hit := _has(seen, Ev.SPIN_HIT, 0)
	print("giro frame=", spin, " acerto=", spin_hit, " v=", sqrt(w.ball_vx * w.ball_vx + w.ball_vy * w.ball_vy))
	if spin < 0 or spin_hit < 0:
		fails += 1
	# 10. giro no chão não existe
	w = PhysicWorld.new()
	w.ball_y = 100.0
	seen = _run(w, 30, func(f): return _inp(false, false, f < 3), func(_f): return _inp())
	print("giro no chao=", _has(seen, Ev.SPIN, 0))
	if _has(seen, Ev.SPIN, 0) >= 0:
		fails += 1
	# 11. um giro por pulo: apertar de novo no mesmo pulo não gira duas vezes
	w = PhysicWorld.new()
	w.ball_y = 100.0
	seen = _run(w, 50, func(f): return _inp(false, false, f < 2 or f == 8 or f == 14),
		func(_f): return _inp())
	print("giros no mesmo pulo=", _count(seen, Ev.SPIN))
	if _count(seen, Ev.SPIN) != 1:
		fails += 1
	# 12. especial: dispara na hora, uma bola, parabola pro outro lado
	w = PhysicWorld.new()
	w.charge[0] = BV.SPECIAL_FULL
	w.ball_x = w.blob_x[0] + 40.0
	w.ball_y = w.upper_y(0) - 40.0
	seen = _run(w, 2, func(f): return _inp(false, false, false, false, false, f == 1),
		func(_f): return _inp())
	var fired := _has(seen, Ev.SPECIAL_FIRED, 0)
	print("especial: disparo=", fired, " vx=", w.ball_vx, " vy=", w.ball_vy, " super=", w.super_frames)
	if fired < 0 or w.ball_vx <= 0.0 or w.ball_vy >= 0.0 or w.super_owner != 0:
		fails += 1
	# 12b. especial nunca volta pro campo do dono: bate na rede como parede
	var crossed := false
	for f in 140:
		if w.super_frames <= 0:
			break
		w.step([_inp(), _inp()], true, true, EventBuf.new())
		if w.ball_x > BV.NET_POSITION_X:
			crossed = true
		if crossed and w.ball_x < BV.NET_POSITION_X:
			fails += 1
			print("especial voltou pro dono")
			break
	print("especial cruzou=", crossed)
	if not crossed:
		fails += 1
	# 13b. mergulho e defesa: levanta a bola do lado de quem salvou
	w = PhysicWorld.new()
	w.dive_frames[0] = 10
	w.ball_x = w.blob_x[0] + 26.0
	w.ball_y = w.lower_y(0) - 10.0
	w.ball_vx = -5.0
	w.ball_vy = 6.0
	seen = _run(w, 1, func(_f): return _inp(), func(_f): return _inp())
	print("mergulho: vy=", w.ball_vy, " vx=", w.ball_vx, " lado=", w.ball_side())
	if _has(seen, Ev.DIVE_HIT, 0) < 0 or w.ball_vy > -9.0 or w.ball_side() != BV.LEFT:
		fails += 1
	# 13. mergulho em cima da bola nao toca quadro a quadro: no maximo um
	# contato do mergulho (dois eventos) mais um toque solto depois do pique
	w = PhysicWorld.new()
	w.ball_x = w.blob_x[0] + 20.0
	w.ball_y = w.lower_y(0)
	w.ball_vx = 0.0
	w.ball_vy = 0.0
	seen = _run(w, 20, func(f): return _inp(false, true, false, false, f < 2), func(_f): return _inp())
	var touches := _count(seen, Ev.DIVE_HIT) + _count(seen, Ev.BALL_HIT_BLOB)
	print("toques no mergulho=", touches, " carga=", w.charge[0])
	if touches > 3 or w.charge[0] > 0.2:
		fails += 1
	# 14. bola quente do giro derruba quem encosta
	w = PhysicWorld.new()
	w.hot = BV.HOT_FRAMES
	w.hot_by = 0
	w.ball_x = w.blob_x[1] - 10.0
	w.ball_y = w.upper_y(1)
	seen = _run(w, 6, func(_f): return _inp(), func(_f): return _inp())
	print("tranco da bola quente=", _has(seen, Ev.STAGGER, 1), " stun=", w.stun[1])
	if _has(seen, Ev.STAGGER, 1) < 0:
		fails += 1
	# 15. parry no especial: vira especial de quem aparou
	w = PhysicWorld.new()
	w.super_frames = 60
	w.super_owner = 0
	w.ball_x = w.blob_x[1] - 24.0
	w.ball_y = w.upper_y(1)
	w.ball_vx = 22.0
	w.ball_vy = 0.0
	w.parry_active[1] = BV.PARRY_ACTIVE
	seen = _run(w, 4, func(_f): return _inp(), func(_f): return _inp())
	print("parry=", _has(seen, Ev.PARRY, 1), " dono=", w.super_owner, " vx=", w.ball_vx)
	if _has(seen, Ev.PARRY, 1) < 0 or w.super_owner != 1 or w.ball_vx >= 0.0:
		fails += 1
	# 16. toque normal no especial: derruba e a bola fica do lado dele
	w = PhysicWorld.new()
	w.super_frames = 60
	w.super_owner = 0
	w.ball_x = w.blob_x[1] - 20.0
	w.ball_y = w.upper_y(1)
	w.ball_vx = 20.0
	w.ball_vy = 0.0
	seen = _run(w, 6, func(_f): return _inp(), func(_f): return _inp())
	print("levou o especial=", _has(seen, Ev.SPECIAL_HIT, 1), " caido=", w.knocked[1],
		" vx=", w.ball_vx)
	if _has(seen, Ev.SPECIAL_HIT, 1) < 0 or w.knocked[1] <= 0 or w.ball_vx <= 0.0:
		fails += 1
	# 17. parry na bola quente: sobe acima de quem aparou
	w = PhysicWorld.new()
	w.hot = BV.HOT_FRAMES
	w.hot_by = 0
	w.ball_x = w.blob_x[1] - 30.0
	w.ball_y = w.upper_y(1)
	w.ball_vx = 18.0
	w.ball_vy = 2.0
	w.parry_active[1] = BV.PARRY_ACTIVE
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	print("parry quente=", _has(seen, Ev.PARRY, 1), " vy=", w.ball_vy, " stun=", w.stun[1])
	if _has(seen, Ev.PARRY, 1) < 0 or w.ball_vy >= -8.0 or w.stun[1] > 0:
		fails += 1
	# 18. giro na bola um pouco acima vira parabola em vez de foguete
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.blob_vy[0] = 1.0
	w.spin_t[0] = 10
	w.ball_x = w.blob_x[0] + 50.0
	w.ball_y = w.upper_y(0) - 20.0
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	print("giro: vy=", w.ball_vy, " vx=", w.ball_vx)
	if _has(seen, Ev.SPIN_HIT, 0) < 0 or w.ball_vy < -16.0 or w.ball_vx <= 0.0:
		fails += 1
	# 18b. giro nao alcanca bola longe nem bola atras das costas
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.blob_vy[0] = 1.0
	w.spin_t[0] = 10
	w.ball_x = w.blob_x[0] + 110.0
	w.ball_y = w.upper_y(0)
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	var longe := _has(seen, Ev.SPIN_HIT, 0)
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.blob_vy[0] = 1.0
	w.spin_t[0] = 10
	w.ball_x = w.blob_x[0] - 55.0
	w.ball_y = w.upper_y(0) + 10.0
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	var atras := _has(seen, Ev.SPIN_HIT, 0)
	print("giro longe=", longe, " giro atras=", atras)
	if longe >= 0 or atras >= 0:
		fails += 1
	# 18c. bola em cima da cabeca nao vira cortada: o giro passa e a bola sobe
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.blob_vy[0] = 1.0
	w.spin_t[0] = 10
	w.ball_x = w.blob_x[0] + 4.0
	w.ball_y = w.upper_y(0) - w.upper_r(0) * 0.95
	w.ball_vy = 1.0
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	print("giro por baixo: acerto=", _has(seen, Ev.SPIN_HIT, 0), " vy=", w.ball_vy)
	if _has(seen, Ev.SPIN_HIT, 0) >= 0 or w.ball_vy >= 0.0:
		fails += 1
	# 19. toque na diagonal frente/topo: parabola rapida pro fundo do outro lado
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.ball_x = w.blob_x[0] + w.upper_r(0) * 0.9
	w.ball_y = w.upper_y(0) - w.upper_r(0) * 0.5
	w.ball_vy = 1.0
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	var land := w.ball_x
	var lvy := w.ball_vy
	var lvx := w.ball_vx
	for i in 240:
		land += lvx
		lvy += BV.BALL_GRAVITATION
		if land > w.net_x and lvy > 0.0 and w.ball_y + i * 2.0 > BV.GROUND_PLANE_HEIGHT_MAX:
			break
	print("ataque: vx=", lvx, " vy=", w.ball_vy, " smash=", _has(seen, Ev.SMASH, 0))
	if _has(seen, Ev.SMASH, 0) < 0 or w.ball_vx <= 0.0 or w.ball_vy > -2.0:
		fails += 1
	# 19b. toque por baixo continua toque normal
	w = PhysicWorld.new()
	w.blob_y[0] = 300.0
	w.ball_x = w.blob_x[0] + 1.0
	w.ball_y = w.upper_y(0) - w.upper_r(0) * 1.2
	w.ball_vy = 1.0
	seen = _run(w, 2, func(_f): return _inp(), func(_f): return _inp())
	print("toque alto e reto: smash=", _has(seen, Ev.SMASH, 0))
	if _has(seen, Ev.SMASH, 0) >= 0:
		fails += 1
	print("FAILS=", fails)
	quit(1 if fails > 0 else 0)
