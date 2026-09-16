// Generates custom 3D geometry for furniture blocks (table, chair, toilet, sink).
// These are built from small box primitives so each piece of furniture reads clearly.

import * as THREE from 'three'
import { TABLE, CHAIR, TOILET, SINK } from './blocks.js'

// Build a THREE.Group containing the furniture's meshes, scaled to fit one block (1x1x1).
// The block's base sits at y=0 (bottom of the block cell).
export function buildFurnitureGroup(blockId) {
  const group = new THREE.Group()
  const unit = 1.0 // one voxel

  const box = (color, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    )
    m.position.set(x, y, z)
    group.add(m)
    return m
  }

  switch (blockId) {
    case TABLE: {
      const wood = 0x8d6e63
      const top = 0xa1887f
      // table top
      box(top, 0.95, 0.12, 0.95, 0, 0.82, 0)
      // four legs
      const leg = 0.1
      const o = 0.4
      box(wood, leg, 0.78, leg, -o, 0.39, -o)
      box(wood, leg, 0.78, leg,  o, 0.39, -o)
      box(wood, leg, 0.78, leg, -o, 0.39,  o)
      box(wood, leg, 0.78, leg,  o, 0.39,  o)
      break
    }
    case CHAIR: {
      const wood = 0x795548
      const seat = 0xa1887f
      // seat
      box(seat, 0.85, 0.12, 0.85, 0, 0.5, 0)
      // backrest
      box(wood, 0.85, 0.7, 0.12, 0, 0.9, -0.37)
      // four legs
      const leg = 0.1
      const o = 0.36
      box(wood, leg, 0.5, leg, -o, 0.25, -o)
      box(wood, leg, 0.5, leg,  o, 0.25, -o)
      box(wood, leg, 0.5, leg, -o, 0.25,  o)
      box(wood, leg, 0.5, leg,  o, 0.25,  o)
      break
    }
    case TOILET: {
      const white = 0xf5f5f5
      const lid = 0xe0e0e0
      // bowl / base
      box(white, 0.7, 0.5, 0.8, 0, 0.25, 0)
      // seat rim
      box(lid, 0.72, 0.1, 0.82, 0, 0.55, 0)
      // tank (against back)
      box(white, 0.6, 0.5, 0.25, 0, 0.75, -0.35)
      break
    }
    case SINK: {
      const basin = 0xefebe9
      const rim = 0xbdbdbd
      // pedestal
      box(basin, 0.3, 0.6, 0.3, 0, 0.3, 0)
      // basin bowl
      box(basin, 0.8, 0.2, 0.6, 0, 0.7, 0)
      // rim / counter
      box(rim, 0.85, 0.06, 0.65, 0, 0.83, 0)
      // faucet
      const steel = 0x9aa0a6
      box(steel, 0.05, 0.2, 0.05, 0, 0.96, -0.22)
      box(steel, 0.18, 0.05, 0.05, 0.05, 1.06, -0.22)
      break
    }
  }

  // Slight subtle orientation for variety
  return group
}

export function isFurniture(blockId) {
  return blockId === TABLE || blockId === CHAIR || blockId === TOILET || blockId === SINK
}
