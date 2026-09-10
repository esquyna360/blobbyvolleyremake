import {
  BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS,
  BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT_MAX, LEFT, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE,
  CROUCH_DUCK, CROUCH_SLIM, CROUCH_SPREAD, DIG_WINDOW, SPIKE_MIN_HOLD, SPIKE_MAX_HOLD,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import type { GameRenderer } from './stage.ts'
import { emoteAt } from '../core/emote.ts'
import { FaceRig, crouchMoods, faceEvents, rallyTension } from './face.ts'

const GROUND = GROUND_PLANE_HEIGHT_MAX
const HORIZON = 418
const BLOB_FILL = ['#ec2f3f', '#2f7ff0']
const BLOB_DARK = ['#8e0f20', '#123f96']

interface Snap { bx: number; by: number; rot: number; px: number[]; py: number[]; st: number[] }
interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Ring {
  x: number; y: number; r: number; max: number; life: number; color: string
  w?: number; flat?: boolean
}
interface Pop { side: Side; glyph: string; life: number; max: number; seed: number }
interface Band { c: string; y: number; h: number }

/**
 * Gradiente no Canvas2D é sombreado pixel a pixel: preencher a tela inteira com
 * um custa ~3.1 ms, contra 0.12 ms da mesma área em cor chapada. Faixa sólida
 * fina resolve — com passo de ~9 px ninguém distingue de um degradê.
 */
const mixHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * t))
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

function ramp(out: Band[], y0: number, y1: number, stops: string[], step: number) {
  const h = y1 - y0
  if (h <= 0) return
  const n = Math.max(2, Math.min(96, Math.ceil(h / step)))
  const seg = stops.length - 1
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const f = Math.min(seg - 0.0001, t * seg)
    const k = f | 0
    out.push({ c: mixHex(stops[k], stops[k + 1], f - k), y: y0 + (h * i) / n, h: h / n + 1 })
  }
}

