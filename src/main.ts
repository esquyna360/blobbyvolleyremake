import './ui/style.css'
import * as THREE from 'three'
import { LEFT, RIGHT, TICK_MS, NO_PLAYER, setArena, arenaId } from './core/constants.ts'
import type { Side, ArenaId } from './core/constants.ts'
import { Match } from './core/match.ts'
import { getRules } from './core/logic.ts'
import { packInput, NO_INPUT } from './core/input.ts'
import type { PlayerInput } from './core/input.ts'
import { Bot } from './ai/bot.ts'
import { Stage, QUALITY_PRESETS } from './render/stage.ts'
import type { GameRenderer } from './render/stage.ts'
import { Stage2D } from './render/stage2d.ts'
import { Hud } from './ui/hud.ts'
import { Menu, DEFAULT_CONFIG } from './ui/menu.ts'
import type { GameConfig } from './ui/menu.ts'
import { InputManager, P1, P2, SOLO } from './ui/input.ts'
import { NetSession, passHash } from './net/session.ts'
import { createManualTransport, createRoomTransport, ensureIce, hasTurn, relayHealth } from './net/transport.ts'
import { el } from './ui/dom.ts'
import { syncArena } from './render/mapping.ts'
import { rallyTension } from './render/face.ts'
import { matchKey, reportMatch } from './net/rank.ts'
import { EMOTES } from './core/emote.ts'
import { Ev } from './core/events.ts'
import type { MatchEvent } from './core/events.ts'
import { GameAudio } from './audio/audio.ts'
import { MENU_SONG, SCENES, getScene } from './render/scenes.ts'
import type { SceneId } from './render/scenes.ts'
import { Lobby, openAd } from './net/lobby.ts'
import type { RoomAd } from './net/lobby.ts'
import { LiveHost, Spectator } from './net/spectate.ts'
import { REPLAY_SPEEDS, Recorder, ReplayPlayer } from './core/replay.ts'
import type { ReplayMeta, ReplayMode } from './core/replay.ts'
import { loadReplay, saveLocalReplay, saveOnlineReplay } from './net/replays.ts'
import type { ReplayCard } from './net/replays.ts'

type Phase = 'menu' | 'playing' | 'paused' | 'over'

const isTouch = matchMedia('(pointer: coarse)').matches
const NO_EVENTS: readonly MatchEvent[] = []

const QUALITY_ORDER: GameConfig['quality'][] = ['min', 'cpu', 'low', 'medium', 'high', 'ultra']
const IS_2D = (q: GameConfig['quality']) => q === 'min' || q === 'cpu'

function gpuName(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase()
  } catch { /* ignore */ }
  return ''
}

function makeRenderer(canvas: HTMLCanvasElement, q: GameConfig['quality']): GameRenderer {
  if (!IS_2D(q)) {
    // máquina sem WebGL utilizável não pode ficar na tela preta: cai pro 2D
    try { return new Stage(canvas, QUALITY_PRESETS[q]) } catch (e) { console.warn('sem WebGL, indo pro 2D', e) }
  }
  return new Stage2D(canvas, q === 'min')
}

/** Nunca escolhe acima de medium sozinho: high custa ~24ms/frame até em Apple M. */
function detectQuality(): GameConfig['quality'] {
  const gpu = gpuName()
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return cores <= 4 ? 'min' : 'cpu'
  if (cores <= 4 || mem <= 4) return 'low'
  if (isTouch) return cores >= 8 ? 'medium' : 'low'
  if (/intel|uhd graphics|hd graphics|iris|mali|adreno|vega 3|vega 6/.test(gpu)) return 'low'
  return 'medium'
}

class App {
  ui = document.getElementById('ui') as HTMLElement
  canvas = document.getElementById('gl') as HTMLCanvasElement
  stage: GameRenderer
  hud: Hud
  menu: Menu
  input = new InputManager()
  audio = new GameAudio()
  lobby = new Lobby()
  cfg: GameConfig

  private phaseV: Phase = 'menu'
  /** Trocar de fase liga e desliga o som de fundo: menu é silêncio. */
  get phase(): Phase { return this.phaseV }
  set phase(v: Phase) {
    this.phaseV = v
    this.audio.setPlaying(v !== 'menu')
    this.audio.setPaused(v === 'paused')
    if (v === 'menu') this.audio.setSong(MENU_SONG)
  }
  match: Match | null = null
  bot: Bot | null = null
  session: NetSession | null = null
  spectator: Spectator | null = null
  replay: ReplayPlayer | null = null
  live: LiveHost | null = null
  localSide: Side = LEFT

