import {
  BALL_RADIUS, BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS,
  BLOBBY_UPPER_SPHERE, GROUND_PLANE_HEIGHT_MAX, LEFT, LEFT_PLANE, NET_POSITION_X, NET_RADIUS,
  NET_SPHERE_POSITION, RIGHT, RIGHT_PLANE,
  CROUCH_DUCK, CROUCH_SLIM, CROUCH_SPREAD, DIG_WINDOW,
  DIVE_RECOVER, OPEN_MARGIN, SPECIAL_FULL, SPECIAL_REACH,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import type { BigKind, GameRenderer } from './stage.ts'
import { emoteAt } from '../core/emote.ts'
import { FaceRig, crouchMoods, faceEvents, rallyTension, reachMoods } from './face.ts'
import { getScene } from './scenes.ts'
import { getDepth, depthScale, DEPTH_CAM_Z } from './depth.ts'
import type { DepthLayer } from './depth.ts'
import type { Scene, SceneId } from './scenes.ts'
import { drawHair2D } from './hair2d.ts'
import { bodyHex, defaultLook, shade } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import type { TargetMark } from '../core/drill.ts'

const GROUND = GROUND_PLANE_HEIGHT_MAX


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

/**
 * Halo do alcance do especial, desenhado uma vez. `createRadialGradient` a cada
 * quadro, para cada jogador, obriga o Chrome a montar o gradiente de novo toda
 * vez — e é justamente enquanto a barra está cheia que ele era chamado.
 */
function makeReach(): HTMLCanvasElement {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S; cv.height = S
  const g = cv.getContext('2d')!
  const rg = g.createRadialGradient(S / 2, S / 2, (S / 2) * 0.7, S / 2, S / 2, S / 2)
  rg.addColorStop(0, 'rgba(255,210,87,0)')
  rg.addColorStop(0.55, 'rgba(255,228,155,0.26)')
  rg.addColorStop(1, 'rgba(255,210,87,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, S, S)
  return cv
}

/** Texto que estoura na tela. No 2D ele mora aqui, não no DOM. */
interface Big { text: string; kind: BigKind; color: string; life: number; max: number }

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
  private solo = false
  private target: TargetMark | null = null
  private targetFlash = 0
  private targetState = 0
  /** mesma rampa do 3D: sem ela o bote troca de pose num quadro só */
  private diveK = [0, 0]
  private trail: { x: number; y: number; life: number; seed: number }[] = []
  private pops: Pop[] = []
  private bigs: Big[] = []
  private craters: { x: number; r: number }[] = []
  private scorch: { x: number; r: number; life: number }[] = []
  /** Rastro de corpo arrastado na areia: some devagar, igual marca de verdade. */
  private skids: { x: number; dir: number; life: number }[] = []
  private time = 0
  private tension = 0
  private faces: FaceRig[] = [new FaceRig(), new FaceRig()]
  private trauma = 0
  private flash = 0
  private bands: Band[] = []
  /** Achatada na direção da batida: dura ~0.25s e some. */
  private squash = { k: 0, ang: 0 }
  private wallHits: { x: number; y: number; life: number }[] = []
  private glow: HTMLCanvasElement
  private reachGlow: HTMLCanvasElement
  private scene: Scene = getScene('praia')
  private depth: DepthLayer[] = getDepth(getScene('praia').depth)
  private pan = 0
  private sway = 0
  audioBar = 0
  audioBeat = 0
  private wallsOn = true
  /** quanto de fora-da-linha o enquadramento está abrindo agora, em unidades da física */
  private frameExtra = 0
  private looks: PlayerLook[] = [defaultLook(LEFT), defaultLook(RIGHT)]
  private fills = [bodyHex(defaultLook(LEFT)), bodyHex(defaultLook(RIGHT))]
  private darks = [shade(bodyHex(defaultLook(LEFT)), 0.55), shade(bodyHex(defaultLook(RIGHT)), 0.55)]
  /** estrelas e bichinhos da frente: sorteados uma vez, animados por relógio */
  private specks: { x: number; y: number; r: number; seed: number }[] = []
  private fg: { x: number; y: number; vx: number; vy: number; s: number; seed: number }[] = []

  constructor(canvas: HTMLCanvasElement, private lite = false) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    if (!ctx) throw new Error('canvas 2d indisponível')
    this.ctx = ctx
    this.glow = makeGlow()
    this.reachGlow = makeReach()
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
    this.applyFrame(true)
  }

  /**
   * Margem de 45px de cada lado: sem ela a parede cai exatamente na borda do
   * canvas e some, ainda mais na arena estendida, que é mais larga que 880.
   * Na quadra aberta a margem cresce só enquanto alguém está fora da linha.
   */
  private applyFrame(force = false) {
    const s = Math.min(this.cw / (RIGHT_PLANE + 90 + this.frameExtra * 2), this.ch / 640)
    if (!force && Math.abs(s - this.scale) < 1e-4) return
    this.scale = s
    this.ox = (this.cw - RIGHT_PLANE * s) / 2
    this.oy = this.ch * 0.86 - (GROUND + 44) * s
    this.buildBands()
  }

  private buildBands() {
    const d = this.scene.d2
    const horizon = this.oy + d.horizon * this.scale
    const shore = this.oy + d.shore * this.scale
    // faixa fina não custa nada: o gasto é o total de pixels, não o número de retângulos
    const step = 8
    const b: Band[] = []
    ramp(b, 0, horizon, d.sky, step)
    ramp(b, horizon, shore, d.mid, step)
    ramp(b, shore, this.ch, d.ground, step)
    this.bands = b

    this.specks = []
    for (let i = 0; i < d.stars; i++) {
      this.specks.push({
        x: Math.random(), y: Math.random() * 0.72,
        r: 0.6 + Math.random() * 1.5, seed: Math.random() * 6.28,
      })
    }
    this.fg = []
    const n = this.lite ? 8 : this.scene.fg === 'confetti' ? 20 : 16
    for (let i = 0; i < n; i++) this.fg.push(this.spawnFg(Math.random()))
  }

  setScene(id: SceneId) {
    this.scene = getScene(id)
    this.depth = getDepth(this.scene.depth)
    this.buildBands()
  }

  /**
   * Silhuetas do cenário. Em unidade de quadro, não de quadra: o mesmo
   * polígono que o 3D põe num plano. O deslocamento sai da distância — quem
   * está na frente anda mais que a quadra, quem está atrás anda menos.
   */
  private paintDepth(front: boolean) {
    const c = this.ctx
    const hw = this.cw / 2, hh = this.ch / 2
    const horizon = (this.oy + this.scene.d2.horizon * this.scale - hh) / hh
    const ground = (this.oy + GROUND * this.scale - hh) / hh
    for (const l of this.depth) {
      if ((l.z > 0) !== front) continue
      const dx = (this.pan + this.sway) * (1 / depthScale(l.z, DEPTH_CAM_Z) - 1)
      const dy = l.anchor === 'horizon' ? horizon : l.anchor === 'ground' ? ground : 0
      c.globalAlpha = l.alpha
      c.fillStyle = l.color
      c.beginPath()
      for (const p of l.poly) {
        c.moveTo(hw + (p[0] - dx) * hw, hh + (p[1] + dy) * hh)
        for (let i = 2; i < p.length; i += 2) c.lineTo(hw + (p[i] - dx) * hw, hh + (p[i + 1] + dy) * hh)
        c.closePath()
      }
      c.fill()
    }
    c.globalAlpha = 1
  }

  setWalls(on: boolean) { this.wallsOn = on }

  /** Bicho ou papel picado passando na frente da câmera. */
  private spawnFg(startY = 0) {
    const kind = this.scene.fg
    if (kind === 'confetti') {
      return {
        x: Math.random(), y: startY, s: 0.5 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.05, vy: 0.09 + Math.random() * 0.13,
        seed: Math.random() * 6.28,
      }
    }
    if (kind === 'fireflies') {
      return {
        x: Math.random(), y: 0.25 + Math.random() * 0.7, s: 0.5 + Math.random() * 0.9,
        vx: (Math.random() - 0.5) * 0.03, vy: (Math.random() - 0.5) * 0.02,
        seed: Math.random() * 6.28,
      }
    }
    if (kind === 'rain') {
      return {
        x: Math.random() * 1.2 - 0.1, y: startY - Math.random() * 0.4, s: 0.6 + Math.random() * 0.9,
        vx: -0.08, vy: 1.5 + Math.random() * 1.1, seed: Math.random() * 6.28,
      }
    }
    if (kind === 'sparks') {
      return {
        x: Math.random(), y: 1.05 + Math.random() * 0.3, s: 0.4 + Math.random() * 0.9,
        vx: (Math.random() - 0.5) * 0.05, vy: -0.16 - Math.random() * 0.2,
        seed: Math.random() * 6.28,
      }
    }
    if (kind === 'bubbles') {
      return {
        x: Math.random(), y: 1.05 + Math.random() * 0.3, s: 0.35 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.02, vy: -0.07 - Math.random() * 0.11,
        seed: Math.random() * 6.28,
      }
    }
    if (kind === 'dust') {
      return {
        x: 1.1 + Math.random() * 0.3, y: Math.random(), s: 0.5 + Math.random() * 1.2,
        vx: -0.45 - Math.random() * 0.5, vy: (Math.random() - 0.5) * 0.02,
        seed: Math.random() * 6.28,
      }
    }
    if (kind === 'pixels') {
      return {
        x: Math.random(), y: startY, s: 0.5 + Math.random() * 1.4,
        vx: 0, vy: 0.03 + Math.random() * 0.05, seed: Math.random() * 6.28,
      }
    }
    return {
      x: Math.random() < 0.5 ? -0.15 : 1.15, y: 0.06 + Math.random() * 0.34,
      s: 0.6 + Math.random() * 0.8,
      vx: (Math.random() < 0.5 ? 1 : -1) * (0.035 + Math.random() * 0.05), vy: 0,
      seed: Math.random() * 6.28,
    }
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

  private squashBall(w: Match['world'], k: number) {
    const v = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
    this.squash.ang = v > 0.001 ? Math.atan2(w.ballVY, w.ballVX) : 0
    this.squash.k = Math.max(this.squash.k, k)
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
          this.burst(w.ballX, w.ballY, Math.floor(14 + 22 * inten), 190 * inten, this.fill(e.side as Side), 0.4, 5)
          this.squashBall(w, 0.10 + 0.07 * inten)
          break
        }
        case Ev.BALL_HIT_GROUND: {
          const power = Math.min(1, Math.abs(w.ballVY) / 16)
          this.trauma = Math.min(1, this.trauma + 0.26 * power + 0.06)
          this.burst(w.ballX, GROUND + 6, Math.floor(26 + 40 * power), 150 + 190 * power, '#d8bd8c', 1.1, 5)
          this.squashBall(w, 0.10 + 0.08 * power)
          this.craters.push({ x: w.ballX, r: 22 + power * 26 })
          if (this.craters.length > 14) this.craters.shift()
          break
        }
        case Ev.BALL_HIT_NET:
        case Ev.BALL_HIT_NET_TOP:
          this.trauma = Math.min(1, this.trauma + 0.09)
          this.burst(w.ballX, w.ballY, 10, 110, '#c8d2e2', 0.5, 4)
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
          this.burst(w.blobX[e.side as Side], w.blobY[e.side as Side] - 20, 26, 120, '#ffd257', 1.5, 5)
          break
        case Ev.SPECIAL_FIRED: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.7)
          this.flash = Math.max(this.flash, 0.34)
          this.burst(w.ballX, w.ballY, 90, 520, this.fill(p), 0.3, 7)
          this.burst(w.ballX, w.ballY, 50, 700, '#fff6d8', 0.15, 5)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 260, life: 0, color: '#ffe9a8' })
          this.rings.push({ x: w.ballX, y: w.ballY, r: 4, max: 170, life: -0.08, color: this.fill(p) })
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
        case Ev.DIVE: {
          const p = e.side as Side
          const d = w.diveDir[p] || 1
          this.trauma = Math.min(1, this.trauma + 0.10)
          // areia saindo do pé no impulso, jogada pro lado contrário do salto
          this.burst(w.blobX[p] - d * 12, GROUND + 4, 22, 260, '#e2c893', 0.9, 4)
          this.burst(w.blobX[p] - d * 12, GROUND + 4, 10, 150, '#a98d5c', 0.5, 5)
          this.skids.push({ x: w.blobX[p] + d * 46, dir: d, life: 0 })
          if (this.skids.length > 5) this.skids.shift()
          break
        }
        case Ev.DIVE_HIT: {
          const p = e.side as Side
          this.trauma = Math.min(1, this.trauma + 0.2)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 8, max: 124, life: 0, color: '#ffffff', w: 7 })
          this.burst(w.ballX, w.ballY, 26, 300, '#f2ddaa', 1.1, 5)
          this.burst(w.blobX[p], GROUND + 4, 16, 210, '#c8a86e', 0.7, 4)
          this.squashBall(w, 0.24)
          break
        }
        case Ev.APEX_HIT: {
          this.rings.push({ x: w.ballX, y: w.ballY, r: 10, max: 128, life: 0, color: '#fff2b0', w: 5 })
          this.burst(w.ballX, w.ballY, 12, 200, '#ffe89a', 0.4, 3)
          break
        }
        case Ev.SPECIAL_WASTED: {
          const p = e.side as Side
          const hx = w.blobX[p], hy = w.blobY[p] - BLOBBY_UPPER_SPHERE
          this.trauma = Math.min(1, this.trauma + 0.16)
          this.rings.push({ x: hx, y: hy, r: 10, max: SPECIAL_REACH * 1.1, life: 0, color: '#ffb04d', w: 9 })
          this.rings.push({ x: hx, y: hy, r: 6, max: 120, life: -0.07, color: '#6b7080', w: 6 })
          this.burst(hx, hy, 30, 240, '#c9a24a', 1.1, 5)
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
        case Ev.BALL_OUT: {
          this.trauma = Math.min(1, this.trauma + 0.08)
          this.burst(w.ballX, w.ballY, 16, 180, '#ff8a7a', 0.5, 4)
          this.rings.push({ x: w.ballX, y: w.ballY, r: 6, max: 130, life: 0, color: '#ff8a7a', w: 5 })
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
          this.burst(w.blobX[o], w.blobY[o] - 20, 70, 360, this.fill(o), 1.6, 9)
          this.burst(w.blobX[o], w.blobY[o] - 4, 40, 280, this.fill(o), 1.1, 12)
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

  /** Minigame de mira: o lado direito não é desenhado. A física já o ignora. */
  setSolo(on: boolean) { this.solo = on }

  /** Chamada todo quadro com o mesmo objeto: o estalo só dispara na virada. */
  setTarget(t: TargetMark | null) {
    const st = t?.state ?? 0
    if (st !== 0 && st !== this.targetState) this.targetFlash = 1
    this.targetState = st
    this.target = t
  }

  /** Fora da tela: explodido pelo especial, ou o lado vazio do minigame. */
  private off(p: Side) { return this.gib[p] > 0 || (this.solo && p === RIGHT) }

  /**
   * A faixa-alvo, deitada na areia. Borda pulsando e listras andando: parada e
   * chapada ela some no chão claro da praia.
   */
  private targetMark() {
    const t = this.target
    if (!t) return
    const c = this.ctx
    const y0 = GROUND - 6, y1 = GROUND + 44
    const h = y1 - y0
    const rgb = t.state === 0 ? '255,210,87' : t.state > 0 ? '92,240,138' : '255,90,74'
    const pulse = 0.62 + 0.38 * Math.sin(this.time * 3.6)
    const fl = this.targetFlash
    c.save()
    c.beginPath(); c.rect(t.x0, y0, t.x1 - t.x0, h); c.clip()
    c.fillStyle = `rgba(${rgb},${0.26 + fl * 0.4})`
    c.fillRect(t.x0, y0, t.x1 - t.x0, h)
    c.fillStyle = `rgba(${rgb},0.22)`
    const step = 30
    const skew = 18
    const shift = (this.time * 24) % step
    for (let x = t.x0 - skew - step + shift; x < t.x1 + step; x += step) {
      c.beginPath()
      c.moveTo(x, y1); c.lineTo(x + step * 0.45, y1)
      c.lineTo(x + step * 0.45 + skew, y0); c.lineTo(x + skew, y0)
      c.closePath(); c.fill()
    }
    c.restore()
    c.strokeStyle = `rgba(${rgb},${Math.min(1, 0.5 + pulse * 0.4 + fl)})`
    c.lineWidth = 4 + fl * 3
    c.strokeRect(t.x0, y0, t.x1 - t.x0, h)
  }

  /**
   * O 2D desenha PARRY, FATALITY e o banner de ponto aqui dentro. Em DOM eles
   * eram camadas por cima do canvas, e camada sobreposta obriga o compositor a
   * remontar a tela a cada quadro enquanto a animação corre — com o canvas do
   * jogo repintando junto, a 60fps. Aqui é fillText, e some no orçamento.
   */
  bigText(text: string, kind: BigKind, ms: number, color?: string) {
    const fallback = kind === 'parry' ? '#cdf3ff' : kind === 'fatality' ? '#c81111' : '#f4f7fc'
    this.bigs = this.bigs.filter(b => b.kind !== kind)
    this.bigs.push({ text, kind, color: color ?? fallback, life: 0, max: ms / 1000 })
    return true
  }

  clearBigs() { this.bigs.length = 0 }

  private drawBigs() {
    if (!this.bigs.length) return
    const c = this.ctx
    for (const b of this.bigs) {
      const t = Math.min(1, b.life / b.max)
      const big = b.kind !== 'banner'
      const size = b.kind === 'fatality'
        ? Math.max(40, Math.min(this.cw * 0.15, this.ch * 0.26))
        : b.kind === 'parry'
          ? Math.max(34, Math.min(this.cw * 0.105, this.ch * 0.2))
          : Math.max(28, Math.min(this.cw * 0.085, this.ch * 0.15))
      // entrada curta em relação ao tempo total, saída nos últimos 18%
      const inK = Math.min(1, b.life / (big ? 0.42 : 0.34))
      const back = 1 - Math.pow(1 - inK, 3)
      const grow = b.kind === 'fatality' ? 3.4 + (1 - 3.4) * back : 0.45 + 0.55 * back
      const over = inK < 1 ? 1 : 1 + Math.sin(Math.min(1, (b.life - 0.42) * 8) * Math.PI) * 0.06
      const sc = grow * over
      const alpha = t > 0.82 ? 1 - (t - 0.82) / 0.18 : Math.min(1, b.life / 0.08)
      // FATALITY treme depois de aterrissar
      const shake = b.kind === 'fatality' && b.life > 0.42 && b.life < 1.14
        ? Math.sin(b.life * 62) * size * 0.05 : 0
      const y = b.kind === 'banner' ? this.ch * 0.30 : this.ch * 0.46
      const fam = big
        ? '"Bebas Neue", Impact, "Arial Black", sans-serif'
        : "'Bricolage Grotesque', system-ui, sans-serif"

      c.save()
      c.globalAlpha = Math.max(0, alpha)
      c.translate(this.cw / 2 + shake, y)
      c.scale(sc, sc)
      if (b.kind === 'fatality') c.rotate(-0.035)
      c.font = `800 ${size}px ${fam}`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.lineJoin = 'round'
      // contorno grosso no lugar de sombra borrada: lê igual e não custa blur
      c.lineWidth = size * 0.13
      c.strokeStyle = b.kind === 'parry' ? '#0d4f74' : b.kind === 'fatality' ? '#2a0000' : 'rgba(0,0,0,0.72)'
      c.strokeText(b.text, 0, 0)
      c.fillStyle = b.kind === 'fatality' ? '#4a0000' : 'rgba(0,0,0,0.45)'
      c.fillText(b.text, 0, size * 0.07)
      c.fillStyle = b.color
      c.fillText(b.text, 0, 0)
      c.restore()
    }
    c.globalAlpha = 1
  }

  private step(dt: number) {
    this.targetFlash = Math.max(0, this.targetFlash - dt * 1.6)
    if (this.bigs.length) {
      const live: Big[] = []
      for (const b of this.bigs) { b.life += dt; if (b.life < b.max) live.push(b) }
      this.bigs = live
    }
    this.time += dt
    for (const f of this.faces) f.update(dt, this.tension, false)
    if (this.pops.length) {
      const alive: Pop[] = []
      for (const e of this.pops) { e.life += dt; if (e.life < e.max) alive.push(e) }
      this.pops = alive
    }
    this.trauma = Math.max(0, this.trauma - dt * 2.2)
    this.squash.k = Math.max(0, this.squash.k - dt * 0.85)
    if (this.wallHits.length) {
      const live: typeof this.wallHits = []
      for (const h of this.wallHits) { h.life += dt; if (h.life < 0.5) live.push(h) }
      this.wallHits = live
    }
    if (this.scorch.length) {
      const live: { x: number; r: number; life: number }[] = []
      for (const sc of this.scorch) { sc.life += dt; if (sc.life < 14) live.push(sc) }
      this.scorch = live
    }
    if (this.skids.length) {
      const live: typeof this.skids = []
      for (const k of this.skids) { k.life += dt; if (k.life < 5) live.push(k) }
      this.skids = live
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
    const d = this.scene.d2
    const horizon = this.oy + d.horizon * this.scale
    const shore = this.oy + d.shore * this.scale
    for (const b of this.bands) { c.fillStyle = b.c; c.fillRect(0, b.y, this.cw, b.h) }

    if (d.star && d.stars) {
      for (const sp of this.specks) {
        const tw = 0.55 + Math.sin(this.time * 1.7 + sp.seed) * 0.45
        c.globalAlpha = tw
        c.fillStyle = d.star
        c.fillRect(sp.x * this.cw, sp.y * horizon, sp.r * this.scale + 0.6, sp.r * this.scale + 0.6)
      }
      c.globalAlpha = 1
    }

    if (d.orb) {
      const ox = this.cw * d.orb.x, oy = horizon - d.orb.y * this.scale
      const r = d.orb.r * this.scale
      const halo = c.createRadialGradient(ox, oy, r * 0.8, ox, oy, r * 3.4)
      halo.addColorStop(0, d.orb.halo)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = halo
      c.beginPath(); c.arc(ox, oy, r * 3.4, 0, Math.PI * 2); c.fill()
      c.beginPath(); c.arc(ox, oy, r, 0, Math.PI * 2)
      c.fillStyle = d.orb.color; c.fill()
      // à noite a lua ganha crateras: sem isso ela vira um sol branco
      if (this.scene.night) {
        c.fillStyle = 'rgba(150,152,170,0.5)'
        for (const [cx, cy, cr] of [[-0.32, -0.2, 0.2], [0.24, 0.1, 0.26], [-0.05, 0.42, 0.15], [0.4, -0.36, 0.12]]) {
          c.beginPath(); c.arc(ox + cx * r, oy + cy * r, cr * r, 0, Math.PI * 2); c.fill()
        }
      }
    }

    if (d.cloud && d.clouds) {
      c.fillStyle = d.cloud
      const clouds = this.lite ? Math.min(2, d.clouds) : d.clouds
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
    }

    if (d.hills) {
      c.fillStyle = d.hills
      for (const [hx, hw, hh] of [[0.16, 0.20, 52], [0.30, 0.14, 34], [0.66, 0.24, 44]] as [number, number, number][]) {
        c.beginPath()
        c.moveTo((hx - hw / 2) * this.cw, horizon)
        c.quadraticCurveTo(hx * this.cw, horizon - hh * this.scale, (hx + hw / 2) * this.cw, horizon)
        c.fill()
      }
    }

    this.paintDepth(false)

    if (this.scene.id === 'ginasio') this.hall(horizon, shore)

    if (d.foam) {
      c.fillStyle = d.foam
      const rows = this.lite ? 2 : 4
      for (let i = 0; i < rows; i++) {
        const y = horizon + (i + 1) * ((shore - horizon) / 5.5)
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
      c.fillRect(0, shore - 6 * fs, this.cw, 3 * fs)
      c.fillStyle = this.scene.night ? 'rgba(198,216,255,0.55)' : 'rgba(255,255,255,0.80)'
      c.fillRect(0, shore - 3 * fs, this.cw, 3.5 * fs)
      c.fillStyle = 'rgba(255,255,255,0.30)'
      c.fillRect(0, shore + 0.5 * fs, this.cw, 2.5 * fs)
    }

    // caminho da lua na água: é o que diz que a cena é noturna e não só escura
    if (this.scene.night && d.orb) {
      const ox = this.cw * d.orb.x
      c.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 9; i++) {
        const t = i / 8
        const y = horizon + (shore - horizon) * t
        const w = (14 + t * 90) * this.scale * (0.7 + Math.sin(this.time * 1.3 + i) * 0.3)
        c.globalAlpha = 0.1 * (1 - t * 0.5)
        c.fillStyle = '#cfe0ff'
        c.fillRect(ox - w, y, w * 2, 2.4 * this.scale)
      }
      c.globalCompositeOperation = 'source-over'
      c.globalAlpha = 1
    }

    if (this.scene.id === 'luau') this.bonfire(shore)

    if (d.wash) { c.fillStyle = d.wash; c.fillRect(0, 0, this.cw, this.ch) }
  }

  /** Ginásio: arquibancada em degraus, cabeças e refletores no lugar do céu. */
  private hall(horizon: number, shore: number) {
    const c = this.ctx
    const S = this.scale

    // refletores no teto, com cone de luz descendo até a quadra
    for (const fx of [0.18, 0.5, 0.82]) {
      const x = this.cw * fx
      c.fillStyle = '#12151f'
      c.fillRect(x - 22 * S, 0, 44 * S, 26 * S)
      c.fillStyle = 'rgba(255,246,214,0.95)'
      c.beginPath(); c.ellipse(x, 26 * S, 20 * S, 7 * S, 0, 0, Math.PI * 2); c.fill()
      const g = c.createLinearGradient(x, 26 * S, x, shore)
      g.addColorStop(0, 'rgba(255,244,206,0.16)')
      g.addColorStop(1, 'rgba(255,244,206,0)')
      c.fillStyle = g
      c.beginPath()
      c.moveTo(x - 20 * S, 26 * S); c.lineTo(x + 20 * S, 26 * S)
      c.lineTo(x + 210 * S, shore); c.lineTo(x - 210 * S, shore)
      c.closePath(); c.fill()
    }

    // faixa de patrocínio na parede do fundo
    c.fillStyle = 'rgba(220,60,72,0.85)'
    c.fillRect(0, horizon - 40 * S, this.cw, 26 * S)
    c.fillStyle = 'rgba(255,255,255,0.9)'
    c.font = `700 ${Math.max(9, 15 * S)}px system-ui, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let i = -1; i < 6; i++) {
      const x = ((i * 0.2 + this.time * 0.01) % 1.2 - 0.1) * this.cw
      c.fillText('BLOBBY LEAGUE', x, horizon - 27 * S)
    }
    c.textAlign = 'left'
    c.textBaseline = 'alphabetic'

    // arquibancada: cada degrau é espelho (torcida) + piso + frente escura
    const rows = this.lite ? 4 : 6
    const top = horizon - 6 * S
    const bot = shore - 3 * S
    const h = (bot - top) / rows
    for (let r = 0; r < rows; r++) {
      const y = top + h * r
      c.fillStyle = `hsl(226,20%,${13 + r * 2.4}%)`
      c.fillRect(0, y, this.cw, h + 1)

      const step = (17 + r * 1.6) * S
      const headR = (5.2 + r * 0.7) * S
      const base = y + h - headR * 1.15
      for (let i = -1, x = -step; x < this.cw + step; i++, x += step) {
        const seed = Math.sin(x * 0.083 + r * 4.7) * 0.5 + 0.5
        if (seed < 0.16) continue
        const bob = Math.sin(this.time * (1.6 + seed * 1.6) + i * 0.9 + r) * 2.4 * S
        const cx = x + step * 0.5 + (seed - 0.5) * step * 0.3
        const cy = base + bob
        const light = 30 + r * 3.5
        c.fillStyle = `hsl(${Math.floor(seed * 359)},42%,${light - 8}%)`
        c.beginPath()
        c.ellipse(cx, cy + headR * 1.25, headR * 1.35, headR * 1.1, 0, Math.PI, 0)
        c.fill()
        c.fillStyle = `hsl(${Math.floor(seed * 359)},44%,${light}%)`
        c.beginPath(); c.arc(cx, cy, headR, 0, Math.PI * 2); c.fill()
      }

      c.fillStyle = 'rgba(8,10,18,0.55)'
      c.fillRect(0, y + h - 2.2 * S, this.cw, 2.2 * S)
    }

    // guarda-corpo na frente da arquibancada
    c.strokeStyle = 'rgba(190,204,230,0.5)'
    c.lineWidth = 2 * S
    c.beginPath(); c.moveTo(0, shore - 6 * S); c.lineTo(this.cw, shore - 6 * S); c.stroke()
  }

  /** Fogueira do luau: pisca e joga cor quente na areia perto dela. */
  private bonfire(shore: number) {
    const c = this.ctx
    const S = this.scale
    const x = this.cw * 0.14
    const y = shore + 26 * S
    const flick = 0.75 + Math.sin(this.time * 9.3) * 0.15 + Math.sin(this.time * 21.7) * 0.1

    c.globalCompositeOperation = 'lighter'
    const gr = 120 * S * flick
    c.globalAlpha = 0.5
    c.drawImage(this.glow, x - gr, y - gr * 0.75, gr * 2, gr * 1.5)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'

    c.fillStyle = '#3a2a1c'
    for (const a of [-0.5, 0.1, 0.7]) {
      c.save(); c.translate(x, y); c.rotate(a)
      c.fillRect(-17 * S, -2.5 * S, 34 * S, 5 * S)
      c.restore()
    }
    for (const [h, w, col] of [[34, 13, '#ff8a2b'], [22, 8, '#ffd05a'], [12, 4, '#fff2c4']] as [number, number, string][]) {
      c.fillStyle = col
      c.beginPath()
      c.moveTo(x - w * S * flick, y)
      c.quadraticCurveTo(x - w * 0.4 * S, y - h * S * flick, x, y - h * S * flick * 1.25)
      c.quadraticCurveTo(x + w * 0.4 * S, y - h * S * flick, x + w * S * flick, y)
      c.closePath(); c.fill()
    }
  }

  /**
   * Camada da frente: passa por cima de tudo, inclusive dos blobs. É o que dá
   * profundidade — sem nada na frente a quadra parece um adesivo.
   */
  private foreground(dt: number) {
    const c = this.ctx
    const kind = this.scene.fg
    for (let i = 0; i < this.fg.length; i++) {
      const f = this.fg[i]
      f.x += f.vx * dt
      f.y += f.vy * dt
      if (kind === 'confetti' || kind === 'pixels') {
        if (f.y > 1.2) { this.fg[i] = this.spawnFg(-0.2); continue }
      } else if (kind === 'gulls' || kind === 'birds' || kind === 'dust') {
        if (f.x < -0.3 || f.x > 1.45) { this.fg[i] = this.spawnFg(); continue }
      } else if (kind === 'rain') {
        if (f.y > 1.2) { this.fg[i] = this.spawnFg(-0.25); continue }
      } else if (kind === 'sparks' || kind === 'bubbles') {
        if (f.y < -0.2) { this.fg[i] = this.spawnFg(); continue }
      } else {
        f.x += Math.sin(this.time * 0.7 + f.seed) * 0.0016
        f.y += Math.cos(this.time * 0.9 + f.seed * 1.7) * 0.0012
        if (f.x < -0.1 || f.x > 1.1 || f.y < 0.1 || f.y > 1.1) { this.fg[i] = this.spawnFg(); continue }
      }
      const x = f.x * this.cw, y = f.y * this.ch
      const s = f.s * this.scale

      if (kind === 'confetti') {
        const spin = this.time * 6 + f.seed
        c.save()
        c.translate(x, y)
        c.rotate(spin)
        c.scale(1, Math.max(0.15, Math.abs(Math.sin(spin * 0.8))))
        c.fillStyle = `hsl(${Math.floor((f.seed * 57) % 360)},85%,62%)`
        c.fillRect(-5.5 * s, -3 * s, 11 * s, 6 * s)
        c.restore()
      } else if (kind === 'fireflies') {
        const pulse = 0.35 + Math.sin(this.time * 3.1 + f.seed) * 0.35 + 0.3
        const r = 13 * s * pulse
        c.globalCompositeOperation = 'lighter'
        c.globalAlpha = pulse * 0.75
        c.drawImage(this.glow, x - r, y - r, r * 2, r * 2)
        c.globalAlpha = 1
        c.globalCompositeOperation = 'source-over'
        c.fillStyle = '#d8ff9a'
        c.beginPath(); c.arc(x, y, 1.7 * s, 0, Math.PI * 2); c.fill()
      } else if (kind === 'rain') {
        c.strokeStyle = 'rgba(198,224,255,0.5)'
        c.lineWidth = 1.6 * s
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(x - 3 * s, y + 26 * s)
        c.stroke()
      } else if (kind === 'sparks') {
        const pulse = 0.4 + Math.abs(Math.sin(this.time * 5 + f.seed)) * 0.6
        const r = 9 * s * pulse
        c.globalCompositeOperation = 'lighter'
        c.globalAlpha = pulse * 0.8
        c.drawImage(this.glow, x - r, y - r, r * 2, r * 2)
        c.globalAlpha = 1
        c.globalCompositeOperation = 'source-over'
      } else if (kind === 'bubbles') {
        c.strokeStyle = 'rgba(220,246,255,0.55)'
        c.lineWidth = 1.6 * s
        c.beginPath()
        c.arc(x + Math.sin(this.time * 1.4 + f.seed) * 5 * s, y, 5.5 * s, 0, Math.PI * 2)
        c.stroke()
      } else if (kind === 'dust') {
        c.strokeStyle = 'rgba(226,196,140,0.4)'
        c.lineWidth = 1.4 * s
        c.beginPath()
        c.moveTo(x, y); c.lineTo(x + 22 * s, y)
        c.stroke()
      } else if (kind === 'pixels') {
        c.fillStyle = 'rgba(155,188,15,0.35)'
        const q = 5 * s
        c.fillRect(Math.round(x / q) * q, Math.round(y / q) * q, q, q)
      } else {
        const flap = Math.sin(this.time * 7 + f.seed) * 0.55
        const dir = f.vx > 0 ? 1 : -1
        const far = kind === 'birds' ? 0.55 : 1
        c.strokeStyle = kind === 'birds' ? 'rgba(24,26,40,0.32)' : 'rgba(28,32,44,0.5)'
        c.lineWidth = 3.4 * s * far
        c.lineCap = 'round'
        c.beginPath()
        c.moveTo(x - 15 * s * far * dir, y + flap * 9 * s * far)
        c.quadraticCurveTo(x, y - 5 * s * far, x + 15 * s * far * dir, y + flap * 9 * s * far)
        c.stroke()
      }
    }
  }

  setBeat(bar: number, beat: number) {
    this.audioBar = bar
    this.audioBeat = beat
  }

  setLook(side: Side, look: PlayerLook) {
    this.looks[side] = look
    this.fills[side] = bodyHex(look)
    this.darks[side] = shade(this.fills[side], 0.55)
  }

  private fill(p: Side) { return this.fills[p] }
  private dark(p: Side) { return this.darks[p] }

  private blob(p: Side, x: number, y: number, state: number, ball: { x: number; y: number },
               stunned: boolean, cr: number, dive = 0, dvDir = 0) {
    if (this.off(p)) return
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

    // Mergulho não é o blob tombado: é um bote. O corpo fica pra trás e baixo,
    // a cabeça vai pra frente, e os braços saem na frente dela como a prancha
    // do vôlei. A cara quase não gira — girar a cara foi o que ficou horrível.
    const d = dvDir
    const dk = dive
    const bkx = x - d * 20 * dk
    const bky = ly + 13 * dk
    const brx = rl * (1 + 0.42 * dk)
    const bry = rl * (1 - 0.3 * dk)
    const hdx = d * 30 * dk
    const hdy = 22 * dk
    const tilt = d * 0.3 * dk

    if (dk > 0.01) this.diveGhosts(p, x + hdx, uy + hdy, ru, bkx, bky, brx, bry, d, dk)

    // corpo
    c.beginPath()
    c.ellipse(bkx, bky, brx, bry, d * 0.22 * dk, 0, Math.PI * 2)
    c.fillStyle = this.fill(p)
    c.fill()

    // tronco ligando corpo e cabeça: sem isso viram duas bolas soltas no ar
    if (dk > 0.01) {
      c.beginPath()
      c.moveTo(bkx, bky - bry * 0.85)
      c.lineTo(x + hdx, uy + hdy - ru * 0.8)
      c.lineTo(x + hdx, uy + hdy + ru * 0.8)
      c.lineTo(bkx, bky + bry * 0.7)
      c.closePath()
      c.fill()
    }

    c.save()
    c.translate(hdx, hdy)
    c.translate(x, uy); c.rotate(tilt); c.translate(-x, -uy)

    // braços na frente da cabeça: um bloco só, igual antebraço colado no vôlei
    if (dk > 0.01) {
      const ax = x + d * ru * 0.55
      const ay = uy + ru * 0.5
      const len = ru * (0.5 + 1.5 * dk)
      c.save()
      c.translate(ax, ay)
      c.rotate(d * 0.34)
      c.beginPath()
      c.ellipse(d * len * 0.5, 0, len * 0.62, ru * 0.34, 0, 0, Math.PI * 2)
      c.fillStyle = this.fill(p)
      c.fill()
      c.beginPath()
      c.ellipse(d * len, 0, ru * 0.3, ru * 0.3, 0, 0, Math.PI * 2)
      c.fillStyle = this.dark(p)
      c.globalAlpha = 0.85
      c.fill()
      c.globalAlpha = 1
      c.restore()
    }

    const fac = p === LEFT ? 1 : -1
    drawHair2D(c, x, uy, ru, this.looks[p], fac, true)

    c.beginPath()
    c.arc(x, uy, ru, 0, Math.PI * 2)
    c.fillStyle = this.fill(p)
    c.fill()

    c.beginPath()
    c.arc(x - ru * 0.34, uy - ru * 0.3, ru * 0.42, 0, Math.PI * 2)
    c.fillStyle = 'rgba(255,255,255,0.30)'
    c.fill()

    const rig = this.faces[p]
    const f = rig.cur
    const lid = Math.max(0.05, Math.min(1.6, f.lid * (0.08 + rig.blink * 0.92)))
    const line = '#171420'

    let ax = ball.x - x, ay = ball.y - uy
    const alen = Math.max(1, Math.hypot(ax, ay))
    const amp = Math.min(1, alen / 260) * ru * 0.095
    ax = (ax / alen) * amp
    ay = (ay / alen) * amp

    const lk = Math.min(1, Math.max(0, (lid - 0.30) / 0.28))
    const kk = lk * lk * (3 - 2 * lk)
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

    drawHair2D(c, x, uy, ru, this.looks[p], fac, false)

    c.restore()
    if (stunned) c.restore()
  }

  /**
   * Fantasmas do mergulho: duas cópias esmaecidas atrás do corpo. Custa duas
   * elipses e é o que transforma o salto em movimento em vez de teleporte.
   */
  private diveGhosts(p: Side, hx: number, hy: number, ru: number,
                     bx: number, by: number, brx: number, bry: number, d: number, k: number) {
    const c = this.ctx
    c.fillStyle = this.fill(p)
    for (let i = 1; i <= 2; i++) {
      const back = i * 26 * k
      c.globalAlpha = 0.2 / i
      c.beginPath()
      c.ellipse(bx - d * back, by, brx * (1 - i * 0.09), bry * (1 - i * 0.09), 0, 0, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.ellipse(hx - d * back, hy, ru * (1 - i * 0.12), ru * (1 - i * 0.12), 0, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
  }

  /**
   * As paredes existem na física desde sempre; aqui elas só param de ser
   * invisíveis. O brilho no ponto da batida diz onde a bola bateu.
   */
  private walls() {
    if (!this.wallsOn) return
    const c = this.ctx
    const top = 108
    const bot = GROUND + 44
    for (const x of [LEFT_PLANE, RIGHT_PLANE]) {
      const inner = x === LEFT_PLANE ? 1 : -1
      const face = x + inner * 34

      const g = c.createLinearGradient(x, top, face, top)
      g.addColorStop(0, 'rgba(176,216,255,0.34)')
      g.addColorStop(0.45, 'rgba(176,216,255,0.10)')
      g.addColorStop(1, 'rgba(176,216,255,0)')
      c.fillStyle = g
      c.fillRect(Math.min(x, face), top, 34, bot - top)

      // travessas: sem elas a faixa vira só um degradê e some contra o céu
      c.strokeStyle = 'rgba(214,238,255,0.34)'
      c.lineWidth = 1.6
      c.beginPath()
      for (let y = top + 14; y < bot; y += 34) {
        c.moveTo(x + inner * 2, y); c.lineTo(x + inner * 19, y)
      }
      c.stroke()

      // a aresta é o que a bola bate: é a linha que tem que ler de longe
      c.strokeStyle = 'rgba(238,248,255,0.80)'
      c.lineWidth = 3
      c.beginPath(); c.moveTo(x + inner * 1.5, top); c.lineTo(x + inner * 1.5, bot); c.stroke()

      c.fillStyle = 'rgba(238,248,255,0.55)'
      c.beginPath()
      c.ellipse(x + inner * 1.5, top, 5, 5, 0, 0, Math.PI * 2)
      c.fill()

      // pé na areia: fecha a quadra no chão
      c.fillStyle = 'rgba(58,78,104,0.40)'
      c.beginPath()
      c.ellipse(x + inner * 3, bot, 15, 5, 0, 0, Math.PI * 2)
      c.fill()
    }

    for (const h of this.wallHits) {
      const k = Math.max(0, 1 - h.life / 0.5)
      if (k <= 0) continue
      const inner = h.x === LEFT_PLANE ? 1 : -1
      const half = 34 + (1 - k) * 46
      c.globalAlpha = k * 0.7
      const g = c.createLinearGradient(h.x, h.y, h.x + inner * 58, h.y)
      g.addColorStop(0, 'rgba(255,240,200,0.95)')
      g.addColorStop(1, 'rgba(255,240,200,0)')
      c.fillStyle = g
      c.fillRect(Math.min(h.x, h.x + inner * 58), h.y - half, 58, half * 2)
      c.strokeStyle = '#fff3c8'
      c.lineWidth = 5 * k + 1.5
      c.beginPath(); c.moveTo(h.x + inner * 1.5, h.y - half); c.lineTo(h.x + inner * 1.5, h.y + half); c.stroke()
      c.globalAlpha = 1
    }
  }

  /** Anel dourado: especial pronto e a bola dentro dele sai voando. */
  /** Alcance do especial: brilho difuso, não linha. E só com o especial pronto. */
  private reach(x: number, y: number, special: boolean) {
    if (!special) return
    const c = this.ctx
    const cy = y - BLOBBY_UPPER_SPHERE
    const ro = SPECIAL_REACH * 1.05
    c.globalAlpha = 0.86 + Math.sin(this.time * 2.6) * 0.14
    c.drawImage(this.reachGlow, x - ro, cy - ro, ro * 2, ro * 2)
    c.globalAlpha = 1
  }

  /** Marca do corpo arrastado: fica na areia depois que o blobby já levantou. */
  private skidMarks() {
    const c = this.ctx
    for (const k of this.skids) {
      const fade = Math.max(0, 1 - k.life / 5)
      c.globalAlpha = 0.34 * fade
      c.fillStyle = this.scene.d2.sandDark
      c.beginPath()
      c.ellipse(k.x, GROUND + 9, 62, 7, 0, 0, Math.PI * 2)
      c.fill()
      c.globalAlpha = 0.22 * fade
      c.fillStyle = this.scene.d2.sandDark
      c.beginPath()
      c.ellipse(k.x - k.dir * 16, GROUND + 8, 34, 4, 0, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
  }

  /** Linhas de velocidade atrás do mergulho: é o que faz o salto parecer rápido. */
  private diveStreak(x: number, y: number, dir: number, k: number) {
    const c = this.ctx
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = 'rgba(255,252,236,0.5)'
    c.lineCap = 'round'
    for (let i = 0; i < 4; i++) {
      const oy = (i - 1.5) * 13
      c.globalAlpha = (0.42 - i * 0.05) * k
      c.lineWidth = 5 - i * 0.8
      c.beginPath()
      c.moveTo(x - dir * (26 + i * 9), y + oy)
      c.lineTo(x - dir * (86 + i * 22), y + oy * 1.2)
      c.stroke()
    }
    c.restore()
    c.globalAlpha = 1
  }

  private drawBall(x: number, y: number, rot: number) {
    const c = this.ctx
    c.save()
    c.translate(x, y)
    const k = this.squash.k
    if (k > 0.001) {
      c.rotate(this.squash.ang)
      c.scale(1 - k * 0.55, 1 + k * 0.55)
      c.rotate(-this.squash.ang)
    }
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
    crouchMoods(this.faces, match.world.crouch)
    reachMoods(this.faces, match.world, match.logic.isBallValid)
    this.step(dt)
    this.tension += (rallyTension(match.logic.rally) - this.tension) * Math.min(1, dt * 2.2)
    const c = this.ctx
    const p = this.prev, q = this.cur
    const lerp = (a: number, b: number) => a + (b - a) * alpha
    const bx = lerp(p.bx, q.bx), by = lerp(p.by, q.by), rot = lerp(p.rot, q.rot)
    const w = match.world
    const half = RIGHT_PLANE / 2
    const far = this.wallsOn ? 0 : Math.max(
      Math.abs(w.ballX - NET_POSITION_X), Math.abs(w.blobX[LEFT] - NET_POSITION_X),
      Math.abs(w.blobX[RIGHT] - NET_POSITION_X)) - half
    const want = Math.max(0, Math.min(OPEN_MARGIN, far + 24))
    this.frameExtra += (want - this.frameExtra) * (1 - Math.exp(-dt * (want > this.frameExtra ? 5.5 : 1.4)))
    this.applyFrame()
    // o 3D passeia a câmera atrás da bola e balança de leve parado; aqui a
    // quadra é fixa, então o mesmo passeio vira só este número
    const panWant = Math.max(-0.107, Math.min(0.107, ((bx - NET_POSITION_X) / (RIGHT_PLANE / 2)) * 0.196))
    this.pan += (panWant - this.pan) * (1 - Math.exp(-dt * 3.2))
    this.sway = Math.sin(this.time * 0.31) * 0.0149 + Math.sin(this.time * 0.17) * 0.0082
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

    c.strokeStyle = this.scene.d2.line
    c.lineWidth = 3
    c.beginPath()
    c.moveTo(20, GROUND + 44); c.lineTo(RIGHT_PLANE - 20, GROUND + 44)
    c.stroke()

    this.walls()

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

    this.skidMarks()
    this.targetMark()

    this.shadow(bx, by, BALL_RADIUS)
    for (const s of [0, 1] as Side[]) {
      if (this.off(s)) continue
      this.shadow(lerp(p.px[s], q.px[s]), lerp(p.py[s], q.py[s]), BLOBBY_LOWER_RADIUS)
    }

    for (const s of [0, 1] as Side[]) {
      const sx = lerp(p.px[s], q.px[s]), sy = lerp(p.py[s], q.py[s])
      if (!this.off(s) && w.stun[s] === 0) this.reach(sx, sy, w.charge[s] >= SPECIAL_FULL)
      if (w.digActive[s] > 0) this.digSwipe(s, sx, sy, w.digActive[s] / DIG_WINDOW)
      const air = w.diveFrames[s] > 0
      const target = air ? 1 : Math.min(1, w.diveRecover[s] / (DIVE_RECOVER * 0.7))
      const rate = target > this.diveK[s] ? 15 : 6.5
      this.diveK[s] += (target - this.diveK[s]) * (1 - Math.exp(-dt * rate))
      if (this.diveK[s] < 0.002) this.diveK[s] = 0
      const dive = this.diveK[s]
      if (air) this.diveStreak(sx, sy - BLOBBY_UPPER_SPHERE * 0.5, w.diveDir[s], 1)
      this.blob(s, sx, sy, lerp(p.st[s], q.st[s]), { x: bx, y: by }, w.stun[s] > 0, w.crouch[s],
        dive, w.diveDir[s])
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
      const sparks = this.lite ? 3 : 7
      for (let i = 0; i < sparks; i++) {
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

    c.setTransform(1, 0, 0, 1, 0, 0)
    this.paintDepth(true)
    this.foreground(dt)

    if (this.flash > 0.001) {
      c.fillStyle = `rgba(255,255,255,${this.flash})`
      c.fillRect(0, 0, this.cw, this.ch)
    }
    this.drawBigs()
  }

  dispose() {
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
