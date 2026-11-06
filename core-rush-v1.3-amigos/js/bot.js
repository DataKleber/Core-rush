import * as THREE from 'three';
import { CFG } from './config.js';

const _s = new THREE.Vector2();

// v0.8: memória curta do que aconteceu na arena, compartilhada pelos bots (um registro por quadro)
const perception = { hist: [], lastT: -1 };
function record(game) {
  const t = game.time;
  if (t === perception.lastT) return;
  // houve um intervalo sem simulação (contagem, pausa, menu): começa uma memória nova
  if (perception.hist.length && t - perception.lastT > 0.2) perception.hist.length = 0;
  perception.lastT = t;
  const c = game.core;
  perception.hist.push({
    t,
    fs: game.fighters.map(o => ({ o, x: o.pos.x, z: o.pos.z, vx: o.vel.x, vz: o.vel.z, stun: o.stun, carrying: o.carrying, shield: o.shield, invuln: o.invuln })),
    core: { x: c.pos.x, y: c.pos.y, z: c.pos.z, state: c.state, carrier: c.carrier },
  });
  const delay = CFG.ai.perceptionDelay;
  while (perception.hist.length > 2 && perception.hist[1].t <= t - delay) perception.hist.shift();
}
// Monta a visão atrasada da partida para um bot: ele sabe onde ele mesmo está agora,
// mas vê os outros e o núcleo como estavam há "perceptionDelay" segundos.
function perceived(game, self) {
  if (!(CFG.ai.perceptionDelay > 0) || !perception.hist.length) return game;
  const s = perception.hist[0], map = new Map();
  const fighters = s.fs.map(q => {
    if (q.o === self) return self;
    const fo = { pos: { x: q.x, z: q.z }, vel: { x: q.vx, z: q.vz }, stun: q.stun, carrying: q.carrying, shield: q.shield, invuln: q.invuln, radius: q.o.radius };
    map.set(q.o, fo); return fo;
  });
  const car = s.core.carrier === self ? self : (s.core.carrier ? map.get(s.core.carrier) : null);
  return {
    fighters, nav: game.nav, arena: game.arena, time: game.time,
    // sem velocidade: o bot não prevê para onde o núcleo vai voar
    core: { pos: { x: s.core.x, y: s.core.y, z: s.core.z }, vel: { x: 0, y: 0, z: 0 }, state: s.core.state, carrier: car },
  };
}

// IA dos bots: decide com atraso de reação (como um humano) e escreve no mesmo input do jogador
export class BotBrain {
  constructor(f, persona) {
    this.f = f;
    this.p = Object.assign({ reaction: 0.22, accuracy: 0.7, aggression: 0.8, flank: 0 }, persona);
    this.think = Math.random() * 0.2;
    this.dir = new THREE.Vector2();
    this.wantAttack = false;
    this.seed = Math.random() * 100;
  }

  update(dt, game) {
    const f = this.f;
    record(game);
    this.real = game; // v1.2: orbes de energia são vistos na hora (objetos parados, fáceis de ler)
    this.think -= dt;
    if (this.think <= 0) {
      this.think = this.p.reaction * (0.7 + Math.random() * 0.6);
      this.decide(perceived(game, f)); // v0.8: decide pelo que "viu", não pelo estado exato
    }
    // vira na direção desejada de forma suave (o input é que é atrasado, não o corpo)
    f.moveInput.lerp(this.dir, 1 - Math.exp(-14 * dt));
    if (this.wantAttack && f.tryAttack(game)) this.wantAttack = false;
  }

