import math, os
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "stage")
W, H = 1024, 512

def hexc(h):
    return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0

def make(name, cols, seam="#2a2320"):
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    lon = U * 2 * math.pi
    lat = (V - 0.5) * math.pi
    x = np.cos(lat) * np.cos(lon)
    y = np.sin(lat)
    z = np.cos(lat) * np.sin(lon)
    axes = [np.abs(x), np.abs(y), np.abs(z)]
    # painéis estilo bola de vôlei: cada eixo dominante é um painel, três cores
    dom = np.argmax(np.stack(axes), axis=0)
    img = np.zeros((H, W, 3), np.float32)
    for i, c in enumerate(cols):
        img[dom == i] = hexc(c)
    # costuras: onde dois eixos quase empatam
    s = np.sort(np.stack(axes), axis=0)
    gap = s[2] - s[1]
    seamk = np.clip(1.0 - gap / 0.06, 0, 1)
    # tiras internas em cada painel (três gomos por painel)
    stripe = np.zeros_like(gap)
    for i in range(3):
        others = [a for j, a in enumerate([x, y, z]) if j != i]
        t = np.arctan2(others[0], others[1])
        k = np.abs(np.sin(t * 3.0))
        stripe = np.where(dom == i, np.clip(1.0 - k / 0.06, 0, 1), stripe)
    line = np.maximum(seamk, stripe * 0.0)
    img = img * (1.0 - line[..., None]) + hexc(seam) * line[..., None]
    # sombreado leve pra dar leitura de gomo
    shade = 0.92 + 0.08 * np.clip(gap / 0.5, 0, 1)
    img *= shade[..., None]
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    out = out.filter(ImageFilter.GaussianBlur(0.6))
    out.save(os.path.join(OUT, name))

make("ball.png", ["#fff8ea", "#ffb31c", "#ff5a2e"])
make("ball_b.png", ["#fff6e6", "#ff4a3a", "#ffd23a"])
print("ok")
