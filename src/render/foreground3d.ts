import * as THREE from 'three'
import type { Foreground } from './scenes.ts'

export interface Foreground3D {
  group: THREE.Group
  setMode(mode: Foreground): void
  update(dt: number, t: number): void
}

function glowTex(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  rad.addColorStop(0, 'rgba(255,246,186,0.95)')
  rad.addColorStop(0.22, 'rgba(255,206,92,0.42)')
  rad.addColorStop(1, 'rgba(255,180,50,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function gullTex(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = '#252a35'
  g.lineWidth = 7
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(8, 44)
  g.quadraticCurveTo(36, 16, 64, 34)
  g.quadraticCurveTo(92, 16, 120, 44)
  g.stroke()
  return new THREE.CanvasTexture(c)
}

interface Bit { x: number; y: number; z: number; vx: number; vy: number; r: number; vr: number; s: number; ph: number }

const RNG = () => Math.random()

/**
 * Camada da frente: passa entre a câmera e a quadra. Vive presa à câmera, então
 * não depende de onde o jogo está olhando.
 */
export function createForeground3D(): Foreground3D {
  const group = new THREE.Group()
  let mode: Foreground = 'gulls'

  const CONF = 38
  const confMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.12, 0.18),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, toneMapped: false }), CONF)
  confMesh.frustumCulled = false
  const col = new THREE.Color()
  for (let i = 0; i < CONF; i++) {
    col.setHSL((i * 0.163) % 1, 0.85, 0.6)
    confMesh.setColorAt(i, col)
  }
  if (confMesh.instanceColor) confMesh.instanceColor.needsUpdate = true
  group.add(confMesh)

  const FLY = 18
  const flyMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      map: glowTex(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }), FLY)
  flyMesh.frustumCulled = false
  group.add(flyMesh)

  const GULL = 4
  const gullMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.5, 0.75),
    new THREE.MeshBasicMaterial({
      map: gullTex(), transparent: true, opacity: 0.72, depthWrite: false,
      side: THREE.DoubleSide, fog: false, toneMapped: false,
    }), GULL)
  gullMesh.frustumCulled = false
  group.add(gullMesh)

  const conf: Bit[] = []
  const fly: Bit[] = []
  const gull: Bit[] = []

  const newConf = (top: boolean): Bit => ({
    x: (RNG() - 0.5) * 15, y: top ? 5 + RNG() * 2.6 : (RNG() - 0.5) * 10, z: -8 - RNG() * 6,
    vx: (RNG() - 0.5) * 0.7, vy: -1.5 - RNG() * 1.6, r: RNG() * 6, vr: (RNG() - 0.5) * 7,
    s: 0.7 + RNG() * 0.8, ph: RNG() * 6.28,
  })
  const newFly = (): Bit => ({
    x: (RNG() - 0.5) * 11, y: (RNG() - 0.5) * 6.4, z: -4.5 - RNG() * 4.5,
    vx: (RNG() - 0.5) * 0.45, vy: (RNG() - 0.5) * 0.3, r: 0, vr: 0,
    s: 0.26 + RNG() * 0.4, ph: RNG() * 6.28,
  })
  const newGull = (spread = false): Bit => {
    const dir = RNG() > 0.5 ? 1 : -1
    return {
      x: spread ? (RNG() - 0.5) * 15 : dir * -8,
      y: 1.6 + RNG() * 3.4, z: -9 - RNG() * 4,
      vx: dir * (1.9 + RNG() * 1.6), vy: 0, r: dir, vr: 0,
      s: 0.6 + RNG() * 0.6, ph: RNG() * 6.28,
    }
  }
  for (let i = 0; i < CONF; i++) conf.push(newConf(false))
  for (let i = 0; i < FLY; i++) fly.push(newFly())
  for (let i = 0; i < GULL; i++) gull.push(newGull(true))

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const sc = new THREE.Vector3()

  return {
    group,
    setMode(next) {
      mode = next
      confMesh.visible = mode === 'confetti'
      flyMesh.visible = mode === 'fireflies'
      gullMesh.visible = mode === 'gulls'
    },
    update(dt, t) {
      if (mode === 'confetti') {
        for (let i = 0; i < CONF; i++) {
          const b = conf[i]
          b.x += (b.vx + Math.sin(t * 1.4 + b.ph) * 0.5) * dt
          b.y += b.vy * dt
          b.r += b.vr * dt
          if (b.y < -5.8) conf[i] = newConf(true)
          v.set(b.x, b.y, b.z)
          e.set(b.r * 0.7, b.r, b.r * 0.4)
          q.setFromEuler(e)
          sc.setScalar(b.s)
          m.compose(v, q, sc)
          confMesh.setMatrixAt(i, m)
        }
        confMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'fireflies') {
        for (let i = 0; i < FLY; i++) {
          const b = fly[i]
          b.x += (b.vx + Math.sin(t * 0.8 + b.ph) * 0.3) * dt
          b.y += (b.vy + Math.cos(t * 0.63 + b.ph * 1.7) * 0.28) * dt
          if (b.x > 6) b.x = -6
          if (b.x < -6) b.x = 6
          if (b.y > 3.6) b.y = -3.6
          if (b.y < -3.6) b.y = 3.6
          const pulse = 0.55 + 0.45 * Math.sin(t * 3.1 + b.ph)
          v.set(b.x, b.y, b.z)
          q.identity()
          sc.setScalar(b.s * (0.6 + pulse * 0.7))
          m.compose(v, q, sc)
          flyMesh.setMatrixAt(i, m)
        }
        flyMesh.instanceMatrix.needsUpdate = true
      } else {
        for (let i = 0; i < GULL; i++) {
          const b = gull[i]
          b.x += b.vx * dt
          b.y += Math.sin(t * 0.9 + b.ph) * 0.12 * dt
          if (b.vx > 0 ? b.x > 8.5 : b.x < -8.5) gull[i] = newGull()
          const flap = Math.sin(t * 6 + b.ph)
          v.set(b.x, b.y, b.z)
          e.set(0, 0, flap * 0.08)
          q.setFromEuler(e)
          sc.set(b.s * (b.r > 0 ? 1 : -1), b.s * (0.62 + Math.abs(flap) * 0.7), b.s)
          m.compose(v, q, sc)
          gullMesh.setMatrixAt(i, m)
        }
        gullMesh.instanceMatrix.needsUpdate = true
      }
    },
  }
}
