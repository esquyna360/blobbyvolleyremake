/**
 * Profundidade do cenário: silhuetas em camadas atrás e na frente dos
 * jogadores. A descrição é matemática pura e mora aqui, então o 2D desenha os
 * mesmos polígonos que o 3D transforma em plano — a cena é a mesma nos dois.
 *
 * Espaço do quadro, não da quadra: x e y em -1..1 sobre o que a câmera
 * enquadra, y pra baixo, centro em 0. A unidade de quadra não serve porque o
 * 3D mostra bem mais dos lados que o 2D, e folha de canto tem que ficar no
 * canto nos dois.
 */

export type DepthId = 'none' | 'praia' | 'luau' | 'gruta'

/**
 * Onde o y = 0 da camada cai. O quadro é o mesmo nos dois renderizadores, mas
 * o horizonte e o chão não: o 3D olha de cima e joga os dois pra bem mais
 * alto que o 2D. Quem nasce no chão precisa dizer isso, senão afunda na areia
 * de um lado e flutua do outro.
 */
export type DepthAnchor = 'frame' | 'horizon' | 'ground'

export interface DepthLayer {
  /** distância em unidades de mundo: < 0 atrás da quadra, > 0 entre ela e a câmera */
  z: number
  anchor: DepthAnchor
  color: string
  alpha: number
  /** polígonos fechados, cada um plano: x0,y0,x1,y1,… */
  poly: number[][]
}

/** Sorteio preso na semente: o cenário tem que nascer igual toda partida. */
function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type R = () => number

/**
 * O eixo x do quadro é mais largo que o y, e a camada é medida nos dois em
 * -1..1: sem dividir o horizontal por isso, toda folha nasce esticada.
 */
const AR = 1.8

/** Fecha o polígono: sobe por uma borda e volta pela outra. */
function weld(a: number[], b: number[]) {
  const out = a.slice()
  for (let i = b.length - 2; i >= 0; i -= 2) out.push(b[i], b[i + 1])
  return out
}

/**
 * Folha comprida presa numa haste que curva. O folíolo sai pra fora e volta
 * um pouco pra trás, que é o que faz o recorte ler como palmeira e não como
 * lasca. `notch` é o quanto a borda afunda entre um folíolo e outro.
 */
function frond(
  x: number, y: number, ang: number, len: number, wid: number,
  leaves: number, bend: number, notch: number, r: R,
) {
  const a: number[] = [], b: number[] = []
  const at = (t: number) => {
    const th = ang + bend * t * t
    return [x + (Math.cos(th) * len * t) / AR, y + Math.sin(th) * len * t, th]
  }
  for (let i = 0; i <= leaves; i++) {
    const t = i / leaves
    const [cx, cy, th] = at(t)
    const nx = -Math.sin(th), ny = Math.cos(th)
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)), 0.55) * (1 - t * 0.35)
    a.push(cx + (nx * w * notch) / AR, cy + ny * w * notch)
    b.push(cx - (nx * w * notch) / AR, cy - ny * w * notch)
    const [tx, ty] = at(Math.max(0, t - 0.045))
    const k = 0.86 + r() * 0.28
    a.push(tx + (nx * w * k) / AR, ty + ny * w * k)
    b.push(tx - (nx * w * k) / AR, ty - ny * w * k)
  }
  return weld(a, b)
}

/** Leque de folhas saindo do mesmo pé: uma só nunca preenche um canto. */
function fan(
  x: number, y: number, a0: number, a1: number, n: number,
  len: number, wid: number, r: R,
) {
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const ang = a0 + (a1 - a0) * t
    const l = len * (0.70 + r() * 0.42)
    const bend = (r() - 0.5) * 0.5 + (ang > 0 ? 0.22 : -0.22)
    out.push(frond(
      x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06,
      ang, l, wid * (0.8 + r() * 0.4), 20, bend, 0.16, r))
  }
  return out
}

/** Espeto: estalactite quando `dir` é 1, estalagmite quando é -1. */
function spike(x: number, y: number, w: number, len: number, dir: number, r: R) {
  const n = 8
  const a: number[] = [], b: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ww = (w * Math.pow(1 - t, 1.35) * (0.80 + r() * 0.4)) / AR
    const yy = y + dir * len * t
    a.push(x - ww, yy)
    b.push(x + ww, yy)
  }
  return weld(a, b)
}

