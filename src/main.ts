import './ui/style.css'
import * as THREE from 'three'
import { LEFT, RIGHT, TICK_MS, NO_PLAYER } from './core/constants.ts'
import type { Side } from './core/constants.ts'
import { Match } from './core/match.ts'
import { getRules } from './core/logic.ts'
import { packInput, NO_INPUT } from './core/input.ts'
import type { PlayerInput } from './core/input.ts'
import { Bot } from './ai/bot.ts'
import { Stage, QUALITY_PRESETS } from './render/stage.ts'
import { Hud } from './ui/hud.ts'
import { Menu, DEFAULT_CONFIG } from './ui/menu.ts'
import type { GameConfig } from './ui/menu.ts'
import { InputManager, P1, P2, SOLO } from './ui/input.ts'
import { NetSession } from './net/session.ts'
import { createManualTransport, createRoomTransport } from './net/transport.ts'
import { el } from './ui/dom.ts'

type Phase = 'menu' | 'playing' | 'paused' | 'over'

const isTouch = matchMedia('(pointer: coarse)').matches

class App {
  ui = document.getElementById('ui') as HTMLElement
  canvas = document.getElementById('gl') as HTMLCanvasElement
  stage: Stage
  hud: Hud
  menu: Menu
  input = new InputManager()
  cfg: GameConfig

  phase: Phase = 'menu'
  match: Match | null = null
  bot: Bot | null = null
  session: NetSession | null = null
  localSide: Side = LEFT

  private acc = 0
  private last = performance.now()
  private lastSend = 0
  private touchEls: HTMLElement | null = null

  constructor() {
    const savedQ = localStorage.getItem('bv.quality') as GameConfig['quality'] | null
    const savedName = localStorage.getItem('bv.name')
    this.cfg = { ...DEFAULT_CONFIG }
    if (savedQ && QUALITY_PRESETS[savedQ]) this.cfg.quality = savedQ
    if (savedName) this.cfg.name = savedName

    this.stage = new Stage(this.canvas, QUALITY_PRESETS[this.cfg.quality])
    this.hud = new Hud(this.ui)
    this.hud.root.style.opacity = '0'

    this.menu = new Menu(this.ui, this.cfg, {
      onStart: c => this.startLocal(c),
      onJoinRoom: (code, c) => void this.joinRoom(code, c),
      onManual: (host, c) => this.startManual(host, c),
      onResume: () => this.resume(),
      onQuit: () => this.quitToMenu(),
    })

    this.input.onPause = () => {
      if (this.phase === 'playing') this.pause()
      else if (this.phase === 'paused') this.resume()
    }

    this.buildTouch()
    addEventListener('resize', () => this.resize())
    this.resize()

    // idle demo match behind the menu
    this.startDemo()
    requestAnimationFrame(t => this.loop(t))
  }

  private resize() {
    this.stage.setSize(innerWidth, innerHeight)
  }

  private buildTouch() {
    if (!isTouch) return
    const mk = (label: string, key: 'left' | 'right' | 'up', big = false) => {
      const b = el('div', { class: `tbtn${big ? ' big' : ''}`, textContent: label })
      const on = (v: boolean) => (e: Event) => {
        e.preventDefault()
        this.input.touch[key] = v
        b.classList.toggle('press', v)
      }
      b.addEventListener('touchstart', on(true), { passive: false })
      b.addEventListener('touchend', on(false), { passive: false })
      b.addEventListener('touchcancel', on(false), { passive: false })
      return b
    }
    this.touchEls = el('div', { class: 'touch' },
      el('div', { class: 'tpad' }, mk('◀', 'left'), mk('▶', 'right')),
      el('div', { class: 'tpad' }, mk('▲', 'up', true)))
    this.ui.append(this.touchEls)
  }

  private setTouchVisible(v: boolean) {
    this.touchEls?.classList.toggle('on', v && isTouch)
  }

  // ---------- lifecycle ----------

  private newMatch(cfg: GameConfig, serving: Side = LEFT) {
    const m = new Match(cfg.ruleId, cfg.scoreToWin, serving)
    const r = getRules(cfg.ruleId)
    this.hud.setRule(r.name, m.logic.scoreToWin)
    this.stage.capture(m)
    this.stage.capture(m)
    return m
  }

  private startDemo() {
    this.match = this.newMatch(this.cfg, LEFT)
    this.bot = new Bot(RIGHT, 'normal', 4242)
    this.demoBot = new Bot(LEFT, 'normal', 777)
    this.phase = 'menu'
  }
  private demoBot: Bot | null = null

  startLocal(cfg: GameConfig) {
    this.cfg = cfg
    localStorage.setItem('bv.name', cfg.name)
    this.closeSession()
    this.demoBot = null
    this.match = this.newMatch(cfg, LEFT)
    this.localSide = LEFT
    this.bot = cfg.mode === 'bot' ? new Bot(RIGHT, cfg.difficulty, (Math.random() * 1e9) | 0) : null
    this.hud.setNames(cfg.mode === 'bot' ? 'VOCÊ' : 'P1', cfg.mode === 'bot' ? 'CPU' : 'P2')
    this.hud.showNet(null)
    this.begin()
  }

  private begin() {
    this.phase = 'playing'
    this.menu.hide()
    this.hud.root.style.opacity = '1'
    this.setTouchVisible(true)
    this.acc = 0
    this.last = performance.now()
    this.hud.banner('VAI!', 700, '#ffd257')
  }

  pause() {
    if (this.session) return
    this.phase = 'paused'
    this.menu.pause()
    this.setTouchVisible(false)
  }