  private acc = 0
  private last = performance.now()
  private lastSend = 0
  private touchEls: HTMLElement | null = null
  private touchMenu: HTMLElement | null = null
  private touchEmotes: HTMLElement | null = null
  private emoteAt = [0, 0]
  private rec = new Recorder()
  private recMode: ReplayMode = 'bot'
  private recUpTo = -1
  private recBroken = false
  private recSaved = false

  constructor() {
    const savedQ = localStorage.getItem('bv.quality') as GameConfig['quality'] | null
    const savedName = localStorage.getItem('bv.name')
    this.cfg = { ...DEFAULT_CONFIG }
    if (savedQ && (IS_2D(savedQ) || QUALITY_PRESETS[savedQ])) { this.cfg.quality = savedQ; this.userPickedQuality = true }
    else this.cfg.quality = detectQuality()
    if (savedName) this.cfg.name = savedName
    this.cfg.showFps = localStorage.getItem('bv.fps') === '1'
    const savedArena = localStorage.getItem('bv.arena')
    if (savedArena === 'wide' || savedArena === 'default') this.cfg.arena = savedArena
    const savedScene = localStorage.getItem('bv.scene')
    if (savedScene && savedScene in SCENES) this.cfg.scene = savedScene as SceneId
    this.cfg.walls = localStorage.getItem('bv.walls') !== '0'
    setArena(this.cfg.arena)
    syncArena()
    document.body.classList.toggle('lite', IS_2D(this.cfg.quality))

    void ensureIce()
    this.stage = makeRenderer(this.canvas, this.cfg.quality)
    this.stage.setScene(this.cfg.scene)
    this.stage.setWalls(this.cfg.walls)
    this.audio.setScene(!getScene(this.cfg.scene).d3.indoor)
    this.audio.setSong(MENU_SONG)
    this.audio.preload(getScene(this.cfg.scene).music)
    this.hud = new Hud(this.ui)
    this.hud.root.style.opacity = '0'
    this.hud.setFps(this.cfg.showFps)

    this.menu = new Menu(this.ui, this.cfg, {
      onStart: c => this.startLocal(c),
      onScene: id => this.applyScene(id),
      onWalls: on => {
        localStorage.setItem('bv.walls', on ? '1' : '0')
        this.applyWalls(on)
      },
      onCreateRoom: (code, pass, c) => void this.openRoom(code, pass, c),
      onJoinRoom: (code, pass, c) => void this.joinRoom(code, pass, c),
      onManual: (host, c) => this.startManual(host, c),
      onResume: () => this.resume(),
      onQuit: () => this.quitToMenu(),
      getVolume: bus => this.audio.getVolume(bus),
      onVolume: (v, bus) => { this.audio.setVolume(v, bus); this.audio.ui() },
      onQuality: q => this.applyQuality(q, true),
      onFps: on => { localStorage.setItem('bv.fps', on ? '1' : '0'); this.hud.setFps(on) },
      onWatchRooms: cb => this.lobby.watch(cb),
      onWatch: ad => this.watchRoom(ad),
      onWatchReplay: card => void this.watchReplay(card),
      onStopWatch: () => { this.phase = 'menu'; this.leaveWatch(true) },
      onLobbyNet: cb => this.lobby.onNet(cb),
      onLeaveOnline: () => this.closeSession(),
      onRematch: () => this.session?.requestRematch(),
    })

    this.input.onPause = () => {
      if (this.phase === 'playing') this.pause()
      else if (this.phase === 'paused') this.resume()
    }

    this.buildTouch()
    this.bindAudio()
    this.bindEmotes()
    addEventListener('resize', () => this.resize())
    this.resize()

    if (import.meta.env.DEV) (window as unknown as { __g: unknown }).__g = this

    // idle demo match behind the menu
    this.startDemo()
    requestAnimationFrame(t => this.loop(t))
  }

  private userPickedQuality = false
  private fpsAcc = 0
  private fpsFrames = 0
  private autoDrops = 0

  private resize() {
    this.stage.setSize(innerWidth, innerHeight)
  }

  applyQuality(q: GameConfig['quality'], byUser: boolean) {
    if (!IS_2D(q) && !QUALITY_PRESETS[q]) return
    // no 2D o HUD não pode ter blur nem animação infinita por cima do canvas
    document.body.classList.toggle('lite', IS_2D(q))
    this.cfg.quality = q
    if (byUser) { this.userPickedQuality = true; localStorage.setItem('bv.quality', q) }
    const old = this.canvas
    const next = document.createElement('canvas')
    next.id = 'gl'
    old.parentNode!.insertBefore(next, old)
    const prev = this.stage
    let built: GameRenderer
    try {
      built = makeRenderer(next, q)
    } catch (e) {
      console.error('quality switch failed', e)
      next.remove()
      return
    }
    this.canvas = next
    this.stage = built
    prev.dispose()
    old.remove()
    this.stage.setScene(this.cfg.scene)
    this.stage.setWalls(this.cfg.walls)
    this.resize()
    if (this.match) { this.stage.capture(this.match); this.stage.capture(this.match) }
    this.fpsAcc = 0
    this.fpsFrames = 0
  }

