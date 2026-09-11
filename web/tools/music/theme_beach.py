import struct
import subprocess
import wave
from pathlib import Path

import numpy as np

PULSES_PER_QUARTER = 480
SIXTEENTH = PULSES_PER_QUARTER // 4
BAR_TICKS = PULSES_PER_QUARTER * 4
BASE_TEMPO_BPM = 112
LOOP_BARS = 16
OUTPUT_DIR = Path(__file__).resolve().parent
SAMPLE_RATE = 44100

DRUM_CHANNEL = 9
LEAD_CHANNEL = 0
BASS_CHANNEL = 1
MARIMBA_CHANNEL = 2
HARMONY_CHANNEL = 3
PAD_CHANNEL = 4
ARP_CHANNEL = 5

PROGRAM_STEEL_DRUMS = 114
PROGRAM_MARIMBA = 12
PROGRAM_SYNTH_BASS = 38
PROGRAM_SQUARE_LEAD = 80
PROGRAM_SAW_LEAD = 81
PROGRAM_WARM_PAD = 89

KICK, SNARE, SIDE_STICK = 36, 38, 37
CLOSED_HAT, OPEN_HAT, PEDAL_HAT = 42, 46, 44
CRASH, RIDE, TAMBOURINE = 49, 51, 54
HI_CONGA, LOW_CONGA, MARACAS, SHAKER = 63, 64, 70, 82
HI_AGOGO, LOW_AGOGO = 67, 68
TOM_RUN = [50, 48, 47, 45]

SCALE_STEPS_FROM_ROOT = [0, 2, 4, 5, 7, 9, 11]
LOWEST_A = 21
DIATONIC_LADDER = [LOWEST_A + 12 * octave + step for octave in range(9) for step in SCALE_STEPS_FROM_ROOT]

PROGRESSION = [
    ("A", 45, [69, 73, 76]),
    ("F#m", 42, [66, 69, 73]),
    ("D", 38, [66, 69, 74]),
    ("E", 40, [64, 68, 71]),
    ("A", 45, [69, 73, 76]),
    ("F#m", 42, [66, 69, 73]),
    ("Bm7", 47, [66, 69, 71, 74]),
    ("E7", 40, [64, 68, 71, 74]),
    ("D", 38, [66, 69, 74]),
    ("E", 40, [64, 68, 71]),
    ("C#m", 49, [64, 68, 73]),
    ("F#m", 42, [66, 69, 73]),
    ("D", 38, [66, 69, 74]),
    ("E", 40, [64, 68, 71]),
    ("A", 45, [69, 73, 76]),
    ("E7", 40, [64, 68, 71, 74]),
]

