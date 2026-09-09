import * as THREE from 'three'
import { heightToNormal, tileableFbm } from './noise.ts'
import { COURT_HALF_W, COURT_DEPTH } from './mapping.ts'

export const MAX_CRATERS = 28

export interface TerrainQuality { segments: number; craters: number; noiseSize: number }

export interface Terrain {
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  addCrater(x: number, z: number, radius: number, depth: number): void
  update(dt: number): void
}

export function createTerrain(
  q: TerrainQuality = { segments: 200, craters: MAX_CRATERS, noiseSize: 512 },
): Terrain {
  const NOISE_SIZE = q.noiseSize
  const CRATERS = Math.max(4, Math.min(MAX_CRATERS, q.craters))
  const h = tileableFbm(NOISE_SIZE, 6, 1337)
  const nrm = heightToNormal(h, NOISE_SIZE, 6.0)
  const sandTex = new THREE.DataTexture(nrm, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat)
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping
  sandTex.minFilter = THREE.LinearMipmapLinearFilter
  sandTex.magFilter = THREE.LinearFilter
  sandTex.generateMipmaps = true
  sandTex.anisotropy = 8
  sandTex.colorSpace = THREE.NoColorSpace
  sandTex.needsUpdate = true

  const W = 130, D = 90, SEG = q.segments
  const geo = new THREE.PlaneGeometry(W, D, SEG, SEG)
  geo.rotateX(-Math.PI / 2)

  const dune = tileableFbm(128, 5, 909)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const courtR = Math.max(COURT_HALF_W, COURT_DEPTH) + 3.5
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const u = (((x / W + 0.5) % 1) + 1) % 1
    const v = (((z / D + 0.5) % 1) + 1) % 1
    const d = dune[Math.floor(v * 127) * 128 + Math.floor(u * 127)]
    const r = Math.hypot(x / 1.35, z)
    const flat = THREE.MathUtils.smoothstep(r, courtR, courtR + 18)
    const shore = THREE.MathUtils.smoothstep(-z, 16, 36)
    pos.setY(i, (d - 0.5) * 3.4 * flat - shore * 3.0)
  }
  geo.computeVertexNormals()

  const craterData = new Float32Array(CRATERS * 4)
  const uCraters = { value: craterData }
  const uCraterCount = { value: 0 }
  const uTimeT = { value: 0 }
  const uSandN = { value: sandTex }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.94, 0.76, 0.50),
    roughness: 0.95,
    metalness: 0.0,
    dithering: true,
  })

  const HW = COURT_HALF_W.toFixed(4)
  const HD = (COURT_DEPTH / 2).toFixed(4)

  material.onBeforeCompile = shader => {
    shader.uniforms.uCraters = uCraters
    shader.uniforms.uCraterCount = uCraterCount
    shader.uniforms.uTimeT = uTimeT
    shader.uniforms.uSandN = uSandN

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNrm;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <project_vertex>', '  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>')

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNrm;
uniform vec4 uCraters[${CRATERS}];
uniform int uCraterCount;
uniform float uTimeT;
uniform sampler2D uSandN;

float sandHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float craterField(vec2 wp, out vec2 grad){
  float total = 0.0;
  grad = vec2(0.0);
  for (int i = 0; i < ${CRATERS}; i++) {
    if (i >= uCraterCount) break;
    vec4 c = uCraters[i];
    if (c.w <= 0.001) continue;
    vec2 d = wp - c.xy;
    float r = length(d);
    if (r > c.z) continue;
    float t = r / max(c.z, 0.001);
    float prof = (1.0 - t*t) * (1.0 - t);
    float rim  = 0.30 * exp(-16.0 * (t - 0.88) * (t - 0.88));
    total += (prof - rim) * c.w;
    float dp = (-2.0*t*(1.0-t) - (1.0 - t*t)) / max(c.z, 0.001);
    grad += normalize(d + vec2(1e-5)) * dp * c.w;
  }
  return total;
}
`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
{
  vec2 suv = vWorldPos.xz * 0.42;
  vec3 n0 = texture2D(uSandN, suv).xyz * 2.0 - 1.0;
  vec3 n1 = texture2D(uSandN, suv * 4.7 + vec2(0.31, 0.77)).xyz * 2.0 - 1.0;
  vec2 pert = n0.xy * 1.35 + n1.xy * 0.55;

  float ripple = sin(vWorldPos.x * 4.8 + vWorldPos.z * 1.6) * 0.055
               + sin(vWorldPos.x * 11.3 - vWorldPos.z * 2.9) * 0.025;
  pert += vec2(ripple, ripple * 0.35);

  vec2 cg;
  float cf = craterField(vWorldPos.xz, cg);
  pert -= cg * 0.9;

  vec3 gN = normalize(vWorldNrm);
  vec3 T = normalize(cross(vec3(0.0, 0.0, 1.0), gN) + vec3(1e-5));
  vec3 B = normalize(cross(gN, T));
  vec3 wN = normalize(gN + T * pert.x + B * pert.y);
  normal = normalize(mat3(viewMatrix) * wN);

  // ---- albedo / roughness ----
  float lx = abs(abs(vWorldPos.x) - ${HW});
  float lz = abs(abs(vWorldPos.z) - ${HD});
  float lineM = max(1.0 - smoothstep(0.045, 0.12, lx), 1.0 - smoothstep(0.045, 0.12, lz));
  lineM *= step(abs(vWorldPos.z), ${(COURT_DEPTH / 2 + 0.10).toFixed(4)}) * step(abs(vWorldPos.x), ${(COURT_HALF_W + 0.10).toFixed(4)});
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.02, 0.99, 0.94), lineM * 0.95);

  float macro = texture2D(uSandN, vWorldPos.xz * 0.031).a;
  diffuseColor.rgb *= 0.88 + macro * 0.34;
  diffuseColor.rgb *= 1.0 - clamp(cf, 0.0, 1.0) * 0.30;

  float wet = smoothstep(-16.0, -32.0, vWorldPos.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.48, 0.47, 0.50), wet);
  roughnessFactor = mix(roughnessFactor, 0.14, wet);

  float sp = sandHash(floor(vWorldPos.xz * 300.0));
  diffuseColor.rgb += vec3(1.0, 0.95, 0.84) * step(0.9978, sp) * (1.0 - wet) * 2.0;
}
`)
  }

  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  mesh.position.y = -0.02

  let count = 0

  return {
    mesh, material,
    addCrater(x, z, radius, depth) {
      const i = count % CRATERS
      craterData[i * 4] = x
      craterData[i * 4 + 1] = z
      craterData[i * 4 + 2] = radius
      craterData[i * 4 + 3] = depth
      count++
      uCraterCount.value = Math.min(count, CRATERS)
    },
    update(dt) {
      uTimeT.value += dt
      for (let i = 0; i < uCraterCount.value; i++) craterData[i * 4 + 3] *= 1 - dt * 0.06
    },
  }
}
