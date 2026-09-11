"""Cenario 2: praia ao por do sol. Ceu roxo-laranja, sol na linha d'agua,
ilhas em silhueta, palmeiras contra a luz com fio de luz laranja, areia
rosada, tochas e primeiro plano de folhas de palmeira e duna com conchas."""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stagelib import *  # noqa
from stagelib import _oval
import make_stage as ms
from make_stage import (pad_v, finish, palm, leaf2, fern2, flower, radial,
                        lighten, darken, W, PADK)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "stage", "beach")
os.makedirs(OUT, exist_ok=True)

SUN_U = 0.5
RIM_C = hexc("#ffb36b")
RIM_HOT = hexc("#ffd9a0")
SIL1 = hexc("#7d5aa6")
SIL2 = hexc("#5a3f82")
SIL3 = hexc("#3b2a5e")
SIL4 = hexc("#2a1d45")
PALM_FG = hexc("#1e3d34")
PALM_FG_HI = hexc("#2f6a52")
BARK = hexc("#3e2416")
BARK_HI = hexc("#6a4225")
SAND = hexc("#eccb9c")
SAND_DK = hexc("#c69a6a")
HIB = hexc("#ff3d5a")
HIB2 = hexc("#ff7ab0")
CORAL = hexc("#ff8a5c")
ms.MIST = hexc("#f3c9b4")


def save(img, name):
    img.save(os.path.join(OUT, name))
    print("  beach/", name, img.size)


def grad(h, stops, w):
    y = np.linspace(0, 1, h, dtype=np.float32)
    col = np.zeros((h, 3), np.float32)
    for i in range(len(stops) - 1):
        y0, c0 = stops[i]
        y1, c1 = stops[i + 1]
        m = (y >= y0) & (y <= y1)
        t = ((y[m] - y0) / (y1 - y0))[:, None]
        col[m] = np.array(c0[:3], np.float32) * (1 - t) + np.array(c1[:3], np.float32) * t
    return np.repeat(col[:, None, :], w, axis=1)


def make_sky():
    h = 1024
    a = grad(h, [(0.00, hexc("#262663")), (0.22, hexc("#5d3a8c")), (0.45, hexc("#b8558f")),
                 (0.66, hexc("#f2814f")), (0.82, hexc("#ffc06a")), (1.00, hexc("#ffe7a6"))], W)
    rng = np.random.default_rng(31)
    yy, xx = np.mgrid[0:h, 0:W].astype(np.float32)
    # estrelas no alto
    st = rng.random((h, W)) > 0.9994
    fade = np.clip(1.0 - yy / (h * 0.40), 0, 1)
    a += 200.0 * (st * fade)[..., None]
    # sol na linha do horizonte e o clarao em volta
    for (cy, r, s, c) in [(0.64, 0.075, 1.0, hexc("#fff4cc")), (0.64, 0.22, 0.55, hexc("#ffd080")),
                          (0.64, 0.6, 0.35, hexc("#ff9a5a")), (0.70, 1.1, 0.18, hexc("#ff7a6a"))]:
        dx = (xx / W - SUN_U) * 2.0
        dy = (yy / h - cy)
        d = np.sqrt(dx * dx + dy * dy)
        if r < 0.1:
            g = np.clip(1.0 - (d - r) / 0.01, 0, 1)
        else:
            g = np.clip(1.0 - d / r, 0, 1) ** 2.2
        a = a * (1 - (g * s)[..., None]) + np.array(c[:3], np.float32) * (g * s)[..., None]
    # nuvens compridas com barriga roxa e topo aceso
    n = vnoise(h, W, 420, 4, rng)
    band = np.exp(-((yy / h - 0.42) / 0.16) ** 2)
    cl = np.clip((n - 0.52) * 4.0, 0, 1) * band
    n2 = vnoise(h, W, 90, 3, rng)
    top = np.clip((n2 - 0.4) * 2.0, 0, 1)
    ccol = np.array(hexc("#5a3468")[:3], np.float32) * (1 - top[..., None]) \
        + np.array(hexc("#ffb377")[:3], np.float32) * top[..., None]
    a = a * (1 - cl[..., None] * 0.85) + ccol * (cl[..., None] * 0.85)
    a = np.clip(a, 0, 255)
    img = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    return grain(img, 0.02, rng, 2.0)


