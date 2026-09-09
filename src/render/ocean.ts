import * as THREE from 'three'
import { SUN_DIR } from './sky.ts'

const vert = /* glsl */`
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vFoam;

vec3 gerstner(vec2 p, vec2 dir, float amp, float wl, float speed, float t, out vec3 tang, out vec3 bin){
  float k = 6.2831853 / wl;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(dir);
  float f = k * (dot(d, p) - c * speed * t);
  float Q = 0.55;
  float ak = amp * k;
  tang = vec3(-Q * d.x * d.x * ak * sin(f), d.x * ak * cos(f), -Q * d.x * d.y * ak * sin(f));
  bin  = vec3(-Q * d.x * d.y * ak * sin(f), d.y * ak * cos(f), -Q * d.y * d.y * ak * sin(f));
  return vec3(Q * amp * d.x * cos(f), amp * sin(f), Q * amp * d.y * cos(f));
}

void main(){
  vec3 p = position;
  vec2 xz = p.xz;
  vec3 t1, b1, t2, b2, t3, b3, t4, b4;
  vec3 off = vec3(0.0);
  off += gerstner(xz, vec2( 1.0, 0.25), 0.42, 32.0, 1.0, uTime, t1, b1);
  off += gerstner(xz, vec2( 0.7,-0.75), 0.20, 15.0, 1.15, uTime, t2, b2);
  off += gerstner(xz, vec2(-0.4, 0.9),  0.09, 7.0, 1.4, uTime, t3, b3);
  off += gerstner(xz, vec2( 0.9, 0.15), 0.04, 3.2, 1.7, uTime, t4, b4);

  vec3 tang = vec3(1.0,0.0,0.0) + t1 + t2 + t3 + t4;
  vec3 bin  = vec3(0.0,0.0,1.0) + b1 + b2 + b3 + b4;
  vec3 n = normalize(cross(bin, tang));

  // flatten near the shore so the water meets the sand
  float wz = (modelMatrix * vec4(p, 1.0)).z;
  float shore = smoothstep(-96.0, -44.0, wz);
  off *= mix(1.0, 0.10, shore);

  vec3 world = (modelMatrix * vec4(p + off, 1.0)).xyz;
  vWorld = world;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vFoam = shore;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const frag = /* glsl */`
precision highp float;
layout(location = 0) out highp vec4 fragColor;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vFoam;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform samplerCube uEnv;
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogDensity;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
}

void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNormalW);

  // fine ripple detail
  float n1 = vnoise(vWorld.xz * 2.6 + vec2(uTime * 0.35, uTime * 0.12));
  float n2 = vnoise(vWorld.xz * 7.3 - vec2(uTime * 0.5, uTime * 0.23));
  N = normalize(N + vec3((n1 - 0.5) * 0.10, 0.0, (n2 - 0.5) * 0.10));

  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = mix(0.02, 0.55, fres);

  vec3 R = reflect(-V, N);
  vec3 env = textureCube(uEnv, R).rgb;

  float depthFade = smoothstep(-520.0, -52.0, vWorld.z);
  vec3 water = mix(uDeep, uShallow, depthFade);

  // sun glitter
  vec3 H = normalize(normalize(uSun) + V);
  float spec = pow(max(dot(N, H), 0.0), 420.0) * 1.4;
  float glitter = pow(max(dot(N, H), 0.0), 60.0) * (0.35 + 0.65 * vnoise(vWorld.xz * 22.0 + uTime));

  vec3 col = mix(water, env * 0.45, fres);
  col += uSunColor * (spec + glitter * 0.5);

  // shore foam
  float foamBand = smoothstep(0.80, 1.0, vFoam);
  float foamN = vnoise(vWorld.xz * 1.6 + vec2(0.0, uTime * 0.5));
  float foam = smoothstep(0.55, 1.0, foamBand * (0.45 + foamN * 0.9));
  col = mix(col, vec3(0.92, 0.96, 1.0), foam * 0.85);

  // subsurface glow in wave crests
  col += uShallow * pow(max(dot(N, vec3(0.0,1.0,0.0)), 0.0), 3.0) * 0.06;

  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  fragColor = vec4(col, 1.0);
}
`

export interface Ocean { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> }

export function createOcean(env: THREE.CubeTexture | null): Ocean {
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uSun: { value: SUN_DIR.clone() },
    uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
    uShallow: { value: new THREE.Color(0.05, 0.50, 0.52) },
    uDeep: { value: new THREE.Color(0.010, 0.13, 0.32) },
    uEnv: { value: env },
    uFogColor: { value: new THREE.Color(0.62, 0.74, 0.86) },
    uFogDensity: { value: 0.0009 },
  }
  const geo = new THREE.PlaneGeometry(2200, 900, 260, 160)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    glslVersion: THREE.GLSL3, side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(0, -1.7, -420)
  mesh.frustumCulled = false
  return { mesh, uniforms }
}
