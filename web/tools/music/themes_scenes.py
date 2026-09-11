"""Os seis cenarios que tambem sao regra: cada um com seu compasso e sua paleta.

Nada aqui e enfeite solto. O compasso da tempestade e a frase da onda, o BPM
do rave e a janela de acerto, o filtro do fundo do mar abre com o rally. A
musica e a mesma regra vista pelo ouvido.
"""

from blobby_song import (
    LOOP_BARS, MINOR_STEPS, SPB, Song, ladder, lay_arp, lay_bass, lay_chords,
    lay_comp, lay_every, lay_melody, lay_pulse, shift_diatonic,
)
from themes import (
    AGOGO_HI, AGOGO_LOW, CONGA_HI, CONGA_LOW, CRASH, HAT, KICK, MARACAS,
    OPEN_HAT, RIDE, SHAKER, SNARE, STICK, TAMB, TOMS,
)

RAIL = 42
THUNDER = 30


# ============================================================ tempestade
# 6/8: doze semicolcheias por compasso. Quatro compassos fecham a frase, que e
# quanto dura uma onda no simulador — a quadra volta ao nivel quando a melodia
# volta ao inicio.

SPB6 = 12

TEMP_PROG = [
    ('Dm', 38, [62, 65, 69]), ('Dm', 38, [62, 65, 69]),
    ('Bb', 34, [62, 65, 70]), ('C', 36, [64, 67, 72]),
    ('Dm', 38, [62, 65, 69]), ('F', 41, [62, 65, 69]),
    ('Gm', 43, [62, 67, 70]), ('A', 33, [61, 64, 69]),
    ('Dm', 38, [62, 65, 69]), ('C', 36, [64, 67, 72]),
    ('Bb', 34, [62, 65, 70]), ('F', 41, [62, 65, 69]),
    ('Gm', 43, [62, 67, 70]), ('A', 33, [61, 64, 69]),
    ('Dm', 38, [62, 65, 69]), ('A', 33, [61, 64, 69]),
]

TEMP_MEL = [
    [(69, 3), (69, 3), (72, 3), (74, 3)],
    [(72, 6), (69, 3), (65, 3)],
    [(70, 3), (69, 3), (65, 3), (62, 3)],
    [(64, 6), (67, 6)],
    [(69, 3), (72, 3), (74, 3), (77, 3)],
    [(76, 6), (72, 3), (69, 3)],
    [(70, 3), (72, 3), (74, 3), (75, 3)],
    [(73, 6), (69, 6)],
    [(74, 3), (74, 3), (77, 3), (79, 3)],
    [(76, 6), (72, 6)],
    [(70, 3), (69, 3), (67, 3), (65, 3)],
    [(65, 6), (69, 6)],
    [(70, 3), (72, 3), (74, 3), (70, 3)],
    [(69, 6), (64, 6)],
    [(62, 3), (65, 3), (69, 3), (74, 3)],
    [(73, 6), (69, 6)],
]


def deck_kit(song, bars):
    kick = song.track('kick', 1, 0.9)
    tom = song.track('tom', 1, 0.85)
    stick = song.track('stick', 1, 0.7)
    tam = song.track('tambourine', 1, 0.55)
    for bar in range(bars):
        start = bar * SPB6
        kick.add(start, KICK, 112, 1)
        kick.add(start + 6, KICK, 96, 1)
        for slot in (3, 9):
            tom.add(start + slot, TOMS[1], 88, 1)
        stick.add(start + 4, STICK, 62, 1)
        stick.add(start + 10, STICK, 62, 1)
        for slot in range(0, SPB6, 3):
            tam.add(start + slot + 1, TAMB, 46, 1)


