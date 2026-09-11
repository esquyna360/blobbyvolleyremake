"""Gera as camadas pintadas do cenario de selva, em estilo cartoon de dia.

Composicao: ceu claro e quente no fundo, mata em verdes que escurecem
conforme se aproximam, lago com cachoeira atras da quadra, e primeiro plano
colorido (tronco, samambaia, cipo com flor) emoldurando a tela. Cada camada
apoia numa linha de base que, no mundo, e o y=0 -- o chao esconde o que sobra
embaixo, entao os vaos entre as moitas deixam ver a camada de tras.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stagelib import *  # noqa
from stagelib import _oval

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "stage")
os.makedirs(OUT, exist_ok=True)

W = 2048
MIST = hexc("#e6f2dc")
SUN = hexc("#fff7cf")
SUN_U = 0.5
BURY = 0.12
PADK = 1.05

PINK = hexc("#ff6f9f")
ORANGE = hexc("#ffa53a")
YELLOW = hexc("#ffe066")
WHITE = hexc("#fff8ec")


def lighten(c, k):
    return tuple(min(255, int(v + (255 - v) * k)) for v in c[:3]) + (c[3],)


def darken(c, k):
    return tuple(int(v * (1 - k)) for v in c[:3]) + (c[3],)


def save(img, name):
    img.save(os.path.join(OUT, name))
    print("  ", name, img.size)


def pad_v(img, side="top"):
    """Faixa transparente na borda. A textura repete no eixo x, entao o mipmap
    tambem enrola no y e puxa o lado cheio para o lado vazio: a sobra some com
    a folga, e o quad cresce o mesmo tanto para ela ficar fora da tela."""
    w, h = img.size
    n = int(round(h * (PADK - 1.0)))
    out = new(w, h + n)
    out.paste(img, (0, n if side == "top" else 0))
    return out


def env(u, dip=0.45, width=0.24):
    """Clareira: a mata abaixa no meio pra cachoeira e o ceu aparecerem."""
    return 1.0 - dip * math.exp(-(((u - SUN_U) / width) ** 2))


# ------------------------------------------------------------- desenho

def leaf2(d, x, y, L, w, ang, base, hi, notch=0.16, vein=True):
    """Folha com luz: a metade de cima clareia e a nervura escurece. Sem isso
    a folha e um recorte chapado."""
    big_leaf(d, x, y, L, w, ang, base, notch=notch)
    ca, sa = math.cos(ang), math.sin(ang)
    nx, ny = -sa, ca
    off = w * 0.16
    big_leaf(d, x - nx * off, y - ny * off, L * 0.92, w * 0.62, ang, hi, notch=notch)
    if vein:
        d.line([(x + L * 0.04 * ca, y + L * 0.04 * sa), (x + L * 0.92 * ca, y + L * 0.92 * sa)],
               fill=darken(base, 0.25), width=max(1, int(w * 0.05)))


def fern2(d, x, y, size, ang, base, hi, rng, n=7):
    fern(d, x, y, size, ang, base, rng, n=n)
    fern(d, x, y - size * 0.05, size * 0.86, ang, hi, rng, n=n)


def flower(d, x, y, r, col, core=YELLOW, petals=5):
    for i in range(petals):
        a = i * 2 * math.pi / petals
        _oval(d, x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55,
              r * 0.5, r * 0.34, a, col)
    d.ellipse([x - r * 0.28, y - r * 0.28, x + r * 0.28, y + r * 0.28], fill=core)


def bark(d, x0, x1, y0, y1, col, rng, n):
    """Ranhuras verticais no tronco."""
    for _ in range(n):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        L = rng.uniform(40, 160)
        ww = rng.uniform(2, 6)
        d.line([(x, y), (x + rng.uniform(-8, 8), y + L)], fill=col, width=int(ww))


def palm(d, x, base, h, col, rng, lean, fronds=13, canopy=0.34):
    tw = max(3.0, h * rng.uniform(0.026, 0.044))
    trunk(d, x, base, h, tw, col, rng, lean, taper=0.55)
    tx, ty = x + lean * h, base - h
    for i in range(fronds):
        a = -math.pi * (0.12 + 0.76 * (i + rng.uniform(0, 1)) / fronds)
        L = h * canopy * rng.uniform(0.78, 1.25)
        frond(d, tx, ty + rng.uniform(-tw, tw), L, a, col, rng,
              leaflets=17, droop=(1.0 if math.cos(a) > 0 else -1.0))


def broadleaf_tree(d, x, base, h, col, rng, lean, canopy=0.34):
    tw = max(4.0, h * rng.uniform(0.05, 0.085))
    trunk(d, x, base, h, tw, col, rng, lean)
    cr = h * canopy
    clump(d, x + lean * h, base - h, cr * 2.2, cr * 1.5, col, rng,
          lobes=36, r=cr * 0.36)


def trunk_row(d, w, base, top, col, rng, n, tw, lean, canopy=0.0):
    for i in range(n):
        x = (i + rng.uniform(-0.46, 0.46)) * w / n
        hh = (base - top) * rng.uniform(0.78, 1.06)
        ww = tw * rng.uniform(0.65, 1.5)
        ln = rng.uniform(-lean, lean)
        wrapped(lambda xx: trunk(d, xx, base, hh, ww, col, rng, ln, taper=0.42), x, w)
        if canopy and rng.random() < 0.55:
            cr = hh * canopy * rng.uniform(0.7, 1.3)
            wrapped(lambda xx: clump(d, xx + ln * hh, base - hh + cr * 0.2,
                                     cr * 2.0, cr * 1.1, col, rng,
                                     lobes=18, r=cr * 0.34), x, w)


def bush_row(d, w, base, col, rng, n, scale, dip, gap=0.0, hi=None):
    for i in range(n):
        x = (i + rng.uniform(-0.42, 0.42)) * w / n
        if rng.random() < gap:
            continue
        s = scale * env(x / w, dip) * rng.uniform(0.7, 1.35)
        wrapped(lambda xx: clump(d, xx, base - s * 0.34, s * 2.2, s * 1.25,
                                 col, rng, lobes=24, r=s * 0.30), x, w)
        if hi:
            wrapped(lambda xx: clump(d, xx, base - s * 0.62, s * 1.5, s * 0.7,
                                     hi, rng, lobes=14, r=s * 0.24), x, w)


def fern_row(d, w, base, col, rng, n, scale, dip, gap=0.0, hi=None):
    for i in range(n):
        x = (i + rng.uniform(-0.45, 0.45)) * w / n
        if rng.random() < gap:
            continue
        s = scale * env(x / w, dip) * rng.uniform(0.75, 1.3)
        if hi:
            wrapped(lambda xx: fern2(d, xx, base, s, -math.pi / 2, col, hi, rng, n=7), x, w)
        else:
            wrapped(lambda xx: fern(d, xx, base, s, -math.pi / 2, col, rng, n=7), x, w)


def vine_curtain(d, w, top, col, rng, n, length, thick, dip):
    for i in range(n):
        x = rng.uniform(0, w)
        if rng.random() > env(x / w, dip * 0.9):
            continue
        wrapped(lambda xx: strand(d, xx, top + rng.uniform(-8, 26),
                                  length * rng.uniform(0.45, 1.25), col, rng,
                                  thick=thick * rng.uniform(0.6, 1.5)), x, w)


def finish(img, rng, rim_col, rim_px, mist, blur_px, shade=(1.15, 0.62), rim_a=235,
           fray=(9.0, 30.0, 1.0), warm=None, sat=1.18):
    img = organic_edge(img, rng, *fray)
    img = shade_v(img, shade[0], shade[1])
    if warm:
        img = hue_noise(img, rng, warm, 200.0, 0.85)
    if rim_col:
        img = rim(img, rim_col[:3] + (rim_a,), px=rim_px, dy=1, soft=max(2, rim_px // 2))
    if mist:
        img = tint_mist(img, MIST, mist)
    img = grain(img, 0.05, rng, 3.0)
    img = saturate(img, sat)
    return blur(img, blur_px)


# ------------------------------------------------------------------ ceu

def make_sky():
    h = 1024
    stops = [(0.00, hexc("#4fb0e6")), (0.30, hexc("#8fd0ee")),
             (0.58, hexc("#d6ecec")), (0.80, hexc("#fbf3cf")),
             (1.00, hexc("#fff6d6"))]
    y = np.linspace(0, 1, h, dtype=np.float32)
    col = np.zeros((h, 3), np.float32)
    for i in range(len(stops) - 1):
        y0, c0 = stops[i]
        y1, c1 = stops[i + 1]
        m = (y >= y0) & (y <= y1)
        t = ((y[m] - y0) / (y1 - y0))[:, None]
        col[m] = np.array(c0[:3], np.float32) * (1 - t) + np.array(c1[:3], np.float32) * t
    a = np.repeat(col[:, None, :], W, axis=1)

    rng = np.random.default_rng(7)
    yy, xx = np.mgrid[0:h, 0:W].astype(np.float32)
    for (cx, cy, r, s) in [(SUN_U, 0.62, 0.90, 0.30), (SUN_U, 0.62, 0.40, 0.30),
                           (SUN_U, 0.62, 0.16, 0.5)]:
        dx = (xx / W - cx) * 2.1
        dy = (yy / h - cy)
        g = np.clip(1.0 - np.sqrt(dx * dx + dy * dy) / r, 0, 1) ** 2.0
        a += np.array(SUN[:3], np.float32) * (g * s)[..., None]

    # nuvens: ruido baixo, so no terco de cima
    n = vnoise(h, W, 330, 4, rng)
    band = np.clip(1.0 - (y[:, None] - 0.05) / 0.55, 0, 1) ** 1.4
    cl = np.clip((n - 0.50) * 3.0, 0, 1) * band
    a = a * (1 - cl[..., None] * 0.9) + np.array([255, 253, 246], np.float32) * (cl[..., None] * 0.9)
    a = np.clip(a, 0, 255)
    img = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    return grain(img, 0.02, rng, 2.0)


# ------------------------------------------------------------ camadas

def make_canopy():
    """Mata distante: massa clara e azulada, quase nevoa."""
    h, rng = 520, np.random.default_rng(11)
    col = hexc("#9ccfae")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * 0.16, col, rng, 30, h * 0.020, 0.12, canopy=0.22)
    ridge_band(d, W, h * 0.30, h * 0.10, 300, col, rng, -20, int(h * 0.10))
    bush_row(d, W, base, col, rng, 26, h * 0.16, 0.30, gap=0.25)
    return finish(img, rng, None, 0, 0.30, 6.0, shade=(1.04, 0.88),
                  fray=(3.0, 16.0, 0.45), warm=hexc("#b9dcc0"), sat=1.0)


def make_far():
    h, rng = 640, np.random.default_rng(23)
    col = hexc("#66ad74")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * 0.02, col, rng, 22, h * 0.026, 0.10, canopy=0.20)
    for i in range(7):
        x = (i + rng.uniform(-0.4, 0.4)) * W / 7
        hh = base * rng.uniform(0.50, 0.80) * env(x / W, 0.34)
        wrapped(lambda xx: palm(d, xx, base, hh, col, rng,
                                rng.uniform(-0.22, 0.22)), x, W)
    vine_curtain(d, W, h * 0.10, col, rng, 14, h * 0.26, h * 0.010, 0.4)
    bush_row(d, W, base, col, rng, 22, h * 0.14, 0.40, gap=0.3)
    return finish(img, rng, hexc("#e2f7b6"), 4, 0.20, 3.0, shade=(1.08, 0.78), rim_a=150,
                  fray=(3.0, 15.0, 0.42), warm=hexc("#8cc47a"), sat=1.08)


def make_mid():
    h, rng = 700, np.random.default_rng(37)
    col = hexc("#337f47")
    hi = hexc("#55a55c")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * -0.05, col, rng, 12, h * 0.038, 0.10, canopy=0.17)
    for i in range(6):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 6
        hh = base * rng.uniform(0.52, 0.82) * env(x / W, 0.44)
        fn = palm if rng.random() < 0.7 else broadleaf_tree
        wrapped(lambda xx: fn(d, xx, base, hh, col, rng, rng.uniform(-0.3, 0.3)), x, W)
    vine_curtain(d, W, h * 0.04, col, rng, 24, h * 0.32, h * 0.013, 0.5)
    bush_row(d, W, base, col, rng, 18, h * 0.13, 0.46, gap=0.32, hi=hi)
    fern_row(d, W, base, col, rng, 14, h * 0.14, 0.46, gap=0.35, hi=hi)
    return finish(img, rng, hexc("#c8f09a"), 4, 0.06, 1.4, shade=(1.10, 0.70), rim_a=170,
                  fray=(2.5, 13.0, 0.40), warm=hexc("#4f9e4e"), sat=1.12)


def make_near():
    h, rng = 560, np.random.default_rng(53)
    col = hexc("#276c3a")
    hi = hexc("#47934c")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * -0.15, col, rng, 5, h * 0.055, 0.08)
    for i in range(5):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 5
        hh = base * rng.uniform(0.54, 0.84) * env(x / W, 0.55)
        wrapped(lambda xx: palm(d, xx, base, hh, col, rng,
                                rng.uniform(-0.34, 0.34), fronds=11, canopy=0.38), x, W)
    vine_curtain(d, W, h * 0.0, col, rng, 16, h * 0.30, h * 0.015, 0.55)
    bush_row(d, W, base, col, rng, 16, h * 0.19, 0.50, gap=0.30, hi=hi)
    fern_row(d, W, base, col, rng, 13, h * 0.20, 0.50, gap=0.30, hi=hi)
    return finish(img, rng, hexc("#a9e07a"), 3, 0.05, 0.0, shade=(1.16, 0.68), rim_a=160,
                  fray=(2.5, 12.0, 0.38), warm=hexc("#3d8a48"), sat=1.14)


def make_back():
    """Moitas na margem de tras do lago, com flor. Tem vao de proposito."""
    h, rng = 420, np.random.default_rng(71)
    col = hexc("#2a6b3a")
    hi = hexc("#4c9a4e")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    bush_row(d, W, base, col, rng, 15, h * 0.34, 0.55, gap=0.24, hi=hi)
    fern_row(d, W, base, col, rng, 15, h * 0.34, 0.55, gap=0.22, hi=hi)
    for i in range(22):
        x = rng.uniform(0, W)
        s = env(x / W, 0.5)
        wrapped(lambda xx: leaf2(d, xx, base - h * rng.uniform(0.02, 0.22) * s,
                                 h * rng.uniform(0.20, 0.40) * s,
                                 h * rng.uniform(0.09, 0.17) * s,
                                 rng.uniform(-2.5, -0.6), col, hi, notch=0.22), x, W)
    for i in range(10):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.14, 0.34),
                                h * rng.uniform(0.06, 0.15), hexc("#6b6a5c"), rng), x, W)
    for _ in range(46):
        x = rng.uniform(0, W)
        c = [PINK, ORANGE, WHITE][int(rng.integers(0, 3))]
        wrapped(lambda xx: flower(d, xx, base - h * rng.uniform(0.10, 0.45),
                                  h * rng.uniform(0.020, 0.036), c), x, W)
    return finish(img, rng, hexc("#9fdc6c"), 3, 0.0, 0.0, shade=(1.22, 0.66), rim_a=140,
                  fray=(2.2, 11.0, 0.36), warm=hexc("#2f7a3c"), sat=1.16)


# --------------------------------------------------------- primeiro plano

FG = hexc("#255f2f")
FG_HI = hexc("#5fae4a")
FG_RIM = hexc("#c4ee8c")
BARK = hexc("#4b2f1a")
BARK_HI = hexc("#6a4628")
BARK_DK = hexc("#2e1b0e")
MOSS = hexc("#4f8f38")


def fg_finish(img, rng, fray=(2.5, 13.0, 0.36)):
    img = organic_edge(img, rng, *fray)
    img = shade_v(img, 1.10, 0.72)
    img = hue_noise(img, rng, hexc("#2c7a3a"), 160.0, 0.55)
    img = rim(img, FG_RIM[:3] + (150,), px=4, dy=1, soft=3)
    img = inner_dark(img, hexc("#0e2a14"), px=30, strength=0.45)
    return saturate(grain(img, 0.05, rng, 3.0), 1.12)


def make_fg_side(seed, flip):
    """Tronco na borda com folha grande e samambaia crescendo dele."""
    w, h, rng = 660, 1152, np.random.default_rng(seed)
    img = new(w, h)
    d = ImageDraw.Draw(img)
    d.polygon([(-10, -10), (w * 0.30, -10), (w * 0.34, h * 0.3), (w * 0.27, h * 0.6),
               (w * 0.36, h * 1.05), (-10, h * 1.05)], fill=BARK)
    d.polygon([(w * 0.14, -10), (w * 0.30, -10), (w * 0.34, h * 0.3), (w * 0.27, h * 0.6),
               (w * 0.36, h * 1.05), (w * 0.22, h * 1.05), (w * 0.18, h * 0.6),
               (w * 0.24, h * 0.3)], fill=BARK_HI)
    bark(d, 0, w * 0.32, -10, h, BARK_DK, rng, 90)
    bark(d, w * 0.08, w * 0.32, -10, h, lighten(BARK_HI, 0.18), rng, 40)
    for _ in range(9):
        y = rng.uniform(0, h)
        clump(d, rng.uniform(-w * 0.05, w * 0.22), y, w * rng.uniform(0.18, 0.36),
              h * rng.uniform(0.05, 0.10), MOSS, rng, lobes=16, r=h * 0.02)
    for _ in range(4):
        x = rng.uniform(w * 0.05, w * 0.28)
        strand(d, x, -h * 0.02, rng.uniform(h * 0.3, h * 0.7), hexc("#3d7a2c"), rng,
               thick=w * rng.uniform(0.02, 0.035))
    for _ in range(9):
        y = rng.uniform(h * 0.05, h * 1.0)
        L = w * rng.uniform(0.40, 0.80)
        leaf2(d, w * 0.10, y, L, L * rng.uniform(0.30, 0.44),
              rng.uniform(-0.75, 0.75), FG, FG_HI, notch=0.2)
    for _ in range(6):
        y = rng.uniform(h * 0.25, h * 1.02)
        fern2(d, w * 0.06, y, w * rng.uniform(0.34, 0.60), 0.0, FG, FG_HI, rng, n=6)
    for _ in range(3):
        mushroom(d, rng.uniform(w * 0.05, w * 0.30), h * 1.02,
                 w * rng.uniform(0.10, 0.18), hexc("#e0553c"), hexc("#f0e2c0"), rng)
    for _ in range(7):
        c = [PINK, ORANGE, WHITE][int(rng.integers(0, 3))]
        flower(d, rng.uniform(w * 0.05, w * 0.45), rng.uniform(h * 0.1, h * 0.95),
               w * rng.uniform(0.03, 0.05), c)
    img = fg_finish(img, rng)
    img = fade_edge(img, 0.06, 'right')
    return img.transpose(Image.FLIP_LEFT_RIGHT) if flip else img


def make_fg_top():
    """Galho com folha e cipo florido pendurado, como nas referencias."""
    h, rng = 640, np.random.default_rng(97)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, h * 0.10], fill=BARK)
    for i in range(6):
        x0 = i * W / 6
        y0 = h * rng.uniform(0.02, 0.12)
        pts = [(x0 + k * W / 12, y0 + math.sin(k * 0.9 + i) * h * 0.05 + k * h * 0.01)
               for k in range(0, 4)]
        wrapped(lambda xx: d.line([(p[0] - x0 + xx, p[1]) for p in pts], fill=BARK,
                                  width=int(h * rng.uniform(0.05, 0.09))), x0, W)
        wrapped(lambda xx: d.line([(p[0] - x0 + xx, p[1] - h * 0.02) for p in pts],
                                  fill=BARK_HI, width=int(h * 0.025)), x0, W)
    for _ in range(12):
        x = rng.uniform(0, W)
        wrapped(lambda xx: clump(d, xx, h * rng.uniform(0.06, 0.16), h * rng.uniform(0.2, 0.4),
                                 h * 0.10, MOSS, rng, lobes=14, r=h * 0.025), x, W)
    for _ in range(70):
        x = rng.uniform(0, W)
        wrapped(lambda xx: strand(d, xx, h * rng.uniform(0.06, 0.20),
                                  rng.uniform(h * 0.15, h * 0.62), hexc("#3d7a2c"), rng,
                                  thick=h * rng.uniform(0.006, 0.016)), x, W)
    for _ in range(40):
        x = rng.uniform(0, W)
        L = h * rng.uniform(0.18, 0.36)
        wrapped(lambda xx: leaf2(d, xx, h * rng.uniform(0.08, 0.26), L,
                                 L * rng.uniform(0.28, 0.42),
                                 rng.uniform(1.15, 1.95), FG, FG_HI, notch=0.1), x, W)
    for _ in range(36):
        x = rng.uniform(0, W)
        c = [PINK, ORANGE, WHITE, YELLOW][int(rng.integers(0, 4))]
        wrapped(lambda xx: flower(d, xx, h * rng.uniform(0.18, 0.60),
                                  h * rng.uniform(0.018, 0.032), c), x, W)
    return fg_finish(img, rng, fray=(2.5, 15.0, 0.36))


def make_fg_bottom():
    """Mato rente a camera. Abaixa no meio pra quadra ficar limpa."""
    h, rng = 380, np.random.default_rng(131)
    img = new(W, h)
    d = ImageDraw.Draw(img)

    def top_at(u):
        return h * (0.30 + 0.52 * math.exp(-(((u - 0.5) / 0.30) ** 2)))

    for i in range(60):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 60
        u = x / W
        s2 = h * rng.uniform(0.16, 0.34) * (1.0 - 0.5 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        base = top_at(u) + s2 * 0.9
        wrapped(lambda xx: clump(d, xx, base - s2 * 0.5, s2 * 2.0, s2 * 1.2,
                                 FG, rng, lobes=18, r=s2 * 0.3), x, W)
    for i in range(80):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 80
        u = x / W
        s2 = h * rng.uniform(0.18, 0.40) * (1.0 - 0.5 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        wrapped(lambda xx: fern2(d, xx, top_at(u) + s2 * 0.75, s2, -math.pi / 2,
                                 FG, FG_HI, rng, n=6), x, W)
    for _ in range(30):
        x = rng.uniform(0, W)
        u = x / W
        L = h * rng.uniform(0.24, 0.5) * (1.0 - 0.45 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        wrapped(lambda xx: leaf2(d, xx, top_at(u) + L * 0.5, L, L * 0.36,
                                 rng.uniform(-2.4, -0.7), FG, FG_HI, notch=0.14), x, W)
    for _ in range(30):
        x = rng.uniform(0, W)
        u = x / W
        if abs(u - 0.5) < 0.18:
            continue
        c = [PINK, ORANGE, WHITE][int(rng.integers(0, 3))]
        wrapped(lambda xx: flower(d, xx, top_at(u) + h * rng.uniform(0.05, 0.3),
                                  h * rng.uniform(0.025, 0.045), c), x, W)
    # a massa cheia vai por tras do desenho, senao ela apaga a folha
    img = Image.alpha_composite(fill_from(img, darken(FG, 0.25), "bottom"), img)
    return fg_finish(img, rng, fray=(2.5, 13.0, 0.36))


# ------------------------------------------------------------------ chao

def make_ground():
    """Areia da clareira com manchas de capim. Vai em perspectiva, entao a
    variacao grande importa mais que o detalhe fino."""
    n, rng = 1024, np.random.default_rng(151)
    base = np.array(hexc("#d9b77e")[:3], float)
    dark = np.array(hexc("#a8845a")[:3], float)
    grass = np.array(hexc("#7fb454")[:3], float)
    a = vnoise(n, n, 100, 5, rng)
    b = vnoise(n, n, 13, 4, rng)
    m = vnoise(n, n, 190, 3, rng)
    p = vnoise(n, n, 5, 2, rng)
    col = base[None, None, :] + (dark - base)[None, None, :] \
        * ((a * 0.70 + b * 0.30) - 0.44)[..., None] * 1.6
    mk = np.clip((m - 0.70) * 5.0, 0, 1)[..., None]
    col = col * (1 - mk) + grass[None, None, :] * mk
    col = np.clip(col * (0.86 + p[..., None] * 0.26), 0, 255)
    img = Image.fromarray(np.dstack([col.astype(np.uint8),
                                     np.full((n, n), 255, np.uint8)]))
    d = ImageDraw.Draw(img)
    for _ in range(140):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        r = rng.uniform(2.0, 6.0)
        c = lighten(hexc("#a89272"), rng.uniform(0.0, 0.3))
        wrapped(lambda xx: d.ellipse([xx - r, y - r * 0.8, xx + r, y + r * 0.8],
                                     fill=c), x, n)
    for _ in range(120):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        s2 = rng.uniform(10, 24)
        wrapped(lambda xx: fern(d, xx, y, s2, -math.pi / 2,
                                hexc("#6aa445"), rng, n=5), x, n)
    for _ in range(60):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        L = rng.uniform(7, 18)
        wrapped(lambda xx: big_leaf(d, xx, y, L, L * 0.42, rng.uniform(0, 6.28),
                                    hexc("#b89a5c"), notch=0.18), x, n)
    img = dapple(img, rng, hexc("#f0d9a4"), 110.0, 0.36, 0.58)
    img = dapple(img, rng, hexc("#8a6c44"), 70.0, 0.34, 0.60)
    return img


# --------------------------------------------------------------- sprites

def radial(n, power, col):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    u = (xx - n / 2 + 0.5) / (n / 2)
    v = (yy - n / 2 + 0.5) / (n / 2)
    r = np.clip(1.0 - np.sqrt(u * u + v * v), 0, 1) ** power
    rgb = np.repeat(np.array(col[:3], np.uint8)[None, None, :], n, 0).repeat(n, 1)
    return Image.fromarray(np.dstack([rgb, (r * 255).astype(np.uint8)]))


def make_fringe():
    """Franja de capim e pedra pra margem do lago e o pe da mata."""
    h, rng = 256, np.random.default_rng(181)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.02
    for _ in range(40):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.2, 0.5),
                                h * rng.uniform(0.12, 0.3), hexc("#8d8776"), rng), x, W)
    for c, n, sc in ((hexc("#2f7a36"), 120, 0.95), (hexc("#4c9c44"), 95, 0.72),
                     (hexc("#7cc65a"), 60, 0.5)):
        for _ in range(n):
            x = rng.uniform(0, W)
            wrapped(lambda xx: fern(d, xx, base, h * sc * rng.uniform(0.5, 1.0),
                                    -math.pi / 2, c, rng, n=5), x, W)
    for _ in range(30):
        x = rng.uniform(0, W)
        c = [PINK, ORANGE, WHITE, YELLOW][int(rng.integers(0, 4))]
        wrapped(lambda xx: flower(d, xx, base - h * rng.uniform(0.2, 0.6),
                                  h * rng.uniform(0.04, 0.07), c), x, W)
    return img


def make_falls():
    """Cachoeira pintada: veu branco-azulado com espuma na base."""
    w, h, rng = 512, 1024, np.random.default_rng(191)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w * 2 - 1
    v = yy / h
    n = vnoise(h, w, 22, 3, rng)
    streak = vnoise(h, w, 6, 2, rng)
    body = np.clip(1 - np.abs(u) / (0.55 + 0.25 * v), 0, 1) ** 0.7
    a = body * (0.80 + 0.20 * np.clip((streak - 0.35) * 2.2, 0, 1))
    a *= np.clip(v / 0.06, 0, 1)
    foam = np.exp(-((v - 0.93) / 0.07) ** 2) * np.clip(1 - np.abs(u) / 1.0, 0, 1) ** 0.5
    a = np.clip(a + foam * 0.9 * (0.6 + 0.4 * n), 0, 1)
    col = np.zeros((h, w, 3), np.float32)
    blue = np.array([178, 226, 245], np.float32)
    white = np.array([255, 255, 255], np.float32)
    k = np.clip((streak - 0.4) * 2.5, 0, 1)[..., None]
    col = blue * (1 - k) + white * k
    col = col * (1 - foam[..., None] * 0.5) + white * foam[..., None] * 0.5
    img = Image.fromarray(np.dstack([col.astype(np.uint8), (a * 255).astype(np.uint8)]))
    return img.filter(ImageFilter.GaussianBlur(1.2))


def make_cliff():
    """Paredao de pedra com musgo atras da cachoeira: sem ele o veu branco
    some contra o ceu."""
    w, h, rng = 768, 640, np.random.default_rng(203)
    img = new(w, h)
    d = ImageDraw.Draw(img)
    rock_c = hexc("#4b5447")
    for i in range(14):
        x = w * (0.08 + 0.84 * i / 13) + rng.uniform(-20, 20)
        rock(d, x, h * 1.02, w * rng.uniform(0.18, 0.34), h * rng.uniform(0.55, 0.98),
             rock_c, rng)
    for _ in range(60):
        x, y = rng.uniform(0, w), rng.uniform(h * 0.05, h)
        r = rng.uniform(10, 40)
        d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6],
                  fill=hexc("#4a5147") if rng.random() < 0.5 else hexc("#6d7568"))
    for _ in range(22):
        x = rng.uniform(0, w)
        clump(d, x, h * rng.uniform(0.0, 0.25), w * rng.uniform(0.10, 0.22), h * 0.08,
              MOSS, rng, lobes=14, r=h * 0.02)
    for _ in range(14):
        x = rng.uniform(0, w)
        strand(d, x, h * rng.uniform(0.0, 0.2), rng.uniform(h * 0.2, h * 0.5),
               hexc("#3d7a2c"), rng, thick=w * rng.uniform(0.008, 0.016))
    img = organic_edge(img, rng, 3.0, 14.0, 0.4)
    img = shade_v(img, 1.12, 0.70)
    img = rim(img, hexc("#c9dca0")[:3] + (120,), px=4, dy=1, soft=3)
    return fade_edge(fade_edge(img, 0.12, "left"), 0.12, "right")


def make_falls_anim():
    """Fios que descem em loop: repete no y."""
    w, h, rng = 256, 512, np.random.default_rng(199)
    g = (rng.random((3, 24)) * 255).astype(np.uint8)
    g = np.concatenate([g, g[:1]], axis=0)
    up = Image.fromarray(g).resize((w, h + h // 3), Image.BICUBIC).crop((0, 0, w, h))
    n = np.asarray(up, np.float32) / 255.0
    n2 = vnoise(h, w, 9, 2, rng)
    a = np.clip((n * 0.75 + n2 * 0.25 - 0.42) * 2.6, 0, 1)
    rgb = np.full((h, w, 3), 255, np.uint8)
    return Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]))


def make_sprites():
    save(radial(128, 1.5, hexc("#ffffff")), "mote.png")
    save(radial(256, 2.4, hexc("#ffffff")), "puff.png")
    save(radial(512, 1.6, hexc("#ffffff")), "glow.png")
    n = 256
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    u = (xx / n) * 2 - 1
    v = (yy / n)
    a = np.clip(1 - np.abs(u), 0, 1) ** 2.6 * np.clip(1 - v, 0, 1) ** 0.9
    a *= np.clip(yy / (n * 0.05), 0, 1)
    rgb = np.full((n, n, 3), 255, np.uint8)
    save(Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)])), "shaft.png")
    leaf = new(128, 128)
    big_leaf(ImageDraw.Draw(leaf), 128 * 0.08, 64, 128 * 0.84, 128 * 0.42, 0.0,
             hexc("#8cc05e"))
    save(leaf, "leaf.png")
    bf = new(128, 128)
    d = ImageDraw.Draw(bf)
    for sx in (-1, 1):
        _oval(d, 64 + sx * 26, 50, 30, 20, sx * 0.5, hexc("#ffffff"))
        _oval(d, 64 + sx * 20, 82, 20, 14, -sx * 0.4, hexc("#ffffff"))
    d.line([(64, 30), (64, 100)], fill=hexc("#404040"), width=5)
    save(bf, "butterfly.png")


if __name__ == "__main__":
    print("gerando camadas...")
    save(make_sky(), "sky.png")
    save(pad_v(make_canopy(), "top"), "l5_canopy.png")
    save(pad_v(make_far(), "top"), "l4_far.png")
    save(pad_v(make_mid(), "top"), "l3_mid.png")
    save(pad_v(make_near(), "top"), "l2_near.png")
    save(pad_v(make_back(), "top"), "l1_back.png")
    save(make_fg_side(211, False), "fg_left.png")
    save(make_fg_side(233, True), "fg_right.png")
    save(pad_v(make_fg_top(), "top"), "fg_top.png")
    save(pad_v(make_fg_bottom(), "bottom"), "fg_bottom.png")
    save(make_ground(), "ground.png")
    save(pad_v(make_fringe(), "top"), "fringe.png")
    save(make_falls(), "falls.png")
    save(make_cliff(), "cliff.png")
    save(make_falls_anim(), "falls_anim.png")
    make_sprites()
    print("ok")
