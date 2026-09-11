import { el, clear } from './dom.ts'
import { RULES } from '../core/logic.ts'
import type { VolumeBus } from '../audio/audio.ts'
import type { Difficulty } from '../ai/bot.ts'
import type { LobbyNet, RoomAd } from '../net/lobby.ts'
import { ARENAS } from '../core/constants.ts'
import type { ArenaId } from '../core/constants.ts'
import { SCENE_LIST } from '../render/scenes.ts'
import type { SceneId } from '../render/scenes.ts'
import { runDiag } from '../net/diag.ts'
import { leaderboard, myRank } from '../net/rank.ts'
import { onlineReplays } from '../net/replays.ts'
import type { ReplayCard } from '../net/replays.ts'
import type { RankRow } from '../net/rank.ts'
import { BODY_COLORS, HAIR_COLORS, HAIR_STYLES, defaultLook, saveLook } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import { drawPortrait } from '../render/portrait.ts'
import type { PortraitMood } from '../render/portrait.ts'
import { PixelScene } from '../render/pixelscene.ts'
import { getScene } from '../render/scenes.ts'
import { ROSTER, fighterById } from '../core/roster.ts'
import type { Fighter } from '../core/roster.ts'
import type { PadAction } from './pad.ts'
import { drillBest } from '../core/drill.ts'
import { ONLY_3D, PIXEL_ONLY } from '../core/platform.ts'

/** Num aparelho de toque as dicas de teclado não dizem nada a ninguém. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export interface GameConfig {
  mode: 'bot' | 'local' | 'online' | 'drill'
  difficulty: Difficulty
  ruleId: string
  scoreToWin: number
  quality: 'pixel' | 'min' | 'cpu' | 'low' | 'medium' | 'high' | 'ultra'
  name: string
  arena: ArenaId
  showFps: boolean
  scene: SceneId
  walls: boolean
  /** aparência do jogador local: vale no treino, no 2 jogadores e no online */
  look: PlayerLook
  /** personagem do elenco em cada lado; null = o seu perfil (P1) ou visual sorteado (P2) */
  p1: string | null
  p2: string | null
}

export interface ResultSide { name: string; look: PlayerLook; quote: string; fighter: Fighter | null }
export interface ResultInfo {
  winner: ResultSide
  loser: ResultSide
  scoreL: number
  scoreR: number
  winnerLeft: boolean
  kind: 'bot' | 'local' | 'online' | 'arcade'
  arcade?: { index: number; total: number; next: Fighter | null; won: boolean }
  canSaveReplay: boolean
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'bot', difficulty: 'normal', ruleId: 'default',
  scoreToWin: 15, quality: 'high', name: 'Blobby', arena: 'default', showFps: false,
  scene: 'praia', walls: true, look: defaultLook(0), p1: null, p2: null,
}

const WALL_OPTS: ['on' | 'off', string, string][] = [
  ['on', 'Com parede', 'a bola quica de volta e o rally segue'],
  ['off', 'Quadra aberta', 'dá pra sair da linha; fora é só quando a bola cai fora'],
]

const DIFFS: [Difficulty, string, string][] = [
  ['easy', 'Fácil', ''],
  ['normal', 'Normal', ''],
  ['hard', 'Difícil', ''],
  ['insane', 'Insano', ''],
]

const QUALITIES: [GameConfig['quality'], string, string][] = ([
  ['pixel', 'Pixel art', 'tudo em pixel, roda em qualquer coisa'],
  ['min', '2D mínimo', 'máquina antiga'],
  ['cpu', '2D (CPU)', 'sem GPU'],
  ['low', 'Baixa', ''],
  ['medium', 'Média', ''],
  ['high', 'Alta', ''],
  ['ultra', 'Ultra', ''],
] as [GameConfig['quality'], string, string][]).filter(q => PIXEL_ONLY ? q[0] === 'pixel' : !(ONLY_3D && (q[0] === 'min' || q[0] === 'cpu' || q[0] === 'pixel')))

const FPS_OPTS: ['off' | 'on', string, string][] = [
  ['off', 'Ocultar', ''],
  ['on', 'Mostrar', 'contador no canto'],
]

const randomCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('')
}

export interface MenuHandlers {
  onStart(cfg: GameConfig): void
  onArcade(cfg: GameConfig): void
  onArcadeNext(): void
  onArcadeRetry(): void
  onSaveReplay(): Promise<boolean>
  onCreateRoom(code: string, pass: string, cfg: GameConfig, pub: boolean): void
  onJoinRoom(code: string, pass: string, cfg: GameConfig): void
  onScene(id: SceneId): void
  onLook(look: PlayerLook): void
  onWalls(on: boolean): void
  onManual(asHost: boolean, cfg: GameConfig): {
    local: Promise<string>
    accept(remote: string): Promise<void>
  }
  onResume?(): void
  onQuit?(): void
  getVolume(bus: VolumeBus): number
  onVolume(v: number, bus: VolumeBus): void
  onQuality(q: GameConfig['quality']): void
  onFps(on: boolean): void
  onWatchRooms(cb: (rooms: RoomAd[]) => void): () => void
  onLeaveOnline(): void
  onRematch?(): void
  onWatch(ad: RoomAd): void
  onWatchReplay(card: ReplayCard): void
  onStopWatch(): void
  onLobbyNet(cb: (n: LobbyNet, info: string) => void): () => void
}

export class Menu {
  root: HTMLElement
  cfg: GameConfig
  private handlers: MenuHandlers
  private container: HTMLElement
  private cleanup: (() => void) | null = null
  private netOff: (() => void) | null = null
  private pendingNet: (() => void) | null = null
  private scrollOff: (() => void) | null = null
  private currentScreen: () => void = () => this.main()
  /** Pra onde o ESC e o ○/B voltam nesta tela. Sai do próprio botão Voltar. */
  private escBack: (() => void) | null = null
  private tipEl: HTMLElement | null = null
  private tipIdle = ''

  constructor(parent: HTMLElement, cfg: GameConfig, handlers: MenuHandlers) {
    this.cfg = cfg
    this.handlers = handlers
    this.container = el('div', { class: 'overlay' })
    this.root = this.container
    parent.append(this.container)
    this.main()
  }

