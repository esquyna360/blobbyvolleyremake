import os
import numpy as np
from PIL import Image
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "stage")
SW, SH = 1600, 900
GROUND = 0.655          # onde o chao encosta na camada mais proxima
out = Image.new("RGBA", (SW, SH), (0, 0, 0, 255))
FOG = np.array([0.72, 0.83, 0.62], np.float32) * 255
BURY = 0.12


def veil(im, k):
    a = np.asarray(im, np.float32)
    a[..., :3] = a[..., :3] * (1 - k) + FOG * k
    a[..., 3] *= (1 - k * 0.25)
    return Image.fromarray(a.astype(np.uint8))


def put(name, base_frac, width_frac, fog=0.0):
    """base_frac: onde a linha de base da camada cai na tela."""
    im = Image.open(os.path.join(A, name)).convert("RGBA")
    w = int(SW * width_frac)
    h = int(im.height * w / im.width)
    im = veil(im.resize((w, h), Image.LANCZOS), fog)
    y = int(SH * base_frac) - int(h * (1 - BURY))
    out.alpha_composite(im, ((SW - w) // 2, y))


sky = Image.open(os.path.join(A, "sky.png")).convert("RGBA").resize((SW, SH), Image.LANCZOS)
out.alpha_composite(sky, (0, 0))
put("l5_canopy.png", 0.60, 2.00, 0.50)
put("l4_far.png", 0.615, 1.62, 0.33)
put("l3_mid.png", 0.628, 1.32, 0.18)
put("l2_near.png", 0.642, 1.13, 0.08)
put("l1_back.png", GROUND, 1.00, 0.02)
g = Image.open(os.path.join(A, "ground.png")).convert("RGBA")
g = g.resize((SW, int(SH * (1 - GROUND) * 1.02)), Image.LANCZOS)
out.alpha_composite(g, (0, int(SH * GROUND)))
f = Image.open(os.path.join(A, "fringe.png")).convert("RGBA")
f = f.resize((SW, int(SH * 0.075)), Image.LANCZOS)
out.alpha_composite(f, (0, int(SH * GROUND) - f.height + 6))
b = Image.open(os.path.join(A, "fg_bottom.png")).convert("RGBA")
b = b.resize((SW, int(SH * 0.17)), Image.LANCZOS)
out.alpha_composite(b, (0, SH - b.height))
for nm, left in (("fg_left.png", True), ("fg_right.png", False)):
    im = Image.open(os.path.join(A, nm)).convert("RGBA")
    im = im.resize((int(SW * 0.19), SH), Image.LANCZOS)
    out.alpha_composite(im, (0 if left else SW - im.width, 0))
T = Image.open(os.path.join(A, "fg_top.png")).convert("RGBA")
T = T.resize((SW, int(SH * 0.30)), Image.LANCZOS)
out.alpha_composite(T, (0, 0))
out.convert("RGB").save(os.path.expanduser("~/code/.dev-logs/blobby/preview_stage.png"))
print("ok")
