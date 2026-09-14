import math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'assets', 'stage', 'dusk')
random.seed(7)

def save(name, arr):
    Image.fromarray(arr.astype(np.uint8)).save(f'{OUT}/{name}.png')

def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def periodic(x, seed, n=6, amp=1.0):
    r = random.Random(seed)
    v = np.zeros_like(x, dtype=float)
    for k in range(1, n + 1):
        v += r.uniform(0.3, 1.0) / k * np.sin(2 * math.pi * k * x + r.uniform(0, 6.28))
    return v * amp

def sky(w=2048, h=1024):
    y = np.linspace(0, 1, h)[:, None]
    top = np.array([42, 44, 52]); mid = np.array([55, 57, 64]); hor = np.array([92, 82, 72]); low = np.array([44, 45, 50])
    img = np.zeros((h, w, 4))
    for i in range(h):
        t = y[i, 0]
        if t < 0.55: c = top + (mid - top) * (t / 0.55)
        elif t < 0.78: c = mid + (hor - mid) * ((t - 0.55) / 0.23) ** 1.6
        elif t < 0.82: c = hor + (low - hor) * ((t - 0.78) / 0.04)
        else: c = low
        img[i, :, :3] = c
    img[:, :, 3] = 255
    r = random.Random(3)
    for _ in range(140):
        sx, sy = r.randrange(w), r.randrange(int(h * 0.5))
        b = r.uniform(70, 95)
        img[sy, sx, :3] = [b, b, b + 3]
    return img

def sea(w=2048, h=420):
    x = np.linspace(0, 1, w, endpoint=False)
    y = np.linspace(0, 1, h)[:, None]
    base = np.array([37, 40, 45]); deep = np.array([32, 34, 39])
    img = np.zeros((h, w, 4))
    img[:, :, :3] = (base + (deep - base) * y)[:, None, :]
    for row in range(h):
        t = row / h
        s = periodic(x * (8 + 30 * t), 100 + row, 4, 1.0)
        streak = np.clip(s - 0.55, 0, 1) * (1.0 - t) * 18
        img[row, :, 0] += streak * 1.15
        img[row, :, 1] += streak * 1.0
        img[row, :, 2] += streak * 0.8
    glow = np.exp(-((x - 0.5) ** 2) / 0.02)[None, :] * np.exp(-y * 9) * 14
    img[:, :, 0] += glow * 1.0; img[:, :, 1] += glow * 0.8; img[:, :, 2] += glow * 0.6
    img[:, :, :3] = np.clip(img[:, :, :3], 0, 96)
    img[:, :, 3] = 255
    return img

def cliff(w=2048, h=546):
    x = np.linspace(0, 1, w, endpoint=False)
    prof = 0.55 + periodic(x, 11, 5, 0.12) + 0.05 * np.clip(periodic(x * 3, 12, 3, 1.0), 0, 1)
    img = np.zeros((h, w, 4))
    col = np.array([28, 29, 33]); col2 = np.array([23, 24, 27])
    for row in range(h):
        t = row / h
        mask = (t > prof).astype(float)
        c = col + (col2 - col) * t
        img[row, :, :3] = c
        img[row, :, 3] = mask * 255
    return img

def palm(d, x0, y0, hgt, lean, seed, col):
    r = random.Random(seed)
    pts = []
    for i in range(12):
        t = i / 11
        pts.append((x0 + lean * t * t * hgt * 0.6, y0 - hgt * t))
    for i in range(11):
        w = 9 - 4 * (i / 11)
        d.line([pts[i], pts[i + 1]], fill=col, width=int(w))
    tx, ty = pts[-1]
    for k in range(8):
        a = r.uniform(-2.9, -0.2) if k % 2 == 0 else r.uniform(-3.0, 0.1)
        L = r.uniform(70, 130)
        ex, ey = tx + math.cos(a) * L, ty + math.sin(a) * L * 0.6 + 25
        d.line([(tx, ty), (ex, ey)], fill=col, width=5)
        for j in range(1, 7):
            px = tx + (ex - tx) * j / 7; py = ty + (ey - ty) * j / 7
            n = 12 - j
            d.line([(px, py), (px + 4, py + n)], fill=col, width=3)
            d.line([(px, py), (px - 4, py + n)], fill=col, width=3)

def poles(w=4096, h=1024):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    col = (20, 21, 25, 255)
    bulb = (255, 214, 150, 255)
    ground = h - 6
    for i, x in enumerate([260, 900, 1650, 2500, 3250, 3850]):
        palm(d, x, ground, random.uniform(430, 620), random.choice([-1, 1]) * random.uniform(0.3, 0.9), i, col)
    pole_x = [1250, 2900]
    for x in pole_x:
        d.rectangle([x - 7, ground - 720, x + 7, ground], fill=col)
        d.rectangle([x - 60, ground - 740, x + 60, ground - 712], fill=col)
        d.ellipse([x - 26, ground - 736, x + 26, ground - 700], fill=bulb)
    n = 14
    for k in range(n + 1):
        t = k / n
        x = pole_x[0] + (pole_x[1] - pole_x[0]) * t
        y = ground - 660 + 90 * math.sin(math.pi * t)
        if k < n:
            x2 = pole_x[0] + (pole_x[1] - pole_x[0]) * (k + 1) / n
            y2 = ground - 660 + 90 * math.sin(math.pi * (k + 1) / n)
            d.line([(x, y), (x2, y2)], fill=col, width=3)
        d.ellipse([x - 7, y + 4, x + 7, y + 22], fill=bulb)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for x in pole_x:
        g.ellipse([x - 110, ground - 830, x + 110, ground - 610], fill=(255, 200, 130, 70))
    for k in range(n + 1):
        t = k / n
        x = pole_x[0] + (pole_x[1] - pole_x[0]) * t
        y = ground - 660 + 90 * math.sin(math.pi * t) + 13
        g.ellipse([x - 26, y - 26, x + 26, y + 26], fill=(255, 200, 130, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    out = Image.alpha_composite(glow, img)
    return np.array(out).astype(float)

def fore(w=2048, h=300):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = random.Random(21)
    col = (17, 17, 20, 255)
    for i in range(520):
        x = r.uniform(0, w)
        hh = r.uniform(60, 220)
        lean = r.uniform(-60, 60)
        for off in (0, w, -w):
            d.line([(x + off, h), (x + off + lean * 0.4, h - hh * 0.6), (x + off + lean, h - hh)], fill=col, width=r.randint(3, 7), joint='curve')
    d.rectangle([0, h - 40, w, h], fill=col)
    img = img.filter(ImageFilter.GaussianBlur(4))
    a = np.array(img).astype(float)
    x = np.abs(np.arange(w) - w / 2) / (w / 2)
    m = np.clip((x - 0.42) / 0.30, 0, 1)
    a[:, :, 3] *= m[None, :]
    return a

def ground(w=1024, h=1024):
    r = np.random.RandomState(5)
    n = r.uniform(-1, 1, (h // 8, w // 8))
    n = np.array(Image.fromarray(((n + 1) * 127).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(float) / 127 - 1
    img = np.zeros((h, w, 4))
    base = np.array([76, 72, 66])
    img[:, :, :3] = base + n[:, :, None] * 5
    img[:, :, 3] = 255
    return img

save('sky', sky()); save('l1_sea', sea()); save('l2_cliff', cliff()); save('l3_poles', poles()); save('l5_fore', fore()); save('ground', ground())
print('ok')
