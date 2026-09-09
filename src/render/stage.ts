import * as THREE from 'three'
import { LEFT, RIGHT, GROUND_PLANE_HEIGHT } from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import { COURT_DEPTH, COURT_HALF_W, S, gx, gy } from './mapping.ts'
import { createSky, SUN_DIR } from './sky.ts'
import { createTerrain } from './terrain.ts'
import type { Terrain } from './terrain.ts'
import { createOcean } from './ocean.ts'
import { createNet } from './net.ts'
import type { Net } from './net.ts'
import { createBall, BALL_R } from './ball.ts'
import type { Ball } from './ball.ts'
import { createBlob } from './blob.ts'
import type { BlobVisual } from './blob.ts'
import { createParticles } from './particles.ts'
import type { Particles } from './particles.ts'
import { createScenery } from './scenery.ts'
import type { Scenery } from './scenery.ts'
import { createPost } from './post.ts'
import type { Post } from './post.ts'

export interface Quality {
  shadows: boolean
  shadowSize: number
  post: boolean
  bloom: boolean
  godRays: boolean
  smaa: boolean
  pixelRatio: number
  envSize: number
  ocean: [number, number]
  terrain: { segments: number; craters: number; noiseSize: number }
  blob: { steps: number; shadow: boolean; ao: boolean; sss: boolean }
  particles: number
  scenery: { palms: number; rocks: number; spectators: number; birds: number; umbrellas: number }
}

export const QUALITY_PRESETS: Record<string, Quality> = {
  low: {
    shadows: false, shadowSize: 512, post: true, bloom: false, godRays: false, smaa: false,
    pixelRatio: 1.0, envSize: 64, ocean: [48, 28],
    terrain: { segments: 48, craters: 6, noiseSize: 256 },
    blob: { steps: 34, shadow: false, ao: false, sss: false },
    particles: 6000,
    scenery: { palms: 8, rocks: 8, spectators: 0, birds: 0, umbrellas: 2 },
  },
  medium: {
    shadows: true, shadowSize: 1024, post: true, bloom: true, godRays: false, smaa: false,
    pixelRatio: 1.0, envSize: 128, ocean: [110, 70],
    terrain: { segments: 110, craters: 14, noiseSize: 512 },
    blob: { steps: 56, shadow: false, ao: true, sss: true },
    particles: 20000,
    scenery: { palms: 14, rocks: 14, spectators: 32, birds: 10, umbrellas: 4 },
  },
  high: {
    shadows: true, shadowSize: 2048, post: true, bloom: true, godRays: true, smaa: true,
    pixelRatio: 1.5, envSize: 256, ocean: [200, 130],
    terrain: { segments: 170, craters: 22, noiseSize: 512 },
    blob: { steps: 80, shadow: true, ao: true, sss: true },
    particles: 45000,
    scenery: { palms: 22, rocks: 22, spectators: 48, birds: 18, umbrellas: 4 },
  },
  ultra: {
    shadows: true, shadowSize: 4096, post: true, bloom: true, godRays: true, smaa: true,
    pixelRatio: 2.0, envSize: 256, ocean: [280, 180],
    terrain: { segments: 220, craters: 28, noiseSize: 512 },
    blob: { steps: 110, shadow: true, ao: true, sss: true },
    particles: 60000,
    scenery: { palms: 22, rocks: 22, spectators: 48, birds: 18, umbrellas: 4 },
  },
}

const BLOB_COLORS: [THREE.Color, THREE.Color][] = [
  [new THREE.Color(0.95, 0.22, 0.28), new THREE.Color(0.62, 0.05, 0.14)],
  [new THREE.Color(0.20, 0.55, 0.98), new THREE.Color(0.05, 0.18, 0.62)],
]

interface BlobAnim {
  visual: BlobVisual
  wobble: number
  squashSpring: number
  squashVel: number
  mouth: number
  blinkTimer: number
  blink: number
  lastVY: number
  wasGrounded: boolean
  flash: number
}

interface Snapshot {
  bx: number; by: number; brot: number
  px: number[]; py: number[]; state: number[]
}

export class Stage {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  post: Post | null = null
  quality: Quality