  hide() { this.container.style.display = 'none' }
  show() { this.container.style.display = '' }
  destroy() { this.cleanup?.(); this.scrollOff?.(); this.container.remove() }
  release() {
    this.cleanup?.(); this.cleanup = null
    this.netOff?.(); this.netOff = null
    this.pendingNet?.(); this.pendingNet = null
  }

  /** Em que rede o lobby está. Quando falha em silêncio, é o único jeito de saber. */
  private netLine() {
    const row = el('div', { class: 'netline connecting', textContent: 'lobby: conectando…' })
    this.pendingNet?.()
    this.pendingNet = this.handlers.onLobbyNet((n, info) => {
      row.className = `netline ${n}`
      row.textContent = info
    })
    return row
  }

  private panel(...children: (Node | string)[]) {
    if (this.cleanup) { this.cleanup(); this.cleanup = null }
    this.netOff?.()
    this.netOff = this.pendingNet
    this.pendingNet = null
    this.tipEl = null
    this.tipIdle = ''
    clear(this.container)
    const p = el('div', { class: 'panel' }, ...children)
    this.container.append(p)
    this.watchScroll(p)
    // o caminho de volta já está escrito no botão Voltar: ler dele evita uma
    // segunda fonte de verdade que sai do lugar quando uma tela muda de pai
    const b = p.querySelector('.item.back') as HTMLButtonElement | null
    this.escBack = b ? () => b.click() : null
  }

  /**
   * Painel mais alto que a tela. Sem aviso a última linha aparece cortada no
   * meio e quem joga no celular acha que acabou ali. A borda desbotada diz que
   * desce mais e some quando chega no fim.
   */
  private watchScroll(p: HTMLElement) {
    this.scrollOff?.()
    const mark = () => { p.dataset.more = p.scrollHeight - p.scrollTop - p.clientHeight > 2 ? '1' : '0' }
    p.addEventListener('scroll', mark, { passive: true })
    const ro = new ResizeObserver(mark)
    ro.observe(p)
    requestAnimationFrame(mark)
    this.scrollOff = () => ro.disconnect()
  }

  /** ESC e ○/B voltam uma tela. Na inicial não têm pra onde ir. */
  escape() {
    if (!this.escBack) return false
    this.escBack()
    return true
  }

  /** O menu inteiro anda no controle: direcional, ✕/A escolhe, ○/B volta. */
  pad(a: PadAction) {
    if (a === 'back') { this.escape(); return }
    const list = this.focusables()
    if (!list.length) return
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (i < 0) { this.focusPad(list[0]); return }
    const node = list[i]
    if (a === 'ok') { node.click(); return }
    if ((a === 'left' || a === 'right') && this.nudge(node, a === 'left' ? -1 : 1)) return
    const d = a === 'up' || a === 'left' ? -1 : 1
    this.focusPad(list[(i + d + list.length) % list.length])
  }

  private focusables() {
    const p = this.container.querySelector('.panel')
    if (!p) return []
    return Array.from(p.querySelectorAll<HTMLElement>('button, input, textarea'))
      .filter(e => e.tabIndex >= 0 && !e.hasAttribute('disabled') && e.offsetParent !== null)
  }

  private focusPad(node: HTMLElement) {
    document.body.classList.add('padnav')
    node.focus()
    node.scrollIntoView({ block: 'nearest' })
  }

