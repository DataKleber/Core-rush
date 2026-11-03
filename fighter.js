import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CFG } from './config.js';
import { glowTexture } from './assets.js';
import { getCharacter, applyLook } from './characters.js';

const _v = new THREE.Vector3();
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

// v0.9: aparência, animações e ponta do canhão vêm do personagem escolhido (js/characters.js)
function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px "Chakra Petch", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(6,8,22,0.9)';
  g.strokeText(text, 128, 34);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.9, 0.48, 1); s.renderOrder = 10;
  return s;
}

export class Fighter {
  constructor(scene, def, index) {
    this.def = def; this.index = index;
    this.name = def.name; this.color = def.color; this.isPlayer = !!def.player;
    this.speedMul = def.speedMul || 1;
    this.radius = CFG.move.radius;

    this.root = new THREE.Group(); scene.add(this.root);
    this.muzzleOff = new THREE.Vector3(-0.26, 1.1, 0.95);

    // Anel de identificação no chão
    const col = new THREE.Color(def.color);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.02, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.05;
    this.root.add(this.ring);
    // Indicador de direção
    const arrowShape = new THREE.Shape(); arrowShape.moveTo(0, 1.42); arrowShape.lineTo(-0.26, 1.1); arrowShape.lineTo(0.26, 1.1);
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.arrow.rotation.x = Math.PI / 2; this.arrow.position.y = 0.05; // +y da forma vira +z local
    this.root.add(this.arrow);

    this.tag = nameTag(def.name, def.color);
    this.tag.position.y = 3.0; this.root.add(this.tag);

    // Cone do ataque (no chão, aponta para +z local)
    const arc = THREE.MathUtils.degToRad(CFG.attack.arc);
    // v0.5: o leque desenhado vai até o alcance real (o centro do alvo precisa estar dentro dele)
    this.reach = CFG.attack.range + CFG.move.radius;
    const coneGeo = new THREE.RingGeometry(0.7, this.reach, 32, 1, Math.PI / 2 - arc / 2, arc);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.cone.rotation.x = Math.PI / 2; this.cone.position.y = 0.12; this.cone.scale.y = 1;
    // O cone fica preso ao ponto onde o disparo saiu (não acompanha o avanço),
    // para mostrar exatamente a área que o acerto verifica.
    this.coneHolder = new THREE.Group(); scene.add(this.coneHolder);
    this.coneHolder.add(this.cone);
    this.attackOrigin = new THREE.Vector3();
    // v0.5: frente de onda que percorre o leque inteiro (mostra a abertura de 80°)
    const white = new THREE.Color(def.color).lerp(new THREE.Color(0xffffff), 0.3);
    this.edge = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40, 1, Math.PI / 2 - arc / 2, arc),
      new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.edge.rotation.x = Math.PI / 2; this.edge.position.y = 0.16;
    this.coneHolder.add(this.edge);
    // v0.5: raios de energia espalhados pelo leque (rajada, não um projétil estreito)
    this.streaks = [];
    const streakMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: white, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const half = CFG.attack.arc / 2 - 6;
    for (const deg of [-half, -half / 2, 0, half / 2, half]) {
      const pivot = new THREE.Group(); pivot.rotation.y = THREE.MathUtils.degToRad(deg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1), streakMat);
      m.rotation.x = -Math.PI / 2; pivot.add(m); this.coneHolder.add(pivot);
      this.streaks.push(m);
    }
    this.streakMat = streakMat;
    this.shotT = -1;
    // v0.5: brilho de carga na ponta da arma durante a antecipação
    this.charge = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: white, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.charge.position.set(-0.26, 1.1, 0.95); this.root.add(this.charge);
    // v0.5: estrelas de atordoamento (substituem a animação de choro)
    this.stars = new THREE.Group(); this.stars.position.y = 2.45; this.root.add(this.stars);
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 }));
      st.scale.set(0.6, 0.6, 1); this.stars.add(st);
    }
    this.stars.visible = false;
    // Clarão no cano da arma
    this.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.muzzle.position.set(-0.26, 1.1, 0.95); this.muzzle.scale.set(2.4, 2.4, 1); // ponta da arma
    this.root.add(this.muzzle);
    // Escudo breve após capturar o núcleo
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.shieldMesh.position.y = 1.1; this.root.add(this.shieldMesh);

    this.setCharacter(def.character || 'abelha');

    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.reset(new THREE.Vector3(), 0);
  }

  // v0.9: troca o modelo e as animações; jogabilidade, aro, leque e efeitos continuam os mesmos
  setCharacter(id) {
    const ch = getCharacter(id);
    if (this.charId === ch.id) return;
    this.charId = ch.id; this.charName = ch.name;
    if (this.model) { this.root.remove(this.model); this.mixer.stopAllAction(); }
    this.model = SkeletonUtils.clone(ch.gltf.scene);
    this.charScale = ch.scale; this.charOffsetY = ch.offsetY;
    this.model.scale.setScalar(ch.scale); this.model.position.y = ch.offsetY;
    this.root.add(this.model);
    this.mats = [];
    this.model.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true; m.frustumCulled = false;
        m.material = m.material.clone();
        applyLook(m.material, ch.look);
        if (m.material.emissive) m.material.emissive.setRGB(0, 0, 0);
        this.mats.push(m.material);
      }
    });
    // ponta do canhão medida para cada personagem
    this.muzzleOff.copy(ch.muzzle);
    this.muzzle.position.copy(ch.muzzle); this.charge.position.copy(ch.muzzle);
    this.stars.position.y = ch.refHeight + 0.35;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const k of ['idle', 'run', 'fire']) {
      const a = this.mixer.clipAction(ch.clips[k]);
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      this.act[k] = a;
    }
    this.act.fire.setLoop(THREE.LoopOnce, 1); this.act.fire.clampWhenFinished = true;
    this.w = { idle: 1, run: 0, fire: 0 };
  }

  reset(p, facing) {
    this.pos.copy(p); this.vel.set(0, 0, 0);
    this.facing = facing;
    this.score = 0;
    this.attackPhase = 'none'; this.attackT = 0; this.cooldown = 0;
    this.stun = 0; this.invuln = 0; this.shield = 0; this.pickupCd = 0;
    this.hitFlash = 0; this.hitSet = new Set();
    this.carrying = false; this.squash = 0; this.boostT = 0;
    this.stunMax = CFG.attack.stun; this.tiltX = 0; this.tiltZ = 0;
    if (!this.flashCol) this.flashCol = new THREE.Color(1, 1, 1);
    this.moveInput = new THREE.Vector2();
  }

  get forward() { return _v.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get busy() { return this.stun > 0 || this.attackPhase !== 'none'; }

  tryAttack(game) {
    if (this.cooldown > 0 || this.stun > 0 || this.attackPhase !== 'none') return false;
    // Correção leve de mira: só gira se houver alvo bem à frente
    const aimDir = this.moveInput.lengthSq() > 0.04 ? Math.atan2(this.moveInput.x, this.moveInput.y) : this.facing;
    let best = null, bestScore = Infinity;
    for (const o of game.fighters) {
      if (o === this) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > CFG.attack.assistRange) continue;
      const ang = Math.abs(lerpAngle(0, Math.atan2(dx, dz) - aimDir, 1));
      if (ang > THREE.MathUtils.degToRad(CFG.attack.assistAngle)) continue;
      const s = d + ang * 2 - (o.carrying ? 2 : 0);
      if (s < bestScore) { bestScore = s; best = o; }
    }
    this.facing = best ? Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z) : aimDir;
    this.attackPhase = 'windup'; this.attackT = 0;
    this.cooldown = CFG.attack.cooldown;
    this.hitSet.clear();
    const f = this.act.fire; f.reset(); f.time = 0.05; f.timeScale = 2.6; f.play();
    this.w.fire = 1;
    game.audio.charge(this.isPlayer);
    return true;
  }

  // Empurrão do pulso de luz: desequilíbrio curto, sem dano visual de golpe
  stagger(dx, dz, push, time) {
    this.stun = Math.max(this.stun, time);
    this.vel.x += dx * push; this.vel.z += dz * push;
    this.attackPhase = 'none';
    this.setStunPose(dx, dz, time, 0.25);
  }

  // v0.5: inclina o corpo na direção do empurrão; as estrelas mostram a duração do atordoamento
  setStunPose(dx, dz, time, amount) {
    this.stunMax = Math.max(time, 0.01);
    const rel = Math.atan2(dx, dz) - this.facing;
    this.tiltX = Math.cos(rel) * amount; this.tiltZ = -Math.sin(rel) * amount;
  }

  takeHit(from, dir, game) {
    this.stun = CFG.attack.stun; this.invuln = CFG.attack.invuln;
    this.vel.set(dir.x * CFG.attack.knockback, 0, dir.z * CFG.attack.knockback);
    this.attackPhase = 'none';
    this.hitFlash = 1; this.squash = 1;
    this.flashCol.setHex(from ? from.color : 0xffffff);
    this.setStunPose(dir.x, dir.z, CFG.attack.stun, 0.5);
  }

  update(dt, game) {
    const M = CFG.move, A = CFG.attack;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.pickupCd = Math.max(0, this.pickupCd - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.squash = Math.max(0, this.squash - dt * 4);

    if (this.stun > 0) {
      this.stun -= dt;
      this.vel.multiplyScalar(Math.exp(-7 * dt));
    } else {
      // Fases do ataque
      if (this.attackPhase !== 'none') {
        this.attackT += dt;
        if (this.attackPhase === 'windup' && this.attackT >= A.windup) {
          this.attackPhase = 'active'; this.attackT = 0;
          const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
          // origem do acerto = posição antes do avanço (o avanço não aumenta o alcance)
          this.attackOrigin.set(this.pos.x, 0, this.pos.z);
          this.coneHolder.position.copy(this.attackOrigin); this.coneHolder.rotation.y = this.facing;
          this.vel.x += fx * A.lunge; this.vel.z += fz * A.lunge;
          this.cone.material.opacity = 0.42; this.muzzle.material.opacity = 1; this.charge.material.opacity = 0;
          this.shotT = 0;
          // ponta da arma em coordenadas do mundo
          const mo = this.muzzleOff;
          const mx = this.pos.x + fx * mo.z + fz * mo.x, mz = this.pos.z + fz * mo.z - fx * mo.x;
          game.fx.spray(_v.set(mx, mo.y, mz), fx, fz, this.color, 12, 9, 0.7, 0.28, 0.32);
          game.audio.shot(this.isPlayer);
        }
        if (this.attackPhase === 'active') {
          game.resolveHits(this);
          if (this.attackT >= A.active) { this.attackPhase = 'recovery'; this.attackT = 0; }
        } else if (this.attackPhase === 'recovery' && this.attackT >= A.recovery) {
          this.attackPhase = 'none';
        }
      }

      // Movimento com aceleração, frenagem e reforço ao inverter
      const inp = this.moveInput;
      let maxS = M.maxSpeed * this.speedMul;
      if (this.carrying) maxS *= M.carrierMul * (this.boostT > 0 ? CFG.core.boostMul : 1);
      if (this.attackPhase !== 'none') maxS *= M.attackMul;
      const dx = inp.x * maxS - this.vel.x, dz = inp.y * maxS - this.vel.z;
      const has = inp.lengthSq() > 0.0025;
      let rate = has ? M.accel : M.decel;
      if (has && (inp.x * this.vel.x + inp.y * this.vel.z) < 0) rate *= M.reverseBoost;
      // durante o avanço do ataque, deixa o impulso agir um pouco
      if (this.attackPhase === 'active') rate *= 0.35;
      const dl = Math.hypot(dx, dz), step = rate * dt;
      if (dl > step) { this.vel.x += (dx / dl) * step; this.vel.z += (dz / dl) * step; }
      else { this.vel.x += dx; this.vel.z += dz; }

      if (this.attackPhase === 'none' && has) {
        this.facing = lerpAngle(this.facing, Math.atan2(inp.x, inp.y), 1 - Math.exp(-M.turnRate * dt));
      }
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;

    // Efeitos visuais
    this.cone.material.opacity = Math.max(0, this.cone.material.opacity - dt * 3.2);
    this.muzzle.material.opacity = Math.max(0, this.muzzle.material.opacity - dt * 8);
    // carga: cresce durante a antecipação
    if (this.attackPhase === 'windup' && this.stun <= 0) {
      const r = Math.min(1, this.attackT / A.windup);
      this.charge.material.opacity = 0.35 + r * 0.65; this.charge.scale.setScalar(0.4 + r * 1.3);
    } else if (this.attackPhase !== 'active') this.charge.material.opacity = 0;
    // rajada: frente de onda e raios viajam até o alcance real em ~0,09 s
    if (this.shotT >= 0) {
      this.shotT += dt;
      const travel = 0.09, k = Math.min(1, this.shotT / travel), e = 1 - (1 - k) * (1 - k);
      const fade = this.shotT > travel ? Math.max(0, 1 - (this.shotT - travel) / 0.16) : 1;
      this.edge.scale.setScalar(0.8 + (this.reach - 0.8) * e);
      this.edge.material.opacity = 0.95 * fade;
      const len = 1.3, r = 0.9 + (this.reach - len / 2 - 0.9) * e;
      for (const m of this.streaks) { m.position.set(0, 1.05 - 0.45 * e, r); m.scale.y = len * (0.6 + 0.4 * e); }
      this.streakMat.opacity = fade;
      if (this.shotT > travel + 0.16) { this.shotT = -1; this.edge.material.opacity = 0; this.streakMat.opacity = 0; }
    }
    this.shieldMesh.material.opacity = this.shield > 0 ? 0.18 + Math.sin(performance.now() * 0.03) * 0.06 : 0;
  }

  animate(dt, time) {
    this.root.rotation.y = this.facing;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const s = THREE.MathUtils.clamp(speed / 4.2, 0, 1);
    const ovFire = this.attackPhase !== 'none' ? 1 : 0;
    const ovCry = 0; // v0.5: o choro foi substituído pela reação de atordoamento abaixo
    const k = 1 - Math.exp(-20 * dt), kOut = 1 - Math.exp(-9 * dt);
    const tgt = { fire: ovCry ? 0 : ovFire };
    const rest = 1 - tgt.fire;
    tgt.run = s * rest; tgt.idle = (1 - s) * rest;
    for (const key in tgt) {
      const t = tgt[key];
      this.w[key] += (t - this.w[key]) * (t > this.w[key] ? k : kOut);
      this.act[key].setEffectiveWeight(this.w[key]);
    }
    this.act.run.timeScale = 0.55 + (speed / CFG.move.maxSpeed) * 0.95;
    this.mixer.update(dt);

    // Respiração no idle, compressão ao ser atingido, inclinação na corrida
    const bob = (1 - s) * Math.sin(time * 3 + this.index) * 0.025;
    const sq = this.squash;
    this.model.scale.set(this.charScale * (1 + sq * 0.25), this.charScale * (1 - sq * 0.25 + bob), this.charScale * (1 + sq * 0.25));
    this.model.rotation.x = s * 0.12;
    this.model.rotation.z = 0; this.model.rotation.y = 0;
    if (this.stun > 0) {
      const d = Math.min(1, this.stun / this.stunMax); // 1 → 0 ao longo do atordoamento
      const kick = Math.sin(Math.min(1, (1 - d) * 3) * Math.PI / 2) * d + d * 0.3;
      this.model.rotation.x += this.tiltX * kick;
      this.model.rotation.z = this.tiltZ * kick + Math.sin(time * 26) * 0.07 * d;
      this.model.rotation.y = Math.sin(time * 9) * 0.25 * d;
      this.stars.visible = true;
      this.stars.children.forEach((st, i) => {
        const a = time * 7 + i * Math.PI * 2 / 3;
        st.position.set(Math.cos(a) * 0.55, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.55);
        st.material.opacity = 0.35 + 0.6 * d;
      });
    } else this.stars.visible = false;

    const e = this.hitFlash;
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(e * (0.12 + this.flashCol.r * 0.3), e * (0.12 + this.flashCol.g * 0.3), e * (0.12 + this.flashCol.b * 0.3)); // v0.5: clarão menor, na cor de quem acertou

    this.ring.material.opacity = this.cooldown > 0 ? 0.45 : 0.9;
    this.tag.material.opacity = this.stun > 0 ? 0.6 : 1;
    // v1.0.1: quem carrega o núcleo tem a etiqueta acima dele, para o brilho não esconder o nome
    this.tag.position.y = this.carrying ? 4.25 : 3.0;
  }
}
