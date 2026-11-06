// Teclado + controle de toque (joystick virtual e botão de ataque)
export class Input {
  constructor() {
    this.keys = new Set();
    this.attackBuffer = 0;
    this.joy = { active: false, id: null, x: 0, y: 0 };
    this.onPause = null;
    const atkKeys = ['Space', 'KeyJ', 'KeyK', 'Enter'];
    addEventListener('keydown', e => {
      if (atkKeys.includes(e.code)) { if (!e.repeat) this.attackBuffer = 0.16; e.preventDefault(); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) this.onPause();
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', e => {
      if (e.button === 0 && e.target.tagName === 'CANVAS') this.attackBuffer = 0.16;
    });
    this.setupTouch();
  }

  setupTouch() {
    const zone = document.getElementById('joyZone');
    const base = document.getElementById('joyBase');
    const knob = document.getElementById('joyKnob');
    const btn = document.getElementById('atkBtn');
    const R = 56;
    const start = e => {
      for (const t of e.changedTouches) {
        if (this.joy.active) break;
        this.joy = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
        base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
        base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
      }
      e.preventDefault();
    };
    const move = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        this.joy.x = dx / R; this.joy.y = dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      e.preventDefault();
    };
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        this.joy = { active: false, id: null, x: 0, y: 0 };
        base.classList.remove('on');
      }
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    btn.addEventListener('touchstart', e => { this.attackBuffer = 0.16; btn.classList.add('press'); e.preventDefault(); }, { passive: false });
    btn.addEventListener('touchend', () => btn.classList.remove('press'));
  }

  // Direção de movimento no plano (x = direita, y = para baixo da tela / +z)
  move(out) {
    if (this.joy.active) {
      const m = Math.hypot(this.joy.x, this.joy.y);
      const dz = 0.12; // zona morta
      if (m < dz) return out.set(0, 0);
      const k = Math.min(1, (m - dz) / (1 - dz)) / m;
      return out.set(this.joy.x * k, this.joy.y * k);
    }
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return out.set(x / l, y / l);
  }

  tick(dt) { this.attackBuffer = Math.max(0, this.attackBuffer - dt); }
  wantsAttack() { return this.attackBuffer > 0; }
  clearAttack() { this.attackBuffer = 0; }
}
