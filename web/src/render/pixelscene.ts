import type { Scene } from './scenes.ts'
import { shade } from '../core/looks.ts'

interface Pal {
  sand1: string; sand2: string; sandDk: string; shadow: string; pole: string; netDk: string
}

let seed = 1337
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

function layer(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h)
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  draw(g)
  return c
}

function blobTrees(g: CanvasRenderingContext2D, w: number, base: number, count: number, hMin: number, hMax: number,
                   cols: string[], trunk: boolean, trunkCol = '#3b2a1e') {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * w), h = hMin + rnd() * (hMax - hMin)
    const tw = 2 + Math.floor(rnd() * 2)
    if (trunk) {
      g.fillStyle = trunkCol; g.fillRect(x, base - h, tw, h)
      g.fillStyle = shade(trunkCol, 1.4); g.fillRect(x, base - h, 1, h)
    }
    for (let k = 0; k < 3; k++) {
      const cx = x + tw / 2 + (k - 1) * (5 + rnd() * 4), cy = base - h + (k === 1 ? -4 : 2) + rnd() * 3
      const r = 7 + rnd() * 6
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy * 1.6 > r * r) continue
        const lit = -xx * 0.5 - yy * 0.7
        g.fillStyle = lit > r * 0.35 ? cols[0] : lit > -r * 0.2 ? cols[1] : cols[2]
        g.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1)
      }
    }
  }
}

function palm(g: CanvasRenderingContext2D, x: number, base: number, h: number, lean: number, dark: boolean) {
  const trunk = dark ? '#3a2a22' : '#7a5a3a', trunkHi = dark ? '#4a382c' : '#a07a4c'
  const leaf = dark ? ['#2b4a36', '#1d3526'] : ['#3fa64a', '#2a7a34']
  let px = x
  for (let y = 0; y < h; y++) {
    px = x + lean * (y / h) * (y / h) * 14
    g.fillStyle = (y % 5 === 0) ? trunkHi : trunk
    g.fillRect(Math.round(px), base - y, 2, 1)
  }
  const tx = Math.round(px), ty = base - h
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI * 0.95 + k * (Math.PI * 0.9 / 5)
    for (let s = 0; s < 12; s++) {
      const dx = Math.cos(a) * s * 1.3, dy = Math.sin(a) * s * 0.7 + s * s * 0.06
      g.fillStyle = s < 6 ? leaf[0] : leaf[1]
      g.fillRect(Math.round(tx + dx), Math.round(ty + dy), 2, 1)
    }
  }
  g.fillStyle = '#5a3a1a'; g.fillRect(tx, ty, 2, 2); g.fillRect(tx - 1, ty + 1, 1, 1)
}

function dither(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, col: string, k: number) {
  g.fillStyle = col
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (rnd() < k) g.fillRect(x, y, 1, 1)
  }
}

/**
 * Cenário em pixel art: céu e fundo pré-pintados em camadas com parallax,
 * chão fixo no `gy`. Tudo procedural, mesma paleta base do cenário 2D.
 */
export class PixelScene {
  pal: Pal = { sand1: '#d8bf88', sand2: '#b9985e', sandDk: '#8a6a3e', shadow: '#3c2814', pole: '#c8c8c8', netDk: '#9a9a9a' }
  private W: number
  private H: number
  private sky!: HTMLCanvasElement
  private far!: HTMLCanvasElement
  private mid!: HTMLCanvasElement
  private near!: HTMLCanvasElement
  private cliff: HTMLCanvasElement | null = null
  private props!: HTMLCanvasElement
  private gy = 0
  private horizon = 0
  private shore = 0
  private flies: { x: number; y: number; ph: number; col: string }[] = []
  private motes: { x: number; y: number; ph: number }[] = []
  private leaves: { x: number; y: number; ph: number; vy: number }[] = []
  private gulls: { x: number; y: number; ph: number; s: number }[] = []
  private crowd: { x: number; y: number; ph: number; col: string }[] = []

  constructor(private scene: Scene, W: number, H: number) {
    this.W = W; this.H = H
    this.build()
  }

  resize(W: number, H: number) { this.W = W; this.H = H; this.build() }
  setScene(s: Scene) { this.scene = s; this.build() }

