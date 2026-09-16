// Small berry models that hang from tree leaves and can be picked.
// Built from box/sphere primitives so they read clearly at voxel scale.

import * as THREE from 'three'
import { STRAWBERRY } from './blocks.js'

export function isBerry(id) {
  return id === STRAWBERRY
}

// Build the berry mesh. Group origin is the bottom-centre of the block cell.
export function buildBerry() {
  const group = new THREE.Group()
  const berryMat = new THREE.MeshLambertMaterial({ color: 0xd32f2f })
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4caf50 })

  // Cluster of little red berries.
  const berry = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), berryMat)
  berry.position.y = 0.18
  berry.rotation.y = Math.PI / 4
  group.add(berry)

  // Green leafy cap on top.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), leafMat)
  cap.position.y = 0.38
  group.add(cap)

  // Seeds (tiny lighter dots) for texture.
  const seedMat = new THREE.MeshLambertMaterial({ color: 0xf5b7b7 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const seed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), seedMat)
    seed.position.set(Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18)
    group.add(seed)
  }

  group.castShadow = true
  return group
}
