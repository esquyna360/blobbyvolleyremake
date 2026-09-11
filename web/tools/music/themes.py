"""Os temas do jogo. Rodar `python3 tools/music/build.py` pra gerar os JSON."""

from blobby_song import (
    LOOP_BARS, MINOR_STEPS, SPB, Song, ladder, lay_arp, lay_bass, lay_chords,
    lay_comp, lay_every, lay_melody, lay_pulse, shift_diatonic,
)

KICK, SNARE, STICK = 36, 38, 37
HAT, OPEN_HAT = 42, 46
CRASH, RIDE, TAMB = 49, 51, 54
CONGA_HI, CONGA_LOW, MARACAS, SHAKER = 63, 64, 70, 82
AGOGO_HI, AGOGO_LOW = 67, 68
TOMS = [50, 48, 47, 45]


# ============================================================ praia (do zip)
# Melodia, harmonia e padroes vieram prontos do compositor. Mantidos nota a
# nota; o que muda aqui e so o formato de saida.

PRAIA_PROG = [
    ('A', 45, [69, 73, 76]), ('F#m', 42, [66, 69, 73]),
    ('D', 38, [66, 69, 74]), ('E', 40, [64, 68, 71]),
    ('A', 45, [69, 73, 76]), ('F#m', 42, [66, 69, 73]),
    ('Bm7', 47, [66, 69, 71, 74]), ('E7', 40, [64, 68, 71, 74]),
    ('D', 38, [66, 69, 74]), ('E', 40, [64, 68, 71]),
    ('C#m', 49, [64, 68, 73]), ('F#m', 42, [66, 69, 73]),
    ('D', 38, [66, 69, 74]), ('E', 40, [64, 68, 71]),
    ('A', 45, [69, 73, 76]), ('E7', 40, [64, 68, 71, 74]),
]

PRAIA_MEL = [
    [(69, 2), (73, 2), (76, 2), (78, 2), (76, 4), (73, 4)],
    [(74, 2), (73, 2), (71, 2), (73, 2), (69, 8)],
    [(78, 3), (76, 1), (74, 2), (76, 2), (78, 4), (81, 4)],
    [(80, 2), (78, 2), (76, 2), (74, 2), (76, 8)],
    [(81, 2), (85, 2), (83, 2), (81, 2), (80, 4), (76, 4)],
    [(78, 2), (81, 2), (80, 2), (78, 2), (76, 8)],
    [(74, 2), (76, 2), (78, 2), (80, 2), (81, 4), (78, 4)],
    [(83, 2), (81, 2), (80, 2), (78, 2), (76, 8)],
    [(78, 2), (78, 2), (81, 2), (83, 2), (81, 6), (78, 2)],
    [(80, 2), (80, 2), (83, 2), (85, 2), (83, 8)],
    [(85, 2), (83, 2), (80, 2), (76, 2), (80, 4), (83, 4)],
    [(81, 2), (80, 2), (78, 2), (73, 2), (78, 8)],
    [(78, 3), (81, 1), (83, 2), (85, 2), (86, 4), (81, 4)],
    [(83, 2), (85, 2), (83, 2), (80, 2), (76, 8)],
    [(81, 2), (83, 2), (85, 2), (81, 2), (76, 4), (73, 4)],
    [(71, 2), (73, 2), (74, 2), (76, 2), (80, 2), (83, 2), (86, 2), (None, 2)],
]

PRAIA_BASS = [(0, 2, 0), (2, 2, 0), (4, 2, 12), (6, 2, 0), (8, 2, 7), (10, 2, 0), (12, 2, 12), (14, 2, None)]
PRAIA_MARIMBA = [(0, 2), (3, 3), (6, 2), (8, 2), (11, 3), (14, 2)]


def kit_beach(song, bars):
    kick = song.track('kick', 1)
    snare = song.track('snare', 1)
    hat = song.track('hat', 1, 0.8)
    crash = song.track('crash', 1, 0.7)
    stick = song.track('stick', 1, 0.6)
    tom = song.track('tom', 1)
    for bar in range(bars):
        start = bar * SPB
        fill = bar % 8 == 7
        if bar % LOOP_BARS in (0, 8):
            crash.add(start, CRASH, 96, 4)
        for slot in (0, 6, 8, 14):
            kick.add(start + slot, KICK, 112 if slot in (0, 8) else 96, 1)
        for slot in (4, 12):
            snare.add(start + slot, SNARE, 104, 1)
        stick.add(start + 10, STICK, 58, 1)
        for slot in range(0, 16, 2):
            if fill and slot >= 12:
                continue
            hat.add(start + slot, OPEN_HAT if slot == 14 else HAT, 80 if slot % 4 == 0 else 58, 1)
        if fill:
            for i, note in enumerate(TOMS):
                tom.add(start + 12 + i, note, 100, 1)