def tempestade():
    s = Song('tempestade', 'Sete Braças', 84, spb=SPB6)
    lad = ladder(62, MINOR_STEPS)
    lay_chords(s.track('pad', 0, 0.45), TEMP_PROG, s.bars, spb=SPB6, velocity=42, length=SPB6)
    lay_bass(s.track('bass', 0, 0.95), TEMP_PROG, s.bars, [(0, 3, 0), (3, 3, 7), (6, 3, 0), (9, 3, 12)], spb=SPB6)
    lay_comp(s.track('pluck', 0, 0.6), TEMP_PROG, s.bars, [(3, 3), (9, 3)], spb=SPB6, velocity=70)
    lay_melody(s.track('accordion', 0, 0.95), TEMP_MEL, s.bars, spb=SPB6, velocity=96, accent=10)
    deck_kit(s, s.bars)
    # violino dobra a melodia uma terca acima: e o que faz soar shanty e nao valsa
    lay_melody(s.track('violin', 2, 0.6),
               [[(p if p is None else shift_diatonic(p, 2, lad), d) for p, d in bar] for bar in TEMP_MEL],
               s.bars, spb=SPB6, velocity=74, accent=0)
    # tier 3: trovao no primeiro tempo, coro no quarto
    thunder = s.track('thunder', 3, 0.8)
    choir = s.track('pad', 3, 0.5)
    for bar in range(s.bars):
        start = bar * SPB6
        if bar % 2 == 0:
            thunder.add(start, THUNDER, 110, 6)
        _, _, tones = TEMP_PROG[bar % len(TEMP_PROG)]
        for pitch in tones:
            choir.add(start + 6, pitch + 12, 58, 6)
    return s


# ================================================================== rave
# House reto. O kick e o metronomo da regra: a janela de acerto vive nele.

RAVE_PROG = [
    ('Am', 45, [69, 72, 76]), ('Am', 45, [69, 72, 76]),
    ('F', 41, [69, 72, 77]), ('F', 41, [69, 72, 77]),
    ('C', 48, [72, 76, 79]), ('C', 48, [72, 76, 79]),
    ('G', 43, [71, 74, 79]), ('G', 43, [71, 74, 79]),
    ('Am', 45, [69, 72, 76]), ('Am', 45, [69, 72, 76]),
    ('Dm', 38, [69, 72, 74]), ('Dm', 38, [69, 72, 74]),
    ('F', 41, [69, 72, 77]), ('G', 43, [71, 74, 79]),
    ('Am', 45, [69, 72, 76]), ('E', 40, [68, 71, 76]),
]

RAVE_MEL = [
    [(81, 2), (None, 2), (81, 2), (79, 2), (76, 4), (None, 4)],
    [(76, 2), (79, 2), (81, 4), (None, 8)],
    [(77, 2), (None, 2), (77, 2), (81, 2), (84, 4), (None, 4)],
    [(81, 4), (77, 4), (None, 8)],
    [(84, 2), (None, 2), (83, 2), (81, 2), (79, 4), (None, 4)],
    [(79, 2), (76, 2), (72, 4), (None, 8)],
    [(83, 2), (None, 2), (83, 2), (86, 2), (88, 4), (None, 4)],
    [(86, 4), (83, 4), (None, 8)],
    [(81, 2), (84, 2), (88, 2), (84, 2), (81, 4), (None, 4)],
    [(79, 2), (81, 2), (84, 4), (None, 8)],
    [(86, 2), (None, 2), (86, 2), (84, 2), (81, 4), (None, 4)],
    [(81, 4), (77, 4), (None, 8)],
    [(84, 2), (81, 2), (77, 2), (81, 2), (83, 4), (None, 4)],
    [(86, 2), (83, 2), (79, 4), (None, 8)],
    [(81, 2), (84, 2), (88, 2), (91, 2), (88, 8)],
    [(83, 4), (80, 4), (76, 8)],
]


def house_kit(song, bars):
    kick = song.track('kick808', 0, 1.0)
    hat = song.track('hat', 0, 0.65)
    clap = song.track('clap', 1, 0.85)
    ohat = song.track('hat', 1, 0.5)
    crash = song.track('crash', 1, 0.6)
    ride = song.track('ride', 2, 0.4)
    for bar in range(bars):
        start = bar * SPB
        # four on the floor: o beat da regra e este, nao a melodia
        for slot in (0, 4, 8, 12):
            kick.add(start + slot, KICK, 120, 1)
        for slot in (2, 6, 10, 14):
            hat.add(start + slot, HAT, 56, 1)
        for slot in (4, 12):
            clap.add(start + slot, SNARE, 100, 1)
        for slot in (6, 14):
            ohat.add(start + slot, OPEN_HAT, 62, 1)
        if bar % 8 == 0:
            crash.add(start, CRASH, 96, 4)
        for slot in range(1, SPB, 2):
            ride.add(start + slot, RIDE, 44, 1)


