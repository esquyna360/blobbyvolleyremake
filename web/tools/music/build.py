"""Gera public/music/*.json a partir dos temas."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import themes  # noqa: E402
import themes_scenes  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / 'public' / 'music'
OUT.mkdir(parents=True, exist_ok=True)

total = 0
for make in themes.ALL + themes_scenes.ALL:
    song = make()
    path, notes, size = song.write(OUT)
    total += size
    print(f'{path.name:16} {song.bars:3} compassos  {len(song.data()["tracks"]):2} vozes  {notes:5} notas  {size / 1024:6.1f} KB')
print(f'{"total":16} {total / 1024:.1f} KB')
