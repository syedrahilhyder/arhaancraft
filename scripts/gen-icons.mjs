// Pure-JS PNG icon generator for Arhaancraft PWA icons.
// Renders a Minecraft-style grass block, writes icon-192.png and icon-512.png.
// Uses zlib (Node built-in) to produce valid PNGs; no external deps.

import zlib from 'node:zlib'
import fs from 'node:fs'

// --- Minimal PNG encoder ---
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))])
}

// --- Render a grass block icon ---
// Build a 16x16 pixel art grass block and scale up with nearest neighbour.
const TILE = 16
function makePixels(size) {
  // draw 16x16 grass block
  const cells = []
  const grass = [124, 179, 66]
  const grassDark = [85, 130, 40]
  const dirt = [141, 110, 99]
  const dirtDark = [110, 82, 72]
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c
      if (y < 4) c = grass
      else if (y < 6) c = grassDark
      else c = dirt
      // add some variation
      const h = (x * 7 + y * 13) % 11
      if (c === dirt && h === 0) c = dirtDark
      if (c === grass && h === 1) c = grassDark
      cells.push(c)
    }
  }
  // scale up
  const out = Buffer.alloc(size * size * 4)
  const scale = size / TILE
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / scale)
      const cy = Math.floor(y / scale)
      const c = cells[cy * TILE + cx]
      const o = (y * size + x) * 4
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255
    }
  }
  return out
}

for (const size of [192, 512]) {
  const rgba = makePixels(size)
  const png = encodePNG(size, size, rgba)
  fs.writeFileSync(`public/icon-${size}.png`, png)
  console.log(`wrote icon-${size}.png`)
}
