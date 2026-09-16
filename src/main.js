// Arhaancraft main game: wiring together world, meshes, player, input, and UI.

import * as THREE from 'three'
import './style.css'
import { World, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './world.js'
import { buildAtlas } from './texture.js'
import { buildChunkGeometry } from './mesher.js'
import { buildFurnitureGroup, isFurniture } from './furniture.js'
import { Player } from './player.js'
import { Sheep } from './sheep.js'
import { InputController } from './input.js'
import { BLOCKS, PLACEABLE, AIR, WATER, GRASS, DIRT, STONE, SAND, WOOD, LEAVES,
         GLASS, PLANKS, COBBLESTONE, BRICK, TABLE, CHAIR, TOILET, SINK, ITEM_ICONS, blockName } from './blocks.js'

const RENDER_DISTANCE = 3 // chunks in each direction
const VIEW_RANGE = RENDER_DISTANCE * CHUNK_SIZE

export class Game {
  constructor() {
    this.setupScene()
    this.world = new World()
    this.atlas = buildAtlas()

    // Pre-build a texture from the atlas canvas for the merged mesh
    this.atlasTexture = new THREE.CanvasTexture(this.atlas.canvas)
    this.atlasTexture.magFilter = THREE.NearestFilter
    this.atlasTexture.minFilter = THREE.NearestFilter
    this.atlasTexture.generateMipmaps = false
    // The mesh UVs are computed in canvas space (v=0 at the top), so disable
    // three.js's default vertical flip; otherwise faces sample undrawn (black) atlas rows.
    this.atlasTexture.flipY = false
    // The atlas canvas is sRGB; mark it so the renderer decodes block colours correctly.
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace

    this.material = new THREE.MeshLambertMaterial({ map: this.atlasTexture, vertexColors: false })

    // Player spawn
    this.player = new Player(this.world, this.camera)

    this.input = new InputController()

    this.chunkMeshes = new Map() // key -> mesh
    this.furnitureMeshes = new Map() // key -> group
    this.dirtyChunks = new Set()

    // Inventory
    this.hotbar = []
    this.selectedSlot = 0
    this.initInventory()

    this.setupUI()
    this.setupInteraction()

    // Generate initial world around player
    this.generateAroundPlayer()

    // Wanderers
    this.sheep = []
    this.spawnSheep()

    this.clock = new THREE.Clock()
    this.bindEvents()
    this.animate()

    this.showHint('Move with the joystick, drag to look, tap to place/break blocks!')
  }

  setupScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, VIEW_RANGE, VIEW_RANGE * 2)

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300)
    this.camera.rotation.order = 'YXZ'

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    document.getElementById('app').appendChild(this.renderer.domElement)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(50, 100, 30)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xffffff, 0.3)
    fill.position.set(-30, 50, -40)
    this.scene.add(fill)

    // Raycaster for block targeting
    this.raycaster = new THREE.Raycaster()
  }

  initInventory() {
    // Quick-access bar, plus a full per-block inventory.
    this.hotbar = [
      GRASS, DIRT, STONE, WOOD, PLANKS, GLASS, TABLE, CHAIR, TOILET, SINK,
    ]
    // Per-block counts for every placeable block (what you collect and spend).
    this.blockCounts = {}
    for (const id of PLACEABLE) this.blockCounts[id] = 64
    // Currently selected block to build with.
    this.activeBlock = this.hotbar[0]
    this.selectedSlot = 0
  }

  setupUI() {
    const hotbar = document.getElementById('hotbar')
    hotbar.innerHTML = ''
    this.hotbar.forEach((id, idx) => {
      const slot = document.createElement('div')
      slot.className = 'slot'
      slot.dataset.index = idx
      // icon
      const icon = document.createElement('div')
      icon.className = 'icon'
      this.applyIcon(icon, id)
      slot.appendChild(icon)
      // count
      const count = document.createElement('div')
      count.className = 'count'
      count.textContent = this.blockCounts[id]
      slot.appendChild(count)
      // Tap/click selects this block as the active one.
      slot.addEventListener('click', () => this.selectSlot(idx))
      slot.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectSlot(idx) }, { passive: false })
      hotbar.appendChild(slot)
    })
    this.hotbarEl = hotbar

    this.buildInventoryPanel()

    // Jump button
    const jumpBtn = document.getElementById('btn-jump')
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.setJump(true) }, { passive: false })
    jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.input.setJump(false) }, { passive: false })
    // Also allow mouse
    jumpBtn.addEventListener('mousedown', () => this.input.setJump(true))
    jumpBtn.addEventListener('mouseup', () => this.input.setJump(false))

    // Break / place buttons
    const breakBtn = document.getElementById('btn-break')
    const placeBtn = document.getElementById('btn-place')
    breakBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.doBreak() }, { passive: false })
    placeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.doPlace() }, { passive: false })
    breakBtn.addEventListener('mousedown', () => this.doBreak())
    placeBtn.addEventListener('mousedown', () => this.doPlace())
    this.breakBtn = breakBtn
    this.placeBtn = placeBtn

    // Inventory toggle button
    const invBtn = document.getElementById('btn-inventory')
    invBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleInventory() }, { passive: false })
    invBtn.addEventListener('click', () => this.toggleInventory())
    this.invBtn = invBtn
  }

  buildInventoryPanel() {
    const panel = document.getElementById('inventory')
    panel.innerHTML = ''
    const title = document.createElement('div')
    title.id = 'inventory-title'
    title.textContent = 'Inventory'
    panel.appendChild(title)
    const close = document.createElement('div')
    close.id = 'inventory-close'
    close.textContent = '×'
    close.addEventListener('click', () => this.toggleInventory(false))
    close.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleInventory(false) }, { passive: false })
    panel.appendChild(close)
    this.invItemEls = []
    for (const id of PLACEABLE) {
      const item = document.createElement('div')
      item.className = 'inv-item'
      const icon = document.createElement('div')
      icon.className = 'icon'
      this.applyIcon(icon, id)
      item.appendChild(icon)
      const count = document.createElement('div')
      count.className = 'count'
      item.appendChild(count)
      item.addEventListener('click', () => this.selectBlock(id))
      item.addEventListener('touchstart', (e) => { e.preventDefault(); this.selectBlock(id) }, { passive: false })
      panel.appendChild(item)
      this.invItemEls.push({ id, el: item, count })
    }
    this.inventoryEl = panel
    this.refreshInventory()
  }

  toggleInventory(force) {
    const open = force !== undefined ? force : !this.inventoryEl.classList.contains('open')
    this.inventoryEl.classList.toggle('open', open)
  }

  selectBlock(id) {
    this.activeBlock = id
    this.refreshInventory()
  }

  refreshInventory() {
    for (const { id, el, count } of this.invItemEls) {
      count.textContent = this.blockCounts[id]
      el.classList.toggle('selected', id === this.activeBlock)
    }
    const slots = this.hotbarEl.querySelectorAll('.slot')
    slots.forEach((s, i) => {
      s.classList.toggle('selected', this.hotbar[i] === this.activeBlock)
      const c = s.querySelector('.count')
      if (c) c.textContent = this.blockCounts[this.hotbar[i]]
    })
  }

  applyIcon(el, id) {
    const icon = ITEM_ICONS[id]
    if (typeof icon === 'string' && icon.length > 1 && icon.charCodeAt(0) > 0x2000) {
      // emoji
      el.textContent = icon
      el.style.fontSize = '34px'
      el.style.display = 'flex'
      el.style.alignItems = 'center'
      el.style.justifyContent = 'center'
    } else {
      // block texture icon
      const slot = this.atlas.slots[id]
      if (slot) {
        const c = document.createElement('canvas')
        c.width = 16 * 3
        c.height = 16 * 3
        const ctx = c.getContext('2d')
        const src = this.atlas.canvas
        // draw top face enlarged
        const face = slot.top || slot.all || slot.side
        const size = src.width
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(src, face.u0 * size, face.v0 * size, 16, 16, 0, 0, c.width, c.height)
        el.appendChild(c)
      } else {
        el.textContent = blockName(id)
      }
    }
  }

  selectSlot(idx) {
    this.selectedSlot = idx
    this.activeBlock = this.hotbar[idx]
    this.refreshInventory()
  }

  // --- Chunk management ---
  generateAroundPlayer() {
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE)
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE)
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx, cz = pcz + dz
        const key = this.world.key(cx, cz)
        if (!this.chunkMeshes.has(key) && !this.world.getChunk(cx, cz)) {
          this.world.generateChunk(cx, cz)
          this.rebuildChunk(cx, cz)
        }
      }
    }
  }

  spawnSheep() {
    // Place a handful of sheep on dry land near the player's spawn.
    const spawnX = this.player.position.x
    const spawnZ = this.player.position.z
    const count = 6
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < 200) {
      attempts++
      const angle = Math.random() * Math.PI * 2
      const r = 6 + Math.random() * 14
      const x = Math.floor(spawnX + Math.cos(angle) * r)
      const z = Math.floor(spawnZ + Math.sin(angle) * r)
      if (this.world.heightAt(x, z) < SEA_LEVEL) continue // skip water
      const sheep = new Sheep(this.world, x, z, placed)
      this.sheep.push(sheep)
      this.scene.add(sheep.group)
      placed++
    }
  }

  rebuildChunk(cx, cz) {
    const key = this.world.key(cx, cz)
    const chunk = this.world.getChunk(cx, cz)
    if (!chunk) return

    // Remove old
    if (this.chunkMeshes.has(key)) {
      this.scene.remove(this.chunkMeshes.get(key))
      this.chunkMeshes.get(key).geometry.dispose()
      this.chunkMeshes.delete(key)
    }
    if (this.furnitureMeshes.has(key)) {
      this.disposeFurniture(this.furnitureMeshes.get(key))
      this.scene.remove(this.furnitureMeshes.get(key))
      this.furnitureMeshes.delete(key)
    }

    // Build merged block mesh
    let hasBlocks = false
    const geo = buildChunkGeometry(chunk, this.world, this.atlas.slots)
    if (geo.attributes.position.count > 0) {
      const mesh = new THREE.Mesh(geo, this.material)
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)
      this.scene.add(mesh)
      this.chunkMeshes.set(key, mesh)
      hasBlocks = true
    } else {
      geo.dispose()
    }

    // Build furniture group(s) for this chunk
    const fGroup = this.buildFurnitureForChunk(chunk, cx, cz)
    if (fGroup.children.length > 0) {
      this.scene.add(fGroup)
      this.furnitureMeshes.set(key, fGroup)
    }
  }

  buildFurnitureForChunk(chunk, cx, cz) {
    const group = new THREE.Group()
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const id = chunk.get(x, y, z)
          if (isFurniture(id)) {
            const f = buildFurnitureGroup(id)
            f.position.set(x, y, z)
            group.add(f)
          }
        }
      }
    }
    return group
  }

  disposeFurniture(group) {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose()
      }
    })
  }

  // Mark a chunk dirty and rebuild (and neighbors if on border)
  markDirty(wx, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cz = Math.floor(wz / CHUNK_SIZE)
    this.rebuildChunk(cx, cz)
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    if (lx === 0) this.rebuildChunk(cx - 1, cz)
    if (lx === CHUNK_SIZE - 1) this.rebuildChunk(cx + 1, cz)
    if (lz === 0) this.rebuildChunk(cx, cz - 1)
    if (lz === CHUNK_SIZE - 1) this.rebuildChunk(cx, cz + 1)
  }

  // --- Interaction: raycast to find targeted block ---
  getTargetBlock() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
    // We raycast manually against world voxels for accuracy.
    const origin = this.camera.position.clone()
    const dir = this.raycaster.ray.direction.clone()
    let t = 0
    const maxDist = 6
    const step = 0.05
    let prev = null
    for (t = 0; t < maxDist; t += step) {
      const pos = origin.clone().addScaledVector(dir, t)
      const bx = Math.floor(pos.x)
      const by = Math.floor(pos.y)
      const bz = Math.floor(pos.z)
      const key = bx + ',' + by + ',' + bz
      if (key !== prev) {
        prev = key
        const id = this.world.getBlock(bx, by, bz)
        if (id !== AIR && id !== WATER) {
          return { x: bx, y: by, z: bz, id, face: this.getFaceNormal(origin, pos, bx, by, bz) }
        }
      }
    }
    return null
  }

  getFaceNormal(origin, hit, bx, by, bz) {
    // Determine which face was hit by comparing hit point to block center
    const cx = bx + 0.5, cy = by + 0.5, cz = bz + 0.5
    const dx = hit.x - cx, dy = hit.y - cy, dz = hit.z - cz
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) return [dx > 0 ? 1 : -1, 0, 0]
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz)) return [0, dy > 0 ? 1 : -1, 0]
    return [0, 0, dz > 0 ? 1 : -1]
  }

  doBreak() {
    const target = this.getTargetBlock()
    if (!target) return
    this.world.setBlock(target.x, target.y, target.z, AIR)
    // Collect the broken block into the inventory.
    if (this.blockCounts[target.id] !== undefined) {
      this.blockCounts[target.id]++
      this.refreshInventory()
    }
    this.markDirty(target.x, target.z)
    this.breakBtn.classList.add('active')
    setTimeout(() => this.breakBtn.classList.remove('active'), 120)
  }

  doPlace() {
    const target = this.getTargetBlock()
    if (!target) return
    const id = this.activeBlock
    if (!id) return
    // Don't place if out of the block item.
    if (this.blockCounts[id] <= 0) return
    // place adjacent to face
    const n = target.face
    const px = target.x + n[0]
    const py = target.y + n[1]
    const pz = target.z + n[2]
    // don't place inside the player
    if (this.isPlayerOverlap(px, py, pz)) return
    if (this.world.getBlock(px, py, pz) !== AIR && this.world.getBlock(px, py, pz) !== WATER) return
    // water gets replaced
    this.world.setBlock(px, py, pz, id)
    this.markDirty(px, pz)
    // spend one from the inventory
    this.blockCounts[id]--
    this.refreshInventory()
    this.placeBtn.classList.add('active')
    setTimeout(() => this.placeBtn.classList.remove('active'), 120)
  }

  isPlayerOverlap(bx, by, bz) {
    const p = this.player.position
    const hw = 0.3
    const minX = bx, maxX = bx + 1
    const minY = by, maxY = by + 1
    const minZ = bz, maxZ = bz + 1
    return (p.x + hw > minX && p.x - hw < maxX &&
            p.y + 1.8 > minY && p.y < maxY &&
            p.z + hw > minZ && p.z - hw < maxZ)
  }

  setupInteraction() {
    // Tap-and-hold on the world (not UI) to break; single tap to place?
    // We keep explicit buttons for clarity on iPad. Optionally allow tapping world to break.
    const canvas = this.renderer.domElement
    canvas.addEventListener('click', (e) => {
      // Only when not dragging look? Keep simple: ignore
    })
  }

  showHint(msg) {
    const el = document.getElementById('hint')
    el.textContent = msg
    el.classList.add('show')
    clearTimeout(this._hintTimer)
    this._hintTimer = setTimeout(() => el.classList.remove('show'), 4000)
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
  }

  animate() {
    requestAnimationFrame(() => this.animate())
    const dt = Math.min(this.clock.getDelta(), 0.05)

    // Feed look deltas
    const look = this.input.consumeLook()
    const lookScale = 0.0025
    this.input.input.lookX = look.lx * lookScale
    this.input.input.lookY = look.ly * lookScale

    // Update player
    this.player.update(dt, this.input.input)

    // Regenerate chunks as player moves
    this.generateAroundPlayer()

    // Animate wandering sheep
    for (const sheep of this.sheep) sheep.update(dt)

    this.renderer.render(this.scene, this.camera)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game()
})
