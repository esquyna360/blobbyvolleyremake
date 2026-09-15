"""Compoe e renderiza a trilha nova: esporte de arcade 16 bits.

A trilha antiga soava triste e magra por quatro motivos independentes: 112 BPM
(dance mid-tempo, nao arcade), triades sem setima, baixo em seminimas e nenhuma
palma. Aqui o padrao e outro -- 135 a 144 BPM, modos maiores (jonio, mixolidio,
dorico), setimas em tudo, baixo sincopado, palma no 2 e no 4 e metal curto
respondendo a melodia.

O BPM nao e escolhido de ouvido: em 4/4 a 44100 Hz o compasso so fecha em numero
inteiro de amostras em alguns valores (10584000 / BPM). 135, 140 e 144 fecham;
130 e 138 nao, e o loop escorrega.
"""
import os, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_music import render, write, OUT  # noqa

SPB = 16
BARS = 16

# Intervalos a partir da fundamental. Setima em tudo: triade pura soa 8 bits.
QUAL = {
    "maj7": [0, 4, 7, 11], "dom7": [0, 4, 7, 10], "min7": [0, 3, 7, 10],
    "maj6": [0, 4, 7, 9], "add9": [0, 4, 7, 14], "min9": [0, 3, 7, 14],
}

SONGS = {
    # I7 - bVII - IV - I: o riff de sports-rock, em mixolidio
    "rally": {
        "bpm": 140, "root": 62, "lead_oct": 12,
        "chords": [(62, "dom7"), (60, "add9"), (55, "maj6"), (62, "dom7")],
        "scale": [0, 2, 4, 7, 9],  # pentatonica maior sobre D
        "lead": "square", "comp": "marimba", "drive": 1.0,
    },
    # i7 - IV7 - bVI - bVII em dorico: tensao sem melancolia
    "blitz": {
        "bpm": 144, "root": 57, "lead_oct": 12,
        "chords": [(57, "min9"), (50, "dom7"), (53, "maj7"), (55, "maj6")],
        "scale": [0, 3, 5, 7, 10],
        "lead": "saw", "comp": "pluck", "drive": 1.15,
    },
    # I - V - vi - IV com setimas: o mais solar dos tres
    "sunset": {
        "bpm": 135, "root": 53, "lead_oct": 12,
        "chords": [(53, "maj7"), (48, "add9"), (50, "min7"), (46, "maj7")],
        "scale": [0, 2, 4, 7, 9],
        "lead": "steeldrum", "comp": "marimba", "drive": 0.9,
    },
    # menu: mesma familia, sem bateria pesada -- o jogo ainda nao comecou
    "menu": {
        "bpm": 125, "root": 60, "lead_oct": 12,
        "chords": [(60, "maj7"), (57, "min7"), (50, "min7"), (55, "dom7")],
        "scale": [0, 2, 4, 7, 9],
        "lead": "bell", "comp": "harp", "drive": 0.55,
    },
}


def tr(voice, tier, gain, notes):
    n = []
    for s in notes:
        n += [int(s[0]), int(s[1]), int(s[2]), int(s[3])]
    return {"v": voice, "tier": tier, "gain": gain, "n": n}


