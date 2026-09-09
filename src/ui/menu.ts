import { el, clear } from './dom.ts'
import { RULES } from '../core/logic.ts'
import { VOLUMES } from '../audio/audio.ts'
import type { VolumeId } from '../audio/audio.ts'
import type { Difficulty } from '../ai/bot.ts'
import type { RoomAd } from '../net/lobby.ts'
import { ARENAS } from '../core/constants.ts'
import type { ArenaId } from '../core/constants.ts'
import { runDiag } from '../net/diag.ts'
import { leaderboard } from '../net/rank.ts'
import type { RankRow } from '../net/rank.ts'

export interface GameConfig {
  mode: 'bot' | 'local' | 'online'
  difficulty: Difficulty
  ruleId: string
  scoreToWin: number
  quality: 'cpu' | 'low' | 'medium' | 'high' | 'ultra'
  name: string
  arena: ArenaId
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'bot', difficulty: 'normal', ruleId: 'default',
  scoreToWin: 15, quality: 'high', name: 'Blobby', arena: 'default',
}

const DIFFS: [Difficulty, string, string][] = [
  ['easy', 'Fácil', ''],
  ['normal', 'Normal', ''],
  ['hard', 'Difícil', ''],
  ['insane', 'Insano', ''],
]

const QUALITIES: [GameConfig['quality'], string, string][] = [
  ['cpu', '2D', ''],
  ['low', 'Baixa', ''],
  ['medium', 'Média', ''],
  ['high', 'Alta', ''],
  ['ultra', 'Ultra', ''],
]

const randomCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('')
}

export interface MenuHandlers {
  onStart(cfg: GameConfig): void
  onCreateRoom(code: string, pass: string, cfg: GameConfig): void
  onJoinRoom(code: string, pass: string, cfg: GameConfig): void
  onManual(asHost: boolean, cfg: GameConfig): {
    local: Promise<string>
    accept(remote: string): Promise<void>
  }
  onResume?(): void
  onQuit?(): void
  getVolume(): VolumeId
  onVolume(v: VolumeId): void
  onQuality(q: GameConfig['quality']): void
  onWatchRooms(cb: (rooms: RoomAd[]) => void): () => void
  onLeaveOnline(): void
  onRematch?(): void
}

export class Menu {
  root: HTMLElement
  cfg: GameConfig
  private handlers: MenuHandlers
  private container: HTMLElement
  private cleanup: (() => void) | null = null
  private currentScreen: () => void = () => this.main()

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
  release() { this.cleanup?.(); this.cleanup = null }

  private panel(...children: (Node | string)[]) {
    if (this.cleanup) { this.cleanup(); this.cleanup = null }
    clear(this.container)
    this.container.append(el('div', { class: 'panel' }, ...children))
  }

  private title(text: string, sub?: string) {
    return el('div', { class: 'brand' },
      el('h1', { textContent: text }),
      sub ? el('p', { textContent: sub }) : el('span'))
  }

  private brand() {
    return el('div', { class: 'brand' },
      el('h1', {}, 'BLOBBY', el('br'), 'VOLLEY'),
      el('p', { class: 'build mono', textContent: `build ${__BUILD__}` }))
  }

  private back(to: () => void) {
    return el('div', { class: 'grid' },
      el('button', { class: 'ghost center back', onclick: to }, '← Voltar'))
  }

  private selector<T extends string>(
    items: [T, string, string][], current: T, onPick: (v: T) => void, cls = 'grid four',
  ) {
    const wrap = el('div', { class: cls })
    for (const [id, label, desc] of items) {
      const b = el('button', {
        class: `chip${id === current ? ' sel' : ''}`,
        onclick: () => { onPick(id); this.refresh() },
      }, label, desc ? el('small', { textContent: desc }) : el('span'))
      wrap.append(b)
    }
    return wrap
  }

  private refresh() { this.currentScreen() }

  // ---------- screens ----------