  resume() {
    this.phase = 'playing'
    this.menu.hide()
    this.setTouchVisible(true)
    this.last = performance.now()
    this.acc = 0
  }

  quitToMenu() {
    this.closeSession()
    this.hud.root.style.opacity = '0'
    this.hud.showNet(null)
    this.setTouchVisible(false)
    this.startDemo()
    this.menu.show()
    this.menu.main()
  }

  private closeSession() {
    if (this.session) { try { this.session.close() } catch { /* ignore */ } }
    this.session = null
  }

  // ---------- online ----------

  private async joinRoom(code: string, cfg: GameConfig) {
    this.cfg = cfg
    localStorage.setItem('bv.name', cfg.name)
    this.closeSession()
    try {
      const transport = await createRoomTransport(code || 'BLOBBY', 'nostr')
      this.attachSession(transport, cfg)
      this.menu.status('sala aberta · esperando oponente…')
    } catch (e) {
      this.menu.status(`falha no relay (${String(e).slice(0, 60)})`)
    }
  }

  private startManual(asHost: boolean, cfg: GameConfig) {
    this.cfg = cfg
    this.closeSession()
    const h = createManualTransport(asHost)
    this.attachSession(h.transport, cfg)
    return { local: h.localDescription, accept: h.accept }
  }

  private attachSession(transport: Awaited<ReturnType<typeof createRoomTransport>>, cfg: GameConfig) {
    this.session = new NetSession(transport, {
      ruleId: cfg.ruleId,
      scoreToWin: cfg.scoreToWin,
      name: cfg.name,
      onPhase: (p, info) => {
        if (p === 'handshake') this.menu.status('oponente encontrado · sincronizando…')
        if (p === 'closed') {
          this.menu.status(`conexão encerrada${info ? ` (${info})` : ''}`)
          if (this.phase === 'playing') {
            this.hud.banner('OPONENTE SAIU', 1600, '#ff6b6b')
            setTimeout(() => this.quitToMenu(), 1700)
          }
        }
        if (p === 'desync') this.hud.banner('DESSINCRONIZOU', 1800, '#ff6b6b')
      },
      onReady: s => {
        this.match = s.match!
        const r = getRules(this.cfg.ruleId)
        this.hud.setRule(r.name, this.match.logic.scoreToWin)
        this.localSide = s.localSide
        this.bot = null
        this.demoBot = null
        this.stage.capture(this.match)
        this.stage.capture(this.match)
        this.hud.setNames(
          s.localSide === LEFT ? cfg.name.toUpperCase() : s.peerName.toUpperCase(),
          s.localSide === LEFT ? s.peerName.toUpperCase() : cfg.name.toUpperCase())
        this.begin()
      },
    })
  }

  // ---------- loop ----------

  private readLocalInputs(): [PlayerInput, PlayerInput] {
    if (this.phase !== 'playing') return [NO_INPUT, NO_INPUT]
    if (this.session) {
      const mine = this.input.read(SOLO, 0, true)
      return this.localSide === LEFT ? [mine, NO_INPUT] : [NO_INPUT, mine]
    }
    if (this.bot) return [this.input.read(SOLO, 0, true), NO_INPUT]
    return [this.input.read(P1, 0), this.input.read(P2, 1)]
  }

  private stepSim() {
    const m = this.match
    if (!m) return

    if (this.session?.rollback) {
      const rb = this.session.rollback
      const mine = this.phase === 'playing' ? this.input.read(SOLO, 0, true) : NO_INPUT
      const stepped = rb.advance(packInput(mine))
      const now = performance.now()
      if (now - this.lastSend > 12) { this.session.sendInputs(); this.lastSend = now }
      this.session.maybeSendChecksum()
      if (stepped) {
        this.stage.capture(m)
        this.stage.onEvents(m, m.events)
      }
      return
    }

    let [li, ri] = this.readLocalInputs()
    if (this.demoBot) li = this.demoBot.think(m)
    if (this.bot) ri = this.bot.think(m)
    m.step(li, ri)
    this.stage.capture(m)
    this.stage.onEvents(m, m.events)
  }

  private checkWin() {
    const m = this.match
    if (!m || this.phase !== 'playing') return
    if (m.logic.winner === NO_PLAYER) return
    const w = m.logic.winner as Side
    this.phase = 'over'
    this.stage.celebrate(w)
    const iWon = this.session ? w === this.localSide : (this.bot ? w === LEFT : true)
    const title = this.session || this.bot ? (iWon ? 'VITÓRIA' : 'DERROTA') : (w === LEFT ? 'P1 VENCE' : 'P2 VENCE')
    const color = w === LEFT ? '#ff3b47' : '#3a8cff'
    this.hud.banner(title, 2200, color)
    setTimeout(() => {
      this.setTouchVisible(false)
      this.menu.result(title, `${m.logic.scores[LEFT]} — ${m.logic.scores[RIGHT]}`, color)
    }, 2000)
  }

  private loop(now: number) {
    requestAnimationFrame(t => this.loop(t))
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now

    this.acc += dt * 1000
    let steps = 0
    while (this.acc >= TICK_MS && steps < 8) {
      this.acc -= TICK_MS
      this.stepSim()
      steps++
    }
    if (steps === 8) this.acc = 0

    const m = this.match
    if (m) {
      const alpha = this.acc / TICK_MS
      this.stage.render(m, alpha, dt)
      this.hud.update(m.logic.scores, m.logic.touches, m.logic.servingPlayer)
      this.checkWin()
    }
    if (this.session && this.phase === 'playing') this.hud.showNet(this.session.stats())
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const app = new App()
;(window as unknown as { app: App }).app = app
;(window as unknown as { THREE: typeof THREE }).THREE = THREE