def islands(h, rng, col, n, amp, gap_u=0.5, gap_w=0.22, palms=0):
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.05
    for i in range(n):
        u = (i + rng.uniform(0.2, 0.8)) / n
        # buraco no meio pro sol descer na agua
        if abs(((u - gap_u + 0.5) % 1.0) - 0.5) < gap_w * rng.uniform(0.6, 1.0):
            continue
        x = u * W
        w = W / n * rng.uniform(0.8, 1.6)
        hh = h * amp * rng.uniform(0.5, 1.0)
        pts = []
        k = 14
        for j in range(k + 1):
            t = j / k
            yy = base - hh * math.sin(math.pi * t) ** 0.7 * (0.8 + 0.2 * math.sin(t * 9 + i))
            pts.append((x - w * 0.5 + w * t, yy))
        pts = [(x - w * 0.5, base + 5)] + pts + [(x + w * 0.5, base + 5)]
        wrapped(lambda xx: d.polygon([(p[0] - x + xx, p[1]) for p in pts], fill=col), x, W)
        for _ in range(palms):
            px = x + rng.uniform(-w * 0.35, w * 0.35)
            ph = h * rng.uniform(0.35, 0.6)
            wrapped(lambda xx: palm(d, xx, base - hh * 0.55, ph, col, rng,
                                    rng.uniform(-0.2, 0.2), fronds=9, canopy=0.4), px, W)
    return img


def make_l5():
    rng = np.random.default_rng(41)
    img = islands(560, rng, SIL1, 7, 0.45, gap_w=0.16)
    return finish(img, rng, None, 0, 0.55, 5.0, shade=(1.0, 0.95), fray=(2.0, 12.0, 0.3), sat=1.0)


def make_l4():
    rng = np.random.default_rng(43)
    img = islands(520, rng, SIL2, 6, 0.6, gap_w=0.2, palms=4)
    return finish(img, rng, RIM_C, 6, 0.30, 3.0, shade=(1.0, 0.9), fray=(2.0, 12.0, 0.3),
                  rim_a=170, sat=1.0)


def palm_row(h, rng, col, n, hmin, hmax, rocks=True, gap_w=0.18):
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.03
    if rocks:
        for _ in range(int(n * 3)):
            x = rng.uniform(0, W)
            if abs(x / W - SUN_U) < gap_w:
                continue
            wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.2, 0.5),
                                    h * rng.uniform(0.10, 0.28), col, rng), x, W)
    for i in range(n):
        u = (i + rng.uniform(0.15, 0.85)) / n
        if abs(u - SUN_U) < gap_w:
            continue
        x = u * W
        hh = h * rng.uniform(hmin, hmax)
        wrapped(lambda xx: palm(d, xx, base, hh, col, rng, rng.uniform(-0.3, 0.3),
                                fronds=11, canopy=0.42), x, W)
    return img


def make_l3():
    rng = np.random.default_rng(47)
    img = palm_row(520, rng, SIL3, 18, 0.5, 0.85)
    return finish(img, rng, RIM_C, 8, 0.12, 2.5, shade=(1.0, 0.85), fray=(2.0, 12.0, 0.3),
                  rim_a=210, sat=1.05)


def make_l2():
    rng = np.random.default_rng(53)
    img = palm_row(560, rng, SIL4, 13, 0.55, 0.95, gap_w=0.24)
    return finish(img, rng, RIM_HOT, 9, 0.04, 2.0, shade=(1.0, 0.8), fray=(2.0, 12.0, 0.3),
                  rim_a=230, sat=1.05)


def make_l1():
    """Pedras saindo da agua na margem de tras, poucas, com a luz batendo."""
    h, rng = 400, np.random.default_rng(59)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.05
    for _ in range(14):
        x = rng.uniform(0, W)
        if abs(x / W - SUN_U) < 0.2:
            continue
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.25, 0.7),
                                h * rng.uniform(0.18, 0.45), hexc("#2c2440"), rng), x, W)
    for _ in range(3):
        x = rng.uniform(0, W)
        if abs(x / W - SUN_U) < 0.3:
            x = (x + 0.5 * W) % W
        wrapped(lambda xx: palm(d, xx, base - h * 0.15, h * rng.uniform(0.7, 0.95),
                                hexc("#231c38"), rng, rng.uniform(-0.35, 0.35),
                                fronds=12, canopy=0.44), x, W)
    return finish(img, rng, RIM_HOT, 10, 0.0, 1.6, shade=(1.0, 0.8), fray=(2.0, 12.0, 0.3),
                  rim_a=240, sat=1.05)


def fg_finish(img, rng, fray=(2.5, 13.0, 0.36)):
    img = organic_edge(img, rng, *fray)
    img = shade_v(img, 1.05, 0.75)
    img = rim(img, RIM_HOT[:3] + (200,), px=5, dy=1, soft=3)
    img = inner_dark(img, hexc("#0d1a18"), px=30, strength=0.45)
    return saturate(grain(img, 0.05, rng, 3.0), 1.10)


