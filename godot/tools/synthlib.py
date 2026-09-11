"""Porte do sintetizador do jogo web pra render offline.

As vozes sao as mesmas de web/src/audio/synth.ts, no mesmo formato: envelope
ADSR, um ou dois osciladores, um filtro e um envio de reverb. A diferenca e
que aqui tudo e array -- o WebAudio agenda no tempo real, isso aqui escreve
direto no buffer.
"""
import math
import numpy as np
from scipy.signal import lfilter, fftconvolve

SR = 44100
LO = 1e-4


def pink(seconds, rng):
    n = int(SR * seconds)
    w = rng.standard_normal(n)
    b0 = lfilter([0.0990460], [1.0, -0.99765], w)
    b1 = lfilter([0.2965164], [1.0, -0.96300], w)
    b2 = lfilter([1.0526913], [1.0, -0.57000], w)
    return ((b0 + b1 + b2 + w * 0.1848) * 0.22).astype(np.float32)


class Mix:
    def __init__(self, seconds, rng):
        n = int(SR * seconds)
        self.dry = np.zeros(n, np.float32)
        self.wet = np.zeros(n, np.float32)
        self.noise = pink(6.0, rng)
        self.rng = rng

    def add(self, buf, t, wet=0.0):
        i = int(t * SR)
        if i < 0:
            buf = buf[-i:]
            i = 0
        j = min(len(self.dry), i + len(buf))
        if j <= i:
            return
        b = buf[:j - i]
        self.dry[i:j] += b
        if wet > 0.0:
            self.wet[i:j] += b * wet

    def noise_at(self, n, rate=1.0):
        span = int(n * rate) + 8
        o = int(self.rng.random() * max(1, len(self.noise) - span - 8))
        seg = self.noise[o:o + span]
        if rate == 1.0:
            return seg[:n].copy()
        return np.interp(np.arange(n) * rate, np.arange(len(seg)), seg).astype(np.float32)


# ------------------------------------------------------------- envelopes

def env(peak, a, d, s, dur, r):
    hold = max(dur, a + 0.01)
    n = int((hold + r) * SR) + 2
    t = np.arange(n, dtype=np.float32) / SR
    g = np.empty(n, np.float32)
    sus = max(LO, peak * s)
    m = t < a
    g[m] = LO + (peak - LO) * (t[m] / max(a, 1e-6))
    m = (t >= a) & (t < a + d)
    g[m] = peak * (sus / peak) ** ((t[m] - a) / max(d, 1e-6))
    m = (t >= a + d) & (t < hold)
    g[m] = sus
    m = t >= hold
    g[m] = sus * (LO / sus) ** np.clip((t[m] - hold) / max(r, 1e-6), 0, 1)
    return g


def denv(peak, dur, attack=0.001):
    n = int(dur * SR) + 2
    t = np.arange(n, dtype=np.float32) / SR
    g = np.empty(n, np.float32)
    m = t < attack
    g[m] = LO + (peak - LO) * (t[m] / max(attack, 1e-6))
    m = t >= attack
    g[m] = peak * (LO / peak) ** np.clip((t[m] - attack) / max(dur - attack, 1e-6), 0, 1)
    return g


# ----------------------------------------------------------- osciladores

def osc(kind, hz, n, detune=0.0, vib=None, sweep=None):
    t = np.arange(n, dtype=np.float32) / SR
    f = np.full(n, hz * (2.0 ** (detune / 1200.0)), np.float32)
    if vib is not None:
        rate, cents, delay = vib
        depth = np.clip(t / max(delay + 0.15, 1e-6), 0, 1) * cents
        f = f * (2.0 ** (depth * np.sin(2 * math.pi * rate * t) / 1200.0))
    if sweep is not None:
        to, span = sweep
        k = np.clip(t / max(span, 1e-6), 0, 1)
        f = f * (to / max(hz, 1e-6)) ** k
    ph = 2.0 * math.pi * np.cumsum(f) / SR
    if kind == "sine":
        return np.sin(ph).astype(np.float32)
    if kind == "triangle":
        return (2.0 / math.pi * np.arcsin(np.sin(ph))).astype(np.float32)
    if kind == "sawtooth":
        w = (2.0 * ((ph / (2 * math.pi)) % 1.0) - 1.0).astype(np.float32)
        return bq(w, "lowpass", 11000.0, 0.7)
    w = np.where(np.sin(ph) >= 0, 1.0, -1.0).astype(np.float32)
    return bq(w, "lowpass", 11000.0, 0.7)


# ---------------------------------------------------------------- filtros

def _coef(kind, f0, q):
    f0 = min(max(f0, 20.0), SR * 0.45)
    w0 = 2 * math.pi * f0 / SR
    al = math.sin(w0) / (2 * max(q, 0.05))
    cw = math.cos(w0)
    if kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
    elif kind == "highpass":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    else:
        b = [al, 0.0, -al]
    a = [1 + al, -2 * cw, 1 - al]
    return [x / a[0] for x in b], [1.0, a[1] / a[0], a[2] / a[0]]


def bq(x, kind, f0, q=1.0):
    b, a = _coef(kind, f0, q)
    return lfilter(b, a, x).astype(np.float32)


def bq_sweep(x, kind, f0, f1, span, q=1.0, block=128):
    """Filtro com a frequencia rampando. O WebAudio faz isso por amostra; em
    bloco de 128 a diferenca nao se ouve e roda mil vezes mais rapido."""
    n = len(x)
    out = np.empty(n, np.float32)
    zi = np.zeros(2)
    ns = max(1, int(span * SR))
    for i in range(0, n, block):
        j = min(n, i + block)
        k = min(1.0, (i + block * 0.5) / ns)
        f = f0 * (max(f1, 20.0) / max(f0, 20.0)) ** k
        b, a = _coef(kind, f, q)
        seg, zi = lfilter(b, a, x[i:j], zi=zi)
        out[i:j] = seg
    return out


def reverb(x, seconds=2.2, decay=2.6, rng=None):
    rng = rng or np.random.default_rng(3)
    n = int(SR * seconds)
    t = np.arange(n, dtype=np.float32) / n
    ir = (rng.standard_normal(n).astype(np.float32) * (1 - t) ** decay * (1 - t * 0.3))
    ir[:60] *= np.linspace(0, 1, 60)
    return fftconvolve(x, ir)[:len(x)].astype(np.float32) / (SR ** 0.5) * 4.0
