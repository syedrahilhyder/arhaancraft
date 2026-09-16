// World data model: a simple dynamic voxel world with chunk subdivision.
// Stores block ids in Uint8Arrays and provides coordinate helpers.

import { AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, WATER, BEDROCK,
         PLANKS, COBBLESTONE, BRICK, GLASS, TABLE, CHAIR, TOILET, SINK,
         STRAWBERRY } from './blocks.js'

export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 64
export const SEA_LEVEL = 20

// A chunk stores blocks indexed as x + z*16 + y*16*16
export class Chunk {
  constructor(cx, cz) {
    this.cx = cx
    this.cz = cz
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
  }
  getIndex(x, y, z) {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
  }
  get(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return AIR
    return this.blocks[this.getIndex(x, y, z)]
  }
  set(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) return
    this.blocks[this.getIndex(x, y, z)] = id
  }
}

export class World {
  constructor(seed) {
    this.chunks = new Map()
    this.seed = seed !== undefined ? seed : Math.floor(Math.random() * 1e9)
  }

  key(cx, cz) { return cx + ',' + cz }

  getChunk(cx, cz) {
    const k = this.key(cx, cz)
    return this.chunks.get(k)
  }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz)
    let c = this.chunks.get(k)
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c) }
    return c
  }

  // world coords -> block
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return AIR
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cz = Math.floor(wz / CHUNK_SIZE)
    const c = this.getChunk(cx, cz)
    if (!c) return AIR
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    return c.get(lx, wy, lz)
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cz = Math.floor(wz / CHUNK_SIZE)
    const c = this.ensureChunk(cx, cz)
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    c.set(lx, wy, lz, id)
  }

  // Deterministic height noise (2D value noise)
  heightAt(wx, wz) {
    const n = this.noise2((wx + this.seed) * 0.06, wz * 0.06)
    const n2 = this.noise2((wx + this.seed) * 0.02 + 100, wz * 0.02 + 100)
    const base = 24
    return Math.floor(base + n * 10 + n2 * 6)
  }

  // Simple smooth value noise
  noise2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z)
    const xf = x - xi, zf = z - zi
    const u = xf * xf * (3 - 2 * xf)
    const v = zf * zf * (3 - 2 * zf)
    const a = this.hash(xi, zi)
    const b = this.hash(xi + 1, zi)
    const c = this.hash(xi, zi + 1)
    const d = this.hash(xi + 1, zi + 1)
    const ab = a + (b - a) * u
    const cd = c + (d - c) * u
    return (ab + (cd - ab) * v) - 0.5
  }

  hash(x, z) {
    let h = x * 374761393 + z * 668265263 + this.seed * 1274126177
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) >>> 0) / 4294967296
  }

  // Generate the terrain for a chunk (synchronous, fast enough for 16x16)
  generateChunk(cx, cz) {
    const c = this.ensureChunk(cx, cz)
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE
    const trees = [] // for later

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx, wz = z0 + lz
        const h = this.heightAt(wx, wz)
        // bedrock bottom
        for (let y = 0; y <= h; y++) {
          let id = STONE
          if (y === 0) id = BEDROCK
          else if (y === h) id = GRASS
          else if (y > h - 3) id = DIRT
          c.set(lx, y, lz, id)
        }
        // water fills up to a fixed sea level
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) c.set(lx, y, lz, WATER)
        }
      }
    }

    // Simple trees (deterministic placement)
    this.placeTrees(c, cx, cz)

    return c
  }

  placeTrees(c, cx, cz) {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE
    for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
      for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
        const wx = x0 + lx, wz = z0 + lz
        const r = this.hash(wx * 7, wz * 13)
        if (r < 0.03) {
          const h = this.heightAt(wx, wz)
          if (c.get(lx, h, lz) === GRASS) {
            const treeH = 4 + Math.floor(r * 100) % 2
            // trunk
            for (let y = 1; y <= treeH; y++) c.set(lx, h + y, lz, WOOD)
            // leaves
            for (let dy = treeH - 1; dy <= treeH + 1; dy++) {
              const rad = dy < treeH ? 1 : 0
              for (let dx = -rad; dx <= rad; dx++) {
                for (let dz = -rad; dz <= rad; dz++) {
                  if (dx === 0 && dz === 0 && dy <= treeH) continue
                  if (c.get(lx + dx, h + dy, lz + dz) === AIR) c.set(lx + dx, h + dy, lz + dz, LEAVES)
                }
              }
            }
            // Hang a few strawberries from the leaves.
            for (let dy = treeH - 1; dy <= treeH; dy++) {
              const rad = dy < treeH ? 1 : 0
              for (let dx = -rad; dx <= rad; dx++) {
                for (let dz = -rad; dz <= rad; dz++) {
                  if (dx === 0 && dz === 0 && dy <= treeH) continue
                  const sx = lx + dx, sy = h + dy, sz = lz + dz
                  if (c.get(sx, sy, sz) === LEAVES && this.hash(sx * 31, sz * 17 + sy) < 0.15) {
                    c.set(sx, sy, sz, STRAWBERRY)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