  private autoScale(dt: number) {
    if (this.userPickedQuality || this.autoDrops >= 3) return
    this.fpsAcc += dt
    this.fpsFrames++
    if (this.fpsAcc < 2.5) return
    const fps = this.fpsFrames / this.fpsAcc
    this.fpsAcc = 0
    this.fpsFrames = 0
    if (fps >= 52) return
    const i = QUALITY_ORDER.indexOf(this.cfg.quality)
    if (i <= 0) return
    const q = QUALITY_ORDER[i - 1]
    // cair pro 2D é troca de renderer inteira: só quando nem o low segura
    if (q === 'cpu' && fps >= 38) return
    this.autoDrops++
    this.applyQuality(q, false)
    const label = q === 'cpu' ? '2D (CPU)' : q === 'min' ? '2D MÍNIMO' : q.toUpperCase()
    this.hud.banner(`GRÁFICOS → ${label}`, 1600, '#8fd8ff')
  }

  private bindAudio() {
    const wake = () => this.audio.unlock()
    addEventListener('pointerdown', wake)
    addEventListener('keydown', wake)
    this.menu.root.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('button')) this.audio.ui()
    })
    addEventListener('keydown', e => {
      if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
        const v = this.audio.toggle()
        this.hud.banner(v === 'off' ? 'SOM OFF' : 'SOM ON', 900, '#8fd8ff')
      }
    })
  }

  // ---------- emotes ----------

  private bindEmotes() {
    const P1_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']
    const P2_KEYS = ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']
    addEventListener('keydown', e => {
      if (e.repeat || e.target instanceof HTMLInputElement) return
      let id = P1_KEYS.indexOf(e.code)
      if (id >= 0) { this.sendEmote(this.session || this.bot ? this.localSide : LEFT, id); return }
      id = P2_KEYS.indexOf(e.code)
      if (id >= 0 && !this.session && !this.bot) this.sendEmote(RIGHT, id)
    })
  }

  sendEmote(side: Side, id: number) {
    if (this.viewing) return
    if (this.phase !== 'playing' && this.phase !== 'over') return
    const now = performance.now()
    if (now - this.emoteAt[side] < 700) return
    this.emoteAt[side] = now
    if (this.session && side === this.localSide) { this.session.emote(id); return }
    this.playEmote(side, id)
  }

  private playEmote(side: Side, id: number) {
    this.stage.emote(side, id)
    this.audio.emote(id)
  }

  private buildTouch() {
    if (!isTouch) return
    const mk = (label: string, key: 'left' | 'right' | 'up' | 'down', big = false) => {
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
      el('div', { class: 'tpad' }, mk('▼', 'down'), mk('▲', 'up', true)))

    const menu = el('div', { class: 'tmenu', textContent: 'MENU' })
    const openMenu = (e: Event) => {
      e.preventDefault()
      if (this.phase === 'playing') this.pause()
      else if (this.phase === 'paused') this.resume()
    }
    menu.addEventListener('touchstart', openMenu, { passive: false })
    menu.addEventListener('click', openMenu)
    this.touchMenu = menu

    const emotes = el('div', { class: 'temotes' })
    EMOTES.forEach((def, id) => {
      const b = el('div', { class: 'tem', textContent: def.glyph })
      const fire = (e: Event) => {
        e.preventDefault()
        this.sendEmote(this.session || this.bot ? this.localSide : LEFT, id)
      }
      b.addEventListener('touchstart', fire, { passive: false })
      b.addEventListener('click', fire)
      emotes.append(b)
    })
    this.touchEmotes = emotes

    this.ui.append(this.touchEls, menu, emotes)
  }

  private setTouchVisible(v: boolean) {
    const play = v && isTouch && !this.viewing
    this.touchEls?.classList.toggle('on', play)
    this.touchMenu?.classList.toggle('on', v && isTouch)
    this.touchEmotes?.classList.toggle('on', play)
  }

  // ---------- lifecycle ----------

  /** Assistindo ao vivo ou vendo replay: sem input, sem bot, sem gravar. */
  private get viewing() { return !!this.spectator || !!this.replay }

  private newMatch(cfg: GameConfig, serving: Side = LEFT) {
    const m = new Match(cfg.ruleId, cfg.scoreToWin, serving, cfg.walls)
    this.rec.reset()
    this.recUpTo = -1
    this.recBroken = false
    this.recSaved = false
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

  /** Arena é global: troca antes de montar o Match e reconstrói o renderer. */
  private applyArena(id: ArenaId) {
    if (arenaId() === id) return
    setArena(id)
    syncArena()
    this.applyQuality(this.cfg.quality, false)
  }

  /**
   * Paredes são regra da simulação. Trocar no meio de uma partida local vale na
   * hora, mas invalida a gravação: o replay só guarda inputs.
   */
  private applyWalls(on: boolean) {
    this.cfg.walls = on
    this.stage.setWalls(on)
    const m = this.match
    if (m && !this.viewing && !this.session && m.world.walls !== on) {
      m.world.walls = on
      this.recBroken = true
    }
  }

  /** Cenário troca na hora, inclusive no meio da partida: é só pintura e trilha. */
  applyScene(id: SceneId) {
    this.cfg.scene = id
    localStorage.setItem('bv.scene', id)
    const sc = getScene(id)
    this.stage.setScene(id)
    this.audio.setScene(!sc.d3.indoor)
    // no menu quem toca é o tema do menu; o do cenário só entra em partida
    if (this.phase === 'menu') this.audio.preload(sc.music)
    else this.audio.setSong(sc.music)
  }

  startLocal(cfg: GameConfig) {
    this.cfg = cfg
    this.applyScene(cfg.scene)
    localStorage.setItem('bv.name', cfg.name)
    localStorage.setItem('bv.arena', cfg.arena)
    this.applyArena(cfg.arena)
    this.closeSession()
    this.demoBot = null
    this.match = this.newMatch(cfg, LEFT)
    this.localSide = LEFT
    this.bot = cfg.mode === 'bot' ? new Bot(RIGHT, cfg.difficulty, (Math.random() * 1e9) | 0) : null
    this.recMode = cfg.mode === 'bot' ? 'bot' : 'local'
    this.hud.setNames(cfg.mode === 'bot' ? 'VOCÊ' : 'P1', cfg.mode === 'bot' ? 'CPU' : 'P2')
    this.hud.showNet(null)
    this.begin()
  }

  private begin() {
    this.phase = 'playing'
    this.winFrame = -1
    this.peerWantsRematch = false
    clearTimeout(this.joinTimer)
    this.startLive()
    this.menu.release()
    this.menu.hide()
    this.hud.clearFx()
    this.hud.root.style.opacity = '1'
    this.setTouchVisible(true)
    this.acc = 0
    this.last = performance.now()
    this.hud.banner('VAI!', 700, '#ffd257')
  }

  pause() {
    if (this.session) return
    if (this.replay) { this.replay.paused = !this.replay.paused; return }
    if (this.spectator) { this.phase = 'paused'; this.menu.watchPause(); return }
    this.phase = 'paused'
    this.hud.clearFx()
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
    this.leaveWatch(false)
    this.leaveReplay(false)
    this.closeSession()
    this.hud.clearFx()
    this.hud.root.style.opacity = '0'
    this.hud.showNet(null)
    this.setTouchVisible(false)
    this.applyWalls(localStorage.getItem('bv.walls') !== '0')
    this.startDemo()
    this.menu.show()
    this.menu.main()
  }

  private armJoinDiagnostic() {
    clearTimeout(this.joinTimer)
    this.joinTimer = setTimeout(async () => {
      if (this.phase === 'playing') return
      const h = await relayHealth()
      const via = h.kind === 'supabase' ? 'signaling' : `relays ${h.open}/${h.total}`
      this.menu.status(h.open === 0
        ? 'sem conexão com o servidor de signaling — rede bloqueando WebSocket?'
        : hasTurn()
          ? `${via} ok e TURN ativo, mas ninguém apareceu. Confere se o código da sala bate dos dois lados.`
          : `${via} ok, mas o TURN não respondeu — sem ele o 4G/5G não conecta. Testem os dois no Wi-Fi ou usem Criar/Colar convite.`)
    }, 14000) as unknown as number
  }

  private joinTimer = 0

  /** Só o host transmite: a simulação dele é a fonte única pra quem assiste. */
  private startLive() {
    const s = this.session
    if (!s?.opts.host) { this.stopLive(); this.lobby.advertise(null); return }
    this.lobby.advertise({
      ...openAd(this.roomCode, this.cfg.name, getRules(this.cfg.ruleId).name, this.roomPass ? 1 : 0),
      live: 1, foe: s.peerName,
    })
    this.adScore = [-1, -1]
    if (!this.live) {
      this.live = new LiveHost(this.roomCode, () => this.session?.rollback ?? null, () => ({
        rule: this.cfg.ruleId,
        stw: this.match?.logic.scoreToWin ?? 0,
        arena: this.cfg.arena,
        wl: this.cfg.walls,
        nl: s.localSide === LEFT ? this.cfg.name : s.peerName,
        nr: s.localSide === LEFT ? s.peerName : this.cfg.name,
      }))
      this.live.start()
    }
    this.live.reset()
  }

  private stopLive() {
    this.live?.stop()
    this.live = null
  }

  private adScore = [-1, -1]

  private closeSession() {
    clearTimeout(this.joinTimer)
    this.stopLive()
    this.lobby.advertise(null)
    if (this.session) { try { this.session.close() } catch { /* ignore */ } }
    this.session = null
  }

  // ---------- assistir ----------

  watchRoom(ad: RoomAd) {
    this.closeSession()
    this.leaveWatch(false)
    this.bot = null
    this.demoBot = null
    this.spectator = new Spectator(ad.code, {
      onArena: id => this.applyArena(id),
      onReady: (m, meta) => {
        this.match = m
        this.stage.setWalls(meta.wl !== false)
        this.hud.setRule(getRules(meta.rule).name, m.logic.scoreToWin)
        this.hud.setNames(meta.nl.toUpperCase(), meta.nr.toUpperCase())
        this.stage.capture(m)
        this.stage.capture(m)
        if (this.phase !== 'playing') {
          this.phase = 'playing'
          this.menu.release()
          this.menu.hide()
          this.hud.clearFx()
          this.hud.root.style.opacity = '1'
          this.hud.showNet(null)
          this.hud.setLive(true)
          this.setTouchVisible(true)
        }
      },
      onEnd: () => {
        if (!this.spectator) return
        this.hud.banner('TRANSMISSÃO ENCERRADA', 1600, '#ff6b6b')
        setTimeout(() => this.leaveWatch(true), 1700)
      },
    })
    this.spectator.start()
    this.hud.setNames('—', '—')
    this.menu.watching(ad)
  }

  leaveWatch(toMenu: boolean) {
    if (!this.spectator) return
    this.spectator.stop()
    this.spectator = null
    this.hud.setLive(false)
    this.hud.clearFx()
    this.hud.root.style.opacity = '0'
    this.setTouchVisible(false)
    if (toMenu) {
      this.startDemo()
      this.menu.show()
      this.menu.watchList()
    }
  }

  // ---------- online ----------

  private roomCode = ''
  private roomPass = ''
  private peerWantsRematch = false

  private async openRoom(code: string, pass: string, cfg: GameConfig) {
    this.cfg = cfg
    localStorage.setItem('bv.name', cfg.name)
    this.closeSession()
    this.roomCode = code
    this.roomPass = pass
    try {
      const transport = await createRoomTransport(code)
      this.attachSession(transport, cfg, true, pass)
      this.lobby.advertise(openAd(code, cfg.name, getRules(cfg.ruleId).name, pass ? 1 : 0))
    } catch (e) {
      this.menu.status(`falha no relay (${String(e).slice(0, 60)})`)
    }
  }

  private async joinRoom(code: string, pass: string, cfg: GameConfig) {
    this.cfg = cfg
    localStorage.setItem('bv.name', cfg.name)
    this.closeSession()
    this.roomCode = code
    this.roomPass = pass
    try {
      const transport = await createRoomTransport(code || 'BLOBBY')
      this.attachSession(transport, cfg, false, pass)
      this.menu.status(`procurando a sala ${code}…`)
      this.armJoinDiagnostic()
    } catch (e) {
      this.menu.status(`falha no relay (${String(e).slice(0, 60)})`)
    }
  }

  private startManual(asHost: boolean, cfg: GameConfig) {
    this.cfg = cfg
    this.closeSession()
    const h = createManualTransport(asHost)
    this.attachSession(h.transport, cfg, asHost, '')
    return { local: h.localDescription, accept: h.accept }
  }

  private attachSession(
    transport: Awaited<ReturnType<typeof createRoomTransport>>,
    cfg: GameConfig, host: boolean, pass: string,
  ) {
    this.session = new NetSession(transport, {
      ruleId: cfg.ruleId,
      arena: cfg.arena,
      walls: cfg.walls,
      onArena: id => this.applyArena(id),
      onWalls: on => this.applyWalls(on),
      scoreToWin: cfg.scoreToWin,
      name: cfg.name,
      host,
      pass: passHash(pass),
      onPhase: (p, info) => {
        if (p === 'handshake') this.menu.status('sala encontrada · pedindo pra entrar…')
        if (p === 'waiting' && this.phase !== 'playing') this.menu.waiting(this.roomCode, this.roomPass)
        if (p === 'closed') {
          this.menu.status(`conexão encerrada${info ? ` (${info})` : ''}`)
          if (this.phase === 'playing') {
            this.hud.banner('OPONENTE SAIU', 1600, '#ff6b6b')
            setTimeout(() => this.quitToMenu(), 1700)
          } else if (this.phase === 'over') {
            this.closeSession()
            this.menu.status('o oponente saiu — sem revanche')
          }
        }
        if (p === 'desync') this.hud.banner('DESSINCRONIZOU', 1800, '#ff6b6b')
      },
      onEmote: (id, side) => this.playEmote(side, id),
      onRematch: (mine, theirs) => {
        this.peerWantsRematch = theirs && !mine
        this.menu.status(mine && !theirs
          ? 'esperando o oponente aceitar a revanche…'
          : 'o oponente quer revanche — clica em REVANCHE')
      },
      onJoinRequest: (name, accept, reject) => {
        this.menu.askJoin(name, accept, () => { reject(); this.menu.waiting(this.roomCode, this.roomPass) })
      },
      onReady: s => {
        this.match = s.match!
        this.rec.reset()
        this.recUpTo = -1
        this.recBroken = false
        this.recSaved = false
        this.recMode = 'online'
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

    const view = this.spectator ?? this.replay
    if (view) {
      if (!view.advance()) {
        // gravação cortada antes do ponto final: encerra em vez de congelar
        if (this.replay?.done && this.phase === 'playing') {
          this.phase = 'menu'
          this.leaveReplay(true)
        }
        return
      }
      this.stage.capture(m)
      this.stage.onEvents(m, m.events)
      this.audio.onEvents(m.events, m.world, NO_PLAYER)
      this.uiEvents(m.events)
      return
    }

    if (this.session?.rollback) {
      const rb = this.session.rollback
      const mine = this.phase === 'playing' ? this.input.read(SOLO, 0, true) : NO_INPUT
      const stepped = rb.advance(packInput(mine))
      const now = performance.now()
      if (now - this.lastSend > 12) { this.session.sendInputs(); this.lastSend = now }
      this.session.maybeSendChecksum()
      if (m.frame - this.recUpTo > 60) this.pumpRecord()
      const ev = this.mergePending(rb.pending, stepped ? m.events : NO_EVENTS)
      if (stepped) this.stage.capture(m)
      if (ev.length) {
        this.stage.onEvents(m, ev)
        this.audio.onEvents(ev, m.world, this.localSide)
        this.uiEvents(ev)
      }
      return
    }

    let [li, ri] = this.readLocalInputs()
    if (this.demoBot) li = this.demoBot.think(m)
    if (this.bot) ri = this.bot.think(m)
    const f = m.frame
    m.step(li, ri)
    if (!this.demoBot) this.rec.put(f, packInput(li), packInput(ri))
    this.stage.capture(m)
    this.stage.onEvents(m, m.events)
    this.audio.onEvents(m.events, m.world, this.demoBot ? NO_PLAYER : this.localSide)
    this.uiEvents(m.events)
  }

  /**
   * Online o replay tem que sair do stream confirmado, nunca do previsto: o
   * frame que roda na tela pode ser desfeito pelo rollback no instante seguinte.
   */
  private pumpRecord() {
    const rb = this.session?.rollback
    if (!rb || this.recBroken) return
    const w = rb.confirmedWindow(this.recUpTo + 1)
    if (!w || !w.l.length) return
    if (w.start > this.recUpTo + 1) { this.recBroken = true; return }
    this.rec.putRange(w.start, w.l, w.r)
    this.recUpTo = w.start + w.l.length - 1
  }

  private saveReplay() {
    const m = this.match
    if (!m || this.recSaved || this.viewing || this.demoBot) return
    this.recSaved = true
    if (this.session) { this.pumpRecord(); this.pumpRecord() }
    if (this.recBroken || this.rec.frames < 120) return
    const s = this.session
    const nameL = s ? (s.localSide === LEFT ? this.cfg.name : s.peerName) : (this.bot ? this.cfg.name : 'P1')
    const nameR = s ? (s.localSide === LEFT ? s.peerName : this.cfg.name) : (this.bot ? 'CPU' : 'P2')
    const { l, r } = this.rec.take()
    const setup = s?.setup
    const meta: ReplayMeta = {
      rule: setup?.ruleId ?? this.cfg.ruleId,
      stw: m.logic.scoreToWin,
      arena: setup?.arena ?? this.cfg.arena,
      walls: setup?.walls ?? this.cfg.walls,
      serve: setup?.serving ?? LEFT,
      nl: nameL.slice(0, 16),
      nr: nameR.slice(0, 16),
      sl: m.logic.scores[LEFT],
      sr: m.logic.scores[RIGHT],
      rally: m.logic.rallyBest,
      frames: l.length,
      mode: this.recMode,
      at: Date.now(),
    }
    if (s) {
      const key = matchKey(this.roomCode || 'direct', nameL, nameR, meta.sl, meta.sr, m.frame)
      void saveOnlineReplay(key, meta, l, r)
    } else {
      void saveLocalReplay(meta, l, r)
    }
  }

  // ---------- replays ----------

  async watchReplay(card: ReplayCard) {
    this.menu.status('carregando replay…')
    const data = await loadReplay(card)
    if (!data) { this.menu.status('replay indisponível'); return }
    this.closeSession()
    this.leaveWatch(false)
    this.bot = null
    this.demoBot = null
    this.applyArena(data.meta.arena)
    this.stage.setWalls(data.meta.walls !== false)
    const rp = new ReplayPlayer(data.meta, data.l, data.r)
    this.replay = rp
    this.match = rp.match
    this.hud.setRule(getRules(data.meta.rule).name, rp.match.logic.scoreToWin)
    this.hud.setNames(data.meta.nl.toUpperCase(), data.meta.nr.toUpperCase())
    this.stage.capture(rp.match)
    this.stage.capture(rp.match)
    this.phase = 'playing'
    this.menu.release()
    this.menu.hide()
    this.hud.clearFx()
    this.hud.root.style.opacity = '1'
    this.hud.showNet(null)
    this.hud.setLive(true, 'REPLAY')
    this.setTouchVisible(false)
    this.buildRepBar(rp)
    this.acc = 0
  }

  private repBar: HTMLElement | null = null
  private repClock: HTMLElement | null = null
  private repPlay: HTMLElement | null = null

  private buildRepBar(rp: ReplayPlayer) {
    this.repBar?.remove()
    const clock = el('span', { class: 'clock mono', textContent: '0:00' })
    const play = el('button', { textContent: '❚❚' })
    const spd = el('button', { textContent: '1×' })
    const jump = (d: number) => {
      rp.seek(rp.match.frame + d)
      this.stage.capture(rp.match)
      this.stage.capture(rp.match)
      this.acc = 0
    }
    play.onclick = () => { rp.paused = !rp.paused }
    spd.onclick = () => {
      const i = (REPLAY_SPEEDS.indexOf(rp.speed) + 1) % REPLAY_SPEEDS.length
      rp.speed = REPLAY_SPEEDS[i]
      spd.textContent = `${rp.speed}×`
    }
    this.repBar = el('div', { class: 'rep-bar' },
      el('button', { textContent: '«5s', onclick: () => jump(-300) }),
      play,
      el('button', { textContent: '5s»', onclick: () => jump(300) }),
      spd,
      clock,
      el('button', { textContent: 'SAIR', onclick: () => { this.phase = 'menu'; this.leaveReplay(true) } }))
    this.ui.append(this.repBar)
    this.repClock = clock
    this.repPlay = play
  }

  private tickRepBar() {
    const rp = this.replay
    if (!rp || !this.repClock) return
    const t = (f: number) => `${Math.floor(f / 3600)}:${String(Math.floor(f / 60) % 60).padStart(2, '0')}`
    const txt = `${t(rp.match.frame)} / ${t(rp.frames)}`
    if (this.repClock.textContent !== txt) this.repClock.textContent = txt
    const glyph = rp.paused ? '▶' : '❚❚'
    if (this.repPlay && this.repPlay.textContent !== glyph) this.repPlay.textContent = glyph
  }

  private leaveReplay(toMenu: boolean) {
    if (!this.replay) return
    this.replay = null
    this.repBar?.remove()
    this.repBar = null
    this.repClock = null
    this.repPlay = null
    this.hud.setLive(false)
    this.hud.clearFx()
    this.hud.root.style.opacity = '0'
    this.setTouchVisible(false)
    if (toMenu) {
      this.startDemo()
      this.menu.show()
      this.menu.replays()
    }
  }

  private evBuf: MatchEvent[] = []

  /**
   * Ação de borda do outro jogador só existe depois que o input real chega e o
   * rollback re-simula. Sem juntar o que nasceu lá, o parry dele nunca aparece.
   */
  private mergePending(pending: MatchEvent[], live: readonly MatchEvent[]) {
    const out = this.evBuf
    out.length = 0
    for (const e of pending) out.push(e)
    pending.length = 0
    for (const e of live) out.push(e)
    return out
  }

  private uiEvents(events: MatchEvent[]) {
    for (const e of events) {
      if (e.event === Ev.FATALITY) this.hud.fatality()
      else if (e.event === Ev.PARRY) this.hud.parry()
      else if (e.event === Ev.SCORE) this.audio.duckMusic(1.3)
      else if (e.event === Ev.BALL_OUT) this.hud.banner('FORA!', 900, '#ff8a7a')
    }
  }

  private winFrame = -1

  private checkWin() {
    const m = this.match
    if (!m || this.phase !== 'playing') return
    if (m.logic.winner === NO_PLAYER) { this.winFrame = -1; return }
    const rb = this.session?.rollback
    if (rb) {
      /*
       * O match anda em frames previstos. Se a previsão do input do outro
       * errar no lance decisivo, o winner aparece aqui e some no rollback
       * seguinte — mas 'over' não tem volta, e um lado ficava na revanche
       * enquanto o outro seguia jogando. Só encerra com o frame confirmado.
       */
      if (this.winFrame < 0) this.winFrame = m.frame
      if (rb.confirmed + 1 < this.winFrame) return
    }
    const w = m.logic.winner as Side
    this.phase = 'over'
    this.stage.celebrate(w)
    if (this.viewing) {
      const nm = w === LEFT ? this.hud.nameOf(LEFT) : this.hud.nameOf(RIGHT)
      this.hud.banner(`${nm} VENCE`, 2200, w === LEFT ? '#ff3b47' : '#3a8cff')
      this.audio.finish(true)
      setTimeout(() => {
        this.phase = 'menu'
        if (this.replay) this.leaveReplay(true)
        else this.leaveWatch(true)
      }, 2600)
      return
    }
    this.saveReplay()
    const iWon = this.session ? w === this.localSide : (this.bot ? w === LEFT : true)
    this.audio.finish(iWon)
    const title = this.session || this.bot ? (iWon ? 'VITÓRIA' : 'DERROTA') : (w === LEFT ? 'P1 VENCE' : 'P2 VENCE')
    const color = w === LEFT ? '#ff3b47' : '#3a8cff'
    this.hud.banner(title, 2200, color)
    this.reportRank(w)
    const online = !!this.session
    setTimeout(() => {
      if (this.phase !== 'over') return
      this.setTouchVisible(false)
      this.hud.clearFx()
      this.menu.result(title, `${m.logic.scores[LEFT]} — ${m.logic.scores[RIGHT]}`, color, online)
      if (online && this.peerWantsRematch) this.menu.status('o oponente quer revanche — clica em REVANCHE')
    }, 2000)
  }

  /** Só partida online conta ponto. Os dois lados reportam; o servidor só aplica se baterem. */
  private reportRank(winner: Side) {
    const s = this.session
    const m = this.match
    if (!s || !m || this.demoBot) return
    const sl = m.logic.scores[LEFT]
    const sr = m.logic.scores[RIGHT]
    const nameL = s.localSide === LEFT ? this.cfg.name : s.peerName
    const nameR = s.localSide === LEFT ? s.peerName : this.cfg.name
    const key = matchKey(this.roomCode || 'direct', nameL, nameR, sl, sr, m.frame)
    const iWon = winner === s.localSide
    const my = s.localSide === LEFT ? sl : sr
    const their = s.localSide === LEFT ? sr : sl
    void reportMatch(key, this.cfg.name, iWon, my, their)
  }

  private loop(now: number) {
    requestAnimationFrame(t => this.loop(t))
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now

    // pausa local congela a simulação de verdade; online e transmissão seguem
    // rodando porque o relógio é do outro lado
    const frozen = this.phase === 'paused' && !this.session && !this.spectator && !this.replay
    const rate = this.replay ? this.replay.speed : 1
    if (frozen) this.acc = 0
    else this.acc += dt * 1000 * rate
    let steps = 0
    const cap = rate > 2 ? 20 : 8
    while (!frozen && this.acc >= TICK_MS && steps < cap) {
      this.acc -= TICK_MS
      this.stepSim()
      steps++
    }
    if (steps === cap) this.acc = 0
    if (this.spectator?.needsCatchUp()) { this.stepSim(); this.stepSim() }

    const m = this.match
    if (m) {
      const alpha = this.acc / TICK_MS
      this.stage.render(m, alpha, dt)
      this.hud.update(m.logic.scores, m.logic.touches, m.logic.servingPlayer, m.world.charge, m.world.stun)
      if (this.phase === 'playing') {
        this.hud.setRally(m.logic.rally, m.logic.rallyBest)
        this.audio.setTension(rallyTension(m.logic.rally))
        const stw = m.logic.scoreToWin
        const mp = Math.max(m.logic.scores[LEFT], m.logic.scores[RIGHT]) >= stw - 1
        this.audio.setRally(m.logic.rally, mp)
      }
      if (this.live && (m.logic.scores[LEFT] !== this.adScore[0] || m.logic.scores[RIGHT] !== this.adScore[1])) {
        this.adScore = [m.logic.scores[LEFT], m.logic.scores[RIGHT]]
        this.lobby.patchAd({ sl: this.adScore[0], sr: this.adScore[1] })
      }
      this.checkWin()
    }
    this.hud.tickFps(dt)
    this.tickRepBar()
    if (this.session && this.phase === 'playing') this.hud.showNet(this.session.stats())
    if (this.phase === 'playing' && !this.viewing) this.autoScale(dt)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const app = new App()
;(window as unknown as { app: App }).app = app
;(window as unknown as { THREE: typeof THREE }).THREE = THREE