  get id() { return this.scene.id }

  private build() {
    const H = this.H
    this.gy = Math.round(H * 0.86 - 44 * (H / 640))
    const id = this.scene.id
    seed = 1337
    const d2 = this.scene.d2
    this.pal.sand1 = d2.ground[0]
    this.pal.sand2 = d2.ground[1] ?? shade(d2.ground[0], 0.8)
    this.pal.sandDk = shade(this.pal.sand2, 0.7)
    this.pal.shadow = shade(this.pal.sand2, 0.3)
    this.horizon = this.gy - (id === 'ginasio' ? 70 : id === 'selva' ? 62 : 52)
    this.shore = this.gy - (id === 'ginasio' ? 26 : id === 'selva' ? 34 : 22)
    this.buildSky()
    this.cliff = null
    switch (id) {
      case 'selva': this.buildSelva(); break
      case 'praia': this.buildPraia(); break
      case 'gruta': this.buildGruta(); break
      case 'luau': this.buildLuau(); break
      case 'ginasio': this.buildGinasio(); break
    }
    this.flies = []; this.motes = []; this.leaves = []; this.gulls = []; this.crowd = []
    const W = this.W
    if (id === 'selva') for (let i = 0; i < 3; i++) this.flies.push({ x: rnd() * W, y: 40 + rnd() * 60, ph: rnd() * 6, col: ['#ffd257', '#7fd4ff', '#ff8fb0'][i] })
    if (id === 'selva' || id === 'luau' || id === 'gruta') for (let i = 0; i < 16; i++) this.motes.push({ x: rnd() * W, y: rnd() * H, ph: rnd() * 6 })
    if (id === 'praia') for (let i = 0; i < 4; i++) this.gulls.push({ x: rnd() * W, y: 10 + rnd() * 40, ph: rnd() * 6, s: 0.6 + rnd() * 0.6 })
    if (id === 'ginasio') for (let i = 0; i < 90; i++) this.crowd.push({ x: rnd() * W, y: this.horizon - 30 + rnd() * 34, ph: rnd() * 6, col: ['#ffd257', '#ff5e8a', '#7fd4ff', '#ffffff', '#9dff8f', '#ff8a2b'][Math.floor(rnd() * 6)] })
  }

