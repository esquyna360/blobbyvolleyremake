import { GROUND_PLANE_HEIGHT_MAX, NET_POSITION_X, RIGHT_PLANE } from '../core/constants.ts'

const GROUND = GROUND_PLANE_HEIGHT_MAX
const DIR = 'stage/selva/'

export interface View {
  cw: number
  ch: number
  scale: number
  ox: number
  oy: number
  horizon: number
  shore: number
  pan: number
  sway: number
  time: number
  dt: number
}

interface Layer { img: CanvasImageSource; w: number; ih: number; h: number; y: number; px: number; sw: number }
interface Mote { x: number; y: number; s: number; seed: number; vx: number; vy: number }
interface Fly { x: number; y: number; seed: number; col: number; vx: number }
interface Leaf { x: number; y: number; vy: number; seed: number; spin: number }

/**
 * A clareira do Godot pintada no canvas: as mesmas texturas em camadas com
 * parallax, cachoeira animada, rio com reflexo, areia com textura e luz
 * atravessando a mata. Tudo é drawImage e gradiente: roda em qualquer coisa.
 */
export class Selva2D {
  ready = false
  private img: Record<string, HTMLImageElement> = {}
  private layers: Layer[] = []
  private sand: CanvasPattern | null = null
  private sandScale = 0
  private motes: Mote[] = []
  private flies: Fly[] = []
  private leaves: Leaf[] = []
  private tinted: Record<string, HTMLCanvasElement> = {}
  private fallsOff = 0

  constructor(private lite: boolean) {
    const names = ['sky', 'l5_canopy', 'l4_far', 'l3_mid', 'l2_near', 'l1_back', 'ground', 'cliff',
      'falls_anim', 'glow', 'shaft', 'mote', 'butterfly', 'leaf', 'puff']
    let left = names.length
    for (const n of names) {
      const im = new Image()
      im.onload = () => { if (--left === 0) this.init() }
      im.onerror = () => { if (--left === 0) this.init() }
      im.src = `${DIR}${n}.webp`
      this.img[n] = im
    }
  }

