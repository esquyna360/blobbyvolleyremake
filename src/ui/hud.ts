import { el } from './dom.ts'
import { LEFT, RIGHT } from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import type { NetStats } from '../net/session.ts'

/** Antes disso é troca normal de bola, não vale ocupar tela. */
const RALLY_MIN = 6
const RALLY_HOLD = 1900

/**
 * Estalo de escala. Reiniciar uma animação de CSS exige escrever a classe, ler
 * `offsetWidth` pra forçar o reflow e escrever de novo — e esse reflow síncrono
 * cai no meio do quadro, com o canvas do jogo esperando. A Web Animations API
 * reinicia sem tocar em layout.
 */
const bumps = new WeakMap<HTMLElement, Animation>()

function bump(node: HTMLElement, from: number, ms: number, keep = '') {
  // um toque por quadro no rally longo empilharia animação sobre animação
  bumps.get(node)?.cancel()
  bumps.set(node, node.animate(
    [{ transform: `${keep}scale(${from})` }, { transform: `${keep}scale(1)` }],
    { duration: ms, easing: 'cubic-bezier(.2,1.6,.4,1)' },
  ))
}

export class Hud {
  root: HTMLElement
  private ptsL: HTMLElement
  private ptsR: HTMLElement
  private nameL: HTMLElement
  private nameR: HTMLElement
  private ruleEl: HTMLElement
  private dots: HTMLElement[] = []
  private touchesL: HTMLElement[] = []
  private touchesR: HTMLElement[] = []
  private netbar: HTMLElement
  private fpsEl: HTMLElement
  private fpsOn = false
  private fpsAcc = 0
  private fpsN = 0
  private fpsShown = -1
  private lastScore = [-1, -1]
  private lastCharge = [-1, -1]
  private lastReady = [false, false]
  private netAt = 0
  private netKey = ''
  private rallyEl: HTMLElement
  private rallyBase = 0
  private rallyShown = -1
  private rallyRec = false
  private rallyHide = 0 as unknown as ReturnType<typeof setTimeout>
  private lives: HTMLElement[] = []
  private livesEl: HTMLElement
  private barL!: HTMLElement
  private barR!: HTMLElement
  private fillL!: HTMLElement
  private fillR!: HTMLElement

  constructor(parent: HTMLElement) {
    this.ptsL = el('span', { class: 'pts', textContent: '0' })
    this.ptsR = el('span', { class: 'pts', textContent: '0' })
    this.nameL = el('span', { class: 'name', textContent: 'P1' })
    this.nameR = el('span', { class: 'name', textContent: 'P2' })
    this.ruleEl = el('span', { class: 'rule', textContent: 'clássico' })

    for (let i = 0; i < 2; i++) this.dots.push(el('i'))
    for (let i = 0; i < 3; i++) this.touchesL.push(el('i'))
    for (let i = 0; i < 3; i++) this.touchesR.push(el('i'))

    this.fillL = el('i')
    this.fillR = el('i')
    this.barL = el('div', { class: 'charge l' }, this.fillL,
      el('u'), el('b', { textContent: 'ESPECIAL' }))
    this.barR = el('div', { class: 'charge r' }, this.fillR,
      el('u'), el('b', { textContent: 'ESPECIAL' }))

    const left = el('div', { class: 'side l' }, this.nameL, this.ptsL,
      el('div', { class: 'touches' }, ...this.touchesL))
    const right = el('div', { class: 'side r' }, this.nameR, this.ptsR,
      el('div', { class: 'touches' }, ...this.touchesR))
    for (let i = 0; i < 3; i++) this.lives.push(el('i', { textContent: '\u2665' }))
    this.livesEl = el('div', { class: 'lives' }, ...this.lives)

    const mid = el('div', { class: 'mid' },
      el('span', { class: 'sep', textContent: '—' }),
      el('div', { class: 'serve-dots' }, ...this.dots),
      this.livesEl,
      this.ruleEl)

    this.netbar = el('div', { class: 'netbar mono' })
    this.netbar.style.display = 'none'

    this.fpsEl = el('div', { class: 'fps mono' })
    this.fpsEl.style.display = 'none'

    this.rallyEl = el('div', { class: 'rally mono' })

    this.root = el('div', { class: 'hud' },
      el('div', { class: 'score-card' }, left, mid, right), this.rallyEl, this.barL, this.barR)
    parent.append(this.root, this.netbar, this.fpsEl)
  }

  setFps(on: boolean) {
    if (on === this.fpsOn) return
    this.fpsOn = on
    this.fpsEl.style.display = on ? '' : 'none'
    this.fpsAcc = 0
    this.fpsN = 0
    this.fpsShown = -1
    document.body.classList.toggle('fps-on', on)
  }

