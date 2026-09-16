// Player controller: position, physics (gravity, collision), and look direction.
// Movement is driven by a joystick (x,z) and look by touch drag.

import * as THREE from 'three'
import { World } from './world.js'
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
    // Find ground near origin
    let h = this.world.heightAt(0, 0)
    this.position.set(0.5, h + 3, 0.5)
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
    // Look
    this.yaw -= input.lookX * dt
    this.pitch -= input.lookY * dt
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
