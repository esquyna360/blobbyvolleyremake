import * as THREE from 'three'
import { COURT_DEPTH, COURT_HALF_W } from './mapping.ts'

export interface Indoor {
  group: THREE.Group
  update(t: number, tension: number): void
}

const HALL_W = 34
const HALL_Z0 = -46
const HALL_Z1 = 26
const HALL_H = 24

function banner(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#101522'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#f4c53a'
  g.fillRect(0, 0, 512, 6)
  g.fillRect(0, 122, 512, 6)
  g.font = 'bold 54px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#f6f8ff'
  g.fillText('BLOBBY LEAGUE', 256, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.repeat.set(8, 1)
  return t
}

/** Casca do ginásio: piso é o terreno, aqui entram paredes, teto e torcida. */
export function createIndoor(): Indoor {
  const group = new THREE.Group()
  group.visible = false

  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.16, 0.18, 0.24), roughness: 0.94, side: THREE.DoubleSide,
  })
  const deckMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.22, 0.24, 0.31), roughness: 0.88,
  })
  const stepMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.30, 0.33, 0.42), roughness: 0.9,
  })

  const back = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W * 2, HALL_H), wallMat)
  back.position.set(0, HALL_H / 2, HALL_Z0)
  group.add(back)

  for (const sgn of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALL_Z1 - HALL_Z0, HALL_H), wallMat)
    w.rotation.y = -sgn * Math.PI / 2
    w.position.set(sgn * HALL_W, HALL_H / 2, (HALL_Z0 + HALL_Z1) / 2)
    group.add(w)
  }

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W * 2, HALL_Z1 - HALL_Z0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.10, 0.11, 0.15), roughness: 1 }))
  ceil.rotation.x = Math.PI / 2
  ceil.position.set(0, HALL_H, (HALL_Z0 + HALL_Z1) / 2)
  group.add(ceil)

  const bannerMat = new THREE.MeshBasicMaterial({ map: banner(), toneMapped: false })
  const bn = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W * 2, 2.6), bannerMat)
  bn.position.set(0, 9.4, HALL_Z0 + 0.06)
  group.add(bn)

  // --- arquibancada: degraus subindo dos dois lados ---
  const STEPS = 7
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < STEPS; i++) {
      const y = 0.55 + i * 1.05
      const x = sgn * (COURT_HALF_W + 4.2 + i * 1.5)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, COURT_DEPTH + 22), i % 2 ? deckMat : stepMat)
      deck.position.set(x, y / 2, -6)
      deck.receiveShadow = true
      group.add(deck)
    }
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.1, COURT_DEPTH + 22),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.58, 0.66), metalness: 0.6, roughness: 0.4 }))
    rail.position.set(sgn * (COURT_HALF_W + 3.5), 1.15, -6)
    group.add(rail)
  }

  // --- torcida da arquibancada ---
  const fanGeo = new THREE.SphereGeometry(0.3, 12, 9)
  fanGeo.scale(1, 1.2, 1)
  const FANS = 220
  const fans = new THREE.InstancedMesh(
    fanGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), FANS)
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const fanBase: { x: number; y: number; z: number; ph: number }[] = []
  const col = new THREE.Color()
  for (let i = 0; i < FANS; i++) {
    const sgn = i % 2 === 0 ? -1 : 1
    const row = Math.floor(i / 2) % STEPS
    const k = Math.floor(i / (2 * STEPS))
    const x = sgn * (COURT_HALF_W + 4.2 + row * 1.5)
    const z = -17 + k * 2.05 + (i % 3) * 0.4
    fanBase.push({ x, y: 0.55 + row * 1.05 + 0.34, z, ph: (i * 2.399) % 6.283 })
    col.setHSL((i * 0.137) % 1, 0.5, 0.5)
    fans.setColorAt(i, col)
  }
  if (fans.instanceColor) fans.instanceColor.needsUpdate = true
  group.add(fans)

  // --- refletores e cones de luz ---
  const coneMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.96, 0.84), transparent: true, opacity: 0.055,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  })
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.97, 0.88), fog: false })
  const lamps: THREE.Mesh[] = []
  for (const sx of [-13, -4.4, 4.4, 13]) {
    for (const sz of [-16, 2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.0), lampMat)
      lamp.position.set(sx, HALL_H - 1.4, sz)
      group.add(lamp)
      lamps.push(lamp)

      const cone = new THREE.Mesh(new THREE.ConeGeometry(6.4, HALL_H - 1.6, 20, 1, true), coneMat)
      cone.position.set(sx, (HALL_H - 1.6) / 2, sz)
      cone.renderOrder = 4
      group.add(cone)
    }
  }

  const m = new THREE.Matrix4()
  return {
    group,
    update(t, tension) {
      if (!group.visible) return
      const amp = 0.06 + tension * 0.22
      for (let i = 0; i < FANS; i++) {
        const b = fanBase[i]
        m.makeTranslation(b.x, b.y + Math.abs(Math.sin(t * (2.2 + tension * 2.4) + b.ph)) * amp, b.z)
        fans.setMatrixAt(i, m)
      }
      fans.instanceMatrix.needsUpdate = true
      coneMat.opacity = 0.05 + tension * 0.05 + Math.sin(t * 1.3) * 0.006
    },
  }
}
