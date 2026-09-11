import * as THREE from 'three'

export const SUN_DIR = new THREE.Vector3(-0.62, 0.58, 0.53).normalize()

const vert = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const frag = /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform vec3 uSun;
uniform float uTime;
uniform float uExposure;

const float PI = 3.14159265359;

float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.11,0.17,0.13)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<6;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// Preetham-ish analytic sky
vec3 atmosphere(vec3 dir, vec3 sun){
  float cosTheta = max(dot(dir, sun), 0.0);
  float up = max(dir.y, 0.0);

  vec3 zenith  = vec3(0.045, 0.17, 0.52);
  vec3 horizon = vec3(0.50, 0.65, 0.83);
  vec3 base = mix(horizon, zenith, pow(up, 0.34));

  // Rayleigh-ish blue accumulation and Mie forward scattering
  float mie = pow(cosTheta, 12.0) * 0.34 + pow(cosTheta, 3.0) * 0.06;
  vec3 sunTint = vec3(1.0, 0.72, 0.42);
  base += sunTint * mie;

  // warm glow near the horizon on the sun side
  float horizonGlow = pow(1.0 - up, 6.0) * pow(max(cosTheta,0.0), 1.5);
  base += vec3(1.0, 0.55, 0.28) * horizonGlow * 0.45;

  // sun disc + bloomy corona
  float sd = dot(dir, sun);
  float disc = smoothstep(0.99965, 0.99992, sd);
  float corona = pow(max(sd, 0.0), 900.0);
  base += vec3(1.0, 0.95, 0.85) * disc * 12.0;
  base += vec3(1.0, 0.85, 0.65) * corona * 1.6;

  return base;
}

void main(){
  vec3 dir = normalize(vWorld);
  vec3 col = atmosphere(dir, normalize(uSun));

  // cirrus + cumulus layered clouds, projected on a virtual dome
  if (dir.y > 0.005) {
    vec3 cp = dir / max(dir.y, 0.02);
    vec2 uv = cp.xz * 0.16;
    float t = uTime * 0.006;

    float cirrus = fbm(vec3(uv * 1.1 + vec2(t*1.7, t*0.4), 0.5));
    cirrus = smoothstep(0.52, 0.92, cirrus);

    float cum = fbm(vec3(uv * 0.42 + vec2(t, t*0.25), 2.7));
    float cumMask = smoothstep(0.48, 0.78, cum);
    float detail = fbm(vec3(uv * 1.9 + vec2(t*1.3, 0.0), 5.1));
    cumMask *= smoothstep(0.30, 0.72, detail);

    float fade = smoothstep(0.0, 0.28, dir.y);
    float sunAmt = max(dot(dir, normalize(uSun)), 0.0);

    vec3 cloudLit = mix(vec3(0.60,0.63,0.70), vec3(0.92,0.87,0.82), pow(sunAmt, 2.0));
    vec3 cloudShadow = vec3(0.32, 0.37, 0.48);

    float density = clamp(cumMask * 0.95 + cirrus * 0.35, 0.0, 1.0) * fade;
    vec3 cloudCol = mix(cloudShadow, cloudLit, smoothstep(0.2, 0.9, cumMask + cirrus*0.5));
    cloudCol += vec3(1.0,0.8,0.55) * pow(sunAmt, 8.0) * density * 0.8;

    col = mix(col, cloudCol, density * 0.80);
  }

  col *= uExposure;
  gl_FragColor = vec4(col, 1.0);
}
`

export function createSky(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const uniforms = {
    uSun: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 40), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  return { mesh, uniforms }
}
