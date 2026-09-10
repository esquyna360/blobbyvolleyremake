import * as THREE from 'three'
import { makeRng } from './noise.ts'
import { COURT_DEPTH, COURT_HALF_W, gr, gx, gy } from './mapping.ts'
import { LEFT_PLANE, RIGHT_PLANE } from '../core/constants.ts'
import { CLOUD_HALF_W, cloudX, cloudY } from '../core/scene-rules.ts'
import type { SceneFX } from './scenes.ts'

/**
 * Mobília dos cenários que também são regra. Cada sub-grupo existe uma vez e
 * liga por `setScene`: trocar de cenário não reconstrói nada, só acende outro
 * conjunto. O que a regra faz na física aparece aqui — a nuvem em que a bola
 * quica é um objeto de verdade, o túnel escurece, a rajada avisa antes.
 */

export interface PropsCtx {
  dt: number
  t: number
  /** balanço do navio em -1..1, o mesmo seno que inclina a gravidade */
  tilt: number
  /** 0..1 dentro do compasso e 0..1 dentro do tempo */
  bar: number
  beat: number
  /** nuvens ainda inteiras */
  clouds: readonly [boolean, boolean, boolean]
  /** 0..1 do avanço da partida: é o que faz a lua subir */
  progress: number
  /** metros de paisagem já corridos */
  scroll: number
  tunnel: number
  gustWarn: number
  gust: number
  bubble: number
  rally: number
}

export interface Props {
  group: THREE.Group
  /** preso à câmera: só a moldura do console mora aqui */
  camGroup: THREE.Group
  setScene(fx: SceneFX | undefined): void
  update(ctx: PropsCtx): void
  dispose(): void
}

const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function plankTex() {
  return tex(256, 256, g => {
    g.fillStyle = '#7a5836'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 8; i++) {
      const y = i * 32
      g.fillStyle = i % 2 ? '#86633e' : '#6d4e2f'
      g.fillRect(0, y, 256, 30)
      g.strokeStyle = 'rgba(20,12,6,0.65)'
      g.lineWidth = 2
      g.beginPath(); g.moveTo(0, y + 31); g.lineTo(256, y + 31); g.stroke()
      g.fillStyle = 'rgba(30,18,8,0.28)'
      for (let k = 0; k < 5; k++) {
        const x = (i * 61 + k * 47) % 250
        g.fillRect(x, y + 4, 2, 22)
      }
    }
  })
}

function puffTex() {
  return tex(128, 128, g => {
    const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
    rad.addColorStop(0, 'rgba(255,255,255,0.98)')
    rad.addColorStop(0.55, 'rgba(238,244,255,0.72)')
    rad.addColorStop(1, 'rgba(220,232,255,0)')
    g.fillStyle = rad
    g.fillRect(0, 0, 128, 128)
  })
}

function kelpTex() {
  return tex(64, 256, g => {
    g.clearRect(0, 0, 64, 256)
    g.fillStyle = '#1d6b47'
    g.beginPath()
    g.moveTo(32, 256)
    g.quadraticCurveTo(6, 150, 30, 40)
    g.quadraticCurveTo(46, 10, 34, 0)
    g.lineTo(50, 6)
    g.quadraticCurveTo(58, 140, 44, 256)
    g.fill()
  })
}

