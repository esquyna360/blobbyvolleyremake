import * as THREE from 'three'
import {
  LEFT, RIGHT, GROUND_PLANE_HEIGHT, BLOBBY_LOWER_SPHERE, BLOBBY_UPPER_SPHERE, CROUCH_DUCK,
  DIVE_RECOVER, SPECIAL_FULL, SPECIAL_REACH,
} from '../core/constants.ts'
import type { Side } from '../core/constants.ts'
import { Ev } from '../core/events.ts'
import type { MatchEvent } from '../core/events.ts'
import type { Match } from '../core/match.ts'
import { COURT_DEPTH, COURT_HALF_W, S, gx, gy, gr } from './mapping.ts'

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
import { createIndoor } from './indoor.ts'
import type { Indoor } from './indoor.ts'
import { createForeground3D } from './foreground3d.ts'
import type { Foreground3D } from './foreground3d.ts'
import { createCampfire } from './campfire.ts'
import type { Campfire } from './campfire.ts'
import { getScene } from './scenes.ts'
import type { SceneId } from './scenes.ts'
import type { Scenery } from './scenery.ts'
import { createPost } from './post.ts'
import type { Post } from './post.ts'
import { emoteAt } from '../core/emote.ts'
import { FaceRig, crouchMoods, faceEvents, rallyTension, reachMoods } from './face.ts'

/** Onde o brilho do anel é mais forte, em fração do raio do plano. */
const REACH_PEAK = 0.88

/** Anel de alcance macio: sem borda, só um halo que some pros dois lados. */
function softRingTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.76, 'rgba(255,255,255,0)')
  g.addColorStop(REACH_PEAK, 'rgba(255,255,255,0.5)')
  g.addColorStop(0.99, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const CAM_Z = 20.4
const CAM_Z_MAX = 34
const CAM_MARGIN = 1.4
/** Quanto o alvo do lookAt corre atrás da bola, em fração da meia-quadra. */
const CAM_LOOK = 0.14
/** O fov encolhe com a bola rápida; o enquadramento tem que caber no menor. */
const CAM_FOV_MIN = 36.9

export interface GameRenderer {
  setSize(w: number, h: number): void
  /** Troca o tema visual sem recriar o renderer. */
  setScene(id: SceneId): void
  /** Paredes da quadra: existem sempre na física, aqui só some o desenho. */
  setWalls(on: boolean): void
  capture(match: Match): void
  onEvents(match: Match, events: MatchEvent[]): void
  render(match: Match, alpha: number, dt: number): void
  celebrate(side: Side): void
  emote(side: Side, id: number): void
  dispose(): void
}

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
  face: FaceRig
  lastVY: number
  wasGrounded: boolean
  flash: number
}

interface EmotePop {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  life: number
  max: number
  spin: number
}

const EMOTE_GEO = new THREE.PlaneGeometry(1, 1)
const SCORCH_GEO = new THREE.PlaneGeometry(1, 1)

let scorchTex: THREE.Texture | null = null
function scorchTexture() {
  if (scorchTex) return scorchTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  rad.addColorStop(0, 'rgba(10,6,4,0.95)')
  rad.addColorStop(0.55, 'rgba(24,14,9,0.75)')
  rad.addColorStop(0.82, 'rgba(40,24,14,0.35)')
  rad.addColorStop(1, 'rgba(40,24,14,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28
    const r = 30 + Math.random() * 32
    g.globalAlpha = 0.3 + Math.random() * 0.4
    g.fillStyle = '#0a0603'
    g.beginPath()
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 9, 0, 6.28)
    g.fill()
  }
  scorchTex = new THREE.CanvasTexture(c)
  scorchTex.colorSpace = THREE.SRGBColorSpace
  return scorchTex
}

interface Scorch { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; life: number }

const SHOCK_GEO = new THREE.PlaneGeometry(1, 1)

let shockTex: THREE.Texture | null = null
function shockTexture() {
  if (shockTex) return shockTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const rad = g.createRadialGradient(128, 128, 76, 128, 128, 126)
  rad.addColorStop(0, 'rgba(255,255,255,0)')
  rad.addColorStop(0.62, 'rgba(255,255,255,0.28)')
  rad.addColorStop(0.86, 'rgba(255,255,255,1)')
  rad.addColorStop(0.97, 'rgba(255,255,255,0.35)')
  rad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 256, 256)
  shockTex = new THREE.CanvasTexture(c)
  return shockTex
}

/** Anel de choque em volta de quem empurra/defende — partícula sozinha some no fundo claro. */
interface Shock {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  life: number
  max: number
  from: number
  to: number
  flat: boolean
}

const emoteTextures = new Map<string, THREE.Texture>()

function emoteTexture(glyph: string): THREE.Texture {
  const cached = emoteTextures.get(glyph)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = c.height = 160
  const g = c.getContext('2d')!
  g.font = '124px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(glyph, 80, 88)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  emoteTextures.set(glyph, t)
  return t
}

interface Snapshot {
  bx: number; by: number; brot: number
  px: number[]; py: number[]; state: number[]
}

