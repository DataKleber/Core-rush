import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG, ROSTER } from './config.js';
import { loadAll } from './assets.js';
import { buildArena, collideCircle, segmentBlocked } from './arena.js';
import { Fighter } from './fighter.js';
import { Core } from './core.js';
import { BotBrain } from './bot.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Nav } from './nav.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTERS, prepareCharacters, getCharacter, applyLook } from './characters.js';

const $ = id => document.getElementById(id);
const SPAWNS = [[-9.5, 9.5], [9.5, 9.5], [9.5, -9.5], [-9.5, -9.5]];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mv = new THREE.Vector2();

class Game {
  async init() {
    this.mobile = matchMedia('(pointer: coarse)').matches;
    if (this.mobile) document.body.classList.add('touch');
    this.setupRenderer();
    this.input = new Input();
    this.input.onPause = () => this.togglePause();
    this.audio = new Audio();

    await loadAll(p => { $('loadBar').style.transform = `scaleX(${p})`; });
    prepareCharacters();

    this.arena = buildArena(this.scene);
    this.nav = new Nav(this.arena.colliders);
    this.fx = new FX(this.scene);
    this.core = new Core(this.scene);
    // v0.4: sinal discreto onde o núcleo pousa, seja quem for que o derrubou
    this.core.onLand = p => this.fx.wave(p, 0xbff6ff, 2.2, 0.5);
    this.fighters = ROSTER.map((def, i) => new Fighter(this.scene, def, i));
    this.player = this.fighters[0];
    this.brains = this.fighters.map(f => new BotBrain(f, f.isPlayer ? { reaction: 0.22, accuracy: 0.7, aggression: 0.8, flank: 0.5 } : f.def));
    // v0.9: personagem do jogador (lembrado entre visitas) e personagens diferentes para os bots
    this.playerChar = 'abelha';
    try { const c = localStorage.getItem('cl_char'); if (CHARACTERS.some(x => x.id === c)) this.playerChar = c; } catch (e) {}
    this.assignCharacters();
    this.buildBoard();
    this.buildSelect();
    this.bindUI();

    this.time = 0; this.hitstop = 0; this.shake = 0;
    this.resetMatch();
    this.state = 'menu';
    $('loading').hidden = true; $('menu').hidden = false;
    this.setupFps();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupRenderer() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    $('game').appendChild(r.domElement);

    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0x0a0d22, 45, 110);
    s.add(new THREE.HemisphereLight(0xc4dcff, 0x2a1d45, 1.5));
    const d = new THREE.DirectionalLight(0xfff4e6, 2.6);
    d.position.set(9, 26, 12);
    d.castShadow = true;
    const sz = this.mobile ? 1024 : 2048;
    d.shadow.mapSize.set(sz, sz);
    Object.assign(d.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 60 });
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.03;
    s.add(d);
    const rim = new THREE.DirectionalLight(0x7a5cff, 0.9); rim.position.set(-14, 8, -16); s.add(rim);

    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, innerWidth / innerHeight, 0.5, 400);
    this.camTarget = new THREE.Vector3();
    this.camera.position.set(0, CFG.camera.height, CFG.camera.back);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // em telas em pé, abre o campo de visão para enxergar a disputa
    this.camera.fov = w < h ? 56 : CFG.camera.fov;
    this.camMul = w < h ? 1.3 : 1;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Partida ----------
  resetMatch() {
    this.lastDropper = null;
    if (this.fps) this.fps.resetMatch();
    this.fighters.forEach((f, i) => {
      const [x, z] = SPAWNS[i];
      f.reset(_a.set(x, 0, z), Math.atan2(-x, -z));
      f.lastWhole = 0;
    });
    this.core.reset();
    this.matchTime = CFG.matchTime;
    this.lastSecond = Math.ceil(this.matchTime);
  }

  // v0.9: o jogador usa o escolhido; os 3 bots sorteiam entre os outros 4, todos diferentes
  assignCharacters() {
    this.player.setCharacter(this.playerChar);
    const rest = CHARACTERS.map(c => c.id).filter(id => id !== this.playerChar);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    this.fighters.filter(f => !f.isPlayer).forEach((f, i) => f.setCharacter(rest[i]));
  }

  // ---------- Seleção de personagens (simples) ----------
  buildSelect() {
    const thumbs = this.makeThumbs();
    $('charGrid').innerHTML = CHARACTERS.map(c => `
      <button class="pick" data-id="${c.id}" aria-pressed="false">
        <img src="${thumbs[c.id]}" alt="" width="120" height="144"><span>${c.name}</span>
      </button>`).join('');
    $('charGrid').querySelectorAll('.pick').forEach(b => b.onclick = () => { this.chooseChar(b.dataset.id); this.audio.click(); });
    this.chooseChar(this.playerChar);
  }
  chooseChar(id) {
    this.playerChar = id;
    try { localStorage.setItem('cl_char', id); } catch (e) {}
    $('charGrid').querySelectorAll('.pick').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('charName').textContent = getCharacter(id).name;
  }
  openSelect() {
    this.audio.unlock();
    $('menu').hidden = true; $('select').hidden = false;
    const cur = $('charGrid').querySelector('.pick.on'); if (cur) cur.focus();
  }
  // retratos gerados uma vez, na pose base de cada personagem
  makeThumbs() {
    const out = {};
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(240, 288); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xc4dcff, 0x2a1d45, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 4, 5); s.add(d);
    const cam = new THREE.PerspectiveCamera(30, 240 / 288, 0.1, 50);
    for (const c of CHARACTERS) {
      const ch = getCharacter(c.id);
      const m = SkeletonUtils.clone(ch.gltf.scene);
      m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); applyLook(o.material, ch.look); o.frustumCulled = false; } });
      m.scale.setScalar(ch.scale); m.position.y = ch.offsetY; m.rotation.y = -0.45;
      const mx = new THREE.AnimationMixer(m); mx.clipAction(ch.clips.idle).play(); mx.update(0);
      s.add(m);
      cam.position.set(0, ch.refHeight * 0.62, 5.6); cam.lookAt(0, ch.refHeight * 0.5, 0);
      r.render(s, cam);
      out[c.id] = r.domElement.toDataURL('image/png');
      s.remove(m);
    }
    r.dispose(); r.forceContextLoss();
    return out;
  }

  startMatch() {
    this.audio.unlock();
    this.assignCharacters();
    this.audio.stopLong(); this.audio.setTrack('game');
    this.finalBuildOn = false;
    this.resetMatch();
    this.state = 'countdown'; this.countdown = 3.999; this.lastCount = 4;
    for (const id of ['menu', 'select', 'results', 'pause']) $(id).hidden = true;
    $('hud').hidden = false;
    this.snapCamera();
  }

  endMatch() {
    this.state = 'end';
    this.player.moveInput.set(0, 0);
    const ranked = [...this.fighters].sort((a, b) => b.score - a.score);
    const top = Math.floor(ranked[0].score);
    const winners = ranked.filter(f => Math.floor(f.score) === top);
    const win = winners.includes(this.player);
    $('resTitle').textContent = winners.length > 1 ? 'EMPATE NA LUZ' : win ? 'VOCÊ VENCEU!' : `${winners[0].name} VENCEU`;
    $('resTitle').style.color = winners.length > 1 ? '' : hex(winners[0].color);
    $('resSub').textContent = win ? 'Você segurou o núcleo mais tempo que todos.' : 'Na próxima, corte caminho pelas caixas e ataque o portador de lado.';
    $('resList').innerHTML = ranked.map((f, i) => `
      <li class="${f.isPlayer ? 'me' : ''}" style="--c:${hex(f.color)}">
        <span class="pos">${i + 1}º</span><span class="dot"></span><span class="nm">${f.name}</span>
        <span class="pts">${Math.floor(f.score)} pts</span>
      </li>`).join('');
    this.audio.end(win);
    setTimeout(() => { if (this.state === 'end') { $('hud').hidden = true; $('results').hidden = false; } }, 1300);
    this.showBanner('FIM DE PARTIDA', '#ffffff', 1.3);
  }

  togglePause() {
    if (this.state === 'play' || this.state === 'countdown') { this.prevState = this.state; this.state = 'paused'; $('pause').hidden = false; this.audio.stopLong(); }
    else if (this.state === 'paused') { this.state = this.prevState; $('pause').hidden = true; }
  }

  toMenu() {
    this.audio.stopLong(); this.audio.setTrack('menu');
    this.resetMatch();
    this.state = 'menu';
    for (const id of ['results', 'pause', 'hud', 'select']) $(id).hidden = true;
    $('menu').hidden = false;
  }

  // ---------- Combate ----------
  resolveHits(att) {
    const A = CFG.attack;
    const fx = Math.sin(att.facing), fz = Math.cos(att.facing);
    const cosArc = Math.cos(THREE.MathUtils.degToRad(A.arc / 2));
    for (const o of this.fighters) {
      if (o === att || att.hitSet.has(o) || o.invuln > 0) continue;
      const org = att.attackOrigin;
      const dx = o.pos.x - org.x, dz = o.pos.z - org.z, d = Math.hypot(dx, dz);
      if (d > A.range + o.radius) continue;
      if (d > 0.7 && (dx * fx + dz * fz) / d < cosArc) continue;
      if (segmentBlocked(org.x, org.z, o.pos.x, o.pos.z, this.arena.colliders)) continue; // obstáculo no meio
      att.hitSet.add(o);
      const dir = d > 0.01 ? _b.set(dx / d, 0, dz / d) : _b.set(fx, 0, fz);
      const mine = att.isPlayer || o.isPlayer;
      if (o.shield > 0) {
        o.vel.addScaledVector(dir, 4);
        this.fx.wave(o.pos, 0xbff6ff, 2.4, 0.3);
        this.audio.blocked();
        continue;
      }
      o.takeHit(att, dir, this);
      const hp = _a.copy(o.pos).setY(1.1);
      // v0.5: impacto com direção — clarão no ponto de contato e faíscas saindo para trás do alvo
      this.fx.flash(hp, 0xffffff, 1.5, 0.08);
      this.fx.flash(hp, att.color, 1.6, 0.16);
      this.fx.spray(hp, dir.x, dir.z, 0xffffff, 10, 13, 0.5, 0.28, 0.38);
      this.fx.spray(hp, dir.x, dir.z, att.color, 16, 9, 0.9, 0.45, 0.42);
      this.fx.wave(o.pos, att.color, 2.6, 0.35);
      // v0.7: congelamento e tremor só quando o jogador acerta ou é acertado
      if (mine) { this.hitstop = A.hitstop; this.shake = Math.max(this.shake, 0.4); }
      this.audio.hit(mine);
      if (o.carrying) {
        this.core.drop(dir);
        o.pickupCd = CFG.core.dropCooldown;
        this.audio.drop();
        this.fx.burst(_a.copy(o.pos).setY(2.4), 0xbff6ff, 24, 10, 0.7, 0.5, 4);
        this.lastDropper = o; // v1.0.1: quem perdeu o núcleo por último (para filtrar avisos entre bots)
        if (o.isPlayer) this.showBanner('VOCÊ PERDEU O NÚCLEO', '#ff6b9a', 1.2);
        else if (att.isPlayer) this.showBanner('NÚCLEO DERRUBADO!', hex(att.color), 1.0);
      }
    }
  }

  checkPickup() {
    const c = this.core;
    if (c.state === 'carried' || c.noPickup > 0 || c.pos.y > 2.3) return;
    let best = null, bd = CFG.core.pickupRadius + 0.0001;
    for (const f of this.fighters) {
      if (f.stun > 0 || f.pickupCd > 0) continue;
      const d = Math.hypot(f.pos.x - c.pos.x, f.pos.z - c.pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best) return;
    c.attach(best);
    best.shield = CFG.core.carrierShield;
    // v0.3: pulso de luz na captura + arrancada curta (janela de fuga)
    const C = CFG.core;
    best.boostT = C.boostTime;
    let pushedPlayer = false;
    for (const o of this.fighters) {
      if (o === best || o.invuln > 0) continue;
      const dx = o.pos.x - best.pos.x, dz = o.pos.z - best.pos.z, d = Math.hypot(dx, dz);
      if (d >= C.pulseRadius || d < 0.01) continue;
      o.stagger(dx / d, dz / d, C.pulsePush, C.pulseStagger);
      if (o.isPlayer) pushedPlayer = true;
    }
    this.fx.wave(best.pos, 0xbff6ff, C.pulseRadius, 0.35);
    if (best.isPlayer || pushedPlayer) this.shake = Math.max(this.shake, 0.18);
    this.audio.pickup(best.isPlayer);
    this.fx.wave(best.pos, best.color, 3.2, 0.45);
    this.fx.burst(_a.copy(best.pos).setY(1.6), 0xbff6ff, 18, 6, 0.6, 0.45, 5);
    if (this.state === 'play') {
      if (best.isPlayer) this.showBanner('O NÚCLEO É SEU — FUJA!', '#ffc83a', 1.3);
      // v1.0.1: bot pegando o núcleo que outro bot perdeu não gera aviso central (o status sob o cronômetro continua mostrando)
      else if (!(this.lastDropper && !this.lastDropper.isPlayer)) this.showBanner(`${best.name} PEGOU O NÚCLEO`, hex(best.color), 1.0);
    }
  }

  // ---------- Loop ----------
  frame() {
    const t0 = this.fps ? performance.now() : 0;
    this.step(Math.min(this.clock.getDelta(), 0.05));
    if (this.fps) this.renderer.info.reset();
    this.render();
    if (this.fps) this.fps.tick(t0, performance.now());
  }

  // v1.0.1: medidor de FPS opcional (só com ?fps no endereço) para testes reais no aparelho
  setupFps() {
    if (!/[?&]fps\b/.test(location.search + location.hash)) return;
    const el = document.createElement('div'); el.id = 'fpsMeter'; document.body.appendChild(el);
    this.renderer.info.autoReset = false;
    const s = { last: 0, n: 0, sum: 0, worst: 0, cpu: 0, total: 0, frames: 0, fps: 0 };
    this.fps = {
      tick: (t0, t1) => {
        if (s.last) { const dt = t0 - s.last; s.n++; s.sum += dt; s.worst = Math.max(s.worst, dt); if (this.state === 'play') { s.total += dt; s.frames++; } }
        s.last = t0; s.cpu += t1 - t0;
        if (s.sum >= 1000) {
          const fps = s.n * 1000 / s.sum, r = this.renderer;
          const avg = s.frames ? s.frames * 1000 / s.total : 0;
          el.textContent = `${fps.toFixed(0)} FPS · pior ${s.worst.toFixed(0)} ms · CPU ${(s.cpu / s.n).toFixed(1)} ms · ${r.info.render.calls} chamadas · ${Math.round(innerWidth * r.getPixelRatio())}×${Math.round(innerHeight * r.getPixelRatio())}` + (avg ? ` · média na partida ${avg.toFixed(0)}` : '');
          s.n = 0; s.sum = 0; s.worst = 0; s.cpu = 0;
        }
      },
      resetMatch: () => { s.total = 0; s.frames = 0; },
    };
  }

  step(rawDt) {
    let dt = rawDt;
    if (this.state === 'paused') return;
    if (this.hitstop > 0) { this.hitstop -= rawDt; dt = rawDt * 0.08; }
    this.rawDt = rawDt; // v0.7: o cronômetro usa tempo real
    this.time += dt;
    this.input.tick(rawDt);

    if (this.state === 'countdown') {
      this.countdown -= rawDt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        const el = $('countdown');
        el.textContent = n > 0 ? n : 'VALENDO!';
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        if (n <= 0) this.audio.go(); else { this.audio.beep(false); if (n === 3) this.audio.countIn(); }
      }
      if (this.countdown <= 0) { this.state = 'play'; setTimeout(() => $('countdown').classList.remove('pop'), 600); }
    }

    const live = this.state === 'play' || this.state === 'menu';
    if (live) this.simulate(dt);
    else for (const f of this.fighters) { f.moveInput.set(0, 0); }

    for (const f of this.fighters) f.animate(dt, this.time);
    this.core.update(dt, this.time, this.arena.colliders, this.nav);
    this.arena.update(this.time);
    this.fx.update(dt);
    this.updateCamera(rawDt);
    if (this.state !== 'menu') this.updateHUD();
  }

  simulate(dt) {
    // Controle do jogador (no menu, ele também é um bot para a vitrine)
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      if (f.isPlayer && this.state === 'play') {
        this.input.move(_mv);
        f.moveInput.copy(_mv);
        if (this.input.wantsAttack() && f.tryAttack(this)) this.input.clearAttack();
      } else this.brains[i].update(dt, this);
    }
    for (const f of this.fighters) f.update(dt, this);

    // Colisões: obstáculos e separação entre personagens
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
      if (d < m && d > 1e-4) {
        const p = (m - d) / 2, nx = dx / d, nz = dz / d;
        a.pos.x -= nx * p; a.pos.z -= nz * p; b.pos.x += nx * p; b.pos.z += nz * p;
      }
    }
    for (const f of fs) collideCircle(f.pos, f.radius, f.vel, this.arena.colliders, f.stun > 0 ? 0.4 : 0);

    this.checkPickup();

    if (this.state !== 'play') return;
    // Pontuação e relógio
    const c = this.core.carrier;
    if (c) {
      c.score += dt * CFG.pointsPerSec;
      const whole = Math.floor(c.score);
      if (whole !== c.lastWhole) {
        c.lastWhole = whole;
        this.floatText('+1', c, hex(c.color));
        if (c.isPlayer) this.audio.point();
      }
    }
    this.matchTime -= this.rawDt; // v0.7: 120 s reais, mesmo com congelamento de impacto
    const sec = Math.ceil(this.matchTime);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      if (sec <= 10 && sec > 0) this.audio.tick();
    }
    // v0.6: tensão final — a subida termina junto com o cronômetro
    if (!this.finalBuildOn && this.matchTime <= 12.3) { this.finalBuildOn = true; this.audio.finalBuild();
    }
    if (this.matchTime <= 0) { this.matchTime = 0; this.endMatch(); }
  }

  snapCamera() {
    const p = this.player.pos;
    this.camTarget.set(p.x, 0, p.z);
  }

  updateCamera(dt) {
    const C = CFG.camera, cam = this.camera;
    let tx, tz, h = C.height * this.camMul, back = C.back * this.camMul;
    if (this.state === 'menu') {
      const t = this.time * 0.08;
      tx = 0; tz = 0; h = 15; back = 0;
      _a.set(Math.sin(t) * 24, 15, Math.cos(t) * 24);
      cam.position.lerp(_a, 1 - Math.exp(-2 * dt));
      cam.lookAt(0, 0, 0);
      return;
    }
    const p = this.player;
    const lim = CFG.arenaHalf - 7;
    tx = THREE.MathUtils.clamp(p.pos.x + p.vel.x * C.lookAhead, -lim, lim);
    tz = THREE.MathUtils.clamp(p.pos.z + p.vel.z * C.lookAhead, -lim, lim + 2);
    const k = 1 - Math.exp(-C.follow * dt);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    _a.set(this.camTarget.x, h, this.camTarget.z + back);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * this.shake * 1.2;
      _a.x += (Math.random() - 0.5) * s; _a.y += (Math.random() - 0.5) * s; _a.z += (Math.random() - 0.5) * s;
    }
    cam.position.lerp(_a, this.state === 'countdown' ? 1 - Math.exp(-4 * dt) : 1);
    cam.lookAt(this.camTarget.x, 0, this.camTarget.z - 0.6);
  }

  render() { this.composer.render(); }

  // ---------- HUD ----------
  buildBoard() {
    $('board').innerHTML = this.fighters.map((f, i) => `
      <div class="row${f.isPlayer ? ' me' : ''}" id="row${i}" style="--c:${hex(f.color)}">
        <span class="dot"></span><span class="nm">${f.name}</span><span class="pts" id="pts${i}">0</span>
      </div>`).join('');
  }

  updateHUD() {
    const t = Math.max(0, Math.ceil(this.matchTime));
    const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (txt !== this._tt) { this._tt = txt; $('timer').textContent = txt; $('timerBox').classList.toggle('hot', t <= 10); }

    const order = [...this.fighters].sort((a, b) => b.score - a.score);
    order.forEach((f, rank) => {
      const row = $('row' + f.index);
      row.style.order = rank;
      row.classList.toggle('carrier', f.carrying);
      const v = Math.floor(f.score);
      if (row._v !== v) { row._v = v; $('pts' + f.index).textContent = v; }
    });

    // Status do núcleo
    const c = this.core.carrier;
    const st = c ? (c.isPlayer ? 'VOCÊ ESTÁ COM O NÚCLEO' : `NÚCLEO COM ${c.name}`) : 'NÚCLEO LIVRE';
    if (st !== this._st) { this._st = st; $('coreState').textContent = st; $('coreState').style.color = c ? hex(c.color) : ''; }

    // Seta indicando o núcleo fora da tela
    const arrow = $('coreArrow');
    if (c && c.isPlayer) { arrow.hidden = true; }
    else {
      _a.copy(this.core.group.position).project(this.camera);
      const off = Math.abs(_a.x) > 0.92 || _a.y > 0.7 || _a.y < -0.88 || _a.z > 1;
      arrow.hidden = !off;
      if (off) {
        let x = _a.x, y = _a.y; if (_a.z > 1) { x = -x; y = -y; }
        const m = Math.max(Math.abs(x) / 0.86, Math.max(y / 0.62, -y / 0.8));
        x /= m; y /= m;
        const sx = (x + 1) / 2 * innerWidth, sy = (1 - y) / 2 * innerHeight;
        arrow.style.transform = `translate(${sx}px, ${sy}px) rotate(${Math.atan2(-y * innerHeight, x * innerWidth)}rad)`;
        arrow.style.setProperty('--c', c ? hex(c.color) : '#8ff3ff');
      }
    }

    // Banner
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('on'); }
  }

  showBanner(text, color, dur = 1.2) {
    const b = $('banner');
    b.textContent = text; b.style.color = color;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    this.bannerT = dur;
  }

  floatText(text, f, color) {
    _a.copy(f.pos).setY(3.2).project(this.camera);
    if (Math.abs(_a.x) > 1 || Math.abs(_a.y) > 1) return;
    const el = document.createElement('div');
    el.className = 'float'; el.textContent = text; el.style.color = color;
    el.style.left = ((_a.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - _a.y) / 2 * innerHeight) + 'px';
    $('floats').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  bindUI() {
    const ck = fn => () => { fn(); this.audio.click(); };
    $('playBtn').onclick = ck(() => this.openSelect());
    $('startBtn').onclick = ck(() => this.startMatch());
    $('backBtn').onclick = ck(() => { $('select').hidden = true; $('menu').hidden = false; });
    $('againBtn').onclick = ck(() => this.startMatch());
    $('menuBtn').onclick = ck(() => this.toMenu());
    $('resumeBtn').onclick = ck(() => this.togglePause());
    $('quitBtn').onclick = ck(() => this.toMenu());
    $('pauseBtn').onclick = ck(() => this.togglePause());
    const mb = $('musicBtn');
    const sync = () => { mb.textContent = this.audio.musicOn ? 'Música: ligada' : 'Música: desligada'; mb.setAttribute('aria-pressed', this.audio.musicOn); };
    sync();
    mb.onclick = () => { this.audio.unlock(); this.audio.toggleMusic(); sync(); };
    addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (this.state === 'menu' && !$('select').hidden) { if (e.code === 'Enter') { e.preventDefault(); this.startMatch(); } }
        else if (this.state === 'menu') { e.preventDefault(); this.openSelect(); }
        else if (this.state === 'end' && !$('results').hidden) { e.preventDefault(); this.startMatch(); }
      }
    });
  }
}

const game = new Game();
window.__game = game;
game.init().catch(err => {
  console.error(err);
  $('loadMsg').textContent = 'Não foi possível carregar o jogo: ' + err.message;
});