/**
 * Faixa de rocha colada numa borda do quadro. `y0` é a borda, `y1` o miolo:
 * o recorte irregular fica entre os dois.
 */
function band(y0: number, y1: number, jag: number, n: number, r: R, x0 = -1.3, x1 = 1.3) {
  const out = [x0, y0, x1, y0]
  for (let i = n; i >= 0; i--) {
    const t = i / n
    const x = x0 + (x1 - x0) * t
    const d = Math.sin(t * 9.1 + 0.7) * 0.32 + Math.sin(t * 21.3) * 0.18 + r() * 0.5
    out.push(x, y1 + d * jag)
  }
  return out
}

/** Morro liso: ilha longe, duna, lombada de rocha. */
function hump(cx: number, y: number, w: number, h: number, dir = 1) {
  const out: number[] = []
  const n = 22
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = cx - w + 2 * w * t
    out.push(x, y - dir * h * Math.pow(Math.sin(Math.PI * t), 0.72))
  }
  out.push(cx + w, y, cx - w, y)
  return out
}

/** Coqueiro inteiro: tronco curvo e a coroa de folhas. */
function palm(x: number, y: number, h: number, lean: number, r: R, scale = 1) {
  const out: number[][] = []
  const tipX = x + (lean * h) / AR, tipY = y - h
  const tw = 0.010 * scale
  const trunk: number[] = [], back: number[] = []
  const n = 8
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = x + (lean * h * t * t) / AR
    const py = y - h * t
    const w = (tw * (1.5 - t * 0.8)) / AR
    trunk.push(px - w, py)
    back.push(px + w, py)
  }
  out.push(weld(trunk, back))
  const fronds = 6
  for (let i = 0; i < fronds; i++) {
    const a = Math.PI + (i / (fronds - 1)) * Math.PI + (r() - 0.5) * 0.2
    out.push(frond(tipX, tipY, a, (0.10 + r() * 0.05) * scale, 0.030 * scale, 7, a < -Math.PI / 2 ? 0.5 : -0.5, 0.18, r))
  }
  return out
}

/** Cogumelo de gruta: pé fino e chapéu abaulado. */
function mushroom(x: number, y: number, h: number, cap: number, r: R) {
  const st = (cap * 0.19) / AR
  const cw = cap / AR
  const out: number[] = [x - st, y]
  const top = y - h
  out.push(x - st * 0.7, top + cap * 0.12, x - cw, top + cap * 0.30)
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = Math.PI + t * Math.PI
    out.push(x - Math.cos(a) * cw, top + cap * 0.30 + Math.sin(a) * cap * (0.62 + r() * 0.1))
  }
  out.push(x + cw, top + cap * 0.30, x + st * 0.7, top + cap * 0.12, x + st, y)
  return out
}

/** Cipó pendurado, com as folhas ao longo do fio. */
function vine(x: number, y: number, len: number, r: R) {
  const out: number[][] = []
  const a: number[] = [], b: number[] = []
  const n = 12
  const w = 0.006
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = x + (Math.sin(t * 3.4 + x * 9) * 0.035 * t) / AR
    const py = y + len * t
    a.push(px - (w * (1 - t * 0.6)) / AR, py)
    b.push(px + (w * (1 - t * 0.6)) / AR, py)
  }
  out.push(weld(a, b))
  for (let i = 2; i < n; i += 2) {
    const t = i / n
    const px = x + (Math.sin(t * 3.4 + x * 9) * 0.035 * t) / AR
    const py = y + len * t
    const side = i % 4 === 0 ? 1 : -1
    out.push(frond(px, py, side > 0 ? -0.5 : Math.PI + 0.5, 0.075, 0.030, 5, side * 0.6, 0.42, r))
  }
  return out
}

/** Touceira de capim: lâminas retas saindo do mesmo ponto. */
function tuft(x: number, y: number, n: number, h: number, spread: number, r: R) {
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * spread + (r() - 0.5) * 0.14
    const l = h * (0.55 + r() * 0.65)
    out.push(frond(x + (r() - 0.5) * 0.05, y, a, l, 0.020, 4, (r() - 0.5) * 0.9, 0.45, r))
  }
  return out
}

