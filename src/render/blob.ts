import * as THREE from 'three'
import {
  BLOBBY_LOWER_RADIUS, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_RADIUS, BLOBBY_UPPER_SPHERE,
} from '../core/constants.ts'
import { S, gr } from './mapping.ts'
import { SUN_DIR } from './sky.ts'

const RU = gr(BLOBBY_UPPER_RADIUS)
const RL = gr(BLOBBY_LOWER_RADIUS)
const OU = gr(BLOBBY_UPPER_SPHERE)
const OL = gr(BLOBBY_LOWER_SPHERE)

const vert = /* glsl */`
uniform mat4 uInvModel;
varying vec3 vObjPos;
varying vec3 vObjCam;
void main(){
  vObjPos = position;
  vObjCam = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const sdfCommon = /* glsl */`
uniform float uRU, uRL, uOU, uOL;
uniform vec3  uSquash;     // xyz scale
uniform float uWobbleAmp;
uniform float uWobblePhase;
uniform float uTime;
uniform float uFacing;     // +1 faces +x, -1 faces -x
uniform vec3  uEyeAim;     // object-space direction the pupils look at
uniform float uBlink;
uniform float uMouth;
uniform float uCurve;
uniform float uBrow;
uniform float uLid;
uniform float uTear;
uniform float uHitFlash;

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float sdSphere(vec3 p, float r){ return length(p) - r; }

// body only
float mapBody(vec3 p){
  vec3 q = p / uSquash;
  float w = 1.0 + uWobbleAmp * sin(q.y*7.0 + uWobblePhase) * 0.14
                + uWobbleAmp * sin(q.x*9.0 - uWobblePhase*1.3) * 0.09;
  float up = sdSphere(q - vec3(0.0,  uOU, 0.0), uRU * w);
  float lo = sdSphere(q - vec3(0.0, -uOL, 0.0), uRL * w);
  float d = smin(up, lo, 0.40);
  // squash correction (conservative)
  return d * min(uSquash.x, min(uSquash.y, uSquash.z));
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * mapBody(p + e.xyy) + e.yyx * mapBody(p + e.yyx) +
    e.yxy * mapBody(p + e.yxy) + e.xxx * mapBody(p + e.xxx));
}

float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for(int i=0;i<5;i++){
    float h = 0.02 + 0.10*float(i);
    float d = mapBody(p + n*h);
    occ += (h-d)*sca;
    sca *= 0.82;
  }
  return clamp(1.0 - 2.2*occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd){
  float res = 1.0, t = 0.03;
  for(int i=0;i<SS_STEPS;i++){
    float h = mapBody(ro + rd*t);
    res = min(res, 9.0*h/t);
    t += clamp(h, 0.015, 0.14);
    if (res < 0.005 || t > 2.2) break;
  }
  return clamp(res, 0.0, 1.0);
}

// distance travelled inside the body, for subsurface scattering
float thickness(vec3 p, vec3 n){
  float t = 0.0;
  for(int i=0;i<6;i++){
    float h = 0.05 + 0.13*float(i);
    t += clamp(-mapBody(p - n*h), 0.0, 1.0);
  }
  return t / 6.0;
}

/**
 * A cara é pintada na superfície, não esculpida: primitivas soltas no raymarch
 * davam artefato nas bordas e custavam caro dentro do loop e da normal.
 * Aqui sai de graça e dá pra desenhar qualquer forma.
 */
float ell(vec2 p, vec2 r){ return length(p / r) - 1.0; }
float ink(float d, float soft){ return 1.0 - smoothstep(-soft, soft, d); }

