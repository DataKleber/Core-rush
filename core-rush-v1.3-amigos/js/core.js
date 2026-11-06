import * as THREE from 'three';
import { CFG } from './config.js';
import { glowTexture } from './assets.js';
import { collideCircle } from './arena.js';

// O núcleo de energia: único objetivo da partida
export class Core {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    const base = new THREE.Color(0x9ff4ff);

    this.inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc9fbff, emissiveIntensity: 2.2, roughness: 0.2 })
    );
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 0),
      new THREE.MeshBasicMaterial({ color: base, wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
    );
    const ringMat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.r1 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 8, 64), ringMat);
    this.r2 = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.02, 8, 64), ringMat);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: base, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
    this.glow.scale.set(2.0, 2.0, 1);
    // v0.4: brilho "através" de personagens e obstáculos (suave, só quando o núcleo está solto)
    this.glowX = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: base, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.5 }));
    this.glowX.scale.set(1.3, 1.3, 1); this.glowX.renderOrder = 6;
    this.light = new THREE.PointLight(0x8ff3ff, 14, 9, 1.6);
    this.orb = new THREE.Group();
    this.orb.add(this.inner, this.shell, this.r1, this.r2, this.glow, this.glowX, this.light);
    this.group.add(this.orb);

    // Coluna de luz para localizar o núcleo de qualquer ponto
    const beamGeo = new THREE.CylinderGeometry(0.24, 0.55, 30, 20, 1, true); beamGeo.translate(0, 15, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.beam.renderOrder = 5; // v0.4: a coluna aparece mesmo atrás de caixas e reatores
    scene.add(this.beam);
    // Marca no chão
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48),
      new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; scene.add(this.marker);
    // v0.4: anel segmentado que gira — diferente dos anéis sólidos dos personagens — visível através deles
    this.markerX = new THREE.Group(); scene.add(this.markerX);
    const segMat = new THREE.MeshBasicMaterial({ color: 0xe6fdff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.36, 16, 1, k * Math.PI / 2 + 0.25, Math.PI / 2 - 0.5), segMat);
      seg.rotation.x = -Math.PI / 2; seg.renderOrder = 5; this.markerX.add(seg);
    }
    this.markerX.position.y = 0.07;
    this.onLand = null; // chamado quando o núcleo pousa após uma queda

    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.tint = new THREE.Color(); this.baseColor = base;
    this.reset();
  }

  reset() {
    this.state = 'free'; this.carrier = null; this.noPickup = 0; this.spawnT = 0;
    this.pos.set(0, CFG.core.floatY, 0); this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
  }

  attach(f) {
    this.state = 'carried'; this.carrier = f; f.carrying = true;
  }

  drop(dir) {
    const f = this.carrier; if (!f) return;
    f.carrying = false; this.carrier = null;
    this.state = 'flying';
    this.pos.copy(f.pos).setY(CFG.core.carryY - 0.4);
    const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 0.7;
    const sp = CFG.core.dropSpeed * (0.8 + Math.random() * 0.4);
    this.vel.set(Math.sin(a) * sp, 7.5, Math.cos(a) * sp);
    this.noPickup = 0.28;
  }

  update(dt, time, colliders, nav, remote) {
    this.noPickup = Math.max(0, this.noPickup - dt);
    const C = CFG.core;
    if (this.state === 'carried') {
      const t = this.carrier.pos;
      this.pos.set(t.x, C.carryY + Math.sin(time * 4) * 0.08, t.z);
      this.group.position.lerp(this.pos, 1 - Math.exp(-25 * dt));
    } else if (remote) { // v1.3: convidado online — posição vem do anfitrião
      this.group.position.copy(this.pos);
    } else if (this.state === 'flying') {
      this.vel.y -= 24 * dt;
      this.pos.addScaledVector(this.vel, dt);
      collideCircle(this.pos, CFG.move.radius, this.vel, colliders, 0.6);
      if (this.pos.y < C.floatY && this.vel.y < 0) {
        this.pos.y = C.floatY;
        if (Math.abs(this.vel.y) < 2.5) { this.state = 'free'; this.vel.set(0, 0, 0); if (this.onLand) this.onLand(this.pos); }
        else { this.vel.y *= -0.42; this.vel.x *= 0.55; this.vel.z *= 0.55; }
      }
      this.group.position.copy(this.pos);
    } else {
      // se parou num canto onde ninguém alcança, desliza para o espaço livre mais próximo
      if (nav && !nav.free(this.pos.x, this.pos.z)) {
        const id = nav.nearestFree(nav.idx(this.pos.x, this.pos.z));
        const tx = (id % nav.N) - nav.H + 0.5, tz = ((id / nav.N) | 0) - nav.H + 0.5;
        const k = 1 - Math.exp(-6 * dt);
        this.pos.x += (tx - this.pos.x) * k; this.pos.z += (tz - this.pos.z) * k;
      }
      this.pos.y = C.floatY + Math.sin(time * 2.6) * 0.14;
      this.group.position.copy(this.pos);
    }

    // Visual
    const carried = this.state === 'carried';
    if (carried) this.tint.setHex(this.carrier.color).lerp(this.baseColor, 0.35); else this.tint.copy(this.baseColor);
    this.shell.rotation.set(time * 0.9, time * 1.3, 0);
    this.r1.rotation.set(time * 2.1, time * 0.7, 0);
    this.r2.rotation.set(-time * 1.2, 0, time * 1.8);
    const pulse = 1 + Math.sin(time * 6) * 0.06;
    this.orb.scale.setScalar((carried ? 0.82 : 1) * pulse);
    this.shell.material.color.copy(this.tint); this.r1.material.color.copy(this.tint);
    this.glow.material.color.copy(this.tint); this.light.color.copy(this.tint);
    this.beam.material.color.copy(this.tint);
    this.beam.position.set(this.group.position.x, 0, this.group.position.z);
    this.beam.material.opacity = carried ? 0.13 + Math.sin(time * 8) * 0.03 : 0.26 + Math.sin(time * 3) * 0.05;
    this.marker.visible = !carried;
    this.marker.position.set(this.group.position.x, 0.06, this.group.position.z);
    this.marker.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
    this.markerX.visible = !carried; this.glowX.visible = !carried;
    this.markerX.position.x = this.group.position.x; this.markerX.position.z = this.group.position.z;
    this.markerX.rotation.y = time * 1.2;
  }
}
