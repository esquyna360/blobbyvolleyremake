import * as THREE from 'three'

export interface Campfire {
  group: THREE.Group
  setPower(v: number): void
  update(t: number): void
}

function flameTex(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  rad.addColorStop(0, 'rgba(255,240,190,1)')
  rad.addColorStop(0.3, 'rgba(255,150,50,0.75)')
  rad.addColorStop(1, 'rgba(255,90,20,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** Fogueira do luau: só existe pra jogar luz quente na areia. */
export function createCampfire(): Campfire {
  const group = new THREE.Group()
  group.position.set(-13.5, 0, -1.5)
  group.visible = false

  const logMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.17, 0.11, 0.07), roughness: 1,
  })
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.7, 6), logMat)
    log.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI * 2, 0)
    log.position.y = 0.24
    group.add(log)
  }

  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.42, 0.10), fog: false })
  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), emberMat)
  embers.position.y = 0.3
  group.add(embers)

  const tex = flameTex()
  const flames: THREE.Mesh[] = []
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false, opacity: 0.42 - i * 0.1,
    }))
    f.position.y = 0.85 + i * 0.12
    f.renderOrder = 6
    group.add(f)
    flames.push(f)
  }

  const light = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.22), 0, 34, 2)
  light.position.set(0, 1.1, 0)
  group.add(light)

  let base = 0
  return {
    group,
    setPower(v) { base = v; group.visible = v > 0 },
    update(t) {
      if (!group.visible) return
      const flick = 0.82 + Math.sin(t * 11.3) * 0.11 + Math.sin(t * 6.7 + 1.4) * 0.07
      light.intensity = base * flick
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i]
        f.scale.set(1 + Math.sin(t * (7 + i * 2.1)) * 0.12, flick * (1 + i * 0.08), 1)
        f.rotation.z = Math.sin(t * (3.1 + i)) * 0.09
      }
      ;(embers.material as THREE.MeshBasicMaterial).color.setRGB(1.0, 0.34 + flick * 0.14, 0.08)
    },
  }
}
