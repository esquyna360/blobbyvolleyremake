"""Cenarios 4-8: acampamento (noite), neve (pinhal), ruinas, telhado, caverna.
So o que e pintado: ceu, camadas em silhueta, chao. O resto e objeto 3D."""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stagelib import *  # noqa
import make_stage as ms
from make_stage import pad_v, finish, W, darken
from make_beach import grad

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "stage")


def save(img, sub, name):
    d = os.path.join(ROOT, sub)
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, name))
    print("  %s/%s %s" % (sub, name, img.size))


def stars(a, rng, n, ymax, bright=255):
    h, w = a.shape[:2]
    for _ in range(n):
        x, y = int(rng.uniform(0, w)), int(rng.uniform(0, h * ymax))
        r = int(rng.integers(0, 2))
        v = rng.uniform(0.4, 1.0) * bright
        a[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1] = np.maximum(
            a[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1], v)
    return a


def moon(img, u, v, r, col, halo):
    d = ImageDraw.Draw(img)
    w, h = img.size
    cx, cy = u * w, v * h
    glow = new(w, h)
    gd = ImageDraw.Draw(glow)
    for k in range(6, 0, -1):
        rr = r * (1 + k * 0.55)
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=halo[:3] + (int(18 + 8 * (6 - k)),))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    for _ in range(5):
        rng = np.random.default_rng(int(cx) + _)
        ox, oy, rr = rng.uniform(-0.5, 0.5) * r, rng.uniform(-0.5, 0.5) * r, rng.uniform(0.08, 0.2) * r
        d.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr], fill=darken(col, 0.9))
    return img


def pine(d, x, base, h, col, rng, cap=None, layers=5, width=0.42):
    tw = h * 0.06
    d.rectangle([x - tw, base - h * 0.25, x + tw, base], fill=col)
    for i in range(layers):
        t = i / layers
        y = base - h * (0.18 + 0.82 * t)
        ww = h * width * (1.0 - t * 0.78) * rng.uniform(0.9, 1.1)
        hh = h * 0.30 * (1.0 - t * 0.35)
        d.polygon([(x - ww, y), (x, y - hh), (x + ww, y)], fill=col)
        if cap:
            d.polygon([(x - ww * 0.9, y - hh * 0.05), (x, y - hh), (x + ww * 0.9, y - hh * 0.05),
                       (x + ww * 0.6, y - hh * 0.25), (x, y - hh * 0.7), (x - ww * 0.6, y - hh * 0.25)],
                      fill=cap)


def pine_row(h, rng, col, n, hmin, hmax, cap=None, gap=0.0):
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.03
    for i in range(n):
        u = (i + rng.uniform(0.1, 0.9)) / n
        if gap and abs(u - 0.5) < gap:
            continue
        wrapped(lambda xx: pine(d, xx, base, h * rng.uniform(hmin, hmax), col, rng, cap), u * W, W)
    return img


def mountains(h, rng, col, n, amp, snow=None, jag=0.35):
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.05
    for i in range(n):
        x = (i + rng.uniform(0.2, 0.8)) / n * W
        w = W / n * rng.uniform(1.4, 2.4)
        hh = h * amp * rng.uniform(0.6, 1.0)
        pts = []
        k = 18
        for j in range(k + 1):
            t = j / k
            yy = base - hh * (1 - abs(2 * t - 1)) ** 0.8 * (1 + jag * math.sin(t * 23 + i) * 0.15)
            pts.append((x - w * 0.5 + w * t, yy))
        poly = [(x - w * 0.5, base + 5)] + pts + [(x + w * 0.5, base + 5)]
        wrapped(lambda xx: d.polygon([(p[0] - x + xx, p[1]) for p in poly], fill=col), x, W)
        if snow:
            top = [p for p in pts if p[1] < base - hh * 0.62]
            if len(top) > 2:
                cap = top + [(top[-1][0], top[-1][1] + hh * 0.12), (top[0][0], top[0][1] + hh * 0.12)]
                wrapped(lambda xx: d.polygon([(p[0] - x + xx, p[1]) for p in cap], fill=snow), x, W)
    return img


