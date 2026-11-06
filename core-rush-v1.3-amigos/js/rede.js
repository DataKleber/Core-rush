// ===== v1.3 "JOGAR COM AMIGOS": salas por link (WebRTC via PeerJS, licença MIT) =====
// Modelo: o navegador de quem cria a sala (anfitrião) roda o jogo de verdade, como sempre rodou.
// Os convidados mandam só os comandos (direção + ataque) e desenham o estado que o anfitrião envia.
// Vagas vazias continuam com bots. Nada disso muda as regras, o combate ou a IA.
import * as THREE from 'three';
import { ROSTER } from './config.js';
import { CHARACTERS } from './characters.js';

const $ = id => document.getElementById(id);
const PREFIXO = 'corerush-v13-';
const SNAP_HZ = 20, INPUT_HZ = 30, ATRASO = 0.1, LIMITE_SILENCIO = 12;
const FASES = ['none', 'windup', 'active', 'recovery'];
const hex = c => '#' + c.toString(16).padStart(6, '0');
const limpaNome = n => String(n || '').toUpperCase().replace(/[^A-Z0-9À-Ý _-]/g, '').trim().slice(0, 10);
const lerpAng = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const r2 = v => Math.round(v * 100) / 100;

export class Rede {
  constructor(game) {
    this.g = game;
    this.host = false; this.peer = null; this.conns = []; this.hostConn = null;
    this.vagas = []; // anfitrião: [{nome, char, conn}] — índice 0 é o próprio anfitrião
    this.nome = '';
    try { this.nome = limpaNome(localStorage.getItem('cr_nome')); } catch (e) {}
    this.ui();
    const sala = new URLSearchParams(location.search).get('sala');
    if (sala) setTimeout(() => this.abrir(limpaNome(sala).replace(/[^A-Z0-9]/g, '')), 0);
  }

