// iPad touch input handling:
//  - Left joystick: move (x, z)
//  - Right side drag: look around
//  - Break/Place buttons
//  - Jump button
// Provides an `input` object the player reads each frame.

export class InputController {
  constructor() {
    this.input = {
      moveX: 0, moveZ: 0,    // joystick
      lookX: 0, lookY: 0,    // look drag deltas (applied to yaw/pitch)
      jump: false,
    }
    this.joystickActive = false
    this.lookActive = false
    this._lookStart = null
    this._bind()
  }

  _bind() {
    // Joystick
    const zone = document.getElementById('joystick-zone')
    const stick = document.getElementById('joystick')
    const knob = document.getElementById('joystick-knob')

    const updateStick = (cx, cy) => {
      const rect = zone.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      let dx = cx - centerX
      let dy = cy - centerY
      const max = rect.width / 2
      const len = Math.hypot(dx, dy)
      if (len > max) { dx = dx / len * max; dy = dy / len * max }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
      this.input.moveX = dx / max
      this.input.moveZ = -dy / max // up = forward
    }
    const resetStick = () => {
      this.input.moveX = 0
      this.input.moveZ = 0
      knob.style.transform = 'translate(-50%, -50%)'
    }

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault()
      this.joystickActive = true
      const t = e.changedTouches[0]
      updateStick(t.clientX, t.clientY)
    }, { passive: false })
    zone.addEventListener('touchmove', (e) => {
      if (!this.joystickActive) return
      e.preventDefault()
      const t = e.changedTouches[0]
      updateStick(t.clientX, t.clientY)
    }, { passive: false })
    zone.addEventListener('touchend', (e) => {
      e.preventDefault()
      this.joystickActive = false
      resetStick()
    }, { passive: false })

    // Look area (right side, excluding UI buttons). Drag to look around.
    const look = document.getElementById('look-area')
    look.addEventListener('touchstart', (e) => {
      if (this._isOnUI(e.target)) return
      this._lookStart = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
      this.lookActive = true
    }, { passive: true })
    look.addEventListener('touchmove', (e) => {
      if (!this.lookActive || !this._lookStart) return
      const t = e.changedTouches[0]
      const dx = t.clientX - this._lookStart.x
      const dy = t.clientY - this._lookStart.y
      this._lookStart = { x: t.clientX, y: t.clientY }
      // store delta for this frame; consumed by game loop
      this._pendingLookX = (this._pendingLookX || 0) + dx
      this._pendingLookY = (this._pendingLookY || 0) + dy
    }, { passive: true })
    look.addEventListener('touchend', () => { this.lookActive = false; this._lookStart = null }, { passive: true })
  }

  _isOnUI(el) {
    return el && el.closest && el.closest('#action-buttons, #hotbar, #inventory, #joystick-zone')
  }

  // Consume per-frame look deltas
  consumeLook() {
    const lx = this._pendingLookX || 0
    const ly = this._pendingLookY || 0
    this._pendingLookX = 0
    this._pendingLookY = 0
    return { lx, ly }
  }

  setJump(v) { this.input.jump = v }
}