// --------------------------------------------------------------- os cenários

function beach(night: boolean): DepthLayer[] {
  const r = rand(0x5eab17)
  const far: number[][] = [hump(-0.62, 0.03, 0.46, 0.10), hump(0.74, 0.03, 0.38, 0.075)]
  for (const [px, ph] of [[-0.80, 0.085], [-0.52, 0.065], [0.68, 0.072]] as [number, number][]) {
    far.push(...palm(px, -0.045, ph, 0.06, r, 0.75))
  }
  const mid: number[][] = [hump(-1.10, 0.05, 0.50, 0.17), hump(1.18, 0.05, 0.44, 0.145)]
  for (const [px, ph, ln] of [[-0.98, 0.13, 0.05], [-0.82, 0.10, -0.10], [1.08, 0.12, -0.06]] as [number, number, number][]) {
    mid.push(...palm(px, -0.055, ph, ln, r, 1.05))
  }
  const low: number[][] = [
    ...tuft(-0.88, 1.10, 11, 0.44, 1.6, r),
    ...tuft(-0.66, 1.16, 8, 0.32, 1.8, r),
    ...tuft(0.90, 1.10, 11, 0.42, 1.6, r),
    ...tuft(1.08, 1.18, 8, 0.48, 1.3, r),
    ...fan(-1.16, 1.10, -1.30, -0.30, 5, 0.70, 0.11, r),
    ...fan(1.18, 1.12, Math.PI + 0.30, Math.PI + 1.30, 5, 0.68, 0.11, r),
  ]
  const near: number[][] = [
    ...fan(-1.12, -1.20, 0.14, 1.24, 7, 1.00, 0.12, r),
    ...fan(-1.30, -0.72, -0.10, 0.62, 4, 0.74, 0.10, r),
    ...fan(1.14, -1.22, Math.PI - 0.14, Math.PI - 1.24, 7, 1.02, 0.12, r),
    ...fan(1.32, -0.76, Math.PI + 0.10, Math.PI - 0.62, 4, 0.72, 0.10, r),
    ...vine(0.86, -1.05, 0.62, r),
    ...vine(-0.74, -1.05, 0.48, r),
  ]
  return night
    ? [
      { z: -70, anchor: 'horizon', color: '#31456b', alpha: 0.85, poly: far },
      { z: -34, anchor: 'horizon', color: '#161f36', alpha: 0.92, poly: mid },
      { z: 11.5, anchor: 'frame', color: '#05070d', alpha: 1, poly: low },
      { z: 14.5, anchor: 'frame', color: '#020308', alpha: 1, poly: near },
    ]
    : [
      { z: -70, anchor: 'horizon', color: '#8ba6c6', alpha: 0.62, poly: far },
      { z: -34, anchor: 'horizon', color: '#4a678a', alpha: 0.72, poly: mid },
      { z: 11.5, anchor: 'frame', color: '#0b1219', alpha: 1, poly: low },
      { z: 14.5, anchor: 'frame', color: '#04070b', alpha: 1, poly: near },
    ]
}

