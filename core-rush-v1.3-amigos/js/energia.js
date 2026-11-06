import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG } from './config.js';
import { glowTexture } from './assets.js';

// ===== v1.2 "ENERGIA": identidade visual da arena, impacto do combate e eventos da partida =====
// Módulo independente: o jogo da v1.0.1 continua igual por baixo; aqui só entra o que é novo.
const H = CFG.arenaHalf;
const _c = new THREE.Color(), _v = new THREE.Vector3();
const CIANO = new THREE.Color(0x5fe6ff), OURO = new THREE.Color(0xffc23a), QUENTE = new THREE.Color(0xff3d8b);
const SPAWNS = [[-9.5, 9.5], [9.5, 9.5], [9.5, -9.5], [-9.5, -9.5]];

// Eventos da partida (segundos decorridos). Cada um dura pouco e deixa a disputa mais intensa.
const AGENDA = [
  { t: 20, tipo: 'chuva' },
  { t: 42, tipo: 'super', dur: 12 },
  { t: 65, tipo: 'chuva' },
  { t: 90, tipo: 'final' },
];

export class Energia {
  constructor(game) {
    this.g = game; const s = game.scene;
    this.mult = 1; this.hot = 0; this.superT = 0; this.final = false; this.flashT = 0;
    this.col = CIANO.clone();
    this.stats = { eventos: [], orbes: {}, acertos: 0 };
    window.__stats = () => this.stats;
    this.ambiente(game);
    this.piso(s);
    this.barreira(s);
    this.horizonte(s);
    this.golpes(s);
    this.orbes(s);
    this.raios(s);
    this.aura(s);
    this.gradacao(game);
    this.hud();
  }

