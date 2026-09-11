"""Renderiza as musicas do jogo pra OGG.

A versao web toca nota a nota com o sintetizador. No Godot isso sairia caro em
celular fraco, entao cada faixa vira dois arquivos: 'a' e a base e 'b' tem tudo
-- os dois tocam juntos e o jogo so cruza o volume conforme o rally aperta.
"""
import json, math, os, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synthlib import *  # noqa

HERE = os.path.dirname(os.path.abspath(__file__))
SONGS = os.path.join(HERE, "..", "..", "web", "public", "music")
OUT = os.path.join(HERE, "..", "assets", "music")
os.makedirs(OUT, exist_ok=True)


def boom(mx, t, f0, f1, drop, dur, peak, kind="sine"):
    e = denv(peak, dur, 0.002)
    mx.add(osc(kind, f0, len(e), sweep=(f1, drop)) * e, t)


def hiss(mx, t, kind, hz, q, dur, peak, wet=0.0):
    e = denv(peak, dur)
    mx.add(bq(mx.noise_at(len(e)), kind, hz, q) * e, t, wet)


def bass(mx, t, hz, v, dur):
    e = env(v * 0.5, 0.006, 0.09, 0.65, dur, 0.06)
    n = len(e)
    sig = osc("sawtooth", hz, n) + osc("sine", hz / 2, n)
    mx.add(bq_sweep(sig, "lowpass", hz * 6, max(80.0, hz * 2), 0.14, 6.0) * e, t)


def sub(mx, t, hz, v, dur):
    e = env(v * 0.6, 0.01, 0.12, 0.8, dur, 0.12)
    mx.add(osc("sine", hz, len(e)) * e, t)


def pad(mx, t, hz, v, dur):
    e = env(v * 0.16, 0.45, 0.4, 0.85, dur, 0.9)
    n = len(e)
    sig = osc("sawtooth", hz, n, -8) + osc("sawtooth", hz, n, 6) + osc("triangle", hz * 2, n)
    mx.add(bq(sig, "lowpass", 1500.0, 0.7) * e, t, 0.5)


def marimba(mx, t, hz, v, dur):
    e = env(v * 0.5, 0.004, 0.3, 0.001, 0.02, 0.12)
    n = len(e)
    sig = osc("sine", hz, n)
    m = min(n, int(0.12 * SR))
    sig[:m] += osc("sine", hz * 4, m) * 0.22
    mx.add(sig * e, t, 0.18)


def steeldrum(mx, t, hz, v, dur):
    e = env(v * 0.42, 0.005, 0.35, 0.28, dur, 0.3)
    n = len(e)
    tt = np.arange(n, dtype=np.float32) / SR
    idx = hz * 3.4 * (0.25 / 3.4) ** np.clip(tt / 0.28, 0, 1)
    inst = hz + idx * np.sin(2 * math.pi * hz * 3.5 * tt)
    mx.add(np.sin(2 * math.pi * np.cumsum(inst) / SR).astype(np.float32) * e, t, 0.3)


def saw(mx, t, hz, v, dur):
    e = env(v * 0.2, 0.006, 0.08, 0.7, dur, 0.07)
    n = len(e)
    sig = osc("sawtooth", hz, n) + osc("sawtooth", hz, n, 9)
    mx.add(bq(sig, "lowpass", 2600.0, 3.0) * e, t)


def square(mx, t, hz, v, dur):
    e = env(v * 0.17, 0.008, 0.1, 0.7, dur, 0.08)
    n = len(e)
    sig = osc("square", hz, n, vib=(5.2, 7, 0.12))
    mx.add(bq(sig, "lowpass", 3400.0, 1.0) * e, t, 0.2)


def harp(mx, t, hz, v, dur):
    e = env(v * 0.34, 0.004, 0.9, 0.001, 0.02, 0.4)
    n = len(e)
    sig = osc("triangle", hz, n)
    m = min(n, int(0.3 * SR))
    sig[:m] += osc("sine", hz * 3, m) * 0.14
    mx.add(sig * e, t, 0.4)


def violin(mx, t, hz, v, dur):
    e = env(v * 0.15, 0.13, 0.12, 0.92, dur, 0.22)
    n = len(e)
    sig = osc("sawtooth", hz, n, vib=(5.6, 11, 0.18)) + osc("sawtooth", hz, n, -6)
    mx.add(bq(sig, "lowpass", hz * 6 + 900, 1.4) * e, t, 0.45)


def bell(mx, t, hz, v, dur):
    e = env(v * 0.24, 0.003, 1.6, 0.001, 0.02, 0.6)
    n = len(e)
    sig = osc("sine", hz, n) + osc("sine", hz * 2.76, n) * 0.4 + osc("sine", hz * 5.4, n) * 0.16
    mx.add(sig * e, t, 0.6)


def whistle(mx, t, hz, v, dur):
    e = env(v * 0.2, 0.07, 0.1, 0.9, dur, 0.14)
    n = len(e)
    sig = osc("sine", hz, n, vib=(5.9, 16, 0.16))
    sig += bq(mx.noise_at(n), "bandpass", hz * 2, 8.0) * (v * 0.012 / max(v * 0.2, 1e-4))
    mx.add(sig * e, t, 0.5)


def pluck(mx, t, hz, v, dur):
    e = env(v * 0.3, 0.003, 0.4, 0.001, 0.02, 0.15)
    n = len(e)
    mx.add(bq(osc("sawtooth", hz, n), "lowpass", hz * 5 + 400, 1.2) * e, t, 0.25)


