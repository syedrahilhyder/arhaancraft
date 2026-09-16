// Arhaancraft main game: wiring together world, meshes, player, input, and UI.

import * as THREE from 'three'
import './style.css'
import { World, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from './world.js'
import { buildAtlas } from './texture.js'
import { buildChunkGeometry } from './mesher.js'
import { buildFurnitureGroup, isFurniture } from './furniture.js'
import { buildMechanicalBlock } from './mechanical.js'
import { buildBerry, isBerry } from './berry.js'
import { Player } from './player.js'
import { Sheep } from './sheep.js'
import { InputController } from './input.js'
import { SoundManager } from './sound.js'
import { BLOCKS, PLACEABLE, AIR, WATER, GRASS, DIRT, STONE, SAND, WOOD, LEAVES,
         GLASS, PLANKS, COBBLESTONE, BRICK, TABLE, CHAIR, TOILET, SINK,
         WIRE, MOTOR, PISTON, SWITCH, STRAWBERRY, isMechanical, ITEM_ICONS, blockName } from './blocks.js'

const RENDER_DISTANCE = 3 // chunks in each direction
const VIEW_RANGE = RENDER_DISTANCE * CHUNK_SIZE
const SAVE_KEY = 'arhaancraft-save-v1'

export class Game {
  constructor() {
    this.setupScene()
    // Restore saved progress before the world is generated so the seed, block
    // edits and player position are applied from the start.
    const save = this.loadGame()
    this.world = new World(save ? save.seed : undefined)
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

    // Sound effects (synthesised, no asset files needed).
    this.sound = new SoundManager()
    // The full-screen water tint shown when the player is submerged.
    this.waterOverlay = document.getElementById('water-overlay')
    // Browsers only allow audio after a user gesture, so prime the context on
    // the first touch/click anywhere on the screen.
    const primeAudio = () => this.sound.ensure()
    window.addEventListener('pointerdown', primeAudio, { once: true })
    window.addEventListener('touchstart', primeAudio, { once: true })

    // Player spawn
    this.player = new Player(this.world, this.camera, this.sound)
    if (save) {
      this.player.position.set(save.player.x, save.player.y, save.player.z)
      this.player.yaw = save.player.yaw
      this.player.pitch = save.player.pitch
    }

    this.input = new InputController()

    this.chunkMeshes = new Map() // key -> mesh
    this.furnitureMeshes = new Map() // key -> group
    this.dirtyChunks = new Set()
    this.chunkQueue = []            // chunks waiting to be generated, processed a few per frame
    this.chunkQueueSet = new Set()  // keys already queued, to avoid duplicates
    this.mechBlocks = new Map() // "x,y,z" -> { id, group, setPowered, update }
    this.switchOn = new Map()   // "x,y,z" -> bool (switch on/off state)
    this.berryMeshes = new Map() // "x,y,z" -> Group
    // Every cell the player has edited (placed/removed/picked), replayed on load.
    this.editedCells = new Set(save ? Object.keys(save.edits || {}) : [])
    // Gradual water flow: cells whose water still needs to spread, so water
    // advances visibly instead of instantly filling every gap.
    this.waterQueue = []
    // Saved block edits grouped per chunk, applied when each chunk is generated.
    this.editsByChunk = new Map()
    if (save) {
      for (const [key, id] of Object.entries(save.edits || {})) {
        const [x, y, z] = key.split(',').map(Number)
        const ck = this.world.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))
        if (!this.editsByChunk.has(ck)) this.editsByChunk.set(ck, [])
        this.editsByChunk.get(ck).push([x, y, z, id])
      }
    }

    // Inventory
    this.hotbar = []
    this.selectedSlot = 0
    this.initInventory()
    if (save) {
      this.blockCounts = { ...this.blockCounts, ...save.blockCounts }
      this.activeBlock = save.activeBlock
      this.selectedSlot = save.selectedSlot
    }

    this.setupUI()
    this.setupInteraction()

    // Generate initial world around player
    this.generateAroundPlayer()

    // Build the chunk under the player synchronously so collision data exists
    // before physics runs; otherwise the player falls into terrain that appears
    // a frame or two later and ends up embedded underground.
    this.ensurePlayerChunk()
    // If the restored position is inside a solid block, push the player up to
    // the first free space.
    this.ensureSafeSpawn()

    // Wanderers
    this.sheep = []
    this.spawnSheep()
    this.recomputePower()

    this.clock = new THREE.Clock()
    this.bindEvents()
    this.animate()

    this.showHint(save ? 'Progress loaded!' : 'Move with the joystick, drag to look, tap to place/break blocks!')
  }

  setupScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.Fog(0x87ceeb, VIEW_RANGE, VIEW_RANGE * 2)
    // Remember the above-water fog/background so we can restore them after the
    // player surfaces, then swap in a murky underwater look while submerged.
    this.skyColor = new THREE.Color(0x87ceeb)
    this.skyFogNear = VIEW_RANGE
    this.skyFogFar = VIEW_RANGE * 2
    this.underwaterColor = new THREE.Color(0x2d6faa)
    this.underwaterFogNear = 2
    this.underwaterFogFar = 30

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300)
    this.camera.rotation.order = 'YXZ'

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    document.getElementById('app').appendChild(this.renderer.domElement)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 0.8)
    sun.position.set(50, 100, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 5
    sun.shadow.camera.far = 200
    const s = 60
    sun.shadow.camera.left = -s
    sun.shadow.camera.right = s
    sun.shadow.camera.top = s
    sun.shadow.camera.bottom = -s
    this.scene.add(sun)
    this.sun = sun
    this.scene.add(sun.target)
    const fill = new THREE.DirectionalLight(0xffffff, 0.3)
    fill.position.set(-30, 50, -40)
    this.scene.add(fill)

    // Raycaster for block targeting
    this.raycaster = new THREE.Raycaster()
    // White outline showing the block currently aimed at.
    this.targetBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001)),
      new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false })
    )
    this.targetBox.visible = false
    this.scene.add(this.targetBox)
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

    // Descend button (used in fly mode to fly downward)
    const descendBtn = document.getElementById('btn-descend')
    descendBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.setDescend(true) }, { passive: false })
    descendBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.input.setDescend(false) }, { passive: false })
    descendBtn.addEventListener('mousedown', () => this.input.setDescend(true))
    descendBtn.addEventListener('mouseup', () => this.input.setDescend(false))

    // Fly mode toggle
    const flyBtn = document.getElementById('btn-fly')
    const toggleFly = () => this.toggleFly()
    flyBtn.addEventListener('touchstart', (e) => { e.preventDefault(); toggleFly() }, { passive: false })
    flyBtn.addEventListener('click', () => toggleFly())
    this.flyBtn = flyBtn

    // Break / place buttons
    const breakBtn = document.getElementById('btn-break')
    const placeBtn = document.getElementById('btn-place')
    breakBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.doBreak() }, { passive: false })
    placeBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.doPlace() }, { passive: false })
    breakBtn.addEventListener('mousedown', () => this.doBreak())
    placeBtn.addEventListener('mousedown', () => this.doPlace())
    this.breakBtn = breakBtn
    this.placeBtn = placeBtn

    // Use / activate button (toggles the aimed-at switch)
    const useBtn = document.getElementById('btn-use')
    useBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.activateTarget() }, { passive: false })
    useBtn.addEventListener('mousedown', () => this.activateTarget())

    // Inventory toggle button
    const invBtn = document.getElementById('btn-inventory')
    invBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.toggleInventory() }, { passive: false })
    invBtn.addEventListener('click', () => this.toggleInventory())
    this.invBtn = invBtn
  }

  // Toggle fly mode on/off and update the button's visual state.
  toggleFly() {
    const p = this.player
    p.flying = !p.flying
    this.flyBtn.classList.toggle('on', p.flying)
    if (p.flying) {
      // Stop any downward momentum so the player hovers immediately.
      p.velocity.y = 0
      this.showHint('Fly mode on! Joystick to move, ⬆ to rise, ⬇ to descend.')
    } else {
      this.showHint('Fly mode off.')
    }
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

  // --- Persistence ---
  saveGame() {
    const edits = {}
    for (const key of this.editedCells) {
      const [x, y, z] = key.split(',').map(Number)
      // Record the final state, including AIR for broken/removed blocks, so a
      // break is replayed as a hole instead of regenerating the default block.
      edits[key] = this.world.getBlock(x, y, z)
    }
    const data = {
      version: 1,
      seed: this.world.seed,
      edits,
      player: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
      },
      blockCounts: this.blockCounts,
      activeBlock: this.activeBlock,
      selectedSlot: this.selectedSlot,
      switchOn: Object.fromEntries(this.switchOn),
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch (e) {
      // Storage full or unavailable; progress just won't persist this time.
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!data || data.version !== 1) return null
      return data
    } catch (e) {
      return null
    }
  }

  // Apply any saved block edits that live in this chunk. Called right after a
  // chunk is generated, before its mesh is built.
  applyChunkEdits(cx, cz) {
    const edits = this.editsByChunk.get(this.world.key(cx, cz))
    if (!edits) return
    for (const [x, y, z, id] of edits) this.world.setBlock(x, y, z, id)
  }

  // --- Chunk management ---
  generateAroundPlayer() {
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE)
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE)
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx, cz = pcz + dz
        const key = this.world.key(cx, cz)
        if (!this.chunkMeshes.has(key) && !this.world.getChunk(cx, cz) && !this.chunkQueueSet.has(key)) {
          this.chunkQueue.push([cx, cz])
          this.chunkQueueSet.add(key)
        }
      }
    }
  }

  // Generate a bounded batch of queued chunks per frame so that travelling far
  // from spawn does not hang the render loop on a large synchronous burst.
  processChunkQueue() {
    const maxPerFrame = 2
    let processed = 0
    while (processed < maxPerFrame && this.chunkQueue.length > 0) {
      const [cx, cz] = this.chunkQueue.shift()
      const key = this.world.key(cx, cz)
      this.chunkQueueSet.delete(key)
      // Skip if it was created meanwhile (e.g. via an edit or a rebuild).
      if (this.chunkMeshes.has(key) || this.world.getChunk(cx, cz)) continue
      this.world.generateChunk(cx, cz)
      this.applyChunkEdits(cx, cz)
      this.rebuildChunk(cx, cz)
      processed++
    }
    // Once the queued chunks have all built, refresh the power network so
    // restored switches and motors reflect their saved states.
    if (processed > 0 && this.chunkQueue.length === 0) this.recomputePower()
  }

  // Generate the chunk under the player synchronously at startup so the ground
  // exists before the physics loop starts. Without this, the player falls into
  // terrain that appears a frame or two later and can end up underground.
  ensurePlayerChunk() {
    const cx = Math.floor(this.player.position.x / CHUNK_SIZE)
    const cz = Math.floor(this.player.position.z / CHUNK_SIZE)
    if (!this.world.getChunk(cx, cz)) this.world.generateChunk(cx, cz)
    this.applyChunkEdits(cx, cz)
    this.rebuildChunk(cx, cz)
  }

  // If the (possibly restored) player position intersects a solid block, move
  // them up until their AABB is clear so they never spawn embedded underground.
  ensureSafeSpawn() {
    const p = this.player
    for (let y = p.position.y; y < WORLD_HEIGHT; y++) {
      p.position.y = y
      if (!p.collides(p.position.x, y, p.position.z)) return
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
      sheep.group.traverse((o) => { if (o.isMesh) o.castShadow = true })
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
    // Remove any mechanical blocks in this chunk.
    for (const [mkey, m] of [...this.mechBlocks]) {
      const [mx, , mz] = mkey.split(',').map(Number)
      if (Math.floor(mx / CHUNK_SIZE) === cx && Math.floor(mz / CHUNK_SIZE) === cz) {
        this.scene.remove(m.group)
        this.disposeFurniture(m.group)
        this.mechBlocks.delete(mkey)
      }
    }
    // Remove any berry meshes in this chunk.
    for (const [bkey, g] of [...this.berryMeshes]) {
      const [bx, , bz] = bkey.split(',').map(Number)
      if (Math.floor(bx / CHUNK_SIZE) === cx && Math.floor(bz / CHUNK_SIZE) === cz) {
        this.scene.remove(g)
        this.disposeFurniture(g)
        this.berryMeshes.delete(bkey)
      }
    }

    // Build merged block mesh
    let hasBlocks = false
    const geo = buildChunkGeometry(chunk, this.world, this.atlas.slots)
    if (geo.attributes.position.count > 0) {
      const mesh = new THREE.Mesh(geo, this.material)
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)
      mesh.castShadow = true
      mesh.receiveShadow = true
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

    // Build mechanical blocks for this chunk.
    this.buildMechForChunk(chunk, cx, cz)

    // Build berry meshes for this chunk.
    this.buildBerryForChunk(chunk, cx, cz)
  }

  buildBerryForChunk(chunk, cx, cz) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const id = chunk.get(x, y, z)
          if (isBerry(id)) {
            const wx = cx * CHUNK_SIZE + x
            const wz = cz * CHUNK_SIZE + z
            const bkey = `${wx},${y},${wz}`
            const g = buildBerry()
            g.position.set(wx, y, wz)
            this.scene.add(g)
            this.berryMeshes.set(bkey, g)
          }
        }
      }
    }
  }

  buildMechForChunk(chunk, cx, cz) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const id = chunk.get(x, y, z)
          if (isMechanical(id)) {
            const wx = cx * CHUNK_SIZE + x
            const wz = cz * CHUNK_SIZE + z
            const mkey = `${wx},${y},${wz}`
            const model = buildMechanicalBlock(id)
            model.group.position.set(wx, y, wz)
            this.scene.add(model.group)
            this.mechBlocks.set(mkey, { id, group: model.group, setPowered: model.setPowered, update: model.update })
          }
        }
      }
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

  // Seed gradual water flow after a block edit: water neighbours of the edited
  // cell will spread into the gap a few cells per tick, so it fills over time
  // rather than instantly.
  flowWater(x, y, z) {
    const dirs = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz
      if (this.world.getBlock(nx, ny, nz) === WATER) {
        this.waterQueue.push({ x: nx, y: ny, z: nz, hdist: 0 })
      }
    }
  }

  // Advance the gradual water flow a little each frame, governed by a tick timer.
  stepWater(dt) {
    if (this.waterQueue.length === 0) return
    this._waterAccum = (this._waterAccum || 0) + dt
    const TICK = 0.12 // seconds between each flow step
    while (this._waterAccum >= TICK) {
      this._waterAccum -= TICK
      this._waterTick()
      if (this.waterQueue.length === 0) break
    }
  }

  // One flow step: process a small batch of water cells, letting each fall and
  // then spread horizontally a limited distance from its source.
  _waterTick() {
    const MAX_PER_TICK = 4
    const MAX_H = 10 // horizontal reach from the source
    const touched = new Set()
    let n = 0
    while (n < MAX_PER_TICK && this.waterQueue.length) {
      const { x, y, z, hdist } = this.waterQueue.shift()
      if (this.world.getBlock(x, y, z) !== WATER) continue
      // Water falls into the cell below, then spreads horizontally to every
      // adjacent air cell up to the reach limit, so it pools naturally.
      if (n < MAX_PER_TICK && this._tryFillWater(x, y - 1, z, hdist, touched)) n++
      if (hdist < MAX_H) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (n >= MAX_PER_TICK) break
          if (this._tryFillWater(x + dx, y, z + dz, hdist + 1, touched)) n++
        }
      }
    }
    for (const ck of touched) {
      const [cx, cz] = ck.split(',').map(Number)
      this.rebuildChunk(cx, cz)
    }
  }

  // Fill one air cell with water (if valid) and queue it to spread further.
  _tryFillWater(x, y, z, hdist, touched) {
    if (y < 0 || y >= WORLD_HEIGHT) return false
    if (this.world.getBlock(x, y, z) !== AIR) return false
    const k = `${x},${y},${z}`
    this.world.setBlock(x, y, z, WATER)
    this.editedCells.add(k)
    this.waterQueue.push({ x, y, z, hdist })
    touched.add(this.world.key(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))
    return true
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
    // Break sound for the block's material, offset by its direction from the
    // player so the audio feels spatial.
    this.sound.breakBlock(target.id, this.targetPan(target))
    this.world.setBlock(target.x, target.y, target.z, AIR)
    this.editedCells.add(`${target.x},${target.y},${target.z}`)
    // Water flows into the gap if there is a source nearby.
    this.flowWater(target.x, target.y, target.z)
    // Collect the broken block into the inventory.
    if (this.blockCounts[target.id] !== undefined) {
      this.blockCounts[target.id]++
      this.refreshInventory()
    }
    this.markDirty(target.x, target.z)
    // If a switch was broken, forget its on/off state.
    if (target.id === SWITCH) this.switchOn.delete(`${target.x},${target.y},${target.z}`)
    this.recomputePower()
    this.breakBtn.classList.add('active')
    setTimeout(() => this.breakBtn.classList.remove('active'), 120)
  }

  // Stereo pan (-1..1) for a block's position relative to the player's view.
  targetPan(target) {
    if (!target) return 0
    const dx = target.x - this.player.position.x
    const dz = target.z - this.player.position.z
    // Right is +sin(yaw) for x... project world offset onto the right vector.
    const rightX = Math.cos(this.player.yaw)
    const rightZ = -Math.sin(this.player.yaw)
    const lateral = dx * rightX + dz * rightZ
    const forwardX = -Math.sin(this.player.yaw)
    const forwardZ = -Math.cos(this.player.yaw)
    const depth = dx * forwardX + dz * forwardZ
    // Scale by distance so far-away blocks are quieter.
    if (depth === 0) return 0
    return lateral / (Math.abs(depth) + 4)
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
    // Place sound, positioned toward the new block.
    this.sound.placeBlock(this.targetPan(target))
    // water gets replaced
    this.world.setBlock(px, py, pz, id)
    this.editedCells.add(`${px},${py},${pz}`)
    this.markDirty(px, pz)
    // spend one from the inventory
    this.blockCounts[id]--
    this.refreshInventory()
    this.recomputePower()
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

  recomputePower() {
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    const powered = new Set()
    const stack = []
    // Seed the flood fill from every switch that is ON.
    for (const [key, on] of this.switchOn) {
      if (on) { powered.add(key); stack.push(key) }
    }
    // Spread power through wire and switch cells.
    while (stack.length) {
      const [x, y, z] = stack.pop().split(',').map(Number)
      for (const [dx, dy, dz] of DIRS) {
        const nk = `${x + dx},${y + dy},${z + dz}`
        if (powered.has(nk)) continue
        const nid = this.world.getBlock(x + dx, y + dy, z + dz)
        if (nid === WIRE || nid === SWITCH) { powered.add(nk); stack.push(nk) }
      }
    }
    // Apply state: wire/switch are powered when in the set; motors and pistons
    // are active when a neighbour is powered.
    for (const [key, b] of this.mechBlocks) {
      const [x, y, z] = key.split(',').map(Number)
      let active = powered.has(key)
      if (!active && (b.id === MOTOR || b.id === PISTON)) {
        for (const [dx, dy, dz] of DIRS) {
          if (powered.has(`${x + dx},${y + dy},${z + dz}`)) { active = true; break }
        }
      }
      b.setPowered(active)
    }
  }

  toggleSwitch(x, y, z) {
    const key = `${x},${y},${z}`
    this.switchOn.set(key, !this.switchOn.get(key))
    this.sound.click()
    this.recomputePower()
  }

  activateTarget() {
    const target = this.getTargetBlock()
    if (!target) return
    if (target.id === SWITCH) {
      this.toggleSwitch(target.x, target.y, target.z)
    } else if (target.id === STRAWBERRY) {
      this.pickStrawberry(target.x, target.y, target.z)
    }
  }

  pickStrawberry(x, y, z) {
    this.sound.pop()
    this.world.setBlock(x, y, z, AIR)
    this.editedCells.add(`${x},${y},${z}`)
    this.flowWater(x, y, z)
    this.blockCounts[STRAWBERRY] = (this.blockCounts[STRAWBERRY] || 0) + 1
    this.refreshInventory()
    this.markDirty(x, z)
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

  updateTargetHighlight() {
    const target = this.getTargetBlock()
    if (target) {
      this.targetBox.visible = true
      this.targetBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5)
    } else {
      this.targetBox.visible = false
    }
  }

  // Whether the player's eyes are inside a water block.
  isPlayerUnderwater() {
    const x = Math.floor(this.player.position.x)
    const y = Math.floor(this.player.position.y + 1.62)
    const z = Math.floor(this.player.position.z)
    return this.world.getBlock(x, y, z) === WATER
  }

  // Fade a blue overlay and murky fog while submerged, restoring the clear sky
  // view once the player surfaces.
  updateWaterEffect() {
    const underwater = this.isPlayerUnderwater()
    this.waterOverlay.classList.toggle('active', underwater)
    if (underwater) {
      this.scene.fog.color.copy(this.underwaterColor)
      this.scene.fog.near = this.underwaterFogNear
      this.scene.fog.far = this.underwaterFogFar
      this.scene.background.copy(this.underwaterColor)
    } else {
      this.scene.fog.color.copy(this.skyColor)
      this.scene.fog.near = this.skyFogNear
      this.scene.fog.far = this.skyFogFar
      this.scene.background.copy(this.skyColor)
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    })
    // Persist progress when the page is hidden, closed, or navigated away.
    const persist = () => this.saveGame()
    window.addEventListener('pagehide', persist)
    window.addEventListener('beforeunload', persist)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist()
    })
    // Periodic autosave so progress survives even if the tab is killed.
    setInterval(persist, 10000)
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

    // Regenerate chunks as player moves, a bounded batch per frame
    this.generateAroundPlayer()
    this.processChunkQueue()

    // Advance gradual water flow
    this.stepWater(dt)

    // Animate wandering sheep
    for (const sheep of this.sheep) sheep.update(dt)

    // Animate powered mechanical blocks (e.g. spinning motors).
    for (const [, b] of this.mechBlocks) if (b.update) b.update(dt)

    // Keep the shadow-casting sun following the player.
    const sx = this.player.position.x
    const sz = this.player.position.z
    this.sun.position.set(sx + 50, 100, sz + 30)
    this.sun.target.position.set(sx, 0, sz)

    // Highlight the block being aimed at.
    this.updateTargetHighlight()

    // Fade in a blue overlay and murky fog while the player is submerged.
    this.updateWaterEffect()

    this.renderer.render(this.scene, this.camera)
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game()
})
