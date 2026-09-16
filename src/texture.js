// Procedural pixel-art texture generation for Arhaancraft.
// Each block face is 16x16 pixels, stored in a texture atlas.
// We generate at runtime on a canvas so the game works fully offline.

import { BLOCKS, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, GLASS, WATER,
         PLANKS, COBBLESTONE, BRICK, BEDROCK, TABLE, CHAIR, TOILET, SINK } from './blocks.js'

const TILE = 16 // pixels per block face
const ATLAS_COLS = 8
const ATLAS_ROWS = 8

// A simple deterministic PRNG for stable noise
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Build an offscreen canvas with the atlas
export function buildAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = TILE * ATLAS_COLS
  canvas.height = TILE * ATLAS_ROWS
  const ctx = canvas.getContext('2d')

  // Assign each block a slot in the atlas
  const slots = {}
  let next = 0
  function assign(blockId, key) {
    if (slots[blockId] && slots[blockId][key] !== undefined) return slots[blockId][key]
    const idx = next++
    const x = (idx % ATLAS_COLS) * TILE
    const y = Math.floor(idx / ATLAS_COLS) * TILE
    return { x, y, u0: x / canvas.width, v0: y / canvas.height, u1: (x + TILE) / canvas.width, v1: (y + TILE) / canvas.height }
  }

  function drawNoise(blockId, base, variance, seed, key) {
    const slot = assign(blockId, key)
    const rng = mulberry32(seed)
    for (let px = 0; px < TILE; px++) {
      for (let py = 0; py < TILE; py++) {
        const n = (rng() - 0.5) * variance
        const c = shade(base, n)
        ctx.fillStyle = c
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    return slot
  }

  function drawGrass() {
    const top = drawNoise(GRASS, '#7cb342', 40, 1, 'top')
    const side = (() => {
      const slot = assign(GRASS, 'side')
      const rng = mulberry32(7)
      // dirt base
      for (let px = 0; px < TILE; px++) {
        for (let py = 0; py < TILE; py++) {
          const n = (rng() - 0.5) * 30
          ctx.fillStyle = shade('#8d6e63', n)
          ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
        }
      }
      // grass strip on top rows
      const grassRng = mulberry32(11)
      for (let px = 0; px < TILE; px++) {
        const depth = 3 + Math.floor(grassRng() * 3)
        for (let py = 0; py < depth && py < TILE; py++) {
          const n = (grassRng() - 0.5) * 40
          ctx.fillStyle = shade('#7cb342', n)
          ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
        }
      }
      return slot
    })()
    const bottom = drawNoise(GRASS, '#8d6e63', 30, 3, 'bottom')
    return { top, bottom, side }
  }

  // Simple solid textures
  const simple = [
    [DIRT, '#8d6e63', 35, 5],
    [STONE, '#9e9e9e', 30, 13],
    [SAND, '#e0c068', 30, 17],
    [WOOD, '#6d4c41', 25, 19],
    [LEAVES, '#4caf50', 45, 23],
    [GLASS, '#b3e5fc', 15, 29],
    [PLANKS, '#bcaaa4', 25, 31],
    [COBBLESTONE, '#757575', 45, 37],
    [BRICK, '#b71c1c', 30, 41],
    [BEDROCK, '#424242', 35, 43],
    [TABLE, '#a1887f', 20, 47],
    [CHAIR, '#795548', 20, 53],
    [TOILET, '#eceff1', 12, 59],
    [SINK, '#bdbdbd', 18, 61],
  ]
  simple.forEach(([id, color, var_, seed]) => {
    const s = drawNoise(id, color, var_, seed, 'all')
    slots[id] = { top: s, bottom: s, side: s }
  })

  // Water (semi-transparent, smooth)
  {
    const slot = assign(WATER, 'all')
    for (let px = 0; px < TILE; px++) {
      for (let py = 0; py < TILE; py++) {
        ctx.fillStyle = 'rgba(63,127,191,0.7)'
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    slots[WATER] = { top: slot, bottom: slot, side: slot }
  }

  // Grass gets per-face
  const grassFaces = drawGrass()
  slots[GRASS] = grassFaces

  return { canvas, slots }
}

// shade a hex color by a delta
function shade(hex, delta) {
  const c = parseInt(hex.slice(1), 16)
  let r = (c >> 16) & 0xff
  let g = (c >> 8) & 0xff
  let b = c & 0xff
  r = Math.max(0, Math.min(255, r + delta))
  g = Math.max(0, Math.min(255, g + delta))
  b = Math.max(0, Math.min(255, b + delta))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}
