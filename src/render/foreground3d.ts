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

function streakTex(color: string, soft: number): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 8; c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(soft, color)
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(1, 0, 6, 64)
  return new THREE.CanvasTexture(c)
}

function ringTex(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(226,248,255,0.9)'
  g.lineWidth = 5
  g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 3
  g.beginPath(); g.arc(25, 24, 8, 0.6, 2.4); g.stroke()
  return new THREE.CanvasTexture(c)
}

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

  // --- camadas dos cenários novos ---
  const RAIN = 220
  const rainMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.028, 1.0),
    new THREE.MeshBasicMaterial({
      map: streakTex('rgba(198,224,255,0.75)', 0.5), transparent: true, depthWrite: false,
      fog: false, toneMapped: false, side: THREE.DoubleSide,
    }), RAIN)
  rainMesh.frustumCulled = false
  group.add(rainMesh)

  const SPARK = 60
  const sparkMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({
      map: glowTex(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }), SPARK)
  sparkMesh.frustumCulled = false
  {
    const sc = new THREE.Color()
    for (let i = 0; i < SPARK; i++) {
      sc.setHSL((i * 0.11) % 1, 0.95, 0.62)
      sparkMesh.setColorAt(i, sc)
    }
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true
  }
  group.add(sparkMesh)

  const BUBBLE = 90
  const bubbleMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({
      map: ringTex(), transparent: true, opacity: 0.55, depthWrite: false,
      fog: false, toneMapped: false,
    }), BUBBLE)
  bubbleMesh.frustumCulled = false
  group.add(bubbleMesh)

  const DUST = 120
  const dustMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.5, 0.02),
    new THREE.MeshBasicMaterial({
      map: streakTex('rgba(226,196,140,0.55)', 0.5), transparent: true, depthWrite: false,
      fog: false, toneMapped: false, side: THREE.DoubleSide,
    }), DUST)
  dustMesh.frustumCulled = false
  group.add(dustMesh)

  const PIXEL = 70
  const pixelMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.11, 0.11),
    new THREE.MeshBasicMaterial({
      color: 0x9bbc0f, transparent: true, opacity: 0.4, depthWrite: false,
      fog: false, toneMapped: false,
    }), PIXEL)
  pixelMesh.frustumCulled = false
  group.add(pixelMesh)

  const BIRD = 7
  const birdMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.9, 0.45),
    new THREE.MeshBasicMaterial({
      map: gullTex(), transparent: true, opacity: 0.45, depthWrite: false,
      side: THREE.DoubleSide, fog: false, toneMapped: false,
    }), BIRD)
  birdMesh.frustumCulled = false
  group.add(birdMesh)

  const conf: Bit[] = []
  const fly: Bit[] = []
  const gull: Bit[] = []
  const rain: Bit[] = []
  const spark: Bit[] = []
  const bubble: Bit[] = []
  const dust: Bit[] = []
  const pixel: Bit[] = []
  const bird: Bit[] = []

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
  const newRain = (top: boolean): Bit => ({
    x: (RNG() - 0.5) * 20, y: top ? 6 + RNG() * 4 : (RNG() - 0.5) * 13, z: -3 - RNG() * 9,
    vx: -1.4, vy: -17 - RNG() * 9, r: 0, vr: 0, s: 0.6 + RNG() * 1.1, ph: RNG() * 6.28,
  })
  const newSpark = (): Bit => ({
    x: (RNG() - 0.5) * 14, y: -5 - RNG() * 3, z: -4 - RNG() * 6,
    vx: (RNG() - 0.5) * 0.8, vy: 1.6 + RNG() * 2.4, r: 0, vr: 0,
    s: 0.4 + RNG() * 0.9, ph: RNG() * 6.28,
  })
  const newBubble = (): Bit => ({
    x: (RNG() - 0.5) * 16, y: -6 - RNG() * 4, z: -2.5 - RNG() * 8,
    vx: (RNG() - 0.5) * 0.25, vy: 0.7 + RNG() * 1.5, r: 0, vr: 0,
    s: 0.3 + RNG() * 1.2, ph: RNG() * 6.28,
  })
  const newDust = (): Bit => ({
    x: 9 + RNG() * 6, y: (RNG() - 0.5) * 10, z: -3 - RNG() * 8,
    vx: -6 - RNG() * 7, vy: (RNG() - 0.5) * 0.5, r: 0, vr: 0,
    s: 0.5 + RNG() * 1.4, ph: RNG() * 6.28,
  })
  const newPixel = (): Bit => ({
    x: (RNG() - 0.5) * 16, y: (RNG() - 0.5) * 9, z: -3 - RNG() * 5,
    vx: 0, vy: -0.35 - RNG() * 0.5, r: 0, vr: 0, s: 0.5 + RNG() * 1.6, ph: RNG() * 6.28,
  })
  const newBird = (spread = false): Bit => {
    const dir = RNG() > 0.5 ? 1 : -1
    return {
      x: spread ? (RNG() - 0.5) * 18 : dir * -11,
      y: 2.4 + RNG() * 4.6, z: -12 - RNG() * 7,
      vx: dir * (1.2 + RNG() * 1.1), vy: 0, r: dir, vr: 0,
      s: 0.35 + RNG() * 0.4, ph: RNG() * 6.28,
    }
  }
  for (let i = 0; i < CONF; i++) conf.push(newConf(false))
  for (let i = 0; i < FLY; i++) fly.push(newFly())
  for (let i = 0; i < GULL; i++) gull.push(newGull(true))
  for (let i = 0; i < RAIN; i++) rain.push(newRain(false))
  for (let i = 0; i < SPARK; i++) spark.push(newSpark())
  for (let i = 0; i < BUBBLE; i++) bubble.push(newBubble())
  for (let i = 0; i < DUST; i++) dust.push(newDust())
  for (let i = 0; i < PIXEL; i++) pixel.push(newPixel())
  for (let i = 0; i < BIRD; i++) bird.push(newBird(true))

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
      rainMesh.visible = mode === 'rain'
      sparkMesh.visible = mode === 'sparks'
      bubbleMesh.visible = mode === 'bubbles'
      dustMesh.visible = mode === 'dust'
      pixelMesh.visible = mode === 'pixels'
      birdMesh.visible = mode === 'birds'
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
      } else if (mode === 'rain') {
        for (let i = 0; i < RAIN; i++) {
          const b = rain[i]
          b.x += b.vx * dt
          b.y += b.vy * dt
          if (b.y < -7) rain[i] = newRain(true)
          v.set(b.x, b.y, b.z)
          // o risco deita no sentido da queda: chuva vertical não lê como chuva
          e.set(0, 0, Math.atan2(-b.vx, -b.vy))
          q.setFromEuler(e)
          sc.set(1, b.s * 1.6, 1)
          m.compose(v, q, sc)
          rainMesh.setMatrixAt(i, m)
        }
        rainMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'sparks') {
        for (let i = 0; i < SPARK; i++) {
          const b = spark[i]
          b.x += (b.vx + Math.sin(t * 1.7 + b.ph) * 0.5) * dt
          b.y += b.vy * dt
          if (b.y > 6) spark[i] = newSpark()
          const flick = 0.5 + 0.5 * Math.sin(t * 9 + b.ph * 3)
          v.set(b.x, b.y, b.z)
          q.identity()
          sc.setScalar(b.s * (0.5 + flick * 0.9))
          m.compose(v, q, sc)
          sparkMesh.setMatrixAt(i, m)
        }
        sparkMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'bubbles') {
        for (let i = 0; i < BUBBLE; i++) {
          const b = bubble[i]
          b.x += (b.vx + Math.sin(t * 1.1 + b.ph) * 0.35) * dt
          b.y += b.vy * dt
          if (b.y > 7) bubble[i] = newBubble()
          v.set(b.x, b.y, b.z)
          q.identity()
          sc.setScalar(b.s)
          m.compose(v, q, sc)
          bubbleMesh.setMatrixAt(i, m)
        }
        bubbleMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'dust') {
        for (let i = 0; i < DUST; i++) {
          const b = dust[i]
          b.x += b.vx * dt
          b.y += b.vy * dt
          if (b.x < -12) dust[i] = newDust()
          v.set(b.x, b.y, b.z)
          q.identity()
          sc.set(b.s * 2.2, 1, 1)
          m.compose(v, q, sc)
          dustMesh.setMatrixAt(i, m)
        }
        dustMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'pixels') {
        for (let i = 0; i < PIXEL; i++) {
          const b = pixel[i]
          b.y += b.vy * dt
          if (b.y < -5) { pixel[i] = newPixel(); pixel[i].y = 5 }
          v.set(b.x, b.y, b.z)
          q.identity()
          sc.setScalar(b.s)
          m.compose(v, q, sc)
          pixelMesh.setMatrixAt(i, m)
        }
        pixelMesh.instanceMatrix.needsUpdate = true
      } else if (mode === 'birds') {
        for (let i = 0; i < BIRD; i++) {
          const b = bird[i]
          b.x += b.vx * dt
          b.y += Math.sin(t * 0.7 + b.ph) * 0.2 * dt
          if (b.vx > 0 ? b.x > 11 : b.x < -11) bird[i] = newBird()
          const flap = Math.sin(t * 5 + b.ph)
          v.set(b.x, b.y, b.z)
          e.set(0, 0, flap * 0.06)
          q.setFromEuler(e)
          sc.set(b.s * (b.r > 0 ? 1 : -1), b.s * (0.62 + Math.abs(flap) * 0.7), b.s)
          m.compose(v, q, sc)
          birdMesh.setMatrixAt(i, m)
        }
        birdMesh.instanceMatrix.needsUpdate = true
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
