import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { hairHex, hairStyle, puffCenter, shade, tuftBeads } from '../core/looks.ts'
import type { Bead, PlayerLook } from '../core/looks.ts'

/** Lados da seção da mecha. Oito já lê redondo no tamanho que ela aparece. */
const RING = 8

/**
 * Mecha como tubo de raio variável: a curva e a espessura são as mesmas que o
 * 2D usa, então o penteado é o mesmo desenho nos dois renderizadores.
 */
function tubeGeometry(beads: Bead[]): THREE.BufferGeometry {
  const n = beads.length
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const b = beads[i]
    const a = beads[Math.max(0, i - 1)], c = beads[Math.min(n - 1, i + 1)]
    let tx = c.x - a.x, ty = c.y - a.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len; ty /= len
    for (let j = 0; j < RING; j++) {
      const th = (j / RING) * Math.PI * 2
      const cs = Math.cos(th), sn = Math.sin(th)
      const dx = -ty * cs, dy = tx * cs, dz = sn
      pos.push(b.x + dx * b.hw, b.y + dy * b.hw, dz * b.hw)
      nor.push(dx, dy, dz)
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * RING + j
      const b = i * RING + ((j + 1) % RING)
      idx.push(a, b, a + RING, b, b + RING, a + RING)
    }
  }
  const tip = beads[n - 1]
  const tipAt = pos.length / 3
  pos.push(tip.x, tip.y, 0)
  nor.push(0, 0, 1)
  for (let j = 0; j < RING; j++) {
    idx.push((n - 1) * RING + j, (n - 1) * RING + ((j + 1) % RING), tipAt)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

export interface Hair3D {
  group: THREE.Group
  set(look: PlayerLook): void
  dispose(): void
}

/**
 * O cabelo mora num grupo próprio dentro do blob, na altura da cabeça e com a
 * mesma deformação dela — assim ele agacha, estica e tomba junto com o corpo.
 */
export function createHair3D(castShadow: boolean): Hair3D {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x221d2a, roughness: 0.62, metalness: 0.04,
    emissive: 0x000000, emissiveIntensity: 1,
  })
  let mesh: THREE.Mesh | null = null
  let current = -1

  const build = (look: PlayerLook) => {
    if (mesh) { group.remove(mesh); mesh.geometry.dispose(); mesh = null }
    const st = hairStyle(look)
    const parts: THREE.BufferGeometry[] = []
    for (const t of st.tufts) parts.push(tubeGeometry(tuftBeads(t)))
    for (const p of st.puffs) {
      const s = new THREE.SphereGeometry(p.r, 10, 8)
      // a mecha só tem posição e normal: uv sobrando faz o merge devolver nada
      s.deleteAttribute('uv')
      const q = puffCenter(p)
      s.translate(q.x, q.y, 0)
      parts.push(s)
    }
    if (!parts.length) return
    const geo = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    if (!geo) return
    mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = castShadow
    mesh.frustumCulled = false
    group.add(mesh)
  }

  return {
    group,
    set(look) {
      if (look.hair !== current) { current = look.hair; build(look) }
      const hex = hairHex(look)
      mat.color.set(hex)
      // cabelo escuro sumia nas cenas noturnas: um resto de emissão o mantém lido
      mat.emissive.set(shade(hex, 0.34))
    },
    dispose() {
      if (mesh) mesh.geometry.dispose()
      mat.dispose()
    },
  }
}
