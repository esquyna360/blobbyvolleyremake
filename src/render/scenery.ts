import * as THREE from 'three'
import { makeRng } from './noise.ts'
import { COURT_DEPTH, COURT_HALF_W } from './mapping.ts'

function windify(mat: THREE.Material, amount: number, freq: number) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = windTime
    shader.uniforms.uWindAmt = { value: amount }
    shader.uniforms.uWindFreq = { value: freq }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uWindTime; uniform float uWindAmt; uniform float uWindFreq;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float h = max(transformed.y, 0.0);
  float s = sin(uWindTime * uWindFreq + wp.x * 0.35 + wp.z * 0.21);
  float s2 = sin(uWindTime * uWindFreq * 2.3 + wp.z * 0.9);
  transformed.x += s * uWindAmt * h * h * 0.06;
  transformed.z += s2 * uWindAmt * h * h * 0.035;
}`)
  }
  mat.needsUpdate = true
}

export const windTime = { value: 0 }

function makeTrunk(rng: () => number): THREE.BufferGeometry {
  const H = 6.5 + rng() * 3.5
  const lean = (rng() - 0.5) * 1.6
  const bend = 0.9 + rng() * 0.8
  const SEG = 22, RAD = 10
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = []

  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const y = t * H
    const x = lean * t * t * bend
    const z = lean * 0.4 * t * t
    const r = THREE.MathUtils.lerp(0.30, 0.13, t) * (1 + Math.sin(t * 26) * 0.055)
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2
      const nx = Math.cos(a), nz = Math.sin(a)
      pos.push(x + nx * r, y, z + nz * r)
      nor.push(nx, 0.15, nz)
      uvs.push(j / RAD, t * 6)
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j
      const b = a + RAD + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.userData.top = new THREE.Vector3(lean * bend, H, lean * 0.4)
  return g
}

function makeFrond(len: number, droop: number, rng: () => number): THREE.BufferGeometry {
  const SEG = 16
  const pos: number[] = [], idx: number[] = [], uvs: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const x = t * len
    const y = -droop * t * t * len * 0.55
    const z = 0
    const w = Math.sin(Math.pow(t, 0.7) * Math.PI) * len * 0.20 * (0.85 + rng() * 0.3)
    const zig = (i % 2 === 0 ? 1 : 0.72)
    pos.push(x, y, z - w * zig, x, y + w * 0.16, z + w * zig)
    uvs.push(t, 0, t, 1)
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function makePalm(rng: () => number): THREE.Group {
  const g = new THREE.Group()
  const trunkGeo = makeTrunk(rng)
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.09, 0.32, 0.28 + rng() * 0.08),
    roughness: 0.92, metalness: 0,
  })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.castShadow = true
  trunk.receiveShadow = true
  g.add(trunk)

  const top = trunkGeo.userData.top as THREE.Vector3
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.27 + rng() * 0.04, 0.55, 0.26 + rng() * 0.08),
    roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
  })
  windify(leafMat, 1.0, 1.1)

  const n = 9 + Math.floor(rng() * 4)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.3
    const len = 2.6 + rng() * 1.5
    const frond = new THREE.Mesh(makeFrond(len, 0.55 + rng() * 0.6, rng), leafMat)
    frond.position.copy(top)
    frond.rotation.y = a
    frond.rotation.z = 0.22 + rng() * 0.35
    frond.castShadow = true
    g.add(frond)
  }

  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 })
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), coconutMat)
    const a = rng() * Math.PI * 2
    c.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 0.22, -0.22, Math.sin(a) * 0.22))
    c.castShadow = true
    g.add(c)
  }

  windify(trunkMat, 0.35, 0.8)
  return g
}

function makeRock(rng: () => number, radius: number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 3)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n =
      Math.sin(v.x * 1.7 + rng() * 0.001) * 0.18 +
      Math.sin(v.y * 2.3) * 0.14 +
      Math.sin(v.z * 1.3) * 0.2 +
      Math.sin(v.x * 5.1 + v.z * 3.3) * 0.07
    v.multiplyScalar(1 + n * 0.55)
    v.y *= 0.72
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.085, 0.16, 0.30 + rng() * 0.12),
    roughness: 0.95, metalness: 0.02, flatShading: true,
  })
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function makeUmbrella(rng: () => number): THREE.Group {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.4, metalness: 0.6 }))
  pole.position.y = 1.2
  pole.castShadow = true
  g.add(pole)

  const hue = rng()
  const canopyGeo = new THREE.ConeGeometry(1.5, 0.62, 16, 1, true)
  const colors: number[] = []
  const pos = canopyGeo.attributes.position as THREE.BufferAttribute
  const c1 = new THREE.Color().setHSL(hue, 0.75, 0.52)
  const c2 = new THREE.Color(0.97, 0.97, 0.97)
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i))
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16)
    const c = seg % 2 === 0 ? c1 : c2
    colors.push(c.r, c.g, c.b)
  }
  canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, side: THREE.DoubleSide,
  }))
  canopy.position.y = 2.35
  canopy.castShadow = true
  g.add(canopy)
  g.rotation.z = (rng() - 0.5) * 0.18
  return g
}

export interface Scenery {
  group: THREE.Group
  spectators: THREE.InstancedMesh
  update(t: number, dt: number): void
}

export interface SceneryQuality {
  palms: number
  rocks: number
  spectators: number
  birds: number
  umbrellas: number
}

export function createScenery(
  seed = 7,
  quality: SceneryQuality = { palms: 22, rocks: 22, spectators: 48, birds: 18, umbrellas: 4 },
): Scenery {
  const rng = makeRng(seed)
  const group = new THREE.Group()

  // --- palms flanking the court (parallax layers) ---
  const palmSpots: [number, number, number][] = [
    [-13.5, -13, 1.05], [-17, -19, 1.15], [-21, -11, 0.98], [-25, -22, 1.22],
    [14.5, -12, 1.08], [18, -18, 1.16], [22, -10, 1.0], [26, -23, 1.24],
    [-30, -15, 1.3], [31, -14, 1.28], [-35, -26, 1.36], [36, -25, 1.34],
    [-42, -12, 1.4], [43, -11, 1.38], [-47, -28, 1.46], [48, -27, 1.44],
    [-20, -32, 1.25], [21, -31, 1.26], [-9, -24, 1.1], [10, -25, 1.12],
    [-56, -20, 1.5], [57, -19, 1.48],
  ]
  for (const [x, z, s] of palmSpots.slice(0, quality.palms)) {
    const p = makePalm(rng)
    p.position.set(x + (rng() - 0.5) * 2, 0, z + (rng() - 0.5) * 2)
    p.scale.setScalar(s * (0.9 + rng() * 0.25))
    p.rotation.y = rng() * Math.PI * 2
    group.add(p)
  }

  // --- rocks ---
  for (let i = 0; i < quality.rocks; i++) {
    const far = rng() > 0.5
    const r = makeRock(rng, far ? 1.4 + rng() * 3.6 : 0.26 + rng() * 0.6)
    const ang = rng() * Math.PI * 2
    const dist = far ? 40 + rng() * 44 : 16 + rng() * 20
    r.position.set(Math.cos(ang) * dist * 1.6, far ? -0.5 : -0.1, Math.sin(ang) * dist * 0.55 - 4)
    if (Math.abs(r.position.x) < COURT_HALF_W + 7 && Math.abs(r.position.z) < COURT_DEPTH + 3) continue
    r.rotation.set(rng(), rng() * 6, rng() * 0.4)
    group.add(r)
  }

  // --- headland cliffs for the parallax backdrop ---
  const cliffMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.32, 0.30, 0.28), roughness: 0.98, flatShading: true,
  })
  const greenMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.12, 0.26, 0.12), roughness: 0.9, flatShading: true,
  })
  const cliffSpots: [number, number, number][] = [
    [-120, -140, 26], [130, -170, 32], [-210, -260, 44], [240, -300, 50], [0, -420, 70],
  ]
  for (const [x, z, s] of cliffSpots) {
    const rock = makeRock(rng, s)
    rock.material = cliffMat
    rock.position.set(x, -s * 0.45, z)
    rock.scale.set(1.4, 0.75, 1.0)
    rock.castShadow = false
    group.add(rock)

    const cap = makeRock(rng, s * 0.72)
    cap.material = greenMat
    cap.position.set(x + s * 0.1, -s * 0.30, z)
    cap.scale.set(1.35, 0.34, 0.95)
    cap.castShadow = false
    group.add(cap)
  }

  // --- umbrellas & towels ---
  for (const [x, z] of ([[-16.5, -8], [17, -7], [-24, -17], [24.5, -16]] as [number, number][]).slice(0, quality.umbrellas)) {
    const u = makeUmbrella(rng)
    u.position.set(x, 0, z)
    group.add(u)
    const towel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 2.2),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(rng(), 0.6, 0.55), roughness: 0.95, side: THREE.DoubleSide,
      }))
    towel.rotation.x = -Math.PI / 2
    towel.rotation.z = rng() * 3
    towel.position.set(x + 1.6, 0.03, z + 0.6)
    towel.receiveShadow = true
    group.add(towel)
  }

  // --- spectator blobs ---
  const specGeo = new THREE.SphereGeometry(0.26, 14, 10)
  specGeo.scale(1, 1.15, 1)
  const specMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.0 })
  const SPEC = quality.spectators
  const spectators = new THREE.InstancedMesh(specGeo, specMat, Math.max(1, SPEC))
  spectators.castShadow = true
  spectators.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const specBase: { x: number; y: number; z: number; phase: number; amp: number }[] = []
  const col = new THREE.Color()
  for (let i = 0; i < SPEC; i++) {
    const row = Math.floor(i / 16)
    const k = i % 16
    const side = i % 2 === 0 ? -1 : 1
    const x = side * (COURT_HALF_W + 6.5 + row * 1.0 + Math.random() * 0.4)
    const z = -COURT_DEPTH / 2 - 1 + (k / 16) * (COURT_DEPTH + 4) + (Math.random() - 0.5) * 0.7
    specBase.push({ x, y: 0.26 + row * 0.14, z, phase: Math.random() * 10, amp: 0.05 + Math.random() * 0.09 })
    col.setHSL(Math.random(), 0.34, 0.46)
    spectators.setColorAt(i, col)
  }
  if (spectators.instanceColor) spectators.instanceColor.needsUpdate = true
  if (SPEC > 0) group.add(spectators)

  // --- birds ---
  const birdGeo = new THREE.BufferGeometry()
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0, 0.1, 0.15, 0.5, 0, 0,
  ], 3))
  birdGeo.setIndex([0, 1, 2])
  const birds = new THREE.InstancedMesh(
    birdGeo,
    new THREE.MeshBasicMaterial({ color: 0x2a2f38, side: THREE.DoubleSide }), Math.max(1, quality.birds))
  const birdData = Array.from({ length: Math.max(1, quality.birds) }, () => ({
    r: 60 + Math.random() * 90, y: 26 + Math.random() * 22,
    sp: 0.05 + Math.random() * 0.06, ph: Math.random() * 7, sc: 1.2 + Math.random() * 1.4,
  }))
  if (quality.birds > 0) group.add(birds)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const v = new THREE.Vector3()
  const sc = new THREE.Vector3()

  return {
    group, spectators,
    update(t, _dt) {
      windTime.value = t
      for (let i = 0; i < SPEC; i++) {
        const b = specBase[i]
        const y = b.y + Math.abs(Math.sin(t * 2.4 + b.phase)) * b.amp
        m.makeTranslation(b.x, y, b.z)
        spectators.setMatrixAt(i, m)
      }
      spectators.instanceMatrix.needsUpdate = true

      for (let i = 0; i < birdData.length; i++) {
        const b = birdData[i]
        const a = t * b.sp + b.ph
        v.set(Math.cos(a) * b.r, b.y + Math.sin(a * 2.1) * 2.5, Math.sin(a) * b.r * 0.6 - 120)
        q.setFromEuler(new THREE.Euler(Math.sin(t * 8 + b.ph) * 0.5, -a + Math.PI / 2, 0))
        sc.setScalar(b.sc)
        m.compose(v, q, sc)
        birds.setMatrixAt(i, m)
      }
      birds.instanceMatrix.needsUpdate = true
    },
  }
}
