import { el, clear } from './dom.ts'
import { RULES } from '../core/logic.ts'
import { VOLUMES } from '../audio/audio.ts'
import type { VolumeId } from '../audio/audio.ts'
import type { Difficulty } from '../ai/bot.ts'
import type { RoomAd } from '../net/lobby.ts'

export interface GameConfig {
  mode: 'bot' | 'local' | 'online'
  difficulty: Difficulty
  ruleId: string
  scoreToWin: number
  quality: 'cpu' | 'low' | 'medium' | 'high' | 'ultra'
  name: string
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'bot', difficulty: 'normal', ruleId: 'default',
  scoreToWin: 15, quality: 'high', name: 'Blobby',
}

const DIFFS: [Difficulty, string, string][] = [
  ['easy', 'Fácil', 'aquecimento'],
  ['normal', 'Normal', 'jogo justo'],
  ['hard', 'Difícil', 'vai suar'],
  ['insane', 'Insano', 'boa sorte'],
]

const QUALITIES: [GameConfig['quality'], string, string][] = [
  ['cpu', '2D', 'só CPU, sem 3D'],
  ['low', 'Baixa', 'PC fraco'],
  ['medium', 'Média', 'sombra + bloom'],
  ['high', 'Alta', 'god rays'],
  ['ultra', 'Ultra', 'tudo no talo'],
]

const randomCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('')
}

export interface MenuHandlers {
  onStart(cfg: GameConfig): void
  onJoinRoom(code: string, cfg: GameConfig): void
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
}

export class Menu {
  root: HTMLElement
  cfg: GameConfig
  private handlers: MenuHandlers
  private container: HTMLElement

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

  private cleanup: (() => void) | null = null

  private panel(...children: (Node | string)[]) {
    if (this.cleanup) { this.cleanup(); this.cleanup = null }
    clear(this.container)
    this.container.append(el('div', { class: 'panel' }, ...children))
  }

  private brand() {
    return el('div', { class: 'brand' },
      el('h1', {}, 'BLOBBY', el('br'), 'VOLLEY'),
      el('p', { textContent: 'remake · three.js · p2p rollback' }))
  }

  private selector<T extends string>(
    items: [T, string, string][], current: T, onPick: (v: T) => void, cls = 'grid four',
  ) {
    const wrap = el('div', { class: cls })
    for (const [id, label, desc] of items) {
      const b = el('button', {
        class: id === current ? 'sel' : '', onclick: () => { onPick(id); this.refresh() },
      }, label, el('small', { textContent: desc }))
      wrap.append(b)
    }
    return wrap
  }

  private graphicsSection() {
    return [
      el('h2', { class: 'sec', textContent: 'Gráficos' }),
      this.selector(QUALITIES, this.cfg.quality, v => {
        this.cfg.quality = v
        this.handlers.onQuality(v)
      }, 'grid five'),
    ]
  }

  private soundSection() {
    return [
      el('h2', { class: 'sec', textContent: 'Som' }),
      this.selector(
        VOLUMES as [VolumeId, string, string][],
        this.handlers.getVolume(),
        v => this.handlers.onVolume(v)),
    ]
  }

  private currentScreen: () => void = () => this.main()
  private refresh() { this.currentScreen() }