  // v1.3.1: com a aba escondida/minimizada o navegador para o desenho (requestAnimationFrame).
  // Um relógio num Worker (não é freado como a página) mantém a partida rodando no anfitrião
  // e mantém o sinal do convidado. O desenho volta sozinho quando a aba reaparece.
  fundo() {
    if (this.relogio) return;
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' }));
      this.relogio = new Worker(url);
    } catch (e) { return; }
    let last = performance.now();
    this.relogio.onmessage = () => {
      const g = this.g, agora = performance.now(), dt = Math.min((agora - last) / 1000, 0.05);
      last = agora;
      if (!g.online || !document.hidden) return;
      if (this.host) g.step(dt); // a partida continua para todos
      else if (this.hostConn && this.hostConn.open && agora - (this.ping || 0) > 1000) {
        this.ping = agora;
        try { this.hostConn.send({ t: 'i', x: 0, z: 0, k: this.k || 0 }); } catch (e) {} // parado, mas presente
      }
    };
  }

  // ---------- tela da sala ----------
  ui() {
    const st = document.createElement('style');
    st.textContent = '@media (max-width:640px){.char-grid.mini{grid-template-columns:repeat(5,minmax(0,1fr))}}';
    document.head.appendChild(st);
    $('amigosBtn').onclick = () => { this.g.audio.click(); this.abrir(null); };
    $('salaNome').value = this.nome;
    $('salaNome').oninput = () => { this.nome = limpaNome($('salaNome').value); try { localStorage.setItem('cr_nome', this.nome); } catch (e) {} this.mudouPerfil(); };
    $('salaAcao').onclick = () => { this.g.audio.click(); this.acao(); };
    $('salaSair').onclick = () => { this.g.audio.click(); this.sair(); };
    $('salaCopiar').onclick = () => { navigator.clipboard?.writeText(this.link).then(() => { $('salaCopiar').textContent = 'Copiado!'; setTimeout(() => $('salaCopiar').textContent = 'Copiar link', 1500); }).catch(() => {}); };
    $('salaZap').onclick = () => open('https://wa.me/?text=' + encodeURIComponent('Bora jogar Core Rush comigo? Entra na minha sala: ' + this.link), '_blank');
  }

  abrir(codigoConvite) {
    const g = this.g;
    g.audio.unlock();
    for (const id of ['menu', 'select', 'results', 'pause']) $(id).hidden = true;
    $('sala').hidden = false;
    this.convite = codigoConvite;
    $('salaChars').innerHTML = CHARACTERS.map(c => `<button class="pick" data-id="${c.id}"><img src="${g.thumbs[c.id]}" alt="" width="64" height="77"><span>${c.name}</span></button>`).join('');
    $('salaChars').querySelectorAll('.pick').forEach(b => b.onclick = () => { g.chooseChar(b.dataset.id); g.audio.click(); this.marcarChar(); this.mudouPerfil(); });
    this.marcarChar();
    this.estado(codigoConvite ? 'convite' : 'inicio');
  }
  marcarChar() { $('salaChars').querySelectorAll('.pick').forEach(b => b.classList.toggle('on', b.dataset.id === this.g.playerChar)); }

  estado(e, msg) {
    this.fase = e;
    const A = $('salaAcao');
    $('salaLink').hidden = e !== 'anfitriao';
    $('salaLista').hidden = !(e === 'anfitriao' || e === 'convidado');
    A.hidden = false; A.disabled = false;
    if (e === 'inicio') { $('salaTit').textContent = 'JOGAR COM AMIGOS'; $('salaMsg').textContent = msg || 'Crie uma sala e mande o link. Até 4 pessoas; vagas vazias ficam com bots.'; A.textContent = 'CRIAR SALA'; $('salaSair').textContent = 'Voltar'; }
    if (e === 'convite') { $('salaTit').textContent = 'CONVITE PARA JOGAR'; $('salaMsg').textContent = msg || `Sala ${this.convite}. Escolha nome e personagem e entre.`; A.textContent = 'ENTRAR NA SALA'; $('salaSair').textContent = 'Voltar'; }
    if (e === 'conectando') { $('salaMsg').textContent = msg || 'Conectando…'; A.hidden = true; $('salaSair').textContent = 'Cancelar'; }
    if (e === 'anfitriao') { $('salaTit').textContent = 'SUA SALA: ' + this.codigo; $('salaMsg').textContent = msg || 'Mande o link. Quando todos entrarem, comece. Deixe esta aba aberta durante a partida.'; A.textContent = 'COMEÇAR PARTIDA'; $('salaSair').textContent = 'Fechar sala'; }
    if (e === 'convidado') { $('salaTit').textContent = 'SALA ' + this.convite; $('salaMsg').textContent = msg || 'Você entrou! Aguarde o anfitrião começar a partida.'; A.hidden = true; $('salaSair').textContent = 'Sair da sala'; }
  }

  acao() {
    if (!this.nome) { this.nome = 'JOGADOR'; $('salaNome').value = this.nome; }
    if (this.fase === 'inicio') this.criar();
    else if (this.fase === 'convite') this.entrar();
    else if (this.fase === 'anfitriao') this.comecar();
  }

  opcoesPeer() {
    const s = new URLSearchParams(location.search).get('sinal'); // só para testes locais
    if (!s) return { debug: 1 };
    const [host, port] = s.split(':');
    return { host, port: +port, path: '/', secure: false, debug: 1 };
  }

  // ---------- anfitrião ----------
  criar(tent = 0) {
    this.estado('conectando', 'Criando a sala…');
    const cod = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');
    const peer = this.peer = new window.Peer(PREFIXO + cod, this.opcoesPeer());
    peer.on('open', () => {
      this.fundo();
      this.host = true; this.codigo = cod; this.g.online = true;
      const u = new URL(location.href); u.search = '?sala=' + cod;
      const sinal = new URLSearchParams(location.search).get('sinal'); if (sinal) u.searchParams.set('sinal', sinal);
      u.hash = ''; this.link = u.toString(); $('salaUrl').textContent = this.link;
      this.vagas = [{ nome: this.nome, char: this.g.playerChar, conn: null }];
      this.estado('anfitriao'); this.listar();
    });
    peer.on('connection', c => this.novoConvidado(c));
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tent < 3) { peer.destroy(); return this.criar(tent + 1); }
      this.falha(e);
    });
  }
  novoConvidado(c) {
    c.on('open', () => {
      if (this.vagas.length >= 4) { c.send({ t: 'cheia' }); setTimeout(() => c.close(), 300); return; }
      const v = { nome: 'AMIGO', char: CHARACTERS[0].id, conn: c, visto: performance.now() };
      this.vagas.push(v);
      c.on('data', d => this.doConvidado(v, d));
      c.on('close', () => this.saiu(v));
      this.listar();
    });
  }
  doConvidado(v, d) {
    v.visto = performance.now();
    if (!d || typeof d !== 'object') return;
    if (d.t === 'perfil') {
      v.nome = limpaNome(d.nome) || 'AMIGO';
      v.char = CHARACTERS.some(c => c.id === d.char) ? d.char : CHARACTERS[0].id;
      this.listar();
    } else if (d.t === 'ok') { if (d.m === this.partidaId) v.confirmou = true;
    } else if (d.t === 'i' && v.f && v.f.netIn) {
      const n = v.f.netIn;
      n.x = Math.max(-1, Math.min(1, +d.x || 0)); n.z = Math.max(-1, Math.min(1, +d.z || 0));
      if (d.k > n.k) { n.k = d.k; n.atkT = 0.2; } // mesmo "buffer" de 0,2 s do ataque local
    }
  }
  saiu(v) {
    const i = this.vagas.indexOf(v); if (i < 0) return;
    this.vagas.splice(i, 1);
    if (v.f) { v.f.netIn = null; if (this.g.state === 'play' || this.g.state === 'countdown') this.g.showBanner(`${v.nome} SAIU — UM BOT ASSUME`, '#ff6b9a', 1.6); }
    this.listar();
  }
  listar() {
    const L = [];
    for (let i = 0; i < 4; i++) {
      const v = this.vagas[i];
      L.push(v ? { nome: v.nome, char: v.char } : null);
    }
    this.mostrarLista(L, 0);
    this.enviarTodos({ t: 'lobby', lista: L });
  }
  mostrarLista(L, eu) {
    $('salaLista').innerHTML = L.map((v, i) => `<li class="${v ? '' : 'bot'}" style="--c:${hex(ROSTER[i].color)}">${v ? v.nome : 'Bot'}${i === eu && v ? ' (você)' : ''}<small>${v ? (i === 0 ? 'anfitrião' : 'pronto') : 'vaga livre'}</small></li>`).join('');
  }
  enviarTodos(m) { for (const v of this.vagas) if (v.conn && v.conn.open) try { v.conn.send(m); } catch (e) {} }

  comecar() {
    const g = this.g;
    if (!this.host) return;
    this.vagas[0].nome = this.nome; this.vagas[0].char = g.playerChar;
    // bots: personagens diferentes dos humanos quando der
    const usados = this.vagas.map(v => v.char);
    const livres = CHARACTERS.map(c => c.id).filter(id => !usados.includes(id)).sort(() => Math.random() - 0.5);
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const v = this.vagas[i];
      slots.push(v ? { nome: v.nome, char: v.char, humano: true } : { nome: ROSTER[i].name, char: livres.shift() || CHARACTERS[i % CHARACTERS.length].id, humano: false });
    }
    this.partidaId = (this.partidaId || 0) + 1;
    this.vagas.forEach((v, i) => { if (v.conn) { v.inicio = { t: 'start', slots, eu: i, m: this.partidaId }; v.confirmou = false; try { v.conn.send(v.inicio); } catch (e) {} } });
    g.aplicarSala(slots, 0);
    this.vagas.forEach((v, i) => { v.f = g.fighters[i]; });
    g.emit = (t, d) => { if (g.state === 'play') this.ev.push([t, d]); };
    this.ev = []; this.relHost = 0; this.acSnap = 0;
    $('sala').hidden = true;
    g.startMatch();
  }

  // a cada quadro (anfitrião: envia estado; convidado: envia comandos e vigia a conexão)
  tick(dt) {
    const g = this.g;
    if (this.host) {
      const agora = performance.now();
      for (const v of [...this.vagas]) if (v.conn && agora - v.visto > LIMITE_SILENCIO * 1000) { try { v.conn.close(); } catch (e) {} this.saiu(v); }
      if (g.state === 'countdown' || g.state === 'play') for (const v of this.vagas) {
        if (v.conn && v.inicio && !v.confirmou && agora - (v.reenvio || 0) > 500) { v.reenvio = agora; try { v.conn.send(v.inicio); } catch (e) {} }
      }
      if (g.state !== 'play' && g.state !== 'countdown') { if (agora - (this.ping || 0) > 1000) { this.ping = agora; this.enviarTodos({ t: 'oi' }); } return; }
      this.relHost += dt; this.acSnap += dt;
      if (this.acSnap < 1 / SNAP_HZ) return;
      this.acSnap = 0;
      this.enviarTodos(this.snapshot());
      this.ev = [];
    } else if (this.hostConn) {
      if (g.state === 'play') {
        this.acIn = (this.acIn || 0) + dt;
        if (g.input.wantsAttack()) { this.k = (this.k || 0) + 1; g.input.clearAttack(); this.acIn = 1; }
        if (this.acIn >= 1 / INPUT_HZ) {
          this.acIn = 0;
          g.input.move(this._mv || (this._mv = new THREE.Vector2()));
          this.hostConn.send({ t: 'i', x: r2(this._mv.x), z: r2(this._mv.y), k: this.k || 0 });
        }
      } else if (performance.now() - (this.ping || 0) > 1000) { this.ping = performance.now(); this.hostConn.send({ t: 'oi' }); }
      if (performance.now() - this.visto > LIMITE_SILENCIO * 1000) this.perdeu('Conexão com o anfitrião perdida.');
    }
  }

  snapshot() {
    const g = this.g, c = g.core, e = g.energia;
    return {
      t: 's', ht: r2(this.relHost * 1000) / 1000, mt: r2(g.matchTime), cd: g.state === 'countdown' ? r2(g.countdown) : 0,
      f: g.fighters.map(f => [r2(f.pos.x), r2(f.pos.z), r2(f.vel.x), r2(f.vel.z), r2(f.facing), r2(f.stun), FASES.indexOf(f.attackPhase), r2(f.attackT), r2(f.shield), r2(f.score), r2(f.cooldown)]),
      c: [c.state === 'carried' ? 1 : c.state === 'flying' ? 2 : 0, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), c.carrier ? c.carrier.index : -1],
      e: [e.mult, r2(e.superT), e.final ? 1 : 0],
      ev: this.ev,
    };
  }

  fim() {
    if (!this.host || !this.g.online) return;
    this.enviarTodos(this.snapshot()); this.ev = [];
    this.enviarTodos({ t: 'fim', pts: this.g.fighters.map(f => r2(f.score)) });
  }

  // ---------- convidado ----------
  entrar() {
    this.estado('conectando', 'Entrando na sala…');
    const peer = this.peer = new window.Peer(undefined, this.opcoesPeer());
    peer.on('open', () => {
      const c = this.hostConn = peer.connect(PREFIXO + this.convite, { reliable: true });
      const t = setTimeout(() => { if (!c.open) this.falha({ type: 'timeout' }); }, 15000);
      c.on('open', () => { clearTimeout(t); this.fundo(); this.visto = performance.now(); this.g.online = true; this.estado('convidado'); this.mudouPerfil(); });
      c.on('data', d => this.doAnfitriao(d));
      c.on('close', () => this.perdeu('O anfitrião fechou a sala.'));
    });
    peer.on('error', e => this.falha(e));
  }
  mudouPerfil() {
    if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'perfil', nome: this.nome || 'AMIGO', char: this.g.playerChar });
    if (this.host && this.vagas[0]) { this.vagas[0].nome = this.nome; this.vagas[0].char = this.g.playerChar; this.listar(); }
  }
  doAnfitriao(d) {
    const g = this.g;
    this.visto = performance.now();
    if (!d || typeof d !== 'object') return;
    if (d.t === 'lobby') this.mostrarLista(d.lista.map(v => v && { nome: limpaNome(v.nome), char: v.char }), this.eu ?? -1);
    else if (d.t === 'cheia') this.perdeu('A sala está cheia (4 jogadores).');
    else if (d.t === 'start') {
      try { this.hostConn.send({ t: 'ok', m: d.m }); } catch (e) {}
      if (d.m && d.m === this.partidaVista) return; // aviso repetido
      this.partidaVista = d.m;
      const slots = d.slots.map((s, i) => ({ nome: limpaNome(s.nome) || ROSTER[i].name, char: CHARACTERS.some(c => c.id === s.char) ? s.char : CHARACTERS[0].id, humano: !!s.humano }));
      this.eu = d.eu;
      g.aplicarSala(slots, d.eu);
      this.snaps = []; this.off = null; this.k = 0; this.ultimo = null;
      g.remote = true;
      $('sala').hidden = true;
      $('againBtn').disabled = true; $('againBtn').textContent = 'AGUARDANDO ANFITRIÃO';
      g.startMatch();
    } else if (d.t === 's') {
      if (!this.snaps) return;
      if (g.state === 'countdown') g.countdown = d.cd > 0 ? d.cd : 0.0001; // contagem igual à do anfitrião
      d.recebido = performance.now() / 1000;
      const o = d.ht - d.recebido;
      this.off = this.off == null || o > this.off ? o : this.off;
      this.snaps.push(d); if (this.snaps.length > 40) this.snaps.shift();
    } else if (d.t === 'fim') {
      setTimeout(() => {
        if (g.state !== 'play') return;
        this.aplicar(0, true);
        g.fighters.forEach((f, i) => { f.score = +d.pts[i] || 0; });
        g.matchTime = 0; g.endMatch();
      }, ATRASO * 1000);
    }
  }

  // convidado: desenha o estado do anfitrião ~0,1 s atrás, suavizando entre dois envios
  aplicar(dt, tudo) {
    const g = this.g, S = this.snaps;
    if (!S || !S.length) return;
    const agora = performance.now() / 1000;
    this.off -= dt * 0.02; // acompanha variações lentas de atraso
    const rt = tudo ? Infinity : agora + this.off - ATRASO;
    // eventos (ataques, acertos, capturas, orbes) disparam quando o "tempo de desenho" passa por eles
    for (const s of S) if (!s.feito && s.ht <= rt) { s.feito = true; for (const [t, d] of s.ev) this.evento(t, d); }
    let a = S[0], b = S[0];
    for (let i = 0; i < S.length; i++) { if (S[i].ht <= rt) a = S[i]; if (S[i].ht >= rt) { b = S[i]; break; } b = S[i]; }
    const k = b.ht > a.ht ? Math.min(1, Math.max(0, (rt - a.ht) / (b.ht - a.ht))) : 1;
    while (S.length > 3 && S[1].ht < rt - 0.5) S.shift();

    const c = g.core, ci = b.c[4];
    g.fighters.forEach((f, i) => {
      const A = a.f[i], B = b.f[i];
      f.pos.x = A[0] + (B[0] - A[0]) * k; f.pos.z = A[1] + (B[1] - A[1]) * k;
      f.vel.set(B[2], 0, B[3]);
      f.facing = lerpAng(A[4], B[4], k);
      f.stun = B[5]; f.attackPhase = FASES[B[6]] || 'none'; f.attackT = B[7]; f.shield = B[8]; f.cooldown = B[10];
      const antes = Math.floor(f.score);
      f.score = B[9];
      const whole = Math.floor(f.score);
      if (whole !== antes && ci === i && b.e[0] > 0) { // +1 / +2 flutuando sobre o portador, como no jogo local
        const m2 = b.e[0] > 1;
        if (!m2 || whole % 2 === 0) g.floatText(m2 ? '+2' : '+1', f, hex(f.color));
        if (f.isPlayer) g.audio.point();
      }
      f.carrying = ci === i;
    });
    const antes = c.state;
    if (ci >= 0) { c.state = 'carried'; c.carrier = g.fighters[ci]; }
    else {
      c.state = b.c[0] === 2 ? 'flying' : 'free'; c.carrier = null;
      c.pos.set(a.c[1] + (b.c[1] - a.c[1]) * k, a.c[2] + (b.c[2] - a.c[2]) * k, a.c[3] + (b.c[3] - a.c[3]) * k);
      if (antes === 'flying' && c.state === 'free' && c.onLand) c.onLand(c.pos);
    }
    for (const f of g.fighters) f.update(dt, g); // só a parte visual (cones, brilho do acerto, escudo)
    const e = g.energia;
    e.mult = b.e[0]; e.superT = b.e[1]; e.final = !!b.e[2];
    g.rawDt = 0; e.relogio();
    // relógio, bipes finais e música de tensão (o fim chega por mensagem do anfitrião)
    g.matchTime = Math.max(0.01, a.mt + (b.mt - a.mt) * k);
    const sec = Math.ceil(g.matchTime);
    if (sec !== g.lastSecond) { g.lastSecond = sec; if (sec <= 10 && sec > 0) g.audio.tick(); }
    if (!g.finalBuildOn && g.matchTime <= 12.3) { g.finalBuildOn = true; g.audio.finalBuild(); }
  }

  evento(t, d) {
    const g = this.g, F = g.fighters;
    try {
      if (t === 'w') { const f = F[d[0]]; f.facing = d[1]; f.windFx(g); }
      else if (t === 'a') { const f = F[d[0]]; f.facing = d[1]; f.attackOrigin.set(d[2], 0, d[3]); f.fireFx(g); }
      else if (t === 'h') {
        const o = F[d[0]], att = F[d[1]];
        const dir = new THREE.Vector3(d[2], 0, d[3]);
        g.hitFx(o, att, dir, !!d[4], !!d[5]);
      }
      else if (t === 'p') g.pickupFx(F[d[0]], d[1]);
      else if (t === 'e') g.energia.evento(d[0], d[1], d[2]);
      else if (t === 'o') g.energia.pegar(d[0], F[d[1]]);
    } catch (err) { console.warn('evento online', t, err); }
  }

  // ---------- saída e erros ----------
  perdeu(msg) {
    if (!this.g.online && !this.peer) return;
    const g = this.g, emJogo = g.state !== 'menu';
    this.encerrar();
    if (emJogo) g.toMenu();
    this.abrir(null); this.estado('inicio', msg);
  }
  falha(e) {
    const msg = e && e.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o link ou peça um novo.'
      : e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') ? 'Sem conexão com o servidor de salas. Tente de novo em instantes.'
      : e && e.type === 'timeout' ? 'Não foi possível conectar à sala (rede bloqueando?). Tente outra rede, ex.: 4G.'
      : 'Não foi possível conectar (' + (e && e.type || 'erro') + ').';
    const conv = this.convite;
    this.encerrar();
    this.convite = conv;
    this.estado(conv ? 'convite' : 'inicio', msg);
  }
  encerrar() {
    const g = this.g;
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null; this.hostConn = null; this.vagas = []; this.host = false; this.snaps = null; this.eu = null; this.partidaVista = null;
    if (g.online) g.sairDaSala();
  }
  sair() {
    const g = this.g;
    if (this._saindo) return; this._saindo = true;
    this.encerrar();
    this.convite = null;
    if (location.search.includes('sala=')) history.replaceState(null, '', location.pathname);
    if (g.state !== 'menu') g.toMenu();
    $('sala').hidden = true; $('menu').hidden = false;
    this._saindo = false;
  }
}
