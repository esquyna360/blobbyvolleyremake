import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.8) },
    uSunVisible: { value: 1 },
    uGodRays: { value: 0.30 },
    uCA: { value: 1.0 },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.035 },
    uSaturation: { value: 1.30 },
    uContrast: { value: 1.14 },
    uLift: { value: new THREE.Vector3(0.010, 0.006, 0.004) },
    uFlash: { value: 0 },
    uAberrationBoost: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uSunVisible, uGodRays, uCA, uVignette, uGrain, uSaturation, uContrast, uFlash, uAberrationBoost;
    uniform vec2 uSunScreen;
    uniform vec3 uLift;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 fromC = uv - 0.5;
      float r2 = dot(fromC, fromC);

      // chromatic aberration, stronger toward the edges
      float ca = (0.0012 * uCA + uAberrationBoost * 0.006) * (0.25 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + fromC * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - fromC * ca).b;

      // radial god rays from the sun
      if (uGodRays > 0.001 && uSunVisible > 0.001) {
        vec2 dir = (uv - uSunScreen);
        float acc = 0.0;
        vec3 rays = vec3(0.0);
        const int N = 24;
        for (int i = 0; i < N; i++) {
          float t = float(i) / float(N);
          vec2 s = uv - dir * t * 0.55;
          vec3 c = texture2D(tDiffuse, s).rgb;
          float lum = max(max(c.r, c.g), c.b);
          float w = pow(1.0 - t, 2.0) * step(1.0, lum);
          rays += c * w;
          acc += w;
        }
        rays /= max(acc, 0.001);
        float falloff = 1.0 - clamp(length(uv - uSunScreen) * 0.9, 0.0, 1.0);
        col += rays * uGodRays * falloff * falloff * uSunVisible * 0.5;
      }

      // grade
      col += uLift;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // white flash on impacts
      col += uFlash;

      // vignette
      float vig = smoothstep(0.95, 0.18, r2 * 2.0);
      col *= mix(1.0, vig, uVignette);

      // film grain
      float g = hash(uv * vec2(1920.0, 1080.0) + uTime * 60.0) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
}

export interface Post {
  composer: EffectComposer
  bloom: UnrealBloomPass
  grade: ShaderPass
  setSize(w: number, h: number): void
  render(dt: number): void
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Post {
  const size = renderer.getSize(new THREE.Vector2())
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloom = new UnrealBloomPass(size, 0.42, 0.62, 1.0)
  composer.addPass(bloom)

  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)

  composer.addPass(new OutputPass())
  const smaa = new SMAAPass()
  composer.addPass(smaa)

  return {
    composer, bloom, grade,
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w, h) },
    render(dt) {
      grade.uniforms.uTime.value += dt
      composer.render(dt)
    },
  }
}
