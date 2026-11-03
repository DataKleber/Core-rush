import * as THREE from 'three';
import { glowTexture } from './assets.js';

// Partículas e ondas de choque com pool fixo (sem criar objetos durante a partida)
export class FX {
  constructor(scene) {
    this.parts = []; this.waves = [];
    const tex = glowTexture();
    for (let i = 0; i < 220; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; scene.add(s);
      this.parts.push({ s, v: new THREE.Vector3(), life: 0, max: 1, size: 1 });
    }
    const wg = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.waves.push({ m, life: 0, max: 1, size: 1 });
    }
    this.pi = 0; this.wi = 0;
  }

  burst(pos, color, n = 12, speed = 6, life = 0.5, size = 0.4, up = 3) {
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pi = (this.pi + 1) % this.parts.length];
      p.s.position.copy(pos); p.s.visible = true; p.s.material.color.set(color);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 - 0.2, sp = speed * (0.4 + Math.random() * 0.6);
      p.v.set(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + up, Math.sin(a) * Math.cos(e) * sp);
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8);
    }
  }

  // v0.5: jato direcional (faíscas na direção do disparo/impacto)
  spray(pos, dx, dz, color, n = 12, speed = 9, spread = 0.6, life = 0.35, size = 0.35) {
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.pi = (this.pi + 1) % this.parts.length];
      p.s.position.copy(pos); p.s.visible = true; p.s.material.color.set(color);
      const a = base + (Math.random() - 0.5) * spread, sp = speed * (0.5 + Math.random() * 0.7);
      p.v.set(Math.sin(a) * sp, 1 + Math.random() * 3, Math.cos(a) * sp);
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size * (0.6 + Math.random() * 0.8);
    }
  }

  // v0.5: clarão parado e curto no ponto do impacto
  flash(pos, color, size = 2.5, life = 0.12) {
    const p = this.parts[this.pi = (this.pi + 1) % this.parts.length];
    p.s.position.copy(pos); p.s.visible = true; p.s.material.color.set(color);
    p.v.set(0, 9 * life * 0.5, 0); // compensa a gravidade do pool para ficar parado
    p.life = p.max = life; p.size = size;
  }

  wave(pos, color, size = 3, life = 0.4) {
    const w = this.waves[this.wi = (this.wi + 1) % this.waves.length];
    w.m.position.set(pos.x, 0.1, pos.z); w.m.material.color.set(color);
    w.m.visible = true; w.life = w.max = life; w.size = size;
  }

  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.v.y -= 9 * dt; p.v.multiplyScalar(Math.exp(-2.5 * dt));
      p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      p.s.material.opacity = k; p.s.scale.setScalar(p.size * (0.4 + k * 0.6));
    }
    for (const w of this.waves) {
      if (w.life <= 0) continue;
      w.life -= dt;
      if (w.life <= 0) { w.m.visible = false; continue; }
      const k = 1 - w.life / w.max;
      w.m.scale.setScalar(0.3 + k * w.size); w.m.material.opacity = (1 - k) * 0.9;
    }
  }
}