  // ---------- reflexos (ambiente) e luz mais viva ----------
  ambiente(game) {
    const pm = new THREE.PMREMGenerator(game.renderer);
    game.scene.environment = pm.fromScene(new RoomEnvironment(game.renderer), 0.04).texture;
    pm.dispose();
    game.scene.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial) { m.envMapIntensity = m.color && m.color.getHex() === 0x7d88b4 ? 0.0 : 0.35; m.needsUpdate = true; }
    });
    game.scene.fog.color.setHex(0x120a2e);
    game.bloom.strength = 0.62; game.bloom.threshold = 0.84; game.bloom.radius = 0.45;
  }

  // ---------- piso de energia: pulsos que saem do núcleo, cantos com a cor de cada time ----------
  piso(s) {
    const teams = this.g.fighters.map(f => new THREE.Color(f.color));
    this.floorU = {
      uT: { value: 0 }, uCore: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color(0x5fe6ff) },
      uHot: { value: 0 }, uFlash: { value: 0 }, uH: { value: H },
      uTeams: { value: teams }, uSpawns: { value: SPAWNS.map(([x, z]) => new THREE.Vector2(x, z)) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.floorU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `precision mediump float; varying vec2 vP;
        uniform float uT, uHot, uFlash, uH; uniform vec2 uCore; uniform vec3 uCol; uniform vec3 uTeams[4]; uniform vec2 uSpawns[4];
        float ln(vec2 p, float s, float w){ vec2 q = abs(fract(p/s + .5) - .5) * s; return 1. - smoothstep(0., w, min(q.x, q.y)); }
        void main(){
          vec2 p = vP; float d = length(p - uCore);
          float g = ln(p, 4., .06) * .7 + ln(p, 1., .02) * .14;
          float spd = mix(5., 10., uHot);
          float w = .5 + .5 * sin(d * 1.05 - uT * spd); w *= w; w *= w; w *= w * w; w *= 1. / (1. + d * .07);
          float near = 1. / (1. + d * d * .35);
          vec3 c = uCol * g * (.16 + w * 1.7 + near * 1.3) + uCol * near * .28 + uCol * w * .06;
          int qi = p.x < 0. ? (p.y > 0. ? 0 : 3) : (p.y > 0. ? 1 : 2);
          vec3 tc = qi == 0 ? uTeams[0] : qi == 1 ? uTeams[1] : qi == 2 ? uTeams[2] : uTeams[3];
          vec2 sp = qi == 0 ? uSpawns[0] : qi == 1 ? uSpawns[1] : qi == 2 ? uSpawns[2] : uSpawns[3];
          float s = length(p - sp); c += tc * (.22 + g * .3) / (1. + s * s * .12);
          float e = max(abs(p.x), abs(p.y));
          c += uCol * smoothstep(uH - 1.6, uH - .1, e) * (.3 + .2 * sin(uT * 3. + (p.x - p.y) * .35));
          c += vec3(1., .25, .55) * uHot * g * (.25 + .25 * sin(uT * 9. - d * .6));
          c += uCol * uFlash * (.35 + g * .8);
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1; s.add(m);
  }

  // ---------- barreira de energia nas bordas ----------
  barreira(s) {
    this.barU = { uT: { value: 0 }, uCol: { value: new THREE.Color(0x5fe6ff) }, uHot: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.barU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `precision mediump float; varying vec2 vU; uniform float uT, uHot; uniform vec3 uCol;
        void main(){
          float base = pow(1. - vU.y, 2.2);
          float hexa = step(.92, fract(vU.x * 44. + floor(vU.y * 6.) * .5)) * (1. - vU.y);
          float scan = pow(.5 + .5 * sin(vU.y * 14. - uT * (3. + uHot * 5.)), 6.) * (1. - vU.y);
          float a = base * .32 + hexa * .22 + scan * .18;
          gl_FragColor = vec4(uCol * a, 1.);
        }`,
    });
    const geo = new THREE.PlaneGeometry(H * 2, 2.2);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, w = new THREE.Mesh(geo, mat);
      w.position.set(Math.sin(a) * (H + 0.05), 1.1, Math.cos(a) * (H + 0.05)); w.rotation.y = a; w.renderOrder = 2; s.add(w);
    }
  }

  // ---------- profundidade: anéis de energia e torres em volta da plataforma ----------
  horizonte(s) {
    this.rings = [];
    for (const [r, y, c, w] of [[25, -2.2, 0x5fe6ff, 0.14], [30, -4.5, 0xff4fd2, 0.1], [36, -7.5, 0x7a5cff, 0.08]]) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 160), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.rotation.x = Math.PI / 2; m.position.y = y; s.add(m); this.rings.push(m);
    }
    const N = 14, tg = new THREE.BoxGeometry(0.8, 1, 0.8);
    const tm = new THREE.MeshStandardMaterial({ color: 0x1a1f45, metalness: 0.7, roughness: 0.35, emissive: 0x2a1060, emissiveIntensity: 0.6 });
    const torres = new THREE.InstancedMesh(tg, tm, N), luz = new Float32Array(N * 3), cores = new Float32Array(N * 3);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2 + 0.2, r = 23 + (i % 3) * 3.5, h = 6 + (i * 37 % 9);
      p.set(Math.sin(a) * r, -9 + h / 2, Math.cos(a) * r); sc.set(1, h, 1); M.compose(p, q, sc); torres.setMatrixAt(i, M);
      luz.set([p.x, -9 + h + 0.4, p.z], i * 3);
      _c.setHex([0x5fe6ff, 0xff4fd2, 0xffc23a][i % 3]); cores.set([_c.r, _c.g, _c.b], i * 3);
    }
    s.add(torres);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(luz, 3)); g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    this.luzes = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.add(this.luzes);
  }

  // ---------- golpe: lâmina de energia em arco + impacto ----------
  golpes(s) {
    const arc = THREE.MathUtils.degToRad(CFG.attack.arc + 10);
    const outer = new THREE.RingGeometry(0.72, 1, 40, 1, -Math.PI / 2 - arc / 2, arc);
    const inner = new THREE.RingGeometry(0.9, 1, 40, 1, -Math.PI / 2 - arc / 2 + 0.12, arc - 0.24);
    this.slashes = [];
    for (let i = 0; i < 8; i++) {
      const h = new THREE.Group(); h.visible = false; s.add(h);
      const a = new THREE.Mesh(outer, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const b = new THREE.Mesh(inner, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      a.rotation.x = b.rotation.x = -Math.PI / 2; b.position.y = 0.02; h.add(a, b);
      this.slashes.push({ h, a, b, t: 1 });
    }
    this.si = 0;
    const tex = glowTexture();
    this.stars = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false; s.add(sp); this.stars.push({ sp, t: 1 });
    }
    this.sti = 0;
    this.kick = new THREE.Vector2();
  }
  slash(f) {
    const S = this.slashes[this.si = (this.si + 1) % this.slashes.length];
    S.h.position.set(f.attackOrigin.x, 1.0, f.attackOrigin.z); S.h.rotation.y = f.facing;
    S.a.material.color.setHex(f.color); S.t = 0; S.h.visible = true;
    S.mine = f.isPlayer;
    this.g.audio.whoosh?.(f.isPlayer);
  }
  impact(o, att, dir, mine) {
    const St = this.stars[this.sti = (this.sti + 1) % this.stars.length];
    St.sp.position.set(o.pos.x - dir.x * 0.3, 1.2, o.pos.z - dir.z * 0.3); St.sp.material.color.setHex(att.color); St.t = 0; St.sp.visible = true;
    o.trailT = 0.32; o.trailCol = att.color;
    this.g.fx.wave(o.pos, 0xffffff, 3.6, 0.22); // onda branca rápida no chão
    this.g.fx.burst(_v.set(o.pos.x, 1.1, o.pos.z), 0xffffff, 8, 11, 0.25, 0.3, 2);
    this.stats.acertos++;
    if (mine) { this.kick.set(dir.x, dir.z).multiplyScalar(0.55); this.g.audio.thump?.(); }
    if (o.isPlayer) this.tela(0.55);
  }

  // ---------- orbes de energia (+3 pontos) ----------
  orbes(s) {
    const tex = glowTexture();
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    this.orbs = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.visible = false; s.add(g);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffb300, emissiveIntensity: 2.4, roughness: 0.25 }));
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc23a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      gl.scale.set(1.8, 1.8, 1);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      g.add(m, gl); s.add(ring); ring.visible = false;
      this.orbs.push({ g, m, ring, on: false, x: 0, z: 0, y: 0, vy: 0, life: 0 });
    }
  }
  orbsAtivos() { return this.orbs.filter(o => o.on && o.y < 1.6); }
  sortear() {
    const nav = this.g.nav, core = this.g.core.pos, pts = [];
    for (let tries = 0; tries < 200 && pts.length < 5; tries++) {
      const x = (Math.random() * 2 - 1) * 12.5, z = (Math.random() * 2 - 1) * 12.5;
      if (!nav.free(x, z) || Math.hypot(x - core.x, z - core.z) < 3) continue;
      if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 4.2)) continue;
      pts.push([+x.toFixed(2), +z.toFixed(2)]);
    }
    return pts;
  }
  chuva(pts) {
    pts.forEach(([x, z], i) => {
      const o = this.orbs[i]; Object.assign(o, { on: true, x, z, y: 11 + i * 1.5, vy: 0, life: 14 });
      o.g.visible = true; o.g.position.set(x, o.y, z); o.ring.visible = true; o.ring.position.set(x, 0.05, z);
    });
  }

  // ---------- raios do núcleo solto e aura do portador ----------
  raios(s) {
    this.arcs = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.frustumCulled = false; s.add(l); this.arcs.push(l);
    }
    this.arcT = 0;
  }
  aura(s) {
    this.auraM = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.55, 48), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    this.auraM.rotation.x = -Math.PI / 2; this.auraM.visible = false; s.add(this.auraM);
    const cg = new THREE.CylinderGeometry(0.9, 1.25, 2.6, 24, 1, true); cg.translate(0, 1.3, 0);
    this.auraC = new THREE.Mesh(cg, new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color() }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `precision mediump float; varying vec2 vU; uniform vec3 uCol; uniform float uT;
        void main(){ float a = pow(1. - vU.y, 2.) * (.35 + .25 * sin(vU.x * 37.7 + uT * 6.)); gl_FragColor = vec4(uCol * a, 1.); }`,
    }));
    this.auraC.visible = false; s.add(this.auraC);
  }

  // ---------- vinheta, clima da reta final e flash de dano (camada de página: custo zero na placa de vídeo) ----------
  gradacao(game) {
    const v = document.createElement('div'); v.id = 'vinheta';
    v.innerHTML = '<i class="hot"></i><i class="hit"></i>';
    document.getElementById('app').insertBefore(v, document.getElementById('hud'));
    const st = document.createElement('style');
    st.textContent = `#vinheta{position:absolute;inset:0;pointer-events:none;z-index:5;background:radial-gradient(ellipse at 50% 45%,transparent 52%,rgba(4,2,18,.55) 100%)}
      #vinheta i{position:absolute;inset:0;opacity:0}
      #vinheta .hot{background:radial-gradient(ellipse at 50% 45%,transparent 45%,rgba(255,40,120,.38) 100%)}
      #vinheta .hit{background:radial-gradient(ellipse at 50% 50%,transparent 35%,rgba(255,30,70,.6) 100%)}`;
    document.head.appendChild(st);
    this.vHot = v.querySelector('.hot'); this.vHit = v.querySelector('.hit');
    game.renderer.toneMappingExposure = 1.0;
  }
  tela(k) { this.hitT = Math.max(this.hitT || 0, k); }

  hud() {
    const box = document.getElementById('timerBox');
    this.tag = document.createElement('div'); this.tag.id = 'evTag'; box.appendChild(this.tag);
    const st = document.createElement('style');
    st.textContent = `#evTag{margin-top:6px;font:800 13px var(--display);letter-spacing:.14em;padding:5px 12px;border-radius:999px;
      background:rgba(255,194,58,.16);color:#ffd36a;border:1px solid rgba(255,194,58,.55);display:none;text-shadow:0 0 10px rgba(255,194,58,.8)}
      #evTag.on{display:inline-block;animation:evp .9s ease-in-out infinite alternate}
      #evTag.hot{background:rgba(255,61,139,.18);color:#ff8ab8;border-color:rgba(255,61,139,.6);text-shadow:0 0 10px rgba(255,61,139,.9)}
      @keyframes evp{from{transform:scale(1)}to{transform:scale(1.07)}}`;
    document.head.appendChild(st);
  }
  setTag(txt, hot) { const t = this.tag; if (t._txt === txt) return; t._txt = txt; t.textContent = txt; t.classList.toggle('on', !!txt); t.classList.toggle('hot', !!hot); }

  // ---------- partida ----------
  reset() {
    this.mult = 1; this.hot = 0; this.superT = 0; this.final = false; this.next = 0;
    this.stats = { eventos: [], orbes: {}, acertos: 0 };
    for (const o of this.orbs) { o.on = false; o.g.visible = false; o.ring.visible = false; }
    this.setTag('');
  }
  anunciar(txt, cor) {
    const g = this.g; g.showBanner(txt, cor, 1.6); this.flashT = 1; g.audio.evento?.();
    g.shake = Math.max(g.shake, 0.25);
  }
  partida(dt) { // chamado só durante a partida valendo
    const g = this.g, gasto = CFG.matchTime - g.matchTime;
    while (this.next < AGENDA.length && gasto >= AGENDA[this.next].t) {
      const e = AGENDA[this.next++];
      this.stats.eventos.push(e.tipo + '@' + Math.round(gasto));
      const pts = e.tipo === 'chuva' ? this.sortear() : null;
      this.evento(e.tipo, e.dur, pts);
      if (g.emit) g.emit('e', [e.tipo, e.dur || 0, pts]); // v1.3 online
    }
    this.relogio();
    // orbes: coleta
    for (const o of this.orbs) {
      if (!o.on || o.y > 1.6) continue;
      for (const f of g.fighters) {
        if (f.stun > 0) continue;
        if (Math.hypot(f.pos.x - o.x, f.pos.z - o.z) < 1.15) {
          f.score += 3; this.pegar(this.orbs.indexOf(o), f);
          if (g.emit) g.emit('o', [this.orbs.indexOf(o), f.index]);
          break;
        }
      }
    }
  }
  // v1.3: partes reutilizadas pelo convidado online
  evento(tipo, dur, pts) {
    if (tipo === 'chuva') { this.chuva(pts); this.anunciar('CHUVA DE ENERGIA! +3 POR ORBE', '#ffc23a'); }
    else if (tipo === 'super') { this.superT = dur; this.anunciar('NÚCLEO SUPERCARREGADO — VALE O DOBRO!', '#ffc23a'); }
    else if (tipo === 'final') { this.final = true; this.anunciar('RETA FINAL — PONTOS EM DOBRO!', '#ff3d8b'); }
  }
  pegar(i, f) {
    const g = this.g, o = this.orbs[i]; if (!o || !o.on) return;
    o.on = false; o.g.visible = false; o.ring.visible = false;
    g.floatText('+3', f, '#ffc23a'); this.stats.orbes[f.name] = (this.stats.orbes[f.name] || 0) + 1;
    g.fx.burst(_v.set(o.x, 1.0, o.z), 0xffc23a, 22, 8, 0.6, 0.5, 4); g.fx.wave(_v.set(o.x, 0, o.z), 0xffc23a, 2.2, 0.35);
    g.audio.orb?.(f.isPlayer);
  }
  relogio() {
    const g = this.g;
    if (this.superT > 0) this.superT = Math.max(0, this.superT - g.rawDt);
    this.mult = (this.superT > 0 || this.final) ? 2 : 1;
    if (this.final) this.setTag('RETA FINAL ×2', true);
    else if (this.superT > 0) this.setTag(`SUPERCARGA ×2 · ${Math.ceil(this.superT)}`);
    else this.setTag('');
  }

  // ---------- quadro a quadro (menu e partida) ----------
  update(dt, time) {
    const g = this.g, core = g.core, play = g.state === 'play' || g.state === 'countdown' || g.state === 'paused' || g.state === 'end';
    if (!play && g.state !== 'end') { this.final = false; this.superT = 0; }
    this.hot += ((this.final ? 1 : 0) - this.hot) * Math.min(1, dt * 2);
    const sup = this.superT > 0;
    // cor da arena: ciano com núcleo livre, cor do portador quando alguém segura, ouro na supercarga, quente na reta final
    if (sup) _c.copy(OURO); else if (core.carrier) _c.setHex(core.carrier.color).lerp(CIANO, 0.25); else _c.copy(CIANO);
    if (this.hot > 0.01) _c.lerp(QUENTE, this.hot * 0.55);
    this.col.lerp(_c, Math.min(1, dt * 4));
    this.flashT = Math.max(0, this.flashT - dt * 1.6);
    const U = this.floorU;
    U.uT.value = time; U.uCore.value.set(core.group.position.x, core.group.position.z); U.uCol.value.copy(this.col);
    U.uHot.value = this.hot; U.uFlash.value = this.flashT;
    this.barU.uT.value = time; this.barU.uCol.value.copy(this.col); this.barU.uHot.value = this.hot;
    this.rings.forEach((r, i) => { r.rotation.z = time * (0.05 + i * 0.03) * (i % 2 ? -1 : 1); r.material.opacity = 0.55 + 0.25 * Math.sin(time * 1.3 + i); });
    this.luzes.material.size = 2.4 + Math.sin(time * 2) * 0.4;

    // núcleo supercarregado: dourado e maior
    core.inner.material.emissive.setHex(sup ? 0xffd27a : 0xc9fbff);
    core.glow.scale.setScalar(sup ? 2.5 + Math.sin(time * 10) * 0.2 : core.carrier ? 1.35 : 2.0); // carregado: menos ofuscante sobre o combate
    core.light.intensity = core.carrier ? 9 : 14;
    if (sup) { core.shell.material.color.copy(OURO); core.glow.material.color.copy(OURO); core.light.color.copy(OURO); core.beam.material.color.copy(OURO); }

    // raios do núcleo solto
    const free = core.state !== 'carried';
    this.arcT -= dt;
    for (const l of this.arcs) l.visible = free;
    if (free && this.arcT <= 0) {
      this.arcT = 0.06;
      const cp = core.group.position;
      for (const l of this.arcs) {
        const a = l.geometry.attributes.position, ang = Math.random() * 6.28, r = 0.8 + Math.random() * 1.2;
        const ex = cp.x + Math.sin(ang) * r, ez = cp.z + Math.cos(ang) * r;
        for (let k = 0; k < 8; k++) {
          const u = k / 7, j = (k === 0 || k === 7) ? 0 : 0.18;
          a.setXYZ(k, cp.x + (ex - cp.x) * u + (Math.random() - 0.5) * j, cp.y * (1 - u) + 0.05 + (Math.random() - 0.5) * j, cp.z + (ez - cp.z) * u + (Math.random() - 0.5) * j);
        }
        a.needsUpdate = true; l.material.color.copy(sup ? OURO : this.col).lerp(_c.setHex(0xffffff), 0.5);
      }
    }
    // aura do portador
    const c = core.carrier;
    this.auraM.visible = this.auraC.visible = !!c;
    if (c) {
      const k = 1 + Math.sin(time * 7) * 0.08;
      this.auraM.position.set(c.pos.x, 0.06, c.pos.z); this.auraM.scale.setScalar(k); this.auraM.material.color.copy(sup ? OURO : _c.setHex(c.color));
      this.auraC.position.set(c.pos.x, 0, c.pos.z); this.auraC.material.uniforms.uCol.value.copy(sup ? OURO : _c.setHex(c.color)); this.auraC.material.uniforms.uT.value = time;
    }

    // lâminas e estrelas de impacto
    for (const S of this.slashes) {
      if (S.t >= 1) continue;
      S.t = Math.min(1, S.t + dt / 0.19);
      const e = 1 - Math.pow(1 - S.t, 3), sc = 0.7 + e * (CFG.attack.range + 0.2);
      S.h.scale.set(sc, sc, sc);
      S.a.material.opacity = (1 - S.t) * 0.95; S.b.material.opacity = (1 - S.t) * 0.9;
      if (S.t >= 1) S.h.visible = false;
    }
    for (const St of this.stars) {
      if (St.t >= 1) continue;
      St.t = Math.min(1, St.t + dt / 0.18);
      const sc = 1.6 + Math.sqrt(St.t) * 4.6; St.sp.scale.set(sc, sc, 1); St.sp.material.opacity = (1 - St.t) * 1.0;
      if (St.t >= 1) St.sp.visible = false;
    }
    // rastro de quem foi arremessado
    for (const f of g.fighters) {
      if (!(f.trailT > 0)) continue;
      f.trailT -= dt;
      f.trailN = (f.trailN || 0) + 1; if (f.trailN % 2 === 0) g.fx.burst(_v.set(f.pos.x, 0.5 + Math.random() * 0.8, f.pos.z), f.trailCol || 0xffffff, 1, 1.2, 0.3, 0.55, 0.5);
    }
    // orbes: queda e brilho
    for (const o of this.orbs) {
      if (!o.on) continue;
      o.life -= dt;
      if (o.life <= 0) { o.on = false; o.g.visible = false; o.ring.visible = false; g.fx.burst(_v.set(o.x, 1, o.z), 0xffc23a, 8, 3, 0.4, 0.3, 2); continue; }
      if (o.y > 1.0) { o.vy -= 22 * dt; o.y = Math.max(1.0, o.y + o.vy * dt); if (o.y === 1.0) { g.fx.wave(_v.set(o.x, 0, o.z), 0xffc23a, 1.8, 0.3); g.fx.burst(_v.set(o.x, 0.6, o.z), 0xffc23a, 10, 5, 0.4, 0.35, 3); } }
      const bob = o.y <= 1.0 ? Math.sin(time * 3 + o.x) * 0.12 : 0;
      o.g.position.set(o.x, o.y + bob, o.z); o.m.rotation.y = time * 2.5; o.m.rotation.x = time * 1.3;
      o.ring.material.opacity = (o.life < 3 ? (Math.sin(time * 18) > 0 ? 0.8 : 0.2) : 0.6) * (o.y > 1.6 ? 0.5 : 1);
      o.ring.scale.setScalar(o.y > 1.6 ? 1.4 - Math.min(1, (o.y - 1.6) / 9) * 0.6 : 1 + Math.sin(time * 5) * 0.08);
      o.g.visible = !(o.life < 3 && Math.sin(time * 18) < -0.6);
    }
    // tela: flash vermelho quando o jogador é atingido; tranco de câmera
    this.hitT = Math.max(0, (this.hitT || 0) - dt * 3);
    const ho = (this.hot * (0.6 + 0.4 * Math.sin(time * 6))).toFixed(2), hi = this.hitT.toFixed(2);
    if (ho !== this._ho) { this._ho = ho; this.vHot.style.opacity = ho; }
    if (hi !== this._hi) { this._hi = hi; this.vHit.style.opacity = hi; }
    this.kick.multiplyScalar(Math.exp(-14 * dt));
  }
}