  main() {
    this.currentScreen = () => this.main()
    const cfg = this.cfg
    this.panel(
      this.brand(),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => { cfg.mode = 'bot'; this.handlers.onStart(cfg) } },
          '1 JOGADOR'),
        el('div', { class: 'grid two' },
          el('button', { class: 'center', onclick: () => { cfg.mode = 'local'; this.handlers.onStart(cfg) } },
            '2 Jogadores', el('small', { textContent: 'mesmo teclado' })),
          el('button', { class: 'center', onclick: () => this.online() },
            'Online P2P', el('small', { textContent: 'rollback netcode' })))),

      el('h2', { class: 'sec', textContent: 'Dificuldade do bot' }),
      this.selector(DIFFS, cfg.difficulty, v => { cfg.difficulty = v }),

      el('h2', { class: 'sec', textContent: 'Regras' }),
      this.selector(
        RULES.map(r => [r.id, r.name, r.desc] as [string, string, string]),
        cfg.ruleId,
        v => {
          cfg.ruleId = v
          cfg.scoreToWin = RULES.find(r => r.id === v)!.scoreToWin
        }, 'grid two'),

      ...this.graphicsSection(),
      ...this.soundSection(),

      el('div', { class: 'hint', style: 'margin-top:18px' },
        el('div', {}, 'P1 ', el('kbd', { textContent: 'A' }), ' ', el('kbd', { textContent: 'D' }),
          ' ', el('kbd', { textContent: 'W' }), '   ·   P2 ',
          el('kbd', { textContent: '←' }), ' ', el('kbd', { textContent: '→' }), ' ', el('kbd', { textContent: '↑' })),
        el('div', { style: 'margin-top:6px;opacity:.75' }, 'Gamepad e toque também funcionam. ',
          el('kbd', { textContent: 'ESC' }), ' pausa.')),
    )
  }

  online() {
    this.currentScreen = () => this.online()
    const cfg = this.cfg
    const code = el('input', { type: 'text', value: randomCode(), maxLength: 8 })
    const nameIn = el('input', { type: 'text', value: cfg.name, maxLength: 16 })
    const status = el('div', { class: 'status' })

    const list = el('div', { class: 'grid rooms' })
    const enter = (roomCode: string) => {
      cfg.name = nameIn.value.trim() || 'Blobby'
      cfg.mode = 'online'
      status.textContent = `entrando em ${roomCode}…`
      this.handlers.onJoinRoom(roomCode, cfg)
    }
    const render = (rooms: RoomAd[]) => {
      clear(list)
      if (!rooms.length) {
        list.append(el('div', { class: 'hint', textContent: 'nenhuma sala aberta agora — crie a sua abaixo' }))
        return
      }
      for (const r of rooms) {
        list.append(el('button', { class: 'center room', onclick: () => enter(r.code) },
          `🎾 ${r.name}`, el('small', { textContent: `${r.code} · ${r.rule}` })))
      }
    }
    render([])

    this.panel(
      this.brand(),
      el('h2', { class: 'sec', textContent: 'Seu nome' }),
      nameIn,
      el('h2', { class: 'sec', textContent: 'Salas abertas' }),
      list,
      el('h2', { class: 'sec', textContent: 'Criar / entrar por código' }),
      el('div', { class: 'row' },
        code,
        el('button', {
          class: 'center', style: 'flex:0 0 auto;padding:13px 14px',
          onclick: () => { code.value = randomCode() },
        }, '⟳')),
      el('div', { class: 'hint', style: 'margin-top:9px' },
        'Sua sala aparece na lista de todo mundo enquanto você espera. Signaling via relays Nostr, o jogo em si é WebRTC direto.'),
      el('div', { style: 'margin-top:16px' },
        el('button', {
          class: 'primary', onclick: () => enter(code.value.trim().toUpperCase() || 'BLOBBY'),
        }, 'ABRIR SALA')),
      status,
      el('h2', { class: 'sec', textContent: 'Sem relay (conexão direta)' }),
      el('div', { class: 'grid two' },
        el('button', { class: 'center', onclick: () => this.manual(true) }, 'Criar convite', el('small', { textContent: 'você é o host' })),
        el('button', { class: 'center', onclick: () => this.manual(false) }, 'Colar convite', el('small', { textContent: 'você entra' }))),
      el('div', { style: 'margin-top:16px' },
        el('button', {
          class: 'ghost center',
          onclick: () => { this.handlers.onLeaveOnline(); this.main() },
        }, '← Voltar')),
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
      this.brand(),
      el('h2', { class: 'sec', textContent: asHost ? '1. Mande este código' : '2. Mande sua resposta' }),
      mine,
      el('button', {
        class: 'center', style: 'margin-top:8px',
        onclick: () => { void navigator.clipboard.writeText(mine.value); status.textContent = 'copiado' },
      }, 'Copiar'),
      el('h2', { class: 'sec', textContent: asHost ? '2. Cole a resposta dele' : '1. Cole o código do host' }),
      theirs,
      el('button', {
        class: 'primary', style: 'margin-top:10px',
        onclick: () => {
          status.textContent = 'conectando…'
          handle.accept(theirs.value).then(
            () => { status.textContent = 'negociando…' },
            () => { status.textContent = 'código inválido' })
        },
      }, 'CONECTAR'),
      status,
      el('div', { style: 'margin-top:14px' },
        el('button', { class: 'ghost center', onclick: () => this.online() }, '← Voltar')),
    )
    return status
  }

  pause() {
    this.currentScreen = () => this.pause()
    this.show()
    this.panel(
      el('div', { class: 'brand' }, el('h1', { textContent: 'PAUSA' })),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => this.handlers.onResume?.() }, 'CONTINUAR'),
        el('button', { class: 'center', onclick: () => this.handlers.onQuit?.() }, 'Sair para o menu')),
      ...this.graphicsSection(),
      ...this.soundSection(),
    )
  }

  result(title: string, subtitle: string, color: string) {
    this.currentScreen = () => this.result(title, subtitle, color)
    this.show()
    this.panel(
      el('div', { class: 'brand' },
        el('h1', { textContent: title, style: `background:none;-webkit-text-fill-color:${color};color:${color}` }),
        el('p', { textContent: subtitle })),
      el('div', { class: 'grid' },
        el('button', { class: 'primary', onclick: () => this.handlers.onStart(this.cfg) }, 'REVANCHE'),
        el('button', { class: 'center', onclick: () => this.main() }, 'Menu')),
    )
  }

  status(text: string) {
    const s = this.container.querySelector('.status')
    if (s) s.textContent = text
  }
}
