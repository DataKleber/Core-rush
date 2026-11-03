import * as THREE from 'three';
import { CFG } from './config.js';
import { assets, prop, glowTexture } from './assets.js';

const _fm = new Map();
// Escurece e esfria o piso para os personagens se destacarem
function floorMat(src) {
  if (!_fm.has(src)) { const m = src.clone(); m.color = new THREE.Color(0x7d88b4); _fm.set(src, m); }
  return _fm.get(src);
}

// Monta a arena e devolve os colisores (círculos e caixas no plano XZ)
export function buildArena(scene) {
  const H = CFG.arenaHalf;
  const colliders = { circles: [], boxes: [] };
  const g = new THREE.Group(); scene.add(g);
  const animated = [];

  // Fundo espacial numa esfera grande
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.MeshBasicMaterial({ map: assets.bg, side: THREE.BackSide, color: 0x9aa6d8, fog: false })
  );
  sky.rotation.y = 1.2;
  g.add(sky);

  // Piso em ladrilhos 4x4
  const T = 4, n = (H * 2) / T;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
    const mid = (i === n / 2 - 1 || i === n / 2) && (j === n / 2 - 1 || j === n / 2);
    const name = edge || mid ? 'piso-faixa' : 'piso';
    const t = prop(name, T * 1.02, 1, T * 1.02, false);
    t.traverse(m => { if (m.isMesh) { m.material = floorMat(m.material); } });
    t.position.set(-H + T / 2 + i * T, -0.29, -H + T / 2 + j * T);
    t.rotation.y = ((i + j) % 4) * Math.PI / 2;
    g.add(t);
  }

  // Base flutuante da plataforma
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(H * 2 + 0.6, 2.4, H * 2 + 0.6),
    new THREE.MeshStandardMaterial({ color: 0x141a33, metalness: 0.6, roughness: 0.45 })
  );
  base.position.y = -1.5; base.receiveShadow = true; g.add(base);
  const under = new THREE.Mesh(
    new THREE.CylinderGeometry(H * 0.9, 2, 7, 8, 1),
    new THREE.MeshStandardMaterial({ color: 0x0d1126, metalness: 0.5, roughness: 0.6 })
  );
  under.position.y = -6.2; under.rotation.y = Math.PI / 8; g.add(under);

  // Faixas de neon nas bordas
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x5fe6ff });
  const neonGeo = new THREE.BoxGeometry(H * 2 + 0.7, 0.08, 0.08);
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Mesh(neonGeo, neonMat);
    const a = (k * Math.PI) / 2;
    s.position.set(Math.sin(a) * (H + 0.32), -0.32, Math.cos(a) * (H + 0.32));
    s.rotation.y = a; g.add(s);
  }

  // Grades nas bordas (só visual; o limite da arena é calculado)
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    for (let s = -H + T / 2; s < H; s += T) {
      const f = prop('grade', T, 2.6, 2.4);
      const dx = Math.cos(a), dz = -Math.sin(a);
      f.position.set(Math.sin(a) * (H - 0.15) + dx * s, 0, Math.cos(a) * (H - 0.15) + dz * s);
      f.rotation.y = a;
      g.add(f);
    }
  }

  // Disco central: ponto de aparição do núcleo
  const pad = prop('disco', 3.6, 1.2, 3.6, false);
  pad.position.y = -0.22; g.add(pad);
  const padRing = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.35, 64),
    new THREE.MeshBasicMaterial({ color: 0x8ff3ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  padRing.rotation.x = -Math.PI / 2; padRing.position.y = 0.04; g.add(padRing);
  animated.push(t => { padRing.material.opacity = 0.35 + Math.sin(t * 2) * 0.2; });

  const glowTex = glowTexture();
  // v1.0 — Arena B: praça central, corredores laterais e faixas de cobertura (a arena da v0.9 está no backup)
  const neon = new THREE.MeshBasicMaterial({ color: 0x5fe6ff });
  const block = (x, z, w, d) => { const c = prop('caixa', w / 0.96, 1.35, d); c.position.set(x, 0, z); g.add(c); };
  const wall = (x, z, hx, hz) => {
    colliders.boxes.push({ x, z, hx, hz });
    const alongX = hx > hz, len = 2 * Math.max(hx, hz), n = Math.max(1, Math.round(len / 1.9)), seg = len / n;
    for (let i = 0; i < n; i++) { const o = -len / 2 + seg * (i + 0.5); if (alongX) block(x + o, z, seg, hz * 2); else block(x, z + o, hx * 2, seg); }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len), neon);
    cap.position.set(x, 1.24, z); g.add(cap);
  };
  const cover = (x, z, s) => { const c = prop('caixa', s, s * 0.95, s); c.position.set(x, 0, z); g.add(c); colliders.boxes.push({ x, z, hx: s * 0.48, hz: s * 0.5 }); };
  // muros que formam os corredores laterais (leste/oeste)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wall(9.3 * sx, 3.6 * sz, 0.45, 1.8); // muro com passagem no meio
  // muros norte/sul com passagem central de 3,6
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wall(3.6 * sx, 9.3 * sz, 1.8, 0.45);
  // uma cobertura por corredor, encostada na borda
  cover(14.3, 0, 1.4); cover(-14.3, 0, 1.4);
  // faixas norte/sul: caixas encostadas na borda e um reator ao fundo
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cover(7.5 * sx, 13.9 * sz, 1.9);
  for (const z of [13.8, -13.8]) {
    const r = prop('reator', 2.7, 2.6, 2.7); r.position.set(0, 0, z); g.add(r);
    colliders.circles.push({ x: 0, z, r: 0.88 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    sp.scale.set(3.4, 3.4, 1); sp.position.set(0, 1.6, z); g.add(sp);
    const ph = Math.random() * 6;
    animated.push(t => { sp.material.opacity = 0.35 + Math.sin(t * 1.7 + ph) * 0.15; });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = prop('poste', 2.4, 3.6, 2.4); const x = 13.4 * sx, z = 13.4 * sz;
    p.position.set(x, 0, z); g.add(p); colliders.circles.push({ x, z, r: 0.75 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd58a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    sp.scale.set(3, 3, 1); sp.position.set(x, 3.5, z); g.add(sp);
  }

  // Poeira de energia flutuando
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = Math.random() * 14 - 4;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.18, map: glowTex, color: 0x9fdcff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(dust);
  animated.push((t) => { dust.rotation.y = t * 0.012; dust.position.y = Math.sin(t * 0.3) * 0.4; });

  return { group: g, colliders, update: t => animated.forEach(f => f(t)) };
}

// Empurra um círculo para fora dos obstáculos e dos limites. Retorna true se colidiu.
export function collideCircle(p, r, vel, colliders, bounce = 0) {
  const H = CFG.arenaHalf - 0.5;
  let hit = false;
  const lim = H - r;
  if (p.x > lim) { p.x = lim; if (vel && vel.x > 0) vel.x *= -bounce; hit = true; }
  if (p.x < -lim) { p.x = -lim; if (vel && vel.x < 0) vel.x *= -bounce; hit = true; }
  if (p.z > lim) { p.z = lim; if (vel && vel.z > 0) vel.z *= -bounce; hit = true; }
  if (p.z < -lim) { p.z = -lim; if (vel && vel.z < 0) vel.z *= -bounce; hit = true; }

  for (const c of colliders.circles) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-5) { pushOut(p, vel, dx / d, dz / d, m - d, bounce); hit = true; }
  }
  for (const b of colliders.boxes) {
    const cx = Math.max(b.x - b.hx, Math.min(p.x, b.x + b.hx));
    const cz = Math.max(b.z - b.hz, Math.min(p.z, b.z + b.hz));
    let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 1e-5) { // centro dentro da caixa
        const ox = b.hx - Math.abs(p.x - b.x), oz = b.hz - Math.abs(p.z - b.z);
        if (ox < oz) { dx = Math.sign(p.x - b.x) || 1; dz = 0; d = 0; pushOut(p, vel, dx, 0, ox + r, bounce); }
        else { dz = Math.sign(p.z - b.z) || 1; dx = 0; pushOut(p, vel, 0, dz, oz + r, bounce); }
      } else pushOut(p, vel, dx / d, dz / d, r - d, bounce);
      hit = true;
    }
  }
  return hit;
}

function pushOut(p, vel, nx, nz, depth, bounce) {
  p.x += nx * depth; p.z += nz * depth;
  if (vel) {
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) { vel.x -= (1 + bounce) * vn * nx; vel.z -= (1 + bounce) * vn * nz; }
  }
}

// true se o segmento A→B cruza um reator, poste ou caixa (usado para o ataque não atravessar obstáculos)
export function segmentBlocked(ax, az, bx, bz, colliders) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-6;
  for (const c of colliders.circles) {
    const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / len2));
    if (Math.hypot(ax + dx * t - c.x, az + dz * t - c.z) < c.r) return true;
  }
  for (const b of colliders.boxes) {
    // teste de "fatias" (slab) do segmento contra a caixa alinhada aos eixos
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, dx, b.x - b.hx, b.x + b.hx], [az, dz, b.z - b.hz, b.z + b.hz]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let u0 = (lo - p) / d, u1 = (hi - p) / d;
      if (u0 > u1) [u0, u1] = [u1, u0];
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) break;
    }
    if (t0 <= t1) return true;
  }
  return false;
}