def make_fg_side(seed, flip):
    """Tronco de palmeira inclinado na borda, com folhas grandes e hibisco."""
    w, h, rng = 660, 1152, np.random.default_rng(seed)
    img = new(w, h)
    d = ImageDraw.Draw(img)
    # tronco em curva com aneis
    pts = [(w * (0.08 + 0.10 * math.sin(t * 2.2)), h * (1.08 - t * 1.2)) for t in np.linspace(0, 1, 16)]
    for i, (x, y) in enumerate(pts):
        r = w * (0.20 - 0.07 * i / 16)
        d.ellipse([x - r, y - h * 0.05, x + r, y + h * 0.05], fill=BARK)
    for i, (x, y) in enumerate(pts):
        r = w * (0.20 - 0.07 * i / 16)
        d.ellipse([x - r, y - h * 0.018, x + r, y + h * 0.018], fill=BARK_HI)
    for _ in range(5):
        y = rng.uniform(h * 0.1, h * 0.9)
        d.line([(0, y), (w * 0.24, y - h * 0.02)], fill=darken(BARK, 0.3), width=int(h * 0.006))
    # folhas grandes saindo do topo e do meio
    for k in range(6):
        y = h * rng.uniform(-0.05, 0.55)
        L = w * rng.uniform(0.7, 1.15)
        a = rng.uniform(-0.2, 0.9)
        frond(d, w * 0.15, y, L, a, PALM_FG, rng, leaflets=18, droop=0.9)
    for k in range(3):
        y = h * rng.uniform(0.3, 0.9)
        L = w * rng.uniform(0.45, 0.7)
        leaf2(d, w * 0.12, y, L, L * 0.34, rng.uniform(-0.4, 0.7), PALM_FG, PALM_FG_HI, notch=0.2)
    for _ in range(7):
        c = [HIB, HIB2, CORAL][int(rng.integers(0, 3))]
        flower(d, rng.uniform(w * 0.05, w * 0.5), rng.uniform(h * 0.1, h * 0.95),
               w * rng.uniform(0.035, 0.06), c, core=hexc("#ffe27a"), petals=5)
    img = fg_finish(img, rng)
    img = fade_edge(img, 0.06, 'right')
    return img.transpose(Image.FLIP_LEFT_RIGHT) if flip else img


def make_fg_top():
    h, rng = 640, np.random.default_rng(61)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, h * 0.03], fill=PALM_FG)
    for _ in range(13):
        x = rng.uniform(0, W)
        L = h * rng.uniform(0.5, 0.95)
        a = math.pi / 2 + rng.uniform(-0.9, 0.9)
        wrapped(lambda xx: frond(d, xx, h * rng.uniform(-0.05, 0.08), L, a, PALM_FG, rng,
                                 leaflets=16, droop=0.5 * (1 if math.cos(a) > 0 else -1)), x, W)
    for _ in range(12):
        x = rng.uniform(0, W)
        wrapped(lambda xx: strand(d, xx, h * 0.02, rng.uniform(h * 0.2, h * 0.5), PALM_FG_HI, rng,
                                  thick=h * rng.uniform(0.006, 0.012), lobes=False), x, W)
    for _ in range(22):
        x = rng.uniform(0, W)
        c = [HIB, HIB2, CORAL][int(rng.integers(0, 3))]
        wrapped(lambda xx: flower(d, xx, h * rng.uniform(0.15, 0.55),
                                  h * rng.uniform(0.02, 0.034), c, core=hexc("#ffe27a")), x, W)
    return fg_finish(img, rng, fray=(2.5, 15.0, 0.36))


def starfish(d, x, y, r, col, rng):
    pts = []
    for i in range(10):
        a = i * math.pi / 5 + rng.uniform(-0.1, 0.1)
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr * 0.8))
    d.polygon(pts, fill=col)


def shell(d, x, y, r, col, rng):
    d.pieslice([x - r, y - r, x + r, y + r], 200, 340, fill=col)
    for i in range(5):
        a = math.radians(200 + i * 35)
        d.line([(x, y), (x + math.cos(a) * r, y + math.sin(a) * r)], fill=darken(col, 0.25), width=2)


