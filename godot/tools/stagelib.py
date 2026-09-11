"""Ferramentas de pintura pras camadas do cenario.

A ideia toda e silhueta: massa escura embaixo, luz de borda em cima. E a luz de
borda que faz folhagem parecer pintada em vez de recortada.
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops


def new(w, h, col=(0, 0, 0, 0)):
    return Image.new("RGBA", (w, h), col)


def vnoise(h, w, scale, octaves=4, rng=None):
    rng = rng or np.random.default_rng(0)
    out = np.zeros((h, w), np.float32)
    amp, tot, s = 1.0, 0.0, float(scale)
    for _ in range(octaves):
        gh, gw = max(2, int(h / s)), max(2, int(w / s))
        g = (rng.random((gh, gw)) * 255).astype(np.uint8)
        # a coluna extra repete a primeira: sem isso o ruido nao fecha e a
        # camada, que e repetida na horizontal, ganha uma emenda visivel
        g = np.concatenate([g, g[:, :1]], axis=1)
        ww = w + max(1, int(round(w / gw)))
        up = Image.fromarray(g).resize((ww, h), Image.BICUBIC).crop((0, 0, w, h))
        out += np.asarray(up, np.float32) / 255.0 * amp
        tot += amp
        amp *= 0.5
        s = max(2.0, s * 0.5)
    return out / tot


def wrapped(fn, x, w, *a, **k):
    """Desenha o elemento tres vezes pra textura fechar na horizontal."""
    for dx in (-w, 0, w):
        fn(x + dx, *a, **k)


def lerp_col(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def hexc(s, a=255):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


# ---------------------------------------------------------------- massas


def lobe(d, x, y, r, col, squash=0.86):
    d.ellipse([x - r, y - r * squash, x + r, y + r * squash], fill=col)


def lobe_mass(d, pts, r, col, rng, jitter=0.3, squash=0.86):
    for (x, y) in pts:
        rr = r * rng.uniform(1.0 - jitter, 1.0 + jitter)
        lobe(d, x, y, rr, col, squash)


def clump(d, cx, cy, w, h, col, rng, lobes=26, r=None):
    """Moita: elipses sobrepostas dentro de um envelope eliptico."""
    r = r or h * 0.30
    for _ in range(lobes):
        a = rng.uniform(0, math.tau)
        u = math.sqrt(rng.random())
        x = cx + math.cos(a) * u * w * 0.5
        y = cy + math.sin(a) * u * h * 0.5
        lobe(d, x, y, r * rng.uniform(0.55, 1.15), col)


def ridge_band(d, w, y0, amp, period, col, rng, fill_to, lobes_r, phase=0.0):
    """Faixa de copa: uma linha ondulada virada em massa de folhas."""
    step = max(6, int(lobes_r * 0.55))
    for x in range(-lobes_r, w + lobes_r, step):
        t = x / period
        y = y0 - (math.sin(t + phase) * 0.55 + math.sin(t * 2.3 + phase * 1.7) * 0.3
                  + math.sin(t * 0.41 + phase) * 0.15) * amp
        y += rng.uniform(-amp * 0.10, amp * 0.10)
        lobe(d, x, y, lobes_r * rng.uniform(0.8, 1.25), col)
        y0, y1 = (y, fill_to) if fill_to >= y else (fill_to, y)
        d.rectangle([x - lobes_r, y0, x + lobes_r, y1], fill=col)


# ---------------------------------------------------------------- plantas


def trunk(d, x, ybase, h, wbase, col, rng, lean=0.0, taper=0.32):
    n = 14
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = ybase - h * t
        ww = wbase * (1.0 - t * (1.0 - taper))
        cx = x + lean * h * t * t + math.sin(t * 3.1 + x * 0.01) * wbase * 0.55
        left.append((cx - ww * 0.5, y))
        right.append((cx + ww * 0.5, y))
    d.polygon(left + right[::-1], fill=col)
    # raizes
    for _ in range(3):
        a = rng.uniform(-1.25, 1.25)
        ln = wbase * rng.uniform(1.4, 3.0)
        d.polygon([(x - wbase * 0.4, ybase), (x + wbase * 0.4, ybase),
                   (x + math.sin(a) * ln, ybase - abs(math.cos(a)) * ln * 0.35)], fill=col)


def frond(d, x, y, length, ang, col, rng, leaflets=16, droop=0.9):
    """Folha de palmeira: nervura curva com foliolos ovais dos dois lados."""
    pts = []
    for i in range(leaflets + 1):
        t = i / leaflets
        a = ang + droop * t * t
        pts.append((x + math.cos(a) * length * t, y + math.sin(a) * length * t))
    for i in range(1, leaflets + 1):
        t = i / leaflets
        px, py = pts[i]
        ln = length * 0.34 * math.sin(math.pi * min(1.0, t * 1.1)) ** 0.7
        ln *= rng.uniform(0.8, 1.15)
        wd = ln * 0.30
        for sgn in (-1, 1):
            a2 = ang + droop * t * t + sgn * (0.75 + t * 0.55)
            ex, ey = px + math.cos(a2) * ln * 0.5, py + math.sin(a2) * ln * 0.5
            _oval(d, ex, ey, ln * 0.5, wd, a2, col)
    d.line(pts, fill=col, width=max(2, int(length * 0.016)), joint="curve")


def _oval(d, cx, cy, rx, ry, ang, col, n=16):
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(n):
        a = math.tau * i / n
        px, py = math.cos(a) * rx, math.sin(a) * ry
        pts.append((cx + px * ca - py * sa, cy + px * sa + py * ca))
    d.polygon(pts, fill=col)


def big_leaf(d, x, y, length, width, ang, col, notch=0.0):
    """Folha larga tipo bananeira, com recorte opcional na borda."""
    pts = []
    n = 26
    for i in range(n + 1):
        t = i / n
        wv = math.sin(math.pi * t) ** 0.8
        cut = 1.0 - notch * abs(math.sin(t * 9.0)) * wv
        pts.append((t * length, wv * width * 0.5 * cut))
    for i in range(n, -1, -1):
        t = i / n
        wv = math.sin(math.pi * t) ** 0.8
        cut = 1.0 - notch * abs(math.sin(t * 9.0 + 1.6)) * wv
        pts.append((t * length, -wv * width * 0.5 * cut))
    ca, sa = math.cos(ang), math.sin(ang)
    d.polygon([(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in pts], fill=col)


def fern(d, x, y, size, ang, col, rng, n=7):
    for i in range(n):
        a = ang + (i / max(1, n - 1) - 0.5) * 1.5
        frond(d, x, y, size * rng.uniform(0.72, 1.0), a, col, rng,
              leaflets=11, droop=0.55 * (1 if a > ang else -1) + 0.35)


def strand(d, x, y0, length, col, rng, thick=None, lobes=True):
    """Cipo pendente. Uma fita que afina pra ponta -- lobo solto em fila vira
    colar de contas, que foi o que aconteceu na primeira versao."""
    n = 26
    thick = thick or max(2.5, length * 0.05)
    sway = rng.uniform(0.08, 0.26) * length
    ph = rng.uniform(0, 6.28)
    bump = rng.uniform(6.0, 11.0)
    left, right, tip = [], [], None
    for i in range(n + 1):
        t = i / n
        cx = x + math.sin(t * 2.4 + ph) * sway * t * t
        cy = y0 + length * t
        ww = thick * (1.0 - t) ** 0.55
        if lobes:
            ww *= 1.0 + 0.38 * math.sin(t * bump + ph)
        left.append((cx - ww, cy))
        right.append((cx + ww, cy))
        tip = (cx, cy)
    d.polygon(left + right[::-1], fill=col)
    d.ellipse([tip[0] - thick * 0.22, tip[1] - thick * 0.5,
               tip[0] + thick * 0.22, tip[1] + thick * 0.9], fill=col)


def mushroom(d, x, y, size, cap, stem, rng):
    sw = size * 0.22
    d.polygon([(x - sw * 0.5, y), (x + sw * 0.5, y),
               (x + sw * 0.34, y - size * 0.62), (x - sw * 0.34, y - size * 0.62)], fill=stem)
    d.ellipse([x - size * 0.5, y - size * 0.62 - size * 0.30,
               x + size * 0.5, y - size * 0.62 + size * 0.22], fill=cap)


def rock(d, x, y, w, h, col, rng):
    pts = []
    n = 9
    for i in range(n):
        a = math.pi * (i / (n - 1))
        rr = rng.uniform(0.78, 1.06)
        pts.append((x + math.cos(math.pi - a) * w * 0.5 * rr, y - math.sin(a) * h * rr))
    d.polygon([(x - w * 0.5, y)] + pts + [(x + w * 0.5, y)], fill=col)


# ---------------------------------------------------------------- acabamento


def shade_v(img, top_mul, bot_mul, power=1.0):
    """Escurece de cima pra baixo dentro do alpha. Da volume a massa chapada."""
    a = np.asarray(img, np.float32)
    h = a.shape[0]
    t = (np.linspace(0.0, 1.0, h, dtype=np.float32) ** power)[:, None, None]
    mul = top_mul + (bot_mul - top_mul) * t
    a[..., :3] = np.clip(a[..., :3] * mul, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def rim(img, col, px=7, dy=-1, dx=0, soft=3, strength=1.0):
    """Luz na borda de cima: o contorno claro que separa uma camada da outra."""
    a = img.split()[3]
    shifted = ImageChops.offset(a, dx * px, dy * px)
    edge = ImageChops.subtract(a, shifted)
    if soft:
        edge = edge.filter(ImageFilter.GaussianBlur(soft))
    edge = edge.point(lambda v: int(min(255, v * strength)))
    layer = Image.new("RGBA", img.size, col)
    layer.putalpha(ImageChops.multiply(edge, a))
    return Image.alpha_composite(img, layer)


def inner_dark(img, col, px=26, strength=0.55):
    """Oclusao: a base de cada massa afunda."""
    a = img.split()[3]
    up = ImageChops.offset(a, 0, -px).filter(ImageFilter.GaussianBlur(px * 0.6))
    edge = ImageChops.subtract(a, ImageChops.subtract(a, up))
    edge = ImageChops.invert(edge).point(lambda v: int(v * strength))
    layer = Image.new("RGBA", img.size, col)
    layer.putalpha(ImageChops.multiply(edge, a))
    return Image.alpha_composite(img, layer)


def tint_mist(img, col, amount):
    a = np.asarray(img, np.float32)
    c = np.array(col[:3], np.float32)
    a[..., :3] = a[..., :3] * (1.0 - amount) + c * amount
    return Image.fromarray(a.astype(np.uint8))


def grain(img, amt, rng, scale=3.0):
    a = np.asarray(img, np.float32)
    n = vnoise(a.shape[0], a.shape[1], scale, 3, rng)[..., None]
    a[..., :3] = np.clip(a[..., :3] * (1.0 - amt + n * amt * 2.0), 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def blur(img, r):
    if r <= 0:
        return img
    w, h = img.size
    return tile3(img).filter(ImageFilter.GaussianBlur(r)).crop((w, 0, 2 * w, h))


def glow_add(img, radius, strength):
    g = img.filter(ImageFilter.GaussianBlur(radius))
    a = np.asarray(img, np.float32)
    b = np.asarray(g, np.float32)
    a[..., :3] = np.clip(a[..., :3] + b[..., :3] * (b[..., 3:4] / 255.0) * strength, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def speckle_top(img, col, n, rng, r_range=(3, 9), band=0.30):
    """Pontos claros na borda de cima das massas: e o que da textura de musgo."""
    a = np.asarray(img.split()[3], np.uint8)
    h, w = a.shape
    ys, xs = np.nonzero(a > 60)
    if len(xs) == 0:
        return img
    top = {}
    for x, y in zip(xs, ys):
        if x not in top or y < top[x]:
            top[x] = y
    keys = np.array(sorted(top.keys()))
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for _ in range(n):
        x = int(rng.choice(keys))
        y0 = top[x]
        y = y0 + rng.random() ** 2 * h * band
        r = rng.uniform(*r_range)
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=col)
    lay.putalpha(ImageChops.multiply(lay.split()[3], img.split()[3]))
    return Image.alpha_composite(img, lay)


def extend_base(img, px):
    """Estica a ultima linha pra baixo: a base da camada some atras da da frente."""
    w, h = img.size
    out = Image.new("RGBA", (w, h + px), (0, 0, 0, 0))
    out.alpha_composite(img, (0, 0))
    strip = img.crop((0, h - 2, w, h)).resize((w, px), Image.NEAREST)
    out.alpha_composite(strip, (0, h))
    return out


def fade_edge(img, frac, side="bottom"):
    """Apaga a borda da imagem. Sem isso o elemento cortado deixa uma linha
    reta atravessando a tela."""
    w, h = img.size
    a = np.asarray(img.split()[3], np.float32)
    n = max(1, int((h if side in ("bottom", "top") else w) * frac))
    ramp = np.linspace(0, 1, n, dtype=np.float32) ** 0.8
    if side == "bottom":
        a[h - n:, :] *= ramp[::-1][:, None]
    elif side == "top":
        a[:n, :] *= ramp[:, None]
    elif side == "left":
        a[:, :n] *= ramp[None, :]
    else:
        a[:, w - n:] *= ramp[::-1][None, :]
    out = img.copy()
    out.putalpha(Image.fromarray(a.astype(np.uint8)))
    return out


def saturate(img, k):
    a = np.asarray(img, np.float32)
    lum = (a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114)[..., None]
    a[..., :3] = np.clip(lum + (a[..., :3] - lum) * k, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def tile3(img):
    """Triplica na horizontal. Filtro de vizinhanca (blur) nao enxerga alem da
    borda: rodando no triplo e cortando o meio, a camada continua fechando."""
    w, h = img.size
    out = Image.new("RGBA", (w * 3, h))
    for i in range(3):
        out.paste(img, (i * w, 0))
    return out


def organic_edge(img, rng, r=9.0, scale=30.0, amount=1.0):
    """Esfarela o contorno. Massa feita de elipse tem borda festonada de
    biscoito; o ruido no limiar do alpha devolve borda de folhagem."""
    w, h = img.size
    big = tile3(img).split()[3].filter(ImageFilter.GaussianBlur(r))
    a = np.asarray(big, np.float32)[:, w:2 * w] / 255.0
    n = vnoise(h, w, scale, 4, rng)
    e = np.clip((a - 0.5 + (n - 0.5) * amount * 0.6) * 5.0 + 0.5, 0, 1)
    out = img.copy()
    out.putalpha(Image.fromarray((e * 255).astype(np.uint8)))
    return out


def hue_noise(img, rng, col2, scale=170.0, amount=1.0):
    """Mancha grande de outra cor dentro da massa: sem isso a camada inteira
    fica de uma cor so e le como papel recortado."""
    a = np.asarray(img, np.float32)
    n = vnoise(a.shape[0], a.shape[1], scale, 3, rng)[..., None]
    k = np.clip((n - 0.42) * 2.2, 0, 1) * amount
    a[..., :3] = a[..., :3] * (1 - k) + np.array(col2[:3], np.float32) * k
    return Image.fromarray(a.astype(np.uint8))


def sun_grad(img, sun_u, col, k=0.5, width=0.30):
    """Quem esta perto da clareira pega luz: separa a camada em profundidade
    mesmo com uma cor base so."""
    w = img.size[0]
    u = np.linspace(0, 1, w, dtype=np.float32)
    # periodico de proposito: gaussiano nao fecha, e a camada e repetida
    lobe_ = 0.5 + 0.5 * np.cos(2 * np.pi * (u - sun_u))
    g = (lobe_ ** max(1.0, 0.35 / width) * k)[None, :, None]
    a = np.asarray(img, np.float32)
    a[..., :3] = np.clip(a[..., :3] * (1 - g) + np.array(col[:3], np.float32) * g, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def dapple(img, rng, col, scale, amount, thresh=0.60):
    a = np.asarray(img, np.float32)
    n = vnoise(a.shape[0], a.shape[1], scale, 3, rng)[..., None]
    k = np.clip((n - thresh) * 4.0, 0, 1) * amount
    a[..., :3] = np.clip(a[..., :3] * (1 - k) + np.array(col[:3], np.float32) * k, 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def fill_from(img, col, side="bottom"):
    """Preenche solido a partir da primeira coisa desenhada em cada coluna (ou
    linha). Massa recortada na borda da tela vira mancha solta; isso amarra
    tudo na borda de onde a camada nasce."""
    a = np.asarray(img.split()[3], np.uint8)
    m = a > 40
    if side == "bottom":
        f = np.cumsum(m, axis=0) > 0
    elif side == "top":
        f = np.cumsum(m[::-1], axis=0)[::-1] > 0
    elif side == "left":
        f = np.cumsum(m[:, ::-1], axis=1)[:, ::-1] > 0
    else:
        f = np.cumsum(m, axis=1) > 0
    out = np.asarray(img, np.uint8).copy()
    for i in range(3):
        out[..., i][f] = col[i]
    out[..., 3][f] = 255
    return Image.fromarray(out)