def congas_beach(song, bars):
    hi = song.track('conga_hi', 1, 0.9)
    low = song.track('conga_low', 1, 0.9)
    mar = song.track('maracas', 1, 0.7)
    ago = song.track('agogo', 1, 0.7)
    tam = song.track('tambourine', 1, 0.6)
    for bar in range(bars):
        start = bar * SPB
        for slot in (0, 7, 12):
            hi.add(start + slot, CONGA_HI, 82, 1)
        for slot in (4, 10):
            low.add(start + slot, CONGA_LOW, 76, 1)
        for slot in (2, 6, 10, 14):
            mar.add(start + slot, MARACAS, 62, 1)
        ago.add(start + 3, AGOGO_HI, 70, 1)
        ago.add(start + 11, AGOGO_LOW, 70, 1)
        tam.add(start + 4, TAMB, 58, 1)
        tam.add(start + 12, TAMB, 58, 1)


def praia():
    s = Song('praia', 'Sol de Rachar', 112)
    lad = ladder(69)
    lay_bass(s.track('bass', 0, 0.9), PRAIA_PROG, s.bars, PRAIA_BASS)
    lay_chords(s.track('pad', 0, 0.55), PRAIA_PROG, s.bars)
    lay_comp(s.track('marimba', 0, 0.75), PRAIA_PROG, s.bars, PRAIA_MARIMBA, velocity=92)
    lay_every(s.track('shaker', 0, 0.5), SHAKER, s.bars, 1, velocity=42, accent=24)
    lay_melody(s.track('steeldrum', 0, 1.0), PRAIA_MEL, s.bars, velocity=96, accent=8)
    kit_beach(s, s.bars)
    congas_beach(s, s.bars)
    lay_arp(s.track('saw', 2, 0.55), PRAIA_PROG, s.bars, [0, 1, 2, 3, 2, 1])
    harmony = s.track('square', 3, 0.5)
    lay_melody(harmony, [[(p if p is None else shift_diatonic(p, -2, lad), d) for p, d in bar] for bar in PRAIA_MEL],
               s.bars, velocity=78, accent=0)
    return s


# ================================================================= menu
# Nada de bateria e nada de tier: o menu e um lugar pra ficar parado. Mesma
# familia harmonica da praia pra entrar na partida sem estranheza.

MENU_PROG = [
    ('A', 45, [69, 73, 76]), ('F#m', 42, [66, 69, 73]),
    ('D', 38, [66, 69, 74]), ('E', 40, [64, 68, 71]),
    ('F#m', 42, [66, 69, 73]), ('D', 38, [66, 69, 74]),
    ('Bm7', 47, [66, 69, 71, 74]), ('E', 40, [64, 68, 71]),
]

MENU_MEL = [
    [(76, 4), (73, 4), (76, 4), (78, 4)],
    [(76, 8), (None, 8)],
    [(74, 4), (76, 4), (78, 6), (76, 2)],
    [(73, 8), (None, 8)],
    [(78, 4), (76, 4), (73, 4), (76, 4)],
    [(74, 12), (None, 4)],
    [(71, 4), (73, 4), (76, 4), (78, 4)],
    [(76, 12), (None, 4)],
]


def menu():
    s = Song('menu', 'Antes do Saque', 84, bars=8)
    lay_chords(s.track('pad', 0, 0.6), MENU_PROG, s.bars)
    lay_bass(s.track('bass', 0, 0.5), MENU_PROG, s.bars, [(0, 6, 0), (6, 4, 7), (12, 4, 0)])
    lay_arp(s.track('harp', 0, 0.55), MENU_PROG, s.bars, [0, 1, 2, 3, 2, 1], rate=2, velocity=54, accent=10)
    lay_melody(s.track('marimba', 0, 0.7), MENU_MEL, s.bars, velocity=76, accent=6)
    lay_every(s.track('shaker', 0, 0.28), SHAKER, s.bars, 4, velocity=30, accent=10)
    return s



# ================================================================= luau
# Noite, fogueira, violao de nylon. Sem bumbo no tier 0: o que marca o tempo e
# a conga. A melodia e assobiada, entao anda devagar e respira entre frases.