def rave():
    s = Song('rave', 'Cobertura 4AM', 124)
    lad = ladder(69, MINOR_STEPS)
    house_kit(s, s.bars)
    lay_bass(s.track('sub', 0, 1.0), RAVE_PROG, s.bars,
             [(0, 2, -12), (4, 2, -12), (7, 1, -5), (8, 2, -12), (12, 2, -12), (15, 1, None)])
    lay_chords(s.track('pad', 0, 0.4), RAVE_PROG, s.bars, velocity=40)
    lay_comp(s.track('pluck', 1, 0.7), RAVE_PROG, s.bars, [(2, 2), (6, 2), (10, 2), (14, 2)], velocity=76)
    lay_arp(s.track('saw', 2, 0.55), RAVE_PROG, s.bars, [0, 1, 2, 3, 2, 1], velocity=62, accent=18)
    lay_melody(s.track('square', 2, 0.6), RAVE_MEL, s.bars, velocity=88, accent=8)
    lay_melody(s.track('brass', 3, 0.55),
               [[(p if p is None else shift_diatonic(p, -2, lad), d) for p, d in bar] for bar in RAVE_MEL],
               s.bars, velocity=80, accent=0)
    lay_every(s.track('shaker', 3, 0.3), SHAKER, s.bars, 1, velocity=30, accent=12)
    return s


# ============================================================ fundo do mar
# Devagar, grave e sem ataque. Quem abre o filtro e o rally, no motor; aqui a
# musica so precisa ter grave o bastante pra sobrar alguma coisa quando fecha.

FUNDO_PROG = [
    ('Em', 40, [64, 67, 71]), ('Em', 40, [64, 67, 71]),
    ('Cmaj7', 36, [64, 67, 71]), ('Cmaj7', 36, [64, 67, 71]),
    ('Am', 33, [64, 69, 72]), ('Am', 33, [64, 69, 72]),
    ('Bm', 35, [66, 69, 71]), ('Bm', 35, [66, 69, 71]),
    ('Em', 40, [64, 67, 71]), ('G', 43, [62, 67, 71]),
    ('Cmaj7', 36, [64, 67, 71]), ('D', 38, [66, 69, 74]),
    ('Am', 33, [64, 69, 72]), ('Bm', 35, [66, 69, 71]),
    ('Em', 40, [64, 67, 71]), ('Em', 40, [64, 67, 71]),
]

FUNDO_MEL = [
    [(76, 8), (79, 8)],
    [(78, 6), (76, 10)],
    [(74, 8), (71, 8)],
    [(72, 16)],
    [(69, 8), (72, 8)],
    [(76, 12), (74, 4)],
    [(71, 8), (74, 8)],
    [(78, 16)],
    [(79, 8), (83, 8)],
    [(81, 6), (79, 10)],
    [(76, 8), (72, 8)],
    [(74, 16)],
    [(72, 8), (69, 8)],
    [(71, 12), (74, 4)],
    [(76, 8), (79, 8)],
    [(76, 16)],
]


def fundo():
    s = Song('fundo', 'Atlântida', 76)
    lad = ladder(64, MINOR_STEPS)
    lay_chords(s.track('pad', 0, 0.7), FUNDO_PROG, s.bars, velocity=50)
    lay_bass(s.track('sub', 0, 0.9), FUNDO_PROG, s.bars, [(0, 8, 0), (8, 8, 0)])
    lay_melody(s.track('whistle', 0, 0.55), FUNDO_MEL, s.bars, velocity=64, accent=4)
    lay_arp(s.track('harp', 0, 0.45), FUNDO_PROG, s.bars, [0, 1, 2, 3, 2, 1], rate=2, velocity=48, accent=10)
    # canto da baleia: uma nota grave da tonalidade, uma vez a cada quatro compassos
    whale = s.track('sub', 1, 0.7)
    for bar in range(0, s.bars, 4):
        _, root, _ = FUNDO_PROG[bar % len(FUNDO_PROG)]
        whale.add(bar * SPB + 2, root - 12, 84, 24)
    lay_every(s.track('maracas', 1, 0.22), MARACAS, s.bars, 4, velocity=26, accent=8)
    lay_comp(s.track('bell', 2, 0.4), FUNDO_PROG, s.bars, [(4, 4), (12, 4)], velocity=58)
    lay_melody(s.track('marimba', 3, 0.4),
               [[(p if p is None else shift_diatonic(p, -2, lad), d) for p, d in bar] for bar in FUNDO_MEL],
               s.bars, velocity=62, accent=0)
    return s


