import {
  BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS,
  BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE,
  CROUCH_DUCK, CROUCH_SLIM, CROUCH_SPREAD, DIG_WINDOW,
  DIVE_RECOVER, OPEN_MARGIN, SPECIAL_FULL, SPECIAL_HOLD, SPECIAL_REACH,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import type { BigKind, GameRenderer } from './stage.ts'
import { emoteAt } from '../core/emote.ts'
import { FaceRig, crouchMoods, faceEvents, rallyTension, reachMoods } from './face.ts'
import { getScene } from './scenes.ts'
import type { Scene, SceneId } from './scenes.ts'
import { bodyHex, defaultLook, hairHex, hairStyle, shade, tuftBeads, puffCenter } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import type { TargetMark } from '../core/drill.ts'
import { PixelScene } from './pixelscene.ts'
import { FONT_H, pxText, textWidth } from './pixelfont.ts'

const GROUND = GROUND_PLANE_HEIGHT_MAX
const CRATER_LIFE = 7
/** Altura do mundo em pixels: a quadra (880 + margens) cabe em ~2.3 unidades por pixel. */
const VH = 216
export const INTRO_LEN = 5.6

interface Snap { bx: number; by: number; rot: number; px: number[]; py: number[]; st: number[] }
interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size?: number }
interface Ring { x: number; y: number; r: number; max: number; life: number; color: string; w?: number; flat?: boolean }
interface Pop { side: Side; id: number; life: number; max: number; seed: number }
interface Big { text: string; kind: BigKind; color: string; life: number; max: number }
interface Cols { base: string; hi: string; dk: string; dk2: string }

const snap = (): Snap => ({ bx: 200, by: 300, rot: 0, px: [200, 600], py: [GROUND, GROUND], st: [0, 0] })
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (k: number) => k * k * (3 - 2 * k)

export function ellipseP(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number,
                         cols: Cols, lx = -0.5, ly = -0.6) {
  rx = Math.max(1, rx); ry = Math.max(1, ry)
  const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1)
  const y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1)
  const irx = Math.max(0.5, rx - 1), iry = Math.max(0.5, ry - 1)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry
    const d = nx * nx + ny * ny
    if (d > 1) continue
    const nx2 = (x + 0.5 - cx) / irx, ny2 = (y + 0.5 - cy) / iry
    const inner = nx2 * nx2 + ny2 * ny2 <= 1
    const lit = nx * lx + ny * ly
    let col: string
    if (!inner) col = cols.dk2
    else if (lit > 0.62 && d < 0.6) col = cols.hi
    else if (lit < -0.45 && d > 0.45) col = cols.dk
    else col = cols.base
    g.fillStyle = col; g.fillRect(x, y, 1, 1)
  }
}

export function outlineP(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, col: string) {
  const n = Math.max(8, Math.ceil((rx + ry) * 4))
  g.fillStyle = col
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.fillRect(Math.round(cx + Math.cos(a) * rx - 0.5), Math.round(cy + Math.sin(a) * ry - 0.5), 1, 1)
  }
}

function discP(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  g.fillStyle = col
  const rr = Math.max(0, Math.round(r))
  for (let yy = -rr; yy <= rr; yy++) {
    const w = Math.round(Math.sqrt(Math.max(0, rr * rr - yy * yy)))
    g.fillRect(Math.round(cx - w), Math.round(cy + yy), w * 2 + 1, 1)
  }
}

function colsOf(hex: string): Cols {
  return { base: hex, hi: shade(hex, 1.45), dk: shade(hex, 0.62), dk2: shade(hex, 0.32) }
}