def chord_at(cfg, bar):
    return cfg["chords"][(bar // 2) % len(cfg["chords"])]


def notes_of(ch):
    root, q = ch
    return [root + i for i in QUAL[q]]


def voiced(tones, lo, hi):
    """Poe o acorde num registro fixo. Sem isto cada acorde toca na oitava da
    propria fundamental e o arranjo pula de lugar a cada dois compassos."""
    out = []
    for p in tones:
        while p < lo:
            p += 12
        while p > hi:
            p -= 12
        out.append(p)
    return sorted(out)


def compose(sid):
    cfg = SONGS[sid]
    rng = np.random.default_rng(sum(ord(c) for c in sid) * 977)
    menu = sid == "menu"
    kick, snare, clp, hat8, hat16, bassn, comp = [], [], [], [], [], [], []
    stabs, lead, harm, toms, crash, shak = [], [], [], [], [], []
    for bar in range(BARS):
        b0 = bar * SPB
        ch = chord_at(cfg, bar)
        root = ch[0]
        tones = notes_of(ch)
        last = bar % 4 == 3

        # --- bateria. Bumbo com sincope, caixa fixa no 2 e no 4, palma junto.
        for s in ([0, 6, 10] if not menu else [0, 8]):
            kick.append([b0 + s, 36, 112 if s == 0 else 96, 1])
        if last:
            kick.append([b0 + 14, 36, 90, 1])
        for s in (4, 12):
            snare.append([b0 + s, 38, 106, 1])
            clp.append([b0 + s, 39, 104, 1])
        for s in range(0, SPB, 2):
            hat8.append([b0 + s, 42, 84 if s % 4 == 0 else 62, 1])
        for s in range(1, SPB, 2):
            hat16.append([b0 + s, 42, 48, 1])
        hat16.append([b0 + 14, 46, 74, 1])
        for s in range(0, SPB, 2):
            shak.append([b0 + s + 1, 70, 40, 1])
        if bar % 8 == 0:
            crash.append([b0, 49, 96, 4])
        if last and bar != BARS - 1:
            for k, s in enumerate((13, 14, 15)):
                toms.append([b0 + s, 50 - k * 2, 100, 1])

        # --- baixo sincopado. Em seminimas soa marcha; o balanco esta no 3 e no 11.
        lo = voiced([root], 33, 44)[0]
        sev = lo + (QUAL[ch[1]][3] % 12)
        for s, p, v, d in ((0, lo, 112, 2), (3, lo, 86, 1), (6, lo + 7, 100, 2),
                           (8, lo, 104, 2), (11, lo + 12, 88, 1), (14, sev, 92, 2)):
            bassn.append([b0 + s, p, v, d])

        # --- acordes no contratempo
        for s in (2, 5, 10, 13):
            for i, p in enumerate(voiced(tones, 60, 74)):
                comp.append([b0 + s, p, 80 - i * 6, 2])

        # --- metal em resposta: a melodia pergunta, o metal responde
        br = voiced(tones, 55, 69)
        if bar % 4 == 1:
            for s in (12, 14):
                for p in br:
                    stabs.append([b0 + s, p, 100, 1])
        if last:
            for s in (8, 10, 11):
                for p in br:
                    stabs.append([b0 + s, p, 104, 1])

        # --- melodia pentatonica na tonica da faixa, nao na fundamental do
        # acorde: a pentatonica maior cai bem em toda a progressao e nunca
        # fecha na terca menor.
        key = cfg["root"] + cfg["lead_oct"]
        pos = int(rng.integers(0, 5))
        s = 0
        while s < SPB:
            d = int(rng.choice([2, 2, 3, 4], p=[0.4, 0.25, 0.2, 0.15]))
            pos = int(np.clip(pos + int(rng.integers(-2, 3)), 0, 4))
            oct_up = 12 if (bar % 4 >= 2 and rng.random() < 0.3) else 0
            p = key + cfg["scale"][pos] + oct_up
            if s + d > SPB:
                d = SPB - s
            if rng.random() < (0.18 if not last else 0.05):
                s += d
                continue
            lead.append([b0 + s, p, 96 if s % 4 == 0 else 80, d])
            harm.append([b0 + s, p + 7, 64, d])
            s += d
        if last:
            lead.append([b0 + 12, key, 104, 4])
            harm.append([b0 + 12, key + 12, 70, 4])

    g = cfg["drive"]
    tracks = [
        tr("bass", 0, 1.0 * g, bassn),
        tr(cfg["comp"], 0, 0.55, comp),
        tr("kick", 0, 1.0, kick),
        tr("snare", 0, 0.95, snare),
        tr("clap", 0, 0.9, clp),
        tr("hat", 0, 0.8, hat8),
        tr("hat", 1, 0.7, hat16),
        tr("shaker", 1, 0.5, shak),
        tr("crash", 1, 0.6, crash),
        tr("tom", 1, 0.9, toms),
        tr("brass", 2, 1.0 * g, stabs),
        tr(cfg["lead"], 2, 0.85, lead),
        tr("organ", 3, 0.7, harm),
    ]
    if menu:
        tracks = [t for t in tracks if t["v"] not in ("tom", "shaker")]
    return {"id": sid, "bpm": cfg["bpm"], "bars": BARS, "spb": SPB, "tracks": tracks}


if __name__ == "__main__":
    ids = sys.argv[1:] or ["rally", "blitz", "sunset", "menu"]
    for i, sid in enumerate(ids):
        song = compose(sid)
        n = sum(len(t["n"]) // 4 for t in song["tracks"])
        print(sid, song["bpm"], "bpm", n, "notas")
        write(render(song, 0, 101 + i), os.path.join(OUT, sid + "_a.ogg"))
        write(render(song, 3, 201 + i), os.path.join(OUT, sid + "_b.ogg"))