# ============================================================= topo do trem
# Banjo, gaita e o tec-tec do trilho no lugar do chimbal.

TREM_PROG = [
    ('G', 43, [67, 71, 74]), ('G', 43, [67, 71, 74]),
    ('C', 48, [67, 72, 76]), ('C', 48, [67, 72, 76]),
    ('G', 43, [67, 71, 74]), ('Em', 40, [67, 71, 76]),
    ('D', 38, [66, 69, 74]), ('D', 38, [66, 69, 74]),
    ('G', 43, [67, 71, 74]), ('C', 48, [67, 72, 76]),
    ('G', 43, [67, 71, 74]), ('Em', 40, [67, 71, 76]),
    ('C', 48, [67, 72, 76]), ('D', 38, [66, 69, 74]),
    ('G', 43, [67, 71, 74]), ('D', 38, [66, 69, 74]),
]

TREM_MEL = [
    [(74, 2), (76, 2), (79, 4), (76, 2), (74, 2), (71, 4)],
    [(74, 4), (71, 4), (67, 8)],
    [(72, 2), (76, 2), (79, 4), (81, 4), (79, 4)],
    [(76, 4), (72, 4), (74, 8)],
    [(79, 2), (78, 2), (79, 4), (74, 4), (71, 4)],
    [(76, 2), (74, 2), (71, 4), (67, 8)],
    [(69, 2), (71, 2), (74, 4), (78, 4), (81, 4)],
    [(78, 4), (74, 4), (69, 8)],
    [(74, 2), (79, 2), (83, 4), (81, 2), (79, 2), (76, 4)],
    [(79, 4), (76, 4), (72, 8)],
    [(74, 2), (76, 2), (79, 4), (76, 4), (71, 4)],
    [(72, 4), (76, 4), (79, 8)],
    [(81, 2), (79, 2), (76, 4), (72, 4), (76, 4)],
    [(78, 4), (74, 4), (69, 8)],
    [(71, 2), (74, 2), (79, 4), (83, 4), (79, 4)],
    [(78, 8), (74, 8)],
]


def rail_kit(song, bars):
    rail = song.track('rail', 0, 0.55)
    kick = song.track('kick', 1, 0.85)
    snare = song.track('snare', 1, 0.8)
    stick = song.track('stick', 1, 0.6)
    for bar in range(bars):
        start = bar * SPB
        # tec-tec: dois golpes juntos e um vao, igual dormente passando
        for slot in (0, 1, 4, 5, 8, 9, 12, 13):
            rail.add(start + slot, RAIL, 58 if slot % 4 == 0 else 40, 1)
        for slot in (0, 8):
            kick.add(start + slot, KICK, 108, 1)
        for slot in (4, 12):
            snare.add(start + slot, SNARE, 98, 1)
        stick.add(start + 10, STICK, 54, 1)


def trem():
    s = Song('trem', 'Vagão Aberto', 132)
    lad = ladder(67)
    lay_bass(s.track('bass', 0, 0.9), TREM_PROG, s.bars,
             [(0, 4, 0), (4, 4, 7), (8, 4, 0), (12, 2, 12), (14, 2, None)])
    lay_comp(s.track('banjo', 0, 0.75), TREM_PROG, s.bars,
             [(0, 1), (2, 1), (4, 1), (6, 1), (8, 1), (10, 1), (12, 1), (14, 1)], velocity=72)
    rail_kit(s, s.bars)
    lay_melody(s.track('accordion', 0, 0.85), TREM_MEL, s.bars, velocity=92, accent=10)
    lay_chords(s.track('pad', 1, 0.3), TREM_PROG, s.bars, velocity=34)
    lay_arp(s.track('banjo', 2, 0.5), TREM_PROG, s.bars, [0, 2, 1, 3], velocity=58, accent=14)
    # apito do trem: uma nota longa e dissonante no fim da frase
    horn = s.track('brass', 3, 0.6)
    for bar in range(3, s.bars, 4):
        horn.add(bar * SPB + 12, 74, 92, 4)
        horn.add(bar * SPB + 12, 79, 84, 4)
    lay_melody(s.track('violin', 3, 0.45),
               [[(p if p is None else shift_diatonic(p, 2, lad), d) for p, d in bar] for bar in TREM_MEL],
               s.bars, velocity=68, accent=0)
    return s


