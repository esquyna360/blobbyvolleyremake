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
import { leaderboard } from '../net/rank.ts'
import { localReplays, onlineReplays } from '../net/replays.ts'
import type { ReplayCard } from '../net/replays.ts'
import type { RankRow } from '../net/rank.ts'
import { BODY_COLORS, HAIR_COLORS, HAIR_STYLES, defaultLook, saveLook } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import { drawPortrait } from '../render/portrait.ts'
import type { PadAction } from './pad.ts'

export interface GameConfig {
  mode: 'bot' | 'local' | 'online'
  difficulty: Difficulty
  ruleId: string
  scoreToWin: number
  quality: 'min' | 'cpu' | 'low' | 'medium' | 'high' | 'ultra'
  name: string
  arena: ArenaId
  showFps: boolean
  scene: SceneId
  walls: boolean
  /** aparência do jogador local: vale no treino, no 2 jogadores e no online */
  look: PlayerLook
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'bot', difficulty: 'normal', ruleId: 'default',
  scoreToWin: 15, quality: 'high', name: 'Blobby', arena: 'default', showFps: false,
  scene: 'praia', walls: true, look: defaultLook(0),
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

const QUALITIES: [GameConfig['quality'], string, string][] = [
  ['min', '2D mínimo', 'máquina antiga'],
  ['cpu', '2D (CPU)', 'sem GPU'],
  ['low', 'Baixa', ''],
  ['medium', 'Média', ''],
  ['high', 'Alta', ''],
  ['ultra', 'Ultra', ''],
]

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
  onCreateRoom(code: string, pass: string, cfg: GameConfig): void
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
  destroy() { this.cleanup?.(); this.container.remove() }
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
    // o caminho de volta já está escrito no botão Voltar: ler dele evita uma
    // segunda fonte de verdade que sai do lugar quando uma tela muda de pai
    const b = p.querySelector('.item.back') as HTMLButtonElement | null
    this.escBack = b ? () => b.click() : null
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
    const start = performance.now()
    let raf = 0
    const paint = () => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      const w = cv.clientWidth || 200, h = cv.clientHeight || 200
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
      const c = cv.getContext('2d')
      if (!c) return
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, w, h)
      drawPortrait(c, w / 2, h * 0.58, Math.min(w, h) * k, this.cfg.look, (performance.now() - start) / 1000)
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    this.cleanup = () => cancelAnimationFrame(raf)
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
    const cfg = this.cfg
    const cv = this.portraitCanvas()
    this.panel(
      el('div', { class: 'home' },
        el('div', { class: 'home-id' }, this.brand(), cv),
        el('div', { class: 'home-act' },
          this.act('1 JOGADOR', 'contra o computador, na dificuldade dos ajustes',
            () => { cfg.mode = 'bot'; this.handlers.onStart(cfg) }, 'go'),
          this.act('ONLINE', 'sala direta entre vocês, sem servidor no meio',
            () => this.online()),
          this.act('2 JOGADORES', 'os dois no mesmo teclado',
            () => { cfg.mode = 'local'; this.handlers.onStart(cfg) }),
          el('div', { class: 'minor' },
            this.item('MEU BLOBBY', 'cor, cabelo e cor do cabelo', () => this.blobby()),
            this.item('AJUSTES', 'nome, regra, cenário, gráficos e som', () => this.settings()),
            this.item('RANKING', 'só partida online pontua', () => this.ranking()),
            this.item('REPLAYS', 'a partida inteira, lance a lance', () => this.replays())),
          this.tipLine('passa o cursor numa opção pra ver o que ela faz'))),
      el('div', { class: 'homefoot' },
        this.keyRow(['A', 'D', 'W', 'S'], 'jogador 1'),
        this.keyRow(['←', '→', '↑', '↓'], 'jogador 2'),
        this.keyRow(['S'], 'toque = manchete, segurar = agachar'),
        this.keyRow(['↓', '←'], 'no chão = mergulho'),
        this.keyRow([], 'bate correndo pro lado e a bola curva pra lá'),
        this.keyRow(['1', '5'], 'emotes'),
        this.keyRow(['ESC'], 'pausa e volta'),
        this.keyRow([], 'controle: direcional anda, ✕/A pula, □/X corta, ☰ pausa')),
    )
    this.runPortrait(cv)
  }

  /** Escolher olhando pro bicho: o retrato ao lado é o mesmo desenho do jogo. */
  blobby() {
    this.currentScreen = () => this.blobby()
    const look = this.cfg.look
    const cv = this.portraitCanvas()
    const pick = (list: { name: string }[]) =>
      list.map((x, i) => [String(i), x.name, ''] as [string, string, string])
    const commit = () => { saveLook(look); this.handlers.onLook(look) }

    this.panel(
      this.title('MEU BLOBBY'),
      el('div', { class: 'dress' },
        cv,
        el('div', { class: 'opts' },
          this.opt('Cor', pick(BODY_COLORS), String(look.body),
            v => { look.body = Number(v); commit() }),
          this.opt('Cabelo', pick(HAIR_STYLES), String(look.hair),
            v => { look.hair = Number(v); commit() }),
          this.opt('Cor do cabelo', pick(HAIR_COLORS), String(look.hairColor),
            v => { look.hairColor = Number(v); commit() }))),
      this.tipLine('vale contra o computador, no 2 jogadores e no online'),
      this.back(() => this.main()),
    )
    this.runPortrait(cv)
  }

  /** Partida inteira cabe em ~3 KB de input: dá pra guardar tudo e reproduzir exato. */
  replays() {
    this.currentScreen = () => this.replays()
    const list = el('div', { class: 'grid rep-list' },
      el('p', { class: 'hint center', textContent: 'carregando…' }))
    const status = el('div', { class: 'status' })
    this.panel(
      this.title('REPLAYS', 'a partida inteira, lance a lance'),
      list,
      status,
      el('div', { class: 'hint foot' }, 'Suas partidas ficam neste aparelho. As online ficam pra todo mundo.'),
      this.back(() => this.main()),
    )

    const render = (cards: ReplayCard[]) => {
      clear(list)
      if (!cards.length) {
        list.append(el('p', { class: 'hint center', textContent: 'nenhum replay ainda. joga uma partida.' }))
        return
      }
      for (const c of cards) list.append(this.replayRow(c))
    }

    const mine = localReplays()
    render(mine)
    void onlineReplays(20).then(rows => {
      const seen = new Set(mine.map(c => c.id))
      render([...mine, ...rows.filter(r => !seen.has(r.id))])
    })
    return status
  }

  private replayRow(c: ReplayCard) {
    const m = c.meta
    const mins = Math.max(1, Math.round((m.frames || 0) / 60 / 60))
    const when = c.at ? new Date(c.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
    const tag = c.local ? (m.mode === 'bot' ? 'vs CPU' : 'local') : 'online'
    return el('button', {
      class: `center room replay${c.local ? ' mine' : ''}`,
      onclick: () => this.handlers.onWatchReplay(c),
    },
      el('span', { class: 'who', textContent: `${m.nl || 'P1'} × ${m.nr || 'P2'}` }),
      el('b', { class: 'sc mono', textContent: `${m.sl}—${m.sr}` }),
      el('small', { class: 'meta', textContent: `${tag} · ${mins} min · rally ${m.rally || 0}${when ? ` · ${when}` : ''}` }))
  }

  ranking() {
    this.currentScreen = () => this.ranking()
    const list = el('div', { class: 'rank-list' },
      el('p', { class: 'hint center', textContent: 'carregando…' }))
    this.panel(
      this.title('RANKING', 'só partidas online valem pontos'),
      list,
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
        el('span', { class: 'who', textContent: r.name }),
        el('span', { class: 'wl mono', textContent: `${r.wins}v ${r.losses}d` }),
        el('b', { class: 'elo mono', textContent: String(r.rating) }))))
    })
  }

  settings() {
    this.currentScreen = () => this.settings()
    const cfg = this.cfg
    const nameIn = el('input', { type: 'text', value: cfg.name, maxLength: 16, class: 'nome' })
    nameIn.addEventListener('input', () => { cfg.name = nameIn.value.trim() || 'Blobby' })
    this.panel(
      this.title('AJUSTES'),
      el('div', { class: 'cols' },
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Partida' }),
          el('div', { class: 'opts' },
            el('div', { class: 'opt' }, el('span', { class: 'lab', textContent: 'Nome' }), nameIn),
            this.opt('Bot', DIFFS, cfg.difficulty, v => { cfg.difficulty = v }),
            this.opt(
              'Regras',
              RULES.map(r => [r.id, r.name, r.desc] as [string, string, string]),
              cfg.ruleId,
              v => { cfg.ruleId = v; cfg.scoreToWin = RULES.find(r => r.id === v)!.scoreToWin }),
            this.opt('Arena', ARENAS, cfg.arena, v => { cfg.arena = v }),
            this.opt('Paredes', WALL_OPTS, cfg.walls ? 'on' : 'off',
              v => { cfg.walls = v === 'on'; this.handlers.onWalls(cfg.walls) }))),
        el('div', {},
          el('h2', { class: 'sec', textContent: 'Apresentação' }),
          el('div', { class: 'opts' },
            this.opt('Cenário', SCENE_LIST, cfg.scene,
              v => { cfg.scene = v; this.handlers.onScene(v) }),
            this.opt('Gráficos', QUALITIES, cfg.quality,
              v => { cfg.quality = v; this.handlers.onQuality(v) }),
            this.opt('FPS', FPS_OPTS, cfg.showFps ? 'on' : 'off',
              v => { cfg.showFps = v === 'on'; this.handlers.onFps(cfg.showFps) })),
          el('h2', { class: 'sec', textContent: 'Som' }),
          el('div', { class: 'opts' }, ...this.volumeRows()))),
      this.tipLine('trilha e efeitos são sintetizados pelo próprio jogo'),
      this.back(() => this.main()),
    )
  }

  online() {
    this.currentScreen = () => this.online()
    const cfg = this.cfg
    cfg.mode = 'online'
    const nameIn = el('input', { type: 'text', value: cfg.name, maxLength: 16 })
    nameIn.addEventListener('input', () => { cfg.name = nameIn.value.trim() || 'Blobby' })
    this.panel(
      this.title('ONLINE'),
      el('div', { class: 'onl' },
        el('h2', { class: 'sec', textContent: 'Seu nome' }),
        nameIn,
        el('div', { class: 'cards', style: 'margin-top:16px' },
          this.card('Criar sala', 'você abre e manda o código pro outro', () => this.createRoom(), 'go'),
          this.card('Entrar', 'lista de salas abertas, ou pelo código', () => this.joinRoom()),
          this.card('Assistir', 'partidas rolando agora, ao vivo', () => this.watchList()))),
      this.netLine(),
      el('div', { class: 'hint foot' }, 'Sem servidor: WebRTC direto entre vocês.'),
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.diag() }, 'Testar minha conexão')),
      this.back(() => { this.handlers.onLeaveOnline(); this.main() }),
    )
    // abre o lobby já aqui: é o que faz a linha de status dizer algo de verdade
    this.cleanup = this.handlers.onWatchRooms(() => { /* só pra manter o canal vivo */ })
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

  createRoom() {
    this.currentScreen = () => this.createRoom()
    const cfg = this.cfg
    const code = el('input', { type: 'text', value: randomCode(), maxLength: 8 })
    const pass = el('input', { type: 'text', value: '', maxLength: 16, placeholder: 'opcional' })
    const status = el('div', { class: 'status' })
    const open = () => {
      const c = code.value.trim().toUpperCase() || 'BLOBBY'
      this.handlers.onCreateRoom(c, pass.value.trim(), cfg)
      this.waiting(c, pass.value.trim())
    }
    this.panel(
      this.title('CRIAR SALA'),
      el('h2', { class: 'sec', textContent: 'Código da sala' }),
      el('div', { class: 'row' },
        code,
        el('button', { class: 'center icon', onclick: () => { code.value = randomCode() } }, '⟳')),
      el('h2', { class: 'sec', textContent: 'Senha' }),
      pass,
      el('div', { class: 'grid', style: 'margin-top:18px' },
        el('button', { class: 'primary', onclick: open }, 'ABRIR SALA')),
      status,
      el('div', { class: 'hint foot' }, 'Você aprova quem entrar. Com senha, a sala fica trancada.'),
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.manual(true) }, 'Conexão direta (sem relay)')),
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
    )
    return status
  }

  waiting(code: string, pass: string) {
    this.currentScreen = () => this.waiting(code, pass)
    const status = el('div', { class: 'status' })
    status.textContent = 'esperando alguém entrar…'
    this.panel(
      this.title('SALA ABERTA'),
      el('div', { class: 'code-big mono', textContent: code }),
      el('div', { class: 'hint center' },
        pass ? `senha: ${pass}` : 'sem senha · qualquer um pode pedir pra entrar'),
      el('div', { class: 'spinner' }),
      status,
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
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

  joinRoom() {
    this.currentScreen = () => this.joinRoom()
    const cfg = this.cfg
    const code = el('input', { type: 'text', value: '', maxLength: 8, placeholder: 'CÓDIGO' })
    const pass = el('input', { type: 'text', value: '', maxLength: 16, placeholder: 'senha (se tiver)' })
    const status = el('div', { class: 'status' })

    const enter = (roomCode: string) => {
      status.textContent = `entrando em ${roomCode}…`
      this.handlers.onJoinRoom(roomCode, pass.value.trim(), cfg)
    }

    const list = el('div', { class: 'grid rooms' })
    const render = (rooms: RoomAd[]) => {
      clear(list)
      const open = rooms.filter(r => !r.live)
      if (!open.length) {
        list.append(el('div', { class: 'hint center', textContent: 'nenhuma sala aberta agora' }))
        return
      }
      for (const r of open) {
        list.append(el('button', { class: 'center room', onclick: () => { code.value = r.code; enter(r.code) } },
          `${r.lock ? '🔒' : '🎾'} ${r.name}`, el('small', { textContent: `${r.code} · ${r.rule}` })))
      }
    }
    render([])

    this.panel(
      this.title('ENTRAR'),
      el('h2', { class: 'sec', textContent: 'Salas abertas' }),
      list,
      this.netLine(),
      el('h2', { class: 'sec', textContent: 'Ou pelo código' }),
      code,
      el('div', { style: 'margin-top:9px' }, pass),
      el('div', { class: 'grid', style: 'margin-top:16px' },
        el('button', {
          class: 'primary',
          onclick: () => enter(code.value.trim().toUpperCase() || 'BLOBBY'),
        }, 'ENTRAR')),
      status,
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.manual(false) }, 'Conexão direta (sem relay)')),
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
    )
    this.cleanup = this.handlers.onWatchRooms(render)
    return status
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
        this.opt('Gráficos', QUALITIES, this.cfg.quality,
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
      this.back(() => { this.handlers.onLeaveOnline(); this.online() }),
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
        this.opt('Cenário', SCENE_LIST, this.cfg.scene,
          v => { this.cfg.scene = v; this.handlers.onScene(v) }),
        this.opt('Paredes', WALL_OPTS, this.cfg.walls ? 'on' : 'off',
          v => this.handlers.onWalls(v === 'on')),
        this.opt('Gráficos', QUALITIES, this.cfg.quality,
          v => { this.cfg.quality = v; this.handlers.onQuality(v) }),
        ...this.volumeRows()),
      this.tipLine('ESC volta pro jogo'),
    )
  }

  /** Online a revanche precisa dos dois lados; local reinicia na hora. */
  result(title: string, subtitle: string, color: string, online = false) {
    this.currentScreen = () => this.result(title, subtitle, color, online)
    this.show()
    const rematch = el('button', { class: 'primary' }, 'REVANCHE')
    rematch.onclick = () => {
      if (!online) { this.handlers.onStart(this.cfg); return }
      rematch.setAttribute('disabled', '')
      rematch.textContent = 'ESPERANDO O OPONENTE…'
      this.handlers.onRematch?.()
    }
    this.panel(
      el('div', { class: 'brand' },
        el('h1', { textContent: title, style: `background:none;-webkit-text-fill-color:${color};color:${color}` }),
        el('p', { textContent: subtitle })),
      el('div', { class: 'grid' },
        rematch,
        el('button', {
          class: 'center',
          onclick: () => { if (online) this.handlers.onLeaveOnline(); this.handlers.onQuit?.() },
        }, 'Menu')),
      el('div', { class: 'status' }),
    )
  }

  status(text: string) {
    const s = this.container.querySelector('.status')
    if (s) s.textContent = text
  }
}