export class Stage implements GameRenderer {
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
  indoor!: Indoor
  campfire!: Campfire
  fg3!: Foreground3D
  oceanUniforms!: Record<string, THREE.IUniform>
  oceanMesh!: THREE.Mesh
  hemi!: THREE.HemisphereLight
  sceneId: SceneId = 'praia'
  private sunDir = SUN_DIR.clone()
  private envCam!: THREE.CubeCamera
  private envSky!: THREE.Scene
  private pmrem!: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  blobs: BlobAnim[] = []
  walls: THREE.Mesh[] = []
  /** [lado][0 especial, 1 mão] — anel discreto de alcance perto da cabeça. */
  private reachRings: THREE.Mesh[] = []
  private ballSquash = { k: 0, ang: 0 }
  envCube: THREE.CubeTexture | null = null

  time = 0
  trauma = 0
  hitstop = 0
  private tension = 0
  private gib = [0, 0]
  flash = 0
  aberration = 0
  slowmo = 1
  camTargetX = 0
  camShakeSeed = Math.random() * 100
  private camZ = CAM_Z
  private camSpan = 0

  private prev: Snapshot = { bx: 0, by: 0, brot: 0, px: [0, 0], py: [0, 0], state: [0, 0] }
  private cur: Snapshot = { bx: 0, by: 0, brot: 0, px: [0, 0], py: [0, 0], state: [0, 0] }
  private ballSpeed = 0
  private sunScreen = new THREE.Vector2(0.5, 0.8)
  private emotes: EmotePop[] = []
  private scorches: Scorch[] = []
  private shocks: Shock[] = []

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
    this.camera.position.set(0, 5.9, CAM_Z)
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
    this.envCam = cubeCam
    this.envSky = skyOnly

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    pmrem.compileCubemapShader()
    this.pmrem = pmrem
    const envRT = pmrem.fromCubemap(this.envCube)
    this.envRT = envRT
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

    this.hemi = new THREE.HemisphereLight(
      new THREE.Color(0.48, 0.66, 0.96), new THREE.Color(0.52, 0.40, 0.26), 0.38)
    scene.add(this.hemi)

    const bounce = new THREE.DirectionalLight(new THREE.Color(0.9, 0.8, 0.65), 0.18)
    bounce.position.set(4, -3, 8)
    scene.add(bounce)

    // --- world ---
    this.terrain = createTerrain(this.quality.terrain)
    scene.add(this.terrain.mesh)

    const ocean = createOcean(this.envCube, this.quality.ocean[0], this.quality.ocean[1])
    this.oceanUniforms = ocean.uniforms
    this.oceanMesh = ocean.mesh
    scene.add(ocean.mesh)

    this.scenery = createScenery(7, this.quality.scenery)
    scene.add(this.scenery.group)

    this.indoor = createIndoor()
    scene.add(this.indoor.group)

    this.campfire = createCampfire()
    scene.add(this.campfire.group)

    this.fg3 = createForeground3D()
    this.camera.add(this.fg3.group)
    scene.add(this.camera)

    this.net = createNet()
    scene.add(this.net.group)

    this.ball = createBall()
    scene.add(this.ball.group)

