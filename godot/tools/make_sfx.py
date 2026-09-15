"""Renderiza os efeitos do jogo pra WAV 44.1k.

Antes eles eram sintetizados no boot a 22050 Hz: o teto ficava em 11 kHz, que e
justo onde mora o estalo de um impacto -- por isso soavam "8 bits". Agora cada
som e montado aqui em tres camadas (transiente, corpo, sub/cauda), passa por
reverb curto e sai pronto. O jogo so carrega.
"""
import os, sys, wave
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synthlib import *  # noqa

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "sfx")
os.makedirs(OUT, exist_ok=True)


# ------------------------------------------------------------------ camadas

def crack(mx, t, hz, dur, g, q=0.8, kind="highpass", wet=0.0):
    """O transiente. 5-15 ms, ataque quase instantaneo: e o que o ouvido le
    como forca."""
    e = denv(g, dur, 0.0004)
    mx.add(bq(mx.noise_at(len(e)), kind, hz, q) * e, t, wet)


def body(mx, t, f0, f1, span, dur, g, kind="sine", wet=0.0):
    e = denv(g, dur, 0.002)
    mx.add(osc(kind, f0, len(e), sweep=(f1, span)) * e, t, wet)


def sub(mx, t, hz, dur, g):
    """Uma camada so manda no grave -- as outras entram com corte embaixo."""
    e = denv(g, dur, 0.004)
    mx.add(osc("sine", hz, len(e)) * e, t)


def ring(mx, t, hz, dur, g, parts=((1.0, 1.0), (2.01, 0.3), (3.02, 0.1)), wet=0.35):
    for mul, amp in parts:
        e = denv(g * amp, dur, 0.004)
        mx.add(osc("sine", hz * mul, len(e)) * e, t, wet)


def stab(mx, t, hz, dur, g, wet=0.25):
    """Metal de arcade: serra dobrada em oitava com filtro fechando."""
    e = env(g, 0.006, 0.05, 0.55, dur, 0.09)
    n = len(e)
    sig = osc("sawtooth", hz, n, -7) + osc("sawtooth", hz, n, 7) + osc("square", hz * 2, n) * 0.35
    mx.add(bq_sweep(sig, "lowpass", hz * 9 + 2200, hz * 3 + 700, dur, 1.1) * e * 0.34, t, wet)


def clap(mx, t, g, wet=0.3):
    """Palma: quatro batidinhas coladas. E o elemento mais 'esporte' que tem."""
    for k, off in enumerate((0.0, 0.009, 0.019, 0.030)):
        d = 0.055 if k == 3 else 0.014
        e = denv(g * (1.0 if k == 3 else 0.7), d, 0.0006)
        mx.add(bq(mx.noise_at(len(e)), "bandpass", 1150, 1.3) * e, t + off, wet)