function cave(): DepthLayer[] {
  const r = rand(0x6c3a91)
  const far: number[][] = []
  for (let i = 0; i < 13; i++) {
    const x = -1.25 + (i / 12) * 2.5
    far.push(spike(x + (r() - 0.5) * 0.12, 0.04, 0.05 + r() * 0.06, 0.10 + r() * 0.26, -1, r))
  }

  const roof: number[][] = [band(-1.3, -0.52, 0.16, 24, r)]
  for (const x of [-1.06, -0.72, -0.34, 0.12, 0.55, 0.94, 1.20]) {
    roof.push(spike(x + (r() - 0.5) * 0.08, -0.52, 0.06 + r() * 0.06, 0.16 + r() * 0.26, 1, r))
  }

  const walls: number[][] = [hump(-1.16, 0.05, 0.48, 0.30), hump(1.22, 0.05, 0.44, 0.26)]
  for (const [x, h, c] of [[-1.02, 0.13, 0.075], [-0.88, 0.09, 0.05], [1.06, 0.15, 0.085], [1.20, 0.10, 0.06]] as [number, number, number][]) {
    walls.push(mushroom(x, -0.02, h, c, r))
  }

  const inner: number[][] = [hump(-1.28, 0.02, 0.38, 0.22), hump(1.32, 0.02, 0.36, 0.19)]
  for (const [x, h, c] of [[-1.04, 0.17, 0.09], [-0.86, 0.11, 0.06], [1.08, 0.19, 0.10], [1.24, 0.13, 0.07]] as [number, number, number][]) {
    inner.push(mushroom(x, 0.02, h, c, r))
  }
  for (const x of [-1.14, -0.66, 0.70, 1.18]) inner.push(spike(x, 0.02, 0.06 + r() * 0.05, 0.14 + r() * 0.14, -1, r))

  const low: number[][] = [band(1.3, 0.90, 0.12, 20, r)]
  for (const [x, h, c] of [[-0.96, 0.34, 0.14], [-0.78, 0.22, 0.10], [0.90, 0.28, 0.125], [1.08, 0.38, 0.16]] as [number, number, number][]) {
    low.push(mushroom(x, 1.00, h, c, r))
  }
  for (const x of [-1.16, -0.60, 0.66, 1.18]) low.push(spike(x, 0.96, 0.07 + r() * 0.05, 0.20 + r() * 0.18, -1, r))

  const near: number[][] = [band(-1.3, -0.80, 0.22, 18, r)]
  for (const [x, w, l] of [[-1.16, 0.26, 1.05], [-0.82, 0.17, 0.66], [-0.46, 0.11, 0.40], [0.50, 0.12, 0.36], [0.86, 0.18, 0.74], [1.20, 0.27, 1.10]] as [number, number, number][]) {
    near.push(spike(x, -0.82, w, l, 1, r))
  }
  near.push(hump(-1.26, 1.06, 0.42, 0.34), hump(1.30, 1.06, 0.38, 0.30))
  near.push(
    ...vine(-0.28, -0.66, 0.52, r), ...vine(0.30, -0.64, 0.44, r),
    ...fan(-1.22, 1.12, -1.30, -0.36, 4, 0.60, 0.105, r),
    ...fan(1.24, 1.14, Math.PI + 0.36, Math.PI + 1.30, 4, 0.58, 0.105, r))

  return [
    { z: -86, anchor: 'horizon', color: '#2f7f86', alpha: 0.42, poly: far },
    { z: -52, anchor: 'frame', color: '#12414c', alpha: 0.80, poly: roof },
    { z: -38, anchor: 'horizon', color: '#0d3038', alpha: 0.85, poly: walls },
    { z: -14, anchor: 'ground', color: '#08222a', alpha: 0.94, poly: inner },
    { z: 11.5, anchor: 'frame', color: '#020a0d', alpha: 1, poly: low },
    { z: 14.5, anchor: 'frame', color: '#000305', alpha: 1, poly: near },
  ]
}

const BUILD: Record<DepthId, () => DepthLayer[]> = {
  none: () => [],
  praia: () => beach(false),
  luau: () => beach(true),
  gruta: cave,
}

const cache = new Map<DepthId, DepthLayer[]>()

/** Geometria pesada de montar e sempre igual: monta uma vez e guarda. */
export function getDepth(id: DepthId): DepthLayer[] {
  let d = cache.get(id)
  if (!d) { d = BUILD[id]().map(l => ({ ...l, poly: l.poly.filter(p => p.length >= 6) })); cache.set(id, d) }
  return d
}

/**
 * Quanto a camada anda em relação à quadra quando a câmera passeia. Sai da
 * própria perspectiva: a `z` vira o tamanho que o plano precisa ter pra ocupar
 * o mesmo pedaço de tela que ocuparia na quadra.
 */
export const depthScale = (z: number, camZ: number) => Math.max(0.05, (camZ - z) / camZ)

/**
 * Régua das distâncias acima: `z` é lido contra ela, então uma camada em 14,5
 * fica a 71% do caminho até a câmera e continua lá se a câmera se afastar. O
 * 2D usa a mesma régua pra deslocar igual.
 */
export const DEPTH_CAM_Z = 20.4