  /** Média de ~0.4s: número por frame só serviria pra piscar. */
  tickFps(dt: number) {
    if (!this.fpsOn) return
    this.fpsAcc += dt
    this.fpsN++
    if (this.fpsAcc < 0.4) return
    const fps = Math.round(this.fpsN / this.fpsAcc)
    this.fpsAcc = 0
    this.fpsN = 0
    if (fps === this.fpsShown) return
    this.fpsShown = fps
    this.fpsEl.textContent = `${fps} FPS`
    this.fpsEl.className = `fps mono${fps < 30 ? ' bad' : fps < 50 ? ' mid' : ''}`
  }

  setNames(l: string, r: string) { this.nameL.textContent = l; this.nameR.textContent = r }

  /**
   * Minigame: um lado só. O placar da direita, os pontinhos de saque e a barra
   * do especial do adversário não têm o que mostrar — somem, e no lugar entram
   * os corações.
   */
  setDrill(on: boolean) {
    this.root.classList.toggle('drill', on)
    if (on) this.nameL.textContent = 'ACERTOS'
  }

  setLives(n: number) {
    for (let i = 0; i < this.lives.length; i++) this.lives[i].classList.toggle('out', i >= n)
  }

  setRule(name: string, stw: number | string) { this.ruleEl.textContent = `${name} · ${stw}` }

  update(scores: number[], touches: number[], serving: number, charge?: number[], stun?: number[]) {
    if (charge) {
      // escrever style.width todo frame reinicia a transition e força repaint da barra
      for (const [i, fill, bar] of [[0, this.fillL, this.barL], [1, this.fillR, this.barR]] as
        [number, HTMLElement, HTMLElement][]) {
        const pct = Math.round(Math.min(1, charge[i]) * 100)
        if (pct !== this.lastCharge[i]) {
          this.lastCharge[i] = pct
          fill.style.width = `${pct}%`
        }
        const ready = charge[i] >= 1
        if (ready !== this.lastReady[i]) {
          this.lastReady[i] = ready
          bar.classList.toggle('ready', ready)
          const lbl = bar.querySelector('b')
          if (lbl) lbl.textContent = ready ? 'PRONTO' : 'ESPECIAL'
        }
      }
    }
    if (stun) {
      this.barL.classList.toggle('stunned', stun[0] > 0)
      this.barR.classList.toggle('stunned', stun[1] > 0)
    }
    for (const [i, node] of [[0, this.ptsL], [1, this.ptsR]] as [number, HTMLElement][]) {
      if (scores[i] !== this.lastScore[i]) {
        node.textContent = String(scores[i])
        bump(node, 1.42, 170)
        this.lastScore[i] = scores[i]
      }
    }
    this.dots[0].classList.toggle('on', serving === LEFT)
    this.dots[1].classList.toggle('on', serving === RIGHT)
    for (let i = 0; i < 3; i++) {
      this.touchesL[i].classList.toggle('on', touches[0] > i)
      this.touchesR[i].classList.toggle('on', touches[1] > i)
    }
  }

  private hideRally() {
    clearTimeout(this.rallyHide)
    this.rallyEl.className = 'rally mono'
    this.rallyEl.textContent = ''
  }

  /**
   * Só aparece quando a troca de bola já está longa. Passou do recorde da
   * partida, vira contador de recorde e sobe a cada toque.
   */
  setRally(rally: number, best: number) {
    if (rally === 0) {
      this.rallyBase = best
      if (this.rallyShown !== 0) {
        this.rallyShown = 0
        this.rallyRec = false
        this.hideRally()
      }
      return
    }
    if (rally === this.rallyShown) return
    this.rallyShown = rally
    if (rally < RALLY_MIN) { this.hideRally(); return }
    const rec = rally > this.rallyBase
    if (rec && !this.rallyRec) {
      this.rallyRec = true
      this.banner('NEW RALLY RECORD', 1500, '#ffd257')
    }
    this.rallyEl.textContent = `${rec ? 'RECORD' : 'RALLY'} ${rally}`
    this.rallyEl.className = `rally mono on${rec ? ' rec' : ''}`
    // não fica plantado na tela: some sozinho se a bola parar de ser tocada
    clearTimeout(this.rallyHide)
    this.rallyHide = setTimeout(() => this.rallyEl.classList.remove('on'), RALLY_HOLD)
    bump(this.rallyEl, 1.34, 180, 'translateX(-50%) ')
  }

