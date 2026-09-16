// Animated 3D models for the mechanical blocks (wire, switch, motor, piston).
// Each is built from box primitives and exposes setPowered(v) and an optional
// update(dt) for continuous animation. The group origin is the bottom-centre of
// the 1x1x1 block cell, so it drops straight into the chunk at local (x, y, z).

import * as THREE from 'three'
import { WIRE, MOTOR, PISTON, SWITCH } from './blocks.js'

const mat = (color) => new THREE.MeshLambertMaterial({ color })
const unpoweredWire = () => mat(0xc62828)
const poweredWire = () => new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 0.7 })

// Build the model for a mechanical block.
export function buildMechanicalBlock(id) {
  const group = new THREE.Group()

  if (id === WIRE) {
    // A flat conducting plate the player can walk over.
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), mat(0x2b2b2b))
    base.position.y = 0.03
    group.add(base)
    const stripX = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), unpoweredWire())
    stripX.position.y = 0.09
    group.add(stripX)
    const stripZ = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), unpoweredWire())
    stripZ.position.y = 0.09
    group.add(stripZ)
    const setPowered = (on) => {
      stripX.material = on ? poweredWire() : unpoweredWire()
      stripZ.material = on ? poweredWire() : unpoweredWire()
    }
    return { group, setPowered, update() {} }
  }

  if (id === SWITCH) {
    // A base block with a lever that tilts between off and on.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat(0x8d8d8d))
    body.position.y = 0.4
    group.add(body)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), mat(0x616161))
    cap.position.y = 0.85
    group.add(cap)
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), mat(0xffb300))
    lever.position.y = 0.21
    const pivot = new THREE.Group()
    pivot.position.y = 0.9
    pivot.add(lever)
    group.add(pivot)
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x37474f })
    )
    light.position.y = 0.86
    group.add(light)
    const setPowered = (on) => {
      pivot.rotation.x = on ? -0.9 : 0.4
      light.material = on
        ? new THREE.MeshLambertMaterial({ color: 0x76ff03, emissive: 0x76ff03, emissiveIntensity: 0.9 })
        : new THREE.MeshLambertMaterial({ color: 0x37474f })
    }
    return { group, setPowered, update() {} }
  }

  if (id === MOTOR) {
    // A housing with a spinning rotor on top.
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), mat(0x8a8f94))
    housing.position.y = 0.35
    group.add(housing)
    const rotor = new THREE.Group()
    rotor.position.y = 0.85
    const bladeMat = mat(0xef6c00)
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.16), bladeMat)
    rotor.add(b1)
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.16), bladeMat)
    b2.rotation.y = Math.PI / 2
    rotor.add(b2)
    const axle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat(0x424242))
    rotor.add(axle)
    group.add(rotor)
    let powered = false
    const setPowered = (on) => { powered = on }
    const update = (dt) => { if (powered) rotor.rotation.y += dt * 5 }
    return { group, setPowered, update }
  }

  if (id === PISTON) {
    // Housing with a rod and face that slide out when powered.
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(0x9e9e9e))
    housing.position.y = 0.35
    group.add(housing)
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.9), mat(0xe0e4e8))
    rod.position.set(0, 0.35, 0.35)
    group.add(rod)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.16), mat(0x616161))
    head.position.set(0, 0.35, 0.8)
    group.add(head)
    let powered = false
    const setPowered = (on) => {
      powered = on
      const ext = on ? 0.45 : 0
      rod.position.z = 0.35 + ext
      head.position.z = 0.8 + ext
    }
    return { group, setPowered, update() {} }
  }

  return { group, setPowered() {}, update() {} }
}
