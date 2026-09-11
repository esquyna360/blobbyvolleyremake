export function makeRng(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

/** Tileable value-noise FBM sampler over a period-N lattice. */
export function tileableFbm(size: number, octaves: number, seed: number) {
  const rng = makeRng(seed)
  const grids: Float32Array[] = []
  const periods: number[] = []
  let p = 4
  for (let o = 0; o < octaves; o++) {
    const g = new Float32Array(p * p)
    for (let i = 0; i < g.length; i++) g[i] = rng()
    grids.push(g)
    periods.push(p)
    p *= 2
  }
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const sample = (o: number, x: number, y: number) => {
    const per = periods[o]
    const g = grids[o]
    const fx = x * per, fy = y * per
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = smooth(fx - x0), ty = smooth(fy - y0)
    const i0 = ((x0 % per) + per) % per, i1 = (i0 + 1) % per
    const j0 = ((y0 % per) + per) % per, j1 = (j0 + 1) % per
    const a = g[j0 * per + i0], b = g[j0 * per + i1]
    const c = g[j1 * per + i0], d = g[j1 * per + i1]
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
  }
  const out = new Float32Array(size * size)
  let amp = 0.5, total = 0
  const amps: number[] = []
  for (let o = 0; o < octaves; o++) { amps.push(amp); total += amp; amp *= 0.5 }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0
      const u = x / size, w = y / size
      for (let o = 0; o < octaves; o++) v += amps[o] * sample(o, u, w)
      out[y * size + x] = v / total
    }
  }
  return out
}

export function heightToNormal(h: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4)
  const at = (x: number, y: number) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      let nx = -dx, ny = -dy, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const i = (y * size + x) * 4
      data[i] = (nx * 0.5 + 0.5) * 255
      data[i + 1] = (ny * 0.5 + 0.5) * 255
      data[i + 2] = (nz * 0.5 + 0.5) * 255
      data[i + 3] = h[y * size + x] * 255
    }
  }
  return data
}
