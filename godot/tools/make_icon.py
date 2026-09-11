import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icon")
S = 1024
SS = 4  # supersampling


def blob(d, cx, cy, w, h, col):
    d.ellipse([cx - w / 2, cy - h * 0.55, cx + w / 2, cy + h * 0.45], fill=col)
    d.ellipse([cx - w * 0.36, cy - h * 0.95, cx + w * 0.36, cy - h * 0.10], fill=col)


def leaf(d, cx, cy, ln, wd, ang, col):
    pts = []
    for i in range(25):
        t = i / 24
        pts.append((t * ln, math.sin(t * math.pi) * wd * (1 - t * 0.35)))
    for i in range(25):
        t = 1 - i / 24
        pts.append((t * ln, -math.sin(t * math.pi) * wd * (1 - t * 0.35)))
    ca, sa = math.cos(ang), math.sin(ang)
    d.polygon([(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts], fill=col)


def ball(px, mono=False):
    """Esfera com gomos: a longitude na esfera, não no disco, dá a curva certa."""
    y, x = np.mgrid[0:px, 0:px]
    u = (x - px / 2 + 0.5) / (px / 2)
    v = (y - px / 2 + 0.5) / (px / 2)
    r2 = u * u + v * v
    z = np.sqrt(np.clip(1.0 - r2, 0.0, 1.0))
    ca, sa = math.cos(0.62), math.sin(0.62)
    lon = np.arctan2(u * ca - v * sa, z)
    band = np.floor((lon + math.pi) / (math.pi / 3.0)).astype(int) % 2
    base = np.array([250, 246, 232], float)
    alt = np.array([200, 200, 200] if mono else [232, 152, 40], float)
    col = np.where(band[..., None] == 1, alt, base)
    lam = np.clip((-u * 0.45 - v * 0.72 + z * 0.53), 0.0, 1.0)
    col = col * (0.62 + 0.52 * lam)[..., None]
    spec = np.clip(1.0 - np.hypot(u + 0.34, v + 0.40) * 2.6, 0.0, 1.0) ** 2
    col = np.clip(col + spec[..., None] * 120.0, 0, 255)
    edge = np.clip((1.0 - r2) * px * 0.35, 0.0, 1.0)
    a = (edge * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([col.astype(np.uint8), a]))


def draw(fg_only=False, mono=False):
    n = S * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = n / 1024.0

    if not fg_only:
        for y in range(n):
            t = y / n
            d.line([(0, y), (n, y)], fill=(
                int(11 + 20 * t), int(46 + 44 * t), int(28 + 26 * t), 255))
        for a, (lx, ly, ln, wd, rot) in enumerate([
                (-40, 1120, 620, 150, -0.55), (1100, -40, 640, 160, 2.35),
                (-60, 300, 520, 120, 0.25), (1090, 780, 540, 130, 3.05)]):
            leaf(d, lx * u, ly * u, ln * u, wd * u, rot, (14, 58, 33, 255))

    body = (150, 150, 150, 255) if mono else (236, 47, 63, 255)
    dark = (110, 110, 110, 255) if mono else (176, 26, 42, 255)
    eye = (255, 255, 255, 255)
    ink = (20, 14, 16, 255)

    cx, cy = 470 * u, 660 * u
    blob(d, cx, cy + 14 * u, 620 * u, 470 * u, dark)
    blob(d, cx, cy, 620 * u, 470 * u, body)
    hl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse(
        [cx - 170 * u, cy - 470 * u, cx - 10 * u, cy - 370 * u],
        fill=(255, 255, 255, 70))
    img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(22 * u)))

    ex, ey, er = 116 * u, 400 * u, 62 * u
    for s in (-1, 1):
        d.ellipse([cx + s * ex - er, cy - ey - er, cx + s * ex + er, cy - ey + er], fill=eye)
        d.ellipse([cx + s * ex - er * 0.48 + 12 * u, cy - ey - er * 0.48,
                   cx + s * ex + er * 0.48 + 12 * u, cy - ey + er * 0.48], fill=ink)
    d.arc([cx - 105 * u, cy - 335 * u, cx + 105 * u, cy - 175 * u],
          15, 165, fill=ink, width=int(26 * u))

    bx, by, br = 790 * u, 265 * u, 175 * u
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse(
        [bx - br, by - br + 26 * u, bx + br, by + br + 26 * u], fill=(0, 0, 0, 110))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(16 * u)))
    bp = int(br * 2)
    img.alpha_composite(ball(bp, mono), (int(bx - br), int(by - br)))

    if not fg_only:
        m = Image.new("L", (n, n), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(184 * u), fill=255)
        img.putalpha(m)
    return img.resize((S, S), Image.LANCZOS)


def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


full = draw()
fg = draw(fg_only=True)
mono = draw(fg_only=True, mono=True)

bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
db = ImageDraw.Draw(bg)
for y in range(S):
    t = y / S
    db.line([(0, y), (S, y)], fill=(int(11 + 20 * t), int(46 + 44 * t), int(28 + 26 * t), 255))

# adaptive icons: the safe zone is the middle 66%, so the art shrinks into it
def inset(src, frac):
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    k = int(S * frac)
    out.paste(src.resize((k, k), Image.LANCZOS), ((S - k) // 2, (S - k) // 2), src.resize((k, k), Image.LANCZOS))
    return out

save(full, OUT + "/icon_1024.png", 1024)
save(full, OUT + "/icon_512.png", 512)
save(full, OUT + "/icon_192.png", 192)
save(inset(fg, 0.66), OUT + "/adaptive_fg_432.png", 432)
save(bg, OUT + "/adaptive_bg_432.png", 432)
save(inset(mono, 0.66), OUT + "/adaptive_mono_432.png", 432)
print("ok", OUT)
