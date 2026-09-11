import { hairHex, hairStyle, puffCenter, shade, tuftBeads } from '../core/looks.ts'
import type { Bead, PlayerLook } from '../core/looks.ts'

/** Mecha que nasce perto da orelha passa por trás da cabeça, não por cima. */
const isBack = (a: number) => Math.abs(a) >= 88

interface Pt { x: number; y: number; hw: number }

function place(beads: Bead[], cx: number, cy: number, ru: number, facing: number): Pt[] {
  return beads.map(b => ({ x: cx + facing * b.x * ru, y: cy - b.y * ru, hw: b.hw * ru }))
}

/** Contorno da mecha: os dois lados da curva, um de ida e outro de volta. */
function strandPath(c: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length
  const side = (i: number, s: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    return { x: pts[i].x - (s * dy * pts[i].hw) / len, y: pts[i].y + (s * dx * pts[i].hw) / len }
  }
  c.beginPath()
  const first = side(0, 1)
  c.moveTo(first.x, first.y)
  for (let i = 1; i < n; i++) { const p = side(i, 1); c.lineTo(p.x, p.y) }
  for (let i = n - 1; i >= 0; i--) { const p = side(i, -1); c.lineTo(p.x, p.y) }
  c.closePath()
}

/**
 * O mesmo cabelo do 3D, desenhado em duas camadas: `back` sai antes da cabeça
 * e o resto por cima. As curvas vêm de `looks.ts`, então os dois batem.
 */
export function drawHair2D(
  c: CanvasRenderingContext2D, cx: number, cy: number, ru: number,
  look: PlayerLook, facing: number, back: boolean,
) {
  const st = hairStyle(look)
  if (!st.tufts.length && !st.puffs.length) return
  const base = hairHex(look)
  const edge = shade(base, 0.62)
  const lit = shade(base, 1.24)

  c.save()
  c.lineJoin = 'round'
  c.lineWidth = Math.max(1, ru * 0.035)
  c.strokeStyle = edge
  c.fillStyle = base

  for (const t of st.tufts) {
    if (isBack(t.a) !== back) continue
    strandPath(c, place(tuftBeads(t), cx, cy, ru, facing))
    c.fill()
    c.stroke()
  }
  for (const p of st.puffs) {
    if (isBack(p.a) !== back) continue
    const q = puffCenter(p)
    c.beginPath()
    c.arc(cx + facing * q.x * ru, cy - q.y * ru, p.r * ru, 0, Math.PI * 2)
    c.fill()
    c.stroke()
  }

  // brilho: uma lasca clara no alto de cada massa, senão o cabelo lê como mancha
  c.fillStyle = lit
  c.globalAlpha = 0.5
  for (const p of st.puffs) {
    if (isBack(p.a) !== back) continue
    const q = puffCenter(p)
    c.beginPath()
    c.arc(cx + facing * (q.x - p.r * 0.3) * ru, cy - (q.y + p.r * 0.34) * ru,
      p.r * ru * 0.34, 0, Math.PI * 2)
    c.fill()
  }
  c.restore()
}
