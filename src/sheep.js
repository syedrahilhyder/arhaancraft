// Sheep: a simple wandering voxel animal that walks around the terrain.

import * as THREE from 'three'
import { SEA_LEVEL } from './world.js'

const WALK_SPEED = 1.2
const WALK_MIN = 2.0  // seconds spent walking
const WALK_MAX = 5.0
const REST_MIN = 1.5  // seconds spent idle
const REST_MAX = 4.0
const WANDER_RADIUS = 20
const TURN_RATE = 6.0

export class Sheep {
  constructor(world, anchorX, anchorZ, modelIndex = 0) {
    this.world = world
    this.anchor = new THREE.Vector2(anchorX, anchorZ)
    this.position = new THREE.Vector3(0, 0, 0)
    this.yaw = Math.random() * Math.PI * 2
    this.dir = new THREE.Vector3(0, 0, 0)
    this.state = 'rest'
    this.timer = REST_MIN + Math.random() * (REST_MAX - REST_MIN)
    this.walkPhase = Math.random() * Math.PI * 2
    this.group = this.buildModel(modelIndex)
    this.place(anchorX, anchorZ)
  }

  // Build the sheep from a few boxes. The group origin is at the feet; faces +X.
  buildModel(variant) {
    const g = new THREE.Group()
    const woolMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ea })
    const skinMat = new THREE.MeshLambertMaterial({ color: variant % 2 ? 0xc9a284 : 0xd8b89b })
    const legMat = skinMat

    // Legs (front/back x, left/right z), pivot at the top so they can swing.
    const legGeo = new THREE.BoxGeometry(0.2, 0.42, 0.2)
    this.legs = []
    const legOffsets = [
      [0.4, 0.24], [0.4, -0.24], [-0.4, 0.24], [-0.4, -0.24],
    ]
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, legMat)
      leg.position.set(lx, 0.42, lz)
      g.add(leg)
      this.legs.push(leg)
    }

    // Body (wool).
    const bodyGeo = new THREE.BoxGeometry(1.15, 0.7, 0.75)
    const body = new THREE.Mesh(bodyGeo, woolMat)
    body.position.set(0, 0.72, 0)
    g.add(body)
    this.body = body
    this.bodyBaseY = body.position.y

    // Head (wool with a tan face), plus a nose.
    const headGeo = new THREE.BoxGeometry(0.45, 0.5, 0.5)
    const head = new THREE.Mesh(headGeo, woolMat)
    head.position.set(0.62, 0.95, 0)
    g.add(head)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.24), skinMat)
    nose.position.set(0.84, 0.9, 0)
    g.add(nose)

    // Ears.
    const earGeo = new THREE.BoxGeometry(0.12, 0.08, 0.22)
    const earL = new THREE.Mesh(earGeo, skinMat)
    earL.position.set(0.55, 1.12, 0.3)
    g.add(earL)
    const earR = new THREE.Mesh(earGeo, skinMat)
    earR.position.set(0.55, 1.12, -0.3)
    g.add(earR)

    return g
  }

  place(x, z) {
    const h = this.world.heightAt(x, z)
    this.position.set(x + 0.5, h + 1, z + 0.5)
    this.group.position.copy(this.position)
    this.group.rotation.y = this.yaw
  }

  isLand(x, z) {
    return this.world.heightAt(x, z) >= SEA_LEVEL
  }

  pickDirection() {
    // If far from the anchor, steer back toward it; otherwise wander randomly.
    const dx = this.anchor.x - this.position.x
    const dz = this.anchor.y - this.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > WANDER_RADIUS) {
      this.dir.set(dx, 0, dz).normalize()
    } else {
      const a = Math.random() * Math.PI * 2
      this.dir.set(Math.cos(a), 0, Math.sin(a))
    }
  }

  update(dt) {
    this.timer -= dt
    if (this.state === 'walk') {
      const step = WALK_SPEED * dt
      const nx = this.position.x + this.dir.x * step
      const nz = this.position.z + this.dir.z * step
      // Only step onto dry land.
      if (this.isLand(nx - 0.5, nz - 0.5)) {
        this.position.x = nx
        this.position.z = nz
      } else {
        // Hit water (or the edge of land): stop and pick a new heading.
        this.state = 'rest'
        this.timer = REST_MIN + Math.random() * (REST_MAX - REST_MIN)
      }
      // Face the direction of travel.
      const targetYaw = Math.atan2(this.dir.x, this.dir.z)
      this.yaw = this.lerpAngle(this.yaw, targetYaw, Math.min(1, TURN_RATE * dt))
      // Walk animation: swing legs, bob the body.
      this.walkPhase += dt * 9
      const swing = Math.sin(this.walkPhase) * 0.4
      this.legs[0].rotation.x = swing
      this.legs[1].rotation.x = -swing
      this.legs[2].rotation.x = -swing
      this.legs[3].rotation.x = swing
      this.body.position.y = this.bodyBaseY + Math.sin(this.walkPhase * 2) * 0.03
      if (this.timer <= 0) {
        this.state = 'rest'
        this.timer = REST_MIN + Math.random() * (REST_MAX - REST_MIN)
        // Reset leg/body pose.
        for (const leg of this.legs) leg.rotation.x = 0
        this.body.position.y = this.bodyBaseY
      }
    } else {
      if (this.timer <= 0) {
        this.state = 'walk'
        this.timer = WALK_MIN + Math.random() * (WALK_MAX - WALK_MIN)
        this.pickDirection()
      }
    }

    // Keep the sheep on the terrain surface (follow hills) and animate subtle idle bob.
    const h = this.world.heightAt(this.position.x - 0.5, this.position.z - 0.5)
    const idleBob = this.state === 'rest' ? Math.sin((this.walkPhase += dt * 2)) * 0.02 : 0
    this.position.y = Math.max(this.position.y + (h + 1 - this.position.y) * 0.2, h + 1)
    this.group.position.copy(this.position)
    this.group.position.y += idleBob
    this.group.rotation.y = this.yaw
  }

  lerpAngle(a, b, t) {
    let d = b - a
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return a + d * t
  }
}
