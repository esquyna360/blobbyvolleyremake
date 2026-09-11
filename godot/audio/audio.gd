extends Node

## Som do jogo. Os efeitos são sintetizados no boot (audio/sfx.gd) e a trilha
## vem em dois arquivos por faixa: `_a` é a base e `_b` tem tudo. Os dois tocam
## em sincronia desde o começo e o rally só cruza o volume entre eles -- é o
## mesmo efeito das camadas do web sem precisar de sequenciador em tempo real.

const POOL := 14
const MUSIC_DIR := "res://assets/music/"

var music_vol := 0.6
var sfx_vol := 0.85

var _bank := {}
var _pool: Array[AudioStreamPlayer] = []
var _slot := 0
var _base: AudioStreamPlayer
var _full: AudioStreamPlayer
var _song := ""
var _mix := 0.0
var _mix_want := 0.0
var _intensity := 0.0
var _duck := 0.0
var _paused := false
var _lp: AudioEffectLowPassFilter
var _music_bus := 1
var _sfx_bus := 2
var _land_down := [true, true]
var _land_vel := [0.0, 0.0]


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_buses()
	_bank = Sfx.bank()
	for i in POOL:
		var p := AudioStreamPlayer.new()
		p.bus = "Sfx"
		add_child(p)
		_pool.append(p)
	_base = _music_player()
	_full = _music_player()
	_load_vol()
	_apply_vol()


func _music_player() -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = "Music"
	add_child(p)
	return p


func _buses() -> void:
	_music_bus = AudioServer.bus_count
	AudioServer.add_bus(_music_bus)
	AudioServer.set_bus_name(_music_bus, "Music")
	AudioServer.set_bus_send(_music_bus, "Master")
	_lp = AudioEffectLowPassFilter.new()
	_lp.cutoff_hz = 16000.0
	AudioServer.add_bus_effect(_music_bus, _lp)
	var lim := AudioEffectHardLimiter.new()
	lim.ceiling_db = -0.6
	AudioServer.add_bus_effect(0, lim)
	_sfx_bus = AudioServer.bus_count
	AudioServer.add_bus(_sfx_bus)
	AudioServer.set_bus_name(_sfx_bus, "Sfx")
	AudioServer.set_bus_send(_sfx_bus, "Master")


# ------------------------------------------------------------------ volume

func _load_vol() -> void:
	var c := ConfigFile.new()
	if c.load("user://settings.cfg") == OK:
		music_vol = c.get_value("v", "music", 0.6)
		sfx_vol = c.get_value("v", "sfx", 0.85)


func save_vol() -> void:
	var c := ConfigFile.new()
	c.load("user://settings.cfg")
	c.set_value("v", "music", music_vol)
	c.set_value("v", "sfx", sfx_vol)
	c.save("user://settings.cfg")


## Ouvido não é linear: o meio do curso tem que soar como metade.
static func _db(v: float) -> float:
	var k := clampf(v, 0.0, 1.0)
	k = k * k
	return -80.0 if k <= 0.0008 else linear_to_db(k)


func _apply_vol() -> void:
	AudioServer.set_bus_volume_db(_music_bus, _db(music_vol))
	AudioServer.set_bus_volume_db(_sfx_bus, _db(sfx_vol))


func set_volume(bus: String, v: float) -> void:
	if bus == "music":
		music_vol = clampf(v, 0.0, 1.0)
	else:
		sfx_vol = clampf(v, 0.0, 1.0)
	_apply_vol()
	save_vol()
	if bus == "sfx":
		play("ui")


# ------------------------------------------------------------------ trilha

func set_song(id: String) -> void:
	if id == _song:
		return
	_song = id
	var a: AudioStream = load(MUSIC_DIR + id + "_a.ogg")
	var b: AudioStream = load(MUSIC_DIR + id + "_b.ogg")
	if a == null:
		return
	a.loop = true
	if b != null:
		b.loop = true
	_base.stream = a
	_full.stream = b if b != null else a
	_base.play()
	_full.play()
	_mix = 0.0
	_update_mix(true)


func stop_music() -> void:
	_song = ""
	_base.stop()
	_full.stop()


func set_paused(on: bool) -> void:
	_paused = on
	_base.stream_paused = on
	_full.stream_paused = on


