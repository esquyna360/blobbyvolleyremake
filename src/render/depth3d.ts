import * as THREE from 'three'
import { getDepth, depthScale, DEPTH_CAM_Z } from './depth.ts'
import type { DepthId } from './depth.ts'

/**
 * As camadas de profundidade em 3D. Cada uma é um plano chapado numa distância
 * fixa, dimensionado pra ocupar na tela o mesmo pedaço que ocuparia na quadra:
 * parado ninguém nota, e é só a câmera passear que a de trás fica pra trás e a
 * da frente dispara — que é o efeito inteiro.
 */
export class Depth3D {
  readonly group = new THREE.Group()
  private meshes: THREE.Mesh[] = []

  setScene(id: DepthId) {
    this.clear()
    for (const l of getDepth(id)) {
      const shapes = l.poly.map(p => {
        const s = new THREE.Shape()
        s.moveTo(p[0], -p[1])
        for (let i = 2; i < p.length; i += 2) s.lineTo(p[i], -p[i + 1])
        s.closePath()
        return s
      })
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shapes),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(l.color),
          transparent: l.alpha < 1,
          opacity: l.alpha,
          fog: false,
          depthWrite: l.alpha >= 1,
          side: THREE.DoubleSide,
        }),
      )
      // silhueta de trás vai antes de tudo, a da frente depois de todo mundo
      mesh.renderOrder = l.z > 0 ? 40 : -40
      mesh.userData.z = l.z
      mesh.userData.anchor = l.anchor
      this.meshes.push(mesh)
      this.group.add(mesh)
    }
  }

  /** `eyeY` e `lookY` são os do descanso, não os do quadro: usar os de agora
   * gruda a camada na câmera e mata o paralaxe vertical. */
  update(camZ: number, fov: number, aspect: number, eyeY: number, lookY: number) {
    // a câmera olha um pouco pra baixo: plano deitado no eixo z pega esse
    // ângulo de esguelha e joga o rodapé pra fora da tela. Inclinar de volta
    // devolve o mesmo enquadramento que o 2D tem.
    const drop = eyeY - lookY
    const dist = Math.hypot(drop, camZ)
    const tilt = -Math.atan2(drop, camZ)
    const hh = Math.tan((fov * Math.PI) / 360) * dist
    const hw = hh * aspect
    for (const m of this.meshes) {
      const z = m.userData.z as number
      // a distância anda junto com a câmera: sem isso, ao abrir a quadra a
      // areia passa por cima da folhagem de baixo, que fica enterrada
      const k = depthScale(z, DEPTH_CAM_Z)
      const ze = z * (camZ / DEPTH_CAM_Z)
      // horizonte é a altura do olho: a linha do infinito sai reta da câmera.
      // chão é o zero do mundo, que é onde a quadra está.
      const a = m.userData.anchor as string
      const y = a === 'horizon' ? eyeY : a === 'ground' ? 0 : lookY + drop * (z / DEPTH_CAM_Z)
      m.position.set(0, y, ze)
      m.rotation.x = tilt
      m.scale.set(hw * k, hh * k, 1)
    }
  }

  private clear() {
    for (const m of this.meshes) {
      this.group.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.meshes.length = 0
  }

  dispose() { this.clear() }
}