LUAU_PROG = [
    ('F#m', 42, [66, 69, 73]), ('D', 38, [66, 69, 74]),
    ('A', 45, [69, 73, 76]), ('E', 40, [64, 68, 71]),
    ('F#m', 42, [66, 69, 73]), ('D', 38, [66, 69, 74]),
    ('Bm7', 47, [66, 69, 71, 74]), ('C#m', 49, [64, 68, 73]),
    ('D', 38, [66, 69, 74]), ('A', 45, [69, 73, 76]),
    ('E', 40, [64, 68, 71]), ('F#m', 42, [66, 69, 73]),
    ('Bm7', 47, [66, 69, 71, 74]), ('C#m', 49, [64, 68, 73]),
    ('D', 38, [66, 69, 74]), ('E', 40, [64, 68, 71]),
]

LUAU_MEL = [
    [(73, 4), (69, 4), (66, 6), (69, 2)],
    [(71, 4), (69, 4), (66, 8)],
    [(69, 2), (73, 2), (76, 4), (78, 8)],
    [(76, 4), (73, 4), (71, 8)],
    [(78, 4), (76, 2), (73, 2), (69, 8)],
    [(74, 4), (73, 4), (69, 6), (66, 2)],
    [(71, 4), (74, 4), (78, 8)],
    [(76, 4), (73, 4), (68, 8)],
    [(69, 2), (71, 2), (73, 4), (74, 8)],
    [(76, 4), (73, 4), (69, 8)],
    [(71, 4), (76, 4), (80, 8)],
    [(78, 6), (76, 2), (73, 8)],
    [(74, 4), (78, 4), (81, 8)],
    [(80, 4), (76, 4), (73, 8)],
    [(74, 4), (69, 4), (66, 4), (69, 4)],
    [(71, 4), (68, 4), (64, 8)],
]


def kit_luau(song, bars):
    hi = song.track('conga_hi', 1, 0.85)
    low = song.track('conga_low', 1, 0.9)
    stick = song.track('stick', 1, 0.5)
    kick = song.track('kick', 1, 0.7)
    mar = song.track('maracas', 1, 0.55)
    for bar in range(bars):
        start = bar * SPB
        for slot in (0, 8):
            kick.add(start + slot, KICK, 92, 1)
        for slot in (3, 6, 11, 14):
            hi.add(start + slot, CONGA_HI, 74 if slot % 2 else 84, 1)
        for slot in (4, 12):
            low.add(start + slot, CONGA_LOW, 80, 1)
        stick.add(start + 10, STICK, 52, 1)
        for slot in range(2, SPB, 4):
            mar.add(start + slot, MARACAS, 50, 1)


def luau():
    s = Song('luau', 'Fogueira', 92)
    lad = ladder(66, MINOR_STEPS)
    lay_chords(s.track('pad', 0, 0.5), LUAU_PROG, s.bars, velocity=46)
    lay_bass(s.track('bass', 0, 0.8), LUAU_PROG, s.bars, [(0, 6, 0), (6, 2, 7), (8, 6, 0), (14, 2, None)])
    lay_comp(s.track('pluck', 0, 0.7), LUAU_PROG, s.bars, [(0, 3), (4, 2), (7, 3), (11, 2), (14, 2)], velocity=76)
    lay_every(s.track('shaker', 0, 0.4), SHAKER, s.bars, 2, velocity=34, accent=16)
    lay_melody(s.track('whistle', 0, 0.85), LUAU_MEL, s.bars, velocity=88, accent=8)
    kit_luau(s, s.bars)
    lay_arp(s.track('harp', 2, 0.5), LUAU_PROG, s.bars, [0, 2, 1, 3, 2, 0], velocity=58, accent=14)
    lay_melody(s.track('violin', 3, 0.45),
               [[(p if p is None else shift_diatonic(p, 2, lad), d) for p, d in bar] for bar in LUAU_MEL],
               s.bars, velocity=64, accent=0)
    return s


# ============================================================== ginasio
# Coberto, seco, sem reverbo de praia. Funk de quadra: baixo em semicolcheia,
# orgao no contratempo e metais curtos. Palma no 2 e no 4 faz as vezes da torcida.