## O rally manda no brilho e em quantos instrumentos tocam.
func set_rally(rally: int, match_point: bool) -> void:
	var tier := 3 if (rally >= 20 or match_point) else (2 if rally >= 10 else (1 if rally >= 5 else 0))
	_mix_want = clampf(float(tier) / 3.0, 0.0, 1.0)


func set_tension(k: float) -> void:
	_intensity = clampf(k, 0.0, 1.0)


## Ponto marcado: a música dá um passo atrás por um instante.
func duck(seconds := 1.1) -> void:
	_duck = seconds


func _process(dt: float) -> void:
	if _song == "":
		return
	_duck = maxf(0.0, _duck - dt)
	_mix += (_mix_want - _mix) * minf(1.0, dt * 1.6)
	_update_mix(false)


func _update_mix(force: bool) -> void:
	var g := 0.62 + _intensity * 0.24
	if _duck > 0.0:
		g = 0.18
	_base.volume_db = linear_to_db(maxf(0.0006, g * (1.0 - _mix * 0.85)))
	_full.volume_db = linear_to_db(maxf(0.0006, g * _mix))
	var kk := _intensity
	var want := 2600.0 + kk * kk * 14000.0
	_lp.cutoff_hz = want if force else lerpf(_lp.cutoff_hz, want, 0.08)


# ------------------------------------------------------------------ efeitos

func play(name: String, vol := 1.0, pitch := 1.0) -> void:
	var s: AudioStream = _bank.get(name)
	if s == null:
		return
	var p := _pool[_slot]
	_slot = (_slot + 1) % POOL
	p.stream = s
	p.volume_db = linear_to_db(clampf(vol * 3.0, 0.02, 8.0))
	p.pitch_scale = clampf(pitch, 0.4, 2.5)
	p.play()


## Espelha o `onEvents` do web: cada evento da partida vira um som.
func on_event(kind: int, side: int, intensity: float, w: PhysicWorld,
		local_side: int) -> void:
	match kind:
		Ev.BALL_HIT_BLOB:
			var i := clampf(intensity, 0.0, 1.0)
			play("hit_blob", 0.55 + i * 0.7, 0.88 + i * 0.34)
		Ev.BALL_HIT_GROUND:
			var p := clampf(absf(w.ball_vy) / 16.0, 0.0, 1.0)
			play("hit_ground", 0.5 + p * 0.8, 0.9 + p * 0.2)
		Ev.BALL_HIT_NET, Ev.BALL_HIT_NET_TOP:
			play("hit_net")
		Ev.BALL_HIT_WALL:
			play("hit_wall")
		Ev.PLAYER_ERROR:
			play("point_win" if local_side != side else "point_lose")
			duck()
		Ev.RESET_BALL:
			play("serve", 0.8)
		Ev.SPECIAL_READY:
			if local_side == side:
				play("special_ready")
		Ev.SPECIAL_FIRED:
			play("special_fired")
		Ev.SPECIAL_HIT:
			play("special_hit")
		Ev.SPECIAL_GROUND:
			play("ground_burn")
		Ev.DIVE:
			play("dive", 0.9)
		Ev.DIVE_HIT:
			play("dive_hit")
		Ev.APEX_HIT:
			play("apex")
		Ev.SPECIAL_WASTED:
			play("special_wasted")
		Ev.PARRY:
			play("parry")
		Ev.PARRY_TRY:
			play("parry_whiff")
		Ev.DIG:
			play("dig")
		Ev.BALL_OUT:
			play("ball_out")
		Ev.FATALITY:
			play("fatality", 1.2)


## Pouso não é evento das regras: sai da própria leitura do mundo.
func step_world(w: PhysicWorld) -> void:
	for s in 2:
		var down: bool = w.blob_y[s] >= BV.GROUND_PLANE_HEIGHT
		if down and not _land_down[s]:
			var i := clampf(_land_vel[s] / 14.0, 0.0, 1.0)
			if i > 0.12:
				play("land", 0.4 + i * 0.9, 0.9 + i * 0.3)
		if not down:
			_land_vel[s] = w.blob_vy[s]
		_land_down[s] = down


func finish(won: bool) -> void:
	play("finish_win" if won else "finish_lose", 1.0)

