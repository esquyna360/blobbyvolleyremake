"""Gera as camadas pintadas do cenario de selva.

Composicao: o fundo e claro e luminoso, e o que vem na frente e silhueta cada
vez mais escura ate o primeiro plano quase preto. Sem esse degrau de valor a
mata vira uma parede so. Cada camada apoia numa linha de base que, no mundo, e
o y=0 -- o chao esconde o que sobra embaixo, entao os vaos entre as moitas
deixam ver a camada de tras.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stagelib import *  # noqa

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "stage")
os.makedirs(OUT, exist_ok=True)

W = 2048
MIST = hexc("#d9ecab")
SUN = hexc("#fdfacb")
RIM_WARM = hexc("#f2fbb4")
RIM_COOL = hexc("#9fe6c2")
SUN_U = 0.44  # onde a clareira abre; tudo que e luz aponta pra ca
BURY = 0.12  # fracao da altura que fica enterrada abaixo do y=0


def lighten(c, k):
    return tuple(min(255, int(v + (255 - v) * k)) for v in c[:3]) + (c[3],)


def save(img, name):
    img.save(os.path.join(OUT, name))
    print("  ", name, img.size)


def env(u, dip=0.45, width=0.24):
    """Clareira: a mata abaixa no meio da tela pra luz passar atras dos blobs."""
    return 1.0 - dip * math.exp(-(((u - SUN_U) / width) ** 2))


# ------------------------------------------------------------------ ceu

def make_sky():
    h = 1024
    stops = [(0.00, hexc("#04161a")), (0.26, hexc("#0d3a34")),
             (0.50, hexc("#2c7354")), (0.72, hexc("#8ec06c")),
             (0.88, hexc("#d8e8a4")), (1.00, hexc("#eef5c6"))]
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
    for (cx, cy, r, s) in [(SUN_U, 0.36, 0.95, 1.20), (SUN_U, 0.36, 0.34, 1.15),
                           (SUN_U, 0.36, 0.13, 1.70), (0.84, 0.54, 0.50, 0.34)]:
        dx = (xx / W - cx) * 2.1
        dy = (yy / h - cy)
        g = np.clip(1.0 - np.sqrt(dx * dx + dy * dy) / r, 0, 1) ** 2.3
        a += np.array(SUN[:3], np.float32) * (g * s)[..., None]

    for i in range(11):
        ang = -0.30 + i * 0.062 + rng.uniform(-0.012, 0.012)
        wdt = 0.012 + rng.random() * 0.030
        st = 0.30 + rng.random() * 0.55
        du = (xx / W - SUN_U) - (yy / h - 0.36) * math.tan(ang) * 0.9
        fall = np.clip((yy / h - 0.30) / 0.66, 0, 1) ** 0.7
        beam = np.exp(-((du / wdt) ** 2)) * fall * (1.0 - np.clip((yy / h - 0.86) / 0.14, 0, 1))
        a += np.array(SUN[:3], np.float32) * (beam * st)[..., None]

    n = vnoise(h, W, 260, 4, rng)
    band = np.clip((y[:, None] - 0.22) / 0.78, 0, 1) ** 1.1
    a += np.array(MIST[:3], np.float32) * ((n - 0.46) * 1.25 * band)[..., None]
    a = np.clip(a, 0, 255)
    img = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    return grain(img, 0.04, rng, 2.0)


# ------------------------------------------------------------- vegetacao

def palm(d, x, base, h, col, rng, lean, fronds=13, canopy=0.34):
    """Palmeira: folha arqueada que cai. Pouca folha e pouco arco vira
    cogumelo -- foi o que apareceu nas primeiras versoes."""
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
    """Fileira de troncos altos. A vertical repetida contra a luz e o que
    identifica floresta -- massa de folha sozinha vira nuvem verde."""
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


def bush_row(d, w, base, col, rng, n, scale, dip, gap=0.0):
    for i in range(n):
        x = (i + rng.uniform(-0.42, 0.42)) * w / n
        if rng.random() < gap:
            continue
        s = scale * env(x / w, dip) * rng.uniform(0.7, 1.35)
        wrapped(lambda xx: clump(d, xx, base - s * 0.34, s * 2.2, s * 1.25,
                                 col, rng, lobes=24, r=s * 0.30), x, w)


def fern_row(d, w, base, col, rng, n, scale, dip, gap=0.0):
    for i in range(n):
        x = (i + rng.uniform(-0.45, 0.45)) * w / n
        if rng.random() < gap:
            continue
        s = scale * env(x / w, dip) * rng.uniform(0.75, 1.3)
        wrapped(lambda xx: fern(d, xx, base, s, -math.pi / 2, col, rng, n=7), x, w)


def moss_curtain(d, w, top, col, rng, n, length, thick, dip):
    for i in range(n):
        x = rng.uniform(0, w)
        if rng.random() > env(x / w, dip * 0.9):
            continue
        wrapped(lambda xx: strand(d, xx, top + rng.uniform(-8, 26),
                                  length * rng.uniform(0.45, 1.25), col, rng,
                                  thick=thick * rng.uniform(0.6, 1.5)), x, w)


PADK = 1.05


def pad_v(img, side="top"):
    """Faixa transparente na borda. A textura repete no eixo x, entao o mipmap
    tambem enrola no y e puxa o lado cheio para o lado vazio: a sobra some com
    a folga, e o quad cresce o mesmo tanto para ela ficar fora da tela."""
    w, h = img.size
    n = int(round(h * (PADK - 1.0)))
    out = new(w, h + n)
    out.paste(img, (0, n if side == "top" else 0))
    return out


def finish(img, rng, rim_col, rim_px, mist, blur_px, shade=(1.15, 0.62), rim_a=235,
           fray=(9.0, 30.0, 1.0), warm=None, sun=0.0, sat=1.18):
    img = organic_edge(img, rng, *fray)
    img = shade_v(img, shade[0], shade[1])
    if warm:
        img = hue_noise(img, rng, warm, 200.0, 0.85)
    if sun:
        img = sun_grad(img, SUN_U, SUN, sun)
    if rim_col:
        img = rim(img, rim_col[:3] + (rim_a,), px=rim_px, dy=1, soft=max(2, rim_px // 2))
    if mist:
        img = tint_mist(img, MIST, mist)
    img = grain(img, 0.07, rng, 3.0)
    img = saturate(img, sat)
    return blur(img, blur_px)


def make_canopy():
    """Teto distante: massa clara e fora de foco. Ela e luz, nao silhueta."""
    h, rng = 520, np.random.default_rng(11)
    col = hexc("#b3d489")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * 0.16, col, rng, 30, h * 0.020, 0.12, canopy=0.22)
    ridge_band(d, W, h * 0.30, h * 0.10, 300, col, rng, -20, int(h * 0.10))
    bush_row(d, W, base, col, rng, 26, h * 0.16, 0.30, gap=0.25)
    return finish(img, rng, None, 0, 0.46, 6.0, shade=(1.04, 0.86),
                  fray=(3.0, 16.0, 0.45), warm=hexc("#cfe093"), sun=0.34, sat=1.06)


def make_far():
    h, rng = 640, np.random.default_rng(23)
    col = hexc("#79a862")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * 0.02, col, rng, 22, h * 0.026, 0.10, canopy=0.20)
    for i in range(7):
        x = (i + rng.uniform(-0.4, 0.4)) * W / 7
        hh = base * rng.uniform(0.50, 0.80) * env(x / W, 0.34)
        wrapped(lambda xx: palm(d, xx, base, hh, col, rng,
                                rng.uniform(-0.22, 0.22)), x, W)
    moss_curtain(d, W, h * 0.10, col, rng, 14, h * 0.26, h * 0.010, 0.4)
    bush_row(d, W, base, col, rng, 22, h * 0.14, 0.40, gap=0.3)
    return finish(img, rng, RIM_WARM, 4, 0.30, 3.2, shade=(1.06, 0.76), rim_a=100,
                  fray=(3.0, 15.0, 0.42), warm=hexc("#9cc06b"), sun=0.28, sat=1.10)


def make_mid():
    """Primeira camada que le como silhueta: troncos e cortinas de musgo."""
    h, rng = 700, np.random.default_rng(37)
    col = hexc("#33654a")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * -0.05, col, rng, 12, h * 0.038, 0.10, canopy=0.17)
    for i in range(6):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 6
        hh = base * rng.uniform(0.52, 0.82) * env(x / W, 0.44)
        fn = palm if rng.random() < 0.7 else broadleaf_tree
        wrapped(lambda xx: fn(d, xx, base, hh, col, rng, rng.uniform(-0.3, 0.3)), x, W)
    moss_curtain(d, W, h * 0.04, col, rng, 24, h * 0.32, h * 0.013, 0.5)
    bush_row(d, W, base, col, rng, 18, h * 0.13, 0.46, gap=0.32)
    fern_row(d, W, base, col, rng, 14, h * 0.14, 0.46, gap=0.35)
    return finish(img, rng, RIM_WARM, 4, 0.14, 1.6, shade=(1.12, 0.66), rim_a=135,
                  fray=(2.5, 13.0, 0.40), warm=hexc("#4f8a50"), sun=0.20, sat=1.14)


def make_near():
    h, rng = 560, np.random.default_rng(53)
    col = hexc("#173b2c")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    trunk_row(d, W, base, h * -0.15, col, rng, 5, h * 0.055, 0.08)
    for i in range(5):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 5
        hh = base * rng.uniform(0.54, 0.84) * env(x / W, 0.55)
        wrapped(lambda xx: palm(d, xx, base, hh, col, rng,
                                rng.uniform(-0.34, 0.34), fronds=11, canopy=0.38), x, W)
    moss_curtain(d, W, h * 0.0, col, rng, 16, h * 0.30, h * 0.015, 0.55)
    bush_row(d, W, base, col, rng, 16, h * 0.19, 0.50, gap=0.30)
    fern_row(d, W, base, col, rng, 13, h * 0.20, 0.50, gap=0.30)
    return finish(img, rng, RIM_WARM, 3, 0.05, 0.0, shade=(1.2, 0.6), rim_a=115,
                  fray=(2.5, 12.0, 0.38), warm=hexc("#24543a"), sun=0.13, sat=1.18)


def make_back():
    """Linha de mato rente a quadra. Tem vao entre as moitas de proposito:
    e por eles que a luz do fundo aparece atras dos jogadores."""
    h, rng = 420, np.random.default_rng(71)
    col = hexc("#0b1f18")
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * (1.0 - BURY)
    bush_row(d, W, base, col, rng, 15, h * 0.34, 0.55, gap=0.24)
    fern_row(d, W, base, col, rng, 15, h * 0.34, 0.55, gap=0.22)
    for i in range(22):
        x = rng.uniform(0, W)
        s = env(x / W, 0.5)
        wrapped(lambda xx: big_leaf(d, xx, base - h * rng.uniform(0.02, 0.22) * s,
                                    h * rng.uniform(0.20, 0.40) * s,
                                    h * rng.uniform(0.09, 0.17) * s,
                                    rng.uniform(-2.5, -0.6), col, notch=0.22), x, W)
    for i in range(10):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.14, 0.34),
                                h * rng.uniform(0.06, 0.15), col, rng), x, W)
    return finish(img, rng, RIM_COOL, 3, 0.0, 0.0, shade=(1.5, 0.6), rim_a=95,
                  fray=(2.2, 11.0, 0.36), warm=hexc("#123424"), sun=0.09, sat=1.2)


# --------------------------------------------------------- primeiro plano

FG = hexc("#040b09")
FG_RIM = hexc("#376a4f")


def make_fg_side(seed, flip):
    w, h, rng = 660, 1152, np.random.default_rng(seed)
    img = new(w, h)
    d = ImageDraw.Draw(img)
    for _ in range(11):
        y = rng.uniform(-h * 0.04, h * 1.04)
        L = w * rng.uniform(0.45, 0.95)
        big_leaf(d, -w * 0.16, y, L, L * rng.uniform(0.30, 0.44),
                 rng.uniform(-0.8, 0.8), FG, notch=0.22)
    for _ in range(6):
        y = rng.uniform(h * 0.12, h * 1.0)
        fern(d, -w * 0.10, y, w * rng.uniform(0.38, 0.66), 0.0, FG, rng, n=6)
    for _ in range(10):
        x = rng.uniform(-w * 0.08, w * 0.40)
        strand(d, x, -h * 0.02, rng.uniform(h * 0.12, h * 0.48), FG, rng,
               thick=w * rng.uniform(0.018, 0.038))
    for _ in range(3):
        mushroom(d, rng.uniform(0, w * 0.30), h * 1.02,
                 w * rng.uniform(0.14, 0.26), FG, FG, rng)
    rock(d, w * 0.02, h * 1.03, w * 0.8, h * 0.12, FG, rng)
    img = fill_from(img, FG, 'left')
    img = organic_edge(img, rng, 3.0, 14.0, 0.42)
    img = fade_edge(rim(img, FG_RIM[:3] + (175,), px=4, dy=1, soft=3), 0.10, 'right')
    return img.transpose(Image.FLIP_LEFT_RIGHT) if flip else img


def make_fg_top():
    """Copa fechada em cima. Folha recortada em cima vira dente de serra; aqui
    e massa cheia com cipo e musgo pendurado, que e o que as referencias tem."""
    h, rng = 640, np.random.default_rng(97)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, h * 0.20], fill=FG)
    ridge_band(d, W, h * 0.36, h * 0.12, 470, FG, rng, -20, int(h * 0.13))
    ridge_band(d, W, h * 0.30, h * 0.09, 260, FG, rng, -20, int(h * 0.09), phase=2.1)
    for _ in range(34):
        x = rng.uniform(0, W)
        s2 = h * rng.uniform(0.16, 0.36)
        wrapped(lambda xx: clump(d, xx, h * rng.uniform(0.22, 0.38), s2 * 2.0,
                                 s2 * 1.1, FG, rng, lobes=16, r=s2 * 0.32), x, W)
    for _ in range(90):
        x = rng.uniform(0, W)
        wrapped(lambda xx: strand(d, xx, h * rng.uniform(0.12, 0.40),
                                  rng.uniform(h * 0.10, h * 0.55), FG, rng,
                                  thick=h * rng.uniform(0.005, 0.016)), x, W)
    for _ in range(22):
        x = rng.uniform(0, W)
        L = h * rng.uniform(0.20, 0.44)
        wrapped(lambda xx: big_leaf(d, xx, h * rng.uniform(0.20, 0.34), L,
                                    L * rng.uniform(0.26, 0.40),
                                    rng.uniform(1.24, 1.90), FG, notch=0.0), x, W)
    img = organic_edge(img, rng, 3.0, 15.0, 0.42)
    return rim(img, FG_RIM[:3] + (160,), px=3, dy=1, soft=2)


def fade_center(img, keep=0.28, soft=0.20):
    w, h = img.size
    u = np.linspace(0, 1, w, dtype=np.float32)
    k = np.clip((np.abs(u - 0.5) - keep) / soft, 0, 1) ** 0.8
    a = np.asarray(img.split()[3], np.float32) * k[None, :]
    out = img.copy()
    out.putalpha(Image.fromarray(a.astype(np.uint8)))
    return out


def make_fg_bottom():
    """Mato rente a camera. Abaixa no meio pra quadra ficar limpa."""
    h, rng = 380, np.random.default_rng(131)
    img = new(W, h)
    d = ImageDraw.Draw(img)

    def top_at(u):
        return h * (0.30 + 0.52 * math.exp(-(((u - 0.5) / 0.30) ** 2)))

    for i in range(70):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 70
        u = x / W
        s2 = h * rng.uniform(0.16, 0.34) * (1.0 - 0.5 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        base = top_at(u) + s2 * 0.9
        wrapped(lambda xx: clump(d, xx, base - s2 * 0.5, s2 * 2.0, s2 * 1.2,
                                 FG, rng, lobes=18, r=s2 * 0.3), x, W)
    for i in range(90):
        x = (i + rng.uniform(-0.45, 0.45)) * W / 90
        u = x / W
        s2 = h * rng.uniform(0.18, 0.40) * (1.0 - 0.5 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        wrapped(lambda xx: fern(d, xx, top_at(u) + s2 * 0.75, s2, -math.pi / 2,
                                FG, rng, n=6), x, W)
    for _ in range(26):
        x = rng.uniform(0, W)
        u = x / W
        L = h * rng.uniform(0.24, 0.5) * (1.0 - 0.45 * math.exp(-(((u - 0.5) / 0.30) ** 2)))
        wrapped(lambda xx: big_leaf(d, xx, top_at(u) + L * 0.5, L, L * 0.36,
                                    rng.uniform(-2.4, -0.7), FG, notch=0.14), x, W)
    img = fill_from(img, FG, "bottom")
    img = organic_edge(img, rng, 3.0, 13.0, 0.42)
    return rim(img, FG_RIM[:3] + (150,), px=4, dy=1, soft=3)


# ------------------------------------------------------------------ chao

def make_ground():
    """Chao da clareira: terra batida com musgo. Vai em perspectiva, entao a
    variacao grande importa mais que o detalhe fino."""
    n, rng = 1024, np.random.default_rng(151)
    base = np.array(hexc("#43401f")[:3], float)
    dark = np.array(hexc("#141a11")[:3], float)
    moss = np.array(hexc("#2b4a24")[:3], float)
    wet = np.array(hexc("#3a3524")[:3], float)
    a = vnoise(n, n, 100, 5, rng)
    b = vnoise(n, n, 13, 4, rng)
    m = vnoise(n, n, 190, 3, rng)
    p = vnoise(n, n, 5, 2, rng)
    col = base[None, None, :] + (dark - base)[None, None, :] \
        * ((a * 0.70 + b * 0.30) - 0.44)[..., None] * 1.8
    wk = np.clip((a - 0.52) * 3.0, 0, 1)[..., None]
    col = col * (1 - wk * 0.5) + wet[None, None, :] * (wk * 0.5)
    mk = np.clip((m - 0.74) * 5.0, 0, 1)[..., None]
    col = col * (1 - mk) + moss[None, None, :] * mk
    col = np.clip(col * (0.74 + p[..., None] * 0.52), 0, 255)
    img = Image.fromarray(np.dstack([col.astype(np.uint8),
                                     np.full((n, n), 255, np.uint8)]))
    d = ImageDraw.Draw(img)
    for _ in range(120):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        r = rng.uniform(2.0, 7.0)
        c = lighten(hexc("#3f3d2c"), rng.uniform(0.0, 0.22))
        wrapped(lambda xx: d.ellipse([xx - r, y - r * 0.8, xx + r, y + r * 0.8],
                                     fill=c), x, n)
        wrapped(lambda xx: d.ellipse([xx - r, y - r * 0.8 - r * 0.35,
                                      xx + r, y + r * 0.4], fill=lighten(c, 0.14)),
                x, n)
    for _ in range(140):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        L = rng.uniform(7, 22)
        a = rng.uniform(0, 6.28)
        c = hexc("#5a4e2c") if rng.random() < 0.6 else hexc("#6b5a2e")
        wrapped(lambda xx: big_leaf(d, xx, y, L, L * 0.42, a, c, notch=0.18), x, n)
    for _ in range(90):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        s2 = rng.uniform(10, 26)
        wrapped(lambda xx: fern(d, xx, y, s2, -math.pi / 2,
                                hexc("#33481f"), rng, n=5), x, n)
    img = dapple(img, rng, hexc("#7d6c33"), 110.0, 0.46, 0.58)
    img = dapple(img, rng, hexc("#0d1209"), 70.0, 0.50, 0.58)
    img = dapple(img, rng, hexc("#232d18"), 170.0, 0.46, 0.54)
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
    """Franja de capim: quebra a reta onde o chao encosta na mata."""
    h, rng = 256, np.random.default_rng(181)
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.02
    for c, n, sc in ((hexc("#07130e"), 130, 0.95), (hexc("#0d2317"), 95, 0.72),
                     (hexc("#17331f"), 60, 0.5)):
        for _ in range(n):
            x = rng.uniform(0, W)
            wrapped(lambda xx: fern(d, xx, base, h * sc * rng.uniform(0.5, 1.0),
                                    -math.pi / 2, c, rng, n=5), x, W)
    return img


def make_sprites():
    save(radial(128, 1.5, hexc("#ffffff")), "mote.png")
    save(radial(256, 2.4, hexc("#ffffff")), "puff.png")
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
    make_sprites()
    print("ok")
