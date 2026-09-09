import { el } from './dom.ts'
import { LEFT, RIGHT } from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import type { NetStats } from '../net/session.ts'

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
  private lastScore = [-1, -1]

  constructor(parent: HTMLElement) {
    this.ptsL = el('span', { class: 'pts', textContent: '0' })
    this.ptsR = el('span', { class: 'pts', textContent: '0' })
    this.nameL = el('span', { class: 'name', textContent: 'P1' })
    this.nameR = el('span', { class: 'name', textContent: 'P2' })
    this.ruleEl = el('span', { class: 'rule', textContent: 'clássico' })

    for (let i = 0; i < 2; i++) this.dots.push(el('i'))
    for (let i = 0; i < 3; i++) this.touchesL.push(el('i'))
    for (let i = 0; i < 3; i++) this.touchesR.push(el('i'))

    const left = el('div', { class: 'side l' }, this.nameL, this.ptsL,
      el('div', { class: 'touches' }, ...this.touchesL))
    const right = el('div', { class: 'side r' }, this.nameR, this.ptsR,
      el('div', { class: 'touches' }, ...this.touchesR))
    const mid = el('div', { class: 'mid' },
      el('span', { class: 'sep', textContent: '—' }),
      el('div', { class: 'serve-dots' }, ...this.dots),
      this.ruleEl)

    this.netbar = el('div', { class: 'netbar mono' })
    this.netbar.style.display = 'none'

    this.root = el('div', { class: 'hud' }, el('div', { class: 'score-card' }, left, mid, right))
    parent.append(this.root, this.netbar)
  }

  setNames(l: string, r: string) { this.nameL.textContent = l; this.nameR.textContent = r }
  setRule(name: string, stw: number) { this.ruleEl.textContent = `${name} · ${stw}` }

  update(scores: number[], touches: number[], serving: number) {
    for (const [i, node] of [[0, this.ptsL], [1, this.ptsR]] as [number, HTMLElement][]) {
      if (scores[i] !== this.lastScore[i]) {
        node.textContent = String(scores[i])
        node.classList.remove('pop')
        void node.offsetWidth
        node.classList.add('pop')
        setTimeout(() => node.classList.remove('pop'), 170)
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

  showNet(stats: NetStats | null) {
    if (!stats) { this.netbar.style.display = 'none'; return }
    this.netbar.style.display = ''
    const q = stats.rttMs < 70 ? 'good' : stats.rttMs < 150 ? 'mid' : 'bad'
    this.netbar.innerHTML =
      `<span class="dot ${q}"></span><b>${stats.rttMs}ms</b> ping<br>` +
      `rollback <b>${stats.maxRollback}f</b> · adv <b>${stats.frameAdv > 0 ? '+' : ''}${stats.frameAdv}</b><br>` +
      `<span style="opacity:.7">${stats.kind}</span>` +
      (stats.desync ? '<br><span style="color:#ff6b6b">DESSINCRONIZADO</span>' : '')
  }

  banner(text: string, ms = 1400, color?: string) {
    const b = el('div', { class: 'banner', textContent: text })
    if (color) b.style.color = color
    this.root.parentElement!.append(b)
    setTimeout(() => b.classList.add('out'), ms)
    setTimeout(() => b.remove(), ms + 450)
  }

  scoreOf(side: Side) { return this.lastScore[side] }
}