    const reachTex = softRingTexture()
    for (let i = 0; i < 2; i++) {
      const rad = gr(SPECIAL_REACH) / REACH_PEAK
      const g = new THREE.PlaneGeometry(rad * 2, rad * 2)
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        map: reachTex, color: 0xffd257, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }))
      m.renderOrder = 6
      m.visible = false
      scene.add(m)
      this.reachRings.push(m)
    }

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
          // faixa forte no plano da bola e no pé: é por onde o olho lê o limite
          float play = 1.0 - smoothstep(0.02, 0.17, abs(vUv.x - 0.5));
          float base = exp(-vP.y * 0.8);
          float ripple = exp(-abs(vP.y - uHitY) * 1.6) * uHit;
          float a = (grid * 0.24 + base * 0.26 + play * 0.34 + ripple * 0.85) * edge;
          if (a < 0.004) discard;
          fragColor = vec4(uColor * (0.6 + ripple * 2.2 + play * 0.5), a);
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
        face: new FaceRig(), lastVY: 0, wasGrounded: true, flash: 0,
      })
    }

    if (this.quality.post) {
      this.post = createPost(this.renderer, this.scene, this.camera,
        { bloom: this.quality.bloom, smaa: this.quality.smaa })
    }
  }

  /** Cenário é pintura: troca céu, luz, chão e o que passa na frente. */
  setScene(id: SceneId) {
    this.sceneId = id
    const sc = getScene(id)
    const d = sc.d3

    this.sunDir.set(d.sun[0], d.sun[1], d.sun[2]).normalize()
    ;(this.skyUniforms.uSun.value as THREE.Vector3).copy(this.sunDir)
    this.skyUniforms.uExposure.value = d.exposure

    const fog = this.scene.fog as THREE.FogExp2
    fog.color.setRGB(d.fog[0], d.fog[1], d.fog[2])
    fog.density = d.fogDensity
    ;(this.oceanUniforms.uFogColor.value as THREE.Color).copy(fog.color)

    this.envCam.update(this.renderer, this.envSky)
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromCubemap(this.envCube as THREE.CubeTexture)
    this.scene.environment = this.envRT.texture

    this.sun.color.setHex(d.key)
    this.sun.intensity = d.keyIntensity
    this.hemi.color.setHex(d.ambient)
    this.hemi.intensity = d.ambientIntensity
    this.scene.environmentIntensity = 0.30 * Math.max(0.3, d.exposure)

    this.terrain.material.color.setRGB(0.94 * d.sand[0], 0.76 * d.sand[1], 0.50 * d.sand[2])

    this.oceanMesh.visible = d.ocean
    const [or_, og, ob] = d.oceanTint
    ;(this.oceanUniforms.uShallow.value as THREE.Color).setRGB(0.05 * or_, 0.50 * og, 0.52 * ob)
    ;(this.oceanUniforms.uDeep.value as THREE.Color).setRGB(0.010 * or_, 0.13 * og, 0.32 * ob)
    ;(this.oceanUniforms.uSunColor.value as THREE.Color).setRGB(1.0 * or_, 0.92 * og, 0.78 * ob)

    for (const o of this.scenery.outdoor) o.visible = d.palms
    this.scenery.spectators.visible = !d.indoor
    this.indoor.group.visible = d.indoor
    this.campfire.setPower(d.fire * 90)
    this.fg3.setMode(sc.fg)

    const wallCol = new THREE.Color(d.indoor ? 0xffc46b : (sc.night ? 0x3f7fb4 : 0x73ccff))
    for (const w of this.walls) {
      ;((w.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).copy(wallCol)
    }
  }

  setWalls(on: boolean) {
    for (const w of this.walls) w.visible = on
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.fitArena()
    this.camera.updateProjectionMatrix()
    this.post?.setSize(w, h)
  }

  /**
   * A arena larga não cabe no enquadramento fixo: afasta a câmera até as duas
   * paredes entrarem na tela. O que sobrar de folga é o quanto ela ainda pode
   * acompanhar a bola de lado — em tela estreita, nada, e ela fica no centro.
   */
  private fitArena() {
    // o lookAt segue a bola e gira a câmera: essa folga entra na conta junto
    const need = COURT_HALF_W * (1 + CAM_LOOK) + CAM_MARGIN
    const ht = Math.tan((CAM_FOV_MIN * Math.PI) / 360) * Math.max(0.5, this.camera.aspect)
    this.camZ = Math.min(CAM_Z_MAX, Math.max(CAM_Z, need / ht))
    this.camSpan = Math.max(0, this.camZ * ht - need)
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
    faceEvents([this.blobs[0].face, this.blobs[1].face], events,
      match.logic.scores, match.logic.scoreToWin)
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
          this.squashBall(w, 0.10 + 0.07 * inten)
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
          this.squashBall(w, 0.12)
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
        case Ev.SPECIAL_READY: {
          const p = e.side as Side
          const bx = gx(w.blobX[p]), by = gy(w.blobY[p])
          this.particles.burst({
            x: bx, y: by, z: 0, count: 90, speed: 2.2, spread: 0.5, up: 1.8,
            life: 1.1, size: 0.03, color: new THREE.Color(1.0, 0.82, 0.34), drag: 1.6, colorJitter: 0.2,
          })
          break
        }
        case Ev.SPECIAL_FIRED: {
          const p = e.side as Side
          const bx = gx(w.ballX), by = gy(w.ballY)
          this.trauma = Math.min(1, this.trauma + 0.75)
          this.hitstop = Math.max(this.hitstop, 0.11)
          this.aberration = Math.max(this.aberration, 2.2)
          this.flash = Math.max(this.flash, 0.30)
          const col = (this.blobs[p].visual.uniforms.uColor.value as THREE.Color)
          this.particles.burst({
            x: bx, y: by, z: 0, count: 520, speed: 15, spread: 3.14, up: 0.2,
            life: 0.85, size: 0.05, color: col, drag: 2.0, colorJitter: 0.35,
          })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 260, speed: 24, spread: 0.55, up: 0.1,
            life: 0.45, size: 0.075, color: new THREE.Color(1.0, 0.95, 0.7), drag: 3.0,
          })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 140, speed: 5, spread: 3.14, up: 1.4,
            life: 1.5, size: 0.035, color: new THREE.Color(1.0, 0.76, 0.2), drag: 1.1, colorJitter: 0.25,
          })
          this.ball.flash(4.5)
          const b = this.blobs[p]
          b.wobble = 1.6
          b.mouth = 1
          b.flash = 1
          b.squashVel -= 3.4
          break
        }
        case Ev.SPECIAL_GROUND: {
          const bx = gx(w.ballX)
          this.trauma = 1
          this.hitstop = Math.max(this.hitstop, 0.14)
          this.aberration = Math.max(this.aberration, 3.4)
          this.flash = Math.max(this.flash, 0.42)
          this.addScorch(bx)
          this.particles.burst({
            x: bx, y: 0.1, z: 0, count: 520, speed: 16, spread: 1.5, up: 2.4,
            life: 1.1, size: 0.06, color: new THREE.Color(1.0, 0.48, 0.08), drag: 1.9, colorJitter: 0.4,
          })
          this.particles.burst({
            x: bx, y: 0.1, z: 0, count: 240, speed: 6, spread: 3.14, up: 3.2,
            life: 2.2, size: 0.08, color: new THREE.Color(0.18, 0.14, 0.12), drag: 1.0, colorJitter: 0.2,
          })
          this.particles.burst({
            x: bx, y: 0.1, z: 0, count: 180, speed: 26, spread: 0.35, up: 0.2,
            life: 0.5, size: 0.05, color: new THREE.Color(1.0, 0.95, 0.72), drag: 3.2,
          })
          break
        }
        case Ev.DIVE: {
          const p = e.side as Side
          const d = w.diveDir[p] || 1
          const px = gx(w.blobX[p])
          this.trauma = Math.min(1, this.trauma + 0.09)
          // areia arrancada pelo impulso, saindo pro lado oposto ao salto
          this.particles.burst({
            x: px - d * 0.3, y: 0.06, z: 0, count: 160, speed: 4.6, spread: 1.5, up: 1.4,
            life: 1.0, size: 0.02, color: new THREE.Color(0.84, 0.72, 0.53), drag: 2.2, colorJitter: 0.22,
          })
          this.blobs[p].squashVel -= 1.6
          break
        }
        case Ev.DIVE_HIT: {
          const p = e.side as Side
          const px = gx(w.blobX[p])
          this.trauma = Math.min(1, this.trauma + 0.2)
          this.hitstop = Math.max(this.hitstop, 0.045)
          this.addShock(gx(w.ballX), gy(w.ballY),
            { from: 0.1, to: gr(140), life: 0.34, color: new THREE.Color(1.4, 1.3, 1.0) })
          this.particles.burst({
            x: gx(w.ballX), y: gy(w.ballY), z: 0, count: 90, speed: 7.5, spread: 2.4, up: 1.0,
            life: 0.5, size: 0.03, color: new THREE.Color(1.2, 1.1, 0.85), drag: 3.0, colorJitter: 0.2,
          })
          this.particles.burst({
            x: px, y: 0.06, z: 0, count: 140, speed: 3.6, spread: 2.2, up: 1.2,
            life: 1.2, size: 0.022, color: new THREE.Color(0.82, 0.70, 0.5), drag: 2.0, colorJitter: 0.25,
          })
          this.terrain.addCrater(px, 0, 0.9, 0.16)
          this.ball.flash(1.4)
          this.squashBall(w, 0.24)
          this.blobs[p].wobble = 1.0
          break
        }
        case Ev.APEX_HIT: {
          this.addShock(gx(w.ballX), gy(w.ballY),
            { from: 0.05, to: gr(110), life: 0.26, color: new THREE.Color(1.5, 1.35, 0.7), opacity: 0.7 })
          this.particles.burst({
            x: gx(w.ballX), y: gy(w.ballY), z: 0, count: 34, speed: 5.5, spread: 2.0, up: 0.5,
            life: 0.3, size: 0.026, color: new THREE.Color(1.4, 1.25, 0.7), drag: 3.4,
          })
          this.ball.flash(1.1)
          break
        }
        case Ev.SPECIAL_WASTED: {
          const p = e.side as Side
          const px = gx(w.blobX[p]), py = gy(w.blobY[p] - BLOBBY_UPPER_SPHERE)
          this.trauma = Math.min(1, this.trauma + 0.14)
          this.addShock(px, py, { from: 0.2, to: gr(SPECIAL_REACH) * 1.1, life: 0.42, color: new THREE.Color(1.2, 0.65, 0.2) })
          this.particles.burst({
            x: px, y: py, z: 0, count: 90, speed: 3.4, spread: 3.14, up: 1.6,
            life: 0.9, size: 0.03, color: new THREE.Color(0.85, 0.66, 0.28), drag: 2.0, colorJitter: 0.3,
          })
          this.blobs[p].wobble = 1.1
          this.blobs[p].squashVel -= 1.4
          break
        }
        case Ev.RESET_BALL: {
          this.gib[0] = 0; this.gib[1] = 0
          break
        }
        case Ev.PARRY_TRY: {
          const p = e.side as Side
          this.particles.burst({
            x: gx(w.blobX[p]), y: gy(w.blobY[p]) + 1.3, z: 0, count: 22, speed: 2.6, spread: 3.14, up: 0.8,
            life: 0.3, size: 0.026, color: new THREE.Color(0.42, 0.78, 1.0), drag: 3.6,
          })
          break
        }
        case Ev.PARRY: {
          const p = e.side as Side
          const px = gx(w.blobX[p]), py = gy(w.blobY[p]) + 1.3
          this.trauma = Math.min(1, this.trauma + 0.5)
          this.hitstop = Math.max(this.hitstop, 0.09)
          this.aberration = Math.max(this.aberration, 2.6)
          this.flash = Math.max(this.flash, 0.34)
          this.addShock(px, py, { from: 0.5, to: 8.0, life: 0.5, color: new THREE.Color(0.1, 0.85, 1.8) })
          this.addShock(px, py, { from: 0.4, to: 4.2, life: 0.24, color: new THREE.Color(1.1, 1.4, 1.6) })
          this.particles.burst({
            x: px, y: py, z: 0, count: 200, speed: 13, spread: 3.14, up: 0.4,
            life: 0.7, size: 0.05, color: new THREE.Color(0.36, 0.84, 1.0), drag: 2.2, colorJitter: 0.3,
          })
          this.particles.burst({
            x: px, y: py, z: 0, count: 110, speed: 22, spread: 0.5, up: 0.1,
            life: 0.4, size: 0.062, color: new THREE.Color(0.85, 0.98, 1.0), drag: 3.2,
          })
          this.ball.flash(3.6)
          const bp = this.blobs[p]
          bp.wobble = 1.5
          bp.flash = 1
          bp.squashVel -= 3.0
          break
        }
        case Ev.DIG: {
          const p = e.side as Side
          const dir = p === LEFT ? 1 : -1
          const px = gx(w.blobX[p]), py = gy(w.blobY[p] + BLOBBY_LOWER_SPHERE)
          this.trauma = Math.min(1, this.trauma + 0.12)
          this.addShock(px + dir * 0.5, py, { from: 0.3, to: 2.6, life: 0.3, color: new THREE.Color(0.82, 0.94, 1.2) })
          this.particles.burst({
            x: px + dir * 0.4, y: 0.05, z: 0, count: 90, speed: 3.4, spread: 1.6, up: 0.9,
            life: 0.8, size: 0.018, color: new THREE.Color(0.84, 0.74, 0.56), drag: 2.6,
            dirX: dir, colorJitter: 0.2,
          })
          this.particles.burst({
            x: gx(w.ballX), y: gy(w.ballY), z: 0, count: 40, speed: 4.2, spread: 2.4, up: 0.5,
            life: 0.45, size: 0.03, color: new THREE.Color(0.9, 0.96, 1.1), drag: 3.2,
          })
          const b = this.blobs[p]
          b.wobble = Math.max(b.wobble, 0.8)
          b.squashVel -= 1.2
          this.ball.flash(1.0)
          break
        }
        case Ev.BALL_OUT: {
          const bx = gx(w.ballX), by = gy(w.ballY)
          this.trauma = Math.min(1, this.trauma + 0.08)
          this.addShock(bx, by, { from: 0.3, to: 2.6, life: 0.4, color: new THREE.Color(1.2, 0.5, 0.5) })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 40, speed: 4.5, spread: 1.4, up: 0.4,
            life: 0.6, size: 0.03, color: new THREE.Color(1.3, 0.6, 0.55), drag: 3.0,
          })
          break
        }
        case Ev.FATALITY: {
          const p = e.side as Side
          const o: Side = p === LEFT ? RIGHT : LEFT
          const bx = gx(w.blobX[o]), by = gy(w.blobY[o])
          this.trauma = 1
          this.hitstop = Math.max(this.hitstop, 0.3)
          this.aberration = Math.max(this.aberration, 5)
          this.flash = Math.max(this.flash, 0.75)
          this.addScorch(bx)
          for (let i = 0; i < 3; i++) {
            this.particles.burst({
              x: bx, y: by + 1 + i * 0.5, z: 0, count: 460, speed: 13 + i * 5, spread: 3.14, up: 1.1,
              life: 2.4, size: 0.075, color: new THREE.Color(0.62 - i * 0.12, 0.03, 0.03), drag: 0.8, colorJitter: 0.3,
            })
          }
          this.particles.burst({
            x: bx, y: by + 1.2, z: 0, count: 220, speed: 5, spread: 3.14, up: 2.2,
            life: 2.8, size: 0.05, color: new THREE.Color(0.9, 0.75, 0.75), drag: 1.2, colorJitter: 0.25,
          })
          const col = (this.blobs[o].visual.uniforms.uColor.value as THREE.Color)
          for (let i = 0; i < 3; i++) {
            this.particles.burst({
              x: bx, y: by + 0.6 + i * 0.6, z: 0, count: 300, speed: 10 + i * 6, spread: 3.14, up: 1.4,
              life: 2.2, size: 0.11 - i * 0.02, color: col, drag: 0.9, colorJitter: 0.45,
            })
          }
          this.particles.burst({
            x: bx, y: by + 1.0, z: 0, count: 160, speed: 24, spread: 0.9, up: 0.3,
            life: 0.5, size: 0.07, color: new THREE.Color(1.0, 0.94, 0.86), drag: 3.0,
          })
          const b = this.blobs[o]
          b.wobble = 3
          b.mouth = 1
          b.flash = 1
          b.squashVel -= 7
          this.gib[o] = 1
          break
        }
        case Ev.SPECIAL_HIT: {
          const p = e.side as Side
          const bx = gx(w.blobX[p]), by = gy(w.blobY[p])
          this.trauma = Math.min(1, this.trauma + 0.95)
          this.hitstop = Math.max(this.hitstop, 0.16)
          this.aberration = Math.max(this.aberration, 3.0)
          this.flash = Math.max(this.flash, 0.42)
          this.particles.burst({
            x: bx, y: by, z: 0, count: 460, speed: 17, spread: 3.14, up: 0.6,
            life: 1.0, size: 0.055, color: new THREE.Color(1.0, 0.35, 0.3), drag: 2.2, colorJitter: 0.4,
          })
          this.particles.burst({
            x: bx, y: by, z: 0, count: 200, speed: 7, spread: 3.14, up: 1.9,
            life: 1.8, size: 0.04, color: new THREE.Color(1.0, 0.92, 0.55), drag: 1.0, colorJitter: 0.3,
          })
          const b = this.blobs[p]
          b.wobble = 2.2
          b.mouth = 1
          b.flash = 1
          b.squashVel -= 5.0
          break
        }
      }
    }
  }

  /** Anel dourado do especial pronto. Some quando não dá pra usar. */
  private updateReach(match: Match, alpha: number, dt: number) {
    const w = match.world
    for (const i of [LEFT, RIGHT] as Side[]) {
      const gxp = THREE.MathUtils.lerp(this.prev.px[i], this.cur.px[i], alpha)
      const gyp = THREE.MathUtils.lerp(this.prev.py[i], this.cur.py[i], alpha)
      const x = gx(gxp), y = gy(gyp - BLOBBY_UPPER_SPHERE)
      const hidden = this.gib[i] > 0 || w.stun[i] > 0
      const on = !hidden && w.charge[i] >= SPECIAL_FULL
      const m = this.reachRings[i]
      const mat = m.material as THREE.MeshBasicMaterial
      const want = on ? 0.34 + Math.sin(this.time * 2.6) * 0.07 : 0
      mat.opacity += (want - mat.opacity) * Math.min(1, dt * 9)
      m.visible = mat.opacity > 0.004
      m.position.set(x, y, 0)
    }
  }

  private updateBlob(i: Side, alpha: number, dt: number, match: Match) {
    const b = this.blobs[i]
    if (this.gib[i] > 0) { b.visual.group.visible = false; return }
    b.visual.group.visible = true
    const u = b.visual.uniforms
    const p = this.prev, c = this.cur
    const gxp = THREE.MathUtils.lerp(p.px[i], c.px[i], alpha)
    const gyp = THREE.MathUtils.lerp(p.py[i], c.py[i], alpha)
    const st = THREE.MathUtils.lerp(p.state[i], c.state[i], alpha)

    const world = match.world
    const cr = world.crouch[i]
    const wx = gx(gxp), wy = gy(gyp)
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

    // mergulho é bote, não tombo: o corpo estica pra frente, achata em pé e
    // tomba só o que basta pra ler a direção. Tombar de vez virava salsicha.
    const air = world.diveFrames[i] > 0
    const dive = air ? 1 : Math.min(1, world.diveRecover[i] / (DIVE_RECOVER * 0.55))

    const sy = 1 + b.squashSpring + airStretch - anim * 0.5 - cr * 0.34 - dive * 0.32
    const sxz = 1 - (b.squashSpring + airStretch) * 0.55 + anim * 0.45 + cr * 0.26
    ;(u.uSquash.value as THREE.Vector3).set(sxz + dive * 0.46, sy, sxz - dive * 0.1)

    // o squash encolhe em volta da origem do grupo: sem baixar, o blob agachado
    // descola do chão em vez de afundar nele
    b.visual.group.position.set(
      wx + world.diveDir[i] * dive * 0.16,
      wy - cr * CROUCH_DUCK * S * (grounded ? 1.05 : 0.4) - dive * 0.22, 0)

    b.wobble = Math.max(0, b.wobble - dt * 2.4)
    u.uWobbleAmp.value = b.wobble
    u.uWobblePhase.value += dt * 26

    // lean into movement
    const lean = dive > 0.01
      ? -world.diveDir[i] * 0.44 * dive
      : -vx * 0.028 + (grounded ? 0 : vy * 0.004)
    b.visual.group.rotation.z = THREE.MathUtils.lerp(
      b.visual.group.rotation.z, lean, 1 - Math.exp(-dt * (dive > 0.01 ? 26 : 12)))

    // areia levantando o mergulho inteiro: no ar é o rastro, no chão é o arrasto
    if (dive > 0.01 && Math.random() < dt * 60) {
      this.particles.burst({
        x: wx - world.diveDir[i] * 0.45, y: air ? Math.max(0.06, wy * 0.35) : 0.05, z: (Math.random() - 0.5) * 0.5,
        count: 3, speed: air ? 2.2 : 1.2, spread: 1.8, up: air ? 0.5 : 1.0, life: 0.85,
        size: 0.019, color: new THREE.Color(0.84, 0.72, 0.53), drag: 2.4, colorJitter: 0.2,
      })
    }

    if (world.stun[i] > 0) {
      b.visual.group.rotation.z += Math.sin(this.time * 9.5) * 0.24
      b.wobble = Math.max(b.wobble, 0.5 + Math.sin(this.time * 17) * 0.22)
      u.uWobbleAmp.value = b.wobble
      if (Math.random() < dt * 30) {
        const a = this.time * 3.4 + Math.random() * 6.283
        this.particles.burst({
          x: wx + Math.cos(a) * 0.8, y: wy + 1.4 + Math.sin(a * 2) * 0.14, z: Math.sin(a) * 0.55,
          count: 1, speed: 0.3, spread: 1.2, up: 0.5, life: 0.8, size: 0.05,
          color: new THREE.Color(1.0, 0.88, 0.32), drag: 1.2,
        })
      }
    }

    // eyes track the ball
    const bx = gx(THREE.MathUtils.lerp(p.bx, c.bx, alpha))
    const by = gy(THREE.MathUtils.lerp(p.by, c.by, alpha))
    const aim = (u.uEyeAim.value as THREE.Vector3)
    const upperY = wy + 0.38
    aim.set(bx - wx, by - upperY, 5.5).normalize()

    const ballNear = Math.hypot(bx - wx, by - wy) < 1.6
    b.face.update(dt, this.tension, ballNear)
    const f = b.face.cur
    u.uBlink.value = 0.08 + b.face.blink * 0.92
    u.uLid.value = f.lid
    u.uCurve.value = f.curve
    u.uBrow.value = f.brow
    u.uTear.value = f.tear

    b.mouth = Math.max(0, b.mouth - dt * 3.2)
    u.uMouth.value = Math.max(b.mouth, f.open)

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
    this.tension += (rallyTension(match.logic.rally) - this.tension) * Math.min(1, dt * 2.2)

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

    const px = Math.max(-this.camSpan, Math.min(this.camSpan, this.camTargetX))
    this.camera.position.set(px + sway + shx, 5.9 + swayY + shy, this.camZ - this.trauma * 0.5)
    this.camera.lookAt(bx * CAM_LOOK, 2.7 + by * 0.07, 0)
    this.camera.rotation.z += shr
    this.camera.fov = 38 - Math.min(this.ballSpeed, 22) * 0.05
    this.camera.updateProjectionMatrix()

    this.sun.target.position.set(this.camTargetX * 0.5, 2, 0)
    this.sun.position.copy(this.sunDir).multiplyScalar(60).add(this.sun.target.position)

    this.ball.setTransform(bx, by, 0, brot, Math.sin(this.time * 0.7) * 0.25)
    this.ball.update(dt, this.ballSpeed)
    this.ball.flash(Math.max(0, (this.ball.mesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity - dt * 4))

    if (match.world.superFrames > 0) {
      const owner = match.world.superOwner
      const col = owner >= 0
        ? (this.blobs[owner as Side].visual.uniforms.uColor.value as THREE.Color)
        : new THREE.Color(1.0, 0.7, 0.2)
      this.ball.flash(3.4 + Math.sin(this.time * 30) * 0.8)
      this.particles.burst({
        x: bx, y: by, z: 0, count: 13, speed: 2.2, spread: 3.14, up: 1.5,
        life: 0.55, size: 0.085, color: new THREE.Color(1.0, 0.42, 0.05), drag: 2.6, colorJitter: 0.3,
      })
      this.particles.burst({
        x: bx, y: by, z: 0, count: 8, speed: 1.1, spread: 3.14, up: 0.4,
        life: 0.32, size: 0.068, color: new THREE.Color(1.0, 0.95, 0.72), drag: 3.4,
      })
      this.particles.burst({
        x: bx, y: by, z: 0, count: 5, speed: 0.6, spread: 3.14, up: 2.1,
        life: 1.4, size: 0.055, color: new THREE.Color(0.16, 0.13, 0.12), drag: 1.4, colorJitter: 0.15,
      })
      this.particles.burst({
        x: bx, y: by, z: 0, count: 3, speed: 0.9, spread: 3.14, up: 0.8,
        life: 0.7, size: 0.04, color: col, drag: 2.0, colorJitter: 0.3,
      })
    }

    this.ballSquash.k = Math.max(0, this.ballSquash.k - dt * 0.85)
    this.ball.squash(this.ballSquash.k, this.ballSquash.ang)
    this.updateReach(match, alpha, dt)

    crouchMoods([this.blobs[0].face, this.blobs[1].face], match.world.crouch)
    reachMoods([this.blobs[0].face, this.blobs[1].face], match.world, match.logic.isBallValid)
    this.updateBlob(LEFT, alpha, dt, match)
    this.updateBlob(RIGHT, alpha, dt, match)

    this.updateScorches(dt)
    this.updateShocks(dt)
    this.updateEmotes(dt)
    this.net.update(dt)
    this.terrain.update(dt)
    this.scenery.update(this.time, dt)
    this.indoor.update(this.time, this.tension)
    this.campfire.update(this.time)
    this.fg3.update(dt, this.time)
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

      const sunWorld = this.sunDir.clone().multiplyScalar(500)
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

  emote(side: Side, id: number) {
    const def = emoteAt(id)
    const b = this.blobs[side]
    const base = b.visual.group.position
    const mat = new THREE.MeshBasicMaterial({
      map: emoteTexture(def.glyph), transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(EMOTE_GEO, mat)
    mesh.position.set(base.x, base.y + 1.5, 0.9)
    mesh.scale.setScalar(0.05)
    mesh.renderOrder = 40
    this.scene.add(mesh)
    this.emotes.push({ mesh, life: 0, max: 1.9, spin: (Math.random() - 0.5) * 1.4 })

    const col = new THREE.Color(def.color)
    this.particles.burst({
      x: base.x, y: base.y + 1.1, z: 0.4, count: id === 1 ? 220 : 90,
      speed: id === 1 ? 4.2 : 2.0, spread: 3.14, up: id === 0 ? -0.5 : 1.0,
      life: id === 1 ? 2.4 : 1.2, size: 0.05, color: col, drag: 1.5,
      colorJitter: id === 1 ? 0.6 : 0.2,
    })
    b.wobble = Math.max(b.wobble, 1.0)
    b.squashVel -= id === 1 ? 3.0 : 1.6
  }

  private updateEmotes(dt: number) {
    if (!this.emotes.length) return
    const keep: EmotePop[] = []
    for (const e of this.emotes) {
      e.life += dt
      const t = e.life / e.max
      if (t >= 1) { this.scene.remove(e.mesh); e.mesh.material.dispose(); continue }
      const pop = t < 0.16 ? t / 0.16 : 1
      const ease = 1 - Math.pow(1 - pop, 3)
      const s = 1.5 * ease * (1 + Math.sin(this.time * 11 + e.spin) * 0.05)
      e.mesh.scale.setScalar(s)
      e.mesh.position.y += dt * 0.55
      e.mesh.position.x += Math.sin(this.time * 3 + e.spin * 4) * dt * 0.25
      e.mesh.material.opacity = t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1
      e.mesh.rotation.z = Math.sin(this.time * 5 + e.spin * 3) * 0.18
      keep.push(e)
    }
    this.emotes = keep
  }

  celebrate(side: Side) {
    this.blobs[side].face.set('laugh', 6, 9)
    this.blobs[side === LEFT ? RIGHT : LEFT].face.set('sad', 6, 9)
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

  /** Achata na direção da batida; o mundo 3D tem y pra cima, daí o sinal. */
  private squashBall(w: Match['world'], k: number) {
    const v = Math.sqrt(w.ballVX * w.ballVX + w.ballVY * w.ballVY)
    this.ballSquash.ang = v > 0.001 ? Math.atan2(-w.ballVY, w.ballVX) : 0
    this.ballSquash.k = Math.max(this.ballSquash.k, k)
  }

  private addShock(x: number, y: number, o: {
    from: number; to: number; life: number; color: THREE.Color; flat?: boolean; opacity?: number
  }) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTexture(), color: o.color, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, opacity: o.opacity ?? 1,
    })
    const mesh = new THREE.Mesh(SHOCK_GEO, mat)
    mesh.position.set(x, y, 0.2)
    if (o.flat) { mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.06, 0) }
    mesh.scale.setScalar(o.from)
    mesh.renderOrder = 45
    this.scene.add(mesh)
    this.shocks.push({ mesh, life: 0, max: o.life, from: o.from, to: o.to, flat: !!o.flat })
    if (this.shocks.length > 12) {
      const old = this.shocks.shift()!
      this.scene.remove(old.mesh)
      old.mesh.material.dispose()
    }
  }

  private updateShocks(dt: number) {
    if (!this.shocks.length) return
    const keep: Shock[] = []
    for (const sh of this.shocks) {
      sh.life += dt
      const t = sh.life / sh.max
      if (t >= 1) { this.scene.remove(sh.mesh); sh.mesh.material.dispose(); continue }
      const e = 1 - Math.pow(1 - t, 2.6)
      const r = sh.from + (sh.to - sh.from) * e
      sh.mesh.scale.set(r, sh.flat ? r * 0.42 : r, 1)
      sh.mesh.material.opacity = Math.pow(1 - t, 1.6)
      keep.push(sh)
    }
    this.shocks = keep
  }

  private addScorch(x: number) {
    const mat = new THREE.MeshBasicMaterial({
      map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0.95,
    })
    const mesh = new THREE.Mesh(SCORCH_GEO, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.03, 0)
    mesh.scale.setScalar(3.4 + Math.random() * 0.8)
    mesh.renderOrder = 2
    this.scene.add(mesh)
    this.scorches.push({ mesh, life: 0 })
    if (this.scorches.length > 5) {
      const old = this.scorches.shift()!
      this.scene.remove(old.mesh)
      old.mesh.material.dispose()
    }
  }

  private updateScorches(dt: number) {
    if (!this.scorches.length) return
    const keep: Scorch[] = []
    for (const sc of this.scorches) {
      sc.life += dt
      if (sc.life > 16) { this.scene.remove(sc.mesh); sc.mesh.material.dispose(); continue }
      sc.mesh.material.opacity = 0.95 * Math.max(0, 1 - sc.life / 16)
      keep.push(sc)
    }
    this.scorches = keep
  }

  dispose() {
    for (const e of this.emotes) { this.scene.remove(e.mesh); e.mesh.material.dispose() }
    this.emotes.length = 0
    for (const sc of this.scorches) { this.scene.remove(sc.mesh); sc.mesh.material.dispose() }
    for (const sh of this.shocks) { this.scene.remove(sh.mesh); sh.mesh.material.dispose() }
    this.scorches.length = 0
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