def whistle_ref(mx, t, dur, g, wet=0.3):
    """Apito de arbitro: dois tons quase juntos batendo entre si, warble de
    22 Hz da bolinha e glide na entrada e na saida."""
    n = int((dur + 0.04) * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    f = np.full(n, 3800.0, np.float32)
    up = tt < 0.015
    f[up] = 3400.0 + 400.0 * (tt[up] / 0.015)
    dn = tt > dur - 0.03
    f[dn] = 3800.0 - 300.0 * np.clip((tt[dn] - (dur - 0.03)) / 0.03, 0, 1)
    warb = 90.0 * np.sin(2 * np.pi * 22.0 * tt)
    ph = 2 * np.pi * np.cumsum(f + warb) / SR
    ph2 = 2 * np.pi * np.cumsum(f * 1.013 + warb) / SR
    am = 1.0 - 0.06 * (1.0 - np.cos(2 * np.pi * 22.0 * tt))
    sig = (np.sin(ph) + np.sin(ph2) * 0.9 + np.sin(2 * ph) * 0.35 + np.sin(3 * ph) * 0.12) * am
    sig = sig.astype(np.float32) + bq(mx.noise_at(n), "bandpass", 3800.0, 8.0) * 1.6
    e = env(g, 0.012, 0.03, 0.92, dur, 0.03)
    m = min(n, len(e))
    mx.add(sig[:m] * e[:m] * 0.3, t, wet)


def cheer(mx, t, dur, g, n_claps=90, wet=0.55):
    """Torcida: um leito de ruido filtrado mais muitas palmas com tempo
    embaralhado. Nada quantizado, senao vira chiado ritmico."""
    e = env(g * 0.5, 0.16, 0.3, 0.65, dur, dur * 0.8)
    mx.add(bq(mx.noise_at(len(e)), "bandpass", 720.0, 0.7) * e, t, wet)
    for _ in range(n_claps):
        u = float(mx.rng.random()) ** 0.65
        d = 0.045 + float(mx.rng.random()) * 0.05
        ee = denv(g * (0.10 + float(mx.rng.random()) * 0.22), d, 0.0008)
        hz = 950.0 + float(mx.rng.random()) * 650.0
        q = 0.8 + float(mx.rng.random())
        mx.add(bq(mx.noise_at(len(ee)), "bandpass", hz, q) * ee, t + u * dur, wet * 0.5)


def groan(mx, t, dur, g, wet=0.5):
    """O 'ooh' da arquibancada quando o ponto e do outro: dois formantes num
    pulso grave que desce."""
    n = int(dur * SR)
    tt = np.arange(n, dtype=np.float32) / SR
    f0 = 128.0 * (0.72 ** np.clip(tt / dur, 0, 1))
    ph = 2 * np.pi * np.cumsum(f0) / SR
    src = (np.sin(ph) + np.sin(2 * ph) * 0.5 + np.sin(3 * ph) * 0.3
           + np.sin(4 * ph) * 0.2).astype(np.float32)
    src *= 1.0 + 0.06 * np.sin(2 * np.pi * 5.0 * tt)
    voice = bq(src, "bandpass", 560.0, 4.0) + bq(src, "bandpass", 980.0, 5.0) * 0.6
    e = env(g, 0.10, 0.25, 0.6, dur * 0.7, dur * 0.5)
    m = min(n, len(e))
    mx.add(voice[:m] * e[:m] * 0.5, t, wet)


# ------------------------------------------------------------------ receitas

def S(seconds, seed):
    return Mix(seconds, np.random.default_rng(seed))


def build(name, mx):
    """Cada som e transiente + corpo + sub/cauda com os picos no mesmo
    instante. Camada unica e o que soa 'bip'."""
    if name == "ui":
        crack(mx, 0, 4200, 0.010, 0.40)
        body(mx, 0, 1050, 700, 0.05, 0.07, 0.22, "triangle", 0.2)
    elif name == "blip":
        crack(mx, 0, 3000, 0.007, 0.28)
        body(mx, 0, 720, 520, 0.03, 0.05, 0.20, "triangle")
    elif name == "hit_blob":
        crack(mx, 0, 2600, 0.012, 0.42, 1.2, "bandpass")
        body(mx, 0, 230, 150, 0.04, 0.075, 0.55, "sine", 0.12)
        sub(mx, 0, 88, 0.05, 0.18)
    elif name == "hit_ground":
        crack(mx, 0, 3200, 0.010, 0.38)
        crack(mx, 0, 1100, 0.035, 0.30, 1.6, "bandpass")
        body(mx, 0, 190, 95, 0.055, 0.10, 0.5, "sine", 0.16)
        sub(mx, 0, 62, 0.08, 0.30)
    elif name == "hit_net":
        crack(mx, 0, 2400, 0.012, 0.22, 1.4, "bandpass")
        for k in range(5):
            e = denv(0.16 * (0.72 ** k), 0.05, 0.001)
            mx.add(bq(mx.noise_at(len(e)), "bandpass", 620.0 + k * 90, 4.0) * e,
                   0.004 * k, 0.18)
        body(mx, 0, 150, 96, 0.05, 0.07, 0.12, "sine")
    elif name == "hit_wall":
        crack(mx, 0, 4600, 0.008, 0.34)
        body(mx, 0, 820, 540, 0.03, 0.05, 0.22, "triangle", 0.2)
    elif name == "land":
        crack(mx, 0, 1500, 0.020, 0.22, 0.8, "lowpass")
        body(mx, 0, 160, 80, 0.05, 0.09, 0.36, "sine")
        sub(mx, 0, 55, 0.07, 0.22)
    elif name == "serve":
        whistle_ref(mx, 0, 0.16, 0.55)
        crack(mx, 0.17, 3500, 0.008, 0.34)
        body(mx, 0.17, 320, 170, 0.045, 0.08, 0.42)
        sub(mx, 0.17, 72, 0.055, 0.22)
    elif name == "point_win":
        for i, hz in enumerate((523.25, 659.25, 880.0)):
            ring(mx, i * 0.075, hz, 0.35, 0.30)
            stab(mx, i * 0.075, hz / 2, 0.10, 0.22)
        clap(mx, 0.16, 0.30)
        clap(mx, 0.30, 0.26)
        cheer(mx, 0.10, 1.5, 0.42)
    elif name == "point_lose":
        for i, hz in enumerate((392.0, 349.23)):
            ring(mx, i * 0.09, hz, 0.34, 0.22)
        body(mx, 0, 220, 150, 0.12, 0.2, 0.16, "triangle", 0.3)
        groan(mx, 0.08, 1.1, 0.30)
    elif name == "emote_0":
        for i, hz in enumerate((392.0, 293.66)):
            ring(mx, i * 0.11, hz, 0.4, 0.26)
    elif name == "emote_1":
        for i, hz in enumerate((523.25, 659.25, 880.0)):
            ring(mx, i * 0.07, hz, 0.34, 0.28)
        clap(mx, 0.14, 0.2)
    elif name == "emote_2":
        stab(mx, 0, 660, 0.10, 0.34)
        stab(mx, 0.05, 880, 0.10, 0.28)
    elif name == "special_ready":
        for i, hz in enumerate((880.0, 1174.7, 1760.0)):
            ring(mx, i * 0.06, hz, 0.4, 0.22, wet=0.5)
        crack(mx, 0, 6000, 0.012, 0.16)
    elif name == "special_fired":
        crack(mx, 0, 5000, 0.010, 0.45)
        crack(mx, 0, 1700, 0.05, 0.34, 1.3, "bandpass")
        stab(mx, 0, 330, 0.18, 0.5)
        body(mx, 0, 280, 120, 0.09, 0.16, 0.42, "sawtooth", 0.2)
        sub(mx, 0, 74, 0.12, 0.32)
    elif name == "special_hit":
        crack(mx, 0, 6000, 0.012, 0.5)
        crack(mx, 0, 1400, 0.09, 0.42, 1.0, "bandpass")
        body(mx, 0, 300, 90, 0.13, 0.28, 0.5, "sine", 0.25)
        sub(mx, 0, 58, 0.34, 0.45)
        ring(mx, 0.02, 196.0, 0.7, 0.16)
    elif name == "ground_burn":
        crack(mx, 0, 5200, 0.014, 0.5)
        body(mx, 0, 240, 46, 0.25, 0.5, 0.42, "sawtooth", 0.3)
        sub(mx, 0, 44, 0.55, 0.55)
        e = denv(0.30, 0.42, 0.004)
        mx.add(bq(mx.noise_at(len(e)), "lowpass", 800.0, 0.7) * e, 0, 0.3)
    elif name == "dive":
        crack(mx, 0, 2200, 0.05, 0.22, 0.7, "bandpass")
        e = denv(0.30, 0.22, 0.012)
        mx.add(bq_sweep(mx.noise_at(len(e)), "lowpass", 2600.0, 700.0, 0.2, 0.8) * e, 0, 0.18)
        body(mx, 0, 170, 110, 0.08, 0.12, 0.18, "triangle")
    elif name == "dive_hit":
        crack(mx, 0, 4200, 0.009, 0.5)
        crack(mx, 0, 1200, 0.04, 0.4, 1.8, "bandpass")
        body(mx, 0, 270, 120, 0.05, 0.10, 0.5, "sine", 0.18)
        sub(mx, 0, 70, 0.07, 0.32)
        ring(mx, 0.01, 1245.0, 0.22, 0.10)
    elif name == "bonk":
        crack(mx, 0, 3400, 0.010, 0.4)
        body(mx, 0, 200, 120, 0.05, 0.10, 0.42, "sine")
        sub(mx, 0, 64, 0.08, 0.26)
        for k in range(5):
            ring(mx, 0.05 + k * 0.13, 540.0 * (0.84 ** k), 0.14,
                 0.18 * (0.78 ** k), wet=0.45)
    elif name == "block":
        crack(mx, 0, 3800, 0.010, 0.45)
        crack(mx, 0, 1500, 0.035, 0.34, 1.4, "bandpass")
        body(mx, 0, 330, 180, 0.04, 0.08, 0.34, "triangle")
        sub(mx, 0, 80, 0.05, 0.2)
    elif name == "apex":
        crack(mx, 0, 6500, 0.008, 0.3)
        ring(mx, 0, 2093.0, 0.3, 0.2, wet=0.5)
        body(mx, 0, 430, 900, 0.06, 0.09, 0.16, "triangle", 0.2)
    elif name == "special_wasted":
        body(mx, 0, 320, 90, 0.3, 0.42, 0.3, "sawtooth", 0.25)
        e = denv(0.2, 0.3, 0.01)
        mx.add(bq_sweep(mx.noise_at(len(e)), "lowpass", 1600.0, 400.0, 0.3, 0.8) * e, 0, 0.2)
    elif name == "parry":
        crack(mx, 0, 7000, 0.010, 0.5)
        ring(mx, 0, 1568.0, 0.4, 0.28, ((1.0, 1.0), (2.4, 0.4), (4.1, 0.2)), 0.55)
        body(mx, 0, 900, 2400, 0.05, 0.10, 0.2, "triangle", 0.3)
    elif name == "parry_whiff":
        e = denv(0.2, 0.09, 0.003)
        mx.add(bq_sweep(mx.noise_at(len(e)), "bandpass", 2400.0, 900.0, 0.09, 2.0) * e, 0, 0.15)
    elif name == "dig":
        crack(mx, 0, 2000, 0.012, 0.3, 1.2, "bandpass")
        body(mx, 0, 210, 140, 0.04, 0.07, 0.3, "triangle")
        sub(mx, 0, 76, 0.05, 0.16)
    elif name == "ball_out":
        crack(mx, 0, 5000, 0.009, 0.3)
        ring(mx, 0.0, 1660.0, 0.16, 0.16)
        ring(mx, 0.09, 1108.7, 0.26, 0.14)
    elif name == "whistle":
        whistle_ref(mx, 0, 0.30, 0.62)
    elif name == "cheer":
        cheer(mx, 0, 1.8, 0.5, 120)
    elif name == "thunder":
        crack(mx, 0, 5000, 0.02, 0.3)
        sub(mx, 0, 34, 2.0, 0.6)
        e = denv(0.7, 1.5, 0.02)
        mx.add(bq(mx.noise_at(len(e)), "lowpass", 420.0, 0.5) * e, 0, 0.6)
        e = denv(0.3, 0.6, 0.005)
        mx.add(bq(mx.noise_at(len(e)), "bandpass", 1400.0, 1.8) * e, 0, 0.5)
    elif name == "glitch":
        for i, hz in enumerate((1200.0, 760.0, 430.0)):
            stab(mx, i * 0.05, hz, 0.04, 0.3)
        crack(mx, 0, 3200, 0.010, 0.25, 3.0, "bandpass")
    elif name == "fatality":
        crack(mx, 0, 5200, 0.02, 0.45)
        sub(mx, 0, 38, 1.4, 0.6)
        e = denv(0.5, 0.9, 0.006)
        mx.add(bq(mx.noise_at(len(e)), "lowpass", 520.0, 0.5) * e, 0, 0.55)
        for hz, at in ((110.0, 0.0), (82.0, 0.22), (62.0, 0.45)):
            body(mx, at, hz * 1.6, hz, 0.3, 0.42, 0.26, "sawtooth", 0.35)
    elif name == "finish_win":
        for i, hz in enumerate((523.25, 659.25, 783.99, 1046.5)):
            ring(mx, i * 0.11, hz, 0.55, 0.28, wet=0.5)
            stab(mx, i * 0.11, hz / 2, 0.12, 0.22)
        clap(mx, 0.44, 0.3)
        clap(mx, 0.56, 0.3)
        cheer(mx, 0.3, 2.0, 0.5, 120)
        whistle_ref(mx, 0.0, 0.22, 0.4)
    elif name == "finish_lose":
        for i, hz in enumerate((493.88, 415.3, 349.23)):
            ring(mx, i * 0.13, hz, 0.5, 0.22, wet=0.5)
        body(mx, 0, 200, 110, 0.5, 0.7, 0.16, "triangle", 0.35)
        groan(mx, 0.15, 1.3, 0.34)
        whistle_ref(mx, 0.0, 0.2, 0.34)
    else:
        raise KeyError(name)


SOUNDS = {
    "ui": (0.14, 0.55), "blip": (0.10, 0.5), "hit_blob": (0.30, 0.95),
    "hit_ground": (0.36, 0.95), "hit_net": (0.34, 0.75), "hit_wall": (0.16, 0.7),
    "land": (0.26, 0.75), "serve": (0.40, 0.8), "point_win": (2.1, 0.92),
    "point_lose": (1.6, 0.8), "emote_0": (1.0, 0.75), "emote_1": (0.9, 0.78),
    "emote_2": (0.34, 0.75), "special_ready": (0.9, 0.8), "special_fired": (0.7, 0.95),
    "special_hit": (1.3, 0.98), "ground_burn": (1.3, 0.98), "dive": (0.5, 0.75),
    "dive_hit": (0.6, 0.95), "bonk": (1.0, 0.85), "block": (0.34, 0.9),
    "apex": (0.5, 0.75), "special_wasted": (0.7, 0.75), "parry": (0.8, 0.88),
    "parry_whiff": (0.2, 0.6), "dig": (0.24, 0.8), "ball_out": (0.45, 0.8),
    "whistle": (0.45, 0.85), "cheer": (2.6, 0.8), "thunder": (2.6, 0.95),
    "glitch": (0.4, 0.75), "fatality": (2.2, 0.98), "finish_win": (2.8, 0.95),
    "finish_lose": (2.4, 0.85),
}


def render(name, seconds, peak, seed):
    mx = S(seconds, seed)
    build(name, mx)
    out = mx.dry + reverb(mx.wet, seconds=0.32, decay=3.4,
                          rng=np.random.default_rng(seed + 7)) * 1.5
    m = float(np.max(np.abs(out))) or 1.0
    # saturacao macia no lugar de corte seco: corte seco e o som de 8 bits
    # quebrado, tanh junta as camadas num objeto so
    out = np.tanh(out / m * 1.45) / np.tanh(1.45) * peak
    k = min(len(out), 220)
    out[:8] *= np.linspace(0, 1, 8)
    out[-k:] *= np.linspace(1, 0, k)
    return out


if __name__ == "__main__":
    want = sys.argv[1:] or sorted(SOUNDS)
    total = 0
    for i, name in enumerate(want):
        sec, peak = SOUNDS[name]
        buf = render(name, sec, peak, 1000 + i * 13)
        pcm = (np.clip(buf, -1, 1) * 32767).astype("<i2")
        path = os.path.join(OUT, name + ".wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        total += os.path.getsize(path)
        print("  %-16s %5.2fs %6d KB" % (name, sec, os.path.getsize(path) // 1024))
    print("total", total // 1024, "KB")
