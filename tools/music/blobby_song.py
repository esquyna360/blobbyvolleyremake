"""Biblioteca de composicao do Blobby.

Cada tema declara harmonia, melodia e padroes; daqui sai o JSON que o jogo
toca com o sintetizador proprio. Sem MP3: o andamento e uma variavel e as
camadas ligam por tier, entao a musica acelera junto com o rally.

Formato de saida, um arquivo por tema em public/music/<id>.json:

    { id, title, bpm, bars, spb, tracks: [ { v, tier, gain, n: [...] } ] }

`n` e uma lista plana de quatro numeros por nota: passo, pitch MIDI,
velocity 0..127 e duracao em passos. Um passo e uma semicolcheia e dura
15 / bpm segundos.
"""

import json
from pathlib import Path

SPB = 16
LOOP_BARS = 16

SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11]
MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]


def ladder(root_pitch, steps=None):
    """Escada diatonica em varias oitavas, pra transpor sem sair do tom."""
    steps = steps or SCALE_STEPS
    base = root_pitch % 12
    return [base + 12 * octave + s for octave in range(10) for s in steps]


def shift_diatonic(pitch, amount, lad):
    nearest = min(range(len(lad)), key=lambda i: abs(lad[i] - pitch))
    return lad[max(0, min(len(lad) - 1, nearest + amount))]


class Track:
    """Uma voz num tier. O motor liga o tier inteiro, nunca uma nota solta."""

    def __init__(self, voice, tier, gain=1.0):
        self.voice = voice
        self.tier = tier
        self.gain = gain
        self.notes = []

    def add(self, step, pitch, velocity, length):
        self.notes.append((round(step, 3), int(pitch), int(max(1, min(127, velocity))), round(length, 2)))

    def data(self):
        flat = []
        for step, pitch, velocity, length in sorted(self.notes):
            flat += [step, pitch, velocity, length]
        return {'v': self.voice, 'tier': self.tier, 'gain': round(self.gain, 3), 'n': flat}


class Song:
    def __init__(self, song_id, title, bpm, bars=LOOP_BARS, spb=SPB):
        self.id = song_id
        self.title = title
        self.bpm = bpm
        self.bars = bars
        self.spb = spb
        self.tracks = []

    def track(self, voice, tier, gain=1.0):
        t = Track(voice, tier, gain)
        self.tracks.append(t)
        return t

    def data(self):
        return {
            'id': self.id,
            'title': self.title,
            'bpm': self.bpm,
            'bars': self.bars,
            'spb': self.spb,
            'tracks': [t.data() for t in self.tracks if t.notes],
        }

    def write(self, out_dir):
        path = Path(out_dir) / f'{self.id}.json'
        path.write_text(json.dumps(self.data(), separators=(',', ':')))
        notes = sum(len(t.notes) for t in self.tracks)
        return path, notes, len(path.read_text())


# ---------------------------------------------------------------- construtores

def lay_melody(track, melody_by_bar, bars, spb=SPB, velocity=100, accent=8, transpose=0):
    """Melodia por compasso: lista de (pitch|None, duracao em passos)."""
    for bar in range(bars):
        line = melody_by_bar[bar % len(melody_by_bar)]
        start = bar * spb
        slot = 0
        for pitch, length in line:
            if pitch is not None:
                v = velocity + accent if slot == 0 else velocity
                track.add(start + slot, pitch + transpose, v, length)
            slot += length


def lay_chords(track, progression, bars, spb=SPB, velocity=54, transpose=-12, length=None):
    """Acorde inteiro sustentado no compasso."""
    for bar in range(bars):
        _, _, tones = progression[bar % len(progression)]
        start = bar * spb
        for pitch in tones:
            track.add(start, pitch + transpose, velocity, length or spb)


def lay_bass(track, progression, bars, pattern, spb=SPB):
    """Padrao de baixo: (slot, duracao, intervalo). Intervalo None = nota de
    aproximacao pro acorde seguinte."""
    for bar in range(bars):
        _, root, _ = progression[bar % len(progression)]
        _, next_root, _ = progression[(bar + 1) % len(progression)]
        start = bar * spb
        for slot, length, interval in pattern:
            pitch = next_root - 2 if interval is None else root + interval
            track.add(start + slot, pitch, 108 if slot % 4 == 0 else 92, length)


def lay_comp(track, progression, bars, pattern, spb=SPB, voices=3, transpose=0, velocity=84):
    """Acompanhamento ritmico: (slot, duracao) tocando o acorde do compasso."""
    for bar in range(bars):
        _, _, tones = progression[bar % len(progression)]
        start = bar * spb
        for slot, length in pattern:
            v = velocity if slot in (0, spb // 2) else velocity - 18
            for i, pitch in enumerate(tones[:voices]):
                track.add(start + slot, pitch + transpose, v - i * 6, length)


def lay_arp(track, progression, bars, contour, spb=SPB, rate=1, transpose=-12, velocity=66, accent=18):
    """Arpejo contínuo. `contour` indexa as notas do acorde estendido."""
    for bar in range(bars):
        _, _, tones = progression[bar % len(progression)]
        extended = list(tones) + [tones[0] + 12]
        start = bar * spb
        slots = int(spb / rate)
        for i in range(slots):
            pitch = extended[contour[i % len(contour)] % len(extended)]
            v = velocity + accent if (i * rate) % 4 == 0 else velocity
            track.add(start + i * rate, pitch + transpose, v, rate)


def lay_pulse(track, pitch, bars, slots, spb=SPB, velocity=80, length=1, accent_every=4, accent=22):
    """Percussao por slots fixos no compasso."""
    for bar in range(bars):
        start = bar * spb
        for slot in slots:
            v = velocity + accent if slot % accent_every == 0 else velocity
            track.add(start + slot, pitch, v, length)


def lay_every(track, pitch, bars, step, spb=SPB, velocity=60, length=1, accent=20, offset=0):
    for bar in range(bars):
        start = bar * spb
        for slot in range(offset, spb, step):
            v = velocity + accent if slot % 4 == 0 else velocity
            track.add(start + slot, pitch, v, length)