def make_fg_bottom():
    h, rng = 520, np.random.default_rng(67)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 0.42
    pts = [(0, h)] + [(x, base + h * 0.10 * math.sin(x / W * 6.28 * 2 + 1) + h * 0.06 * math.sin(x / W * 6.28 * 5))
                      for x in range(0, W + 1, 32)] + [(W, h)]
    d.polygon(pts, fill=SAND)
    d.polygon([(p[0], p[1] + h * 0.14) if 0 < i < len(pts) - 1 else p for i, p in enumerate(pts)],
              fill=lighten(SAND, 0.08))
    for _ in range(18):
        x = rng.uniform(0, W)
        y = rng.uniform(base + h * 0.05, h)
        wrapped(lambda xx: fern(d, xx, y, h * rng.uniform(0.10, 0.22), -math.pi / 2,
                                hexc("#8fa062"), rng, n=5), x, W)
    for _ in range(9):
        x = rng.uniform(0, W)
        wrapped(lambda xx: starfish(d, xx, rng.uniform(base + h * 0.2, h * 0.95), h * rng.uniform(0.05, 0.08),
                                    [CORAL, HIB][int(rng.integers(0, 2))], rng), x, W)
    for _ in range(26):
        x = rng.uniform(0, W)
        wrapped(lambda xx: shell(d, xx, rng.uniform(base + h * 0.15, h * 0.98), h * rng.uniform(0.03, 0.06),
                                 [hexc("#fff1de"), hexc("#ffc9b8"), hexc("#f6e3c2")][int(rng.integers(0, 3))],
                                 rng), x, W)
    for _ in range(8):
        x = rng.uniform(0, W)
        y = rng.uniform(base + h * 0.2, h)
        wrapped(lambda xx: d.ellipse([xx - h * 0.06, y - h * 0.045, xx + h * 0.06, y + h * 0.045],
                                     fill=hexc("#5a3a22")), x, W)
    img = organic_edge(img, rng, 2.0, 14.0, 0.3)
    img = shade_v(img, 1.0, 0.80)
    img = rim(img, RIM_HOT[:3] + (170,), px=5, dy=1, soft=3)
    img = Image.alpha_composite(fill_from(img, darken(SAND, 0.15), "bottom"), img)
    return saturate(grain(img, 0.04, rng, 3.0), 1.05)


def make_ground():
    n, rng = 1024, np.random.default_rng(71)
    base = np.array(SAND[:3], float)
    dark = np.array(SAND_DK[:3], float)
    a = vnoise(n, n, 100, 5, rng)
    b = vnoise(n, n, 13, 4, rng)
    p = vnoise(n, n, 5, 2, rng)
    col = base[None, None, :] + (dark - base)[None, None, :] \
        * ((a * 0.70 + b * 0.30) - 0.44)[..., None] * 1.5
    col = np.clip(col * (0.9 + p[..., None] * 0.2), 0, 255)
    img = Image.fromarray(np.dstack([col.astype(np.uint8), np.full((n, n), 255, np.uint8)]))
    d = ImageDraw.Draw(img)
    for _ in range(90):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        wrapped(lambda xx: shell(d, xx, y, rng.uniform(4, 9),
                                 [hexc("#fff1de"), hexc("#ffd3bf")][int(rng.integers(0, 2))], rng), x, n)
    for _ in range(30):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        wrapped(lambda xx: fern(d, xx, y, rng.uniform(10, 22), -math.pi / 2, hexc("#9aa76a"), rng, n=5), x, n)
    img = dapple(img, rng, hexc("#fbe0b6"), 120.0, 0.34, 0.58)
    img = dapple(img, rng, hexc("#b0845c"), 60.0, 0.30, 0.62)
    return img


def make_fringe():
    """Linha da agua: espuma, algas e conchas."""
    h, rng = 256, np.random.default_rng(73)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.02
    for _ in range(16):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.25, 0.5),
                                h * rng.uniform(0.12, 0.3), hexc("#6c5a6e"), rng), x, W)
    for _ in range(120):
        x = rng.uniform(0, W)
        wrapped(lambda xx: fern(d, xx, base, h * rng.uniform(0.25, 0.6), -math.pi / 2,
                                [hexc("#6f8d5a"), hexc("#9aa76a")][int(rng.integers(0, 2))], rng, n=5), x, W)
    for _ in range(50):
        x = rng.uniform(0, W)
        wrapped(lambda xx: shell(d, xx, base - h * rng.uniform(0.0, 0.2), h * rng.uniform(0.05, 0.09),
                                 hexc("#fff1de"), rng), x, W)
    for _ in range(80):
        x = rng.uniform(0, W)
        r = h * rng.uniform(0.04, 0.1)
        y = base - h * rng.uniform(0.0, 0.1)
        wrapped(lambda xx: d.ellipse([xx - r, y - r * 0.4, xx + r, y + r * 0.4], fill=hexc("#fff8f0", 200)), x, W)
    return img