  decide(game) {
    const f = this.f, core = game.core, H = CFG.arenaHalf;
    if (f.stun > 0) { this.dir.set(0, 0); this.wantAttack = false; return; }
    const me = f.pos;
    let tx = 0, tz = 0, mode;
    let target = null;

    if (core.carrier === f) mode = 'flee';
    else if (core.carrier) { mode = 'chase'; target = core.carrier; }
    else mode = 'seek';

    const nav = game.nav;
    let dist = 0;
    if (mode === 'seek' || mode === 'chase') {
      let px, pz;
      if (mode === 'seek') {
        const lead = core.state === 'flying' ? 0.35 : 0;
        px = core.pos.x + core.vel.x * lead; pz = core.pos.z + core.vel.z * lead;
      } else {
        const d = Math.hypot(target.pos.x - me.x, target.pos.z - me.z);
        const pred = Math.min(d / (CFG.move.maxSpeed * 1.4), 0.55);
        px = target.pos.x + target.vel.x * pred; pz = target.pos.z + target.vel.z * pred;
        // cerco: cada bot aborda por um lado diferente enquanto está longe
        if (d > 4.5 && this.p.flank) {
          const ax = px - me.x, az = pz - me.z, s = this.p.flank * Math.min(1, (d - 4.5) / 6) * 0.25;
          const fx = px - az * s, fz = pz + ax * s;
          if (nav.free(fx, fz)) { px = fx; pz = fz; }
        }
      }
      dist = Math.hypot(px - me.x, pz - me.z);
      // v1.2: orbe de energia próximo vale o desvio quando o núcleo está longe (ou com outro jogador longe)
      const orbs = this.real && this.real.energia ? this.real.energia.orbsAtivos() : [];
      let ob = null, od = 7.5;
      for (const o of orbs) { const d2 = Math.hypot(o.x - me.x, o.z - me.z); if (d2 < od) { od = d2; ob = o; } }
      if (ob && (od < dist * 0.7 || (mode === 'chase' && dist > 6))) { px = ob.x; pz = ob.z; dist = od; mode = 'orb'; }
      nav.steer(me.x, me.z, px, pz, _s);
      tx = _s.x; tz = _s.y;
    } else {
      // fuga: afasta das ameaças, evita cantos e prefere direções com espaço livre
      let ax = 0, az = 0;
      for (const o of game.fighters) {
        if (o === f) continue;
        const dx = me.x - o.pos.x, dz = me.z - o.pos.z, d2 = Math.max(dx * dx + dz * dz, 0.5);
        const w = (o.stun > 0 ? 0.3 : 1) / d2;
        ax += dx * w; az += dz * w;
      }
      const l0 = Math.hypot(ax, az) || 1; ax /= l0; az /= l0;
      const edge = H - 6;
      if (Math.abs(me.x) > edge) ax -= Math.sign(me.x) * (Math.abs(me.x) - edge) * 0.35;
      if (Math.abs(me.z) > edge) az -= Math.sign(me.z) * (Math.abs(me.z) - edge) * 0.35;
      const t = game.time + this.seed;
      ax += Math.sin(t * 0.9) * 0.3; az += Math.cos(t * 1.1) * 0.3;
      let best = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
        const free = nav.clearance(me.x, me.z, dx, dz, 5);
        const sc = (dx * ax + dz * az) * 1.6 + free * 0.35 + (dx * this.dir.x + dz * this.dir.y) * 0.4;
        if (sc > best) { best = sc; tx = dx; tz = dz; }
      }
      dist = 99;
    }
    const l = Math.hypot(tx, tz);
    if (l > 1e-4) { tx /= l; tz /= l; }

    // perto do alvo, desacelera para não passar direto
    let mag = 1;
    if (mode === 'seek' && dist < 1.2) mag = 0.6;
    if (mode === 'chase' && dist < 1.7) mag = 0.35;
    this.dir.set(tx * mag, tz * mag);

    // decisão de ataque
    this.wantAttack = false;
    if (f.cooldown > 0 || f.attackPhase !== 'none') return;
    for (const o of game.fighters) {
      if (o === f || o.invuln > 0) continue;
      const dx = o.pos.x - me.x, dz = o.pos.z - me.z, d = Math.hypot(dx, dz);
      if (d > CFG.attack.range + 0.15) continue;
      let want = 0;
      if (o.carrying && o.shield <= 0) want = 1;
      else if (mode === 'seek') want = 0.45 * this.p.aggression;
      else if (mode === 'flee') want = 0.5;
      else want = 0.12 * this.p.aggression;
      // precisa estar mais ou menos de frente (o bot vira, mas não instantaneamente)
      const fx = Math.sin(f.facing), fz = Math.cos(f.facing);
      const facingOk = (dx * fx + dz * fz) / (d || 1) > 0.55 || d < 1.3;
      if (!facingOk) { if (want >= 1) this.dir.set(dx / d, dz / d); continue; }
      if (Math.random() < want * this.p.accuracy) {
        this.wantAttack = true;
        f.moveInput.set(dx / d, dz / d); // mira no alvo
        break;
      }
    }
  }
}
