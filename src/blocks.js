// Block and item registry for Arhaancraft

// Block IDs
export const AIR = 0
export const GRASS = 1
export const DIRT = 2
export const STONE = 3
export const SAND = 4
export const WOOD = 5
export const LEAVES = 6
export const WATER = 7
export const TABLE = 8
export const CHAIR = 9
export const TOILET = 10
export const SINK = 11
export const GLASS = 12
export const PLANKS = 13
export const COBBLESTONE = 14
export const BRICK = 15
export const BEDROCK = 16

// Each block: name, whether it's solid, whether it can be walked through
// For furniture blocks we render custom geometry.
export const BLOCKS = {
  [AIR]:       { id: AIR,       name: 'Air',        solid: false, transparent: true,  color: '#000000' },
  [GRASS]:     { id: GRASS,     name: 'Grass',      solid: true,  transparent: false, color: '#7cb342', topColor: '#7cb342', sideColor: '#8d6e63', bottomColor: '#8d6e63' },
  [DIRT]:      { id: DIRT,      name: 'Dirt',       solid: true,  transparent: false, color: '#8d6e63' },
  [STONE]:     { id: STONE,     name: 'Stone',      solid: true,  transparent: false, color: '#9e9e9e' },
  [SAND]:      { id: SAND,      name: 'Sand',       solid: true,  transparent: false, color: '#e0c068' },
  [WOOD]:      { id: WOOD,      name: 'Wood',       solid: true,  transparent: false, color: '#6d4c41' },
  [LEAVES]:    { id: LEAVES,    name: 'Leaves',     solid: true,  transparent: true,  color: '#4caf50' },
  [WATER]:     { id: WATER,     name: 'Water',      solid: false, transparent: true,  color: '#3f7fbf' },
  [TABLE]:     { id: TABLE,     name: 'Table',      solid: true,  transparent: false, color: '#a1887f', furniture: 'table' },
  [CHAIR]:     { id: CHAIR,     name: 'Chair',      solid: false, transparent: false, color: '#795548', furniture: 'chair' },
  [TOILET]:    { id: TOILET,    name: 'Toilet',     solid: true,  transparent: false, color: '#eceff1', furniture: 'toilet' },
  [SINK]:      { id: SINK,      name: 'Sink',       solid: true,  transparent: false, color: '#bdbdbd', furniture: 'sink' },
  [GLASS]:     { id: GLASS,     name: 'Glass',      solid: true,  transparent: true,  color: '#b3e5fc' },
  [PLANKS]:    { id: PLANKS,    name: 'Planks',     solid: true,  transparent: false, color: '#bcaaa4' },
  [COBBLESTONE]:{ id: COBBLESTONE, name: 'Cobblestone', solid: true, transparent: false, color: '#757575' },
  [BRICK]:     { id: BRICK,     name: 'Brick',      solid: true,  transparent: false, color: '#b71c1c' },
  [BEDROCK]:   { id: BEDROCK,   name: 'Bedrock',    solid: true,  transparent: false, color: '#424242' },
}

// Which blocks are placeable / obtainable as items
export const PLACEABLE = [
  GRASS, DIRT, STONE, SAND, WOOD, LEAVES, GLASS, PLANKS, COBBLESTONE, BRICK,
  TABLE, CHAIR, TOILET, SINK,
]

// Textures are generated per-block-face in texture.js.
// Each item in the hotbar shows an icon; furniture uses emoji icons for clarity.
export const ITEM_ICONS = {
  [GRASS]: 'grass',
  [DIRT]: 'dirt',
  [STONE]: 'stone',
  [SAND]: 'sand',
  [WOOD]: 'wood',
  [LEAVES]: 'leaves',
  [GLASS]: 'glass',
  [PLANKS]: 'planks',
  [COBBLESTONE]: 'cobble',
  [BRICK]: 'brick',
  [TABLE]: '🪑',   // table icon
  [CHAIR]: '🪑',   // chair icon
  [TOILET]: '🚽',
  [SINK]: '🚰',
}

// Display name for HUD / labels
export function blockName(id) {
  const b = BLOCKS[id]
  return b ? b.name : 'Air'
}