/** Um disco de brilho desenhado uma vez. drawImage escalado no lugar de um gradiente radial por partícula. */
function makeGlow(): HTMLCanvasElement {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = S; cv.height = S
  const g = cv.getContext('2d')!
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  rg.addColorStop(0, 'rgba(255,255,220,1)')
  rg.addColorStop(0.32, 'rgba(255,196,60,0.85)')
  rg.addColorStop(0.68, 'rgba(255,84,10,0.5)')
  rg.addColorStop(1, 'rgba(120,20,0,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, S, S)
  return cv
}

const snap = (): Snap => ({ bx: 200, by: 300, rot: 0, px: [200, 600], py: [GROUND, GROUND], st: [0, 0] })

export class Stage2D implements GameRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cw = 1
  private ch = 1
  private scale = 1
  private ox = 0
  private oy = 0
  private prev = snap()
  private cur = snap()
  private dust: Dust[] = []
  private rings: Ring[] = []
  private gib = [0, 0]
  private trail: { x: number; y: number; life: number; seed: number }[] = []
  private pops: Pop[] = []
  private craters: { x: number; r: number }[] = []
  private scorch: { x: number; r: number; life: number }[] = []
  private time = 0
  private tension = 0
  private faces: FaceRig[] = [new FaceRig(), new FaceRig()]
  private trauma = 0
  private flash = 0
  private bands: Band[] = []
  private glow: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, private lite = false) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!ctx) throw new Error('canvas 2d indisponível')
    this.ctx = ctx
    this.glow = makeGlow()
    this.setSize(innerWidth, innerHeight)
  }

  private get dustCap() { return this.lite ? 110 : 340 }
  private get trailCap() { return this.lite ? 12 : 34 }

  setSize(w: number, h: number) {
    const dpr = this.lite ? Math.min(devicePixelRatio, 1) * 0.8 : Math.min(devicePixelRatio, 1.5)
    this.cw = Math.max(1, Math.round(w * dpr))
    this.ch = Math.max(1, Math.round(h * dpr))
    this.canvas.width = this.cw
    this.canvas.height = this.ch
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.scale = Math.min(this.cw / 880, this.ch / 640)
    this.ox = (this.cw - RIGHT_PLANE * this.scale) / 2
    this.oy = this.ch * 0.86 - (GROUND + 44) * this.scale
    const horizon = this.oy + HORIZON * this.scale
    const seaBottom = this.oy + 470 * this.scale
    // faixa fina não custa nada: o gasto é o total de pixels, não o número de retângulos
    const step = 8
    const b: Band[] = []
    ramp(b, 0, horizon, ['#0d4a9c', '#4d9dd8', '#c6e6f4'], step)
    ramp(b, horizon, seaBottom, ['#1c7f92', '#41cbbe'], step)
    ramp(b, seaBottom, this.ch, ['#e6d0a2', '#c9a771'], step)
    this.bands = b
  }

  capture(match: Match) {
    const p = this.prev, c = this.cur, w = match.world
    p.bx = c.bx; p.by = c.by; p.rot = c.rot
    p.px[0] = c.px[0]; p.px[1] = c.px[1]
    p.py[0] = c.py[0]; p.py[1] = c.py[1]
    p.st[0] = c.st[0]; p.st[1] = c.st[1]
    c.bx = w.ballX; c.by = w.ballY
    if (Math.abs(w.ballRot - p.rot) > 3.5) p.rot = w.ballRot
    c.rot = w.ballRot
    c.px[0] = w.blobX[0]; c.px[1] = w.blobX[1]
    c.py[0] = w.blobY[0]; c.py[1] = w.blobY[1]
    c.st[0] = w.blobState[0]; c.st[1] = w.blobState[1]
  }

  private burst(x: number, y: number, n: number, speed: number, color: string, up = 0.5, size = 4) {
    const room = this.dustCap - this.dust.length
    const count = Math.min(n, Math.max(0, room))
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random() * 0.85)
      this.dust.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up * speed,
        life: 0, max: 0.4 + Math.random() * 0.7, size: size * (0.5 + Math.random()), color,
      })
    }
  }

  onEvents(match: Match, events: MatchEvent[]) {
    const w = match.world
    faceEvents(this.faces, events, match.logic.scores, match.logic.scoreToWin)
    for (const e of events) {
      switch (e.event) {
        case Ev.BALL_HIT_BLOB: {
          const inten = 0.35 + e.intensity * 0.65
          this.trauma = Math.min(1, this.trauma + 0.16 * inten)
          this.burst(w.ballX, w.ballY, Math.floor(14 + 22 * inten), 190 * inten, BLOB_FILL[e.side as Side], 0.4, 5)
          break
        }
        case Ev.BALL_HIT_GROUND: {
          const power = Math.min(1, Math.abs(w.ballVY) / 16)
          this.trauma = Math.min(1, this.trauma + 0.26 * power + 0.06)
          this.burst(w.ballX, GROUND + 6, Math.floor(26 + 40 * power), 150 + 190 * power, '#d8bd8c', 1.1, 5)
          this.craters.push({ x: w.ballX, r: 22 + power * 26 })
          if (this.craters.length > 14) this.craters.shift()
          break
        }
        case Ev.BALL_HIT_NET:
        case Ev.BALL_HIT_NET_TOP:
          this.trauma = Math.min(1, this.trauma + 0.09)
          this.burst(w.ballX, w.ballY, 10, 110, '#c8d2e2', 0.5, 4)
          break
        case Ev.BALL_HIT_WALL:
          this.trauma = Math.min(1, this.trauma + 0.07)
          break
        case Ev.RESET_BALL:
          this.gib[0] = 0; this.gib[1] = 0
          break
        case Ev.SCORE:
          this.flash = Math.max(this.flash, 0.16)
          break
        case Ev.SPECIAL_READY:
          this.burst(w.blobX[e.side as Side], w.blobY[e.side as Side] - 20, 26, 120, '#ffd257', 1.5, 5)
          break
        case Ev.SPECIAL_FIRED: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.7)
          this.flash = Math.max(this.flash, 0.34)
          this.burst(w.ballX, w.ballY, 90, 520, BLOB_FILL[p], 0.3, 7)
          this.burst(w.ballX, w.ballY, 50, 700, '#fff6d8', 0.15, 5)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 260, life: 0, color: '#ffe9a8' })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 170, life: -0.08, color: BLOB_FILL[p] })
          break
        }
        case Ev.SPECIAL_HIT: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.95)
          this.flash = Math.max(this.flash, 0.46)
          this.burst(w.blobX[p], w.blobY[p], 110, 620, '#ff5a4d', 0.5, 8)
          this.burst(w.blobX[p], w.blobY[p], 60, 260, '#ffe07a', 1.4, 6)
          this.rings.push({ x: w.blobX[p], y: w.blobY[p], r: 12, max: 300, life: 0, color: '#ff8a7a' })
          break
        }
        case Ev.SPECIAL_GROUND: {
          this.trauma = 1
          this.flash = Math.max(this.flash, 0.5)
          this.burst(w.ballX, GROUND + 6, 120, 620, '#ff7a1a', 1.0, 9)
          this.burst(w.ballX, GROUND + 6, 70, 330, '#ffe07a', 1.5, 6)
          this.burst(w.ballX, GROUND + 6, 40, 200, '#4a3b33', 2.2, 7)
          this.rings.push({ x: w.ballX, y: GROUND + 6, r: 14, max: 340, life: 0, color: '#ffb347' })
          this.rings.push({ x: w.ballX, y: GROUND + 6, r: 6, max: 210, life: -0.1, color: '#fff0c0' })
          this.scorch.push({ x: w.ballX, r: 46 + Math.random() * 12, life: 0 })
          if (this.scorch.length > 6) this.scorch.shift()
          break
        }
        case Ev.PUSH: {
          const p = e.side as Side
          const bx = w.blobX[p], by = w.blobY[p] - 16
          this.rings.push({ x: bx, y: by, r: 10, max: 132, life: 0, color: '#1f7fd6', w: 10 })
          this.rings.push({ x: bx, y: by, r: 6, max: 92, life: -0.05, color: '#ffffff', w: 6 })
          this.rings.push({ x: bx, y: GROUND + 4, r: 12, max: 168, life: 0, color: '#eaf4ff', w: 6, flat: true })
          this.burst(bx, by, 16, 150, '#2f8fe0', 0.4, 4)
          break
        }
        case Ev.PUSH_HIT: {
          const p = e.side as Side
          const o: Side = p === LEFT ? 1 : 0
          const dir = p === LEFT ? 1 : -1
          this.trauma = Math.min(1, this.trauma + 0.34)
          this.burst(w.blobX[o], w.blobY[o] - 20, 30, 260, '#dbe7ff', 0.6, 5)
          this.rings.push({ x: w.blobX[o], y: w.blobY[o] - 20, r: 8, max: 120, life: 0, color: '#ffffff' })
          // sopro em volta de quem empurrou
          const hx = w.blobX[p], hy = w.blobY[p] - 16
          this.rings.push({ x: hx, y: hy, r: 12, max: 240, life: 0, color: '#1f7fd6', w: 13 })
          this.rings.push({ x: hx, y: hy, r: 6, max: 150, life: -0.06, color: '#ffffff', w: 8 })
          this.rings.push({ x: hx + dir * 22, y: hy, r: 8, max: 190, life: -0.11, color: '#7fc4ff', w: 8 })
          this.rings.push({ x: hx, y: GROUND + 4, r: 14, max: 280, life: 0, color: '#eaf4ff', w: 8, flat: true })
          this.burst(hx + dir * 30, hy, 26, 230, '#2f8fe0', 0.5, 5)
          this.burst(hx, w.blobY[p] + 4, 14, 150, '#8fbfe8', 0.15, 4)
          break
        }
        case Ev.PARRY_TRY: {
          const p = e.side as Side
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 22, r: 6, max: 64, life: 0, color: '#2aa6dd', w: 5 })
          break
        }
        case Ev.PARRY: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.45)
          this.flash = Math.max(this.flash, 0.42)
          this.burst(w.blobX[p], w.blobY[p] - 24, 46, 330, '#8fe4ff', 0.55, 5)
          this.burst(w.blobX[p], w.blobY[p] - 24, 22, 190, '#ffffff', 0.5, 4)
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 24, r: 10, max: 300, life: 0, color: '#0f9ada', w: 12 })
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 24, r: 4, max: 200, life: -0.09, color: '#e6faff', w: 8 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 160, life: -0.04, color: '#bff0ff' })
          break
        }
        case Ev.DIG: {
          const p = e.side as Side
          const dir = p === LEFT ? 1 : -1
          const bx = w.blobX[p], by = w.blobY[p] + BLOBBY_LOWER_SPHERE
          this.trauma = Math.min(1, this.trauma + 0.10)
          this.rings.push({ x: bx + dir * 26, y: by, r: 8, max: 128, life: 0, color: '#cfe9ff', w: 7 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 92, life: -0.04, color: '#ffffff', w: 5 })
          this.rings.push({ x: bx, y: GROUND + 4, r: 12, max: 150, life: 0, color: '#e9dcc0', w: 6, flat: true })
          this.burst(bx + dir * 24, by + 10, 20, 190, '#e6d6b4', 0.85, 4)
          break
        }
        case Ev.SPIKE_LEAP: {
          const p = e.side as Side
          const k = e.intensity
          this.trauma = Math.min(1, this.trauma + 0.14 + 0.16 * k)
          this.burst(w.blobX[p], GROUND - 6, Math.floor(24 + 46 * k), 250 + 220 * k, '#e0cda6', 0.9, 5)
          this.rings.push({ x: w.blobX[p], y: GROUND + 4, r: 14, max: 190 + 130 * k, life: 0, color: '#ffd257', w: 9, flat: true })
          this.rings.push({ x: w.blobX[p], y: w.blobY[p], r: 8, max: 110, life: -0.05, color: '#fff0b0', w: 6 })
          break
        }
        case Ev.SPIKE_HIT: {
          const p = e.side as Side
          const k = e.intensity
          this.trauma = Math.min(1, this.trauma + 0.34 * k)
          this.flash = Math.max(this.flash, 0.26 * k)
          this.burst(w.ballX, w.ballY, Math.floor(30 + 34 * k), 380 + 260 * k, '#ffd257', 0.4, 5)
          this.burst(w.ballX, w.ballY, 18, 220, '#ffffff', 0.4, 4)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 8, max: 190 + 120 * k, life: 0, color: '#ffb347', w: 10 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 120, life: -0.06, color: '#fff6d8', w: 6 })
          this.rings.push({ x: w.blobX[p], y: w.upperY(p), r: 6, max: 90, life: -0.02, color: '#ffe9a8', w: 5 })
          break
        }
        case Ev.FATALITY: {
          const p = e.side as Side
          const o: Side = p === LEFT ? 1 : 0
          this.trauma = 1
          this.flash = Math.max(this.flash, 0.7)
          for (let i = 0; i < 4; i++) {
            this.burst(w.blobX[o], w.blobY[o] - 20 - i * 8, 90, 520 + i * 90, i % 2 ? '#8e0b0b' : '#d81111', 2.4, 10)
          }
          this.burst(w.blobX[o], w.blobY[o] - 20, 60, 240, '#ffd0d0', 2.0, 7)
          this.burst(w.blobX[o], w.blobY[o] - 20, 70, 360, BLOB_FILL[o], 1.6, 9)
          this.burst(w.blobX[o], w.blobY[o] - 4, 40, 280, BLOB_FILL[o], 1.1, 12)
          this.rings.push({ x: w.blobX[o], y: w.blobY[o] - 20, r: 10, max: 420, life: 0, color: '#ff2d2d' })
          this.scorch.push({ x: w.blobX[o], r: 60, life: 0 })
          this.gib[o] = 1
          break
        }
      }
    }
  }

  emote(side: Side, id: number) {
    const def = emoteAt(id)
    this.pops.push({ side, glyph: def.glyph, life: 0, max: 1.9, seed: Math.random() * 6.28 })
    if (this.pops.length > 4) this.pops.shift()
    const x = this.cur.px[side]
    const y = this.cur.py[side] - BLOBBY_UPPER_SPHERE
    this.burst(x, y, id === 1 ? 42 : 20, id === 1 ? 190 : 110, def.color, id === 1 ? 1.1 : 0.7, id === 1 ? 5 : 4)
  }

  private drawPops(px: number[], py: number[]) {
    if (!this.pops.length) return
    const c = this.ctx
    for (const e of this.pops) {
      const t = e.life / e.max
      if (t >= 1) continue
      const pop = t < 0.16 ? t / 0.16 : 1
      const ease = 1 - Math.pow(1 - pop, 3)
      const size = 46 * ease * (1 + Math.sin(this.time * 11 + e.seed) * 0.06)
      const x = px[e.side] + Math.sin(this.time * 3 + e.seed) * 6
      const y = py[e.side] - BLOBBY_UPPER_SPHERE - 62 - t * 34
      c.save()
      c.globalAlpha = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      c.translate(x, y)
      c.rotate(Math.sin(this.time * 5 + e.seed) * 0.18)
      c.font = `${size}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(e.glyph, 0, 0)
      c.restore()
    }
    c.globalAlpha = 1
  }

  celebrate(side: Side) {
    this.faces[side].set('laugh', 6, 9)
    this.faces[side === LEFT ? RIGHT : LEFT].set('sad', 6, 9)
    const x = side === LEFT ? RIGHT_PLANE * 0.25 : RIGHT_PLANE * 0.75
    for (let i = 0; i < 3; i++) {
      this.burst(x, 240, 60, 300, `hsl(${Math.floor(Math.random() * 360)} 85% 60%)`, 1.2, 6)
    }
    this.trauma = Math.min(1, this.trauma + 0.35)
  }

  private step(dt: number) {
    this.time += dt
    for (const f of this.faces) f.update(dt, this.tension, false)
    if (this.pops.length) {
      const alive: Pop[] = []
      for (const e of this.pops) { e.life += dt; if (e.life < e.max) alive.push(e) }
      this.pops = alive
    }
    this.trauma = Math.max(0, this.trauma - dt * 2.2)
    if (this.scorch.length) {
      const live: { x: number; r: number; life: number }[] = []
      for (const sc of this.scorch) { sc.life += dt; if (sc.life < 14) live.push(sc) }
      this.scorch = live
    }
    this.flash = Math.max(0, this.flash - dt * 1.6)
    const keep: Dust[] = []
    for (const d of this.dust) {
      d.life += dt
      if (d.life >= d.max) continue
      d.vy += 900 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.y > GROUND) { d.y = GROUND; d.vy *= -0.3; d.vx *= 0.6 }
      keep.push(d)
    }
    this.dust = keep

    const rings: Ring[] = []
    for (const r of this.rings) {
      r.life += dt
      if (r.life >= 0.55) continue
      rings.push(r)
    }
    this.rings = rings

    const trail: typeof this.trail = []
    for (const t of this.trail) {
      t.life += dt
      if (t.life >= 0.38) continue
      trail.push(t)
    }
    this.trail = trail
  }

  private background() {
    const c = this.ctx
    const horizon = this.oy + HORIZON * this.scale
    for (const b of this.bands) { c.fillStyle = b.c; c.fillRect(0, b.y, this.cw, b.h) }

    const sunX = this.cw * 0.78, sunY = horizon - 250 * this.scale
    c.beginPath(); c.arc(sunX, sunY, 34 * this.scale, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,242,205,0.95)'; c.fill()

    c.fillStyle = 'rgba(255,255,255,0.55)'
    const clouds = this.lite ? 2 : 4
    for (let i = 0; i < clouds; i++) {
      const cx = ((i * 0.31 + this.time * 0.004) % 1.25 - 0.12) * this.cw
      const cy = horizon - (150 + i * 46) * this.scale
      const r = (26 + i * 7) * this.scale
      c.beginPath()
      c.arc(cx, cy, r, 0, Math.PI * 2)
      c.arc(cx + r * 0.9, cy + r * 0.12, r * 0.75, 0, Math.PI * 2)
      c.arc(cx - r * 0.85, cy + r * 0.2, r * 0.6, 0, Math.PI * 2)
      c.fill()
    }

    c.fillStyle = 'rgba(112,133,156,0.55)'
    for (const [hx, hw, hh] of [[0.16, 0.20, 52], [0.30, 0.14, 34], [0.66, 0.24, 44]] as [number, number, number][]) {
      c.beginPath()
      c.moveTo((hx - hw / 2) * this.cw, horizon)
      c.quadraticCurveTo(hx * this.cw, horizon - hh * this.scale, (hx + hw / 2) * this.cw, horizon)
      c.fill()
    }

    const seaBottom = this.oy + 470 * this.scale

    c.fillStyle = 'rgba(255,255,255,0.30)'
    const rows = this.lite ? 2 : 4
    for (let i = 0; i < rows; i++) {
      const y = horizon + (i + 1) * ((seaBottom - horizon) / 5.5)
      const w = (70 + i * 40) * this.scale
      const gap = w * 2.4
      const off = (Math.sin(this.time * 0.55 + i * 1.9) * 40 * this.scale) % gap
      for (let x = -gap + off; x < this.cw + gap; x += gap) {
        c.fillRect(x, y, w, Math.max(1, (0.6 + i * 0.3) * this.scale))
      }
    }

    // espuma: três tiras chapadas no lugar do degradê, mesma leitura
    const fs = this.scale
    c.fillStyle = 'rgba(255,255,255,0.28)'
    c.fillRect(0, seaBottom - 6 * fs, this.cw, 3 * fs)
    c.fillStyle = 'rgba(255,255,255,0.80)'
    c.fillRect(0, seaBottom - 3 * fs, this.cw, 3.5 * fs)
    c.fillStyle = 'rgba(255,255,255,0.30)'
    c.fillRect(0, seaBottom + 0.5 * fs, this.cw, 2.5 * fs)
  }

  private blob(p: Side, x: number, y: number, state: number, ball: { x: number; y: number },
               stunned: boolean, cr: number, hold: number) {
    if (this.gib[p] > 0) return
    const c = this.ctx
    if (stunned) {
      c.save()
      c.translate(x, y)
      c.rotate(Math.sin(this.time * 9.5) * 0.16)
      c.translate(-x, -y)
    }
    // mesma geometria do hitbox: agachado a cabeça afunda e o corpo espalha
    const squash = (1 + Math.sin(state * 1.6) * 0.045) * (1 - cr * 0.12)
    const ru = (BLOBBY_UPPER_RADIUS - cr * CROUCH_SLIM) * squash
    const rl = (BLOBBY_LOWER_RADIUS + cr * CROUCH_SPREAD) / squash
    const uy = y - (BLOBBY_UPPER_SPHERE - cr * CROUCH_DUCK) * squash
    const ly = y + BLOBBY_LOWER_SPHERE

    if (hold >= SPIKE_MIN_HOLD) this.chargeAura(x, ly, rl, hold)

    c.beginPath()
    c.arc(x, uy, ru, 0, Math.PI * 2)
    c.moveTo(x + rl, ly)
    c.arc(x, ly, rl, 0, Math.PI * 2)
    c.fillStyle = BLOB_FILL[p]
    c.fill()

    c.beginPath()
    c.arc(x - ru * 0.34, uy - ru * 0.3, ru * 0.42, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,255,255,0.30)'
    c.fill()

    c.beginPath()
    c.arc(x, ly + rl * 0.42, rl * 0.72, 0.15 * Math.PI, 0.85 * Math.PI)
    c.fillStyle = BLOB_DARK[p]
    c.globalAlpha = 0.35
    c.fill()
    c.globalAlpha = 1

    const rig = this.faces[p]
    const f = rig.cur
    const lid = Math.max(0.05, Math.min(1.6, f.lid * (0.08 + rig.blink * 0.92)))
    const fac = p === LEFT ? 1 : -1
    const line = '#171420'

    let ax = ball.x - x, ay = ball.y - uy
    const alen = Math.max(1, Math.hypot(ax, ay))
    const amp = Math.min(1, alen / 260) * ru * 0.095
    ax = (ax / alen) * amp
    ay = (ay / alen) * amp

    const k = Math.min(1, Math.max(0, (lid - 0.30) / 0.28))
    const kk = k * k * (3 - 2 * k)
    const ch = (a: number, b: number) => Math.round(a + (b - a) * kk)
    const eyeCol = `rgb(${ch(15, 248)},${ch(15, 248)},${ch(20, 255)})`

    for (const s of [-1, 1]) {
      const ex = x + ru * (fac * 0.09 + s * 0.38)
      const ey = uy - ru * 0.24
      const rx = ru * 0.25
      const ry = ru * 0.25 * lid

      c.beginPath(); c.ellipse(ex, ey, rx * 1.18, ry * 1.18 + ru * 0.012, 0, 0, Math.PI * 2)
      c.fillStyle = line; c.fill()
      c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2)
      c.fillStyle = eyeCol; c.fill()

      if (lid > 0.42) {
        const px = ex + ax, py = ey + ay
        const pr = ru * 0.115
        c.beginPath(); c.ellipse(px, py, pr, pr * Math.min(1, lid), 0, 0, Math.PI * 2)
        c.fillStyle = '#08080d'; c.fill()
        c.beginPath(); c.ellipse(px + ru * 0.045, py - ru * 0.05, ru * 0.038, ru * 0.042, 0, 0, Math.PI * 2)
        c.fillStyle = '#fff'; c.fill()
      }

      c.save()
      c.translate(ex, ey - ru * (0.37 + f.brow * 0.05))
      c.rotate(s * f.brow * 0.52)
      c.beginPath()
      c.ellipse(0, 0, ru * 0.26, ru * 0.062, 0, 0, Math.PI * 2)
      c.fillStyle = line; c.fill()
      c.restore()

      if (f.tear > 0.04) {
        const ph = (this.time * 0.55 + (s + 1) * 0.21) % 1
        const tr = ru * 0.075 * f.tear * (1 - ph * 0.4)
        c.beginPath()
        c.ellipse(ex + s * ru * 0.19, ey + ru * (0.28 + ph * 0.55), tr, tr * 1.5, 0, 0, Math.PI * 2)
        c.fillStyle = 'rgba(140,214,255,0.92)'
        c.fill()
      }
    }

    // boca: mesma parábola do shader — corners sobem no sorriso, descem na careta
    const mcx = x + ru * fac * 0.09
    const mcy = uy + ru * 0.34
    const open = (0.040 + f.open * 0.26) * ru
    const wid = (0.28 + f.open * 0.06) * ru
    const arc = (t: number) => -f.curve * 0.30 * (t * t - 0.34) * ru
    const N = 20
    c.beginPath()
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N
      const h = Math.sqrt(Math.max(0, 1 - t * t))
      const px = mcx + t * wid
      const py = mcy + arc(t) - open * h
      i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)
    }
    for (let i = N; i >= 0; i--) {
      const t = -1 + (2 * i) / N
      const h = Math.sqrt(Math.max(0, 1 - t * t))
      c.lineTo(mcx + t * wid, mcy + arc(t) + open * h)
    }
    c.closePath()
    c.strokeStyle = line
    c.lineWidth = Math.max(1, ru * 0.055)
    c.lineJoin = 'round'
    c.stroke()
    c.fillStyle = '#3a0710'
    c.fill()

    if (f.open > 0.42) {
      c.beginPath()
      c.ellipse(mcx, mcy + arc(0) + open * 0.40, wid * 0.55, open * 0.36, 0, 0, Math.PI * 2)
      c.fillStyle = '#c74350'
      c.globalAlpha = Math.min(1, (f.open - 0.42) * 3)
      c.fill()
      c.globalAlpha = 1
    }

    if (stunned) c.restore()
  }

  private drawBall(x: number, y: number, rot: number) {
    const c = this.ctx
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    c.beginPath(); c.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2)
    c.fillStyle = '#f4f6fa'; c.fill()
    c.fillStyle = '#1f5fd0'
    for (let i = 0; i < 3; i++) {
      c.beginPath()
      c.moveTo(0, 0)
      c.arc(0, 0, BALL_RADIUS, (i * 2 * Math.PI) / 3, (i * 2 * Math.PI) / 3 + 0.62)
      c.closePath()
      c.fill()
    }
    c.beginPath(); c.arc(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.34, BALL_RADIUS * 0.3, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill()
    c.restore()
  }

  private stars(x: number, y: number) {
    const c = this.ctx
    const cy = y - 62
    for (let i = 0; i < 5; i++) {
      const a = this.time * 3.1 + (i * Math.PI * 2) / 5
      const sx = x + Math.cos(a) * 34
      const sy = cy + Math.sin(a) * 11
      const s = 5 + Math.sin(a * 2) * 1.6
      c.save()
      c.translate(sx, sy)
      c.rotate(a * 1.7)
      c.fillStyle = i % 2 ? '#fff0b0' : '#ffd257'
      c.beginPath()
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? s * 0.42 : s
        const ang = (k * Math.PI) / 5 - Math.PI / 2
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py)
      }
      c.closePath(); c.fill()
      c.restore()
    }
  }

  /** Cortada carregando: anel apertando sob o blob e faíscas subindo. */
  private chargeAura(x: number, ly: number, rl: number, hold: number) {
    const c = this.ctx
    const k = Math.min(1, (hold - SPIKE_MIN_HOLD) / (SPIKE_MAX_HOLD - SPIKE_MIN_HOLD))
    const puls = 0.72 + 0.28 * Math.sin(this.time * 22)
    const cy = ly + rl * 0.5
    const full = k >= 0.97
    c.save()
    c.globalCompositeOperation = 'lighter'
    const r = rl * (1.95 - 0.6 * k)
    c.beginPath()
    c.ellipse(x, cy, r, r * 0.3, 0, 0, Math.PI * 2)
    c.strokeStyle = full ? '#fff0b0' : '#ffb347'
    c.lineWidth = 2 + 4 * k
    c.globalAlpha = (0.22 + 0.5 * k) * puls
    c.stroke()
    const gw = rl * (1.4 + k)
    c.globalAlpha = (0.10 + 0.26 * k) * puls
    c.drawImage(this.glow, x - gw, cy - gw * 0.5, gw * 2, gw)
    c.restore()

    if (this.dust.length < this.dustCap && Math.random() < 0.45 + k * 0.55) {
      const a = Math.random() * Math.PI * 2
      this.dust.push({
        x: x + Math.cos(a) * rl, y: ly + rl * 0.35, vx: Math.cos(a) * 16, vy: -60 - 110 * k,
        life: 0, max: 0.32, size: 2 + 2 * k, color: full ? '#fff0b0' : '#ffb347',
      })
    }
  }

  /** Manchete armada: riscos de velocidade varrendo pra frente, na altura do chão. */
  private digSwipe(p: Side, x: number, y: number, k: number) {
    const c = this.ctx
    const cy = y + BLOBBY_LOWER_SPHERE * 0.7
    c.save()
    c.translate(x, cy)
    c.scale(p === LEFT ? 1 : -1, 1)
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = '#dceeff'
    c.lineCap = 'round'
    const sweep = 0.24 + 0.34 * (1 - k)
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = (0.55 - i * 0.14) * k
      c.lineWidth = 6 - i * 1.5
      c.beginPath()
      c.arc(0, 0, 30 + i * 15, -0.34 - sweep, -0.34 + sweep)
      c.stroke()
    }
    c.restore()
  }

  private shadow(x: number, y: number, r: number) {
    const c = this.ctx
    const h = Math.max(0, GROUND - y)
    const k = Math.max(0.25, 1 - h / 420)
    c.beginPath()
    c.ellipse(x, GROUND + 8, r * k * 1.1, r * k * 0.34, 0, 0, Math.PI * 2)
    c.fillStyle = `rgba(90,64,32,${0.30 * k})`
    c.fill()
  }

  render(match: Match, alpha: number, dt: number) {
    crouchMoods(this.faces, match.world.crouch, match.world.spikeHold)
    this.step(dt)
    this.tension += (rallyTension(match.logic.rally) - this.tension) * Math.min(1, dt * 2.2)
    const c = this.ctx
    const p = this.prev, q = this.cur
    const lerp = (a: number, b: number) => a + (b - a) * alpha
    const bx = lerp(p.bx, q.bx), by = lerp(p.by, q.by), rot = lerp(p.rot, q.rot)
    const w = match.world
    const superOn = w.superFrames > 0
    if (superOn) {
      this.trail.push({ x: bx, y: by, life: 0, seed: Math.random() * 6.28 })
      while (this.trail.length > this.trailCap) this.trail.shift()
    }

    c.setTransform(1, 0, 0, 1, 0, 0)
    this.background()

    const t = this.trauma * this.trauma
    const sx = (Math.random() - 0.5) * 16 * t * this.scale
    const sy = (Math.random() - 0.5) * 16 * t * this.scale
    c.setTransform(this.scale, 0, 0, this.scale, this.ox + sx, this.oy + sy)

    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(20, GROUND + 44); c.lineTo(RIGHT_PLANE - 20, GROUND + 44)
    c.stroke()

    c.fillStyle = 'rgba(150,116,64,0.30)'
    for (const cr of this.craters) {
      c.beginPath(); c.ellipse(cr.x, GROUND + 10, cr.r, cr.r * 0.34, 0, 0, Math.PI * 2); c.fill()
    }

    for (const sc of this.scorch) {
      const fade = Math.max(0, 1 - sc.life / 14)
      const glow = Math.max(0, 1 - sc.life / 1.6)
      c.globalAlpha = 0.85 * fade
      c.fillStyle = '#150d09'
      c.beginPath(); c.ellipse(sc.x, GROUND + 10, sc.r, sc.r * 0.34, 0, 0, Math.PI * 2); c.fill()
      c.globalAlpha = 0.5 * fade
      c.fillStyle = '#3a2418'
      c.beginPath(); c.ellipse(sc.x, GROUND + 10, sc.r * 1.45, sc.r * 0.5, 0, 0, Math.PI * 2); c.fill()
      if (glow > 0) {
        c.globalCompositeOperation = 'lighter'
        c.globalAlpha = glow * 0.8
        const gw = sc.r * 1.3, gh = sc.r * 0.55
        c.drawImage(this.glow, sc.x - gw, GROUND + 8 - gh, gw * 2, gh * 2)
        c.globalCompositeOperation = 'source-over'
      }
      c.globalAlpha = 1
    }

    this.shadow(bx, by, BALL_RADIUS)
    for (const s of [0, 1] as Side[]) {
      if (this.gib[s] > 0) continue
      this.shadow(lerp(p.px[s], q.px[s]), lerp(p.py[s], q.py[s]), BLOBBY_LOWER_RADIUS)
    }

    for (const s of [0, 1] as Side[]) {
      const sx = lerp(p.px[s], q.px[s]), sy = lerp(p.py[s], q.py[s])
      if (w.digActive[s] > 0) this.digSwipe(s, sx, sy, w.digActive[s] / DIG_WINDOW)
      this.blob(s, sx, sy, lerp(p.st[s], q.st[s]), { x: bx, y: by }, w.stun[s] > 0, w.crouch[s], w.spikeHold[s])
    }

    for (const s of [0, 1] as Side[]) {
      if (w.stun[s] > 0) this.stars(lerp(p.px[s], q.px[s]), lerp(p.py[s], q.py[s]))
    }

    if (this.trail.length) {
      c.globalCompositeOperation = 'lighter'
      for (const f of this.trail) {
        const k = Math.max(0, 1 - f.life / 0.5)
        if (k <= 0) continue
        const flick = 1 + Math.sin(this.time * 30 + f.seed) * 0.22
        const r = BALL_RADIUS * (0.22 + k * 0.95) * flick
        const drift = (1 - k) * 26
        const fy = f.y - drift
        c.globalAlpha = 0.85 * k
        c.drawImage(this.glow, f.x - r, fy - r, r * 2, r * 2)
      }
      c.globalCompositeOperation = 'source-over'
      c.globalAlpha = 1
    }

    if (superOn) {
      c.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 7; i++) {
        const a = this.time * 17 + i * 0.9
        const rr = BALL_RADIUS * (0.9 + Math.sin(a * 1.7) * 0.22)
        const fx = bx + Math.cos(a) * BALL_RADIUS * 0.55
        const fy = by + Math.sin(a * 1.3) * BALL_RADIUS * 0.45 - 6
        c.globalAlpha = 0.8
        c.drawImage(this.glow, fx - rr, fy - rr, rr * 2, rr * 2)
      }
      c.globalAlpha = 1
      c.globalCompositeOperation = 'source-over'
      const pulse = 1 + Math.sin(this.time * 26) * 0.12
      const gr = BALL_RADIUS * 2.4 * pulse
      c.globalAlpha = 0.75
      c.drawImage(this.glow, bx - gr, by - gr, gr * 2, gr * 2)
      c.globalAlpha = 1
    }

    for (const r of this.rings) {
      const k = Math.max(0, r.life / 0.55)
      if (k <= 0) continue
      const rad = r.r + (r.max - r.r) * (1 - Math.pow(1 - k, 2.4))
      c.globalAlpha = Math.max(0, 1 - k) * 0.9
      c.strokeStyle = r.color
      c.lineWidth = (r.w ?? 7) * (1 - k) + 1.5
      c.beginPath()
      if (r.flat) c.ellipse(r.x, r.y, rad, rad * 0.34, 0, 0, Math.PI * 2)
      else c.arc(r.x, r.y, rad, 0, Math.PI * 2)
      c.stroke()
    }
    c.globalAlpha = 1

    this.drawBall(bx, by, rot)

    const nx = NET_POSITION_X
    c.fillStyle = 'rgba(236,242,250,0.16)'
    c.fillRect(nx - NET_RADIUS, NET_SPHERE_POSITION, NET_RADIUS * 2, GROUND + 30 - NET_SPHERE_POSITION)
    c.strokeStyle = 'rgba(240,246,255,0.75)'
    c.lineWidth = 1.4
    c.beginPath()
    for (let y = NET_SPHERE_POSITION + 6; y < GROUND + 30; y += 11) {
      c.moveTo(nx - NET_RADIUS, y); c.lineTo(nx + NET_RADIUS, y)
    }
    c.moveTo(nx - NET_RADIUS, NET_SPHERE_POSITION); c.lineTo(nx - NET_RADIUS, GROUND + 30)
    c.moveTo(nx + NET_RADIUS, NET_SPHERE_POSITION); c.lineTo(nx + NET_RADIUS, GROUND + 30)
    c.stroke()
    c.fillStyle = '#33465a'
    c.fillRect(nx - 2.5, GROUND + 20, 5, 26)
    c.beginPath(); c.arc(nx, NET_SPHERE_POSITION, NET_RADIUS + 2.5, 0, Math.PI * 2)
    c.fillStyle = '#eef3fa'; c.fill()

    this.drawPops(
      [lerp(p.px[0], q.px[0]), lerp(p.px[1], q.px[1])],
      [lerp(p.py[0], q.py[0]), lerp(p.py[1], q.py[1])])

    for (const d of this.dust) {
      c.globalAlpha = Math.max(0, 1 - d.life / d.max)
      c.fillStyle = d.color
      c.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size)
    }
    c.globalAlpha = 1

    if (this.flash > 0.001) {
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.fillStyle = `rgba(255,255,255,${this.flash})`
      c.fillRect(0, 0, this.cw, this.ch)
    }
  }

  dispose() {
    this.dust.length = 0
    this.scorch.length = 0
    this.craters.length = 0
    this.rings.length = 0
    this.trail.length = 0
    this.pops.length = 0
  }
}
