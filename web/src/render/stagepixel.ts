import {
  BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS,
  BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE, BALL_GRAVITATION,
  CROUCH_DUCK, CROUCH_SLIM, CROUCH_SPREAD, DIG_WINDOW,
  DIVE_RECOVER, OPEN_MARGIN, SPECIAL_FULL, SPECIAL_HOLD, SPECIAL_REACH, HIT_CHARGE_MAX, REVERSAL_ORBIT,
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
const VH = 360
export const INTRO_LEN = 5.6

interface Snap { bx: number; by: number; rot: number; px: number[]; py: number[]; st: number[] }
interface Dust { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size?: number }
interface Ring { x: number; y: number; r: number; max: number; life: number; color: string; w?: number; flat?: boolean }
interface Pop { side: Side; id: number; life: number; max: number; seed: number }
interface Big { text: string; kind: BigKind; color: string; life: number; max: number }
interface Callout { side: Side; text: string; color: string; life: number }
interface Cols { base: string; hi: string; dk: string; dk2: string }
interface Goo { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; st: number; r: number; seed: number; dir: number }
const GOO_MAX = 320

const snap = (): Snap => ({ bx: 200, by: 300, rot: 0, px: [200, 600], py: [GROUND, GROUND], st: [0, 0] })
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (k: number) => k * k * (3 - 2 * k)

export function ellipseP(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number,
                         cols: Cols, lx = -0.5, ly = -0.6, rim: string | null = null) {
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
    if (!inner) col = rim && lit > 0.12 ? rim : cols.dk2
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

const PARRY_COLS: Cols = { base: '#a9d8ff', hi: '#f2fbff', dk: '#6fa6f0', dk2: '#3f6fc4' }
const DOUBLE_COLS: Cols = { base: '#ffb347', hi: '#fff3c4', dk: '#e8721c', dk2: '#8a3a08' }

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
  private callouts: Callout[] = []
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
  /** Cabelo com inércia: atrasa contra o movimento do blob e balança ao pousar. */
  private hairX = [0, 0]
  private hairY = [0, 0]
  private hairVX = [0, 0]
  private hairVY = [0, 0]
  private wasAir = [false, false]
  private lastWorld: Match['world'] | null = null
  /** parry à la SF3: o blob inteiro vira azul-gelo por um instante */
  private parryTint = [0, 0]
  private doubleTint = [0, 0]
  private sparks: { x: number; y: number; life: number; seed: number }[] = []
  private aber = 0
  private flash = 0
  private squash = { k: 0, ang: 0 }
  private wallHits: { x: number; y: number; life: number }[] = []
  private goo: Goo[] = []
  private walkPh = [0, 0]
  private oozeT = [0, 0]
  private swing = [0, 0]
  private swingDir = [1, -1]
  private netHit: { y: number; dir: number; t: number } | null = null
  private clingK = [0, 0]
  private landX = -1
  private scene: Scene = getScene('praia')
  private px: PixelScene
  private pan = 0
  private wallsOn = true
  private frameExtra = 0
  private zoom = 1
  /** centro horizontal do enquadramento, em coordenadas de mundo */
  private camX = NET_POSITION_X
  private looks: PlayerLook[] = [defaultLook(LEFT), defaultLook(RIGHT)]
  private cols: Cols[] = [colsOf(bodyHex(defaultLook(LEFT))), colsOf(bodyHex(defaultLook(RIGHT)))]
  private hairCols: Cols[] = [colsOf(hairHex(defaultLook(LEFT))), colsOf(hairHex(defaultLook(RIGHT)))]
  private names = ['P1', 'P2']
  /** cinemática de abertura: -1 desligada */
  private intro = -1
  private cut = 0
  private onKey = (e: KeyboardEvent) => { if (this.intro >= 0 && !e.repeat && (e.code === 'Enter' || e.code === 'Escape')) this.skipIntro() }
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

  /**
   * Um pixel do mundo vira sempre um número inteiro de pixels físicos: com
   * fator quebrado, colunas vizinhas saem com larguras diferentes e a imagem
   * fica irregular. O mundo cresce alguns pixels pra fechar a tela.
   */
  setSize(w: number, h: number) {
    const dpr = Math.max(1, Math.min(4, devicePixelRatio || 1))
    this.cw = Math.max(1, Math.round(w * dpr))
    this.ch = Math.max(1, Math.round(h * dpr))
    this.canvas.width = this.cw
    this.canvas.height = this.ch
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    const k = Math.max(1, Math.floor(this.ch / VH))
    this.H = Math.ceil(this.ch / k)
    this.W = clamp(Math.ceil(this.cw / k), 240, 720)
    this.world.width = this.W
    this.world.height = this.H
    this.g.imageSmoothingEnabled = false
    this.screen.imageSmoothingEnabled = false
    this.px.resize(this.W, this.H)
    this.applyFrame()
  }

  /** enquadramento mais aberto: a quadra inteira cabe */
  private baseScale() {
    return Math.min(this.W / (RIGHT_PLANE + 70), this.H / 560)
  }

  /** quadro fixo: a quadra inteira, sempre; a simulacao nunca ve a camera */
  private applyFrame() {
    this.camX = NET_POSITION_X
    this.scale = this.baseScale() * this.zoom
    this.ox = this.W / 2 - this.camX * this.scale
    this.oy = this.H * 0.9 - (GROUND + 44) * this.scale
  }

  /** na arena o cenario e sempre o escuro: o foco sao os jogadores */
  setScene(id: SceneId) {
    void id
    this.scene = getScene('arena')
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
        this.ooze(c.px[s], GROUND - 4, 7, 150, s, 0.9)
        this.blobKick[s] = Math.max(this.blobKick[s], 0.3)
      } else if (!wasG && isG) {
        const power = clamp((c.py[s] - p.py[s]) / 14, 0.15, 1)
        this.ooze(c.px[s], GROUND - 2, Math.floor(8 + 14 * power), 160 + 200 * power, s, 0.5)
        this.smear(c.px[s], GROUND + 3, s, 2 + 2.5 * power, 1, 0, 4)
        for (let k = 0; k < 3; k++) this.smear(c.px[s] + (Math.random() - 0.5) * 90 * (0.5 + power), GROUND + 2 + Math.random() * 3, s, 0.6 + Math.random() * 1.2, 1, 0, 3)
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

  /** gosma: gotas que voam, grudam onde caem e somem aos poucos */
  private ooze(x: number, y: number, n: number, speed: number, p: Side, up = 0.5) {
    const room = GOO_MAX - this.goo.length
    const count = Math.min(n, Math.max(0, room))
    const c = this.cols[p]
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = speed * (0.3 + Math.random() * 0.8)
      this.goo.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - up * speed,
        life: 0, max: 2.4 + Math.random() * 2.2, col: Math.random() < 0.6 ? c.base : c.dk, st: 0, r: 1 + Math.floor(Math.random() * 2),
        seed: Math.random() * 1000, dir: 0,
      })
    }
  }

  /** mancha que ja nasce grudada no chao ou na parede, estilo Meat Boy */
  private smear(x: number, y: number, p: Side, r: number, st: number, dir: number, life = 3) {
    if (this.goo.length >= GOO_MAX) this.goo.shift()
    const c = this.cols[p]
    this.goo.push({ x, y, vx: 0, vy: 0, life: 0, max: life + Math.random() * 1.5, col: Math.random() < 0.7 ? c.base : c.dk, st, r, seed: Math.random() * 1000, dir })
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
          this.ooze(w.ballX, w.ballY, Math.floor(6 + 10 * inten), 220 * inten, e.side as Side, 0.6)
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
          this.netHit = { y: w.ballY, dir: w.ballVX >= 0 ? -1 : 1, t: 0 }
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
        case Ev.WALL_CLING: {
          const p = e.side as Side
          const wx = p === LEFT ? LEFT_PLANE : RIGHT_PLANE
          this.ooze(wx, w.blobY[p], 10, 120, p, 0.2)
          for (let k = 0; k < 4; k++) this.smear(wx, w.blobY[p] - 20 + k * 14, p, 1 + Math.random(), 2, 0, 3.5)
          this.rings.push({ x: wx, y: w.blobY[p], r: 4, max: 60, life: 0, color: this.light(p) })
          break
        }
        case Ev.WALL_JUMP: {
          const p = e.side as Side
          const wx = p === LEFT ? LEFT_PLANE : RIGHT_PLANE
          this.trauma = Math.min(1, this.trauma + 0.08)
          this.ooze(wx, w.blobY[p] + 10, 14, 260, p, 0.4)
          this.burst(wx, w.blobY[p], 12, 200, this.light(p), 0.3)
          this.blobKick[p] = Math.max(this.blobKick[p], 0.5)
          break
        }
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
          this.hitstop = Math.max(this.hitstop, e.intensity >= 1 ? 0.34 : 0.26)
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
          this.trauma = Math.min(1, this.trauma + 0.6)
          this.hitstop = Math.max(this.hitstop, 0.22)
          this.flash = Math.max(this.flash, 0.42)
          this.parryTint[p] = 0.32
          this.sparks.push({ x: w.ballX, y: w.ballY, life: 0, seed: this.time })
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
        case Ev.HIT: {
          const p = e.side as Side
          const inten = 0.4 + e.intensity * 0.6
          this.swing[p] = 1
          this.swingDir[p] = w.ballX >= w.blobX[p] ? 1 : -1
          this.faces[p].set('angry', 0.4, 3)
          this.trauma = Math.min(1, this.trauma + 0.3 * inten)
          this.hitstop = Math.max(this.hitstop, e.intensity >= 0.99 ? 0.09 : 0.04)
          this.blobKick[p] = Math.max(this.blobKick[p], 0.6)
          this.burst(w.ballX, w.ballY, Math.floor(20 + 30 * inten), 260 * inten, '#ffffff', 0.4)
          this.burst(w.ballX, w.ballY, 16, 200 * inten, this.light(p), 0.5)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 8, max: 90 + 110 * inten, life: 0, color: '#ffffff', w: 2 })
          this.squashBall(w, 0.16 + 0.12 * inten)
          break
        }
        case Ev.DROP: {
          const p = e.side as Side
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 70, life: 0, color: '#cfe9ff' })
          this.burst(w.ballX, w.ballY, 10, 120, '#ffffff', 0.9)
          this.blobKick[p] = Math.max(this.blobKick[p], 0.3)
          break
        }
        case Ev.REVERSAL_TRY: {
          const p = e.side as Side
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 22, r: 6, max: 64, life: 0, color: '#ff8a2b' })
          break
        }
        case Ev.REVERSAL_SPIN: {
          const p = e.side as Side
          this.doubleTint[p] = 0.6
          this.hitstop = Math.max(this.hitstop, 0.08)
          this.flash = Math.max(this.flash, 0.3)
          this.energy = 1
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 22, r: 8, max: 120, life: 0, color: '#ff8a2b', w: 2 })
          this.rings.push({ x: w.blobX[p], y: w.blobY[p] - 22, r: 4, max: 80, life: -0.1, color: '#fff3c4' })
          this.burst(w.blobX[p], w.blobY[p] - 22, 40, 260, '#ffb347', 0.5)
          break
        }
        case Ev.REVERSAL: {
          this.doubleTint[e.side as Side] = 0.25
          this.sparks.push({ x: w.ballX, y: w.ballY, life: 0, seed: this.time })
          const p = e.side as Side
          this.trauma = 1
          this.flash = Math.max(this.flash, 0.5)
          this.hitstop = Math.max(this.hitstop, 0.18)
          this.aber = Math.max(this.aber, 1.2)
          this.blobFlash[p] = 1
          this.blobKick[p] = 1
          this.burst(w.ballX, w.ballY, 100, 600, '#ff8a2b', 0.3)
          this.burst(w.ballX, w.ballY, 50, 720, '#fff6d8', 0.15)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 300, life: 0, color: '#ffb347', w: 2 })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 190, life: -0.08, color: '#ffffff' })
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

  clearBigs() { this.bigs.length = 0; this.pendingBigs.length = 0; this.callouts.length = 0 }

  callout(side: Side, text: string, color: string) {
    this.callouts = this.callouts.filter(c => c.side !== side)
    this.callouts.push({ side, text, color, life: 0 })
    return true
  }

  private calloutsDraw() {
    const g = this.g
    for (const c of this.callouts) {
      const inK = Math.min(1, c.life / 0.18)
      const alpha = c.life > 0.75 ? 1 - (c.life - 0.75) / 0.25 : 1
      const sc = inK < 1 ? 3 : 2
      const x = Math.round(this.W * (c.side === LEFT ? 0.25 : 0.75))
      const y = Math.round(this.H * 0.3 - (1 - inK) * 6)
      const w = textWidth(c.text, sc)
      g.globalAlpha = Math.max(0, alpha)
      g.fillStyle = 'rgba(10,8,14,0.55)'
      g.fillRect(x - Math.round(w / 2) - 3, y - 3, w + 6, FONT_H * sc + 6)
      g.fillStyle = c.color
      g.fillRect(x - Math.round(w / 2) - 3, y + FONT_H * sc + 2, w + 6, 1)
      pxText(g, c.text, x, y, c.color, sc, '#1a1620')
    }
    g.globalAlpha = 1
  }

  /** Armando a batida: braços erguidos e a mira em pontinhos, mais longa quanto mais carga. */
  private aimLine(p: Side, x: number, y: number, w: Match['world']) {
    const g = this.g
    const [nx, ny] = w.aimVector(p)
    const k = Math.min(1, w.hitCharge[p] / HIT_CHARGE_MAX)
    const cx = this.X(x), cy = this.Y(y) - Math.round(this.S(BLOBBY_UPPER_SPHERE))
    const len = this.S(40 + 70 * k)
    const col = k >= 0.999 ? '#ffd257' : '#ffffff'
    g.globalAlpha = 0.85
    g.fillStyle = col
    const n = Math.max(3, Math.round(len / 4))
    const ph = Math.floor(this.time * 14) % 3
    for (let i = 1; i <= n; i++) {
      if ((i + ph) % 3) continue
      const t = (i / n) * len
      g.fillRect(Math.round(cx + nx * t), Math.round(cy + ny * t), 1, 1)
    }
    const tx = Math.round(cx + nx * len), ty = Math.round(cy + ny * len)
    g.fillRect(tx - 1, ty, 3, 1); g.fillRect(tx, ty - 1, 1, 3)
    g.globalAlpha = 1
  }

  /** Braços da batida: dois tracinhos pra cima, na frente do cabelo, tremendo quando a carga enche. */
  private arms(p: Side, x: number, y: number, w: Match['world']) {
    const g = this.g
    const k = Math.min(1, w.hitCharge[p] / HIT_CHARGE_MAX)
    const cx = this.X(x), cy = this.Y(y) - Math.round(this.S(BLOBBY_UPPER_SPHERE))
    const c = this.cols[p]
    const jit = k >= 0.999 ? Math.round(Math.sin(this.time * 40)) : 0
    const ru = this.S(BLOBBY_UPPER_RADIUS)
    for (const sgn of [-1, 1]) {
      const ax = Math.round(cx + sgn * ru * 0.95), ay = Math.round(cy - ru * 0.2 + jit)
      const h = Math.round(ru * 0.9 * (0.4 + 0.6 * k))
      g.fillStyle = c.dk2
      g.fillRect(ax - 1, ay - h - 1, 4, h + 2)
      g.fillStyle = c.dk
      g.fillRect(ax, ay - h, 2, h)
      g.fillStyle = c.hi
      g.fillRect(ax, ay - h - 1, 2, 2)
    }
  }

  private step(dt: number) {
    this.targetFlash = Math.max(0, this.targetFlash - dt * 1.6)
    if (this.bigs.length) this.bigs = this.bigs.filter(b => { b.life += dt; return b.life < b.max })
    if (this.callouts.length) this.callouts = this.callouts.filter(c => { c.life += dt; return c.life < 1 })
    this.time += dt
    for (const f of this.faces) f.update(dt, this.tension, false)
    if (this.pops.length) this.pops = this.pops.filter(e => { e.life += dt; return e.life < e.max })
    if (this.sparks.length) this.sparks = this.sparks.filter(e => { e.life += dt; return e.life < 0.3 })
    this.trauma = Math.max(0, this.trauma - dt * 2.2)
    this.aber = Math.max(0, this.aber - dt * 4)
    this.cut = Math.max(0, this.cut - dt * 5)
    for (const i of [0, 1]) {
      const wv = this.lastWorld
      const air = wv ? wv.blobY[i] < GROUND_PLANE_HEIGHT - 0.5 : false
      const tx = wv ? clamp(-wv.blobVX[i] * 0.55, -5, 5) : 0
      const ty = wv ? clamp(-wv.blobVY[i] * 0.32, -4, 4) : 0
      if (this.wasAir[i] && !air) this.hairVY[i] -= 22
      this.wasAir[i] = air
      const st = 120, dp = 11
      this.hairVX[i] += ((tx - this.hairX[i]) * st - this.hairVX[i] * dp) * dt
      this.hairVY[i] += ((ty - this.hairY[i]) * st - this.hairVY[i] * dp) * dt
      this.hairX[i] += this.hairVX[i] * dt
      this.hairY[i] += this.hairVY[i] * dt
      this.blobFlash[i] = Math.max(0, this.blobFlash[i] - dt * 3.5)
      this.blobKick[i] = Math.max(0, this.blobKick[i] - dt * 3)
      this.parryTint[i] = Math.max(0, this.parryTint[i] - dt)
      this.doubleTint[i] = Math.max(0, this.doubleTint[i] - dt)
    }
    this.squash.k = Math.max(0, this.squash.k - dt * 0.85)
    if (this.netHit) { this.netHit.t += dt; if (this.netHit.t > 1.2) this.netHit = null }
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
    this.trail = this.trail.filter(t => { t.life += dt; return t.life < 0.3 })
    const keepGoo: Goo[] = []
    for (const o of this.goo) {
      o.life += dt
      if (o.life >= o.max) continue
      if (o.st === 0) {
        o.vy += 900 * dt
        o.x += o.vx * dt
        o.y += o.vy * dt
        if (o.y >= GROUND + 2) { o.y = GROUND + 2 + Math.random() * 3; o.st = 1 }
        else if (o.x <= LEFT_PLANE + 1) { o.x = LEFT_PLANE + 1; o.st = 2; o.vy = 0 }
        else if (o.x >= RIGHT_PLANE - 1) { o.x = RIGHT_PLANE - 1; o.st = 2; o.vy = 0 }
      } else if (o.st === 2) {
        o.y += 22 * dt
        if (o.y >= GROUND + 2) { o.y = GROUND + 2; o.st = 1 }
      }
      keepGoo.push(o)
    }
    this.goo = keepGoo
  }

  private gooDraw() {
    const g = this.g
    for (const o of this.goo) {
      const a = Math.min(1, (1 - o.life / o.max) * 1.6)
      g.globalAlpha = a
      g.fillStyle = o.col
      const x = this.X(o.x), y = this.Y(o.y)
      if (o.st === 0) { g.fillRect(x, y, o.r, o.r); continue }
      const sd = o.seed
      const grow = Math.min(1, o.life * 6)
      if (o.st === 1) {
        const rx = Math.max(1, Math.round(this.S(o.r * 3.2) * grow))
        g.fillRect(x - rx, y, rx * 2, 1)
        g.fillRect(x - Math.round(rx * 0.6), y + 1, Math.round(rx * 1.2), 1)
        if (rx > 2) {
          g.fillRect(x - Math.round(rx * 0.3), y - 1, Math.round(rx * 0.6), 1)
          for (let k = 0; k < 3; k++) {
            const off = Math.round(Math.sin(sd + k * 2.1) * rx * 1.6)
            g.fillRect(x + off + Math.round(o.dir * rx * 0.8), y + (k & 1), 1 + (k & 1), 1)
          }
        }
        if (o.dir !== 0 && rx > 1) g.fillRect(o.dir > 0 ? x - rx * 2 : x + rx, y, rx, 1)
      } else {
        const h = Math.max(2, Math.round(this.S(o.r * 4) * grow))
        const drip = Math.round(Math.min(o.life * 8, h * 1.5))
        const wx = o.x <= LEFT_PLANE + 1 ? x : x - 2
        g.fillRect(wx, y - h, 2, h + drip)
        g.fillRect(o.x <= LEFT_PLANE + 1 ? wx + 2 : wx - 1, y - Math.round(h * 0.6), 1, Math.round(h * 0.4))
        g.fillRect(wx, y + drip, 2, 2)
      }
    }
    g.globalAlpha = 1
  }

  /** pes de gosma que fazem parte do corpo: dois calombos que alternam ao andar */
  private feet(p: Side, x: number, ly: number, rl: number, bry: number, vx: number, ground: boolean, c: Cols, dive: number) {
    if (dive > 0.05) return
    const g = this.g
    const dir = vx > 0.05 ? 1 : vx < -0.05 ? -1 : 0
    if (ground && dir !== 0) this.walkPh[p] += Math.abs(vx) * 0.06
    const ph = this.walkPh[p]
    const r = rl * 0.36
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1
      const step = ground && dir !== 0 ? Math.max(0, Math.sin(ph + i * Math.PI)) : 0
      const fx = x + side * rl * 0.62 + (ground && dir !== 0 ? dir * Math.cos(ph + i * Math.PI) * rl * 0.25 : 0)
      const fy = ground ? ly + bry * 0.62 - step * this.S(9) : ly + bry * 0.3
      ellipseP(g, fx, fy, r * (1 + step * 0.15), r * 0.62 * (1 - step * 0.2), c, -0.5, -0.6)
    }
    void g
    if (ground && dir !== 0) {
      this.oozeT[p] += 1
      if (this.oozeT[p] % 5 === 0) {
        const wx = (x - this.ox) / this.scale
        this.smear(wx - dir * 14 + (Math.random() - 0.5) * 20, GROUND + 2 + Math.random() * 3, p, 0.7 + Math.random() * 0.8, 1, dir, 2.2)
      }
    }
  }

  /** onde a bola vai cair, ignorando quem esta no caminho */
  private landing(w: Match['world']) {
    let x = w.ballX, y = w.ballY, vx = w.ballVX, vy = w.ballVY
    const T2 = w.tempo * w.tempo
    for (let i = 0; i < 600; i++) {
      vy += BALL_GRAVITATION * T2
      x += vx; y += vy
      if (x - BALL_RADIUS <= LEFT_PLANE && vx < 0) { vx = -vx; x = LEFT_PLANE + BALL_RADIUS }
      else if (x + BALL_RADIUS >= RIGHT_PLANE && vx > 0) { vx = -vx; x = RIGHT_PLANE - BALL_RADIUS }
      if (Math.abs(x - NET_POSITION_X) < NET_RADIUS + BALL_RADIUS && y > NET_SPHERE_POSITION - BALL_RADIUS) return -1
      if (y + BALL_RADIUS >= GROUND) return x
    }
    return -1
  }

  private landingMark(x: number, col: string) {
    const g = this.g
    const px = this.X(x), gy = this.Y(GROUND) + 2
    const k = 0.55 + Math.sin(this.time * 9) * 0.25
    g.globalAlpha = k
    g.fillStyle = col
    for (let i = 0; i < 4; i++) g.fillRect(px - i, gy + i, i * 2 + 1, 1)
    g.globalAlpha = 1
    g.fillStyle = '#ffffff'
    g.fillRect(px, gy, 1, 1)
  }

  /** para onde fica a luz da cena, visto de um ponto da tela */
  private lightAt(x: number, y: number): [number, number] {
    const s = this.px.sun
    if (!s) return [-0.5, -0.6]
    const dx = s.x - x, dy = s.y - y
    const d = Math.hypot(dx, dy)
    if (d < 1) return [-0.5, -0.6]
    return [dx / d, dy / d]
  }

  /** física → pixel do mundo (inteiro) */
  private X(x: number) { return Math.round(this.ox + x * this.scale) }
  private Y(y: number) { return Math.round(this.oy + y * this.scale) }
  private S(v: number) { return v * this.scale }

  private hair(p: Side, cx: number, cy: number, ru: number, fac: number, back: boolean) {
    const st = hairStyle(this.looks[p])
    if (!st.tufts.length && !st.puffs.length) return
    const g = this.g
    const hc = this.doubleTint[p] > 0 ? DOUBLE_COLS : this.parryTint[p] > 0 ? PARRY_COLS : this.hairCols[p]
    const isBack = (a: number) => Math.abs(a) >= 88
    const sway = Math.sin(this.time * 5 + p) * 0.35
    const mx = this.hairX[p], my = this.hairY[p]
    for (const t of st.tufts) {
      if (isBack(t.a) !== back) continue
      const beads = tuftBeads(t, 6)
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        const k = i / (beads.length - 1)
        const r = Math.max(0.5, b.hw * ru)
        discP(g, cx + fac * b.x * ru + (sway + mx) * k * k, cy - b.y * ru + my * k * k, r + 0.5, hc.dk2)
      }
      for (let i = 0; i < beads.length; i++) {
        const b = beads[i]
        const k = i / (beads.length - 1)
        const r = Math.max(0.5, b.hw * ru)
        discP(g, cx + fac * b.x * ru + (sway + mx) * k * k, cy - b.y * ru + my * k * k, Math.max(0, r - 0.5), k < 0.35 ? hc.base : hc.hi)
      }
    }
    for (const pf of st.puffs) {
      if (isBack(pf.a) !== back) continue
      const q = puffCenter(pf)
      ellipseP(g, cx + fac * q.x * ru + mx * 0.35, cy - q.y * ru + my * 0.35, pf.r * ru, pf.r * ru, hc)
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

  /** elipse de contato no chao: da a altura do corpo que a projeta */
  private shadow(x: number, y: number, r: number) {
    const g = this.g
    const h = clamp((GROUND - y) / 330, 0, 1)
    const k = 1 - 0.5 * h
    const cx = this.X(x), gy = this.Y(GROUND) + 1
    const rx = Math.max(2, Math.round(this.S(r) * 1.05 * k))
    const ry = Math.max(2, Math.round(this.S(r) * 0.4 * k))
    const ring = (sx: number, sy: number, alpha: number, color: string) => {
      g.fillStyle = color
      g.globalAlpha = alpha
      for (let yy = -sy; yy <= sy; yy++) {
        const w = Math.round(sx * Math.sqrt(Math.max(0, 1 - (yy / (sy + 0.5)) ** 2)))
        if (w > 0) g.fillRect(cx - w, gy + yy, w * 2, 1)
      }
      g.globalAlpha = 1
    }
    ring(rx, ry, 0.3 - 0.16 * h, this.px.pal.shadow)
    ring(Math.round(rx * 0.62), Math.max(1, Math.round(ry * 0.62)), 0.34 - 0.18 * h, this.px.pal.shadow)
  }

  private blob(p: Side, wx: number, wy: number, state: number, ball: { x: number; y: number },
               stunned: boolean, cr: number, dive: number, dvDir: number) {
    if (this.off(p)) return
    const g = this.g
    const tint = this.parryTint[p] > 0 || this.doubleTint[p] > 0
    const c = this.doubleTint[p] > 0 ? DOUBLE_COLS : tint ? PARRY_COLS : this.cols[p]
    const kick = this.blobKick[p]
    const squash = (1 + Math.sin(state * 1.6) * 0.045 + Math.sin(kick * 9) * kick * 0.12) * (1 - cr * 0.12)
    const ru = this.S(BLOBBY_UPPER_RADIUS - cr * CROUCH_SLIM) * squash * (1 + 0.12 * Math.sin(Math.min(1, this.swing[p]) * Math.PI))
    const rl = this.S(BLOBBY_LOWER_RADIUS + cr * CROUCH_SPREAD) / squash
    const ck = this.clingK[p]
    const wallDir = p === LEFT ? -1 : 1
    const x = this.ox + wx * this.scale + wallDir * this.S(6) * ck
    const y = this.oy + wy * this.scale
    const uy = y - this.S(BLOBBY_UPPER_SPHERE - cr * CROUCH_DUCK) * squash + this.S(4) * ck
    const ly = y + this.S(BLOBBY_LOWER_SPHERE)
    const d = dvDir, dk = dive
    const bkx = x - d * this.S(20) * dk
    const bky = ly + this.S(13) * dk
    const brx = rl * (1 + 0.42 * dk) * (1 - 0.18 * ck)
    const bry = rl * (1 - 0.3 * dk) * (1 + 0.14 * ck)
    const sw = this.swing[p]
    const swk = Math.sin(Math.min(1, sw) * Math.PI)
    const lean = this.lastWorld ? clamp((this.lastWorld.blobVX[p] + this.lastWorld.knock[p]) * 0.9, -6, 6) : 0
    const hx = x + d * this.S(30) * dk + this.S(lean) * (1 - dk) + this.swingDir[p] * this.S(16) * swk
    const hy = uy + this.S(22) * dk - this.S(6) * swk
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
    const [sunX, sunY] = this.lightAt(hx, hy)
    const rim = shade(c.hi, 1.45)
    const wv = this.lastWorld
    const vx = wv ? wv.blobVX[p] + wv.knock[p] : 0
    const onG = wy >= GROUND_PLANE_HEIGHT - 0.5
    this.feet(p, x, ly, rl, bry, vx, onG, c, dk)
    ellipseP(g, bkx, bky, brx, bry, c, sunX, sunY, rim)
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
    ellipseP(g, hx, hy, ru, ru, c, sunX, sunY, rim)
    g.fillStyle = c.hi
    g.fillRect(Math.round(hx + sunX * ru * 0.45), Math.round(hy + sunY * ru * 0.55), 2, 1)
    g.fillRect(Math.round(hx + sunX * ru * 0.55), Math.round(hy + sunY * ru * 0.35), 1, 2)
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
    const pal = ['#f4f6fa', '#2f7ff0', '#ffd23f']
    const dark = ['#b8c0cc', '#1d54b0', '#d9a41e']
    const light = ['#ffffff', '#7fb4ff', '#fff0a0']
    const seam = '#1b2436'
    const [lx, ly] = this.lightAt(cx, cy)
    const cr = Math.cos(rot), sr = Math.sin(rot)
    const ct = 0.82, st = 0.57
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      const nx = xx / rx, ny = yy / ry
      const d = nx * nx + ny * ny
      if (d > 1) continue
      const nz = Math.sqrt(1 - d)
      const edge = d > (1 - 1.8 / r) ** 2
      const x1 = nx * cr - nz * sr, z1 = nx * sr + nz * cr
      const y2 = ny * ct - z1 * st, z2 = ny * st + z1 * ct
      const ang = Math.atan2(y2, x1)
      const u = ((ang / (Math.PI * 2 / 3)) % 3 + 3) % 3
      const panel = Math.floor(u), pf = u - panel
      const v = (z2 + 1) * 1.5
      const stripe = Math.min(2, Math.floor(v)), sf = v - stripe
      const onSeam = pf < 0.05 || pf > 0.95 || (sf < 0.07 && stripe > 0) || (sf > 0.93 && stripe < 2)
      const idx = (panel + stripe) % 3
      const lit = nx * lx + ny * ly
      let col: string
      if (edge || onSeam) col = seam
      else if (lit > 0.55 && d < 0.55) col = light[idx]
      else if (lit < -0.4) col = dark[idx]
      else col = pal[idx]
      g.fillStyle = col
      g.fillRect(cx + xx, cy + yy, 1, 1)
    }
    g.fillStyle = '#ffffff'
    g.fillRect(cx + Math.round(lx * r * 0.5), cy + Math.round(ly * r * 0.55), 2, 1)
  }

  /** Double special: rastro da bola dando a volta no corpo, mais o anel de energia. */
  private orbitFx(p: Side, w: Match['world']) {
    const g = this.g
    const spin = w.revSpin[p]
    for (let i = 1; i <= 7; i++) {
      const [ox, oy] = w.orbitPos(p, spin + i * 1.2)
      const k = 1 - i / 8
      g.globalAlpha = k * 0.8
      discP(g, this.X(ox), this.Y(oy), Math.max(1, this.S(BALL_RADIUS) * (0.35 + 0.55 * k)), i % 2 ? '#ff8a2b' : '#fff3c4')
    }
    g.globalAlpha = 1
    const cx = this.X(w.blobX[p]), cy = this.Y(w.upperY(p))
    const rr = this.S(REVERSAL_ORBIT * (1.1 + 0.1 * Math.sin(this.time * 40)))
    outlineP(g, cx, cy, rr, rr * 0.75, '#ff8a2b')
    for (let i = 0; i < 18; i++) {
      const a = this.time * 12 + i * Math.PI * 2 / 18
      const r = rr * (1.05 + 0.2 * Math.abs(Math.sin(this.time * 25 + i)))
      g.fillStyle = i % 3 ? '#ffb347' : '#ffffff'
      g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), 1, 1)
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
    const g = this.g
    const gy = this.Y(GROUND + 44)
    const top = this.Y(GROUND - 560)
    for (const wx of [LEFT_PLANE, RIGHT_PLANE]) {
      const x = this.X(wx) + (wx === LEFT_PLANE ? -1 : 0)
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.fillRect(x, top, 1, gy - top)
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(wx === LEFT_PLANE ? x - 3 : x + 1, top, 3, gy - top)
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
    g.fillStyle = this.scene.d2.line
    g.fillRect(this.X(0), this.Y(GROUND + 44), this.X(RIGHT_PLANE) - this.X(0), 1)
  }

  private net() {
    const g = this.g
    const pal = this.px.pal
    const nx = this.X(NET_POSITION_X)
    const top = this.Y(NET_SPHERE_POSITION), bot = this.Y(GROUND + 30)
    const w = Math.max(3, Math.round(this.S(NET_RADIUS * 2)))
    const flare = Math.max(1, Math.round(this.S(5)))
    const mesh0 = nx - Math.floor(w / 2) - flare
    const meshW = w + flare * 2
    const tape = Math.max(2, Math.round(this.S(8)))
    const cell = Math.max(2, Math.round(this.S(5)))

    this.shadow(NET_POSITION_X, GROUND, NET_RADIUS * 2.2)

    // trama translucida: as cordas filtram o cenario em vez de tapar
    const mTop = top + tape
    const nh = this.netHit
    const bend = (y: number) => {
      if (!nh) return 0
      const dy = (y - this.Y(nh.y)) / this.S(70)
      return nh.dir * this.S(14) * Math.exp(-nh.t * 4.5) * Math.sin(nh.t * 26) * Math.exp(-dy * dy) * (1 - Math.exp(-nh.t * 40))
    }
    g.fillStyle = '#e8e8e0'
    for (let y = mTop; y < bot; y++) {
      const off = Math.round(bend(y))
      g.globalAlpha = 0.5
      for (let x = mesh0; x <= mesh0 + meshW; x += cell) g.fillRect(x + off, y, 1, 1)
      if ((y - mTop) % cell === 0) { g.globalAlpha = 0.3; g.fillRect(mesh0 + off, y, meshW + 1, 1) }
    }
    g.globalAlpha = 1

    // mastro metalico: sombra de um lado, brilho fino do outro
    const pw = Math.max(2, Math.round(w * 0.5))
    const px0 = nx - Math.floor(pw / 2)
    g.fillStyle = shade(pal.pole, 0.55)
    g.fillRect(px0, top, pw, bot - top + 2)
    g.fillStyle = shade(pal.pole, 0.88)
    g.fillRect(px0, top, Math.max(1, pw - 1), bot - top + 2)
    g.fillStyle = shade(pal.pole, 1.14)
    g.fillRect(px0, top + 1, 1, bot - top)

    // fita da borda superior
    g.fillStyle = '#eeeee8'
    g.fillRect(mesh0, top, meshW + 1, tape)
    g.fillStyle = '#ffffff'
    g.fillRect(mesh0, top, meshW + 1, 1)
    g.fillStyle = shade('#eeeee8', 0.72)
    g.fillRect(mesh0, top + tape - 1, meshW + 1, 1)

    // ponteira do mastro
    const kn = Math.max(1, Math.round(this.S(5)))
    discP(g, nx, top - kn, kn, shade(pal.pole, 0.8))
    discP(g, nx, top - kn, Math.max(0, kn - 1), shade(pal.pole, 1.1))

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
    for (const sp of this.sparks) {
      // faísca do SF3: raios brancos irregulares saindo do ponto de contato
      const k = sp.life / 0.3
      const cx = this.X(sp.x), cy = this.Y(sp.y)
      g.globalAlpha = 1 - k * k
      g.strokeStyle = k < 0.35 ? '#ffffff' : '#bfe9ff'
      g.lineWidth = k < 0.35 ? 2 : 1
      g.beginPath()
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.sin(sp.seed * 7 + i * 3.1) * 0.3
        const len = this.S(22 + 40 * Math.abs(Math.sin(sp.seed * 3 + i * 1.7))) * (0.4 + 0.6 * Math.min(1, k * 3)) * (1 - k * 0.3)
        const r0 = this.S(6) * k * 4
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  }

  private trailFx() {
    const g = this.g
    const n = this.trail.length
    if (n < 2) return
    const hot = this.energy > 0.01
    const R = this.S(BALL_RADIUS)
    const LIFE = 0.3
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1], b = this.trail[i]
      const ka = 1 - a.life / LIFE, kb = 1 - b.life / LIFE
      if (kb <= 0) continue
      const ax = this.X(a.x), ay = this.Y(a.y), bx = this.X(b.x), by = this.Y(b.y)
      const len = Math.hypot(bx - ax, by - ay)
      const steps = Math.max(1, Math.ceil(len / 2))
      for (let s = 0; s < steps; s++) {
        const t = s / steps
        const k = Math.max(0, ka + (kb - ka) * t)
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t
        const rr = R * (0.15 + 0.6 * k * k)
        g.globalAlpha = hot ? 0.75 * k : 0.5 * k
        discP(g, px, py, rr, hot ? (k > 0.6 ? '#ffe17a' : k > 0.3 ? '#ff8a2b' : '#d83a1a') : (k > 0.5 ? '#dbe9ff' : '#7fb4ff'))
        if (k > 0.55) { g.globalAlpha = 0.6 * k; discP(g, px, py, rr * 0.45, '#ffffff') }
      }
    }
    const last = this.trail[n - 1], prev = this.trail[n - 2]
    const vx = last.x - prev.x, vy = last.y - prev.y
    const sp = Math.hypot(vx, vy)
    if (sp > 2) {
      const ux = -vx / sp, uy = -vy / sp
      const count = hot ? 14 : 5
      for (let i = 0; i < count; i++) {
        const t = (this.time * 9 + i * 0.37) % 1
        const back = R * (1.2 + t * (hot ? 4 : 2.2)) + i * 2
        const side = Math.sin(this.time * 23 + i * 1.7) * R * (0.5 + t * 0.6)
        const px = this.X(last.x) + ux * back - uy * side, py = this.Y(last.y) + uy * back + ux * side
        g.globalAlpha = (1 - t) * 0.9
        g.fillStyle = hot ? (t < 0.3 ? '#fff0a0' : t < 0.65 ? '#ff9a2a' : '#d83a1a') : (i & 1 ? '#ffffff' : '#9fd0ff')
        const sz = hot && t < 0.5 ? 2 : 1
        g.fillRect(Math.round(px), Math.round(py), sz, sz)
      }
    }
    g.globalAlpha = 1
  }

  /** Emotes são emoji nativos: desenhados por cima do blit, na resolução da tela. */
  private pop(px: number[], py: number[]) {
    this.popDraw.length = 0
    for (const e of this.pops) {
      const t = e.life / e.max
      const pop = t < 0.16 ? t / 0.16 : 1
      const x = this.X(px[e.side] + Math.sin(this.time * 3 + e.seed) * 6)
      const y = this.Y(py[e.side] - BLOBBY_UPPER_SPHERE - 62 - t * 34)
      const alpha = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      this.popDraw.push({ glyph: emoteAt(e.id).glyph, x, y, sc: 0.6 + 0.4 * pop, alpha })
    }
  }

  private popDraw: { glyph: string; x: number; y: number; sc: number; alpha: number }[] = []

  private popBlit() {
    if (!this.popDraw.length) return
    const sg = this.screen
    const k = this.cw / this.W
    sg.textAlign = 'center'
    sg.textBaseline = 'middle'
    for (const e of this.popDraw) {
      const size = Math.round(k * 26 * e.sc)
      sg.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
      sg.globalAlpha = e.alpha
      sg.fillText(e.glyph, Math.round(e.x * k), Math.round(e.y * k))
    }
    sg.globalAlpha = 1
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
    if (t < 3.3) return { z: 3.4 - (t - 1.9) * 0.1, fx: lx + 3, fy: hy - 4 }
    if (t < 4.7) return { z: 3.4 - (t - 3.3) * 0.1, fx: rx - 3, fy: hy - 4 }
    const k = ease(clamp((t - 4.7) / (INTRO_LEN - 4.7), 0, 1))
    return { z: lerp(3.26, 1, k), fx: lerp(rx - 3, W / 2, k), fy: lerp(hy - 4, H / 2, k) }
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
    this.lastWorld = match.world
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
    const panWant = clamp(((bx - NET_POSITION_X) / half) * 0.06, -0.06, 0.06)
    this.pan += (panWant - this.pan) * (1 - Math.exp(-dt * 3.2))
    const last = this.trail[this.trail.length - 1]
    if (this.intro < 0 && match.logic.isBallValid && (!last || Math.hypot(last.x - bx, last.y - by) > 3)) {
      this.trail.push({ x: bx, y: by, life: 0 })
      while (this.trail.length > 22) this.trail.shift()
    }
    this.landX = this.intro < 0 && match.logic.isBallValid ? this.landing(w) : -1

    const tr = this.trauma * this.trauma
    const sx = Math.round((Math.random() - 0.5) * 6 * tr), sy = Math.round((Math.random() - 0.5) * 6 * tr)
    g.setTransform(1, 0, 0, 1, 0, 0)
    this.px.background(g, this.time, this.pan * this.W, this.Y(GROUND), dt)
    g.setTransform(1, 0, 0, 1, sx, sy)

    this.ground()
    this.walls()
    this.gooDraw()

    if (this.intro < 0) this.shadow(bx, by, BALL_RADIUS)
    if (this.landX >= 0) this.landingMark(this.landX, this.landX < NET_POSITION_X ? this.light(LEFT) : this.light(RIGHT))
    for (const s of [0, 1] as Side[]) {
      if (this.off(s)) continue
      this.shadow(L(p.px[s], q.px[s]), L(p.py[s], q.py[s]), BLOBBY_LOWER_RADIUS)
    }
    for (const s of [0, 1] as Side[]) {
      const px = L(p.px[s], q.px[s]), py = L(p.py[s], q.py[s])
      if (!this.off(s) && w.stun[s] === 0 && this.intro < 0) this.reach(px, py, w.charge[s] >= SPECIAL_FULL)
      if (w.digActive[s] > 0) this.digSwipe(s, px, py, w.digActive[s] / DIG_WINDOW)
      if (w.hitCharge[s] > 0 && this.intro < 0) this.aimLine(s, px, py, w)
      const air = w.diveFrames[s] > 0
      const target = air ? 1 : Math.min(1, w.diveRecover[s] / (DIVE_RECOVER * 0.7))
      const rate = target > this.diveK[s] ? 15 : 6.5
      this.diveK[s] += (target - this.diveK[s]) * (1 - Math.exp(-dt * rate))
      if (this.diveK[s] < 0.002) this.diveK[s] = 0
      if (air) this.diveStreak(px, py - BLOBBY_UPPER_SPHERE * 0.5, w.diveDir[s])
      if (w.hold[s] > 0 && eOn) this.holdAura(s, px, py, w.hold[s] / SPECIAL_HOLD)
      this.clingK[s] += ((w.wallCling[s] > 0 ? 1 : 0) - this.clingK[s]) * (1 - Math.exp(-dt * 14))
      this.swing[s] = Math.max(0, this.swing[s] - dt * 4)
      if (w.hitCharge[s] > 0 && this.intro < 0) this.faces[s].set('strain', 0.12, 2)
      this.blob(s, px, py, L(p.st[s], q.st[s]), { x: this.X(bx), y: this.Y(by) }, w.stun[s] > 0, w.crouch[s],
        this.diveK[s], w.diveDir[s])
      if (w.hitCharge[s] > 0 && this.intro < 0) this.arms(s, px, py, w)
    }
    for (const s of [0, 1] as Side[]) if (w.stun[s] > 0) this.stars(L(p.px[s], q.px[s]), L(p.py[s], q.py[s]))

    if (this.intro < 0) {
      for (const s of [0, 1] as Side[]) if (w.revSpin[s] > 0) this.orbitFx(s, w)
      this.trailFx()
      if (this.energy > 0.01) this.energyBall(this.X(bx), this.Y(by), w.superOwner as number)
      g.globalAlpha = 1
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
    this.calloutsDraw()
    this.bigsDraw()

    this.screen.imageSmoothingEnabled = false
    this.screen.drawImage(this.world, 0, 0, this.W, this.H, 0, 0, this.cw, this.ch)
    if (this.intro < 0) this.popBlit()
  }

  dispose() {
    removeEventListener('keydown', this.onKey)
    removeEventListener('pointerdown', this.onPointer)
    this.dust.length = 0
    this.scorch.length = 0
    this.craters.length = 0
    this.rings.length = 0
    this.wallHits.length = 0
    this.goo.length = 0
    this.trail.length = 0
    this.pops.length = 0
    this.bigs.length = 0
  }
}