# ================================================================ game boy
# Tres vozes e um ruido, como no console. O arpejo dobra de taxa a cada tier:
# e a unica coisa que muda, e ja soa como o jogo apertando.

GB_PROG = [
    ('Am', 45, [69, 72, 76]), ('G', 43, [67, 71, 74]),
    ('F', 41, [65, 69, 72]), ('E', 40, [64, 68, 71]),
    ('Am', 45, [69, 72, 76]), ('G', 43, [67, 71, 74]),
    ('F', 41, [65, 69, 72]), ('E', 40, [64, 68, 71]),
    ('Dm', 38, [62, 65, 69]), ('E', 40, [64, 68, 71]),
    ('Am', 45, [69, 72, 76]), ('C', 48, [72, 76, 79]),
    ('Dm', 38, [62, 65, 69]), ('E', 40, [64, 68, 71]),
    ('Am', 45, [69, 72, 76]), ('E', 40, [64, 68, 71]),
]

GB_MEL = [
    [(81, 2), (84, 2), (88, 2), (84, 2), (81, 4), (79, 4)],
    [(79, 2), (83, 2), (86, 2), (83, 2), (79, 8)],
    [(77, 2), (81, 2), (84, 2), (81, 2), (77, 4), (76, 4)],
    [(76, 2), (80, 2), (83, 2), (80, 2), (76, 8)],
    [(81, 2), (88, 2), (84, 2), (81, 2), (84, 4), (88, 4)],
    [(86, 2), (83, 2), (79, 2), (83, 2), (86, 8)],
    [(84, 2), (81, 2), (77, 2), (81, 2), (84, 4), (89, 4)],
    [(88, 2), (83, 2), (80, 2), (83, 2), (88, 8)],
    [(86, 2), (81, 2), (77, 2), (74, 2), (77, 4), (81, 4)],
    [(83, 2), (80, 2), (76, 2), (80, 2), (83, 8)],
    [(81, 2), (84, 2), (88, 2), (93, 2), (88, 4), (84, 4)],
    [(84, 2), (88, 2), (91, 2), (88, 2), (84, 8)],
    [(86, 2), (89, 2), (86, 2), (81, 2), (77, 4), (74, 4)],
    [(76, 2), (80, 2), (83, 2), (87, 2), (83, 8)],
    [(81, 2), (84, 2), (88, 2), (84, 2), (81, 4), (76, 4)],
    [(80, 4), (83, 4), (80, 4), (76, 4)],
]


def gameboy():
    s = Song('gameboy', 'Cartucho', 150)
    lay_bass(s.track('tri', 0, 1.0), GB_PROG, s.bars,
             [(0, 2, -12), (2, 2, -12), (4, 2, -5), (6, 2, -12), (8, 2, -12), (10, 2, -12), (12, 2, -5), (14, 2, None)])
    lay_melody(s.track('pulse', 0, 0.85), GB_MEL, s.bars, velocity=98, accent=8)
    noise = s.track('chipnoise', 0, 0.45)
    for bar in range(s.bars):
        start = bar * SPB
        for slot in (4, 12):
            noise.add(start + slot, 62, 82, 1)
        for slot in (2, 6, 10, 14):
            noise.add(start + slot, 74, 40, 1)
    # o arpejo dobra a cada camada: 1 nota por tempo, 2, depois 4
    lay_arp(s.track('square', 1, 0.4), GB_PROG, s.bars, [0, 1, 2, 3], rate=4, velocity=60, accent=14)
    lay_arp(s.track('square', 2, 0.4), GB_PROG, s.bars, [0, 1, 2, 3, 2, 1], rate=2, velocity=56, accent=14)
    lay_arp(s.track('square', 3, 0.34), GB_PROG, s.bars, [0, 1, 2, 3, 2, 1, 2, 3], rate=1, velocity=50, accent=12)
    return s