def kick(mx, t, hz, v, dur):
    boom(mx, t, 150, 42, 0.075, 0.3, v * 0.9)
    hiss(mx, t, "lowpass", 2200, 0.7, 0.02, v * 0.14)


def snare(mx, t, hz, v, dur):
    boom(mx, t, 210, 150, 0.05, 0.11, v * 0.28, "triangle")
    hiss(mx, t, "bandpass", 1900, 0.9, 0.16, v * 0.5, 0.2)


def hat(mx, t, hz, v, dur):
    op = hz > 100
    hiss(mx, t, "highpass", 8200, 0.7, 0.24 if op else 0.045, v * (0.24 if op else 0.3))


def crash(mx, t, hz, v, dur):
    hiss(mx, t, "highpass", 4800, 0.5, 1.5, v * 0.3, 0.5)


def ride(mx, t, hz, v, dur):
    hiss(mx, t, "bandpass", 6400, 1.2, 0.6, v * 0.24, 0.3)
    e = denv(v * 0.07, 0.5)
    mx.add(osc("sine", 2400, len(e)) * e, t)


def stick(mx, t, hz, v, dur):
    boom(mx, t, 900, 500, 0.01, 0.045, v * 0.3, "triangle")
    hiss(mx, t, "highpass", 2600, 0.7, 0.03, v * 0.2)


def tom(mx, t, hz, v, dur):
    boom(mx, t, hz * 2.2, hz * 1.2, 0.1, 0.34, v * 0.55)
    hiss(mx, t, "lowpass", 1800, 0.7, 0.03, v * 0.1)


def conga_hi(mx, t, hz, v, dur):
    boom(mx, t, 340, 250, 0.045, 0.19, v * 0.45)
    hiss(mx, t, "bandpass", 1400, 1.6, 0.03, v * 0.12)


def conga_low(mx, t, hz, v, dur):
    boom(mx, t, 210, 150, 0.06, 0.28, v * 0.5)
    hiss(mx, t, "bandpass", 900, 1.6, 0.03, v * 0.1)


def maracas(mx, t, hz, v, dur):
    hiss(mx, t, "highpass", 6800, 0.8, 0.05, v * 0.24)


def shaker(mx, t, hz, v, dur):
    hiss(mx, t, "highpass", 5600, 0.6, 0.07, v * 0.2)


def tambourine(mx, t, hz, v, dur):
    hiss(mx, t, "highpass", 7400, 0.7, 0.2, v * 0.16, 0.2)
    hiss(mx, t, "bandpass", 9500, 3.0, 0.05, v * 0.12)


def agogo(mx, t, hz, v, dur):
    e = denv(v * 0.22, 0.24, 0.002)
    n = len(e)
    mx.add((osc("sine", hz * 6, n) + osc("sine", hz * 9.4, n) * 0.4) * e, t, 0.25)


VOICES = {
    "bass": bass, "sub": sub, "pad": pad, "marimba": marimba, "steeldrum": steeldrum,
    "saw": saw, "square": square, "harp": harp, "violin": violin, "bell": bell,
    "whistle": whistle, "pluck": pluck, "kick": kick, "snare": snare, "hat": hat,
    "crash": crash, "ride": ride, "stick": stick, "tom": tom, "conga_hi": conga_hi,
    "conga_low": conga_low, "maracas": maracas, "shaker": shaker,
    "tambourine": tambourine, "agogo": agogo,
}

TAIL = 5.0


def render(song, max_tier, seed):
    sd = 15.0 / song["bpm"]
    total = song["bars"] * song["spb"]
    length = total * sd
    mx = Mix(length + TAIL, np.random.default_rng(seed))
    for tr in song["tracks"]:
        if tr["tier"] > max_tier:
            continue
        fn = VOICES.get(tr["v"], pluck)
        n = tr["n"]
        for i in range(0, len(n), 4):
            t = n[i] * sd
            hz = 440.0 * 2.0 ** ((n[i + 1] - 69) / 12.0)
            v = (n[i + 2] / 127.0) * tr["gain"]
            fn(mx, t, hz, v, max(0.03, n[i + 3] * sd * 0.94))
    out = mx.dry + reverb(mx.wet, rng=np.random.default_rng(seed + 1)) * 0.9
    # a cauda volta pro comeco: sem isso o loop corta a reverberacao
    k = int(length * SR)
    tail = out[k:]
    out = out[:k].copy()
    m = min(len(tail), k)
    out[:m] += tail[:m]
    return out


def write(buf, path, peak=0.88):
    m = float(np.max(np.abs(buf))) or 1.0
    buf = np.tanh(buf / m * 1.15) * peak
    pcm = (np.clip(buf, -1, 1) * 32767).astype("<i2")
    import wave
    tmp = path + ".wav"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(["oggenc", "-Q", "-q", "2", "-o", path, tmp], check=True)
    os.remove(tmp)
    print("  ", os.path.basename(path), os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    ids = sys.argv[1:] or ["menu", "luau", "fundo", "praia"]
    for i, sid in enumerate(ids):
        song = json.load(open(os.path.join(SONGS, sid + ".json")))
        print(sid, song["bpm"], "bpm")
        write(render(song, 0, 11 + i), os.path.join(OUT, sid + "_a.ogg"))
        write(render(song, 3, 31 + i), os.path.join(OUT, sid + "_b.ogg"))