MELODY_BY_BAR = [
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

BASS_SLOT_PATTERN = [(0, 2, 0), (2, 2, 0), (4, 2, 12), (6, 2, 0), (8, 2, 7), (10, 2, 0), (12, 2, 12), (14, 2, None)]
MARIMBA_SLOT_PATTERN = [(0, 2), (3, 3), (6, 2), (8, 2), (11, 3), (14, 2)]
ARP_CONTOUR = [0, 1, 2, 3, 2, 1]


def assert_bars_are_complete():
    for index, bar in enumerate(MELODY_BY_BAR):
        total = sum(duration for _, duration in bar)
        if total != 16:
            raise ValueError(f"bar {index + 1} has {total} sixteenths")


def shift_diatonic(pitch, steps):
    nearest = min(range(len(DIATONIC_LADDER)), key=lambda i: abs(DIATONIC_LADDER[i] - pitch))
    target = max(0, min(len(DIATONIC_LADDER) - 1, nearest + steps))
    return DIATONIC_LADDER[target]


def variable_length(value):
    encoded = bytearray([value & 0x7F])
    value >>= 7
    while value:
        encoded.insert(0, (value & 0x7F) | 0x80)
        value >>= 7
    return bytes(encoded)


class MidiTrack:
    NOTE_OFF_ORDER = 1
    NOTE_ON_ORDER = 2

    def __init__(self, name):
        self.events = []
        self.notes = []
        self.add_meta(0, 0x03, name.encode("latin-1"))

    def add_meta(self, tick, kind, data):
        payload = bytes([0xFF, kind]) + variable_length(len(data)) + data
        self.events.append((tick, 0, payload))

    def set_tempo(self, tick, beats_per_minute):
        microseconds = int(round(60_000_000 / beats_per_minute))
        self.add_meta(tick, 0x51, microseconds.to_bytes(3, "big"))

    def set_time_signature(self, tick, numerator, denominator_power):
        self.add_meta(tick, 0x58, bytes([numerator, denominator_power, 24, 8]))

    def set_program(self, channel, program):
        self.events.append((0, 0, bytes([0xC0 | channel, program])))

    def set_controller(self, channel, controller, value):
        self.events.append((0, 0, bytes([0xB0 | channel, controller, value])))

    def add_note(self, tick, channel, pitch, velocity, duration, voice="square"):
        gate = max(1, int(duration * 0.94))
        self.events.append((tick, self.NOTE_ON_ORDER, bytes([0x90 | channel, pitch, velocity])))
        self.events.append((tick + gate, self.NOTE_OFF_ORDER, bytes([0x80 | channel, pitch, 0])))
        self.notes.append((tick, pitch, velocity, gate, voice))

    def serialize(self):
        body = bytearray()
        previous_tick = 0
        for tick, _, payload in sorted(self.events, key=lambda event: (event[0], event[1])):
            body += variable_length(tick - previous_tick)
            body += payload
            previous_tick = tick
        body += variable_length(0) + b"\xFF\x2F\x00"
        return b"MTrk" + struct.pack(">I", len(body)) + bytes(body)


def build_conductor(name, tempo_curve):
    track = MidiTrack(name)
    track.set_time_signature(0, 4, 2)
    for bar_index, beats_per_minute in enumerate(tempo_curve):
        track.set_tempo(bar_index * BAR_TICKS, beats_per_minute)
    return track


def build_bass(bars):
    track = MidiTrack("TIER0 BASS")
    track.set_program(BASS_CHANNEL, PROGRAM_SYNTH_BASS)
    track.set_controller(BASS_CHANNEL, 7, 104)
    track.set_controller(BASS_CHANNEL, 10, 64)
    for bar_index in range(bars):
        chord = PROGRESSION[bar_index % LOOP_BARS]
        following = PROGRESSION[(bar_index + 1) % LOOP_BARS]
        root = chord[1]
        approach = following[1] - 2
        bar_start = bar_index * BAR_TICKS
        for slot, length, interval in BASS_SLOT_PATTERN:
            pitch = approach if interval is None else root + interval
            velocity = 108 if slot % 4 == 0 else 92
            track.add_note(bar_start + slot * SIXTEENTH, BASS_CHANNEL, pitch, velocity, length * SIXTEENTH, "bass")
    return track


def build_pad(bars):
    track = MidiTrack("TIER0 PAD")
    track.set_program(PAD_CHANNEL, PROGRAM_WARM_PAD)
    track.set_controller(PAD_CHANNEL, 7, 62)
    track.set_controller(PAD_CHANNEL, 10, 64)
    track.set_controller(PAD_CHANNEL, 91, 96)
    for bar_index in range(bars):
        chord = PROGRESSION[bar_index % LOOP_BARS]
        bar_start = bar_index * BAR_TICKS
        for pitch in chord[2]:
            track.add_note(bar_start, PAD_CHANNEL, pitch - 12, 54, BAR_TICKS, "pad")
    return track


def build_marimba(bars):
    track = MidiTrack("TIER0 MARIMBA")
    track.set_program(MARIMBA_CHANNEL, PROGRAM_MARIMBA)
    track.set_controller(MARIMBA_CHANNEL, 7, 88)
    track.set_controller(MARIMBA_CHANNEL, 10, 48)
    for bar_index in range(bars):
        chord = PROGRESSION[bar_index % LOOP_BARS]
        bar_start = bar_index * BAR_TICKS
        for slot, length in MARIMBA_SLOT_PATTERN:
            velocity = 92 if slot in (0, 8) else 74
            for offset, pitch in enumerate(chord[2][:3]):
                track.add_note(bar_start + slot * SIXTEENTH, MARIMBA_CHANNEL, pitch, velocity - offset * 6, length * SIXTEENTH, "marimba")
    return track


def build_shaker(bars):
    track = MidiTrack("TIER0 SHAKER")
    track.set_controller(DRUM_CHANNEL, 7, 100)
    for bar_index in range(bars):
        bar_start = bar_index * BAR_TICKS
        for slot in range(16):
            velocity = 66 if slot % 2 == 0 else 42
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, SHAKER, velocity, SIXTEENTH, "shaker")
    return track


def build_lead(bars):
    track = MidiTrack("TIER0 LEAD STEELDRUM")
    track.set_program(LEAD_CHANNEL, PROGRAM_STEEL_DRUMS)
    track.set_controller(LEAD_CHANNEL, 7, 110)
    track.set_controller(LEAD_CHANNEL, 10, 70)
    track.set_controller(LEAD_CHANNEL, 91, 64)
    for bar_index in range(bars):
        bar = MELODY_BY_BAR[bar_index % LOOP_BARS]
        bar_start = bar_index * BAR_TICKS
        slot = 0
        for pitch, length in bar:
            if pitch is not None:
                velocity = 104 if slot == 0 else 96
                track.add_note(bar_start + slot * SIXTEENTH, LEAD_CHANNEL, pitch, velocity, length * SIXTEENTH, "steeldrum")
            slot += length
    return track