  private buildSky() {
    const W = this.W, sky = this.scene.d2.sky, top = this.shore
    this.sky = layer(W, this.H, g => {
      const n = sky.length
      for (let y = 0; y < this.H; y++) {
        const t = Math.min(0.9999, y / top)
        const i = Math.floor(t * n), f = t * n - i
        const a = sky[Math.min(n - 1, i)], b = sky[Math.min(n - 1, i + 1)]
        for (let x = 0; x < W; x++) {
          g.fillStyle = f > 0.7 && ((x + y) & 1) === 0 ? b : a
          g.fillRect(x, y, 1, 1)
        }
      }
      if (this.scene.d2.star) {
        for (let i = 0; i < 70; i++) {
          g.fillStyle = rnd() < 0.7 ? '#ffffff' : '#c8d8ff'
          g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * top * 0.8), 1, 1)
        }
      }
      const orb = this.scene.d2.orb
      if (orb) {
        const sx = Math.round(orb.x * W), sy = Math.round(this.horizon - (418 - orb.y) * 0.34)
        const r = Math.max(6, Math.round(orb.r * 0.42))
        const col = this.scene.night ? '#f6f6e2' : '#fff3b0', halo = this.scene.night ? '#dde2ff' : '#f6e9a0'
        for (let rr = r + 5; rr >= r; rr -= 5) {
          g.fillStyle = rr > r ? halo : col
          for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
            if (x * x + y * y <= rr * rr && (rr === r || ((x + y + rr) & 1))) g.fillRect(sx + x, sy + y, 1, 1)
          }
        }
        if (this.scene.night) { g.fillStyle = shade(col, 0.85); g.fillRect(sx - 2, sy - 3, 2, 2); g.fillRect(sx + 3, sy + 1, 3, 2); g.fillRect(sx - 4, sy + 3, 2, 1) }
      }
      if (this.scene.d2.cloud && !this.scene.night) {
        for (let i = 0; i < 6; i++) {
          const cx = Math.floor(rnd() * W), cy = 8 + Math.floor(rnd() * (top * 0.5)), cw = 14 + Math.floor(rnd() * 22)
          g.fillStyle = '#ffffff'
          g.fillRect(cx, cy, cw, 3); g.fillRect(cx + 3, cy - 2, cw - 8, 2); g.fillRect(cx + 6, cy - 3, cw - 14, 1)
          g.fillStyle = this.scene.d2.cloud; g.fillRect(cx + 1, cy + 3, cw - 2, 1)
        }
      }
    })
  }

  private buildSelva() {
    const W = this.W, H = this.H, hz = this.horizon, sh = this.shore, gy = this.gy
    const P = {
      far: ['#7fb8a4', '#6aa896', '#5c9a89'], mid: ['#3f8a63', '#357552', '#2c6244'], near: ['#4c8a4a', '#2a5f3a', '#1f4a2d'],
      near2: '#163821', fog: this.scene.d2.sky[2],
    }
    this.far = layer(W * 2, hz + 10, g => {
      blobTrees(g, W * 2, hz + 2, 70, 40, 70, P.far, false)
      for (let y = hz - 30; y < hz + 10; y++) dither(g, 0, y, W * 2, 1, P.fog, ((y - (hz - 30)) / 40) * 0.7)
    })
    this.mid = layer(W * 2, hz + 10, g => blobTrees(g, W * 2, hz + 4, 44, 26, 48, P.mid, true))
    this.near = layer(W * 2, hz + 14, g => {
      blobTrees(g, W * 2, hz + 8, 30, 14, 30, P.near, true)
      for (let x = 0; x < W * 2; x += 3) {
        const h = 3 + Math.floor(rnd() * 5)
        g.fillStyle = rnd() < 0.5 ? P.near[2] : P.near2; g.fillRect(x, hz + 8 - h, 3, h + 6)
        if (rnd() < 0.18) { g.fillStyle = ['#ff5e8a', '#ffd257', '#ffffff'][Math.floor(rnd() * 3)]; g.fillRect(x + 1, hz + 8 - h - 1, 1, 1) }
      }
    })
    this.cliff = layer(70, 34, g => {
      for (let y = 0; y < 34; y++) for (let x = 0; x < 70; x++) {
        const cx = x - 35, w = 20 + y * 0.4 + Math.sin(y * 0.7) * 2
        if (Math.abs(cx) > w) continue
        const sc = cx < -w * 0.3 ? '#5c6068' : cx > w * 0.45 ? '#2b2e35' : '#40444c'
        g.fillStyle = (x * 7 + y * 13) % 17 === 0 ? '#2b2e35' : sc
        g.fillRect(x, y, 1, 1)
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = '#4f8a3f'; g.fillRect(12 + rnd() * 46, rnd() * 8, 2, 1) }
      for (let i = 0; i < 14; i++) { g.fillStyle = '#4c8a4a'; g.fillRect(14 + rnd() * 42, rnd() * 4, 3, 2) }
    })
    this.props = layer(W, 90, g => {
      g.translate(0, 60)
      g.fillStyle = '#5a3a20'; g.fillRect(8, 12, 46, 9)
      g.fillStyle = '#7a5230'; g.fillRect(8, 12, 46, 2)
      g.fillStyle = '#3a2412'; g.fillRect(8, 19, 46, 2)
      for (let i = 0; i < 5; i++) { g.fillStyle = '#3a2412'; g.fillRect(14 + i * 9, 14, 1, 5) }
      g.fillStyle = '#c99a63'; g.fillRect(52, 12, 4, 9); g.fillStyle = '#8a5a34'; g.fillRect(53, 14, 2, 5)
      for (const [mx, s] of [[64, 1], [71, 0.7]]) {
        g.fillStyle = '#efe4d2'; g.fillRect(mx, 14, 2, 6 * s + 1)
        g.fillStyle = '#d63b2f'; g.fillRect(mx - 3 * s, 12, 8 * s, 3)
        g.fillStyle = '#fff3ea'; g.fillRect(mx - 1, 12, 1, 1); g.fillRect(mx + 2, 13, 1, 1)
      }
      const rx = W - 50
      for (let y = 0; y < 16; y++) for (let x = 0; x < 34; x++) {
        const nx = (x - 17) / 17, ny = (y - 8) / 8
        if (nx * nx + ny * ny > 1 || y > 13) continue
        const lit = -nx * 0.6 - ny * 0.8
        g.fillStyle = lit > 0.4 ? '#9fa6a4' : lit > -0.2 ? '#6f7775' : '#3d4443'
        g.fillRect(rx + x, 8 + y, 1, 1)
      }
      g.fillStyle = '#4f8a3f'; g.fillRect(rx + 6, 9, 8, 1); g.fillRect(rx + 9, 10, 3, 1)
    })
    void H; void sh; void gy
  }

  private buildPraia() {
    const W = this.W, hz = this.horizon
    this.far = layer(W * 2, hz + 10, g => {
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(rnd() * W * 2), w = 30 + rnd() * 60, h = 4 + rnd() * 6
        for (let y = 0; y < h; y++) {
          g.fillStyle = y < 2 ? '#3f8a63' : '#2c6244'
          g.fillRect(Math.round(x + (y / h) * w * 0.5), Math.round(hz + 8 - h + y), Math.round(w - (y / h) * w * 0.9), 1)
        }
      }
    })
    this.mid = layer(W * 2, hz + 10, g => {
      g.fillStyle = '#ffffff'
      for (let i = 0; i < 4; i++) { const x = Math.floor(rnd() * W * 2); g.fillRect(x, hz - 3 - Math.floor(rnd() * 3), 2, 3); g.fillRect(x - 1, hz - 1, 4, 1) }
    })
    this.near = layer(W * 2, hz + 14, g => {
      g.fillStyle = '#ffffff'
      for (let i = 0; i < 3; i++) { const x = Math.floor(rnd() * W * 2); g.fillRect(x, hz + 8 + Math.floor(rnd() * 4), 3, 1) }
    })
    this.props = layer(W, 90, g => {
      palm(g, 10, 90, 78, 1, false)
      palm(g, W - 14, 90, 70, -1, false)
      g.translate(0, 60)
      g.fillStyle = '#ff5e5e'; g.fillRect(W - 60, 22, 8, 5); g.fillStyle = '#ffffff'; g.fillRect(W - 58, 22, 2, 5); g.fillStyle = '#c0392b'; g.fillRect(W - 60, 26, 8, 1)
      g.fillStyle = '#f2e6c8'; g.fillRect(40, 25, 5, 3); g.fillStyle = '#d8b88a'; g.fillRect(41, 26, 3, 1)
    })
  }

  private buildGruta() {
    const W = this.W, hz = this.horizon
    this.far = layer(W * 2, hz + 10, g => {
      g.fillStyle = '#0f3a45'
      for (let x = 0; x < W * 2; x++) { const h = 20 + Math.sin(x * 0.05) * 8 + Math.sin(x * 0.13) * 5; g.fillRect(x, Math.round(hz - h), 1, Math.round(h + 10)) }
      for (let i = 0; i < 30; i++) { g.fillStyle = rnd() < 0.5 ? '#25b8a2' : '#6fe9d2'; g.fillRect(Math.floor(rnd() * W * 2), Math.floor(hz - 30 + rnd() * 34), 1, 1) }
    })
    this.mid = layer(W * 2, hz + 10, g => {
      for (let i = 0; i < 28; i++) {
        const x = Math.floor(rnd() * W * 2), h = 8 + rnd() * 26, w = 2 + Math.floor(rnd() * 3)
        for (let y = 0; y < h; y++) { g.fillStyle = y < h * 0.4 ? '#123f4a' : '#0a2a35'; g.fillRect(x - Math.round((w * y) / h / 2), y, Math.max(1, Math.round(w - (w * y) / h)), 1) }
      }
    })
    this.near = layer(W * 2, hz + 14, g => {
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rnd() * W * 2), h = 10 + rnd() * 18
        g.fillStyle = '#1a6a6a'
        for (let y = 0; y < h; y++) g.fillRect(x - Math.round(y * 0.15), Math.round(hz + 8 - y), 3 + Math.round(y * 0.3), 1)
        g.fillStyle = '#6fe9d2'; g.fillRect(x, Math.round(hz + 8 - h), 1, 3); g.fillRect(x + 1, Math.round(hz + 8 - h + 1), 1, 1)
      }
    })
    this.props = layer(W, 90, g => {
      g.translate(0, 60)
      const crystal = (x: number, h: number, col: string) => {
        for (let y = 0; y < h; y++) { g.fillStyle = y < 2 ? '#ffffff' : col; g.fillRect(x - Math.round(y * 0.3), 30 - h + y, 1 + Math.round(y * 0.6), 1) }
      }
      crystal(24, 14, '#25b8a2'); crystal(31, 9, '#6fe9d2'); crystal(W - 30, 12, '#7fa8ff'); crystal(W - 24, 7, '#25b8a2')
      g.fillStyle = '#243a3c'; g.fillRect(W - 80, 24, 26, 6); g.fillStyle = '#39585a'; g.fillRect(W - 78, 24, 22, 1)
    })
  }

  private buildLuau() {
    const W = this.W, hz = this.horizon
    this.far = layer(W * 2, hz + 10, g => {
      g.fillStyle = '#1d2050'
      for (let x = 0; x < W * 2; x++) { const h = 12 + Math.sin(x * 0.03) * 8 + Math.sin(x * 0.09) * 4; g.fillRect(x, Math.round(hz - h), 1, Math.round(h + 10)) }
    })
    this.mid = layer(W * 2, hz + 10, g => {
      for (let i = 0; i < 6; i++) palm(g, Math.floor(rnd() * W * 2), hz + 9, 20 + rnd() * 14, rnd() < 0.5 ? -1 : 1, true)
    })
    this.near = layer(W * 2, hz + 14, g => {
      for (let i = 0; i < 3; i++) palm(g, Math.floor(rnd() * W * 2), hz + 12, 28 + rnd() * 12, rnd() < 0.5 ? -1 : 1, true)
    })
    this.props = layer(W, 90, g => {
      palm(g, 8, 90, 74, 1, true)
      g.translate(0, 60)
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5a3a1a' : '#3a2410'; g.fillRect(W - 66 + i * 7, 22 + (i % 2), 9, 3) }
      g.fillStyle = '#2b1a10'; g.fillRect(W - 68, 26, 34, 3)
      g.fillStyle = '#6a4a2a'; g.fillRect(40, 22, 14, 8); g.fillStyle = '#8a6a3a'; g.fillRect(40, 22, 14, 1); g.fillStyle = '#ffd257'; g.fillRect(45, 20, 3, 2)
    })
  }

  private buildGinasio() {
    const W = this.W, hz = this.horizon
    this.far = layer(W * 2, hz + 10, g => {
      g.fillStyle = '#2b3147'; g.fillRect(0, 0, W * 2, hz + 10)
      for (let r = 0; r < 5; r++) { g.fillStyle = r % 2 ? '#3a415c' : '#333a52'; g.fillRect(0, hz - 40 + r * 8, W * 2, 8); g.fillStyle = '#20263a'; g.fillRect(0, hz - 40 + r * 8 + 7, W * 2, 1) }
      for (let x = 0; x < W * 2; x += 60) { g.fillStyle = '#1a1f2e'; g.fillRect(x, hz - 44, 2, 54) }
      for (let x = 20; x < W * 2; x += 90) { g.fillStyle = '#f8f0d0'; g.fillRect(x, 4, 8, 3); g.fillStyle = '#2a2f44'; g.fillRect(x + 3, 0, 2, 4) }
    })
    this.mid = layer(W * 2, hz + 10, g => {
      for (let x = 0; x < W * 2; x += 120) {
        g.fillStyle = '#e03a3a'; g.fillRect(x + 30, hz - 20, 40, 12)
        g.fillStyle = '#ffffff'; g.fillRect(x + 36, hz - 16, 28, 4)
      }
    })
    this.near = layer(W * 2, hz + 14, g => { g.fillStyle = '#4a5270'; g.fillRect(0, hz + 2, W * 2, 12); g.fillStyle = '#5c6584'; g.fillRect(0, hz + 2, W * 2, 1) })
    this.props = layer(W, 90, g => {
      g.translate(0, 60)
      g.fillStyle = '#3a415c'; g.fillRect(10, 18, 30, 12); g.fillStyle = '#5c6584'; g.fillRect(10, 18, 30, 1)
      g.fillStyle = '#ffd257'; g.fillRect(14, 22, 6, 4); g.fillStyle = '#ff5e5e'; g.fillRect(24, 22, 6, 4)
      g.fillStyle = '#2f7ff0'; g.fillRect(W - 40, 20, 4, 10); g.fillRect(W - 46, 26, 16, 2); g.fillStyle = '#ffffff'; g.fillRect(W - 40, 20, 4, 1)
    })
  }

  background(g: CanvasRenderingContext2D, time: number, pan: number, gy: number, dt: number) {
    const W = this.W, H = this.H, hz = this.horizon, sh = this.shore, id = this.scene.id
    g.drawImage(this.sky, 0, 0)
    const par = (l: HTMLCanvasElement, k: number, y: number) => {
      const w = l.width
      let x = Math.round(-((pan * k + (id === 'ginasio' ? 0 : time * 0.4 * k)) % w)) - w
      for (; x < W; x += w) g.drawImage(l, x, y)
    }
    par(this.far, 2, 0)
    if (id === 'selva' || id === 'praia') {
      for (let i = 0; i < 3; i++) {
        const bx = 60 + i * (W / 3.5) + Math.sin(time * 0.3 + i) * 6
        const a = 0.5 + Math.sin(time * 0.7 + i * 2) * 0.5
        if (a < 0.2) continue
        g.fillStyle = 'rgba(255,250,210,0.35)'
        for (let y = 0; y < hz; y += 1) {
          const x0 = bx + y * 0.35
          for (let x = 0; x < 10 + i * 3; x += 2) if (((x + y) & 3) === 0) g.fillRect(Math.round(x0 + x), y, 1, 1)
        }
      }
    }
    par(this.mid, 5, 0)
    if (id === 'selva' && this.cliff) {
      const cx = Math.round(W / 2 - 35 - pan * 0.9)
      g.drawImage(this.cliff, cx, hz - 28)
      for (let x = 0; x < 16; x++) {
        const ph = ((x * 7919) % 13) * 0.9, spd = 50 + (x % 3) * 12
        for (let y = hz - 26; y < hz + 6; y++) {
          const v = Math.sin(y * 0.8 - time * spd + ph) + Math.sin(y * 0.23 - time * 20 + ph * 2) * 0.6
          const edge = x === 0 || x === 15
          g.fillStyle = v > 1.0 ? '#ffffff' : v > 0.3 ? '#cdefff' : v > -0.8 ? (edge ? '#2f7fae' : '#3f9fc4') : '#2f7fae'
          g.fillRect(cx + 27 + x, y, 1, 1)
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.55)'
      for (let i = 0; i < 26; i++) {
        const a = time * 2 + i
        const x = cx + 35 + Math.sin(a * 0.7 + i) * (10 + (i % 5) * 3), y = hz + 2 - ((time * 12 + i * 7) % 14)
        if (((i + Math.floor(time * 10)) & 1) === 0) g.fillRect(Math.round(x), Math.round(y), 2, 1)
      }
    }
    if (id === 'ginasio') {
      for (const c of this.crowd) {
        const up = Math.sin(time * 6 + c.ph) > 0.7 ? 1 : 0
        g.fillStyle = c.col; g.fillRect(Math.round(c.x), Math.round(c.y - up), 2, 2)
        g.fillStyle = '#1a1f2e'; g.fillRect(Math.round(c.x), Math.round(c.y + 2 - up), 2, 2)
      }
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.2 + i * 0.3) + Math.sin(time * 0.8 + i * 2) * W * 0.12
        g.fillStyle = ['rgba(255,120,120,0.22)', 'rgba(120,180,255,0.22)', 'rgba(255,240,160,0.22)'][i]
        for (let y = 0; y < gy; y++) {
          const w = 4 + y * 0.12
          const x0 = bx + (y / gy) * (i - 1) * 30
          for (let x = -w; x < w; x += 1) if (((Math.round(x) + y) & 1) === 0) g.fillRect(Math.round(x0 + x), y, 1, 1)
        }
      }
    }
    par(this.near, 9, 0)
    const mid = this.scene.d2.mid
    if (id === 'ginasio') {
      g.fillStyle = mid[0]; g.fillRect(0, hz + 6, W, sh - hz - 6)
      g.fillStyle = mid[1]; for (let x = 0; x < W; x += 24) g.fillRect(x, hz + 6, 1, sh - hz - 6)
    } else {
      const w0 = mid[0], w1 = mid[1] ?? shade(mid[0], 0.8), w2 = shade(w1, 0.75)
      const hi = this.scene.night ? shade(w0, 1.6) : '#cdefff'
      for (let y = hz + 6; y < sh; y++) {
        const t = (y - hz - 6) / Math.max(1, sh - hz - 6)
        g.fillStyle = t < 0.35 ? w0 : t < 0.75 ? w1 : w2
        g.fillRect(0, y, W, 1)
        if (id === 'selva' && t < 0.5 && (y & 1) === 0) {
          g.fillStyle = 'rgba(30,70,45,0.35)'
          const off = Math.round(Math.sin(time * 2 + y) * 2)
          for (let x = 0; x < W; x += 7) g.fillRect(x + off + (y % 3), y, 3, 1)
        }
        const gap = 18 + t * 30
        const off = (time * (10 + t * 14) + y * 13) % gap
        g.fillStyle = t > 0.7 ? w0 : hi
        for (let x = -gap + off; x < W; x += gap) g.fillRect(Math.round(x), y, Math.round(3 + t * 6), 1)
      }
      g.fillStyle = this.scene.night ? '#c8d0e0' : '#ffffff'
      for (let x = 0; x < W; x++) if (Math.sin(x * 0.6 + time * 3) > 0.3) g.fillRect(x, sh - 1, 1, 1)
    }
    const wet = shade(this.pal.sand1, 0.78)
    g.fillStyle = wet; g.fillRect(0, sh, W, 1)
    for (let y = sh + 1; y < H; y++) {
      const t = (y - sh) / Math.max(1, H - sh)
      g.fillStyle = t < 0.12 ? wet : t < 0.6 ? this.pal.sand1 : this.pal.sand2
      g.fillRect(0, y, W, 1)
    }
    seed = 99
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = sh + 3 + rnd() * (H - sh - 3)
      g.fillStyle = rnd() < 0.7 ? this.pal.sand2 : this.pal.sandDk
      g.fillRect(x | 0, y | 0, 1, 1)
    }
    if (id === 'ginasio') {
      g.fillStyle = shade(this.pal.sand1, 1.15)
      for (let y = sh + 1; y < H; y += 6) g.fillRect(0, y, W, 1)
    }
    if (id === 'luau') this.bonfire(g, time, gy)
    void dt
  }

  private bonfire(g: CanvasRenderingContext2D, time: number, gy: number) {
    const x = this.W - 49, y = gy + 4
    for (let i = 0; i < 14; i++) {
      const ph = (time * 2.2 + i * 0.37) % 1
      const fx = x + Math.sin(i * 2.1 + time * 5) * (5 * (1 - ph)), fy = y - 3 - ph * 22
      g.fillStyle = ph < 0.35 ? '#fff0a0' : ph < 0.7 ? '#ff9a2a' : '#d83a1a'
      g.fillRect(Math.round(fx), Math.round(fy), ph < 0.5 ? 2 : 1, ph < 0.5 ? 2 : 1)
    }
    g.fillStyle = Math.sin(time * 18) > 0 ? '#fff6d0' : '#ffd257'
    g.fillRect(x - 3, y - 5, 6, 3); g.fillRect(x - 1, y - 8, 3, 3)
  }

  foreground(g: CanvasRenderingContext2D, time: number, gy: number, dt: number) {
    const W = this.W, H = this.H, id = this.scene.id
    g.drawImage(this.props, 0, gy - 78)
    if (id === 'selva' || id === 'praia' || id === 'luau') {
      const grass = id === 'selva' ? ['#4f9a3a', '#6fbf4a'] : id === 'praia' ? ['#7fb86a', '#a4d48a'] : ['#2a4a3a', '#3a6a4a']
      for (const [gx, n] of [[60, 6], [130, 4], [W * 0.55, 5], [W * 0.7, 4], [W - 40, 5]]) {
        for (let k = 0; k < n; k++) {
          const h = 4 + (k % 3) * 2
          const sw = Math.round(Math.sin(time * 1.6 + k + gx) * 1.5)
          const x = Math.round(gx + k * 2)
          g.fillStyle = grass[k % 2]
          for (let yy = 0; yy < h; yy++) g.fillRect(x + Math.round(sw * yy / h), gy + 1 - yy, 1, 1)
        }
      }
    }
    for (const f of this.flies) {
      f.x += 9 * dt; f.y += Math.sin(time * 1.2 + f.ph) * 10 * dt
      if (f.x > W + 8) { f.x = -8; f.y = 40 + rnd() * 60 }
      const open = Math.sin(time * 14 + f.ph) > 0
      g.fillStyle = f.col
      const x = Math.round(f.x), y = Math.round(f.y + Math.sin(time * 5 + f.ph) * 2)
      if (open) { g.fillRect(x - 2, y - 1, 2, 2); g.fillRect(x + 1, y - 1, 2, 2) } else { g.fillRect(x - 1, y - 2, 1, 2); g.fillRect(x + 1, y - 2, 1, 2) }
      g.fillStyle = '#1a1620'; g.fillRect(x, y, 1, 1)
    }
    for (const gl of this.gulls) {
      gl.x += 12 * gl.s * dt
      if (gl.x > W + 10) { gl.x = -10; gl.y = 10 + rnd() * 40 }
      const up = Math.sin(time * 6 + gl.ph) > 0
      const x = Math.round(gl.x), y = Math.round(gl.y)
      g.fillStyle = '#ffffff'
      g.fillRect(x - 2, y + (up ? -1 : 1), 2, 1); g.fillRect(x + 1, y + (up ? -1 : 1), 2, 1); g.fillRect(x, y, 1, 1)
    }
    if (id === 'selva') {
      if (rnd() < dt * 0.6) this.leaves.push({ x: rnd() * W, y: -4, ph: rnd() * 6, vy: 14 + rnd() * 10 })
      for (let i = this.leaves.length - 1; i >= 0; i--) {
        const l = this.leaves[i]
        l.y += l.vy * dt; l.x += Math.sin(time * 1.5 + l.ph) * 12 * dt
        if (l.y > H) { this.leaves.splice(i, 1); continue }
        g.fillStyle = Math.sin(time * 4 + l.ph) > 0 ? '#8ccf5a' : '#d9c94a'
        g.fillRect(Math.round(l.x), Math.round(l.y), 1, 1)
      }
    }
    if (id === 'ginasio') {
      if (rnd() < dt * 3) this.leaves.push({ x: rnd() * W, y: -4, ph: rnd() * 6, vy: 20 + rnd() * 16 })
      for (let i = this.leaves.length - 1; i >= 0; i--) {
        const l = this.leaves[i]
        l.y += l.vy * dt; l.x += Math.sin(time * 3 + l.ph) * 14 * dt
        if (l.y > H) { this.leaves.splice(i, 1); continue }
        g.fillStyle = ['#ffd257', '#ff5e8a', '#7fd4ff', '#9dff8f'][Math.floor(l.ph) % 4]
        g.fillRect(Math.round(l.x), Math.round(l.y), Math.sin(time * 8 + l.ph) > 0 ? 2 : 1, 1)
      }
    }
    for (const m of this.motes) {
      m.y -= (id === 'gruta' ? 2 : 4) * dt; m.x += Math.sin(time * 0.6 + m.ph) * 3 * dt
      if (m.y < -2) { m.y = H; m.x = rnd() * W }
      if (Math.sin(time * 2 + m.ph) > 0) {
        g.fillStyle = id === 'gruta' ? 'rgba(120,255,222,0.8)' : id === 'luau' ? 'rgba(255,230,120,0.9)' : 'rgba(255,250,200,0.8)'
        g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1)
      }
    }
  }
}