  sun!: THREE.DirectionalLight
  skyUniforms!: Record<string, THREE.IUniform>
  terrain!: Terrain
  net!: Net
  ball!: Ball
  particles!: Particles
  scenery!: Scenery
  oceanUniforms!: Record<string, THREE.IUniform>
  blobs: BlobAnim[] = []
  walls: THREE.Mesh[] = []
  envCube: THREE.CubeTexture | null = null

  time = 0
  trauma = 0
  hitstop = 0
  flash = 0
  aberration = 0
  slowmo = 1
  camTargetX = 0
  camShakeSeed = Math.random() * 100

  private prev: Snapshot = { bx: 0, by: 0, brot: 0, px: [0, 0], py: [0, 0], state: [0, 0] }
  private cur: Snapshot = { bx: 0, by: 0, brot: 0, px: [0, 0], py: [0, 0], state: [0, 0] }
  private ballSpeed = 0
  private sunScreen = new THREE.Vector2(0.5, 0.8)

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: !quality.post, powerPreference: 'high-performance',
      stencil: false, depth: true,
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.86
    this.renderer.shadowMap.enabled = quality.shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000)
    this.camera.position.set(0, 5.9, 20.4)
    this.camera.lookAt(0, 2.8, 0)

    this.build()
  }

  private build() {
    const scene = this.scene
    scene.fog = new THREE.FogExp2(new THREE.Color(0.62, 0.74, 0.86), 0.0009)

    const { mesh: sky, uniforms } = createSky()
    this.skyUniforms = uniforms
    scene.add(sky)

    // environment cube captured from the sky
    const cubeRT = new THREE.WebGLCubeRenderTarget(this.quality.envSize, { type: THREE.HalfFloatType })
    const cubeCam = new THREE.CubeCamera(0.1, 2000, cubeRT)
    cubeCam.position.set(0, 6, 0)
    const skyOnly = new THREE.Scene()
    const skyClone = sky.clone()
    skyOnly.add(skyClone)
    cubeCam.update(this.renderer, skyOnly)
    this.envCube = cubeRT.texture as unknown as THREE.CubeTexture

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    pmrem.compileCubemapShader()
    const envRT = pmrem.fromCubemap(this.envCube)
    scene.environment = envRT.texture
    scene.environmentIntensity = 0.30

    // --- lights ---
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.86), 3.4)
    sun.position.copy(SUN_DIR).multiplyScalar(60)
    sun.castShadow = this.quality.shadows
    sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize)
    const c = sun.shadow.camera
    c.left = -13.5; c.right = 13.5; c.top = 13; c.bottom = -11
    c.near = 1; c.far = 160
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.035
    sun.shadow.radius = 3
    scene.add(sun, sun.target)
    this.sun = sun

    scene.add(new THREE.HemisphereLight(
      new THREE.Color(0.48, 0.66, 0.96), new THREE.Color(0.52, 0.40, 0.26), 0.38))

    const bounce = new THREE.DirectionalLight(new THREE.Color(0.9, 0.8, 0.65), 0.18)
    bounce.position.set(4, -3, 8)
    scene.add(bounce)

    // --- world ---
    this.terrain = createTerrain(this.quality.terrain)
    scene.add(this.terrain.mesh)

    const ocean = createOcean(this.envCube, this.quality.ocean[0], this.quality.ocean[1])
    this.oceanUniforms = ocean.uniforms
    scene.add(ocean.mesh)

    this.scenery = createScenery(7, this.quality.scenery)
    scene.add(this.scenery.group)

    this.net = createNet()
    scene.add(this.net.group)

    this.ball = createBall()
    scene.add(this.ball.group)

    this.particles = createParticles(this.quality.particles)
    scene.add(this.particles.points)

    // --- boundary energy walls ---
    const wallMat = () => new THREE.ShaderMaterial({
      uniforms: {
        uHit: { value: 0 }, uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.45, 0.8, 1.0) },
        uHitY: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; varying vec3 vP;
        void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `precision highp float;
layout(location = 0) out highp vec4 fragColor; varying vec2 vUv; varying vec3 vP;
        uniform float uHit; uniform float uTime; uniform vec3 uColor; uniform float uHitY;
        void main(){
          float grid = max(
            1.0 - smoothstep(0.0, 0.02, abs(fract(vUv.x * 14.0) - 0.5) * 0.14),
            1.0 - smoothstep(0.0, 0.02, abs(fract(vUv.y * 9.0) - 0.5) * 0.14));
          float edge = 1.0 - smoothstep(0.85, 1.0, abs(vUv.y * 2.0 - 1.0));
          float ripple = exp(-abs(vP.y - uHitY) * 1.6) * uHit;
          float a = (grid * 0.10 + ripple * 0.75) * edge;
          if (a < 0.004) discard;
          fragColor = vec4(uColor * (0.6 + ripple * 2.2), a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      glslVersion: THREE.GLSL3,
    })
    for (const sgn of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(COURT_DEPTH + 2, 11)
      geo.rotateY(Math.PI / 2)
      geo.translate(sgn * COURT_HALF_W, 5.5, 0)
      const m = new THREE.Mesh(geo, wallMat())
      m.renderOrder = 5
      this.walls.push(m)
      scene.add(m)
    }

    // --- blobs ---
    for (let i = 0; i < 2; i++) {
      const [main, deep] = BLOB_COLORS[i]
      const v = createBlob(main.clone(), this.envCube, this.quality.blob)
      ;(v.uniforms.uColorDeep.value as THREE.Color).copy(deep)
      v.uniforms.uFacing.value = i === 0 ? 1 : -1
      scene.add(v.group)
      this.blobs.push({
        visual: v, wobble: 0, squashSpring: 0, squashVel: 0, mouth: 0,
        blinkTimer: Math.random() * 4, blink: 1, lastVY: 0, wasGrounded: true, flash: 0,
      })
    }

    if (this.quality.post) {
      this.post = createPost(this.renderer, this.scene, this.camera,
        { bloom: this.quality.bloom, smaa: this.quality.smaa })
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.post?.setSize(w, h)
  }

  /** Capture the simulation state for interpolation. Call right after each fixed step. */
  capture(match: Match) {
    const p = this.prev, c = this.cur, w = match.world
    p.bx = c.bx; p.by = c.by; p.brot = c.brot
    p.px[0] = c.px[0]; p.px[1] = c.px[1]
    p.py[0] = c.py[0]; p.py[1] = c.py[1]
    p.state[0] = c.state[0]; p.state[1] = c.state[1]

    c.bx = w.ballX; c.by = w.ballY
    let r = w.ballRot
    if (Math.abs(r - p.brot) > 3.5) p.brot = r
    c.brot = r
    c.px[0] = w.blobX[0]; c.px[1] = w.blobX[1]
    c.py[0] = w.blobY[0]; c.py[1] = w.blobY[1]
    c.state[0] = w.blobState[0]; c.state[1] = w.blobState[1]
    this.ballSpeed = Math.hypot(w.ballVX, w.ballVY)
  }

  onEvents(match: Match, events: MatchEvent[]) {
    const w = match.world
    for (const e of events) {
      switch (e.event) {
        case Ev.BALL_HIT_BLOB: {
          const p = e.side as Side
          const bx = gx(w.ballX), by = gy(w.ballY)
          const inten = 0.35 + e.intensity * 0.65
          this.trauma = Math.min(1, this.trauma + 0.20 * inten)
          this.hitstop = Math.max(this.hitstop, 0.035 * inten)
          this.aberration = Math.max(this.aberration, 0.5 * inten)
          this.flash = Math.max(this.flash, 0.035 * inten)
          const col = (this.blobs[p].visual.uniforms.uColor.value as THREE.Color)
          this.particles.burst({
            x: bx, y: by, z: 0, count: Math.floor(90 + 170 * inten),
            speed: 3.2 + 5.5 * inten, spread: 1.5, up: 0.5, life: 0.75,
            size: 0.022, color: col, drag: 2.4, colorJitter: 0.3,
          })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 40,
            speed: 6 + 8 * inten, spread: 1.9, up: 0.2, life: 0.32,
            size: 0.05, color: new THREE.Color(1.0, 0.96, 0.85), drag: 4.0,
          })
          const b = this.blobs[p]
          b.wobble = Math.min(1.4, b.wobble + 0.9 * inten)
          b.mouth = 1
          b.flash = 0.5 * inten
          b.squashVel -= 1.6 * inten
          this.ball.flash(1.4 * inten)
          break
        }
        case Ev.BALL_HIT_GROUND: {
          const bx = gx(w.ballX), by = 0.05
          const power = Math.min(1, Math.abs(w.ballVY) / 16)
          this.trauma = Math.min(1, this.trauma + 0.30 * power + 0.08)
          this.terrain.addCrater(bx, 0, 0.55 + power * 0.7, 0.35 + power * 0.5)
          this.particles.burst({
            x: bx, y: by, z: 0, count: Math.floor(260 + 500 * power),
            speed: 2.6 + 6.5 * power, spread: 2.2, up: 1.25, life: 1.5,
            size: 0.019, color: new THREE.Color(0.80, 0.68, 0.50), drag: 1.5, colorJitter: 0.22,
          })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 120,
            speed: 1.2 + 2.0 * power, spread: 3.4, up: 0.25, life: 2.4,
            size: 0.075, color: new THREE.Color(0.86, 0.78, 0.63), drag: 3.4, colorJitter: 0.1,
          })
          break
        }
        case Ev.BALL_HIT_NET:
        case Ev.BALL_HIT_NET_TOP: {
          const by = gy(w.ballY)
          this.net.hit(by, 0)
          this.trauma = Math.min(1, this.trauma + 0.10)
          this.particles.burst({
            x: gx(w.ballX), y: by, z: 0, count: 40, speed: 2.2, spread: 1.4, up: 0.6,
            life: 0.6, size: 0.02, color: new THREE.Color(0.7, 0.75, 0.85), drag: 3,
          })
          break
        }
        case Ev.BALL_HIT_WALL: {
          const wall = this.walls[e.side === LEFT ? 0 : 1]
          const mat = wall.material as THREE.ShaderMaterial
          mat.uniforms.uHit.value = 1
          mat.uniforms.uHitY.value = gy(w.ballY)
          this.trauma = Math.min(1, this.trauma + 0.12)
          this.particles.burst({
            x: gx(w.ballX), y: gy(w.ballY), z: 0, count: 60, speed: 3.5, spread: 0.6, up: 0.4,
            life: 0.55, size: 0.03, color: new THREE.Color(0.5, 0.85, 1.0), drag: 3.2,
          })
          break
        }
        case Ev.PLAYER_ERROR: {
          this.trauma = Math.min(1, this.trauma + 0.35)
          this.flash = Math.max(this.flash, 0.06)
          break
        }
      }
    }
  }

  private updateBlob(i: Side, alpha: number, dt: number, match: Match) {
    const b = this.blobs[i]
    const u = b.visual.uniforms
    const p = this.prev, c = this.cur
    const gxp = THREE.MathUtils.lerp(p.px[i], c.px[i], alpha)
    const gyp = THREE.MathUtils.lerp(p.py[i], c.py[i], alpha)
    const st = THREE.MathUtils.lerp(p.state[i], c.state[i], alpha)

    const wx = gx(gxp), wy = gy(gyp)
    b.visual.group.position.set(wx, wy, 0)

    const world = match.world
    const vy = world.blobVY[i]
    const vx = world.blobVX[i]
    const grounded = world.blobY[i] >= GROUND_PLANE_HEIGHT - 0.001

    // landing impact
    if (grounded && !b.wasGrounded) {
      const impact = Math.min(1, Math.abs(b.lastVY) / 16)
      b.squashVel -= 2.6 * impact
      b.wobble = Math.min(1.5, b.wobble + impact)
      if (impact > 0.15) {
        this.particles.burst({
          x: wx, y: 0.04, z: 0, count: Math.floor(50 + 220 * impact),
          speed: 1.6 + 3.4 * impact, spread: 2.6, up: 0.7, life: 1.1,
          size: 0.017, color: new THREE.Color(0.80, 0.69, 0.52), drag: 2.0, colorJitter: 0.2,
        })
        this.trauma = Math.min(1, this.trauma + 0.09 * impact)
        this.terrain.addCrater(wx, 0, 0.42, 0.18 * impact)
      }
    }
    // takeoff puff
    if (!grounded && b.wasGrounded) {
      this.particles.burst({
        x: wx, y: 0.05, z: 0, count: 70, speed: 1.8, spread: 2.4, up: 0.55,
        life: 0.9, size: 0.016, color: new THREE.Color(0.82, 0.71, 0.54), drag: 2.4,
      })
    }
    b.wasGrounded = grounded
    b.lastVY = vy

    // squash spring
    b.squashVel += -b.squashSpring * 46 * dt - b.squashVel * 7.2 * dt
    b.squashSpring += b.squashVel * dt
    b.squashSpring = THREE.MathUtils.clamp(b.squashSpring, -0.26, 0.26)

    // original animation curve adds the classic bounce
    const anim = Math.sin((st / 5) * Math.PI) * 0.16
    const airStretch = THREE.MathUtils.clamp(-vy / 34, -0.16, 0.22)

    const sy = 1 + b.squashSpring + airStretch - anim * 0.5
    const sxz = 1 - (b.squashSpring + airStretch) * 0.55 + anim * 0.45
    ;(u.uSquash.value as THREE.Vector3).set(sxz, sy, sxz)

    b.wobble = Math.max(0, b.wobble - dt * 2.4)
    u.uWobbleAmp.value = b.wobble
    u.uWobblePhase.value += dt * 26

    // lean into movement
    b.visual.group.rotation.z = THREE.MathUtils.lerp(
      b.visual.group.rotation.z, -vx * 0.028 + (grounded ? 0 : vy * 0.004), 1 - Math.exp(-dt * 12))

    // eyes track the ball
    const bx = gx(THREE.MathUtils.lerp(p.bx, c.bx, alpha))
    const by = gy(THREE.MathUtils.lerp(p.by, c.by, alpha))
    const aim = (u.uEyeAim.value as THREE.Vector3)
    const upperY = wy + 0.38
    aim.set(bx - wx, by - upperY, 5.5).normalize()

    b.blinkTimer -= dt
    if (b.blinkTimer <= 0) { b.blinkTimer = 2.5 + Math.random() * 4; b.blink = 0 }
    b.blink = THREE.MathUtils.clamp(b.blink + dt * 7, 0, 1)
    u.uBlink.value = 0.08 + b.blink * 0.92

    const ballNear = Math.hypot(bx - wx, by - wy) < 1.6
    b.mouth = Math.max(0, b.mouth - dt * 3.2)
    u.uMouth.value = Math.max(b.mouth, ballNear ? 0.35 : 0)

    b.flash = Math.max(0, b.flash - dt * 3.5)
    u.uHitFlash.value = b.flash

    u.uTime.value = this.time

    // matrices for the raymarcher
    b.visual.group.updateMatrixWorld()
    const mesh = b.visual.mesh
    ;(u.uModelM.value as THREE.Matrix4).copy(mesh.matrixWorld)
    ;(u.uInvModel.value as THREE.Matrix4).copy(mesh.matrixWorld).invert()
    ;(u.uNormalToWorld.value as THREE.Matrix3).setFromMatrix4(mesh.matrixWorld)
    this.camera.updateMatrixWorld()
    ;(u.uViewProj.value as THREE.Matrix4)
      .multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    // sun direction in object space
    const inv = (u.uInvModel.value as THREE.Matrix4)
    const sd = (u.uSunDir.value as THREE.Vector3)
    sd.copy(SUN_DIR).transformDirection(inv).normalize()
  }

  render(match: Match, alpha: number, dtReal: number) {
    const dt = dtReal
    this.time += dt

    if (this.hitstop > 0) { this.hitstop -= dt; alpha = 0 }

    const p = this.prev, c = this.cur
    const bx = gx(THREE.MathUtils.lerp(p.bx, c.bx, alpha))
    const by = gy(THREE.MathUtils.lerp(p.by, c.by, alpha))
    const brot = THREE.MathUtils.lerp(p.brot, c.brot, alpha)

    // ---- camera rig ----
    this.camTargetX = THREE.MathUtils.lerp(this.camTargetX, bx * 0.30, 1 - Math.exp(-dt * 3.2))
    const sway = Math.sin(this.time * 0.31) * 0.20 + Math.sin(this.time * 0.17) * 0.11
    const swayY = Math.sin(this.time * 0.23 + 1.7) * 0.10

    this.trauma = Math.max(0, this.trauma - dt * 1.5)
    const sh = this.trauma * this.trauma
    const t = this.time * 34 + this.camShakeSeed
    const shx = (Math.sin(t) + Math.sin(t * 2.3)) * 0.5 * sh * 0.38
    const shy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.1)) * 0.5 * sh * 0.30
    const shr = Math.sin(t * 1.3) * sh * 0.022

    this.camera.position.set(this.camTargetX + sway + shx, 5.9 + swayY + shy, 20.4 - this.trauma * 0.5)
    this.camera.lookAt(bx * 0.14, 2.7 + by * 0.07, 0)
    this.camera.rotation.z += shr
    this.camera.fov = 38 - Math.min(this.ballSpeed, 22) * 0.05
    this.camera.updateProjectionMatrix()

    this.sun.target.position.set(this.camTargetX * 0.5, 2, 0)
    this.sun.position.copy(SUN_DIR).multiplyScalar(60).add(this.sun.target.position)

    this.ball.setTransform(bx, by, 0, brot, Math.sin(this.time * 0.7) * 0.25)
    this.ball.update(dt, this.ballSpeed)
    this.ball.flash(Math.max(0, (this.ball.mesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity - dt * 4))

    this.updateBlob(LEFT, alpha, dt, match)
    this.updateBlob(RIGHT, alpha, dt, match)

    this.net.update(dt)
    this.terrain.update(dt)
    this.scenery.update(this.time, dt)
    this.particles.update(this.time)
    this.skyUniforms.uTime.value = this.time
    this.oceanUniforms.uTime.value = this.time

    for (const w of this.walls) {
      const m = (w.material as THREE.ShaderMaterial)
      m.uniforms.uTime.value = this.time
      m.uniforms.uHit.value = Math.max(0, (m.uniforms.uHit.value as number) - dt * 2.6)
    }

    // ---- post ----
    if (this.post) {
      const g = this.post.grade.uniforms
      this.flash = Math.max(0, this.flash - dt * 2.2)
      this.aberration = Math.max(0, this.aberration - dt * 3.0)
      g.uFlash.value = this.flash
      g.uAberrationBoost.value = this.aberration

      const sunWorld = SUN_DIR.clone().multiplyScalar(500)
      const proj = sunWorld.project(this.camera)
      this.sunScreen.set(proj.x * 0.5 + 0.5, proj.y * 0.5 + 0.5)
      g.uSunScreen.value = this.sunScreen
      const onScreen = proj.z < 1 && this.sunScreen.x > -0.4 && this.sunScreen.x < 1.4 &&
        this.sunScreen.y > -0.4 && this.sunScreen.y < 1.4
      g.uSunVisible.value = THREE.MathUtils.lerp(
        g.uSunVisible.value as number, onScreen ? 1 : 0, 1 - Math.exp(-dt * 4))
      g.uGodRays.value = this.quality.godRays ? 0.30 : 0
      this.post.render(dt)
    } else {
      this.renderer.render(this.scene, this.camera)
    }
  }

  celebrate(side: Side) {
    const x = side === LEFT ? -COURT_HALF_W * 0.5 : COURT_HALF_W * 0.5
    for (let k = 0; k < 3; k++) {
      this.particles.burst({
        x: x + (Math.random() - 0.5) * 6, y: 3 + Math.random() * 4, z: -2 + Math.random() * 4,
        count: 300, speed: 5 + Math.random() * 4, spread: 1.6, up: 1.1, life: 3.2,
        size: 0.05, color: new THREE.Color().setHSL(Math.random(), 0.85, 0.6),
        drag: 1.1, colorJitter: 0.5,
      })
    }
    this.trauma = Math.min(1, this.trauma + 0.4)
  }

  dispose() {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) for (const x of mat) x.dispose()
      else mat?.dispose()
    })
    this.envCube?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}

export { BALL_R, S }