def build_harmony(bars):
    track = MidiTrack("TIER3 HARMONY SQUARE")
    track.set_program(HARMONY_CHANNEL, PROGRAM_SQUARE_LEAD)
    track.set_controller(HARMONY_CHANNEL, 7, 74)
    track.set_controller(HARMONY_CHANNEL, 10, 88)
    for bar_index in range(bars):
        bar = MELODY_BY_BAR[bar_index % LOOP_BARS]
        bar_start = bar_index * BAR_TICKS
        slot = 0
        for pitch, length in bar:
            if pitch is not None:
                track.add_note(bar_start + slot * SIXTEENTH, HARMONY_CHANNEL, shift_diatonic(pitch, -2), 78, length * SIXTEENTH, "square")
            slot += length
    return track


def build_arp(bars):
    track = MidiTrack("TIER2 ARP DRIVE")
    track.set_program(ARP_CHANNEL, PROGRAM_SAW_LEAD)
    track.set_controller(ARP_CHANNEL, 7, 70)
    track.set_controller(ARP_CHANNEL, 10, 84)
    for bar_index in range(bars):
        chord = PROGRESSION[bar_index % LOOP_BARS]
        extended = chord[2] + [chord[2][0] + 12]
        bar_start = bar_index * BAR_TICKS
        for slot in range(16):
            pitch = extended[ARP_CONTOUR[slot % len(ARP_CONTOUR)] % len(extended)] - 12
            velocity = 84 if slot % 4 == 0 else 66
            track.add_note(bar_start + slot * SIXTEENTH, ARP_CHANNEL, pitch, velocity, SIXTEENTH, "saw")
    return track


def build_kit(bars):
    track = MidiTrack("TIER1 DRUMS KIT")
    for bar_index in range(bars):
        bar_start = bar_index * BAR_TICKS
        is_fill_bar = bar_index % 8 == 7
        if bar_index % LOOP_BARS in (0, 8):
            track.add_note(bar_start, DRUM_CHANNEL, CRASH, 96, SIXTEENTH * 4, "crash")
        for slot in (0, 6, 8, 14):
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, KICK, 112 if slot in (0, 8) else 96, SIXTEENTH, "kick")
        for slot in (4, 12):
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, SNARE, 104, SIXTEENTH, "snare")
        track.add_note(bar_start + 10 * SIXTEENTH, DRUM_CHANNEL, SIDE_STICK, 58, SIXTEENTH, "stick")
        for slot in range(0, 16, 2):
            if is_fill_bar and slot >= 12:
                continue
            note = OPEN_HAT if slot == 14 else CLOSED_HAT
            velocity = 80 if slot % 4 == 0 else 58
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, note, velocity, SIXTEENTH, "hat")
        if is_fill_bar:
            for offset, note in enumerate(TOM_RUN):
                track.add_note(bar_start + (12 + offset) * SIXTEENTH, DRUM_CHANNEL, note, 100, SIXTEENTH, "tom")
    return track


def build_congas(bars):
    track = MidiTrack("TIER1 CONGAS")
    for bar_index in range(bars):
        bar_start = bar_index * BAR_TICKS
        for slot in (0, 7, 12):
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, HI_CONGA, 82, SIXTEENTH, "conga_hi")
        for slot in (4, 10):
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, LOW_CONGA, 76, SIXTEENTH, "conga_low")
        for slot in (2, 6, 10, 14):
            track.add_note(bar_start + slot * SIXTEENTH, DRUM_CHANNEL, MARACAS, 62, SIXTEENTH, "maracas")
        track.add_note(bar_start + 3 * SIXTEENTH, DRUM_CHANNEL, HI_AGOGO, 70, SIXTEENTH, "agogo")
        track.add_note(bar_start + 11 * SIXTEENTH, DRUM_CHANNEL, LOW_AGOGO, 70, SIXTEENTH, "agogo")
        track.add_note(bar_start + 4 * SIXTEENTH, DRUM_CHANNEL, TAMBOURINE, 58, SIXTEENTH, "tambourine")
        track.add_note(bar_start + 12 * SIXTEENTH, DRUM_CHANNEL, TAMBOURINE, 58, SIXTEENTH, "tambourine")
    return track


TIER0_BUILDERS = [build_bass, build_pad, build_marimba, build_shaker, build_lead]
TIER1_BUILDERS = [build_kit, build_congas]
TIER2_BUILDERS = [build_arp]
TIER3_BUILDERS = [build_harmony]
ALL_BUILDERS = TIER0_BUILDERS + TIER1_BUILDERS + TIER2_BUILDERS + TIER3_BUILDERS


def write_midi(path, conductor, tracks):
    chunks = [conductor.serialize()] + [track.serialize() for track in tracks]
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), PULSES_PER_QUARTER)
    path.write_bytes(header + b"".join(chunks))
    return path


assert_bars_are_complete()
