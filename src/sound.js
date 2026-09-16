// Sound effects for Arhaancraft.
//
// All sounds are synthesised with the Web Audio API so the PWA needs no audio
// asset files. The AudioContext is created lazily and resumed on the first
// user gesture, which browsers require before audio can play.

import {
  GRASS, DIRT, STONE, SAND, WOOD, LEAVES, GLASS, PLANKS,
  COBBLESTONE, BRICK, WIRE, MOTOR, PISTON, SWITCH, STRAWBERRY,
} from './blocks.js'

// Which block material a break / footstep sound should sound like.
const MATERIAL = {
  [GRASS]: 'grass',
  [DIRT]: 'dirt',
  [STONE]: 'stone',
  [SAND]: 'sand',
  [WOOD]: 'wood',
  [LEAVES]: 'leaves',
  [GLASS]: 'stone',
  [PLANKS]: 'wood',
  [COBBLESTONE]: 'stone',
  [BRICK]: 'stone',
  [WIRE]: 'metal',
  [MOTOR]: 'metal',
  [PISTON]: 'metal',
  [SWITCH]: 'metal',
  [STRAWBERRY]: 'leaf',
}

export class SoundManager {
  constructor() {
    this.ctx = null
    this.master = null
    this._noise = null
  }

  // Create/resume the AudioContext. Called from a user gesture (tap) so the
  // browser allows audio to start.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  // A short noise burst, band-passed, used for footsteps and breaking.
  hit(volume, duration, filterFreq, filterQ = 1, pan = 0) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise()
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    filter.Q.value = filterQ
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = pan
    src.connect(filter)
    filter.connect(gain)
    gain.connect(panner)
    panner.connect(this.master)
    src.start(t)
    src.stop(t + duration)
  }

  // A tonal blip (place, jump, click).
  tone(freq, volume, duration, type = 'sine', pan = 0) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    const panner = this.ctx.createStereoPanner()
    panner.pan.value = pan
    osc.connect(gain)
    gain.connect(panner)
    panner.connect(this.master)
    osc.start(t)
    osc.stop(t + duration)
  }

  // Shared white-noise buffer.
  noise() {
    if (this._noise) return this._noise
    const len = this.ctx.sampleRate * 0.5
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this._noise = buf
    return this._noise
  }

  // --- Actions ---

  // Block broken: a crunchy sound shaped by the block's material.
  breakBlock(blockId, pan = 0) {
    this.ensure()
    const m = MATERIAL[blockId] || 'stone'
    const spec = {
      grass: [0.35, 0.12, 700],
      dirt: [0.3, 0.12, 500],
      stone: [0.4, 0.16, 1500, 1.5],
      sand: [0.25, 0.14, 900],
      wood: [0.35, 0.16, 1100],
      leaves: [0.2, 0.1, 1600],
      metal: [0.35, 0.2, 2500, 2],
    }[m]
    this.hit(spec[0], spec[1], spec[2], spec[3] || 1, pan)
  }

  // Block placed: a solid, slightly damped thud.
  placeBlock(pan = 0) {
    this.ensure()
    this.hit(0.3, 0.1, 350, 1.2, pan)
    this.hit(0.15, 0.08, 1200, 1, pan)
  }

  // Footstep on a given material, at a small random pitch so steps vary.
  footstep(material, pan = 0) {
    this.ensure()
    const spec = {
      grass: [0.12, 0.07, 800],
      dirt: [0.1, 0.07, 500],
      stone: [0.12, 0.08, 1600],
      sand: [0.1, 0.08, 700],
      wood: [0.12, 0.08, 1100],
      leaves: [0.08, 0.06, 1700],
    }[material] || [0.1, 0.07, 900]
    this.hit(spec[0], spec[1], spec[2] * (0.9 + Math.random() * 0.2), 1, pan)
  }

  jump() {
    this.ensure()
    this.tone(300, 0.15, 0.12, 'triangle')
  }

  land() {
    this.ensure()
    this.hit(0.2, 0.1, 400, 1.5)
  }

  click() {
    this.ensure()
    this.tone(1200, 0.2, 0.05, 'square')
  }

  pop() {
    this.ensure()
    this.tone(500, 0.25, 0.12, 'sine')
    this.tone(900, 0.15, 0.1, 'sine')
  }
}

// Map a block id to the material name used for footstep sounds. Returns 'grass'
// by default; anything not solid-footed (water/air) is not walked on anyway.
export function footstepMaterial(id) {
  return MATERIAL[id] || 'stone'
}