// devolve albedo da face e, em .a, o quanto ela cobre o corpo
vec4 faceLayer(vec3 p, out float faceSss, out float faceZone){
  faceSss = 0.05;
  faceZone = 0.0;
  vec3 q = p / uSquash - vec3(0.0, uOU, 0.0);
  vec2 uv = q.xy / uRU;
  float depth = q.z / uRU;
  float front = smoothstep(0.12, 0.42, depth);
  // o sol estoura um brilho enorme bem em cima do olho: abafa na zona da cara
  faceZone = smoothstep(-0.10, 0.28, depth) * smoothstep(1.55, 0.45, length((uv - vec2(uFacing * 0.09, -0.06)) / vec2(1.05, 1.15)));
  if (front <= 0.002) return vec4(0.0);

  float soft = 0.022;
  float lid = clamp(uBlink * uLid, 0.05, 1.6);
  vec2 aim = normalize(uEyeAim.xy + vec2(0.0, 0.0001)) * min(1.0, length(uEyeAim.xy) * 1.6);

  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 line = vec3(0.09, 0.07, 0.10);

  for (int i = 0; i < 2; i++){
    float side = i == 0 ? -1.0 : 1.0;
    vec2 ec = vec2(uFacing * 0.09 + side * 0.38, 0.24);

    float de = ell(uv - ec, vec2(0.25, 0.25 * lid));
    float rim = ink(de - 0.18, soft);
    float me  = ink(de, soft);
    vec3 eyeCol = mix(vec3(0.06, 0.06, 0.08), vec3(0.97, 0.97, 1.0),
                      smoothstep(0.30, 0.58, lid));
    vec2 pc = ec + aim * 0.095;
    float mp = ink(ell(uv - pc, vec2(0.115, 0.115 * min(1.0, lid))), soft) * step(0.42, lid);
    float mg = ink(ell(uv - pc - vec2(0.045, 0.05), vec2(0.038, 0.042)), soft) * step(0.50, lid);

    vec2 bp = uv - vec2(ec.x, ec.y + 0.37 + uBrow * 0.05);
    float ang = -side * uBrow * 0.52;
    float cs = cos(ang), sn = sin(ang);
    bp = mat2(cs, -sn, sn, cs) * bp;
    float mb = ink(ell(bp, vec2(0.26, 0.062)), soft);

    col = mix(col, line, rim);       a = max(a, rim);
    col = mix(col, eyeCol, me);      a = max(a, me);
    col = mix(col, vec3(0.03, 0.03, 0.05), mp);
    col = mix(col, vec3(1.0), mg);
    col = mix(col, line, mb);        a = max(a, mb);

    if (uTear > 0.03){
      float ph = fract(uTime * 0.55 + float(i) * 0.41);
      vec2 tp = uv - vec2(ec.x + side * 0.19, ec.y - 0.28 - ph * 0.55);
      float mt = ink(ell(tp, vec2(0.075, 0.115) * uTear * (1.0 - ph * 0.4)), soft);
      col = mix(col, vec3(0.55, 0.85, 1.0), mt);
      a = max(a, mt);
    }
  }

  // boca: uCurve dobra a linha dos lábios, uMouth abre
  vec2 mo = uv - vec2(uFacing * 0.09, -0.34);
  float open = 0.040 + uMouth * 0.26;
  float wid  = 0.28 + uMouth * 0.06;
  // curvatura normalizada pela largura: o arco lê igual de boca fechada ou aberta
  float tx = mo.x / wid;
  mo.y -= uCurve * 0.30 * (tx * tx - 0.34);
  float dm = ell(mo, vec2(wid, open));
  float mlip = ink(dm - 0.16, soft);
  float mm   = ink(dm, soft);
  float mtg  = ink(ell(mo - vec2(0.0, -open * 0.40), vec2(wid * 0.55, open * 0.36)), soft)
             * smoothstep(0.40, 0.75, uMouth);

  col = mix(col, line, mlip);              a = max(a, mlip);
  col = mix(col, vec3(0.22, 0.03, 0.07), mm); a = max(a, mm);
  col = mix(col, vec3(0.78, 0.26, 0.33), mtg);

  return vec4(col, a * front);
}
`

const frag = /* glsl */`
precision highp float;
layout(location = 0) out highp vec4 fragColor;
varying vec3 vObjPos;
varying vec3 vObjCam;

