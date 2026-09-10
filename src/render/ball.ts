import * as THREE from 'three'
import { BALL_RADIUS } from '../core/constants.ts'
import { gr } from './mapping.ts'

const R = gr(BALL_RADIUS)
const TRAIL = 22

function volleyballTexture(): THREE.CanvasTexture {
  const w = 1024, h = 512
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!

  g.fillStyle = '#f4f6f8'
  g.fillRect(0, 0, w, h)

  const bands: [number, number, string][] = [
    [0.00, 0.166, '#f4f6f8'],
    [0.166, 0.333, '#1e63d8'],
    [0.333, 0.5, '#f4f6f8'],
    [0.5, 0.666, '#f5c400'],
    [0.666, 0.833, '#f4f6f8'],
    [0.833, 1.0, '#1e63d8'],
  ]
  for (const [a, b, col] of bands) {
    g.fillStyle = col
    g.fillRect(a * w, 0, (b - a) * w, h)
  }

  // panel seams
  g.strokeStyle = 'rgba(20,24,30,0.55)'
  g.lineWidth = 5
  for (let i = 0; i <= 6; i++) {
    const x = (i / 6) * w
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke()
  }
  for (let i = 1; i < 3; i++) {
    const y = (i / 3) * h
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
  }

  // leather grain
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 16
    d[i] = Math.min(255, Math.max(0, d[i] + n))
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n))
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n))
  }
  g.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function bumpTexture(): THREE.CanvasTexture {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'
  g.fillRect(0, 0, s, s)
  const img = g.getImageData(0, 0, s, s)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 60
    d[i] = d[i + 1] = d[i + 2] = v
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(8, 4)
  return t
}

export interface Ball {
  group: THREE.Group
  mesh: THREE.Mesh
  trail: THREE.Mesh
  setTransform(x: number, y: number, z: number, rot: number, axisTilt: number): void
  update(dt: number, speed: number): void
  flash(amount: number): void
  squash(k: number, ang: number): void
}

const trailVert = /* glsl */`
attribute float aIdx;
uniform vec3 uPts[${TRAIL}];
uniform float uWidth;
varying float vT;
void main(){
  int i = int(aIdx);
  vec3 p = uPts[i];
  vec3 nxt = uPts[min(i + 1, ${TRAIL - 1})];
  vec3 prv = uPts[max(i - 1, 0)];
  vec3 dir = normalize(nxt - prv + vec3(1e-5));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(dir, toCam));
  float t = aIdx / float(${TRAIL - 1});
  float w = uWidth * (1.0 - t) * (1.0 - t);
  p += side * position.x * w;
  vT = t;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`

const trailFrag = /* glsl */`
precision highp float;
layout(location = 0) out highp vec4 fragColor;
varying float vT;
uniform vec3 uColor;
uniform float uOpacity;
void main(){
  float a = (1.0 - vT);
  a = a * a * a * uOpacity;
  fragColor = vec4(uColor * (0.35 + a * 0.8), a);
}
`

export function createBall(): Ball {
  const map = volleyballTexture()
  const bump = bumpTexture()

  const mat = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.6,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.35,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), mat)
  mesh.castShadow = true
  mesh.receiveShadow = true

  // trail ribbon
  const tGeo = new THREE.BufferGeometry()
  const verts: number[] = []
  const idxAttr: number[] = []
  const indices: number[] = []
  for (let i = 0; i < TRAIL; i++) {
    verts.push(-1, 0, 0, 1, 0, 0)
    idxAttr.push(i, i)
  }
  for (let i = 0; i < TRAIL - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  tGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  tGeo.setAttribute('aIdx', new THREE.Float32BufferAttribute(idxAttr, 1))
  tGeo.setIndex(indices)

  const pts: THREE.Vector3[] = []
  for (let i = 0; i < TRAIL; i++) pts.push(new THREE.Vector3())

  const trailUniforms = {
    uPts: { value: pts },
    uWidth: { value: R * 0.9 },
    uColor: { value: new THREE.Color(1.0, 0.85, 0.55) },
    uOpacity: { value: 0 },
  }
  const trail = new THREE.Mesh(tGeo, new THREE.ShaderMaterial({
    uniforms: trailUniforms,
    vertexShader: trailVert,
    fragmentShader: trailFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    glslVersion: THREE.GLSL3,
  }))
  trail.frustumCulled = false

  // a deformação mora num par de grupos: o de fora gira pro eixo da batida e
  // achata, o de dentro desgira, então o giro da bola não sente a deformação
  const inner = new THREE.Group()
  inner.add(mesh)
  const squashG = new THREE.Group()
  squashG.add(inner)

  const group = new THREE.Group()
  group.add(squashG, trail)

  let seeded = false

  return {
    group, mesh, trail,
    setTransform(x, y, z, rot, axisTilt) {
      squashG.position.set(x, y, z)
      mesh.rotation.set(0, 0, 0)
      mesh.rotateZ(-rot)
      mesh.rotateX(axisTilt)
      if (!seeded) { for (const p of pts) p.set(x, y, z); seeded = true }
      for (let i = TRAIL - 1; i > 0; i--) pts[i].copy(pts[i - 1])
      pts[0].set(x, y, z)
    },
    update(_dt, speed) {
      trailUniforms.uOpacity.value = THREE.MathUtils.clamp((speed - 5) / 26, 0, 0.42)
      trailUniforms.uWidth.value = R * (0.75 + Math.min(speed / 30, 1) * 0.55)
    },
    flash(amount) { mat.emissiveIntensity = amount },
    squash(k, ang) {
      squashG.rotation.z = ang
      inner.rotation.z = -ang
      squashG.scale.set(1 - k * 0.55, 1 + k * 0.4, 1 + k * 0.4)
    },
  }
}

export const BALL_R = R