function fishTex() {
  return tex(64, 32, g => {
    g.clearRect(0, 0, 64, 32)
    g.fillStyle = '#ffd873'
    g.beginPath()
    g.ellipse(28, 16, 20, 9, 0, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.moveTo(48, 16); g.lineTo(62, 5); g.lineTo(62, 27)
    g.fill()
  })
}

function gbFrameTex() {
  // Só a moldura: o miolo é buraco, senão o console come a quadra.
  return tex(1024, 576, g => {
    g.clearRect(0, 0, 1024, 576)
    g.fillStyle = '#c3c0b4'
    g.fillRect(0, 0, 1024, 576)
    g.fillStyle = '#a9a69b'
    g.fillRect(0, 0, 1024, 8)
    g.fillStyle = '#8d8a80'
    g.fillRect(0, 568, 1024, 8)

    const X = 62, Y = 44, W = 900, H = 420
    g.fillStyle = '#5c5a52'
    g.fillRect(X - 14, Y - 14, W + 28, H + 28)
    g.clearRect(X, Y, W, H)

    g.fillStyle = '#7b2f6b'
    g.font = 'bold 26px monospace'
    g.textAlign = 'center'
    g.fillText('DOT MATRIX WITH STEREO SOUND', 512, 516)
    g.textAlign = 'left'

    g.fillStyle = '#8b1d2e'
    g.beginPath(); g.arc(36, 254, 9, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#3f3d38'
    g.font = 'bold 13px monospace'
    g.save(); g.translate(30, 300); g.rotate(-Math.PI / 2)
    g.fillText('BATTERY', 0, 0); g.restore()
  })
}

function windTex() {
  return tex(256, 128, g => {
    g.clearRect(0, 0, 256, 128)
    const rng = makeRng(33)
    g.lineCap = 'round'
    for (let i = 0; i < 14; i++) {
      const y = 6 + rng() * 116
      const x0 = rng() * 200
      const len = 30 + rng() * 70
      const grad = g.createLinearGradient(x0, 0, x0 + len, 0)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, `rgba(255,255,255,${0.35 + rng() * 0.5})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.strokeStyle = grad
      g.lineWidth = 1.5 + rng() * 2.5
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + len, y); g.stroke()
    }
  })
}

function skylineTex() {
  return tex(512, 256, g => {
    g.clearRect(0, 0, 512, 256)
    const rng = makeRng(9)
    let x = 0
    while (x < 512) {
      const w = 22 + rng() * 46
      const h = 60 + rng() * 170
      g.fillStyle = '#0b0d1a'
      g.fillRect(x, 256 - h, w, h)
      g.fillStyle = 'rgba(120,220,255,0.55)'
      for (let wy = 256 - h + 8; wy < 250; wy += 12) {
        for (let wx = x + 5; wx < x + w - 6; wx += 9) {
          if (rng() > 0.55) g.fillRect(wx, wy, 4, 6)
        }
      }
      x += w + 4 + rng() * 8
    }
  })
}

function mesaTex() {
  return tex(512, 256, g => {
    g.clearRect(0, 0, 512, 256)
    const rng = makeRng(21)
    g.fillStyle = '#8a5236'
    let x = 0
    while (x < 512) {
      const w = 60 + rng() * 110
      const h = 40 + rng() * 130
      g.fillRect(x, 256 - h, w, h)
      g.fillStyle = rng() > 0.5 ? '#9c6040' : '#7a462d'
      x += w - 12
    }
  })
}

export function createProps(): Props {
  const group = new THREE.Group()
  const camGroup = new THREE.Group()
  const rng = makeRng(4242)
  const HW = COURT_HALF_W
  const dispose: (() => void)[] = []

  // ------------------------------------------------------------ convés
  const deck = new THREE.Group()
  const planks = plankTex()
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping
  planks.repeat.set(11, 3)
  const deckMesh = new THREE.Mesh(
    new THREE.BoxGeometry(HW * 3.6, 0.5, COURT_DEPTH + 11),
    new THREE.MeshStandardMaterial({
      map: planks, roughness: 0.82, metalness: 0.02,
      emissive: 0x5a4229, emissiveIntensity: 1.15,
    }))
  deckMesh.position.set(0, -0.24, 1.5)
  deckMesh.receiveShadow = true
  deck.add(deckMesh)
  const deckFill = new THREE.PointLight(0xffc98a, 9, 30)
  deckFill.position.set(0, 7, 3)
  deck.add(deckFill)
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.30, 15, 10),
    new THREE.MeshStandardMaterial({ color: 0x6b4c2e, roughness: 0.8 }))
  mast.position.set(0, 7.4, -0.9)
  deck.add(mast)
  const yard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 7.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4128, roughness: 0.85 }))
  yard.rotation.z = Math.PI / 2
  yard.position.set(0, 11.6, -0.9)
  deck.add(yard)
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, COURT_DEPTH + 2, 6),
      new THREE.MeshStandardMaterial({ color: 0x4d3620, roughness: 0.9 }))
    rail.rotation.x = Math.PI / 2
    rail.position.set(s * (HW + 1.2), 1.05, -0.6)
    deck.add(rail)
    for (let i = -2; i <= 2; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x4d3620, roughness: 0.9 }))
      post.position.set(s * (HW + 1.2), 0.55, -0.6 + i * 2.1)
      deck.add(post)
    }
    const lamp = new THREE.PointLight(0xffb24d, 0, 16)
    lamp.position.set(s * (HW + 1.0), 2.4, 1.2)
    deck.add(lamp)
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }))
    bulb.position.copy(lamp.position)
    deck.add(bulb)
    deck.userData[s > 0 ? 'lampR' : 'lampL'] = lamp
  }
  group.add(deck)

  // -------------------------------------------------------------- rave
  const rave = new THREE.Group()
  const skyMat = new THREE.MeshBasicMaterial({
    map: skylineTex(), transparent: true, depthWrite: false, fog: false, toneMapped: false,
  })
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(120 - i * 26, 26 - i * 5), skyMat.clone())
    m.position.set((i - 1) * 6, 8 - i * 2, -70 + i * 16)
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.35 + i * 0.28
    rave.add(m)
  }
  const laserMat = new THREE.MeshBasicMaterial({
    color: 0x51e0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
  })
  const lasers: THREE.Mesh[] = []
  for (let i = 0; i < 6; i++) {
    const g = new THREE.CylinderGeometry(0.015, 0.7, 40, 5, 1, true)
    g.translate(0, -20, 0)
    const m = new THREE.Mesh(g, laserMat.clone())
    ;(m.material as THREE.MeshBasicMaterial).color.setHSL(i / 6, 0.9, 0.6)
    m.position.set((i - 2.5) * 4.2, 13, -14)
    rave.add(m)
    lasers.push(m)
  }
  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2.6, COURT_DEPTH + 5),
    new THREE.MeshBasicMaterial({
      color: 0xff2fa0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }))
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.position.y = 0.03
  rave.add(floorGlow)
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.2, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x14121c, emissive: 0x2b0a3d, roughness: 0.5 }))
  booth.position.set(0, 0.6, -7.5)
  rave.add(booth)
  group.add(rave)

  // ------------------------------------------------------- fundo do mar
  const deep = new THREE.Group()
  const kelpMat = new THREE.MeshBasicMaterial({
    map: kelpTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false,
  })
  const KELP = 26
  const kelpMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 4.4), kelpMat, KELP)
  kelpMesh.frustumCulled = false
  const kelpSeed: number[] = []
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3()
    for (let i = 0; i < KELP; i++) {
      const x = (rng() - 0.5) * HW * 3.2
      const z = -3 - rng() * 22
      const sc = 0.7 + rng() * 1.5
      kelpSeed.push(rng() * 6.28)
      v.set(x, sc * 2.2 - 0.3, z)
      s.set(sc, sc, sc)
      m.compose(v, q, s)
      kelpMesh.setMatrixAt(i, m)
    }
  }
  deep.add(kelpMesh)
  const FISH = 30
  const fishMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshBasicMaterial({ map: fishTex(), transparent: true, side: THREE.DoubleSide, fog: true }),
    FISH)
  fishMesh.frustumCulled = false
  const fishSeed = Array.from({ length: FISH }, () => [rng(), rng(), rng()] as [number, number, number])
  deep.add(fishMesh)
  for (let i = 0; i < 4; i++) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.68, 5 + rng() * 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x8fa79c, roughness: 0.95 }))
    col.position.set((i - 1.5) * 7.5 + (rng() - 0.5) * 2, 2.4, -13 - rng() * 6)
    col.rotation.z = (rng() - 0.5) * 0.22
    deep.add(col)
  }
  const whale = new THREE.Mesh(
    new THREE.SphereGeometry(6, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x0b2a3d, transparent: true, opacity: 0.5, fog: false }))
  whale.scale.set(3.2, 0.8, 1)
  whale.position.set(-40, 16, -75)
  deep.add(whale)
  const caustics = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 3, COURT_DEPTH + 12),
    new THREE.MeshBasicMaterial({
      color: 0x9ff2ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false,
    }))
  caustics.rotation.x = -Math.PI / 2
  caustics.position.y = 0.04
  deep.add(caustics)
  const bubbleCol: THREE.Mesh[] = []
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 11, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xd8f6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      }))
    // as colunas ficam onde a física empurra: um quarto e três quartos da quadra
    m.position.set(gx(LEFT_PLANE + (RIGHT_PLANE - LEFT_PLANE) * (i ? 0.75 : 0.25)), 5.5, -1.5)
    deep.add(m)
    bubbleCol.push(m)
  }
  group.add(deep)

  // -------------------------------------------------------- topo do trem
  const train = new THREE.Group()
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(HW * 3.6, 0.6, COURT_DEPTH + 11),
    new THREE.MeshStandardMaterial({
      color: 0x7b838f, roughness: 0.55, metalness: 0.15,
      emissive: 0x39404a, emissiveIntensity: 1.0,
    }))
  roof.position.set(0, -0.3, 1.5)
  roof.receiveShadow = true
  train.add(roof)
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, COURT_DEPTH + 11),
      new THREE.MeshStandardMaterial({
        color: 0x596270, roughness: 0.5, metalness: 0.2,
        emissive: 0x272c33, emissiveIntensity: 1.0,
      }))
    rib.position.set(i * (HW / 3.2), 0.03, 1.5)
    train.add(rib)
  }
  const mesaMat = new THREE.MeshBasicMaterial({
    map: mesaTex(), transparent: true, depthWrite: false, fog: true, toneMapped: false,
  })
  mesaMat.map!.wrapS = THREE.RepeatWrapping
  mesaMat.map!.repeat.x = 2
  const mesas: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 30 - i * 7), mesaMat.clone())
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.45 + i * 0.25
    m.position.set(0, 9 - i * 3, -60 + i * 18)
    train.add(m)
    mesas.push(m)
  }
  const POLES = 8
  const poleMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.28, 9, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 }), POLES)
  poleMesh.frustumCulled = false
  train.add(poleMesh)
  const tunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 13, 26, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 1, side: THREE.BackSide }))
  tunnel.rotation.x = Math.PI / 2
  tunnel.position.set(0, 3, 0)
  tunnel.visible = false
  train.add(tunnel)
  group.add(train)

  // ------------------------------------------------------------ nuvens
  const sky = new THREE.Group()
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(16, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, toneMapped: false }))
  moon.position.set(-12, 2, -110)
  sky.add(moon)
  const ISL = 9
  const islandMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0x8b7d6d, roughness: 0.95, flatShading: true,
      emissive: 0x2b2530, emissiveIntensity: 1.0,
    }), ISL)
  islandMesh.frustumCulled = false
  const islSeed: number[][] = []
  for (let i = 0; i < ISL; i++) {
    islSeed.push([(rng() - 0.5) * 90, 6 + rng() * 20, -55 - rng() * 70, 1.2 + rng() * 2.6, rng() * 6.28])
  }
  sky.add(islandMesh)
  const puff = puffTex()
  const platforms: THREE.Group[] = []
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group()
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puff, transparent: true, depthWrite: false, fog: false, opacity: 0.92,
      }))
      const spread = gr(CLOUD_HALF_W) * 2
      s.position.set((k / 6 - 0.5) * spread, Math.sin(k * 1.7) * 0.16, (rng() - 0.5) * 1.2)
      s.scale.setScalar(1.5 + rng() * 0.9)
      g.add(s)
    }
    g.position.set(gx(cloudX(i)), gy(cloudY(i)), 0)
    sky.add(g)
    platforms.push(g)
  }
  const windMap = windTex()
  windMap.wrapS = windMap.wrapT = THREE.RepeatWrapping
  windMap.repeat.set(3, 1)
  const gustPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 3, 8.5),
    new THREE.MeshBasicMaterial({
      map: windMap, color: 0xdff0ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
    }))
  gustPlane.position.set(0, 6.8, -3)
  sky.add(gustPlane)
  group.add(sky)

  // ---------------------------------------------------------- game boy
  const gbFrame = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: gbFrameTex(), transparent: true, depthTest: false, depthWrite: false,
      fog: false, toneMapped: false,
    }))
  gbFrame.position.set(0, 0, -1.2)
  gbFrame.renderOrder = 60
  gbFrame.frustumCulled = false
  camGroup.add(gbFrame)

  for (const g of [deck, rave, deep, train, sky]) g.visible = false
  gbFrame.visible = false

  const mat4 = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const eul = new THREE.Euler()
  const vec = new THREE.Vector3()
  const scl = new THREE.Vector3()
  let fx: SceneFX | undefined

  return {
    group,
    camGroup,

    setScene(next) {
      fx = next
      deck.visible = !!next?.deck
      rave.visible = !!next?.neon
      deep.visible = !!next?.water
      train.visible = !!next?.train
      sky.visible = !!next?.islands
      gbFrame.visible = !!next?.lcd
    },

    update(ctx) {
      const { t, dt } = ctx
      if (deck.visible) {
        // o convés inteiro rola junto: o chão da física não gira, a leitura sim
        deck.rotation.z = ctx.tilt * 0.055
        const flick = 0.75 + Math.sin(t * 11.3) * 0.12 + Math.sin(t * 3.1) * 0.1
        for (const k of ['lampL', 'lampR']) {
          const l = deck.userData[k] as THREE.PointLight | undefined
          if (l) l.intensity = flick * 14
        }
      }
      if (rave.visible) {
        // beat < 0 é "sem música": pulsa devagar em vez de travar no auge
        const kick = ctx.beat < 0
          ? 0.25 + 0.25 * Math.sin(t * 3.2)
          : Math.pow(1 - ctx.beat, 2.4)
        for (let i = 0; i < lasers.length; i++) {
          const m = lasers[i]
          m.rotation.z = Math.sin(t * 0.9 + i) * 0.85
          m.rotation.x = Math.sin(t * 0.6 + i * 2.1) * 0.35
          ;(m.material as THREE.MeshBasicMaterial).opacity = 0.05 + kick * 0.22
        }
        ;(floorGlow.material as THREE.MeshBasicMaterial).opacity = 0.03 + kick * 0.14
        floorGlow.scale.setScalar(1 + kick * 0.04)
        ;(booth.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + kick * 2.4
      }
      if (deep.visible) {
        ;(caustics.material as THREE.MeshBasicMaterial).opacity = 0.09 + Math.sin(t * 0.8) * 0.04
        caustics.position.x = Math.sin(t * 0.21) * 1.4
        for (let i = 0; i < FISH; i++) {
          const [a, b, c] = fishSeed[i]
          const dir = b > 0.5 ? 1 : -1
          const x = ((t * (0.9 + a * 0.8) * dir + a * 40) % 44) - 22
          vec.set(x, 1.6 + b * 6 + Math.sin(t * 1.6 + a * 6.28) * 0.35, -5 - c * 14)
          eul.set(0, dir > 0 ? 0 : Math.PI, Math.sin(t * 4 + a * 6.28) * 0.15)
          quat.setFromEuler(eul)
          scl.setScalar(0.7 + c * 0.7)
          mat4.compose(vec, quat, scl)
          fishMesh.setMatrixAt(i, mat4)
        }
        fishMesh.instanceMatrix.needsUpdate = true
        whale.position.x = ((t * 1.2 + 60) % 190) - 95
        for (let i = 0; i < 2; i++) {
          ;(bubbleCol[i].material as THREE.MeshBasicMaterial).opacity = ctx.bubble * 0.13
          bubbleCol[i].scale.y = 0.9 + ctx.bubble * 0.2
        }
      }
      if (train.visible) {
        for (let i = 0; i < mesas.length; i++) {
          const m = (mesas[i].material as THREE.MeshBasicMaterial).map!
          m.offset.x = (ctx.scroll * (0.012 + i * 0.016)) % 1
        }
        for (let i = 0; i < POLES; i++) {
          const span = 90
          const x = 45 - ((ctx.scroll * 2.4 + (i * span) / POLES) % span)
          vec.set(x, 4.2, -19)
          quat.identity()
          scl.set(1, 1, 1)
          mat4.compose(vec, quat, scl)
          poleMesh.setMatrixAt(i, mat4)
        }
        poleMesh.instanceMatrix.needsUpdate = true
        tunnel.visible = ctx.tunnel > 0.01
        tunnel.position.z = -14 + ctx.tunnel * 14
      }
      if (sky.visible) {
        // a lua sobe com a partida: no match point ela toma o céu
        moon.position.y = -6 + ctx.progress * 26
        moon.position.z = -110 + ctx.progress * 26
        moon.scale.setScalar(1 + ctx.progress * 0.5)
        for (let i = 0; i < ISL; i++) {
          const [x, y, z, s, ph] = islSeed[i]
          vec.set(x, y + Math.sin(t * 0.4 + ph) * 0.5, z)
          eul.set(ph, ph * 2, ph * 0.5)
          quat.setFromEuler(eul)
          scl.set(s * 2.2, s * 0.8, s * 1.6)
          mat4.compose(vec, quat, scl)
          islandMesh.setMatrixAt(i, mat4)
        }
        islandMesh.instanceMatrix.needsUpdate = true
        for (let i = 0; i < 3; i++) {
          const alive = ctx.clouds[i]
          const g = platforms[i]
          const k = (g.userData.k as number) ?? 1
          const want = alive ? 1 : 0
          const nk = k + (want - k) * Math.min(1, dt * (alive ? 4 : 11))
          g.userData.k = nk
          g.visible = nk > 0.02
          g.scale.set(1, Math.max(0.02, nk), 1)
          for (const c of g.children) {
            (c as THREE.Sprite).material.opacity = 0.92 * nk
          }
          g.position.y = gy(cloudY(i)) + Math.sin(t * 0.7 + i * 2) * 0.06
        }
        const gm = gustPlane.material as THREE.MeshBasicMaterial
        // aviso pisca parado; a rajada corre no sentido em que vai empurrar
        const warn = ctx.gustWarn * (0.5 + 0.5 * Math.sin(t * 13)) * 0.34
        gm.opacity = Math.max(warn, Math.abs(ctx.gust) * 0.55)
        windMap.offset.x = (windMap.offset.x + dt * (ctx.gust || 0) * 0.9) % 1
        gustPlane.visible = gm.opacity > 0.01
      }
      if (gbFrame.visible) {
        // a moldura tem que caber na tela inteira, seja qual for o formato
        const cam = camGroup.parent as THREE.PerspectiveCamera | null
        if (cam?.isPerspectiveCamera) {
          const h = 2 * Math.tan((cam.fov * Math.PI) / 360) * 1.2
          gbFrame.scale.set(h * cam.aspect * 1.001, h * 1.001, 1)
        }
      }
      void fx
    },

    dispose() {
      for (const d of dispose) d()
      group.traverse(o => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mm = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mm)) mm.forEach(x => x.dispose())
        else mm?.dispose()
      })
    },
  }
}