  private init() {
    const L = (n: string, h: number, y: number, px: number, sw: number, fog: number): Layer => {
      const src = this.img[n]
      const w = src.naturalWidth || 1, ih = src.naturalHeight || 1
      if (fog <= 0) return { img: src, w, ih, h, y, px, sw }
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = ih
      const c = cv.getContext('2d')!
      c.drawImage(src, 0, 0)
      c.globalCompositeOperation = 'source-atop'
      const g = c.createLinearGradient(0, 0, 0, ih)
      g.addColorStop(0, `rgba(196,226,236,${fog * 0.5})`)
      g.addColorStop(1, `rgba(196,226,236,${fog})`)
      c.fillStyle = g
      c.fillRect(0, 0, w, ih)
      return { img: cv, w, ih, h, y, px, sw }
    }
    this.layers = [
      L('l5_canopy', 1.08, -0.10, 0.06, 0.0, 0.55),
      L('l4_far', 0.86, -0.065, 0.12, 0.004, 0.40),
      L('l3_mid', 0.66, -0.035, 0.20, 0.006, 0.22),
      L('l2_near', 0.50, -0.015, 0.30, 0.008, 0.08),
      L('l1_back', 0.36, 0.0, 0.44, 0.010, 0.0),
    ]
    const nm = this.lite ? 12 : 34
    for (let i = 0; i < nm; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.2, seed: Math.random() * 6.28,
        vx: (Math.random() - 0.5) * 0.006, vy: -0.004 - Math.random() * 0.006,
      })
    }
    const nf = this.lite ? 1 : 3
    for (let i = 0; i < nf; i++) {
      this.flies.push({ x: Math.random(), y: 0.35 + Math.random() * 0.3, seed: Math.random() * 6.28, col: i % 3, vx: 0.012 + Math.random() * 0.01 })
    }
    for (let i = 0; i < (this.lite ? 2 : 5); i++) this.leaves.push(this.newLeaf(Math.random()))
    this.ready = true
  }

  private newLeaf(y = -0.05): Leaf {
    return { x: Math.random(), y, vy: 0.035 + Math.random() * 0.03, seed: Math.random() * 6.28, spin: (Math.random() - 0.5) * 3 }
  }

  private tint(name: string, color: string) {
    const key = name + color
    let cv = this.tinted[key]
    if (cv) return cv
    const im = this.img[name]
    cv = document.createElement('canvas')
    cv.width = im.naturalWidth || 64; cv.height = im.naturalHeight || 64
    const c = cv.getContext('2d')!
    c.drawImage(im, 0, 0)
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = color
    c.fillRect(0, 0, cv.width, cv.height)
    this.tinted[key] = cv
    return cv
  }

  /** Céu, mata, cachoeira, rio e areia. Substitui as faixas chapadas. */
  background(c: CanvasRenderingContext2D, v: View) {
    const { cw, ch, horizon, scale } = v
    const sky = this.img.sky
    const skyH = Math.max(horizon + 60 * scale, cw * (sky.naturalHeight / sky.naturalWidth))
    c.drawImage(sky, 0, horizon + 60 * scale - skyH, cw, skyH)

    // sol atrás da mata: um clarão quente que a copa recorta
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = 0.55
    const gr = cw * 0.34
    c.drawImage(this.img.glow, cw * 0.56 - gr, horizon * 0.42 - gr, gr * 2, gr * 2)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'

    for (const l of this.layers) this.layer(c, v, l)

    this.water(c, v)
    this.falls(c, v)
    this.sandFill(c, v)
    this.shafts(c, v)
    void ch
  }

  private layer(c: CanvasRenderingContext2D, v: View, l: Layer) {
    const { cw, horizon } = v
    const h = horizon * l.h
    const w = h * (l.w / l.ih)
    const bottom = horizon + horizon * l.y
    const shift = (v.pan + v.sway) * l.px * cw * 2.2 + Math.sin(v.time * 0.6) * l.sw * cw
    let x = -w + ((-shift) % w)
    for (; x < cw; x += w) c.drawImage(l.img, x, bottom - h, w + 1, h)
  }

  private water(c: CanvasRenderingContext2D, v: View) {
    const { cw, horizon, shore, scale, time } = v
    const g = c.createLinearGradient(0, horizon, 0, shore)
    g.addColorStop(0, '#4fb6c8')
    g.addColorStop(0.55, '#2f8fb0')
    g.addColorStop(1, '#1d6a94')
    c.fillStyle = g
    c.fillRect(0, horizon, cw, shore - horizon)

    // reflexo da mata de trás, virado e comprimido
    const l = this.layers[4]
    if (l) {
      c.save()
      c.beginPath(); c.rect(0, horizon, cw, shore - horizon); c.clip()
      c.globalAlpha = 0.28
      const h = horizon * l.h * 0.55
      const w = h * (l.w / l.ih) / 0.55
      const shift = (v.pan + v.sway) * l.px * cw * 2.2
      c.translate(0, horizon * 2)
      c.scale(1, -1)
      let x = -w + ((-shift) % w)
      for (; x < cw; x += w) c.drawImage(l.img, x, horizon - h, w + 1, h)
      c.restore()
      c.globalAlpha = 1
    }

    // ondulação: riscos claros correndo devagar, mais abertos perto da margem
    c.globalCompositeOperation = 'lighter'
    const rows = this.lite ? 4 : 8
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows
      const y = horizon + (shore - horizon) * t
      const w = (30 + t * 110) * scale
      const gap = w * 2.6
      const off = ((time * (14 + i * 3) * scale) + Math.sin(time * 0.7 + i) * 20 * scale) % gap
      c.globalAlpha = 0.10 + t * 0.10
      c.fillStyle = '#d8f4ff'
      for (let x = -gap + off; x < cw + gap; x += gap) c.fillRect(x, y, w, Math.max(1, 1.2 * scale))
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'

    c.fillStyle = 'rgba(255,255,255,0.35)'
    c.fillRect(0, shore - 4 * scale, cw, 2.5 * scale)
    c.fillStyle = 'rgba(255,255,255,0.85)'
    c.fillRect(0, shore - 1.5 * scale, cw, 3 * scale)
  }

  private falls(c: CanvasRenderingContext2D, v: View) {
    const { horizon, shore, scale, time, ox } = v
    const cx = ox + NET_POSITION_X * scale + (v.pan + v.sway) * v.cw * 0.9
    const cliff = this.img.cliff
    const cw0 = 240 * scale, ch0 = cw0 * (cliff.naturalHeight / cliff.naturalWidth)
    const base = horizon + 8 * scale
    c.drawImage(cliff, cx - cw0 / 2, base - ch0, cw0, ch0)

    const fw = 58 * scale, fh = ch0 * 0.86
    const fx = cx - fw / 2, fy = base - fh
    const fa = this.img.falls_anim
    this.fallsOff = (this.fallsOff + v.dt * fh * 1.1) % fh
    c.save()
    c.beginPath(); c.rect(fx, fy, fw, fh); c.clip()
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = 0.85
    c.drawImage(fa, fx, fy + this.fallsOff - fh, fw, fh)
    c.drawImage(fa, fx, fy + this.fallsOff, fw, fh)
    c.globalAlpha = 0.45
    c.drawImage(fa, fx - fw * 0.1, fy + (this.fallsOff * 1.6) % fh - fh, fw * 1.2, fh)
    c.drawImage(fa, fx - fw * 0.1, fy + (this.fallsOff * 1.6) % fh, fw * 1.2, fh)
    c.restore()
    c.globalCompositeOperation = 'lighter'
    const pr = (40 + Math.sin(time * 2.3) * 4) * scale
    c.globalAlpha = 0.55
    c.drawImage(this.img.puff, cx - pr, base - pr * 0.9, pr * 2, pr * 1.3)
    c.globalAlpha = 0.35
    c.drawImage(this.img.puff, cx - pr * 1.6, base - pr * 0.5, pr * 3.2, pr * 1.1)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    void shore
  }

  private sandFill(c: CanvasRenderingContext2D, v: View) {
    const { cw, ch, shore, scale } = v
    if (!this.sand || Math.abs(this.sandScale - scale) > 1e-3) {
      const g = this.img.ground
      const cv = document.createElement('canvas')
      const s = Math.max(64, Math.round(g.naturalWidth * scale * 0.55))
      cv.width = s; cv.height = s
      cv.getContext('2d')!.drawImage(g, 0, 0, s, s)
      this.sand = c.createPattern(cv, 'repeat')
      this.sandScale = scale
    }
    c.fillStyle = '#e8d8b8'
    c.fillRect(0, shore, cw, ch - shore)
    if (this.sand) {
      c.globalAlpha = 0.9
      c.fillStyle = this.sand
      c.fillRect(0, shore, cw, ch - shore)
      c.globalAlpha = 1
    }
    const g = c.createLinearGradient(0, shore, 0, ch)
    g.addColorStop(0, 'rgba(255,246,222,0.35)')
    g.addColorStop(0.35, 'rgba(255,240,200,0)')
    g.addColorStop(1, 'rgba(120,80,40,0.28)')
    c.fillStyle = g
    c.fillRect(0, shore, cw, ch - shore)
    // margem molhada
    const wet = c.createLinearGradient(0, shore, 0, shore + 14 * scale)
    wet.addColorStop(0, 'rgba(60,90,110,0.32)')
    wet.addColorStop(1, 'rgba(60,90,110,0)')
    c.fillStyle = wet
    c.fillRect(0, shore, cw, 14 * scale)
  }

  private shafts(c: CanvasRenderingContext2D, v: View) {
    const { cw, horizon, time } = v
    const sh = this.img.shaft
    c.globalCompositeOperation = 'lighter'
    const n = this.lite ? 2 : 4
    for (let i = 0; i < n; i++) {
      const k = i / n
      const x = cw * (0.28 + k * 0.5) + Math.sin(time * 0.2 + i * 1.7) * cw * 0.02
      const w = cw * (0.10 + (i % 2) * 0.05)
      const h = horizon * 1.25
      c.globalAlpha = 0.28 + Math.sin(time * 0.5 + i * 2.1) * 0.1
      c.save()
      c.translate(x, 0)
      c.transform(1, 0, -0.18, 1, 0, 0)
      c.drawImage(sh, -w / 2, -h * 0.1, w, h)
      c.restore()
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
  }

  /** Objetos no primeiro plano, em coordenadas da quadra: chão à frente dos jogadores. */
  props(c: CanvasRenderingContext2D, time: number) {
    const gy = GROUND + 44
    // tronco caído à esquerda
    c.save()
    c.translate(-30, gy + 14)
    c.rotate(-0.06)
    const lg = c.createLinearGradient(0, -20, 0, 22)
    lg.addColorStop(0, '#8a5a34'); lg.addColorStop(0.5, '#6b4224'); lg.addColorStop(1, '#3e2413')
    c.fillStyle = lg
    c.beginPath(); c.roundRect(-10, -20, 190, 42, 18); c.fill()
    c.fillStyle = '#5a3a20'
    for (let i = 0; i < 5; i++) { c.fillRect(20 + i * 34, -14, 3, 30) }
    c.fillStyle = '#c99a63'
    c.beginPath(); c.ellipse(180, 1, 13, 21, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#9d6d3d'
    c.beginPath(); c.ellipse(180, 1, 8, 14, 0, 0, Math.PI * 2); c.fill()
    c.restore()
    c.fillStyle = 'rgba(70,45,20,0.28)'
    c.beginPath(); c.ellipse(60, gy + 40, 110, 12, 0, 0, Math.PI * 2); c.fill()

    // cogumelos
    for (const [mx, ms] of [[175, 1], [202, 0.72]]) {
      const my = gy + 48
      c.fillStyle = '#efe4d2'
      c.fillRect(mx - 5 * ms, my - 22 * ms, 10 * ms, 22 * ms)
      c.fillStyle = '#d63b2f'
      c.beginPath(); c.ellipse(mx, my - 22 * ms, 20 * ms, 13 * ms, 0, Math.PI, Math.PI * 2); c.fill()
      c.fillStyle = '#fff3ea'
      for (const [dx, dy, r] of [[-9, -6, 3], [4, -9, 2.6], [10, -3, 2.2]]) {
        c.beginPath(); c.arc(mx + dx * ms, my - 22 * ms + dy * ms, r * ms, 0, Math.PI * 2); c.fill()
      }
    }

    // pedra à direita
    c.save()
    c.translate(RIGHT_PLANE + 10, gy + 18)
    const rg = c.createRadialGradient(-20, -26, 6, 0, 0, 70)
    rg.addColorStop(0, '#9fa6a4'); rg.addColorStop(0.6, '#6f7775'); rg.addColorStop(1, '#3d4443')
    c.fillStyle = rg
    c.beginPath()
    c.moveTo(-70, 28); c.quadraticCurveTo(-64, -22, -20, -34); c.quadraticCurveTo(30, -44, 62, -12)
    c.quadraticCurveTo(80, 12, 66, 30); c.closePath(); c.fill()
    c.fillStyle = 'rgba(90,120,70,0.55)'
    c.beginPath(); c.ellipse(-30, -24, 26, 9, -0.3, 0, Math.PI * 2); c.fill()
    c.restore()
    c.fillStyle = 'rgba(70,45,20,0.28)'
    c.beginPath(); c.ellipse(RIGHT_PLANE + 10, gy + 48, 80, 11, 0, 0, Math.PI * 2); c.fill()

    // tufos de capim balançando
    c.strokeStyle = '#5f9a3a'
    c.lineCap = 'round'
    c.lineWidth = 3
    for (const [tx, n] of [[240, 7], [RIGHT_PLANE - 150, 6], [RIGHT_PLANE - 60, 5], [-60, 6]]) {
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 1.4 + Math.sin(time * 1.3 + i + tx) * 0.12
        const h = 26 + (i % 3) * 8
        c.beginPath()
        c.moveTo(tx + i * 4, gy + 52)
        c.quadraticCurveTo(tx + i * 4 + Math.sin(a) * h * 0.4, gy + 52 - h * 0.6, tx + i * 4 + Math.sin(a) * h, gy + 52 - h)
        c.stroke()
      }
    }
  }

  /** Partículas na frente da câmera: poeira de luz, borboletas e folhas. */
  foreground(c: CanvasRenderingContext2D, v: View) {
    const { cw, ch, scale, time, dt } = v
    c.globalCompositeOperation = 'lighter'
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(time * 0.5 + m.seed) * 0.004) * dt
      m.y += m.vy * dt
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random() }
      const pulse = 0.5 + Math.sin(time * 1.6 + m.seed) * 0.5
      const r = (5 + m.s * 5) * scale * (0.6 + pulse * 0.4)
      c.globalAlpha = 0.25 + pulse * 0.45
      c.drawImage(this.img.mote, m.x * cw - r, m.y * ch - r, r * 2, r * 2)
    }
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'

    const cols = ['#ffd257', '#7fd4ff', '#ff8fb0']
    for (const f of this.flies) {
      f.x += f.vx * dt
      f.y += Math.sin(time * 1.1 + f.seed) * 0.03 * dt
      if (f.x > 1.15) { f.x = -0.15; f.y = 0.3 + Math.random() * 0.35 }
      const flap = Math.abs(Math.sin(time * 14 + f.seed))
      const s = 22 * scale
      c.save()
      c.translate(f.x * cw, f.y * ch + Math.sin(time * 5 + f.seed) * 6 * scale)
      c.scale(0.35 + flap * 0.65, 1)
      c.drawImage(this.tint('butterfly', cols[f.col]), -s / 2, -s / 2, s, s)
      c.restore()
    }

    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i]
      l.y += l.vy * dt
      l.x += Math.sin(time * 0.9 + l.seed) * 0.05 * dt
      if (l.y > 1.1) { this.leaves[i] = this.newLeaf(); continue }
      const s = 16 * scale
      c.save()
      c.translate(l.x * cw, l.y * ch)
      c.rotate(time * l.spin + l.seed)
      c.globalAlpha = 0.85
      c.drawImage(this.tint('leaf', i % 2 ? '#8ccf5a' : '#d9c94a'), -s / 2, -s / 2, s, s * 0.7)
      c.restore()
    }
    c.globalAlpha = 1
  }
}
