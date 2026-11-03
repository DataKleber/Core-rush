// Efeitos sonoros sintetizados (sem arquivos) + música de fundo
export class Audio {
  constructor() {
    this.ctx = null; this.master = null;
    // v0.6b: menu = Arcade Rush; partida = Deep, já no trecho mais forte (laço de 18 compassos, sem pausa)
    this.tracks = { menu: document.getElementById('music'), game: document.getElementById('musicGame') };
    this.trackVol = { menu: 0.32, game: 0.32 };
    this.gameLoopEnd = 41.14; // 18 compassos a ~105 BPM
    this.current = 'menu';
    this.music = this.tracks.menu;
    this.long = [];
    this.musicOn = true; this.sfxOn = true;
    try { this.musicOn = localStorage.getItem('cl_music') !== '0'; } catch (e) {}
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.loadSamples();
      this.loadGameMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.applyMusic();
  }

  // v0.5: amostras do pacote de áudio (Kenney, CC0). Enquanto não carregam, os sons sintetizados cobrem.
  async loadSamples() {
    this.buf = {};
    const names = ['laser_forte_01.wav', 'laser_forte_02.wav', 'acerto_forte_01.wav', 'acerto_medio_01.wav',
      'layered_kick.wav', 'pulso_energia_01.wav', 'short_fx_04.wav', 'lets_go.wav', 'access01.wav',
      'sweep_up.mp3', 'final_build.mp3', 'crash_fim.mp3'];
    await Promise.all(names.map(async file => {
      const n = file.replace(/\.\w+$/, '');
      try {
        const ab = await (await fetch(`assets/sfx/${file}`)).arrayBuffer();
        this.buf[n] = await this.ctx.decodeAudioData(ab);
      } catch (e) { /* mantém o som sintetizado */ }
    }));
  }
  sample(name, vol, rate = 1, offset = 0, keep = false) {
    const b = this.buf && this.buf[name];
    if (!this.ctx || !b) return false;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(0, offset);
    if (keep) { this.long.push(s); s.onended = () => { this.long = this.long.filter(x => x !== s); }; }
    return true;
  }
  // interrompe sons longos (subida da contagem / tensão final) ao pausar ou sair
  stopLong() { for (const s of this.long) { try { s.stop(); } catch (e) {} } this.long = []; }

  // a música da partida toca pelo Web Audio para o laço emendar sem falha
  async loadGameMusic() {
    try {
      const ab = await (await fetch('assets/musica_partida.mp3')).arrayBuffer();
      this.gameBuf = await this.ctx.decodeAudioData(ab);
      this.gameGain = this.ctx.createGain(); this.gameGain.connect(this.ctx.destination);
      if (this.current === 'game') { this.tracks.game.pause(); this.applyMusic(); }
    } catch (e) { /* usa o elemento <audio> como reserva */ }
  }
  stopGameLoop() { if (this.gameSrc) { try { this.gameSrc.stop(); } catch (e) {} this.gameSrc = null; } }

  setTrack(name) {
    if (this.current === name) return;
    const old = this.tracks[this.current]; if (old) old.pause();
    this.stopGameLoop();
    this.current = name; this.music = this.tracks[name];
    if (this.music) this.music.currentTime = 0;
    this.applyMusic();
  }
  applyMusic() {
    const vol = this.trackVol[this.current];
    if (this.current === 'game' && this.gameBuf) {
      this.tracks.game.pause();
      this.gameGain.gain.value = this.musicOn ? vol : 0;
      if (!this.gameSrc) {
        const s = this.ctx.createBufferSource(); s.buffer = this.gameBuf;
        s.loop = true; s.loopStart = 0; s.loopEnd = Math.min(this.gameLoopEnd, this.gameBuf.duration);
        s.connect(this.gameGain); s.start(); this.gameSrc = s;
      }
      return;
    }
    if (!this.music) return;
    this.music.volume = vol;
    if (this.musicOn) this.music.play().catch(() => {}); else this.music.pause();
  }
  toggleMusic() {
    this.musicOn = !this.musicOn;
    try { localStorage.setItem('cl_music', this.musicOn ? '1' : '0'); } catch (e) {}
    this.applyMusic(); return this.musicOn;
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, vol, freq = 1800, q = 1, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  }

  swing(mine) { const v = mine ? 1 : 0.4; this.burst(0.12, 0.35 * v, 2600, 0.8); this.tone(820, 0.12, 'square', 0.06 * v, 260); }
  hit(mine) {
    // v0.5: acerto do pacote + o baque grave sintetizado da v0.4 por baixo (dá peso)
    const v = mine ? 1 : 0.45;
    const ok = this.sample(mine ? 'acerto_forte_01' : 'acerto_medio_01', (mine ? 0.75 : 0.5) * v, 0.95 + Math.random() * 0.1);
    if (mine) this.sample('layered_kick', 0.42, 0.97 + Math.random() * 0.06); // v0.6: soco grave nos acertos com você
    this.tone(170, 0.22, 'sine', 0.45 * v, 55);
    if (!ok) this.burst(0.16, 0.5 * v, 900, 0.6);
  }
  // v0.5: carga curta (0,1 s) sintetizada — subida rápida de tom, bem baixa
  charge(mine) {
    const v = mine ? 1 : 0.35;
    this.tone(380, 0.11, 'sine', 0.09 * v, 1250);
    this.tone(760, 0.11, 'triangle', 0.035 * v, 2400);
  }
  // v0.5: disparo — laser forte do pacote (alternando 2 variações) + o chiado de ar da v0.4, mais baixo
  shot(mine) {
    const v = mine ? 1 : 0.38;
    const n = Math.random() < 0.5 ? 'laser_forte_01' : 'laser_forte_02';
    const ok = this.sample(n, 0.55 * v, 0.94 + Math.random() * 0.12);
    this.burst(0.11, (ok ? 0.16 : 0.35) * v, 2600, 0.8);
    if (!ok) this.tone(820, 0.12, 'square', 0.06 * v, 260);
  }
  // v0.6: captura = pulso de energia (o "pulso de luz") + o arpejo de sempre, um pouco mais baixo
  pickup(mine) {
    const v = mine ? 1 : 0.45;
    const ok = this.sample('pulso_energia_01', 0.5 * v);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', (ok ? 0.11 : 0.16) * v, null, (ok ? 0.04 : 0) + i * 0.05));
  }
  // v0.6: núcleo derrubado = efeito curto + a descida sintetizada, mais baixa
  drop() {
    const ok = this.sample('short_fx_04', 0.45);
    this.tone(700, 0.35, 'sawtooth', ok ? 0.05 : 0.09, 140); if (!ok) this.burst(0.25, 0.25, 500, 0.5);
  }
  // v0.6: contagem — subida que termina exatamente no "VALENDO!"
  countIn() { this.sample('sweep_up', 0.4, 1, 0.2, true); }
  go() { if (!this.sample('lets_go', 0.7)) this.beep(true); else this.tone(1046, 0.25, 'square', 0.05); }
  finalBuild() { this.sample('final_build', 0.3, 1, 0, true); }
  click() { this.sample('access01', 0.35); }
  blocked() { this.tone(1400, 0.08, 'square', 0.08, 1800); }
  beep(high) { this.tone(high ? 1046 : 523, high ? 0.45 : 0.18, 'square', 0.12); }
  tick() { this.tone(1500, 0.05, 'square', 0.06); }
  point() { this.tone(1318, 0.06, 'sine', 0.05); }
  end(win) {
    this.sample('crash_fim', 0.35); (win ? [523, 659, 784, 1047, 1318] : [440, 392, 349, 262]).forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, null, i * 0.12)); }
}
