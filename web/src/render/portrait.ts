import {
  BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE,
} from '../core/constants.ts'
import { bodyHex, shade } from '../core/looks.ts'
import type { PlayerLook } from '../core/looks.ts'
import { drawHair2D } from './hair2d.ts'

const RU = BLOBBY_UPPER_RADIUS
const RL = BLOBBY_LOWER_RADIUS
const OU = BLOBBY_UPPER_SPHERE
const OL = BLOBBY_LOWER_SPHERE

/**
 * O blobby parado, pra escolher a aparência olhando pra ele. Mesmo cabelo do
 * jogo; o corpo é uma versão curta do que o Stage2D desenha.
 */
export type PortraitMood = 'idle' | 'happy' | 'hurt'

export function drawPortrait(
  c: CanvasRenderingContext2D, cx: number, cy: number, size: number,
  look: PlayerLook, t: number, mood: PortraitMood = 'idle',
) {
  const k = size / ((OU + RU + OL + RL) * 0.62)
  const bob = Math.sin(t * 1.7) * 0.03
  const ru = RU * k * (1 - bob * 0.5)
  const rl = RL * k * (1 + bob * 0.4)
  const uy = cy - (OU * k) * (1 - bob)
  const ly = cy + OL * k
  const fill = bodyHex(look)

  c.save()
  c.fillStyle = fill
  c.beginPath()
  c.ellipse(cx, ly, rl, rl * (1 + bob), 0, 0, Math.PI * 2)
  c.fill()

  drawHair2D(c, cx, uy, ru, look, 1, true)

  c.fillStyle = fill
  c.beginPath()
  c.arc(cx, uy, ru, 0, Math.PI * 2)
  c.fill()

  c.fillStyle = 'rgba(255,255,255,0.28)'
  c.beginPath()
  c.arc(cx - ru * 0.34, uy - ru * 0.3, ru * 0.42, 0, Math.PI * 2)
  c.fill()

  c.fillStyle = shade(fill, 0.55)
  c.beginPath()
  c.ellipse(cx, ly + rl * 0.62, rl * 0.86, rl * 0.2, 0, 0, Math.PI * 2)
  c.globalAlpha = 0.28
  c.fill()
  c.globalAlpha = 1

  const line = '#171420'
  const lw = Math.max(1.5, ru * 0.07)
  c.strokeStyle = line
  c.lineWidth = lw
  c.lineCap = 'round'
  if (mood === 'happy') {
    for (const s of [-1, 1]) {
      const ex = cx + ru * s * 0.38, ey = uy - ru * 0.22
      c.beginPath(); c.arc(ex, ey + ru * 0.08, ru * 0.22, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
    }
    c.fillStyle = line
    c.beginPath(); c.ellipse(cx, uy + ru * 0.3, ru * 0.4, ru * 0.3, 0, 0, Math.PI); c.fill()
    c.fillStyle = '#ff7d8f'
    c.beginPath(); c.ellipse(cx, uy + ru * 0.46, ru * 0.22, ru * 0.12, 0, 0, Math.PI); c.fill()
    c.fillStyle = 'rgba(255,90,110,0.35)'
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + ru * s * 0.62, uy + ru * 0.12, ru * 0.16, ru * 0.1, 0, 0, Math.PI * 2); c.fill() }
  } else if (mood === 'hurt') {
    for (const s of [-1, 1]) {
      const ex = cx + ru * s * 0.38, ey = uy - ru * 0.2
      c.beginPath(); c.ellipse(ex, ey, ru * 0.27, ru * 0.2, 0, 0, Math.PI * 2); c.fillStyle = '#f8f8ff'; c.fill()
      c.beginPath(); c.ellipse(ex - s * ru * 0.04, ey + ru * 0.05, ru * 0.11, ru * 0.11, 0, 0, Math.PI * 2); c.fillStyle = '#08080d'; c.fill()
      c.fillStyle = fill
      c.beginPath(); c.rect(ex - ru * 0.3, ey - ru * 0.32, ru * 0.6, ru * 0.22); c.fill()
      c.beginPath(); c.moveTo(ex - s * ru * 0.3, ey - ru * 0.32); c.lineTo(ex + s * ru * 0.26, ey - ru * 0.16); c.stroke()
    }
    c.beginPath(); c.ellipse(cx, uy + ru * 0.42, ru * 0.26, ru * 0.14, 0, Math.PI + 0.2, Math.PI * 2 - 0.2); c.stroke()
    c.fillStyle = '#6fd0ff'
    c.beginPath(); c.ellipse(cx + ru * 0.62, uy + ru * 0.02 + (t * 12 % (ru * 0.5)), ru * 0.06, ru * 0.1, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = 'rgba(120,60,160,0.45)'
    c.beginPath(); c.ellipse(cx - ru * 0.66, uy + ru * 0.2, ru * 0.14, ru * 0.1, 0.4, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#f3e6d0'; c.lineWidth = lw * 0.9
    c.beginPath(); c.moveTo(cx - ru * 0.78, uy - ru * 0.45); c.lineTo(cx - ru * 0.5, uy - ru * 0.7); c.stroke()
    c.beginPath(); c.moveTo(cx - ru * 0.74, uy - ru * 0.62); c.lineTo(cx - ru * 0.56, uy - ru * 0.52); c.stroke()
    c.strokeStyle = line; c.lineWidth = lw
  } else {
    for (const s of [-1, 1]) {
      const ex = cx + ru * s * 0.38
      const ey = uy - ru * 0.24
      c.beginPath(); c.ellipse(ex, ey, ru * 0.29, ru * 0.29, 0, 0, Math.PI * 2)
      c.fillStyle = line; c.fill()
      c.beginPath(); c.ellipse(ex, ey, ru * 0.25, ru * 0.25, 0, 0, Math.PI * 2)
      c.fillStyle = '#f8f8ff'; c.fill()
      c.beginPath(); c.ellipse(ex + ru * 0.03, ey + ru * 0.02, ru * 0.115, ru * 0.115, 0, 0, Math.PI * 2)
      c.fillStyle = '#08080d'; c.fill()
      c.beginPath(); c.ellipse(ex + ru * 0.075, ey - ru * 0.03, ru * 0.038, ru * 0.042, 0, 0, Math.PI * 2)
      c.fillStyle = '#fff'; c.fill()
    }
    c.beginPath()
    c.ellipse(cx, uy + ru * 0.3, ru * 0.3, ru * 0.16, 0, 0.15, Math.PI - 0.15)
    c.stroke()
  }

  drawHair2D(c, cx, uy, ru, look, 1, false)
  c.restore()
}