# ================================================================= nuvens
# Valsa em 3/4 — doze semicolcheias. Nos tiers altos a mesma harmonia vira
# galope: o mesmo tema, so que correndo.

NUV_PROG = [
    ('C', 48, [72, 76, 79]), ('Am', 45, [69, 72, 76]),
    ('F', 41, [69, 72, 77]), ('G', 43, [71, 74, 79]),
    ('C', 48, [72, 76, 79]), ('Em', 40, [71, 76, 79]),
    ('F', 41, [69, 72, 77]), ('G', 43, [71, 74, 79]),
    ('Am', 45, [69, 72, 76]), ('Em', 40, [71, 76, 79]),
    ('F', 41, [69, 72, 77]), ('C', 48, [72, 76, 79]),
    ('Dm', 38, [69, 72, 74]), ('G', 43, [71, 74, 79]),
    ('C', 48, [72, 76, 79]), ('G', 43, [71, 74, 79]),
]

NUV_MEL = [
    [(79, 4), (84, 4), (83, 4)],
    [(81, 4), (79, 4), (76, 4)],
    [(77, 4), (81, 4), (84, 4)],
    [(83, 8), (79, 4)],
    [(76, 4), (79, 4), (84, 4)],
    [(88, 4), (83, 4), (79, 4)],
    [(81, 4), (84, 4), (81, 4)],
    [(79, 8), (74, 4)],
    [(81, 4), (76, 4), (72, 4)],
    [(76, 4), (79, 4), (83, 4)],
    [(84, 4), (81, 4), (77, 4)],
    [(76, 8), (72, 4)],
    [(74, 4), (77, 4), (81, 4)],
    [(83, 4), (79, 4), (74, 4)],
    [(72, 4), (76, 4), (79, 4)],
    [(83, 8), (79, 4)],
]


def nuvens():
    s = Song('nuvens', 'A Lua Sobe', 108, spb=SPB6)
    lad = ladder(72)
    # baixo no 1, acorde no 2 e no 3: a valsa inteira mora nesta linha
    lay_bass(s.track('bass', 0, 0.8), NUV_PROG, s.bars, [(0, 4, -12)], spb=SPB6)
    lay_comp(s.track('harp', 0, 0.6), NUV_PROG, s.bars, [(4, 3), (8, 3)], spb=SPB6, velocity=64)
    lay_chords(s.track('pad', 0, 0.4), NUV_PROG, s.bars, spb=SPB6, velocity=38, length=SPB6)
    lay_melody(s.track('whistle', 0, 0.8), NUV_MEL, s.bars, spb=SPB6, velocity=88, accent=8)
    lay_comp(s.track('bell', 1, 0.35), NUV_PROG, s.bars, [(0, 2)], spb=SPB6, velocity=54)
    lay_arp(s.track('harp', 2, 0.45), NUV_PROG, s.bars, [0, 1, 2, 3, 2, 1], spb=SPB6, rate=1, velocity=52, accent=14)
    # galope: tres semicolcheias por tempo no lugar da valsa arrastada
    gal_k = s.track('kick', 3, 0.85)
    gal_t = s.track('tom', 3, 0.7)
    for bar in range(s.bars):
        start = bar * SPB6
        for beat in range(3):
            b = start + beat * 4
            gal_k.add(b, KICK, 106 if beat == 0 else 88, 1)
            gal_t.add(b + 2, TOMS[2], 74, 1)
            gal_t.add(b + 3, TOMS[3], 66, 1)
    lay_melody(s.track('violin', 3, 0.5),
               [[(p if p is None else shift_diatonic(p, 2, lad), d) for p, d in bar] for bar in NUV_MEL],
               s.bars, spb=SPB6, velocity=72, accent=0)
    return s


ALL = [tempestade, rave, fundo, trem, gameboy, nuvens]