  showNet(stats: NetStats | null) {
    if (!stats) {
      if (this.netKey !== '') { this.netKey = ''; this.netbar.style.display = 'none' }
      return
    }
    const now = performance.now()
    if (now - this.netAt < 250) return
    this.netAt = now
    const key = `${stats.rttMs}|${stats.maxRollback}|${stats.frameAdv}|${stats.kind}|${stats.desync}`
    if (key === this.netKey) return
    this.netKey = key
    this.netbar.style.display = ''
    const q = stats.rttMs < 70 ? 'good' : stats.rttMs < 150 ? 'mid' : 'bad'
    this.netbar.innerHTML =
      `<span class="dot ${q}"></span><b>${stats.rttMs}ms</b> ping<br>` +
      `rollback <b>${stats.maxRollback}f</b> · adv <b>${stats.frameAdv > 0 ? '+' : ''}${stats.frameAdv}</b><br>` +
      `<span style="opacity:.7">${stats.kind}</span>` +
      (stats.desync ? '<br><span style="color:#ff6b6b">DESSINCRONIZADO</span>' : '')
  }

  /**
   * Quem desenha os textões, quando o renderizador sabe fazer isso por dentro.
   * Devolve true se assumiu — aí não nasce camada nenhuma por cima do canvas.
   */
  bigSink: ((text: string, kind: 'banner' | 'parry' | 'fatality',
             ms: number, color?: string) => boolean) | null = null
  bigClear: (() => void) | null = null

  banner(text: string, ms = 1400, color?: string) {
    if (this.bigSink?.(text, 'banner', ms + 450, color)) return
    const b = el('div', { class: 'banner', textContent: text })
    if (color) b.style.color = color
    this.root.parentElement!.append(b)
    setTimeout(() => b.classList.add('out'), ms)
    setTimeout(() => b.remove(), ms + 450)
  }

  /** Parry certo: PARRY azul celeste estourando no meio da tela. */
  parry() {
    if (this.bigSink?.('PARRY', 'parry', 1100, '#cdf3ff')) return
    const host = this.root.parentElement!
    host.querySelector('.parry')?.remove()
    const ov = el('div', { class: 'parry' },
      el('div', { class: 'parry-flash' }),
      el('div', { class: 'parry-ring' }),
      el('div', { class: 'parry-word', textContent: 'PARRY' }))
    host.append(ov)
    setTimeout(() => ov.remove(), 1100)
  }

  fatality() {
    if (this.bigSink?.('FATALITY', 'fatality', 4000, '#c81111')) return
    const host = this.root.parentElement!
    host.querySelector('.fatality')?.remove()
    const lite = document.body.classList.contains('lite')
    const drips = el('div', { class: 'fat-drips' })
    for (let i = 0; i < (lite ? 6 : 16); i++) {
      const d = el('i')
      d.style.left = `${Math.random() * 100}%`
      d.style.width = `${4 + Math.random() * 9}px`
      d.style.animationDelay = `${Math.random() * 0.7}s`
      d.style.animationDuration = `${2.4 + Math.random() * 2.2}s`
      drips.append(d)
    }
    const splats = el('div', { class: 'fat-drips' })
    for (let i = 0; i < (lite ? 4 : 9); i++) {
      const sp = el('div', { class: 'fat-splat' })
      const size = 60 + Math.random() * 220
      sp.style.width = `${size}px`
      sp.style.height = `${size * (0.6 + Math.random() * 0.6)}px`
      sp.style.left = `${Math.random() * 90}%`
      sp.style.top = `${Math.random() * 80}%`
      sp.style.animationDelay = `${Math.random() * 0.5}s`
      splats.append(sp)
    }
    const node = el('div', { class: 'fatality' }, splats, drips,
      el('div', { class: 'fat-word', textContent: 'FATALITY' }))
    host.append(node)
    setTimeout(() => node.remove(), 4700)
  }

  /** Overlays de parry/fatality não podem sobrar por cima do menu. */
  clearFx() {
    const host = this.root.parentElement
    if (!host) return
    for (const n of host.querySelectorAll('.parry, .fatality, .banner')) n.remove()
    this.bigClear?.()
    this.rallyShown = -1
    this.rallyRec = false
    this.rallyBase = 0
    this.hideRally()
  }

  scoreOf(side: Side) { return this.lastScore[side] }
  nameOf(side: Side) { return (side === LEFT ? this.nameL : this.nameR).textContent ?? '' }

  /** Selo de transmissão pra quem está assistindo. */
  setLive(on: boolean, label = 'AO VIVO') {
    this.root.classList.toggle('watching', on)
    if (on && !this.liveTag) {
      this.liveTag = el('div', { class: 'livetag' }, el('span', { class: 'livedot' }), label)
      this.root.parentElement?.append(this.liveTag)
    } else if (!on && this.liveTag) {
      this.liveTag.remove()
      this.liveTag = null
    }
  }
  private liveTag: HTMLElement | null = null
}