  /** Opção de valor e volume andam com o direcional; o resto troca o foco. */
  private nudge(node: HTMLElement, d: number) {
    if (node.classList.contains('val')) {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: d < 0 ? 'ArrowLeft' : 'ArrowRight' }))
      return true
    }
    if (node instanceof HTMLInputElement && node.type === 'range') {
      node.value = String(Math.max(0, Math.min(100, Number(node.value) + d * 4)))
      node.dispatchEvent(new Event('input'))
      return true
    }
    return false
  }

  private title(text: string, sub?: string) {
    return el('div', { class: 'brand head' },
      el('h1', { textContent: text }),
      sub ? el('p', { textContent: sub }) : el('span'))
  }

  private brand() {
    return el('div', { class: 'brand' },
      el('h1', {}, 'BLOBBY', el('br'), el('em', { textContent: 'VOLLEY' })),
      el('p', { class: 'build mono', textContent: `build ${__BUILD__}` }))
  }

  /** Ação de peso: botão de verdade, não mais uma linha de texto na pilha. */
  private act(text: string, tipText: string, onclick: () => void, cls = '') {
    return this.tip(el('button', { class: `act${cls ? ' ' + cls : ''}`, onclick }, text), tipText)
  }

  /** Cartão de escolha: o nome e o que ela faz no mesmo lugar. */
  private card(name: string, desc: string, onclick: () => void, cls = '') {
    return el('button', { class: `card${cls ? ' ' + cls : ''}`, onclick },
      el('b', { textContent: name }), el('small', { textContent: desc }))
  }

  /** Uma linha do rodapé: coluna de teclas, coluna do que elas fazem. */
  private keyRow(keys: string[], text: string) {
    return el('div', { class: 'fk' },
      el('span', { class: 'kk' }, ...keys.map(k => el('kbd', { textContent: k }))),
      el('span', { textContent: text }))
  }

  private portraitCanvas() {
    return el('canvas', { class: 'portrait' }) as HTMLCanvasElement
  }

  /** O retrato é o mesmo desenho do jogo, então mexer na cor se vê na hora. */
  private runPortrait(cv: HTMLCanvasElement, k = 0.44) {
    const stop = this.animPortrait(cv, () => this.cfg.look, 'idle', k)
    this.cleanup = stop
  }

  /**
   * No tema pixel o retrato é desenhado pequeno e ampliado sem filtro: o
   * mesmo desenho vira pixel art de graça. Devolve o cancelamento.
   */
  private animPortrait(cv: HTMLCanvasElement, look: () => PlayerLook, mood: PortraitMood, k = 0.44, still = false) {
    const start = performance.now()
    let raf = 0
    const paint = () => {
      const w0 = cv.clientWidth || 200, h0 = cv.clientHeight || 200
      const dpr = PIXEL_ONLY ? 0.36 : Math.min(2, devicePixelRatio || 1)
      const w = Math.max(24, Math.round(w0 * dpr)), h = Math.max(24, Math.round(h0 * dpr))
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      const c = cv.getContext('2d')
      if (!c) return
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, w, h)
      drawPortrait(c, w / 2, h * 0.58, Math.min(w, h) * k, look(), still ? 0 : (performance.now() - start) / 1000, mood)
      if (!still) raf = requestAnimationFrame(paint)
    }
    if (still) paint()
    else raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }

  /** Miniatura do cenário: o mesmo desenho procedural da quadra, parado. */
  private sceneThumb(id: SceneId) {
    const cv = el('canvas', { class: 'thumb', width: 160, height: 72 }) as HTMLCanvasElement
    const c = cv.getContext('2d')
    if (!c) return cv
    c.imageSmoothingEnabled = false
    try {
      const px = new PixelScene(getScene(id), 160, 72)
      const gy = 60
      px.background(c, 3, 0, gy, 0)
      c.fillStyle = px.pal.sand1
      c.fillRect(0, gy, 160, 72 - gy)
      c.fillStyle = px.pal.sand2
      for (let x = 0; x < 160; x += 6) c.fillRect(x, gy + 3 + ((x / 6) % 3), 2, 1)
      px.foreground(c, 3, gy, 0)
    } catch {
      const sc = getScene(id)
      c.fillStyle = sc.d2.mid[0]
      c.fillRect(0, 0, 160, 72)
    }
    return cv
  }

  private back(to: () => void) {
    return el('div', { class: 'backrow' },
      el('button', { class: 'item back', onclick: to }, '← Voltar'))
  }

  /**
   * A dica vive numa linha só no rodapé e troca conforme o foco. Descrição
   * fixa em cada opção enchia a tela de texto que ninguém lia.
   */
  private tip(node: HTMLElement, text: string) {
    if (!text) return node
    const show = () => { if (this.tipEl) this.tipEl.textContent = text }
    const hide = () => { if (this.tipEl) this.tipEl.textContent = this.tipIdle }
    node.addEventListener('pointerenter', show)
    node.addEventListener('focus', show)
    node.addEventListener('pointerleave', hide)
    node.addEventListener('blur', hide)
    return node
  }

  /** Linha do menu: texto e nada mais. A moldura era enfeite. */
  private item(text: string, tipText: string, onclick: () => void, cls = '') {
    return this.tip(el('button', { class: `item${cls ? ' ' + cls : ''}`, onclick }, text), tipText)
  }

  /**
   * Opção de valor: rótulo à esquerda, valor no meio entre duas setas. Uma
   * linha por ajuste, com ou sem mouse, funciona igual em celular deitado.
   */
  private opt<T extends string>(
    label: string, items: [T, string, string][], current: T, onPick: (v: T) => void,
  ) {
    const at = Math.max(0, items.findIndex(x => x[0] === current))
    const go = (d: number) => { onPick(items[(at + d + items.length) % items.length][0]); this.refresh() }
    const val = el('button', { class: 'val', onclick: () => go(1) }, items[at][1])
    val.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
    })
    this.tip(val, items[at][2])
    return el('div', { class: 'opt' },
      el('span', { class: 'lab', textContent: label }),
      el('div', { class: 'step' },
        el('button', { class: 'arw', onclick: () => go(-1), tabIndex: -1 }, '❮'),
        val,
        el('button', { class: 'arw', onclick: () => go(1), tabIndex: -1 }, '❯')))
  }

  /** Volume é contínuo: quatro botões nunca acertavam o ponto certo. */
  private slider(label: string, value: number, onSet: (v: number) => void) {
    const inp = el('input', { type: 'range', min: '0', max: '100', step: '1', class: 'sld' })
    inp.value = String(Math.round(value * 100))
    const num = el('span', { class: 'num mono', textContent: inp.value })
    const paint = () => inp.style.setProperty('--k', `${inp.value}%`)
    paint()
    inp.addEventListener('input', () => {
      paint()
      num.textContent = inp.value
      onSet(Number(inp.value) / 100)
    })
    return el('div', { class: 'opt vol' },
      el('span', { class: 'lab', textContent: label }), inp, num)
  }

  private volumeRows() {
    return [
      this.slider('Música', this.handlers.getVolume('music'), v => this.handlers.onVolume(v, 'music')),
      this.slider('Efeitos', this.handlers.getVolume('sfx'), v => this.handlers.onVolume(v, 'sfx')),
    ]
  }

  /** Rodapé: a dica do que está sob o cursor, com um texto de descanso. */
  private tipLine(idle = '') {
    this.tipIdle = idle
    this.tipEl = el('div', { class: 'tipline', textContent: idle })
    return this.tipEl
  }

  /** Remontar a tela perdia o foco: quem estava mexendo na opção com seta ou
   * controle voltava pro começo da lista a cada passo. */
  private refresh() {
    const i = this.focusables().indexOf(document.activeElement as HTMLElement)
    this.currentScreen()
    if (i < 0) return
    const back = this.focusables()[i]
    if (back) back.focus()
  }

  // ---------- screens ----------

  main() {
    this.currentScreen = () => this.main()
    const cv = this.portraitCanvas()
    this.panel(
      el('div', { class: 'home' },
        el('div', { class: 'home-id' }, this.brand(), cv),
        el('div', { class: 'home-act' },
          this.act('ARCADE', 'escolha um lutador e encare os dez, cada um na sua quadra',
            () => this.charSelect('arcade'), 'go'),
          this.act('VERSUS', 'contra o computador ou dois no mesmo aparelho',
            () => this.versus()),
          this.act('ONLINE', 'sala aberta, sala com código, assistir e replays',
            () => this.online()),
          el('div', { class: 'minor' },
            this.item('MEU PERFIL', 'nome, cor e cabelo do seu blob', () => this.blobby()),
            this.item('MINIGAMES', 'treinos de um jogador só', () => this.minigames()),
            this.item('RANKING', 'só partida online pontua', () => this.ranking()),
            this.item('AJUSTES', 'regras, arena, som', () => this.settings())),
          this.tipLine(TOUCH
            ? '▲ pula · dois toques no ar = especial · ▼ manchete, segurar agacha · ↘ se joga'
            : 'passa o cursor numa opção pra ver o que ela faz'))),
      el('div', { class: 'homefoot' }, ...(TOUCH ? [
        this.keyRow(['◀', '▶'], 'anda'),
        this.keyRow(['▲'], 'pula — dois toques no ar = especial'),
        this.keyRow(['▼'], 'toque = manchete, segurar = agachar'),
        this.keyRow(['↘'], 'se joga pro lado'),
        this.keyRow(['MENU'], 'pausa e volta'),
      ] : [
        this.keyRow(['A', 'D', 'W', 'S'], 'jogador 1'),
        this.keyRow(['←', '→', '↑', '↓'], 'jogador 2'),
        this.keyRow(['S'], 'toque = manchete, segurar = agachar'),
        this.keyRow(['E', 'CTRL'], 'se joga pro lado'),
        this.keyRow(['1', '5'], 'emotes'),
        this.keyRow(['ESC'], 'pausa e volta'),
      ])),
    )
    this.runPortrait(cv)
  }

  versus() {
    this.currentScreen = () => this.versus()
    const cfg = this.cfg
    this.panel(
      this.title('VERSUS'),
      el('div', { class: 'cards' },
        this.card('Contra o computador', 'escolha os dois lutadores e a quadra',
          () => { cfg.mode = 'bot'; this.charSelect('bot') }, 'go'),
        this.card('2 jogadores', TOUCH ? 'dois controles no mesmo aparelho' : 'os dois no mesmo teclado',
          () => { cfg.mode = 'local'; this.charSelect('local') })),
      el('div', { class: 'opts pre' },
        this.opt('Computador', DIFFS, cfg.difficulty, v => { cfg.difficulty = v })),
      this.back(() => this.main()),
    )
  }

  minigames() {
    this.currentScreen = () => this.minigames()
    const cfg = this.cfg
    const best = drillBest()
    this.panel(
      this.title('MINIGAMES'),
      el('div', { class: 'cards' },
        this.card('Mira', 'uma faixa acende no campo vazio: três toques pra derrubar a bola lá dentro. três erros e acabou.',
          () => { cfg.mode = 'drill'; cfg.p1 = null; this.handlers.onStart(cfg) }, 'go')),
      best > 0
        ? el('div', { class: 'tipline', textContent: `seu recorde na Mira: ${best} acertos` })
        : el('span'),
      this.back(() => this.main()),
    )
  }

  /**
   * Seleção de lutador. O primeiro quadro é o seu perfil; os outros são o
   * elenco. No arcade escolhe um e vai; no versus escolhe os dois e a quadra.
   */
  charSelect(kind: 'arcade' | 'bot' | 'local', slot: 1 | 2 = 1) {
    this.currentScreen = () => this.charSelect(kind, slot)
    const cfg = this.cfg
    const slots: (Fighter | null)[] = slot === 1 ? [null, ...ROSTER] : [...ROSTER]
    let cur = slot === 1 ? cfg.p1 : cfg.p2
    let at = Math.max(0, slots.findIndex(f => (f?.id ?? null) === cur))
    if (slot === 2 && cur === null) at = 0
    const big = el('canvas', { class: 'portrait big' }) as HTMLCanvasElement
    const nameEl = el('b', { class: 'fname' })
    const titleEl = el('span', { class: 'ftitle' })
    const bioEl = el('p', { class: 'fbio' })
    const homeEl = el('span', { class: 'fhome' })
    const cells: HTMLButtonElement[] = []
    let stopAnim: (() => void) | null = null
    const show = () => {
      const f = slots[at]
      cells.forEach((c, i) => c.classList.toggle('sel', i === at))
      nameEl.textContent = f ? f.name.toUpperCase() : (slot === 1 ? cfg.name.toUpperCase() : 'P2')
      titleEl.textContent = f ? f.title : 'o seu blob, do jeito que está no perfil'
      bioEl.textContent = f ? f.bio : 'Mude cor e cabelo em MEU PERFIL.'
      homeEl.textContent = f ? `quadra: ${getScene(f.home).name}` : ''
      stopAnim?.()
      stopAnim = this.animPortrait(big, () => f ? f.look : cfg.look, 'idle', 0.46)
    }
    const confirm = () => {
      const f = slots[at]
      if (slot === 1) cfg.p1 = f?.id ?? null
      else cfg.p2 = f?.id ?? null
      if (kind === 'arcade') { this.handlers.onArcade(cfg); return }
      if (slot === 1) {
        if (kind === 'bot' && cfg.p2 === cfg.p1) cfg.p2 = null
        this.charSelect(kind, 2)
        return
      }
      this.levelSelect()
    }
    const grid = el('div', { class: 'roster' })
    slots.forEach((f, i) => {
      const cv = el('canvas', { class: 'portrait mini' }) as HTMLCanvasElement
      const b = el('button', { class: 'cell', onclick: () => { if (at === i) confirm(); else { at = i; show() } } },
        cv, el('small', { textContent: f ? f.name : 'VOCÊ' }))
      b.addEventListener('focus', () => { if (at !== i) { at = i; show() } })
      b.addEventListener('pointerenter', () => { if (at !== i) { at = i; show() } })
      cells.push(b)
      grid.append(b)
      const stop = this.animPortrait(cv, () => f ? f.look : cfg.look, 'idle', 0.5, true)
      stop()
    })
    const who = kind === 'arcade' ? 'SEU LUTADOR' : slot === 1 ? 'JOGADOR 1' : (kind === 'bot' ? 'COMPUTADOR' : 'JOGADOR 2')
    const random = kind !== 'arcade' && slot === 2
      ? el('button', { class: 'ghost center small', onclick: () => { at = Math.floor(Math.random() * slots.length); show() } }, 'Aleatório')
      : null
    this.panel(
      this.title(who, kind === 'arcade' ? 'os outros dez esperam, cada um na própria quadra' : 'escolhe e confirma'),
      el('div', { class: 'select' },
        el('div', { class: 'fcard' }, big, nameEl, titleEl, homeEl, bioEl,
          el('button', { class: 'primary', onclick: confirm }, kind === 'arcade' ? 'LUTAR' : 'CONFIRMAR')),
        el('div', { class: 'rostercol' }, grid, random)),
      this.tipLine(TOUCH ? 'toca duas vezes pra confirmar' : 'setas escolhem, Enter confirma'),
      this.back(() => {
        if (slot === 2) this.charSelect(kind, 1)
        else if (kind === 'arcade') this.main()
        else this.versus()
      }),
    )
    show()
    const prev = this.cleanup
    this.cleanup = () => { prev?.(); stopAnim?.() }
    cells[at]?.focus()
  }

  /** Quadra do versus. No arcade não passa por aqui: é sempre a do adversário. */
  levelSelect() {
    this.currentScreen = () => this.levelSelect()
    const cfg = this.cfg
    const grid = el('div', { class: 'levels' })
    for (const [id, name, hint] of SCENE_LIST) {
      const b = el('button', { class: `level${cfg.scene === id ? ' sel' : ''}`, onclick: () => {
        cfg.scene = id
        this.handlers.onScene(id)
        this.handlers.onStart(cfg)
      } }, this.sceneThumb(id), el('b', { textContent: name }), el('small', { textContent: hint }))
      grid.append(b)
    }
    const p1 = fighterById(cfg.p1 ?? '')
    const p2 = fighterById(cfg.p2 ?? '')
    this.panel(
      this.title('QUADRA', `${p1 ? p1.name : cfg.name}  ×  ${p2 ? p2.name : (cfg.mode === 'bot' ? 'CPU' : 'P2')}`),
      grid,
      this.back(() => this.charSelect(cfg.mode === 'local' ? 'local' : 'bot', 2)),
    )
  }

  /** Escolher olhando pro bicho: o retrato ao lado é o mesmo desenho do jogo. */
  blobby() {
    this.currentScreen = () => this.blobby()
    const look = this.cfg.look
    const cfg = this.cfg
    const cv = this.portraitCanvas()
    const pick = (list: { name: string }[]) =>
      list.map((x, i) => [String(i), x.name, ''] as [string, string, string])
    const commit = () => { saveLook(look); this.handlers.onLook(look) }
    const nameIn = el('input', { type: 'text', value: cfg.name, maxLength: 16, class: 'nome' })
    nameIn.addEventListener('input', () => { cfg.name = nameIn.value.trim() || 'Blobby'; localStorage.setItem('bv.name', cfg.name) })

    this.panel(
      this.title('MEU PERFIL'),
      el('div', { class: 'dress' },
        cv,
        el('div', { class: 'opts' },
          el('div', { class: 'opt' }, el('span', { class: 'lab', textContent: 'Nome' }), nameIn),
          this.opt('Cor', pick(BODY_COLORS), String(look.body),
            v => { look.body = Number(v); commit() }),
          this.opt('Cabelo', pick(HAIR_STYLES), String(look.hair),
            v => { look.hair = Number(v); commit() }),
          this.opt('Cor do cabelo', pick(HAIR_COLORS), String(look.hairColor),
            v => { look.hairColor = Number(v); commit() }))),
      this.tipLine('é você no arcade, no versus e no online'),
      this.back(() => this.main()),
    )
    this.runPortrait(cv)
  }

  /** Só as online, e só as que alguém escolheu gravar. */
  replays() {
    this.currentScreen = () => this.replays()
    const list = el('div', { class: 'grid rep-list' },
      el('p', { class: 'hint center', textContent: 'carregando…' }))
    const status = el('div', { class: 'status' })
    this.panel(
      this.title('REPLAYS', 'partidas online que alguém quis guardar'),
      list,
      status,
      this.back(() => this.online()),
    )
    void onlineReplays(30).then(rows => {
      clear(list)
      if (!rows.length) {
        list.append(el('p', { class: 'hint center', textContent: 'nenhum replay ainda. no fim de uma partida online dá pra gravar.' }))
        return
      }
      for (const c of rows) list.append(this.replayRow(c))
    })
    return status
  }

  private replayRow(c: ReplayCard) {
    const m = c.meta
    const mins = Math.max(1, Math.round((m.frames || 0) / 60 / 60))
    const when = c.at ? new Date(c.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
    return el('button', {
      class: 'center room replay',
      onclick: () => this.handlers.onWatchReplay(c),
    },
      el('span', { class: 'who', textContent: `${m.nl || 'P1'} × ${m.nr || 'P2'}` }),
      el('b', { class: 'sc mono', textContent: `${m.sl}—${m.sr}` }),
      el('small', { class: 'meta', textContent: `${mins} min · rally ${m.rally || 0}${when ? ` · ${when}` : ''}` }))
  }

  ranking() {
    this.currentScreen = () => this.ranking()
    const list = el('div', { class: 'rank-list' },
      el('p', { class: 'hint center', textContent: 'carregando…' }))
    const mine = el('div', { class: 'hint center' })
    this.panel(
      this.title('RANKING', 'só partidas online valem pontos'),
      list,
      mine,
      this.back(() => this.main()),
    )
    void leaderboard(30).then((rows: RankRow[]) => {
      clear(list)
      if (!rows.length) {
        list.append(el('p', { class: 'hint center', textContent: 'ninguém pontuou ainda. seja o primeiro.' }))
        return
      }
      rows.forEach((r, i) => list.append(el('div', { class: `rank-row${i < 3 ? ' top' : ''}` },
        el('b', { class: 'pos', textContent: String(i + 1) }),
        el('span', { class: 'who' }, r.name, el('i', { class: 'tag', textContent: `#${r.tag}` })),
        el('span', { class: 'wl mono', textContent: `${r.wins}v ${r.losses}d` }),
        el('b', { class: 'elo mono', textContent: String(r.rating) }))))
    })
    void myRank().then(me => {
      mine.textContent = me
        ? `você: ${me.name}#${me.tag} · ${me.rating} pts · ${me.pos > 0 ? `${me.pos}º` : 'sem partida ainda'}`
        : 'ranking indisponível agora'
    })
  }

  settings() {
    this.currentScreen = () => this.settings()
    const cfg = this.cfg
    this.panel(
      this.title('AJUSTES'),
      el('div', { class: 'cols' },
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Partida' }),
          el('div', { class: 'opts' },
            this.opt(
              'Regras',
              RULES.map(r => [r.id, r.name, r.desc] as [string, string, string]),
              cfg.ruleId,
              v => { cfg.ruleId = v; cfg.scoreToWin = RULES.find(r => r.id === v)!.scoreToWin }),
            this.opt('Arena', ARENAS, cfg.arena, v => { cfg.arena = v }),
            this.opt('Paredes', WALL_OPTS, cfg.walls ? 'on' : 'off',
              v => { cfg.walls = v === 'on'; this.handlers.onWalls(cfg.walls) }))),
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Som' }),
          el('div', { class: 'opts' }, ...this.volumeRows()),
          el('h2', { class: 'sec', textContent: 'Tela' }),
          el('div', { class: 'opts' },
            PIXEL_ONLY ? null : this.opt('Gráficos', QUALITIES, cfg.quality,
              v => { cfg.quality = v; this.handlers.onQuality(v) }),
            this.opt('FPS', FPS_OPTS, cfg.showFps ? 'on' : 'off',
              v => { cfg.showFps = v === 'on'; this.handlers.onFps(cfg.showFps) })))),
      this.tipLine('trilha e efeitos são sintetizados pelo próprio jogo'),
      this.back(() => this.main()),
    )
  }

  online() {
    this.currentScreen = () => this.online()
    const cfg = this.cfg
    cfg.mode = 'online'
    this.panel(
      this.title('ONLINE', `você entra como ${cfg.name}`),
      el('div', { class: 'cards' },
        this.card('Salas abertas', 'entra numa sala pública ou abre a sua', () => this.openRooms(), 'go'),
        this.card('Sala com código', 'só entra quem tem o código', () => this.codeRoom()),
        this.card('Assistir', 'partidas rolando agora, ao vivo', () => this.watchList()),
        this.card('Replays', 'partidas online que alguém gravou', () => this.replays())),
      this.netLine(),
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.diag() }, 'Testar minha conexão')),
      this.back(() => { this.handlers.onLeaveOnline(); this.main() }),
    )
    this.cleanup = this.handlers.onWatchRooms(() => { /* só pra manter o canal vivo */ })
  }

  /** Salas públicas: lista pra entrar e um botão pra abrir a sua. */
  openRooms() {
    this.currentScreen = () => this.openRooms()
    const cfg = this.cfg
    const status = el('div', { class: 'status' })
    const list = el('div', { class: 'grid rooms' })
    const render = (rooms: RoomAd[]) => {
      clear(list)
      const open = rooms.filter(r => !r.live && r.pub !== 0 && !r.lock)
      if (!open.length) {
        list.append(el('div', { class: 'hint center', textContent: 'nenhuma sala aberta agora — abre a sua e espera' }))
        return
      }
      for (const r of open) {
        list.append(el('button', { class: 'center room', onclick: () => {
          status.textContent = `entrando na sala de ${r.name}…`
          this.handlers.onJoinRoom(r.code, '', cfg)
        } }, `🎾 ${r.name}`, el('small', { textContent: r.rule })))
      }
    }
    render([])
    this.panel(
      this.title('SALAS ABERTAS'),
      list,
      status,
      this.netLine(),
      el('div', { class: 'grid', style: 'margin-top:12px' },
        el('button', { class: 'primary', onclick: () => {
          const c = randomCode()
          this.handlers.onCreateRoom(c, '', cfg, true)
          this.waiting(c, '', true)
        } }, 'ABRIR MINHA SALA')),
      el('div', { class: 'hint foot' }, 'Você aprova quem entrar.'),
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
    )
    this.cleanup = this.handlers.onWatchRooms(render)
    return status
  }

  /** Sala fechada: cria com código (e senha, se quiser) ou entra com o código de alguém. */
  codeRoom() {
    this.currentScreen = () => this.codeRoom()
    const cfg = this.cfg
    const code = el('input', { type: 'text', value: randomCode(), maxLength: 8 })
    const pass = el('input', { type: 'text', value: '', maxLength: 16, placeholder: 'senha (opcional)' })
    const joinCode = el('input', { type: 'text', value: '', maxLength: 8, placeholder: 'CÓDIGO' })
    const joinPass = el('input', { type: 'text', value: '', maxLength: 16, placeholder: 'senha (se tiver)' })
    const status = el('div', { class: 'status' })
    this.panel(
      this.title('SALA COM CÓDIGO'),
      el('div', { class: 'cols' },
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Criar' }),
          el('div', { class: 'row' },
            code,
            el('button', { class: 'center icon', onclick: () => { code.value = randomCode() } }, '⟳')),
          el('div', { style: 'margin-top:9px' }, pass),
          el('div', { class: 'grid', style: 'margin-top:12px' },
            el('button', { class: 'primary', onclick: () => {
              const c = code.value.trim().toUpperCase() || 'BLOBBY'
              this.handlers.onCreateRoom(c, pass.value.trim(), cfg, false)
              this.waiting(c, pass.value.trim(), false)
            } }, 'CRIAR'))),
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Entrar' }),
          joinCode,
          el('div', { style: 'margin-top:9px' }, joinPass),
          el('div', { class: 'grid', style: 'margin-top:12px' },
            el('button', { class: 'primary', onclick: () => {
              const c = joinCode.value.trim().toUpperCase()
              if (!c) { status.textContent = 'digita o código'; return }
              status.textContent = `entrando em ${c}…`
              this.handlers.onJoinRoom(c, joinPass.value.trim(), cfg)
            } }, 'ENTRAR')))),
      status,
      this.netLine(),
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.manual(true) }, 'Conexão direta, sem relay')),
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
    )
    this.cleanup = this.handlers.onWatchRooms(() => { /* canal vivo */ })
    return status
  }

  /** Roda os testes de rede e mostra linha a linha — pra quem não consegue conectar. */
  diag() {
    this.currentScreen = () => this.diag()
    const list = el('div', { class: 'diag mono' })
    const rows = new Map<string, HTMLElement>()
    const copy = el('button', { class: 'ghost center small' }, 'Copiar resultado')
    const lines: string[] = []
    copy.onclick = () => { void navigator.clipboard?.writeText(lines.join('\n')) ; copy.textContent = 'Copiado!' }
    this.panel(
      this.title('TESTE DE CONEXÃO'),
      list,
      el('div', { class: 'hint foot' }, 'Manda print disso pra quem tá te ajudando.'),
      el('div', { class: 'grid' }, copy),
      this.back(() => this.online()),
    )
    void runDiag(l => {
      let row = rows.get(l.label)
      if (!row) { row = el('div', { class: 'diag-row' }); rows.set(l.label, row); list.append(row) }
      const mark = l.ok === null ? '·' : l.ok ? '✓' : '✕'
      row.className = `diag-row ${l.ok === null ? '' : l.ok ? 'good' : 'bad'}`
      row.textContent = `${mark} ${l.label}: ${l.info}`
      const i = lines.findIndex(x => x.includes(` ${l.label}: `))
      if (i >= 0) lines[i] = row.textContent
      else lines.push(row.textContent)
    })
    return list
  }

  waiting(code: string, pass: string, pub = false) {
    this.currentScreen = () => this.waiting(code, pass, pub)
    const status = el('div', { class: 'status' })
    status.textContent = 'esperando alguém entrar…'
    this.panel(
      this.title(pub ? 'SALA ABERTA' : 'SUA SALA'),
      el('div', { class: 'code-big mono', textContent: code }),
      el('div', { class: 'hint center' },
        pub ? 'está na lista pública · qualquer um pode pedir pra entrar'
          : pass ? `manda o código e a senha: ${pass}` : 'manda esse código pra quem vai jogar'),
      el('div', { class: 'spinner' }),
      status,
      this.back(() => { this.handlers.onLeaveOnline(); pub ? this.openRooms() : this.codeRoom() }),
    )
    return status
  }

  askJoin(name: string, accept: () => void, reject: () => void) {
    this.currentScreen = () => this.askJoin(name, accept, reject)
    this.show()
    this.panel(
      this.title(name.toUpperCase(), 'quer entrar na sua sala'),
      el('div', { class: 'grid two', style: 'margin-top:18px' },
        el('button', { class: 'primary', onclick: accept }, 'ACEITAR'),
        el('button', { class: 'center danger', onclick: reject }, 'Recusar')),
    )
  }

  /** Salas com partida rolando: entra só pra ver, sem atrapalhar quem joga. */
  watchList() {
    this.currentScreen = () => this.watchList()
    const list = el('div', { class: 'grid rooms' })
    const render = (rooms: RoomAd[]) => {
      clear(list)
      const live = rooms.filter(r => r.live)
      if (!live.length) {
        list.append(el('div', { class: 'hint center', textContent: 'ninguém jogando agora' }))
        return
      }
      for (const r of live) {
        list.append(el('button', { class: 'center room live', onclick: () => this.handlers.onWatch(r) },
          el('span', { class: 'livedot' }),
          `${r.name} vs ${r.foe || '?'}`,
          el('small', { textContent: `${r.sl} — ${r.sr} · ${r.rule}` })))
      }
    }
    render([])
    this.panel(
      this.title('AO VIVO', 'partidas rolando agora'),
      list,
      this.netLine(),
      el('div', { class: 'hint foot' }, 'Você vê a partida em tempo real, com uns instantes de atraso.'),
      this.back(() => this.online()),
    )
    this.cleanup = this.handlers.onWatchRooms(render)
  }

  /** Some do caminho: quem assiste vê o jogo, não o menu. */
  watching(ad: RoomAd) {
    this.currentScreen = () => this.watching(ad)
    this.panel(
      this.title('CONECTANDO', `${ad.name} vs ${ad.foe || '?'}`),
      el('div', { class: 'spinner' }),
      el('div', { class: 'status', textContent: 'esperando a transmissão…' }),
      el('div', { class: 'grid' },
        el('button', { class: 'center', onclick: () => this.handlers.onStopWatch() }, 'Cancelar')),
    )
    this.show()
  }

  watchPause() {
    this.currentScreen = () => this.watchPause()
    this.show()
    this.panel(
      this.title('ASSISTINDO'),
      el('div', { class: 'list' },
        this.item('VOLTAR PRO JOGO', '', () => this.handlers.onResume?.(), 'lead'),
        this.item('PARAR DE ASSISTIR', '', () => this.handlers.onStopWatch())),
      el('div', { class: 'opts' },
        PIXEL_ONLY ? null : this.opt('Gráficos', QUALITIES, this.cfg.quality,
          v => { this.cfg.quality = v; this.handlers.onQuality(v) }),
        ...this.volumeRows()),
    )
  }

  manual(asHost: boolean) {
    this.currentScreen = () => this.manual(asHost)
    const cfg = this.cfg
    cfg.mode = 'online'
    const mine = el('textarea', { readOnly: true, placeholder: 'gerando…' })
    const theirs = el('textarea', { placeholder: 'cole o código do outro lado aqui' })
    const status = el('div', { class: 'status' })

    const handle = this.handlers.onManual(asHost, cfg)
    handle.local.then(s => { mine.value = s }).catch(() => { status.textContent = 'falha ao gerar' })

    this.panel(
      this.title(asHost ? 'CONVITE' : 'ENTRAR DIRETO'),
      el('h2', { class: 'sec', textContent: asHost ? '1. Mande este código' : '2. Mande sua resposta' }),
      mine,
      el('button', {
        class: 'center', style: 'margin-top:8px',
        onclick: () => { void navigator.clipboard.writeText(mine.value); status.textContent = 'copiado' },
      }, 'Copiar'),
      el('h2', { class: 'sec', textContent: asHost ? '2. Cole a resposta dele' : '1. Cole o código do host' }),
      theirs,
      el('div', { class: 'grid', style: 'margin-top:10px' },
        el('button', {
          class: 'primary',
          onclick: () => {
            status.textContent = 'conectando…'
            handle.accept(theirs.value).then(
              () => { status.textContent = 'negociando…' },
              () => { status.textContent = 'código inválido' })
          },
        }, 'CONECTAR')),
      status,
      el('div', { class: 'grid' },
        asHost ? el('button', { class: 'ghost center small', onclick: () => this.manual(false) }, 'Sou eu que vou entrar') : null),
      this.back(() => { this.handlers.onLeaveOnline(); this.codeRoom() }),
    )
    return status
  }

  pause() {
    this.currentScreen = () => this.pause()
    this.show()
    this.panel(
      this.title('PAUSA'),
      el('div', { class: 'list' },
        this.item('CONTINUAR', '', () => this.handlers.onResume?.(), 'lead'),
        this.item('SAIR PRO MENU', 'a partida em andamento se perde', () => this.handlers.onQuit?.())),
      el('div', { class: 'opts' },
        this.opt('Paredes', WALL_OPTS, this.cfg.walls ? 'on' : 'off',
          v => this.handlers.onWalls(v === 'on')),
        PIXEL_ONLY ? null : this.opt('Gráficos', QUALITIES, this.cfg.quality,
          v => { this.cfg.quality = v; this.handlers.onQuality(v) }),
        ...this.volumeRows()),
      this.tipLine(TOUCH ? 'MENU volta pro jogo' : 'ESC volta pro jogo'),
    )
  }

  /**
   * Fim de partida à la Street Fighter II: o vencedor grande e feliz, a frase
   * dele, o perdedor amassado no canto. Vale pra CPU, 2 jogadores e online.
   */
  result(r: ResultInfo) {
    this.currentScreen = () => this.result(r)
    this.show()
    const winCv = el('canvas', { class: 'portrait win' }) as HTMLCanvasElement
    const loseCv = el('canvas', { class: 'portrait lose' }) as HTMLCanvasElement

    const buttons: HTMLElement[] = []
    const status = el('div', { class: 'status' })
    if (r.kind === 'arcade' && r.arcade) {
      const a = r.arcade
      if (a.won) {
        buttons.push(el('button', { class: 'primary', onclick: () => this.handlers.onArcadeNext() },
          a.next ? `PRÓXIMO: ${a.next.name.toUpperCase()}` : 'VER O FINAL'))
      } else {
        buttons.push(el('button', { class: 'primary', onclick: () => this.handlers.onArcadeRetry() }, 'CONTINUAR?'))
      }
      buttons.push(el('button', { class: 'center', onclick: () => this.handlers.onQuit?.() }, a.won ? 'Parar por aqui' : 'Desistir'))
    } else if (r.kind === 'online') {
      const rematch = el('button', { class: 'primary' }, 'REVANCHE')
      rematch.onclick = () => {
        rematch.setAttribute('disabled', '')
        rematch.textContent = 'ESPERANDO O OPONENTE…'
        this.handlers.onRematch?.()
      }
      buttons.push(rematch)
      if (r.canSaveReplay) {
        const save = el('button', { class: 'center' }, 'GRAVAR REPLAY')
        save.onclick = () => {
          save.setAttribute('disabled', '')
          save.textContent = 'GRAVANDO…'
          void this.handlers.onSaveReplay().then(ok => { save.textContent = ok ? 'REPLAY GRAVADO' : 'NÃO DEU PRA GRAVAR' })
        }
        buttons.push(save)
      }
      buttons.push(el('button', { class: 'center', onclick: () => { this.handlers.onLeaveOnline(); this.handlers.onQuit?.() } }, 'Menu'))
    } else {
      buttons.push(el('button', { class: 'primary', onclick: () => this.handlers.onStart(this.cfg) }, 'REVANCHE'))
      buttons.push(el('button', { class: 'center', onclick: () => this.handlers.onQuit?.() }, 'Menu'))
    }

    const headline = r.kind === 'local' ? `${r.winner.name.toUpperCase()} VENCE`
      : r.kind === 'arcade' ? (r.arcade?.won ? `VITÓRIA ${r.arcade.index + 1}/${r.arcade.total}` : 'DERROTA')
      : (r.winner.fighter || r.kind === 'online' ? `${r.winner.name.toUpperCase()} VENCE` : 'VITÓRIA')
    const iLost = r.kind !== 'local' && (r.kind === 'arcade' ? !r.arcade?.won : r.loser.fighter === null)
    this.panel(
      el('div', { class: `sf ${iLost ? 'lost' : 'won'}` },
        el('div', { class: 'sf-head' },
          el('h1', { textContent: headline }),
          el('div', { class: 'sf-score mono', textContent: `${r.scoreL} — ${r.scoreR}` })),
        el('div', { class: 'sf-body' },
          el('div', { class: 'sf-win' },
            winCv,
            el('b', { textContent: r.winner.name.toUpperCase() }),
            el('p', { class: 'quote', textContent: `“${r.winner.quote}”` })),
          el('div', { class: 'sf-lose' },
            loseCv,
            el('b', { textContent: r.loser.name.toUpperCase() }),
            el('small', { textContent: r.loser.quote })))),
      el('div', { class: 'grid' }, ...buttons),
      status,
    )
    const stopW = this.animPortrait(winCv, () => r.winner.look, 'happy', 0.46)
    const stopL = this.animPortrait(loseCv, () => r.loser.look, 'hurt', 0.46)
    this.cleanup = () => { stopW(); stopL() }
  }

  /** Fim do minigame: número, recorde, de novo. */
  drillResult(title: string, subtitle: string, color: string) {
    this.currentScreen = () => this.drillResult(title, subtitle, color)
    this.show()
    this.panel(
      el('div', { class: 'brand' },
        el('h1', { textContent: title, style: `background:none;-webkit-text-fill-color:${color};color:${color}` }),
        el('p', { textContent: subtitle })),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => this.handlers.onStart(this.cfg) }, 'DE NOVO'),
        el('button', { class: 'center', onclick: () => this.handlers.onQuit?.() }, 'Menu')),
    )
  }

  /** Fim do arcade: os dez caíram. */
  arcadeEnd(look: PlayerLook, name: string, fights: number, losses: number) {
    this.currentScreen = () => this.arcadeEnd(look, name, fights, losses)
    this.show()
    const cv = el('canvas', { class: 'portrait win' }) as HTMLCanvasElement
    const line = losses === 0 ? 'Sem perder uma. O Rex vai fingir que não viu.'
      : losses < 3 ? 'Tropeçou, levantou, ganhou. É assim que se faz.'
      : 'Deu trabalho, mas deu. Os dez sabem o seu nome agora.'
    this.panel(
      el('div', { class: 'sf won end' },
        el('div', { class: 'sf-head' }, el('h1', { textContent: 'CAMPEÃO' }),
          el('div', { class: 'sf-score mono', textContent: `${fights} lutas · ${losses} ${losses === 1 ? 'derrota' : 'derrotas'}` })),
        el('div', { class: 'sf-body one' },
          el('div', { class: 'sf-win' }, cv, el('b', { textContent: name.toUpperCase() }),
            el('p', { class: 'quote', textContent: line })))),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => this.handlers.onQuit?.() }, 'MENU')),
    )
    this.cleanup = this.animPortrait(cv, () => look, 'happy', 0.46)
  }

  status(text: string) {
    const s = this.container.querySelector('.status')
    if (s) s.textContent = text
  }
}
