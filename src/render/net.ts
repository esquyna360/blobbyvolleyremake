import * as THREE from 'three'
import { COURT_DEPTH, gr, gy } from './mapping.ts'
import { NET_RADIUS, NET_SPHERE_POSITION } from '../core/constants.ts'

const NET_TOP = gy(NET_SPHERE_POSITION)
const NET_R = gr(NET_RADIUS)

const vert = /* glsl */`
uniform float uTime;
uniform vec3 uImpacts[4];
uniform float uImpactT[4];
varying vec2 vUv;
varying vec3 vWorld;
varying float vRipple;
void main(){
  vUv = uv;
  vec3 p = position;
  float r = 0.0;
  for (int i=0;i<4;i++){
    float age = uImpactT[i];
    if (age <= 0.0 || age > 1.4) continue;
    float d = distance(p.yz, uImpacts[i].yz);
    float w = exp(-d * 1.6) * exp(-age * 3.2) * sin(d * 9.0 - age * 22.0);
    r += w * 0.30;
  }
  float sway = sin(p.y * 2.2 + uTime * 1.4) * 0.012 * (1.0 - p.y / ${NET_TOP.toFixed(3)});
  p.x += r + sway;
  vRipple = r;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const frag = /* glsl */`
precision highp float;
layout(location = 0) out highp vec4 fragColor;
varying vec2 vUv;
varying vec3 vWorld;
varying float vRipple;
uniform vec3 uCordColor;
uniform vec3 uSunColor;
uniform float uCell;

void main(){
  vec2 g = fract(vUv * uCell);
  float lw = 0.30;
  float cord = max(
    1.0 - smoothstep(lw*0.5, lw, abs(g.x - 0.5)),
    1.0 - smoothstep(lw*0.5, lw, abs(g.y - 0.5)));
  // top band
  float band = 1.0 - smoothstep(0.955, 0.985, vUv.y);
  float a = max(cord, 1.0 - band);
  if (a < 0.35) discard;

  vec3 col = uCordColor;
  if (vUv.y > 0.955) col = vec3(0.92, 0.92, 0.95);
  col *= 0.75 + 0.45 * abs(vRipple) * 6.0;
  col += uSunColor * 0.08;
  fragColor = vec4(col, 1.0);
}
`

export interface Net {
  group: THREE.Group
  uniforms: Record<string, THREE.IUniform>
  hit(worldY: number, worldZ: number): void
  update(dt: number): void
}

export function createNet(): Net {
  const group = new THREE.Group()
  const depth = COURT_DEPTH + 1.0

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uImpacts: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uImpactT: { value: [0, 0, 0, 0] },
    uCordColor: { value: new THREE.Color(0.06, 0.07, 0.09) },
    uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
    uCell: { value: 17 },
  }

  const geo = new THREE.PlaneGeometry(depth, NET_TOP, 60, 40)
  geo.rotateY(Math.PI / 2)
  geo.translate(0, NET_TOP / 2, 0)
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.DoubleSide, glslVersion: THREE.GLSL3, transparent: false,
  })
  const cloth = new THREE.Mesh(geo, mat)
  group.add(cloth)

  const postMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae, roughness: 0.35, metalness: 0.85,
  })
  for (const z of [-depth / 2, depth / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(NET_R * 1.0, NET_R * 1.35, NET_TOP + 0.35, 20), postMat)
    post.position.set(0, (NET_TOP + 0.35) / 2 - 0.15, z)
    post.castShadow = true
    post.receiveShadow = true
    group.add(post)

    const cap = new THREE.Mesh(new THREE.SphereGeometry(NET_R * 1.15, 16, 12), postMat)
    cap.position.set(0, NET_TOP + 0.2, z)
    cap.castShadow = true
    group.add(cap)

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(NET_R * 1.75, NET_R * 1.75, 1.25, 18),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.72 }))
    pad.position.set(0, 0.60, z)
    pad.castShadow = true
    group.add(pad)
  }

  let slot = 0
  return {
    group, uniforms,
    hit(worldY, worldZ) {
      const arr = uniforms.uImpacts.value as THREE.Vector3[]
      const ts = uniforms.uImpactT.value as number[]
      arr[slot].set(0, worldY, worldZ)
      ts[slot] = 0.0001
      slot = (slot + 1) % 4
    },
    update(dt) {
      uniforms.uTime.value += dt
      const ts = uniforms.uImpactT.value as number[]
      for (let i = 0; i < 4; i++) if (ts[i] > 0) ts[i] += dt
    },
  }
}
