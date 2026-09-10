import * as THREE from 'three'
import { COURT_DEPTH, gx } from './mapping.ts'
import type { TargetMark } from '../core/drill.ts'

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/**
 * Faixa acesa na areia. Borda grossa e listras andando: de longe e de esguelha
 * a área tem que ler como alvo, não como sombra.
 */
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uFlash;
uniform vec3 uColor;
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  float edge = max(p.x, p.y);
  float inside = 1.0 - smoothstep(0.988, 1.0, edge);
  float border = smoothstep(0.84, 0.92, edge) * inside;
  float pulse = 0.66 + 0.34 * sin(uTime * 3.6);
  float s = sin((vUv.x * 13.0 + vUv.y * 4.0 - uTime * 0.7) * 6.2831);
  float stripe = smoothstep(0.15, 0.85, s) * 0.22;
  float a = (0.24 + stripe + border * (0.62 + pulse * 0.38)) * inside;
  a = clamp(a + uFlash * 0.5 * inside, 0.0, 1.0);
  gl_FragColor = vec4(uColor * (1.0 + uFlash * 0.8), a);
}`

const LIVE = new THREE.Color('#ffd257')
const GOOD = new THREE.Color('#5cf08a')
const BAD = new THREE.Color('#ff5a4a')

export class Target3D {
  readonly mesh: THREE.Mesh
  private mat: THREE.ShaderMaterial
  private flash = 0
  private state = 0

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 }, uFlash: { value: 0 }, uColor: { value: LIVE.clone() },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.renderOrder = 6
    this.mesh.visible = false
  }

  /** Chamada todo quadro com o mesmo objeto: o estalo só dispara na virada. */
  set(t: TargetMark | null) {
    this.mesh.visible = !!t
    if (!t) { this.state = 0; return }
    const a = gx(t.x0), b = gx(t.x1)
    this.mesh.position.set((a + b) / 2, 0.015, 0)
    this.mesh.scale.set(Math.max(0.1, b - a), COURT_DEPTH, 1)
    if (t.state !== this.state) {
      this.state = t.state
      if (t.state !== 0) this.flash = 1
    }
    ;(this.mat.uniforms.uColor.value as THREE.Color)
      .copy(t.state === 0 ? LIVE : t.state > 0 ? GOOD : BAD)
  }

  update(time: number, dt: number) {
    if (!this.mesh.visible) return
    this.flash = Math.max(0, this.flash - dt * 1.6)
    this.mat.uniforms.uTime.value = time
    this.mat.uniforms.uFlash.value = this.flash
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose() }
}
