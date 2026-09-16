// Builds Three.js mesh geometry from chunk voxel data.
// Only exposed faces are generated, using the shared atlas texture.

import * as THREE from 'three'
import { CHUNK_SIZE, WORLD_HEIGHT } from './world.js'
import { BLOCKS, AIR, WATER, LEAVES, GLASS, isMechanical } from './blocks.js'
import { isFurniture } from './furniture.js'
import { isBerry } from './berry.js'

class EarthMat {
  constructor(map) {
    // Use a single material; per-face UVs distinguish block types
    this.map = map
  }
}

// Build a merged BufferGeometry for a chunk.
// For each solid/visible block, emit only faces adjacent to air/transparent blocks.
export function buildChunkGeometry(chunk, world, atlasSlots) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  let v = 0

  const NEIGHBORS = [
    // face, dir, corner offsets
    { dir: [1, 0, 0], face: 'side', corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { dir: [-1, 0, 0], face: 'side', corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
    { dir: [0, 1, 0], face: 'top', corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { dir: [0, -1, 0], face: 'bottom', corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { dir: [0, 0, 1], face: 'side', corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { dir: [0, 0, -1], face: 'side', corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
  ]

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const id = chunk.get(x, y, z)
        if (id === AIR) continue
        // Furniture and mechanical blocks are rendered with custom geometry,
        // not the merged chunk mesh.
        if (isFurniture(id)) continue
        if (isMechanical(id)) continue
        if (isBerry(id)) continue
        const block = BLOCKS[id]
        if (!block) continue

        for (const n of NEIGHBORS) {
          const nx = x + n.dir[0], ny = y + n.dir[1], nz = z + n.dir[2]
          const neighborId = neighborAt(world, chunk, nx, ny, nz)
          const nBlock = BLOCKS[neighborId]
          // Only draw face if neighbor is air, or is a transparent block (water/glass/leaves)
          const neighborTransparent = !nBlock || !nBlock.solid || nBlock.transparent
          if (!neighborTransparent) continue

          // Don't draw water faces between water
          if (id === WATER && neighborId === WATER) continue
          // Draw water only on top-ish surfaces for simplicity
          if (id === WATER && n.dir[0] === 0 && n.dir[1] === 0 && n.dir[2] === 0) continue

          const slot = atlasSlots[id] ? (atlasSlots[id][n.face] || atlasSlots[id].all || atlasSlots[id].top) : null
          if (!slot) continue

          const base = v
          for (const c of n.corners) {
            positions.push(x + c[0], y + c[1], z + c[2])
            normals.push(n.dir[0], n.dir[1], n.dir[2])
          }
          // UV for the 4 corners (two triangles)
          // Order: 0,1,2,3  ->  tris (0,1,2)(0,2,3)
          const uvsQuad = [
            [slot.u0, slot.v0],
            [slot.u0, slot.v1],
            [slot.u1, slot.v1],
            [slot.u1, slot.v0],
          ]
          for (const uv of uvsQuad) uvs.push(uv[0], uv[1])
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
          v += 4
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

function neighborAt(world, chunk, x, y, z) {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
    const wx = chunk.cx * CHUNK_SIZE + x
    const wz = chunk.cz * CHUNK_SIZE + z
    return world.getBlock(wx, y, wz)
  }
  return chunk.get(x, y, z)
}