uniform vec3 uColor;
uniform vec3 uColorDeep;
uniform vec3 uSunDir;       // object space
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform samplerCube uEnv;
uniform mat3 uNormalToWorld;
uniform float uEnvIntensity;
uniform mat4 uModelM;
uniform mat4 uViewProj;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

vec2 boxRange(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

${sdfCommon}

#include <common>

void main(){
  vec3 ro = vObjCam;
  vec3 rd = normalize(vObjPos - vObjCam);

  vec2 span = boxRange(ro, rd);
  if (span.y < max(span.x, 0.0)) discard;
  float t = max(span.x, 0.0);
  float tEnd = span.y + 0.01;
  bool got = false;
  vec3 p = ro + rd * t;
  for (int i = 0; i < RM_STEPS; i++){
    p = ro + rd * t;
    float d = mapBody(p);
    if (d < 0.0012) { got = true; break; }
    t += max(d * 0.9, 0.0015);
    if (t > tEnd) break;
  }
  if (!got) discard;

  p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 v = -rd;
  vec3 l = normalize(uSunDir);

  float ndl = dot(n, l);
#if AO_ON
  float ao  = calcAO(p, n);
#else
  float ao  = 1.0;
#endif
#if SHADOW_ON
  float sh  = softShadow(p + n*0.02, l);
#else
  float sh  = 1.0;
#endif

  vec3 albedo = uColor;
  float rough = 0.24;
  float sssAmt = 1.0;

  float faceSss, faceZone;
  vec4 face = faceLayer(p, faceSss, faceZone);
  float gloss = 1.0 - faceZone * 0.82;
  sssAmt = mix(sssAmt, faceSss, face.a);

  // key light: real lambert for form, softened a little for the jelly read
  float lam = max(ndl, 0.0);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float key = mix(lam, wrap, 0.35);
  vec3 diffuse = albedo * uSunColor * key * mix(0.25, 1.0, sh) * 1.25;

  // hemispheric ambient, kept low so the key reads
  vec3 amb = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5) * albedo * ao * 0.30;

  // subsurface scattering: light bleeding through thin parts
#if SSS_ON
  float th = thickness(p, n);
#else
  float th = 0.45;
#endif
  float back = pow(clamp(dot(v, -l), 0.0, 1.0), 3.0);
  vec3 sss = uColorDeep * uSunColor * (back * 1.1 + 0.18) * (1.0 - th) * sssAmt * 0.9;

  // specular (GGX-lite)
  vec3 h = normalize(l + v);
  float a = rough * rough;
  float ndh = max(dot(n, h), 0.0);
  float d = a * a / (PI * pow(ndh * ndh * (a * a - 1.0) + 1.0, 2.0));
  float spec = d * 0.25 * lam * sh * gloss;

  // environment reflection + fresnel rim
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 wr = normalize(uNormalToWorld * reflect(rd, n));
  vec3 env = textureCube(uEnv, wr).rgb * uEnvIntensity;

  vec3 col = diffuse + amb + sss;
  col += uSunColor * spec * 3.0;
  col = mix(col, env, clamp(fres * 0.45, 0.0, 0.5) * gloss);

  // rim light from the sky, hugging the silhouette
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6) * smoothstep(-0.4, 0.6, n.y);
  col += uSkyColor * rim * 0.55 * ao * (1.0 - face.a * 0.70);

  // bounce light from the warm sand below
  col += uGroundColor * albedo * clamp(-n.y, 0.0, 1.0) * 0.35 * ao;

  // a cara entra depois da luz: senão o brilho do sol apaga o olho
  float shade = clamp(key * mix(0.35, 1.0, sh) * 1.15 + 0.30, 0.0, 1.30);
  col = mix(col, face.rgb * shade, face.a);

  col += uColor * uHitFlash * 1.6;
  col *= 0.55 + 0.45 * ao;

  vec4 clip = uViewProj * uModelM * vec4(p, 1.0);
  float ndcZ = clip.z / clip.w;
  gl_FragDepth = (ndcZ * 0.5 + 0.5);

  fragColor = vec4(col, 1.0);
}
`

export interface BlobVisual {
  group: THREE.Group
  mesh: THREE.Mesh
  shadowProxy: THREE.Group
  uniforms: Record<string, THREE.IUniform>
  setColor(main: THREE.Color, deep: THREE.Color): void
}

export interface BlobQuality { steps: number; shadow: boolean; ao: boolean; sss: boolean }

export function createBlob(
  color: THREE.Color,
  envMap: THREE.CubeTexture | THREE.Texture | null,
  q: BlobQuality = { steps: 80, shadow: true, ao: true, sss: true },
): BlobVisual {
  const deep = color.clone().multiplyScalar(0.55).offsetHSL(0.02, 0.15, -0.05)
  const uniforms: Record<string, THREE.IUniform> = {
    uRU: { value: RU }, uRL: { value: RL }, uOU: { value: OU }, uOL: { value: OL },
    uSquash: { value: new THREE.Vector3(1, 1, 1) },
    uWobbleAmp: { value: 0 },
    uWobblePhase: { value: 0 },
    uTime: { value: 0 },
    uFacing: { value: 1 },
    uEyeAim: { value: new THREE.Vector3(0, 0, 1) },
    uBlink: { value: 1 },
    uMouth: { value: 0 },
    uCurve: { value: 0.2 },
    uBrow: { value: 0 },
    uLid: { value: 1 },
    uTear: { value: 0 },
    uHitFlash: { value: 0 },
    uColor: { value: color.clone() },
    uColorDeep: { value: deep },
    uSunDir: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.93, 0.82) },
    uSkyColor: { value: new THREE.Color(0.35, 0.52, 0.78) },
    uGroundColor: { value: new THREE.Color(0.42, 0.34, 0.24) },
    uEnv: { value: envMap },
    uEnvIntensity: { value: 0.5 },
    uNormalToWorld: { value: new THREE.Matrix3() },
    uInvModel: { value: new THREE.Matrix4() },
    uBoxMin: { value: new THREE.Vector3() },
    uBoxMax: { value: new THREE.Vector3() },
    uModelM: { value: new THREE.Matrix4() },
    uViewProj: { value: new THREE.Matrix4() },
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: false,
    side: THREE.BackSide,
    glslVersion: THREE.GLSL3,
    defines: {
      RM_STEPS: String(q.steps),
      SS_STEPS: q.shadow ? '24' : '1',
      SHADOW_ON: q.shadow ? '1' : '0',
      AO_ON: q.ao ? '1' : '0',
      SSS_ON: q.sss ? '1' : '0',
    },
  })

  const w = (RL + 0.35) * 2
  const hUp = OU + RU + 0.35
  const hDn = OL + RL + 0.25
  const box = new THREE.BoxGeometry(w, hUp + hDn, w)
  box.translate(0, (hUp - hDn) / 2, 0)
  const mesh = new THREE.Mesh(box, mat)
  mesh.frustumCulled = false
  ;(uniforms.uBoxMin.value as THREE.Vector3).set(-w / 2, -hDn, -w / 2)
  ;(uniforms.uBoxMax.value as THREE.Vector3).set(w / 2, hUp, w / 2)

  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })
  const shadowProxy = new THREE.Group()
  const up = new THREE.Mesh(new THREE.SphereGeometry(RU * 0.98, 16, 12), shadowMat)
  up.position.y = OU
  const lo = new THREE.Mesh(new THREE.SphereGeometry(RL * 0.98, 18, 14), shadowMat)
  lo.position.y = -OL
  up.castShadow = true; lo.castShadow = true
  shadowProxy.add(up, lo)

  const group = new THREE.Group()
  group.add(mesh, shadowProxy)

  return {
    group, mesh, shadowProxy, uniforms,
    setColor(main, deepC) {
      ;(uniforms.uColor.value as THREE.Color).copy(main)
      ;(uniforms.uColorDeep.value as THREE.Color).copy(deepC)
    },
  }
}

export const BLOB_SCALE = S
