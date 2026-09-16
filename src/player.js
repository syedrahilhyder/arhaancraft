// Player controller: position, physics (gravity, collision), and look direction.
// Movement is driven by a joystick (x,z) and look by touch drag.

import * as THREE from 'three'
import { World, SEA_LEVEL } from './world.js'
import { BLOCKS, AIR, WATER } from './blocks.js'

const GRAVITY = 24
const JUMP_VELOCITY = 8.5
const WALK_SPEED = 5.0
const EYE_HEIGHT = 1.62
const PLAYER_WIDTH = 0.6
const PLAYER_HEIGHT = 1.8

export class Player {
  constructor(world, camera) {
    this.world = world
    this.camera = camera
    this.position = new THREE.Vector3(0, 40, 0)
    this.velocity = new THREE.Vector3(0, 0, 0)
    this.onGround = false
    this.yaw = 0
    this.pitch = 0
    // small start area
    this.spawn()
  }

  spawn() {
    // Find dry land (terrain at or above sea level) spiralling outward from origin,
    // so the player does not spawn submerged in water.
    let sx = 0, sz = 0
    let found = false
    for (let radius = 0; radius < 64 && !found; radius++) {
      for (let dx = -radius; dx <= radius && !found; dx++) {
        for (let dz = -radius; dz <= radius && !found; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
          if (this.world.heightAt(dx, dz) >= SEA_LEVEL) {
            sx = dx; sz = dz
            found = true
          }
        }
      }
    }
    if (!found) { sx = 0; sz = 0 }
    let h = this.world.heightAt(sx, sz)
    // Spawn 3 blocks above the ground at that column, which is above the water.
    this.position.set(sx + 0.5, Math.max(h, SEA_LEVEL) + 3, sz + 0.5)
    this.velocity.set(0, 0, 0)
  }

  // Returns true if there is a solid block at a world position
  isSolidAt(wx, wy, wz) {
    const id = this.world.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz))
    if (id === AIR || id === WATER) return false
    const b = BLOCKS[id]
    return b ? !!b.solid : false
  }

  // AABB collision check against world blocks
  collides(px, py, pz) {
    const hw = PLAYER_WIDTH / 2
    for (let x = -hw; x <= hw; x += hw) {
      for (let y = 0; y <= PLAYER_HEIGHT; y += PLAYER_HEIGHT) {
        for (let z = -hw; z <= hw; z += hw) {
          if (this.isSolidAt(px + x, py + y, pz + z)) return true
        }
      }
    }
    return false
  }

  update(dt, input) {
    // Look (deltas are already scaled per-frame by the input controller)
    this.yaw -= input.lookX
    this.pitch -= input.lookY
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch))

    // Move direction relative to yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const move = new THREE.Vector3()
    move.addScaledVector(forward, input.moveZ)
    move.addScaledVector(right, input.moveX)
    if (move.lengthSq() > 0) move.normalize()

    // Horizontal velocity
    const targetSpeed = WALK_SPEED
    this.velocity.x = move.x * targetSpeed
    this.velocity.z = move.z * targetSpeed

    // Jump
    if (input.jump && this.onGround) {
      this.velocity.y = JUMP_VELOCITY
      this.onGround = false
    }

    // Gravity
    this.velocity.y -= GRAVITY * dt

    // Integrate with collision resolution (axis by axis)
    this.moveAxis(dt, 'x')
    this.moveAxis(dt, 'z')
    this.moveAxis(dt, 'y')

    // Update camera
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  moveAxis(dt, axis) {
    const delta = this.velocity[axis] * dt
    if (delta === 0) return
    const old = this.position[axis]
    this.position[axis] += delta
    if (this.collides(this.position.x, this.position.y, this.position.z)) {
      this.position[axis] = old
      if (axis === 'y') {
        if (this.velocity.y < 0) this.onGround = true
        this.velocity.y = 0
      }
    } else if (axis === 'y') {
      this.onGround = false
    }
  }
}
