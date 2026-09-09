import * as THREE from 'three'



const vert = /* glsl */`
uniform float uTime;
uniform float uPixelRatio;
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute float aBirth;
attribute float aLife;
attribute float aSize;
attribute float aDrag;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;

void main(){
  float age = uTime - aBirth;
  if (age < 0.0 || age > aLife) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  float t = age;
  // analytic ballistic motion with linear drag
  float k = aDrag;
  vec3 g = vec3(0.0, -9.8, 0.0);
  vec3 p = aOrigin + (aVel - g / k) * (1.0 - exp(-k * t)) / k + g * t / k;

  // bounce off the ground once, cheaply
  if (p.y < 0.0) {
    p.y = -p.y * 0.28;
    p.y = min(p.y, 0.45);
  }

  float lifeT = age / aLife;
  vAlpha = (1.0 - lifeT) * (1.0 - lifeT);
  vColor = aColor;
  vSeed = aSize;

  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * 300.0 / max(-mv.z, 0.1) * (0.4 + 0.6 * (1.0 - lifeT));
}
`

const frag = /* glsl */`
precision highp float;
layout(location = 0) out highp vec4 fragColor;
varying vec3 vColor;
varying float vAlpha;
void main(){
  if (vAlpha <= 0.001) discard;
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float soft = 1.0 - smoothstep(0.06, 0.25, d);
  fragColor = vec4(vColor, vAlpha * soft);
}
`

export interface Particles {
  points: THREE.Points
  update(time: number): void
  burst(opts: {
    x: number; y: number; z: number
    count: number
    speed: number
    spread?: number
    up?: number
    life?: number
    size?: number
    color: THREE.Color
    drag?: number
    colorJitter?: number
    dirX?: number
  }): void
}

export function createParticles(MAX = 60000): Particles {
  const geo = new THREE.BufferGeometry()
  const origin = new Float32Array(MAX * 3)
  const vel = new Float32Array(MAX * 3)
  const birth = new Float32Array(MAX).fill(-1e9)
  const life = new Float32Array(MAX).fill(1)
  const size = new Float32Array(MAX)
  const drag = new Float32Array(MAX).fill(1)
  const color = new Float32Array(MAX * 3)

  const aOrigin = new THREE.BufferAttribute(origin, 3)
  const aVel = new THREE.BufferAttribute(vel, 3)
  const aBirth = new THREE.BufferAttribute(birth, 1)
  const aLife = new THREE.BufferAttribute(life, 1)
  const aSize = new THREE.BufferAttribute(size, 1)
  const aDrag = new THREE.BufferAttribute(drag, 1)
  const aColor = new THREE.BufferAttribute(color, 3)
  for (const a of [aOrigin, aVel, aBirth, aLife, aSize, aDrag, aColor]) a.setUsage(THREE.DynamicDrawUsage)

  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
  geo.setAttribute('aOrigin', aOrigin)
  geo.setAttribute('aVel', aVel)
  geo.setAttribute('aBirth', aBirth)
  geo.setAttribute('aLife', aLife)
  geo.setAttribute('aSize', aSize)
  geo.setAttribute('aDrag', aDrag)
  geo.setAttribute('aColor', aColor)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
  }

  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
    glslVersion: THREE.GLSL3,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false

  let cursor = 0
  let now = 0

  return {
    points,
    update(time) { uniforms.uTime.value = time; now = time },
    burst(o) {
      const n = Math.min(o.count, 4000)
      const start = cursor
      const spread = o.spread ?? 1
      const up = o.up ?? 1
      const lf = o.life ?? 1.2
      const sz = o.size ?? 0.03
      const dg = o.drag ?? 1.4
      const cj = o.colorJitter ?? 0.12
      const bias = o.dirX ?? 0

      for (let k = 0; k < n; k++) {
        const i = (start + k) % MAX
        const a = Math.random() * Math.PI * 2
        const r = Math.pow(Math.random(), 0.6)
        const el = Math.random()
        const sp = o.speed * (0.35 + Math.random() * 0.9)

        origin[i * 3] = o.x + (Math.random() - 0.5) * 0.08
        origin[i * 3 + 1] = o.y + Math.random() * 0.05
        origin[i * 3 + 2] = o.z + (Math.random() - 0.5) * 0.08

        vel[i * 3] = Math.cos(a) * r * sp * spread + bias * sp
        vel[i * 3 + 1] = sp * up * (0.35 + el * 0.9)
        vel[i * 3 + 2] = Math.sin(a) * r * sp * spread

        birth[i] = now
        life[i] = lf * (0.6 + Math.random() * 0.8)
        size[i] = sz * (0.5 + Math.random() * 1.1)
        drag[i] = dg * (0.7 + Math.random() * 0.7)

        const j = 1 + (Math.random() - 0.5) * cj * 2
        color[i * 3] = o.color.r * j
        color[i * 3 + 1] = o.color.g * j
        color[i * 3 + 2] = o.color.b * j
      }

      cursor = (start + n) % MAX

      const wrap = start + n > MAX
      const mark = (attr: THREE.BufferAttribute, itemSize: number) => {
        if (wrap) { attr.needsUpdate = true; return }
        attr.clearUpdateRanges()
        attr.addUpdateRange(start * itemSize, n * itemSize)
        attr.needsUpdate = true
      }
      mark(aOrigin, 3); mark(aVel, 3); mark(aBirth, 1); mark(aLife, 1)
      mark(aSize, 1); mark(aDrag, 1); mark(aColor, 3)
    },
  }
}
