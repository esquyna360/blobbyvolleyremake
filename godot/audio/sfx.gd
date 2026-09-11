class_name Sfx
extends RefCounted

## Os efeitos do jogo são sintetizados na hora de carregar, não gravados. São
## as mesmas contas do audio.ts do web -- um thump (senoide caindo), um burst
## (ruído filtrado) e um bell (três parciais) -- e como saem prontos em PCM o
## jogo não paga nada por tocar.

const SR := 22050

static var _noise := PackedFloat32Array()


static func _pink() -> void:
	if _noise.size() > 0:
		return
	var n := SR * 2
	_noise.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260910
	var b0 := 0.0
	var b1 := 0.0
	var b2 := 0.0
	for i in n:
		var w := rng.randf() * 2.0 - 1.0
		b0 = 0.99765 * b0 + w * 0.0990460
		b1 = 0.96300 * b1 + w * 0.2965164
		b2 = 0.57000 * b2 + w * 1.0526913
		_noise[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22


class Buf:
	var d := PackedFloat32Array()

	func _init(seconds: float) -> void:
		d.resize(int(seconds * SR) + 8)

	func put(i: int, v: float) -> void:
		if i >= 0 and i < d.size():
			d[i] += v


static func thump(b: Buf, at: float, freq: float, drop: float, dur: float,
		gain: float, kind: String) -> void:
	var i0 := int(at * SR)
	var n := int(dur * SR)
	var to := maxf(20.0, freq * drop)
	var ph := 0.0
	for i in n:
		var t := float(i) / SR
		var k := clampf(t / maxf(dur, 1e-6), 0.0, 1.0)
		var f: float = freq * pow(to / freq, k)
		ph += TAU * f / SR
		var g: float
		if t < 0.005:
			g = 0.0001 * pow(gain / 0.0001, t / 0.005)
		else:
			g = gain * pow(0.0001 / gain, (t - 0.005) / maxf(dur - 0.005, 1e-6))
		b.put(i0 + i, _wave(kind, ph) * g)


static func _wave(kind: String, ph: float) -> float:
	match kind:
		"sine":
			return sin(ph)
		"triangle":
			return asin(sin(ph)) * 0.6366
		"square":
			return 1.0 if sin(ph) >= 0.0 else -1.0
		_:
			return 2.0 * fposmod(ph / TAU, 1.0) - 1.0


## Biquad RBJ. Um filtro de verdade é o que separa "chiado" de "pancada".
static func _coef(kind: String, f0: float, q: float) -> PackedFloat32Array:
	var f := clampf(f0, 20.0, SR * 0.45)
	var w0 := TAU * f / SR
	var al := sin(w0) / (2.0 * maxf(q, 0.05))
	var cw := cos(w0)
	var b0 := 0.0
	var b1 := 0.0
	var b2 := 0.0
	match kind:
		"lowpass":
			b0 = (1.0 - cw) * 0.5; b1 = 1.0 - cw; b2 = b0
		"highpass":
			b0 = (1.0 + cw) * 0.5; b1 = -(1.0 + cw); b2 = b0
		_:
			b0 = al; b1 = 0.0; b2 = -al
	var a0 := 1.0 + al
	return PackedFloat32Array([b0 / a0, b1 / a0, b2 / a0,
		(-2.0 * cw) / a0, (1.0 - al) / a0])


static func burst(b: Buf, at: float, dur: float, gain: float, kind: String,
		freq: float, q: float) -> void:
	_pink()
	var c := _coef(kind, freq, q)
	var i0 := int(at * SR)
	var n := int(dur * SR)
	var off := (i0 * 7919) % maxi(1, _noise.size() - n - 4)
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0
	for i in n:
		var x := _noise[off + i]
		var y := c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2
		x2 = x1; x1 = x; y2 = y1; y1 = y
		var t := float(i) / SR
		var g: float
		if t < 0.004:
			g = 0.0001 * pow(gain / 0.0001, t / 0.004)
		else:
			g = gain * pow(0.0001 / gain, (t - 0.004) / maxf(dur - 0.004, 1e-6))
		b.put(i0 + i, y * g)


static func bell(b: Buf, at: float, freq: float, dur: float, gain: float) -> void:
	var parts := [[1.0, 1.0], [2.01, 0.32], [3.02, 0.11]]
	for p in parts:
		var f: float = freq * p[0]
		var amp: float = gain * p[1]
		var i0 := int(at * SR)
		var n := int(dur * SR)
		var ph := 0.0
		var st := TAU * f / SR
		for i in n:
			ph += st
			var t := float(i) / SR
			var g: float
			if t < 0.012:
				g = 0.0001 * pow(amp / 0.0001, t / 0.012)
			else:
				g = amp * pow(0.0001 / amp, (t - 0.012) / maxf(dur - 0.012, 1e-6))
			b.put(i0 + i, sin(ph) * g)


static func _wav(b: Buf) -> AudioStreamWAV:
	var n := b.d.size()
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in n:
		var v := int(clampf(b.d[i], -1.0, 1.0) * 32000.0)
		bytes.encode_s16(i * 2, v)
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = SR
	s.stereo = false
	s.data = bytes
	return s


## Cada efeito é uma receita: as mesmas do web, nas mesmas proporções.
static func bank() -> Dictionary:
	var out := {}
	var b: Buf

	b = Buf.new(0.10)
	burst(b, 0, 0.035, 0.05, "bandpass", 2200, 2.0)
	thump(b, 0, 880, 0.8, 0.045, 0.035, "sine")
	out["ui"] = _wav(b)

	b = Buf.new(0.30)
	thump(b, 0, 205, 0.42, 0.14, 0.40, "triangle")
	burst(b, 0, 0.05, 0.11, "bandpass", 1250, 1.1)
	out["hit_blob"] = _wav(b)

	b = Buf.new(0.45)
	thump(b, 0, 112, 0.45, 0.22, 0.26, "sine")
	burst(b, 0, 0.28, 0.10, "highpass", 2400, 0.7)
	out["hit_ground"] = _wav(b)

	b = Buf.new(0.22)
	burst(b, 0, 0.13, 0.07, "bandpass", 620, 3.2)
	thump(b, 0, 150, 0.6, 0.07, 0.05, "sine")
	out["hit_net"] = _wav(b)

	b = Buf.new(0.12)
	burst(b, 0, 0.045, 0.05, "highpass", 3200, 0.8)
	thump(b, 0, 760, 0.7, 0.04, 0.03, "sine")
	out["hit_wall"] = _wav(b)

	b = Buf.new(0.28)
	burst(b, 0, 0.16, 0.09, "lowpass", 1300, 0.8)
	out["land"] = _wav(b)

	b = Buf.new(1.5)
	bell(b, 0, 523.25, 0.9, 0.115)
	bell(b, 0.11, 783.99, 1.1, 0.09)
	out["point_win"] = _wav(b)

	b = Buf.new(1.4)
	bell(b, 0, 392.0, 0.8, 0.085)
	bell(b, 0.12, 293.66, 1.0, 0.07)
	out["point_lose"] = _wav(b)

	b = Buf.new(0.6)
	bell(b, 0, 659.25, 0.5, 0.05)
	out["serve"] = _wav(b)

	b = Buf.new(1.2)
	bell(b, 0, 392.0, 0.6, 0.075)
	bell(b, 0.14, 293.66, 0.9, 0.06)
	out["emote_0"] = _wav(b)

	b = Buf.new(1.0)
	var f3 := [523.25, 659.25, 880.0]
	for i in 3:
		bell(b, i * 0.08, f3[i], 0.6, 0.085)
	out["emote_1"] = _wav(b)

	b = Buf.new(0.2)
	thump(b, 0, 660, 0.55, 0.09, 0.07, "square")
	thump(b, 0, 880, 0.5, 0.09, 0.055, "square")
	out["emote_2"] = _wav(b)

	b = Buf.new(0.8)
	bell(b, 0, 880, 0.5, 0.07)
	bell(b, 0.09, 1174.7, 0.6, 0.055)
	out["special_ready"] = _wav(b)

	b = Buf.new(0.7)
	thump(b, 0, 240, 0.25, 0.28, 0.30, "sawtooth")
	burst(b, 0, 0.10, 0.16, "bandpass", 1800, 1.2)
	bell(b, 0.02, 1318.5, 0.5, 0.07)
	out["special_fired"] = _wav(b)

	b = Buf.new(1.3)
	thump(b, 0, 70, 0.5, 0.55, 0.34, "sine")
	burst(b, 0, 0.35, 0.20, "lowpass", 900, 0.7)
	bell(b, 0.05, 196.0, 1.1, 0.09)
	out["special_hit"] = _wav(b)

	b = Buf.new(1.1)
	thump(b, 0, 46, 0.75, 0.9, 0.4, "sine")
	burst(b, 0, 0.55, 0.34, "lowpass", 700, 0.6)
	burst(b, 0, 0.30, 0.16, "bandpass", 2400, 1.4)
	out["ground_burn"] = _wav(b)

	b = Buf.new(0.5)
	thump(b, 0, 150, 0.5, 0.16, 0.12, "triangle")
	burst(b, 0, 0.34, 0.26, "lowpass", 1500, 0.7)
	out["dive"] = _wav(b)

	b = Buf.new(0.6)
	thump(b, 0, 190, 1.5, 0.14, 0.2, "sine")
	burst(b, 0, 0.42, 0.3, "bandpass", 900, 1.6)
	bell(b, 0.02, 1245, 0.34, 0.1)
	out["dive_hit"] = _wav(b)

	b = Buf.new(0.5)
	thump(b, 0, 430, 1.4, 0.07, 0.12, "triangle")
	bell(b, 0, 2093, 0.4, 0.1)
	burst(b, 0, 0.05, 0.05, "highpass", 5200, 1.0)
	out["apex"] = _wav(b)

	b = Buf.new(0.6)
	thump(b, 0, 300, 0.1, 0.45, 0.22, "sawtooth")
	burst(b, 0, 0.20, 0.16, "lowpass", 900, 0.8)
	out["special_wasted"] = _wav(b)

	b = Buf.new(0.9)
	thump(b, 0, 880, 2.6, 0.22, 0.2, "square")
	bell(b, 0, 1568, 0.7, 0.2)
	bell(b, 0.02, 2349, 0.55, 0.13)
	burst(b, 0, 0.16, 0.16, "highpass", 4200, 1.1)
	out["parry"] = _wav(b)

	b = Buf.new(0.16)
	burst(b, 0, 0.09, 0.05, "bandpass", 1800, 2.2)
	out["parry_whiff"] = _wav(b)

	b = Buf.new(0.2)
	thump(b, 0, 210, 0.5, 0.09, 0.16, "triangle")
	burst(b, 0, 0.09, 0.06, "lowpass", 1500, 0.9)
	out["dig"] = _wav(b)

	b = Buf.new(0.45)
	bell(b, 0.01, 1660, 0.16, 0.09)
	bell(b, 0.02, 1245, 0.3, 0.07)
	burst(b, 0, 0.14, 0.05, "bandpass", 900, 1.4)
	out["ball_out"] = _wav(b)

	b = Buf.new(2.4)
	burst(b, 0, 0.06, 0.04, "highpass", 5000, 0.9)
	thump(b, 0, 34, 0.4, 2.2, 0.5, "sine")
	burst(b, 0, 1.6, 0.8, "lowpass", 420, 0.5)
	burst(b, 0, 0.7, 0.35, "bandpass", 1400, 1.8)
	out["thunder"] = _wav(b)

	b = Buf.new(0.3)
	thump(b, 0, 1200, 0.05, 0.05, 0.12, "square")
	thump(b, 0.05, 760, 0.05, 0.05, 0.10, "square")
	thump(b, 0.10, 430, 0.05, 0.09, 0.09, "square")
	burst(b, 0, 0.06, 0.05, "bandpass", 3200, 3.0)
	out["glitch"] = _wav(b)

	b = Buf.new(2.0)
	thump(b, 0, 38, 0.9, 1.6, 0.45, "sine")
	burst(b, 0, 0.9, 0.55, "lowpass", 520, 0.5)
	burst(b, 0, 0.4, 0.25, "bandpass", 1600, 1.6)
	var gl := [[110.0, 0.0], [82.0, 0.26], [62.0, 0.52]]
	for g in gl:
		thump(b, g[1], g[0] * 1.6, 1.0 / 1.6, 0.42, 0.22, "sawtooth")
	out["fatality"] = _wav(b)

	b = Buf.new(2.2)
	var win := [523.25, 659.25, 783.99, 1046.5]
	for i in 4:
		bell(b, i * 0.14, win[i], 1.3, 0.12)
	out["finish_win"] = _wav(b)

	b = Buf.new(2.0)
	var lose := [493.88, 415.3, 329.63]
	for i in 3:
		bell(b, i * 0.14, lose[i], 1.3, 0.085)
	out["finish_lose"] = _wav(b)

	return out