export class StagePixel implements GameRenderer {
  timeScale() { return this.intro >= 0 ? 0 : 1 }
  ballHint() { return null }
  private canvas: HTMLCanvasElement
  private screen: CanvasRenderingContext2D
  private world: HTMLCanvasElement
  private g: CanvasRenderingContext2D
  private cw = 1
  private ch = 1
  /** tamanho do mundo em pixels de jogo */
  private W = 384
  private H = VH
  /** escala mundo(física) → pixel */
  private scale = 0.25
  private ox = 0
  private oy = 0
  private prev = snap()
  private cur = snap()
  private dust: Dust[] = []
  private rings: Ring[] = []
  private gib = [0, 0]
  private solo = false
  private target: TargetMark | null = null
  private targetFlash = 0
  private targetState = 0
  private diveK = [0, 0]
  private trail: { x: number; y: number; life: number }[] = []
  private pops: Pop[] = []
  private bigs: Big[] = []
  private pendingBigs: Big[] = []
  private craters: { x: number; r: number; life: number }[] = []
  private scorch: { x: number; r: number; life: number }[] = []
  private skids: { x: number; dir: number; life: number }[] = []
  private time = 0
  private tension = 0
  private faces: FaceRig[] = [new FaceRig(), new FaceRig()]
  private trauma = 0
  private hitstop = 0
  private energy = 0
  private blobFlash = [0, 0]
  private blobKick = [0, 0]
  private aber = 0
  private flash = 0
  private squash = { k: 0, ang: 0 }
  private wallHits: { x: number; y: number; life: number }[] = []
  private scene: Scene = getScene('praia')
  private px: PixelScene
  private pan = 0
  private wallsOn = true
  private frameExtra = 0
  private zoom = 1
  private looks: PlayerLook[] = [defaultLook(LEFT), defaultLook(RIGHT)]
  private cols: Cols[] = [colsOf(bodyHex(defaultLook(LEFT))), colsOf(bodyHex(defaultLook(RIGHT)))]
  private hairCols: Cols[] = [colsOf(hairHex(defaultLook(LEFT))), colsOf(hairHex(defaultLook(RIGHT)))]
  private names = ['P1', 'P2']
  /** cinemática de abertura: -1 desligada */
  private intro = -1
  private cut = 0
  private onKey = (e: KeyboardEvent) => { if (this.intro >= 0 && !e.repeat) this.skipIntro() }
  private onPointer = () => { if (this.intro >= 0) this.skipIntro() }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!ctx) throw new Error('canvas 2d indisponível')
    this.screen = ctx
    this.world = document.createElement('canvas')
    const g = this.world.getContext('2d', { alpha: false })
    if (!g) throw new Error('canvas 2d indisponível')
    this.g = g
    this.px = new PixelScene(this.scene, this.W, this.H)
    this.setSize(innerWidth, innerHeight)
    addEventListener('keydown', this.onKey)
    addEventListener('pointerdown', this.onPointer)
  }

  setSize(w: number, h: number) {
    this.cw = Math.max(1, Math.round(w))
    this.ch = Math.max(1, Math.round(h))
    this.canvas.width = this.cw
    this.canvas.height = this.ch
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    const aspect = this.cw / this.ch
    this.H = VH
    this.W = clamp(Math.round(VH * aspect), 240, 640)
    this.world.width = this.W
    this.world.height = this.H
    this.g.imageSmoothingEnabled = false
    this.screen.imageSmoothingEnabled = false
    this.px.resize(this.W, this.H)
    this.applyFrame()
  }

  private applyFrame() {
    const fitW = this.W / (RIGHT_PLANE + 90 + this.frameExtra * 2)
    const fitH = this.H / 640
    this.scale = Math.min(fitW, fitH) * this.zoom
    this.ox = (this.W - RIGHT_PLANE * this.scale) / 2
    this.oy = this.H * 0.86 - (GROUND + 44) * this.scale
  }

  setScene(id: SceneId) {
    this.scene = getScene(id)
    this.px.setScene(this.scene)
  }

  setWalls(on: boolean) { this.wallsOn = on }
  setBeat(_bar: number, _beat: number) { }
  setSolo(on: boolean) { this.solo = on }

  setLook(side: Side, look: PlayerLook) {
    this.looks[side] = look
    this.cols[side] = colsOf(bodyHex(look))
    this.hairCols[side] = colsOf(hairHex(look))
  }

  setNames(l: string, r: string) { this.names = [l, r] }

  startIntro() {
    if (this.solo) return
    this.intro = 0
    this.cut = 0
    for (const b of this.bigs) { b.life = 0; this.pendingBigs.push(b) }
    this.bigs.length = 0
    this.faces[LEFT].set('smug', 3.4, 3)
    this.faces[RIGHT].set('focus', 4.8, 3)
    this.trail.length = 0
    this.rings.length = 0
    this.dust.length = 0
  }

  introActive() { return this.intro >= 0 }

  skipIntro() {
    if (this.intro < 0) return
    this.cut = 0.6
    this.endIntro()
  }

  private endIntro() {
    this.intro = -1
    this.faces[LEFT].reset()
    this.faces[RIGHT].reset()
    for (const b of this.pendingBigs) this.bigs.push(b)
    this.pendingBigs.length = 0
  }

  setTarget(t: TargetMark | null) {
    const st = t?.state ?? 0
    if (st !== 0 && st !== this.targetState) this.targetFlash = 1
    this.targetState = st
    this.target = t
  }

  private off(p: Side) { return this.gib[p] > 0 || (this.solo && p === RIGHT) }

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
    if (this.intro >= 0) return
    for (const s of [0, 1] as Side[]) {
      if (this.off(s)) continue
      const wasG = p.py[s] >= GROUND_PLANE_HEIGHT - 0.5, isG = c.py[s] >= GROUND_PLANE_HEIGHT - 0.5
      if (wasG && !isG && c.py[s] < p.py[s]) {
        this.burst(c.px[s], GROUND + 4, 16, 140, shade(this.px.pal.sand1, 1.25), 0.9, 2)
        this.blobKick[s] = Math.max(this.blobKick[s], 0.3)
      } else if (!wasG && isG) {
        const power = clamp((c.py[s] - p.py[s]) / 14, 0.15, 1)
        this.burst(c.px[s], GROUND + 4, Math.floor(18 + 30 * power), 130 + 170 * power, shade(this.px.pal.sand1, 1.25), 0.6, 2)
        this.burst(c.px[s], GROUND + 2, Math.floor(8 + 12 * power), 100 + 140 * power, this.px.pal.sandDk, 0.3, 1)
        this.blobKick[s] = Math.max(this.blobKick[s], 0.35 + 0.45 * power)
        this.rings.push({ x: c.px[s], y: GROUND + 2, r: 8, max: 40 + 50 * power, life: 0, color: this.px.pal.sand1, flat: true })
        if (power > 0.6) this.trauma = Math.min(1, this.trauma + 0.08 * power)
      }
    }
  }

  private squashBall(w: Match['world'], k: number) {
    const v = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
    this.squash.ang = v > 0.001 ? Math.atan2(w.ballVY, w.ballVX) : 0
    this.squash.k = Math.max(this.squash.k, k)
  }

  private burst(x: number, y: number, n: number, speed: number, color: string, up = 0.5, size = 1) {
    const room = 260 - this.dust.length
    const count = Math.min(Math.ceil(n * 0.6), Math.max(0, room))
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.35 + Math.random() * 0.85)
      this.dust.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up * speed,
        life: 0, max: 0.4 + Math.random() * 0.7, color, size,
      })
    }
  }

  private fill(p: Side) { return this.cols[p].base }
  private light(p: Side) { return this.cols[p].hi }

  onEvents(match: Match, events: MatchEvent[]) {
    const w = match.world
    faceEvents(this.faces, events, match.logic.scores, match.logic.scoreToWin)
    for (const e of events) {
      switch (e.event) {
        case Ev.BALL_HIT_BLOB: {
          const inten = 0.35 + e.intensity * 0.65
          this.trauma = Math.min(1, this.trauma + 0.16 * inten)
          this.burst(w.ballX, w.ballY, Math.floor(14 + 22 * inten), 190 * inten, this.fill(e.side as Side), 0.4)
          this.squashBall(w, 0.10 + 0.07 * inten)
          break
        }
        case Ev.BALL_HIT_GROUND: {
          const power = Math.min(1, Math.abs(w.ballVY) / 16)
          this.trauma = Math.min(1, this.trauma + 0.26 * power + 0.06)
          this.burst(w.ballX, GROUND + 6, Math.floor(26 + 40 * power), 150 + 190 * power, this.px.pal.sand2, 1.1)
          this.squashBall(w, 0.10 + 0.08 * power)
          this.craters.push({ x: w.ballX, r: 22 + power * 26, life: 0 })
          if (this.craters.length > 14) this.craters.shift()
          break
        }
        case Ev.BALL_HIT_NET:
        case Ev.BALL_HIT_NET_TOP:
          this.trauma = Math.min(1, this.trauma + 0.09)
          this.burst(w.ballX, w.ballY, 10, 110, '#c8d2e2', 0.5)
          this.squashBall(w, 0.09)
          break
        case Ev.BALL_HIT_WALL: {
          this.trauma = Math.min(1, this.trauma + 0.07)
          this.squashBall(w, 0.12)
          this.wallHits.push({ x: e.side === LEFT ? LEFT_PLANE : RIGHT_PLANE, y: w.ballY, life: 0 })
          if (this.wallHits.length > 5) this.wallHits.shift()
          break
        }
        case Ev.RESET_BALL:
          this.gib[0] = 0; this.gib[1] = 0
          break
        case Ev.SCORE:
          this.flash = Math.max(this.flash, 0.16)
          break
        case Ev.SPECIAL_READY:
          this.burst(w.blobX[e.side as Side], w.blobY[e.side as Side] - 20, 26, 120, '#ffd257', 1.5)
          break
        case Ev.SPECIAL_HOLD: {
          const p = e.side as Side
          this.hitstop = Math.max(this.hitstop, 0.07)
          this.blobFlash[p] = 1
          this.blobKick[p] = Math.max(this.blobKick[p], 0.5)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 150, life: 0, color: this.light(p) })
          break
        }
        case Ev.SPECIAL_FIRED: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.7)
          this.flash = Math.max(this.flash, 0.34)
          this.hitstop = Math.max(this.hitstop, e.intensity >= 1 ? 0.16 : 0.11)
          this.aber = Math.max(this.aber, 1)
          this.blobFlash[p] = 1
          this.blobKick[p] = 1
          this.burst(w.ballX, w.ballY, 90, 520, this.light(p), 0.3)
          this.burst(w.ballX, w.ballY, 50, 700, '#fff6d8', 0.15)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 260, life: 0, color: '#ffe9a8', w: 2 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 170, life: -0.08, color: this.light(p) })
          break
        }
        case Ev.SPECIAL_HIT: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.95)
          this.flash = Math.max(this.flash, 0.46)
          this.hitstop = Math.max(this.hitstop, 0.16)
          this.aber = Math.max(this.aber, 1)
          this.blobFlash[p] = 1
          this.blobKick[p] = 1
          this.burst(w.blobX[p], w.blobY[p], 110, 620, '#ff5a4d', 0.5)
          this.burst(w.blobX[p], w.blobY[p], 60, 260, '#ffe07a', 1.4)
          this.rings.push({ x: w.blobX[p], y: w.blobY[p], r: 12, max: 300, life: 0, color: '#ff8a7a', w: 2 })
          break
        }
        case Ev.SPECIAL_GROUND: {
          this.trauma = 1
          this.flash = Math.max(this.flash, 0.5)
          this.hitstop = Math.max(this.hitstop, 0.14)
          this.aber = Math.max(this.aber, 1.2)
          this.burst(w.ballX, GROUND + 6, 120, 620, '#ff7a1a', 1.0)
          this.burst(w.ballX, GROUND + 6, 70, 330, '#ffe07a', 1.5)
          this.burst(w.ballX, GROUND + 6, 40, 200, '#4a3b33', 2.2)
          this.rings.push({ x: w.ballX, y: GROUND + 6, r: 14, max: 340, life: 0, color: '#ffb347', w: 2, flat: true })
          this.rings.push({ x: w.ballX, y: GROUND + 6, r: 6, max: 210, life: -0.1, color: '#fff0c0' })
          this.scorch.push({ x: w.ballX, r: 46 + Math.random() * 12, life: 0 })
          if (this.scorch.length > 6) this.scorch.shift()
          break
        }
        case Ev.DIVE: {
          const p = e.side as Side
          const d = w.diveDir[p] || 1
          this.trauma = Math.min(1, this.trauma + 0.10)
          this.burst(w.blobX[p] - d * 12, GROUND + 4, 22, 260, this.px.pal.sand1, 0.9)
          this.burst(w.blobX[p] - d * 12, GROUND + 4, 10, 150, this.px.pal.sand2, 0.5)
          this.skids.push({ x: w.blobX[p] + d * 46, dir: d, life: 0 })
          if (this.skids.length > 5) this.skids.shift()
          break
        }
        case Ev.DIVE_HIT: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.2)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 8, max: 124, life: 0, color: '#ffffff', w: 2 })
          this.burst(w.ballX, w.ballY, 26, 300, '#f2ddaa', 1.1)
          this.burst(w.blobX[p], GROUND + 4, 16, 210, this.px.pal.sand2, 0.7)
          this.squashBall(w, 0.24)
          break
        }
        case Ev.APEX_HIT: {
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 128, life: 0, color: '#fff2b0' })
          this.burst(w.ballX, w.ballY, 12, 200, '#ffe89a', 0.4)
          break
        }
        case Ev.SPECIAL_WASTED: {
          const p = e.side as Side
          const hx = w.blobX[p], hy = w.blobY[p] - BLOBBY_UPPER_SPHERE
          this.trauma = Math.min(1, this.trauma + 0.16)
          this.rings.push({ x: hx, y: hy, r: 10, max: SPECIAL_REACH * 1.1, life: 0, color: '#ffb04d', w: 2 })
          this.rings.push({ x: hx, y: hy, r: 6, max: 120, life: -0.07, color: '#6b7080' })
          this.burst(hx, hy, 30, 240, '#c9a24a', 1.1)
          break
        }
        case Ev.PARRY_TRY: {
          const p = e.side as Side
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 22, r: 6, max: 64, life: 0, color: '#2aa6dd' })
          break
        }
        case Ev.PARRY: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.45)
          this.flash = Math.max(this.flash, 0.42)
          this.burst(w.blobX[p], w.blobY[p] - 24, 46, 330, '#8fe4ff', 0.55)
          this.burst(w.blobX[p], w.blobY[p] - 24, 22, 190, '#ffffff', 0.5)
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 24, r: 10, max: 300, life: 0, color: '#0f9ada', w: 2 })
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 24, r: 4, max: 200, life: -0.09, color: '#e6faff', w: 2 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 160, life: -0.04, color: '#bff0ff' })
          break
        }
        case Ev.DIG: {
          const p = e.side as Side
          const dir = p === LEFT ? 1 : -1
          const bx = w.blobX[p], by = w.blobY[p] + BLOBBY_LOWER_SPHERE
          this.trauma = Math.min(1, this.trauma + 0.10)
          this.rings.push({ x: bx + dir * 26, y: by, r: 8, max: 128, life: 0, color: '#cfe9ff', w: 2 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 92, life: -0.04, color: '#ffffff' })
          this.rings.push({ x: bx, y: GROUND + 4, r: 12, max: 150, life: 0, color: '#e9dcc0', flat: true })
          this.burst(bx + dir * 24, by + 10, 20, 190, '#e6d6b4', 0.85)
          break
        }
        case Ev.BALL_OUT: {
          this.trauma = Math.min(1, this.trauma + 0.08)
          this.burst(w.ballX, w.ballY, 16, 180, '#ff8a7a', 0.5)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 130, life: 0, color: '#ff8a7a' })
          break
        }
        case Ev.FATALITY: {
          const p = e.side as Side
          const o: Side = p === LEFT ? 1 : 0
          this.trauma = 1
          this.flash = Math.max(this.flash, 0.7)
          for (let i = 0; i < 4; i++) {
            this.burst(w.blobX[o], w.blobY[o] - 20 - i * 8, 90, 520 + i * 90, i % 2 ? '#8e0b0b' : '#d81111', 2.4)
          }
          this.burst(w.blobX[o], w.blobY[o] - 20, 60, 240, '#ffd0d0', 2.0)
          this.burst(w.blobX[o], w.blobY[o] - 20, 70, 360, this.fill(o), 1.6)
          this.burst(w.blobX[o], w.blobY[o] - 4, 40, 280, this.cols[o].dk, 1.1)
          this.rings.push({ x: w.blobX[o], y: w.blobY[o] - 20, r: 10, max: 420, life: 0, color: '#ff2d2d', w: 2 })
          this.scorch.push({ x: w.blobX[o], r: 60, life: 0 })
          this.gib[o] = 1
          break
        }
      }
    }
  }

  emote(side: Side, id: number) {
    const def = emoteAt(id)
    this.pops.push({ side, id, life: 0, max: 1.9, seed: Math.random() * 6.28 })
    if (this.pops.length > 4) this.pops.shift()
    const x = this.cur.px[side]
    const y = this.cur.py[side] - BLOBBY_UPPER_SPHERE
    this.burst(x, y, id === 1 ? 42 : 20, id === 1 ? 190 : 110, def.color, id === 1 ? 1.1 : 0.7)
  }

  celebrate(side: Side) {
    this.faces[side].set('laugh', 6, 9)
    this.faces[side === LEFT ? RIGHT : LEFT].set('sad', 6, 9)
    const x = side === LEFT ? RIGHT_PLANE * 0.25 : RIGHT_PLANE * 0.75
    const cols = ['#ff5e8a', '#ffd257', '#7fd4ff', '#9dff8f', '#ffffff', '#ff8a2b']
    for (let i = 0; i < 3; i++) this.burst(x, 240, 60, 300, cols[Math.floor(Math.random() * cols.length)], 1.2)
    this.trauma = Math.min(1, this.trauma + 0.35)
  }

  bigText(text: string, kind: BigKind, ms: number, color?: string) {
    const fallback = kind === 'parry' ? '#cdf3ff' : kind === 'fatality' ? '#e01919' : '#f4f7fc'
    const big = { text, kind, color: color ?? fallback, life: 0, max: ms / 1000 }
    if (this.intro >= 0) { this.pendingBigs = this.pendingBigs.filter(b => b.kind !== kind); this.pendingBigs.push(big); return true }
    this.bigs = this.bigs.filter(b => b.kind !== kind)
    this.bigs.push(big)
    return true
  }

  clearBigs() { this.bigs.length = 0; this.pendingBigs.length = 0 }

  private step(dt: number) {
    this.targetFlash = Math.max(0, this.targetFlash - dt * 1.6)
    if (this.bigs.length) this.bigs = this.bigs.filter(b => { b.life += dt; return b.life < b.max })
    this.time += dt
    for (const f of this.faces) f.update(dt, this.tension, false)
    if (this.pops.length) this.pops = this.pops.filter(e => { e.life += dt; return e.life < e.max })
    this.trauma = Math.max(0, this.trauma - dt * 2.2)
    this.aber = Math.max(0, this.aber - dt * 4)
    this.cut = Math.max(0, this.cut - dt * 5)
    for (const i of [0, 1]) {
      this.blobFlash[i] = Math.max(0, this.blobFlash[i] - dt * 3.5)
      this.blobKick[i] = Math.max(0, this.blobKick[i] - dt * 3)
    }
    this.squash.k = Math.max(0, this.squash.k - dt * 0.85)
    this.wallHits = this.wallHits.filter(h => { h.life += dt; return h.life < 0.5 })
    this.craters = this.craters.filter(c => { c.life += dt; return c.life < CRATER_LIFE })
    this.scorch = this.scorch.filter(s => { s.life += dt; return s.life < 14 })
    this.skids = this.skids.filter(k => { k.life += dt; return k.life < 5 })
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
    this.rings = this.rings.filter(r => { r.life += dt; return r.life < 0.55 })
    this.trail = this.trail.filter(t => { t.life += dt; return t.life < 0.38 })
  }

  /** física → pixel do mundo (inteiro) */
  private X(x: number) { return Math.round(this.ox + x * this.scale) }
  private Y(y: number) { return Math.round(this.oy + y * this.scale) }
  private S(v: number) { return v * this.scale }

  private hair(p: Side, cx: number, cy: number, ru: number, fac: number, back: boolean) {
    const st = hairStyle(this.looks[p])
    if (!st.tufts.length && !st.puffs.length) return
    const g = this.g
    const hc = this.hairCols[p]
    const isBack = (a: number) => Math.abs(a) >= 88
    const sway = Math.sin(this.time * 5 + p) * 0.35
    for (const t of st.tufts) {
      if (isBack(t.a) !== back) continue
      const beads = tuftBeads(t, 6)
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        const k = i / (beads.length - 1)
        const r = Math.max(0.5, b.hw * ru)
        discP(g, cx + fac * b.x * ru + sway * k, cy - b.y * ru, r + 0.5, hc.dk2)
      }
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        const k = i / (beads.length - 1)
        const r = Math.max(0.5, b.hw * ru)
        discP(g, cx + fac * b.x * ru + sway * k, cy - b.y * ru, Math.max(0, r - 0.5), k < 0.35 ? hc.base : hc.hi)
      }
    }
    for (const pf of st.puffs) {
      if (isBack(pf.a) !== back) continue
      const q = puffCenter(pf)
      ellipseP(g, cx + fac * q.x * ru, cy - q.y * ru, pf.r * ru, pf.r * ru, hc)
    }
  }

  private ballArrow(x: number, by: number) {
    const g = this.g
    const bob = Math.round(Math.sin(this.time * 9) * 1.5)
    const ty = 6 + bob
    const alt = Math.min(99, Math.round(-by / this.scale / 10))
    g.fillStyle = '#1a1620'
    for (let i = 0; i < 6; i++) g.fillRect(x - i - 1, ty + i - 1, i * 2 + 3, 1)
    g.fillRect(x - 3, ty + 5, 7, 5)
    g.fillStyle = '#ffd257'
    for (let i = 0; i < 5; i++) g.fillRect(x - i, ty + i, i * 2 + 1, 1)
    g.fillRect(x - 2, ty + 5, 5, 4)
    g.fillStyle = '#fff2b0'
    for (let i = 0; i < 4; i++) g.fillRect(x - i, ty + i, 1, 1)
    g.fillRect(x - 2, ty + 5, 1, 4)
    if (alt > 0) pxText(g, String(alt), x + 12, ty + 3, '#ffd257', 1, '#1a1620')
  }

  private shadow(x: number, y: number, r: number) {
    const g = this.g
    const k = clamp(1 - (GROUND - y) / 420, 0.3, 1)
    const rx = Math.round(this.S(r) * k), ry = Math.max(1, Math.round(this.S(r) * 0.3 * k))
    const gy = this.Y(GROUND) + 1
    g.fillStyle = this.px.pal.shadow
    g.globalAlpha = 0.45
    for (let yy = -ry; yy <= ry; yy++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / (ry + 0.5)) ** 2)))
      g.fillRect(this.X(x) - w, gy + yy, w * 2, 1)
    }
    g.globalAlpha = 1
  }

  private blob(p: Side, wx: number, wy: number, state: number, ball: { x: number; y: number },
               stunned: boolean, cr: number, dive: number, dvDir: number) {
    if (this.off(p)) return
    const g = this.g
    const c = this.cols[p]
    const kick = this.blobKick[p]
    const squash = (1 + Math.sin(state * 1.6) * 0.045 + Math.sin(kick * 9) * kick * 0.12) * (1 - cr * 0.12)
    const ru = this.S(BLOBBY_UPPER_RADIUS - cr * CROUCH_SLIM) * squash
    const rl = this.S(BLOBBY_LOWER_RADIUS + cr * CROUCH_SPREAD) / squash
    const x = this.ox + wx * this.scale
    const y = this.oy + wy * this.scale
    const uy = y - this.S(BLOBBY_UPPER_SPHERE - cr * CROUCH_DUCK) * squash
    const ly = y + this.S(BLOBBY_LOWER_SPHERE)
    const d = dvDir, dk = dive
    const bkx = x - d * this.S(20) * dk
    const bky = ly + this.S(13) * dk
    const brx = rl * (1 + 0.42 * dk)
    const bry = rl * (1 - 0.3 * dk)
    const hx = x + d * this.S(30) * dk
    const hy = uy + this.S(22) * dk
    const fac = p === LEFT ? 1 : -1

    g.save()
    if (stunned) {
      g.translate(Math.round(x), Math.round(y))
      g.rotate(Math.sin(this.time * 9.5) * 0.14)
      g.translate(-Math.round(x), -Math.round(y))
    }
    if (dk > 0.01) {
      for (let i = 2; i >= 1; i--) {
        const back = d * i * this.S(26) * dk
        g.globalAlpha = 0.22 / i
        discP(g, bkx - back, bky, brx * (1 - i * 0.09), c.base)
        discP(g, hx - back, hy, ru * (1 - i * 0.12), c.base)
      }
      g.globalAlpha = 1
    }
    ellipseP(g, bkx, bky, brx, bry, c)
    // tronco: corpo e cabeça são uma massa só
    const nw = Math.round(ru * 1.3)
    const ny0 = Math.round(hy), ny1 = Math.round(bky - bry * 0.4)
    if (ny1 > ny0) {
      g.fillStyle = c.base
      g.fillRect(Math.round((x + hx) / 2 - nw / 2), ny0, nw, ny1 - ny0)
      g.fillStyle = c.dk2
      g.fillRect(Math.round((x + hx) / 2 - nw / 2) - 1, ny0, 1, ny1 - ny0)
      g.fillRect(Math.round((x + hx) / 2 + nw / 2), ny0, 1, ny1 - ny0)
    }
    if (dk > 0.01) {
      const len = ru * (0.5 + 1.5 * dk)
      const ax = hx + d * ru * 0.55, ay = hy + ru * 0.5
      ellipseP(g, ax + d * len * 0.5, ay + len * 0.2, len * 0.62, Math.max(1.5, ru * 0.34), c)
      discP(g, ax + d * len, ay + len * 0.35, ru * 0.3, c.dk)
    }
    this.hair(p, hx, hy, ru, fac, true)
    ellipseP(g, hx, hy, ru, ru, c)
    g.fillStyle = c.hi
    g.fillRect(Math.round(hx - ru * 0.45), Math.round(hy - ru * 0.55), 2, 1)
    g.fillRect(Math.round(hx - ru * 0.55), Math.round(hy - ru * 0.35), 1, 2)
    this.face(p, hx, hy, ru, fac, ball, stunned)
    this.hair(p, hx, hy, ru, fac, false)
    if (this.blobFlash[p] > 0.05) {
      g.globalAlpha = this.blobFlash[p] * 0.7
      const fl = { base: '#fff2c8', hi: '#fff2c8', dk: '#fff2c8', dk2: '#fff2c8' }
      ellipseP(g, bkx, bky, brx, bry, fl)
      ellipseP(g, hx, hy, ru, ru, fl)
      g.globalAlpha = 1
    }
    g.restore()
  }

  private face(p: Side, hx: number, hy: number, ru: number, fac: number, ball: { x: number; y: number }, stunned: boolean) {
    const g = this.g
    const rig = this.faces[p]
    const f = rig.cur
    const ink = '#1a1620'
    const lid = clamp(f.lid * (0.08 + rig.blink * 0.92), 0, 1.6)
    const jit = rig.jitter > 0.05 ? Math.round(Math.sin(this.time * 40) * rig.jitter) : 0
    let ax = ball.x - hx, ay = ball.y - hy
    const alen = Math.max(1, Math.hypot(ax, ay))
    ax = (ax / alen) * Math.min(1, alen / 80)
    ay = (ay / alen) * Math.min(1, alen / 80)
    if (this.intro >= 0) { ax = fac * 0.3; ay = 0.2 }
    const eh = Math.round(clamp(ru * 0.5 * lid, 0, ru * 0.75))
    const ew = ru > 6 ? 3 : 2
    for (const s of [-1, 1]) {
      const ex = Math.round(hx + ru * (fac * 0.09 + s * 0.38)) + jit
      const ey = Math.round(hy - ru * 0.24)
      if (stunned) {
        g.fillStyle = ink
        for (let k = -1; k <= 1; k++) { g.fillRect(ex + k, ey + k, 1, 1); g.fillRect(ex + k, ey - k, 1, 1) }
        continue
      }
      const browY = ey - Math.round(eh / 2) - 2 - Math.round(f.brow * 1.2)
      g.fillStyle = ink
      if (eh <= 1) {
        g.fillRect(ex - 1, ey, ew, 1)
        if (f.curve > 0.5) { g.fillRect(ex - 2, ey + 1, 1, 1); g.fillRect(ex + ew - 1, ey + 1, 1, 1) }
      } else {
        const top = ey - Math.round(eh / 2)
        g.fillStyle = '#f6f8ff'
        g.fillRect(ex - 1, top, ew, eh)
        g.fillStyle = ink
        g.fillRect(ex - 1, top - 1, ew, 1)
        g.fillRect(ex - 1, top + eh, ew, 1)
        g.fillRect(ex - 2, top, 1, eh)
        g.fillRect(ex - 1 + ew, top, 1, eh)
        const pxx = ex + Math.round(ax * 0.9) + (ew === 3 ? 0 : 0)
        const pyy = clamp(ey + Math.round(ay * (eh / 3)), top, top + eh - 1)
        g.fillStyle = '#08080d'
        g.fillRect(pxx, pyy, 1, Math.min(2, top + eh - pyy))
        if (eh >= 3) { g.fillStyle = '#fff'; g.fillRect(pxx, pyy, 1, 1); g.fillStyle = '#08080d'; g.fillRect(pxx, pyy + 1, 1, 1) }
        // pálpebra caída: fecha por cima
        if (lid < 0.8) { g.fillStyle = this.cols[p].base; g.fillRect(ex - 1, top, ew, Math.round((0.8 - lid) * eh)) }
      }
      // sobrancelha: inclinação pelo brow, interno pra baixo = bravo
      if (Math.abs(f.brow) > 0.12 || f.lid > 1.2) {
        g.fillStyle = ink
        const innerUp = f.brow > 0 ? 1 : -1
        const inner = (s * fac) < 0 ? 1 : 0
        g.fillRect(ex - 1, browY + (inner ? -innerUp : innerUp) * 0, ew, 1)
        g.fillRect(ex - 1 + (s < 0 ? ew - 1 : 0), browY + (f.brow > 0 ? -1 : 1) * (s < 0 ? 1 : 1) * (inner ? 1 : 0), 1, 1)
      }
      if (f.tear > 0.04) {
        const ph = (this.time * 0.55 + (s + 1) * 0.21) % 1
        g.fillStyle = '#8fd6ff'
        g.fillRect(ex + s * 2, ey + Math.round(eh / 2) + 1 + Math.round(ph * ru * 0.6), 1, 2)
      }
    }
    // boca
    const mcx = Math.round(hx + ru * fac * 0.09) + jit
    const mcy = Math.round(hy + ru * 0.34)
    const wid = Math.max(3, Math.round((0.28 + f.open * 0.06) * ru * 2))
    const open = Math.round(f.open * ru * 0.5)
    const half = Math.floor(wid / 2)
    g.fillStyle = ink
    if (open >= 2) {
      g.fillRect(mcx - half + 1, mcy - Math.floor(open / 2), wid - 2, open)
      g.fillStyle = '#3a0710'
      g.fillRect(mcx - half + 2, mcy - Math.floor(open / 2) + 1, Math.max(1, wid - 4), Math.max(1, open - 2))
      if (open >= 4) { g.fillStyle = '#c74350'; g.fillRect(mcx - half + 2, mcy + Math.floor(open / 2) - 2, Math.max(1, wid - 4), 1) }
      g.fillStyle = ink
      g.fillRect(mcx - half, mcy - Math.floor(open / 2) + 1, 1, Math.max(1, open - 2))
      g.fillRect(mcx - half + wid - 1, mcy - Math.floor(open / 2) + 1, 1, Math.max(1, open - 2))
    } else {
      g.fillRect(mcx - half + 1, mcy, wid - 2, 1)
      if (f.curve > 0.25) { g.fillRect(mcx - half, mcy - 1, 1, 1); g.fillRect(mcx - half + wid - 1, mcy - 1, 1, 1) }
      else if (f.curve < -0.25) { g.fillRect(mcx - half, mcy + 1, 1, 1); g.fillRect(mcx - half + wid - 1, mcy + 1, 1, 1) }
      else { g.fillRect(mcx - half, mcy, 1, 1); g.fillRect(mcx - half + wid - 1, mcy, 1, 1) }
      if (f.curve > 0.6 && open >= 1) { g.fillStyle = '#f6f8ff'; g.fillRect(mcx - half + 2, mcy + 1, Math.max(1, wid - 4), 1) }
    }
  }

  private ball(x: number, y: number, rot: number) {
    const g = this.g
    const r = Math.max(2, Math.round(this.S(BALL_RADIUS)))
    const cx = Math.round(x), cy = Math.round(y)
    const sq = this.squash.k
    const sxk = 1 + sq * Math.abs(Math.cos(this.squash.ang)) * 0.5, syk = 1 + sq * Math.abs(Math.sin(this.squash.ang)) * 0.5
    const rx = Math.round(r * sxk), ry = Math.round(r * syk)
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      const nx = xx / rx, ny = yy / ry
      const d = nx * nx + ny * ny
      if (d > 1) continue
      const a = ((Math.atan2(ny, nx) - rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
      const gomo = (a % (Math.PI * 2 / 3)) < 0.66
      let col = gomo ? '#e33a3a' : '#f4f6fa'
      const edge = d > (1 - 1.6 / r) ** 2
      if (edge) col = gomo ? '#8a1f2a' : '#b8c0cc'
      else if (nx < -0.25 && ny < -0.3 && d < 0.5) col = gomo ? '#ff8a7a' : '#ffffff'
      else if (nx > 0.35 && ny > 0) col = gomo ? '#a52a2f' : '#c8d0dc'
      g.fillStyle = col
      g.fillRect(cx + xx, cy + yy, 1, 1)
    }
  }

  private energyBall(x: number, y: number, owner: number) {
    const g = this.g
    const r = Math.max(2, Math.round(this.S(BALL_RADIUS)))
    const col = owner === 0 || owner === 1 ? this.light(owner as Side) : '#ffd257'
    const rr = r + 4 + Math.sin(this.time * 22)
    const cx = Math.round(x), cy = Math.round(y)
    for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) {
      const d = xx * xx + yy * yy
      if (d > rr * rr || d < (r - 1) * (r - 1)) continue
      const a = Math.atan2(yy, xx) + this.time * 9
      const v = Math.sin(a * 5) + Math.sin(this.time * 30 + d * 0.3)
      if (v > 0.9) { g.fillStyle = '#fff'; g.fillRect(cx + xx, cy + yy, 1, 1) }
      else if (v > 0 && ((xx + yy) & 1)) { g.fillStyle = col; g.fillRect(cx + xx, cy + yy, 1, 1) }
    }
    g.globalAlpha = this.energy
    for (let k = 0; k < 2; k++) {
      const a = this.time * (4 + k * 1.7) + k
      const ry = Math.abs(Math.cos(a)) * (r + 7 + k * 3) + 1
      g.save(); g.translate(cx, cy); g.rotate(Math.sin(this.time * 2 + k * 2) * 0.6)
      outlineP(g, 0, 0, r + 7 + k * 3, ry, k ? '#ffd257' : col)
      g.restore()
    }
    g.globalAlpha = 1
  }

  private holdAura(p: Side, x: number, y: number, left: number) {
    const g = this.g
    const urge = 1 - left
    const cx = this.X(x), cy = this.Y(y) - Math.round(this.S(14))
    const r = this.S(52) + Math.sin(this.time * 20) * 2 + urge * 4
    outlineP(g, cx, cy, r, r * 0.9, this.light(p))
    for (let k = 0; k < 8; k++) {
      const ph = (this.time * 1.6 + k * 0.37) % 1
      g.fillStyle = ph < 0.5 ? '#ffffff' : this.light(p)
      g.fillRect(Math.round(cx + Math.sin(k * 2.3 + this.time * 3) * r * 0.7), Math.round(cy + r * 0.8 - ph * r * 2.2), 1, 1)
    }
  }

  private stars(x: number, y: number) {
    const g = this.g
    const cx = this.X(x), cy = this.Y(y) - Math.round(this.S(BLOBBY_UPPER_SPHERE + BLOBBY_UPPER_RADIUS + 14))
    for (let k = 0; k < 3; k++) {
      const a = this.time * 5 + k * 2.1
      const sx = Math.round(cx + Math.cos(a) * this.S(30)), sy = Math.round(cy + Math.sin(a) * 3)
      g.fillStyle = '#ffe07a'
      g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1)
    }
  }

  private reach(x: number, y: number, special: boolean) {
    if (!special) return
    const g = this.g
    const cx = this.X(x), cy = this.Y(y) - Math.round(this.S(BLOBBY_UPPER_SPHERE))
    const r = this.S(SPECIAL_REACH)
    g.globalAlpha = 0.35 + Math.sin(this.time * 6) * 0.15
    const n = Math.ceil(r * 2)
    g.fillStyle = '#ffd257'
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(this.time * 8)) % 3) continue
      const a = (i / n) * Math.PI * 2
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1)
    }
    g.globalAlpha = 1
  }

  private digSwipe(p: Side, x: number, y: number, k: number) {
    const g = this.g
    const dir = p === LEFT ? 1 : -1
    const cx = this.X(x) + dir * Math.round(this.S(26)), cy = this.Y(y) + Math.round(this.S(BLOBBY_LOWER_SPHERE))
    g.globalAlpha = k
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.35
      const r = this.S(34) * (1 - k * 0.3)
      g.fillStyle = i % 2 ? '#ffffff' : '#cfe9ff'
      g.fillRect(Math.round(cx + dir * Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 1)
    }
    g.globalAlpha = 1
  }

  private diveStreak(x: number, y: number, dir: number) {
    const g = this.g
    const cx = this.X(x), cy = this.Y(y)
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = 0.6 - i * 0.12
      g.fillRect(cx - dir * (6 + i * 5), cy - 6 + i * 4, 4 + i, 1)
    }
    g.globalAlpha = 1
  }

  private walls() {
    if (!this.wallsOn) return
    const g = this.g
    const gy = this.Y(GROUND + 44)
    const top = this.Y(GROUND - 520)
    for (const wx of [LEFT_PLANE, RIGHT_PLANE]) {
      const x = this.X(wx) + (wx === LEFT_PLANE ? -1 : 0)
      g.fillStyle = this.scene.night ? 'rgba(210,230,255,0.28)' : 'rgba(255,255,255,0.35)'
      for (let y = top; y < gy; y += 2) g.fillRect(x, y, 1, 1)
    }
    for (const h of this.wallHits) {
      const k = 1 - h.life / 0.5
      const x = this.X(h.x), y = this.Y(h.y)
      g.globalAlpha = k
      g.fillStyle = '#ffffff'
      const len = Math.round(this.S(40) * (0.5 + k))
      g.fillRect(x, y - len, 2, len * 2)
      g.globalAlpha = 1
    }
  }

  private ground() {
    const g = this.g
    const gy = this.Y(GROUND)
    for (const cr of this.craters) {
      const fade = Math.min(1, (CRATER_LIFE - cr.life) / 2.2)
      g.globalAlpha = 0.5 * fade
      outlineP(g, this.X(cr.x), gy + 3, this.S(cr.r), this.S(cr.r) * 0.34, this.px.pal.sandDk)
      g.globalAlpha = 1
    }
    for (const sc of this.scorch) {
      const fade = Math.max(0, 1 - sc.life / 14)
      const glow = Math.max(0, 1 - sc.life / 1.6)
      g.globalAlpha = 0.85 * fade
      const r = this.S(sc.r)
      const x = this.X(sc.x)
      g.fillStyle = '#3a2418'; g.fillRect(Math.round(x - r * 1.4), gy + 2, Math.round(r * 2.8), 3)
      g.fillStyle = '#150d09'; g.fillRect(Math.round(x - r), gy + 1, Math.round(r * 2), 3)
      if (glow > 0) {
        g.fillStyle = glow > 0.5 ? '#ffb347' : '#ff7a1a'
        for (let i = -r; i < r; i += 2) if (((i + Math.floor(this.time * 20)) & 3) === 0) g.fillRect(Math.round(x + i), gy + 1, 1, 1)
      }
      g.globalAlpha = 1
    }
    for (const k of this.skids) {
      const fade = Math.max(0, 1 - k.life / 5)
      g.globalAlpha = 0.5 * fade
      g.fillStyle = this.px.pal.sandDk
      const x = this.X(k.x)
      for (let i = 0; i < 5; i++) g.fillRect(x - k.dir * i * 4, gy + 2 + (i % 2), 3, 1)
      g.globalAlpha = 1
    }
    const t = this.target
    if (t) {
      const rgb = t.state === 0 ? '#ffd257' : t.state > 0 ? '#5cf08a' : '#ff5a4a'
      const x0 = this.X(t.x0), x1 = this.X(t.x1)
      const y0 = gy - 1, y1 = this.Y(GROUND + 44)
      g.globalAlpha = 0.3 + this.targetFlash * 0.4
      g.fillStyle = rgb
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (((x + y + Math.floor(this.time * 10)) & 3) === 0) g.fillRect(x, y, 1, 1)
      g.globalAlpha = Math.min(1, 0.6 + Math.sin(this.time * 3.6) * 0.3 + this.targetFlash)
      g.fillRect(x0, y0, x1 - x0, 1); g.fillRect(x0, y1 - 1, x1 - x0, 1)
      g.fillRect(x0, y0, 1, y1 - y0); g.fillRect(x1 - 1, y0, 1, y1 - y0)
      g.globalAlpha = 1
    }
    g.fillStyle = this.scene.night ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.65)'
    g.fillRect(this.X(20), this.Y(GROUND + 44), this.X(RIGHT_PLANE - 20) - this.X(20), 1)
  }

  private net() {
    const g = this.g
    const nx = this.X(NET_POSITION_X)
    const top = this.Y(NET_SPHERE_POSITION), bot = this.Y(GROUND + 30)
    const w = Math.max(2, Math.round(this.S(NET_RADIUS * 2)))
    const x0 = nx - Math.floor(w / 2)
    g.fillStyle = this.px.pal.pole
    g.fillRect(x0, top, w, bot - top + 2)
    g.fillStyle = this.px.pal.netDk
    for (let y = top + 2; y < bot; y += 3) g.fillRect(x0, y, w, 1)
    g.fillStyle = '#f2f2f2'
    g.fillRect(x0 - 1, top - 2, w + 2, 3)
    g.fillStyle = '#ffffff'
    g.fillRect(nx, top - 3, 1, 1)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(nx + 2, this.Y(GROUND) + 1, 8, 1)
  }

  private fx() {
    const g = this.g
    for (const d of this.dust) {
      const k = 1 - d.life / d.max
      if (k < 0.3 && ((Math.round(d.x) + Math.round(d.y) + Math.floor(this.time * 20)) & 1)) continue
      g.fillStyle = d.color
      const x = this.X(d.x), y = this.Y(d.y)
      const sz = d.size ?? 1
      g.fillRect(x, y, sz, sz)
      if (k > 0.6) g.fillRect(x - Math.sign(d.vx) * sz, y, sz, sz)
    }
    for (const r of this.rings) {
      if (r.life < 0) continue
      const k = clamp(r.life / 0.55, 0, 1)
      const rad = this.S(r.r + (r.max - r.r) * (1 - (1 - k) ** 2.4))
      g.globalAlpha = (1 - k) * 0.95
      const ry = r.flat ? rad * 0.3 : rad
      outlineP(g, this.X(r.x), this.Y(r.y), rad, ry, r.color)
      if (r.w) outlineP(g, this.X(r.x), this.Y(r.y), rad - 1, Math.max(0.5, ry - 1), r.color)
    }
    g.globalAlpha = 1
  }

  private trailFx() {
    const g = this.g
    for (const tr of this.trail) {
      const k = 1 - tr.life / 0.38
      if (k <= 0) continue
      g.globalAlpha = k * 0.7
      const rr = Math.max(1, Math.round(this.S(BALL_RADIUS) * k * 0.9))
      discP(g, this.X(tr.x), this.Y(tr.y) - (1 - k) * 8, rr, k > 0.5 ? '#ffd257' : '#ff7a1a')
    }
    g.globalAlpha = 1
  }

  private pop(px: number[], py: number[]) {
    const g = this.g
    for (const e of this.pops) {
      const t = e.life / e.max
      const pop = t < 0.16 ? t / 0.16 : 1
      const sc = pop < 1 ? 1 : 2
      const x = this.X(px[e.side] + Math.sin(this.time * 3 + e.seed) * 6)
      const y = this.Y(py[e.side] - BLOBBY_UPPER_SPHERE - 62 - t * 34)
      g.globalAlpha = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      this.emoteGlyph(e.id, x, y, sc)
    }
    g.globalAlpha = 1
  }

  /** emotes em pixel: carinha 7x7 em duas escalas */
  private emoteGlyph(id: number, cx: number, cy: number, sc: number) {
    const g = this.g
    const def = emoteAt(id)
    const r = 4 * sc
    discP(g, cx, cy, r, '#1a1620')
    discP(g, cx, cy, r - 1, id === 3 ? '#ffd9a6' : '#ffd257')
    g.fillStyle = '#1a1620'
    const p = (x: number, y: number, w = 1, h = 1) => g.fillRect(cx + x * sc, cy + y * sc, w * sc, h * sc)
    switch (def.key) {
      case 'laugh': p(-2, -2, 1, 1); p(2, -2, 1, 1); p(-3, -1); p(-2, -3); p(3, -1); p(2, -3); p(-2, 1, 5, 2); g.fillStyle = '#fff'; p(-1, 1, 3, 1); g.fillStyle = '#8fd6ff'; p(-4, 0); p(4, 0); break
      case 'cry': p(-2, -1, 1, 2); p(2, -1, 1, 2); p(-1, 2, 3, 1); p(-2, 3); p(2, 3); g.fillStyle = '#8fd6ff'; p(-3, 1, 1, 3); p(3, 1, 1, 3); break
      case 'rage': g.fillStyle = '#ff6b3d'; discP(g, cx, cy, r - 1, '#ff6b3d'); g.fillStyle = '#1a1620'; p(-3, -3, 2, 1); p(2, -3, 2, 1); p(-2, -1); p(2, -1); p(-2, 2, 5, 1); g.fillStyle = '#fff'; p(-1, 2); p(1, 2); break
      case 'finger': g.fillStyle = '#1a1620'; p(-1, -4, 3, 6); g.fillStyle = '#ffd9a6'; p(0, -3, 1, 5); p(-2, 0, 5, 3); break
      case 'taunt': p(-2, -2, 1, 1); p(1, -2, 2, 1); p(-2, 1, 4, 1); g.fillStyle = '#ff5e8a'; p(0, 2, 2, 2); break
    }
  }

  private bigsDraw() {
    const g = this.g
    for (const b of this.bigs) {
      const t = Math.min(1, b.life / b.max)
      const big = b.kind !== 'banner'
      const inK = Math.min(1, b.life / (big ? 0.42 : 0.3))
      const sc = b.kind === 'fatality' ? (inK < 1 ? 5 - Math.round(inK * 2) : 3) : b.kind === 'parry' ? 3 : 2
      const alpha = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1
      const shake = b.kind === 'fatality' && b.life > 0.42 && b.life < 1.14 ? Math.round(Math.sin(b.life * 62) * 2) : 0
      const y = Math.round(b.kind === 'banner' ? this.H * 0.28 : this.H * 0.44)
      const w = textWidth(b.text, sc)
      const x = Math.round(this.W / 2 + shake)
      g.globalAlpha = Math.max(0, alpha)
      if (big) {
        g.fillStyle = 'rgba(10,8,14,0.65)'
        g.fillRect(0, y - 4 * sc, this.W, FONT_H * sc + 8 * sc)
        g.fillStyle = b.color
        g.fillRect(0, y - 4 * sc, this.W, 1); g.fillRect(0, y + FONT_H * sc + 8 * sc - 1, this.W, 1)
      } else if (inK < 1) {
        g.fillStyle = 'rgba(10,8,14,0.5)'
        g.fillRect(x - Math.round(w / 2) - 3, y - 3, w + 6, FONT_H * sc + 6)
      }
      pxText(g, b.text, x, y, b.color, sc, b.kind === 'fatality' ? '#3a0000' : '#1a1620')
    }
    g.globalAlpha = 1
  }

  private introCam(t: number, lx: number, rx: number) {
    const hy = this.Y(GROUND - BLOBBY_UPPER_SPHERE - 4)
    const W = this.W, H = this.H
    const cy = Math.round(H * 0.5)
    if (t < 1.9) {
      const k = ease(t / 1.9)
      return { z: lerp(1.9, 1.35, k), fx: lerp(W * 0.2, W * 0.55, k), fy: lerp(H * 0.35, cy, k) }
    }
    if (t < 3.3) return { z: 4.2 - (t - 1.9) * 0.12, fx: lx + 3, fy: hy + 6 }
    if (t < 4.7) return { z: 4.2 - (t - 3.3) * 0.12, fx: rx - 3, fy: hy + 6 }
    const k = ease(clamp((t - 4.7) / (INTRO_LEN - 4.7), 0, 1))
    return { z: lerp(4.03, 1, k), fx: lerp(rx - 3, W / 2, k), fy: lerp(hy + 6, H / 2, k) }
  }

  private introOverlay(t: number) {
    const g = this.g
    const W = this.W, H = this.H
    const bar = t < 4.7 ? 14 : Math.round(14 * (1 - ease(clamp((t - 4.7) / 0.9, 0, 1))))
    g.fillStyle = '#0a0810'
    g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar)
    if (t < 1.9) {
      const k = clamp((t - 0.4) / 0.5, 0, 1)
      if (k > 0) pxText(g, this.scene.name, W / 2, H - bar - 22 + Math.round((1 - k) * 6), '#ffd257', 2)
    }
    const cards: [Side, number][] = [[LEFT, 1.9], [RIGHT, 3.3]]
    for (const [i, t0] of cards) {
      if (t < t0 || t >= t0 + 1.4) continue
      const k = ease(clamp((t - t0) / 0.3, 0, 1))
      const xo = Math.round((1 - k) * (i === LEFT ? -80 : 80))
      const x = (i === LEFT ? Math.round(W * 0.22) : Math.round(W * 0.78)) + xo
      const c = this.cols[i]
      const name = this.names[i] || (i === LEFT ? 'P1' : 'P2')
      const w = Math.max(68, textWidth(name, 2) + 16)
      g.fillStyle = c.dk2; g.fillRect(x - w / 2, H - bar - 30, w, 20)
      g.fillStyle = c.hi; g.fillRect(x - w / 2, H - bar - 30, w, 1); g.fillRect(x - w / 2, H - bar - 11, w, 1)
      pxText(g, name, x, H - bar - 27, '#ffffff', 2, c.dk)
      pxText(g, i === LEFT ? 'ESQUERDA' : 'DIREITA', x, H - bar - 15, c.hi, 1, null)
    }
    if (t >= 3.3 && t < 4.7) pxText(g, 'VS', W / 2, 22, '#ffd257', 3)
  }

  render(match: Match, alpha: number, dt: number) {
    crouchMoods(this.faces, match.world.crouch)
    reachMoods(this.faces, match.world, match.logic.isBallValid)
    if (this.hitstop > 0) { this.hitstop -= dt; alpha = 0 }
    if (this.intro >= 0) {
      const was = this.intro
      this.intro += dt
      if ((was < 1.9 && this.intro >= 1.9) || (was < 3.3 && this.intro >= 3.3)) this.cut = 1
      if (was < 2.3 && this.intro >= 2.3) this.blobKick[LEFT] = 0.5
      if (was < 3.7 && this.intro >= 3.7) this.blobKick[RIGHT] = 0.4
      if (this.intro >= INTRO_LEN) this.endIntro()
    }
    this.step(dt)
    const g = this.g
    const w = match.world
    const eOn = w.superFrames > 0
    this.energy = clamp(this.energy + (eOn ? dt * 9 : -dt * 5), 0, 1)
    this.tension += (rallyTension(match.logic.rally) - this.tension) * Math.min(1, dt * 2.2)
    const p = this.prev, q = this.cur
    const L = (a: number, b: number) => a + (b - a) * alpha
    const bx = L(p.bx, q.bx), by = L(p.by, q.by), rot = L(p.rot, q.rot)
    const half = RIGHT_PLANE / 2
    const far = this.wallsOn ? 0 : Math.max(
      Math.abs(w.ballX - NET_POSITION_X), Math.abs(w.blobX[LEFT] - NET_POSITION_X),
      Math.abs(w.blobX[RIGHT] - NET_POSITION_X)) - half
    const want = Math.max(0, Math.min(OPEN_MARGIN, far + 24))
    this.frameExtra += (want - this.frameExtra) * (1 - Math.exp(-dt * (want > this.frameExtra ? 5.5 : 1.4)))
    this.applyFrame()
    const panWant = clamp(((bx - NET_POSITION_X) / half) * 0.06, -0.06, 0.06)
    this.pan += (panWant - this.pan) * (1 - Math.exp(-dt * 3.2))
    if (eOn) {
      this.trail.push({ x: bx, y: by, life: 0 })
      while (this.trail.length > 14) this.trail.shift()
    }

    const tr = this.trauma * this.trauma
    const sx = Math.round((Math.random() - 0.5) * 6 * tr), sy = Math.round((Math.random() - 0.5) * 6 * tr)
    g.setTransform(1, 0, 0, 1, 0, 0)
    this.px.background(g, this.time, this.pan * this.W, this.Y(GROUND), dt)
    g.setTransform(1, 0, 0, 1, sx, sy)

    this.ground()
    this.walls()

    if (this.intro < 0) this.shadow(bx, by, BALL_RADIUS)
    for (const s of [0, 1] as Side[]) {
      if (this.off(s)) continue
      this.shadow(L(p.px[s], q.px[s]), L(p.py[s], q.py[s]), BLOBBY_LOWER_RADIUS)
    }
    for (const s of [0, 1] as Side[]) {
      const px = L(p.px[s], q.px[s]), py = L(p.py[s], q.py[s])
      if (!this.off(s) && w.stun[s] === 0 && this.intro < 0) this.reach(px, py, w.charge[s] >= SPECIAL_FULL)
      if (w.digActive[s] > 0) this.digSwipe(s, px, py, w.digActive[s] / DIG_WINDOW)
      const air = w.diveFrames[s] > 0
      const target = air ? 1 : Math.min(1, w.diveRecover[s] / (DIVE_RECOVER * 0.7))
      const rate = target > this.diveK[s] ? 15 : 6.5
      this.diveK[s] += (target - this.diveK[s]) * (1 - Math.exp(-dt * rate))
      if (this.diveK[s] < 0.002) this.diveK[s] = 0
      if (air) this.diveStreak(px, py - BLOBBY_UPPER_SPHERE * 0.5, w.diveDir[s])
      if (w.hold[s] > 0 && eOn) this.holdAura(s, px, py, w.hold[s] / SPECIAL_HOLD)
      this.blob(s, px, py, L(p.st[s], q.st[s]), { x: this.X(bx), y: this.Y(by) }, w.stun[s] > 0, w.crouch[s],
        this.diveK[s], w.diveDir[s])
    }
    for (const s of [0, 1] as Side[]) if (w.stun[s] > 0) this.stars(L(p.px[s], q.px[s]), L(p.py[s], q.py[s]))

    if (this.intro < 0) {
      this.trailFx()
      if (this.energy > 0.01) this.energyBall(this.X(bx), this.Y(by), w.superOwner as number)
      this.ball(this.X(bx), this.Y(by), rot)
      if (this.Y(by) < -BALL_RADIUS * this.scale * 0.5) this.ballArrow(this.X(bx), this.Y(by))
      if (eOn && Math.sin(this.time * 30) > 0) {
        g.globalAlpha = 0.5
        discP(g, this.X(bx), this.Y(by), this.S(BALL_RADIUS), '#ffffff')
        g.globalAlpha = 1
      }
    }
    this.net()
    this.fx()
    this.pop([L(p.px[0], q.px[0]), L(p.px[1], q.px[1])], [L(p.py[0], q.py[0]), L(p.py[1], q.py[1])])
    this.px.foreground(g, this.time, this.Y(GROUND), dt)
    g.setTransform(1, 0, 0, 1, 0, 0)

    if (this.intro >= 0) {
      const cam = this.introCam(this.intro, this.X(L(p.px[0], q.px[0])), this.X(L(p.px[1], q.px[1])))
      const cw = this.W / cam.z, ch = this.H / cam.z
      const cx = clamp(cam.fx - cw / 2, 0, this.W - cw), cy = clamp(cam.fy - ch / 2, 0, this.H - ch)
      this.screen.imageSmoothingEnabled = false
      this.screen.drawImage(this.world, cx, cy, cw, ch, 0, 0, this.cw, this.ch)
      g.fillStyle = '#000'
      g.drawImage(this.canvas, 0, 0, this.cw, this.ch, 0, 0, this.W, this.H)
      this.introOverlay(this.intro)
    }
    if (this.aber > 0.01) {
      const a = Math.min(1, this.aber) * 0.35
      g.globalAlpha = a
      g.fillStyle = '#ff3c28'
      for (let y = 0; y < this.H; y += 2) g.fillRect(0, y, 2, 1), g.fillRect(this.W - 2, y + 1, 2, 1)
      g.globalAlpha = a * 0.6
      g.fillStyle = '#2878ff'
      g.fillRect(0, 0, this.W, 1); g.fillRect(0, this.H - 1, this.W, 1)
      g.globalAlpha = 1
    }
    const fl = Math.max(this.flash, this.cut)
    if (fl > 0.01) { g.globalAlpha = Math.min(1, fl); g.fillStyle = '#ffffff'; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1 }
    this.bigsDraw()

    this.screen.imageSmoothingEnabled = false
    this.screen.drawImage(this.world, 0, 0, this.W, this.H, 0, 0, this.cw, this.ch)
  }

  dispose() {
    removeEventListener('keydown', this.onKey)
    removeEventListener('pointerdown', this.onPointer)
    this.dust.length = 0
    this.scorch.length = 0
    this.craters.length = 0
    this.rings.length = 0
    this.wallHits.length = 0
    this.trail.length = 0
    this.pops.length = 0
    this.bigs.length = 0
  }
}
