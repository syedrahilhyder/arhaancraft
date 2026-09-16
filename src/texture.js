// Procedural pixel-art texture generation for Arhaancraft.
// Each block face is 16x16 pixels, stored in a texture atlas.
// We generate at runtime on a canvas so the game works fully offline.

import { BLOCKS, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, GLASS, WATER,
         PLANKS, COBBLESTONE, BRICK, BEDROCK, TABLE, CHAIR, TOILET, SINK,
         WIRE, MOTOR, PISTON } from './blocks.js'

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

  // Wire: dark base with a red conducting band and edge nodes.
  {
    const slot = assign(WIRE, 'all')
    const rng = mulberry32(63)
    for (let px = 0; px < TILE; px++) {
      for (let py = 0; py < TILE; py++) {
        ctx.fillStyle = shade('#333', (rng() - 0.5) * 24)
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    ctx.fillStyle = '#c62828'
    ctx.fillRect(slot.x, slot.y + 6, TILE, 3)
    ctx.fillStyle = '#e53935'
    ctx.fillRect(slot.x, slot.y + 6, TILE, 1)
    ctx.fillStyle = '#c62828'
    ctx.fillRect(slot.x + 2, slot.y, 2, TILE)
    ctx.fillRect(slot.x + TILE - 4, slot.y, 2, TILE)
    slots[WIRE] = { top: slot, bottom: slot, side: slot }
  }

  // Motor: steel body with an orange rotor and a dark axle cross.
  {
    const slot = assign(MOTOR, 'all')
    const rng = mulberry32(77)
    for (let px = 0; px < TILE; px++) {
      for (let py = 0; py < TILE; py++) {
        ctx.fillStyle = shade('#8a8f94', (rng() - 0.5) * 22)
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    ctx.fillStyle = '#ef6c00'
    for (let px = 3; px < TILE - 3; px++) {
      for (let py = 3; py < TILE - 3; py++) {
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    ctx.fillStyle = '#424242'
    ctx.fillRect(slot.x + 7, slot.y + 3, 2, TILE - 6)
    ctx.fillRect(slot.x + 3, slot.y + 7, TILE - 6, 2)
    slots[MOTOR] = { top: slot, bottom: slot, side: slot }
  }

  // Piston: light steel with a piston face plate and a rim.
  {
    const slot = assign(PISTON, 'all')
    const rng = mulberry32(91)
    for (let px = 0; px < TILE; px++) {
      for (let py = 0; py < TILE; py++) {
        ctx.fillStyle = shade('#b0b7bd', (rng() - 0.5) * 20)
        ctx.fillRect(slot.x + px, slot.y + py, 1, 1)
      }
    }
    ctx.fillStyle = '#6d7278'
    for (let px = 2; px < TILE - 2; px++) {
      ctx.fillRect(slot.x + px, slot.y + 2, 1, 1)
      ctx.fillRect(slot.x + px, slot.y + TILE - 3, 1, 1)
    }
    for (let py = 2; py < TILE - 2; py++) {
      ctx.fillRect(slot.x + 2, slot.y + py, 1, 1)
      ctx.fillRect(slot.x + TILE - 3, slot.y + py, 1, 1)
    }
    ctx.fillStyle = '#e0e4e8'
    ctx.fillRect(slot.x + 5, slot.y + 5, TILE - 10, TILE - 10)
    slots[PISTON] = { top: slot, bottom: slot, side: slot }
  }

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
