import {
  BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS,
  BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT_MAX, LEFT, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, RIGHT_PLANE,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import type { GameRenderer } from './stage.ts'
import { emoteAt } from '../core/emote.ts'

const GROUND = GROUND_PLANE_HEIGHT_MAX
const HORIZON = 418
const BLOB_FILL = ['#ec2f3f', '#2f7ff0']
const BLOB_DARK = ['#8e0f20', '#123f96']

interface Snap { bx: number; by: number; rot: number; px: number[]; py: number[]; st: number[] }
interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Ring { x: number; y: number; r: number; max: number; life: number; color: string }
interface Pop { side: Side; glyph: string; life: number; max: number; seed: number }

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
  private trail: { x: number; y: number; life: number; seed: number }[] = []
  private pops: Pop[] = []
  private craters: { x: number; r: number }[] = []
  private scorch: { x: number; r: number; life: number }[] = []
  private time = 0
  private trauma = 0
  private flash = 0
  private sky: CanvasGradient | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!ctx) throw new Error('canvas 2d indisponível')
    this.ctx = ctx
    this.setSize(innerWidth, innerHeight)
  }

  setSize(w: number, h: number) {
    const dpr = Math.min(devicePixelRatio, 1.5)
    this.cw = Math.max(1, Math.round(w * dpr))
    this.ch = Math.max(1, Math.round(h * dpr))
    this.canvas.width = this.cw
    this.canvas.height = this.ch
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.scale = Math.min(this.cw / 880, this.ch / 640)
    this.ox = (this.cw - RIGHT_PLANE * this.scale) / 2
    this.oy = this.ch * 0.86 - (GROUND + 44) * this.scale
    const g = this.ctx.createLinearGradient(0, 0, 0, this.oy + HORIZON * this.scale)
    g.addColorStop(0, '#0d4a9c')
    g.addColorStop(0.5, '#4d9dd8')
    g.addColorStop(1, '#c6e6f4')
    this.sky = g
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
    const room = 340 - this.dust.length
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
        case Ev.PUSH_HIT: {
          const p = e.side as Side
          const o: Side = p === LEFT ? 1 : 0
          this.trauma = Math.min(1, this.trauma + 0.34)
          this.burst(w.blobX[o], w.blobY[o] - 20, 30, 260, '#dbe7ff', 0.6, 5)
          this.rings.push({ x: w.blobX[o], y: w.blobY[o] - 20, r: 8, max: 120, life: 0, color: '#ffffff' })
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
          this.rings.push({ x: w.blobX[o], y: w.blobY[o] - 20, r: 10, max: 420, life: 0, color: '#ff2d2d' })
          this.scorch.push({ x: w.blobX[o], r: 60, life: 0 })
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
    const x = side === LEFT ? RIGHT_PLANE * 0.25 : RIGHT_PLANE * 0.75
    for (let i = 0; i < 3; i++) {
      this.burst(x, 240, 60, 300, `hsl(${Math.floor(Math.random() * 360)} 85% 60%)`, 1.2, 6)
    }
    this.trauma = Math.min(1, this.trauma + 0.35)
  }

  private step(dt: number) {
    this.time += dt
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
    c.fillStyle = this.sky!
    c.fillRect(0, 0, this.cw, horizon)

    const sunX = this.cw * 0.78, sunY = horizon - 250 * this.scale
    c.beginPath(); c.arc(sunX, sunY, 34 * this.scale, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,242,205,0.95)'; c.fill()

    c.fillStyle = 'rgba(255,255,255,0.55)'
    for (let i = 0; i < 4; i++) {
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
    const sea = c.createLinearGradient(0, horizon, 0, seaBottom)
    sea.addColorStop(0, '#1c7f92')
    sea.addColorStop(1, '#41cbbe')
    c.fillStyle = sea
    c.fillRect(0, horizon, this.cw, seaBottom - horizon)

    c.fillStyle = 'rgba(255,255,255,0.30)'
    for (let i = 0; i < 4; i++) {
      const y = horizon + (i + 1) * ((seaBottom - horizon) / 5.5)
      const w = (70 + i * 40) * this.scale
      const gap = w * 2.4
      const off = (Math.sin(this.time * 0.55 + i * 1.9) * 40 * this.scale) % gap
      for (let x = -gap + off; x < this.cw + gap; x += gap) {
        c.fillRect(x, y, w, Math.max(1, (0.6 + i * 0.3) * this.scale))
      }
    }

    const foam = c.createLinearGradient(0, seaBottom - 7 * this.scale, 0, seaBottom + 5 * this.scale)
    foam.addColorStop(0, 'rgba(255,255,255,0)')
    foam.addColorStop(0.6, 'rgba(255,255,255,0.85)')
    foam.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = foam
    c.fillRect(0, seaBottom - 7 * this.scale, this.cw, 12 * this.scale)

    const sand = c.createLinearGradient(0, seaBottom, 0, this.ch)
    sand.addColorStop(0, '#e6d0a2')
    sand.addColorStop(1, '#c9a771')
    c.fillStyle = sand
    c.fillRect(0, seaBottom, this.cw, this.ch - seaBottom)
  }

  private blob(p: Side, x: number, y: number, state: number, ball: { x: number; y: number }, stunned = false) {
    const c = this.ctx
    if (stunned) {
      c.save()
      c.translate(x, y)
      c.rotate(Math.sin(this.time * 9.5) * 0.16)
      c.translate(-x, -y)
    }
    const squash = 1 + Math.sin(state * 1.6) * 0.045
    const ru = BLOBBY_UPPER_RADIUS * squash
    const rl = BLOBBY_LOWER_RADIUS / squash
    const uy = y - BLOBBY_UPPER_SPHERE * squash
    const ly = y + BLOBBY_LOWER_SPHERE

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

    const dx = ball.x - x, dy = ball.y - uy
    const len = Math.max(1, Math.hypot(dx, dy))
    const ex = (dx / len) * 2.6, ey = (dy / len) * 2.6
    for (const s of [-1, 1]) {
      const px = x + s * ru * 0.40, py = uy - ru * 0.16
      c.beginPath(); c.arc(px, py, ru * 0.30, 0, Math.PI * 2)
      c.fillStyle = '#fff'; c.fill()
      c.beginPath(); c.arc(px + ex, py + ey, ru * 0.145, 0, Math.PI * 2)
      c.fillStyle = '#11151c'; c.fill()
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
    this.step(dt)
    const c = this.ctx
    const p = this.prev, q = this.cur
    const lerp = (a: number, b: number) => a + (b - a) * alpha
    const bx = lerp(p.bx, q.bx), by = lerp(p.by, q.by), rot = lerp(p.rot, q.rot)
    const w = match.world
    const superOn = w.superFrames > 0
    if (superOn) {
      this.trail.push({ x: bx, y: by, life: 0, seed: Math.random() * 6.28 })
      if (this.trail.length > 34) this.trail.shift()
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
        const eg = c.createRadialGradient(sc.x, GROUND + 8, 2, sc.x, GROUND + 8, sc.r * 1.3)
        eg.addColorStop(0, 'rgba(255,190,60,1)')
        eg.addColorStop(1, 'rgba(255,60,0,0)')
        c.fillStyle = eg
        c.beginPath(); c.ellipse(sc.x, GROUND + 8, sc.r * 1.3, sc.r * 0.55, 0, 0, Math.PI * 2); c.fill()
        c.globalCompositeOperation = 'source-over'
      }
      c.globalAlpha = 1
    }

    this.shadow(bx, by, BALL_RADIUS)
    for (const s of [0, 1] as Side[]) this.shadow(lerp(p.px[s], q.px[s]), lerp(p.py[s], q.py[s]), BLOBBY_LOWER_RADIUS)

    for (const s of [0, 1] as Side[]) {
      this.blob(s, lerp(p.px[s], q.px[s]), lerp(p.py[s], q.py[s]), lerp(p.st[s], q.st[s]), { x: bx, y: by }, w.stun[s] > 0)
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
        const fg = c.createRadialGradient(f.x, fy, 0, f.x, fy, r)
        fg.addColorStop(0, `rgba(255,255,220,${0.85 * k})`)
        fg.addColorStop(0.32, `rgba(255,196,60,${0.72 * k})`)
        fg.addColorStop(0.68, `rgba(255,84,10,${0.42 * k})`)
        fg.addColorStop(1, 'rgba(120,20,0,0)')
        c.fillStyle = fg
        c.beginPath(); c.arc(f.x, fy, r, 0, Math.PI * 2); c.fill()
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
        const fg = c.createRadialGradient(fx, fy, 0, fx, fy, rr)
        fg.addColorStop(0, 'rgba(255,255,210,0.8)')
        fg.addColorStop(0.5, 'rgba(255,150,30,0.45)')
        fg.addColorStop(1, 'rgba(255,60,0,0)')
        c.fillStyle = fg
        c.beginPath(); c.arc(fx, fy, rr, 0, Math.PI * 2); c.fill()
      }
      c.globalCompositeOperation = 'source-over'
      const pulse = 1 + Math.sin(this.time * 26) * 0.12
      const g = c.createRadialGradient(bx, by, BALL_RADIUS * 0.4, bx, by, BALL_RADIUS * 2.4 * pulse)
      g.addColorStop(0, 'rgba(255,246,200,0.75)')
      g.addColorStop(0.5, 'rgba(255,170,40,0.35)')
      g.addColorStop(1, 'rgba(255,140,0,0)')
      c.fillStyle = g
      c.beginPath(); c.arc(bx, by, BALL_RADIUS * 2.4 * pulse, 0, Math.PI * 2); c.fill()
    }

    for (const r of this.rings) {
      const k = Math.max(0, r.life / 0.55)
      if (k <= 0) continue
      c.globalAlpha = Math.max(0, 1 - k) * 0.85
      c.strokeStyle = r.color
      c.lineWidth = 7 * (1 - k) + 1.5
      c.beginPath(); c.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2); c.stroke()
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