def rock_row(h, rng, col, n):
    img = new(W, h)
    d = ImageDraw.Draw(img)
    base = h * 1.05
    for _ in range(n):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(d, xx, base, h * rng.uniform(0.25, 0.7), h * rng.uniform(0.18, 0.45),
                                col, rng), x, W)
    return img


def ground_noise(n, rng, base, dark, scale=(100, 13), mix=(0.7, 0.3), k=1.5):
    base = np.array(base[:3], float)
    dark = np.array(dark[:3], float)
    a = vnoise(n, n, scale[0], 5, rng)
    b = vnoise(n, n, scale[1], 4, rng)
    col = base[None, None, :] + (dark - base)[None, None, :] * ((a * mix[0] + b * mix[1]) - 0.44)[..., None] * k
    return np.clip(col, 0, 255)


def to_img(col, n):
    return Image.fromarray(np.dstack([col.astype(np.uint8), np.full((n, n), 255, np.uint8)]))


# ----------------------------------------------------------------- acampamento
def camp():
    rng = np.random.default_rng(101)
    h = 1024
    a = grad(h, [(0.0, hexc("#050716")), (0.5, hexc("#0b1230")), (0.8, hexc("#1a2850")),
                 (1.0, hexc("#2e3f6a"))], W)
    st = stars(np.zeros((h, W), np.float32), rng, 900, 0.75)
    st = np.asarray(Image.fromarray(st.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32)
    a = np.clip(a + st[..., None] * np.array([0.9, 0.95, 1.0]), 0, 255)
    sky = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    sky = moon(sky, 0.62, 0.30, 62, hexc("#fff4d0"), hexc("#b9c8ff"))
    save(sky, "camp", "sky.png")
    ms.MIST = hexc("#1c2748")
    l5 = mountains(560, rng, hexc("#131c3a"), 6, 0.6)
    save(pad_v(finish(l5, rng, None, 0, 0.5, 4.0, shade=(1.0, 0.95), fray=(2, 12, 0.3), sat=1.0)), "camp", "l5_canopy.png")
    l4 = pine_row(520, rng, hexc("#0f1731"), 26, 0.5, 0.9)
    save(pad_v(finish(l4, rng, hexc("#4a5fa8"), 4, 0.3, 3.0, shade=(1.0, 0.9), fray=(2, 12, 0.3), rim_a=120, sat=1.0)), "camp", "l4_far.png")
    l3 = pine_row(520, rng, hexc("#0b1128"), 20, 0.55, 0.95)
    save(pad_v(finish(l3, rng, hexc("#5a70c0"), 5, 0.15, 2.5, shade=(1.0, 0.85), fray=(2, 12, 0.3), rim_a=140, sat=1.0)), "camp", "l3_mid.png")
    l2 = pine_row(560, rng, hexc("#070b1c"), 14, 0.6, 1.0, gap=0.16)
    save(pad_v(finish(l2, rng, hexc("#6b82d6"), 6, 0.05, 2.0, shade=(1.0, 0.8), fray=(2, 12, 0.3), rim_a=170, sat=1.0)), "camp", "l2_near.png")
    l1 = rock_row(400, rng, hexc("#0a0e1f"), 12)
    save(pad_v(finish(l1, rng, hexc("#7d93e8"), 7, 0.0, 1.6, shade=(1.0, 0.8), fray=(2, 12, 0.3), rim_a=200, sat=1.0)), "camp", "l1_back.png")
    n = 1024
    col = ground_noise(n, rng, hexc("#3e5a34"), hexc("#1d2c1a"))
    save(to_img(col, n), "camp", "ground.png")


# ----------------------------------------------------------------------- neve
def snow():
    rng = np.random.default_rng(211)
    h = 1024
    a = grad(h, [(0.0, hexc("#6f8fc0")), (0.45, hexc("#a9c1de")), (0.8, hexc("#dfe7ee")),
                 (1.0, hexc("#f4f1ea"))], W)
    sky = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    sun = new(W, h)
    sd = ImageDraw.Draw(sun)
    for k in range(8, 0, -1):
        r = 60 * (1 + k * 0.7)
        sd.ellipse([0.36 * W - r, 0.34 * h - r, 0.36 * W + r, 0.34 * h + r], fill=(255, 250, 235, 14))
    sky.alpha_composite(sun)
    save(sky, "snow", "sky.png")
    ms.MIST = hexc("#dfe7ee")
    l5 = mountains(600, rng, hexc("#8fa4c4"), 5, 0.75, snow=hexc("#e8eef5"))
    save(pad_v(finish(l5, rng, None, 0, 0.35, 3.0, shade=(1.0, 0.95), fray=(2, 12, 0.3), sat=1.0)), "snow", "l5_canopy.png")
    l4 = mountains(520, rng, hexc("#6f86a8"), 7, 0.55, snow=hexc("#e2e9f2"), jag=0.6)
    save(pad_v(finish(l4, rng, None, 0, 0.25, 2.5, shade=(1.0, 0.9), fray=(2, 12, 0.3), sat=1.0)), "snow", "l4_far.png")
    l3 = pine_row(520, rng, hexc("#3c5470"), 22, 0.5, 0.9, cap=hexc("#dde6ee"))
    save(pad_v(finish(l3, rng, None, 0, 0.12, 2.0, shade=(1.0, 0.85), fray=(2, 12, 0.3), sat=1.0)), "snow", "l3_mid.png")
    l2 = pine_row(560, rng, hexc("#2b3f57"), 15, 0.55, 1.0, cap=hexc("#d3dde8"), gap=0.14)
    save(pad_v(finish(l2, rng, None, 0, 0.04, 1.6, shade=(1.0, 0.8), fray=(2, 12, 0.3), sat=1.0)), "snow", "l2_near.png")
    l1 = rock_row(400, rng, hexc("#4b5c72"), 10)
    d = ImageDraw.Draw(l1)
    for _ in range(40):
        x = rng.uniform(0, W)
        r = rng.uniform(30, 90)
        wrapped(lambda xx: d.ellipse([xx - r, 400 * 1.02 - r * 0.5, xx + r, 400 * 1.02 + r * 0.5], fill=hexc("#e3eaf2")), x, W)
    save(pad_v(finish(l1, rng, None, 0, 0.0, 1.4, shade=(1.0, 0.85), fray=(2, 12, 0.3), sat=1.0)), "snow", "l1_back.png")
    n = 1024
    col = ground_noise(n, rng, hexc("#f2f5f8"), hexc("#c8d4e0"), k=1.1)
    sp = vnoise(n, n, 3, 1, rng)
    col = np.clip(col + (sp[..., None] - 0.5) * 14, 0, 255)
    save(to_img(col, n), "snow", "ground.png")
    fr = new(W, 256)
    fd = ImageDraw.Draw(fr)
    for _ in range(60):
        x = rng.uniform(0, W)
        r = rng.uniform(20, 70)
        wrapped(lambda xx: fd.ellipse([xx - r, 256 * 1.02 - r * 0.45, xx + r, 256 * 1.02 + r * 0.45], fill=hexc("#eef3f8")), x, W)
    for _ in range(22):
        x = rng.uniform(0, W)
        wrapped(lambda xx: rock(fd, xx, 256 * 1.02, rng.uniform(40, 110), rng.uniform(20, 60), hexc("#6d7d92"), rng), x, W)
    save(pad_v(fr), "snow", "fringe.png")


# --------------------------------------------------------------------- ruinas
def ruins():
    rng = np.random.default_rng(307)
    h = 1024
    a = grad(h, [(0.0, hexc("#4d6f6b")), (0.45, hexc("#8fb3a3")), (0.8, hexc("#cfd9b8")),
                 (1.0, hexc("#e9e4c4"))], W)
    sky = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    save(sky, "ruins", "sky.png")
    n = 1024
    col = ground_noise(n, rng, hexc("#8e8a72"), hexc("#5b5b4a"), k=1.2)
    img = to_img(col, n)
    d = ImageDraw.Draw(img)
    step = 128
    for y in range(0, n, step):
        for x in range(0, n, step):
            ox = (step // 2) if (y // step) % 2 else 0
            x0 = (x + ox) % n
            d.rectangle([x0, y, x0 + step - 1, y + step - 1], outline=hexc("#4a4a3c"), width=4)
            if rng.random() < 0.3:
                mx, my = x0 + rng.uniform(10, step - 10), y + rng.uniform(10, step - 10)
                r = rng.uniform(12, 40)
                d.ellipse([mx - r, my - r * 0.7, mx + r, my + r * 0.7], fill=hexc("#5d7a3e", 150))
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    save(img, "ruins", "ground.png")


# --------------------------------------------------------------------- telhado
def roof():
    rng = np.random.default_rng(401)
    h = 1024
    a = grad(h, [(0.0, hexc("#0a0716")), (0.4, hexc("#1b1035")), (0.75, hexc("#4a1f52")),
                 (1.0, hexc("#8a3a5a"))], W)
    st = stars(np.zeros((h, W), np.float32), rng, 400, 0.5, 200)
    a = np.clip(a + st[..., None], 0, 255)
    sky = Image.fromarray(np.dstack([a.astype(np.uint8), np.full((h, W), 255, np.uint8)]))
    sky = moon(sky, 0.2, 0.22, 40, hexc("#fff0d8"), hexc("#ff9ad0"))
    save(sky, "roof", "sky.png")
    # janelas: grade de 8x8 por bloco, algumas acesas
    n = 512
    img = new(n, n, hexc("#141522"))
    d = ImageDraw.Draw(img)
    cell = 64
    for y in range(0, n, cell):
        for x in range(0, n, cell):
            if rng.random() < 0.55:
                c = [hexc("#ffe9a8"), hexc("#ffd27a"), hexc("#bfe7ff"), hexc("#ffb0d8")][int(rng.integers(0, 4))]
                d.rectangle([x + 12, y + 14, x + cell - 12, y + cell - 18], fill=c)
            else:
                d.rectangle([x + 12, y + 14, x + cell - 12, y + cell - 18], fill=hexc("#20223a"))
    save(img, "roof", "windows.png")
    n = 1024
    col = ground_noise(n, rng, hexc("#4a4d55"), hexc("#2b2d33"), k=1.1)
    img = to_img(col, n)
    d = ImageDraw.Draw(img)
    for y in range(0, n, 256):
        d.line([(0, y), (n, y)], fill=hexc("#26282e"), width=5)
    for x in range(0, n, 256):
        d.line([(x, 0), (x, n)], fill=hexc("#26282e"), width=5)
    save(img, "roof", "ground.png")


# --------------------------------------------------------------------- caverna
def cave():
    rng = np.random.default_rng(503)
    n = 1024
    col = ground_noise(n, rng, hexc("#4a3630"), hexc("#241614"), k=1.4)
    save(to_img(col, n), "cave", "ground.png")
    a = vnoise(n, n, 60, 5, rng)
    b = vnoise(n, n, 9, 3, rng)
    crust = np.clip((a * 0.7 + b * 0.3 - 0.35) * 3.0, 0, 1)
    hot = np.array([255, 120, 20], float)
    dark = np.array([40, 8, 4], float)
    lava = dark[None, None, :] * crust[..., None] + hot[None, None, :] * (1 - crust[..., None])
    lava = np.clip(lava + (b[..., None] - 0.5) * 40, 0, 255)
    save(to_img(lava, n), "cave", "lava.png")
    sky = Image.new("RGBA", (256, 256), hexc("#1a0806"))
    save(sky, "cave", "sky.png")


if __name__ == "__main__":
    camp(); snow(); ruins(); roof(); cave()