  main() {
    this.currentScreen = () => this.main()
    const cfg = this.cfg
    this.panel(
      this.brand(),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => { cfg.mode = 'bot'; this.handlers.onStart(cfg) } },
          '1 JOGADOR'),
        el('button', { class: 'primary alt', onclick: () => this.online() }, 'ONLINE'),
        el('button', { class: 'center', onclick: () => { cfg.mode = 'local'; this.handlers.onStart(cfg) } },
          '2 jogadores no mesmo teclado')),
      el('div', { class: 'grid two', style: 'margin-top:10px' },
        el('button', { class: 'ghost center', onclick: () => this.ranking() }, 'Ranking'),
        el('button', { class: 'ghost center', onclick: () => this.settings() }, 'Ajustes')),
      el('div', { class: 'hint foot' },
        el('div', {}, el('kbd', { textContent: 'A' }), el('kbd', { textContent: 'D' }), el('kbd', { textContent: 'W' }),
          ' P1  ·  ',
          el('kbd', { textContent: '←' }), el('kbd', { textContent: '→' }), el('kbd', { textContent: '↑' }), ' P2'),
        el('div', {}, el('kbd', { textContent: '1' }), el('kbd', { textContent: '2' }), el('kbd', { textContent: '3' }),
          ' emotes  ·  ', el('kbd', { textContent: 'ESC' }), ' pausa')),
    )
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
    const nameIn = el('input', { type: 'text', value: cfg.name, maxLength: 16 })
    nameIn.addEventListener('input', () => { cfg.name = nameIn.value.trim() || 'Blobby' })
    this.panel(
      this.title('AJUSTES'),
      el('h2', { class: 'sec', textContent: 'Seu nome' }),
      nameIn,
      el('h2', { class: 'sec', textContent: 'Bot' }),
      this.selector(DIFFS, cfg.difficulty, v => { cfg.difficulty = v }),
      el('h2', { class: 'sec', textContent: 'Regras' }),
      this.selector(
        RULES.map(r => [r.id, r.name, r.desc] as [string, string, string]),
        cfg.ruleId,
        v => { cfg.ruleId = v; cfg.scoreToWin = RULES.find(r => r.id === v)!.scoreToWin },
        'grid two'),
      el('h2', { class: 'sec', textContent: 'Arena' }),
      this.selector(ARENAS, cfg.arena, v => { cfg.arena = v }, 'grid two'),
      el('h2', { class: 'sec', textContent: 'Gráficos' }),
      this.selector(QUALITIES, cfg.quality, v => { cfg.quality = v; this.handlers.onQuality(v) }, 'grid five'),
      el('h2', { class: 'sec', textContent: 'Som' }),
      this.selector(VOLUMES as [VolumeId, string, string][], this.handlers.getVolume(),
        v => this.handlers.onVolume(v)),
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
      el('h2', { class: 'sec', textContent: 'Seu nome' }),
      nameIn,
      el('div', { class: 'grid', style: 'margin-top:18px' },
        el('button', { class: 'primary', onclick: () => this.createRoom() }, 'CRIAR SALA'),
        el('button', { class: 'primary alt', onclick: () => this.joinRoom() }, 'ENTRAR NUMA SALA')),
      el('div', { class: 'hint foot' }, 'Sem servidor: WebRTC direto entre vocês.'),
      el('div', { class: 'grid' },
        el('button', { class: 'ghost center small', onclick: () => this.diag() }, 'Testar minha conexão')),
      this.back(() => { this.handlers.onLeaveOnline(); this.main() }),
    )
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
      if (!rooms.length) {
        list.append(el('div', { class: 'hint center', textContent: 'nenhuma sala aberta agora' }))
        return
      }
      for (const r of rooms) {
        list.append(el('button', { class: 'center room', onclick: () => { code.value = r.code; enter(r.code) } },
          `${r.lock ? '🔒' : '🎾'} ${r.name}`, el('small', { textContent: `${r.code} · ${r.rule}` })))
      }
    }
    render([])

    this.panel(
      this.title('ENTRAR'),
      el('h2', { class: 'sec', textContent: 'Salas abertas' }),
      list,
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
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => this.handlers.onResume?.() }, 'CONTINUAR'),
        el('button', { class: 'center', onclick: () => this.handlers.onQuit?.() }, 'Sair para o menu')),
      el('h2', { class: 'sec', textContent: 'Gráficos' }),
      this.selector(QUALITIES, this.cfg.quality, v => { this.cfg.quality = v; this.handlers.onQuality(v) }, 'grid five'),
      el('h2', { class: 'sec', textContent: 'Som' }),
      this.selector(VOLUMES as [VolumeId, string, string][], this.handlers.getVolume(),
        v => this.handlers.onVolume(v)),
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