GINASIO_PROG = [
    ('Am', 45, [69, 72, 76]), ('Am', 45, [69, 72, 76]),
    ('Dm7', 38, [69, 72, 74, 77]), ('Dm7', 38, [69, 72, 74, 77]),
    ('F', 41, [69, 72, 77]), ('G', 43, [71, 74, 79]),
    ('Am', 45, [69, 72, 76]), ('Am', 45, [69, 72, 76]),
    ('Am', 45, [69, 72, 76]), ('C', 36, [72, 76, 79]),
    ('F', 41, [69, 72, 77]), ('G', 43, [71, 74, 79]),
    ('Dm7', 38, [69, 72, 74, 77]), ('E7', 40, [68, 71, 74, 76]),
    ('Am', 45, [69, 72, 76]), ('G', 43, [71, 74, 79]),
]

GINASIO_MEL = [
    [(69, 2), (72, 1), (74, 1), (76, 4), (None, 2), (76, 2), (74, 4)],
    [(72, 2), (69, 2), (None, 4), (67, 4), (69, 4)],
    [(74, 2), (77, 1), (79, 1), (77, 4), (None, 2), (74, 6)],
    [(72, 4), (74, 2), (72, 2), (69, 8)],
    [(77, 2), (81, 2), (79, 4), (None, 2), (77, 2), (76, 4)],
    [(79, 2), (76, 2), (74, 4), (71, 4), (74, 4)],
    [(76, 2), (74, 1), (72, 1), (69, 4), (None, 2), (69, 2), (72, 4)],
    [(71, 4), (69, 4), (None, 8)],
    [(81, 2), (79, 1), (77, 1), (76, 4), (None, 2), (76, 2), (72, 4)],
    [(79, 2), (76, 2), (72, 4), (None, 2), (76, 6)],
    [(77, 2), (79, 2), (81, 4), (None, 2), (79, 2), (77, 4)],
    [(79, 4), (74, 4), (71, 4), (79, 4)],
    [(77, 2), (74, 2), (72, 4), (74, 8)],
    [(76, 2), (80, 2), (83, 4), (None, 2), (80, 6)],
    [(81, 2), (79, 1), (77, 1), (76, 4), (72, 4), (69, 4)],
    [(71, 4), (74, 4), (79, 8)],
]


def kit_gym(song, bars):
    kick = song.track('kick808', 1, 0.95)
    snare = song.track('snare', 1, 0.9)
    clap = song.track('clap', 1, 0.7)
    hat = song.track('hat', 1, 0.7)
    crash = song.track('crash', 1, 0.6)
    tom = song.track('tom', 1, 0.8)
    for bar in range(bars):
        start = bar * SPB
        fill = bar % 8 == 7
        if bar % LOOP_BARS in (0, 8):
            crash.add(start, CRASH, 92, 4)
        for slot in (0, 7, 8, 11):
            kick.add(start + slot, KICK, 116 if slot in (0, 8) else 92, 1)
        for slot in (4, 12):
            snare.add(start + slot, SNARE, 108, 1)
            clap.add(start + slot, SNARE, 84, 1)
        for slot in range(0, SPB, 2):
            if fill and slot >= 10:
                continue
            hat.add(start + slot, OPEN_HAT if slot == 6 else HAT, 78 if slot % 4 == 0 else 54, 1)
        if fill:
            for i, note in enumerate(TOMS):
                tom.add(start + 10 + i * 1.5, note, 98, 1)


def ginasio():
    s = Song('ginasio', 'Quadra Coberta', 116)
    lad = ladder(69, MINOR_STEPS)
    lay_bass(s.track('bass', 0, 0.95), GINASIO_PROG, s.bars,
             [(0, 2, 0), (3, 1, 0), (4, 2, 12), (7, 1, 7), (8, 2, 0), (10, 2, 7), (12, 2, 12), (14, 2, None)])
    lay_comp(s.track('organ', 0, 0.5), GINASIO_PROG, s.bars, [(2, 2), (6, 2), (10, 2), (13, 3)], velocity=68)
    lay_chords(s.track('pad', 0, 0.3), GINASIO_PROG, s.bars, velocity=34)
    lay_every(s.track('tambourine', 0, 0.35), TAMB, s.bars, 4, velocity=40, accent=14, offset=2)
    lay_melody(s.track('brass', 0, 0.8), GINASIO_MEL, s.bars, velocity=94, accent=10)
    kit_gym(s, s.bars)
    lay_arp(s.track('saw', 2, 0.45), GINASIO_PROG, s.bars, [0, 1, 2, 1], rate=1, velocity=58, accent=16)
    lay_melody(s.track('square', 3, 0.4),
               [[(p if p is None else shift_diatonic(p, -2, lad), d) for p, d in bar] for bar in GINASIO_MEL],
               s.bars, velocity=70, accent=0)
    return s


ALL = [praia, menu, luau, ginasio]