def make_plant(seed, kind):
    n, rng = 512, np.random.default_rng(seed)
    img = new(n, n)
    d = ImageDraw.Draw(img)
    cx, base = n * 0.5, n * 0.98
    if kind == "a":
        for _ in range(26):
            a = -math.pi / 2 + rng.uniform(-0.8, 0.8)
            L = n * rng.uniform(0.35, 0.6)
            d.line([(cx + rng.uniform(-n * 0.08, n * 0.08), base),
                    (cx + math.cos(a) * L, base + math.sin(a) * L)],
                   fill=[hexc("#8fa062"), hexc("#b9b874"), hexc("#6f8d5a")][int(rng.integers(0, 3))],
                   width=int(n * 0.012))
    else:
        for k in range(11):
            a = -math.pi / 2 + (k / 10 - 0.5) * 2.6 + rng.uniform(-0.1, 0.1)
            L = n * rng.uniform(0.36, 0.52)
            leaf2(d, cx, base, L, L * 0.16, a, hexc("#2f6a52"), hexc("#5a9a6a"), notch=0.0)
        flower(d, cx, base - n * 0.5, n * 0.06, HIB, core=hexc("#ffe27a"))
    img = organic_edge(img, rng, 2.0, 12.0, 0.3)
    img = shade_v(img, 1.05, 0.75)
    img = rim(img, RIM_HOT[:3] + (170,), px=3, dy=1, soft=2)
    return saturate(grain(img, 0.04, rng, 3.0), 1.1)


def make_torch():
    """Tocha de bambu: haste com no e o copo de palha em cima (o fogo e particula)."""
    w, h, rng = 128, 512, np.random.default_rng(79)
    img = new(w, h)
    d = ImageDraw.Draw(img)
    d.rectangle([w * 0.42, h * 0.22, w * 0.58, h], fill=hexc("#7a5a2a"))
    d.rectangle([w * 0.42, h * 0.22, w * 0.47, h], fill=hexc("#a8843e"))
    for y in np.linspace(h * 0.3, h * 0.95, 6):
        d.rectangle([w * 0.40, y, w * 0.60, y + h * 0.012], fill=hexc("#4a3218"))
    d.polygon([(w * 0.22, h * 0.08), (w * 0.78, h * 0.08), (w * 0.66, h * 0.26), (w * 0.34, h * 0.26)],
              fill=hexc("#8a6a34"))
    for i in range(9):
        x = w * (0.24 + 0.52 * i / 8)
        d.line([(x, h * 0.08), (x + w * 0.02, h * 0.25)], fill=hexc("#5a4220"), width=2)
    d.ellipse([w * 0.22, h * 0.05, w * 0.78, h * 0.12], fill=hexc("#3a2a12"))
    img = rim(img, RIM_HOT[:3] + (200,), px=3, dy=1, soft=2)
    return img


def make_bird():
    n = 128
    img = new(n, n)
    d = ImageDraw.Draw(img)
    for sx in (-1, 1):
        pts = [(n * 0.5, n * 0.55)]
        for t in np.linspace(0, 1, 8):
            pts.append((n * 0.5 + sx * t * n * 0.44, n * 0.55 - math.sin(t * 2.6) * n * 0.22 * (1 - t * 0.3)))
        d.line(pts, fill=hexc("#2a1d3a"), width=6, joint="curve")
    return img


if __name__ == "__main__":
    print("gerando praia...")
    save(make_sky(), "sky.png")
    save(pad_v(make_l5(), "top"), "l5_canopy.png")
    save(pad_v(make_l4(), "top"), "l4_far.png")
    save(pad_v(make_l3(), "top"), "l3_mid.png")
    save(pad_v(make_l2(), "top"), "l2_near.png")
    save(pad_v(make_l1(), "top"), "l1_back.png")
    save(make_fg_side(311, False), "fg_left.png")
    save(make_fg_side(313, True), "fg_right.png")
    save(pad_v(make_fg_top(), "top"), "fg_top.png")
    save(pad_v(make_fg_bottom(), "bottom"), "fg_bottom.png")
    save(make_ground(), "ground.png")
    save(pad_v(make_fringe(), "top"), "fringe.png")
    save(make_plant(401, "a"), "plant_a.png")
    save(make_plant(407, "b"), "plant_b.png")
    save(make_torch(), "torch.png")
    save(make_bird(), "bird.png")
    print("ok")
