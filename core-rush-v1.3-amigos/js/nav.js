import { CFG } from './config.js';

// Grade de navegação simples (A* em células de 1 unidade) para os bots contornarem obstáculos
export class Nav {
  constructor(colliders) {
    const H = this.H = CFG.arenaHalf;
    const N = this.N = H * 2;
    const inflate = CFG.move.radius + 0.2;
    this.blocked = new Uint8Array(N * N);
    const lim = H - 0.5 - inflate;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i - H + 0.5, z = j - H + 0.5;
      let b = Math.abs(x) > lim || Math.abs(z) > lim;
      for (const c of colliders.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + inflate) b = true;
      for (const o of colliders.boxes) {
        const dx = Math.max(Math.abs(x - o.x) - o.hx, 0), dz = Math.max(Math.abs(z - o.z) - o.hz, 0);
        if (Math.hypot(dx, dz) < inflate) b = true;
      }
      this.blocked[j * N + i] = b ? 1 : 0;
    }
    this.g = new Float32Array(N * N); this.from = new Int32Array(N * N); this.stamp = new Int32Array(N * N); this.closed = new Int32Array(N * N);
    this.run = 0;
  }

  idx(x, z) {
    const N = this.N, H = this.H;
    const i = Math.min(N - 1, Math.max(0, Math.floor(x + H)));
    const j = Math.min(N - 1, Math.max(0, Math.floor(z + H)));
    return j * N + i;
  }
  free(x, z) { return !this.blocked[this.idx(x, z)]; }

  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.35);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (this.blocked[this.idx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }

  nearestFree(id) {
    if (!this.blocked[id]) return id;
    const N = this.N, i0 = id % N, j0 = (id / N) | 0;
    for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if (!this.blocked[j * N + i]) return j * N + i;
    }
    return id;
  }

  // Devolve o ponto para onde andar agora (já com "corte de caminho")
  steer(ax, az, bx, bz, out) {
    if (this.los(ax, az, bx, bz)) return out.set(bx - ax, bz - az);
    const N = this.N, H = this.H;
    const s = this.nearestFree(this.idx(ax, az)), goal = this.nearestFree(this.idx(bx, bz));
    const run = ++this.run;
    const open = [s]; this.g[s] = 0; this.stamp[s] = run; this.from[s] = -1;
    const gi = goal % N, gj = (goal / N) | 0;
    const hf = id => { const di = Math.abs(id % N - gi), dj = Math.abs(((id / N) | 0) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
    let found = false, iter = 0;
    while (open.length && iter++ < 1400) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) { const f = this.g[open[k]] + hf(open[k]); if (f < bf) { bf = f; bi = k; } }
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) { found = true; break; }
      this.closed[cur] = run;
      const ci = cur % N, cj = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const nb = j * N + i;
        if (this.blocked[nb] || this.closed[nb] === run) continue;
        if (di && dj && (this.blocked[cj * N + i] || this.blocked[j * N + ci])) continue; // sem cortar quina
        const ng = this.g[cur] + (di && dj ? 1.414 : 1);
        if (this.stamp[nb] !== run || ng < this.g[nb]) {
          if (this.stamp[nb] !== run) open.push(nb);
          this.stamp[nb] = run; this.g[nb] = ng; this.from[nb] = cur;
        }
      }
    }
    if (!found) return out.set(bx - ax, bz - az);
    // reconstrói e escolhe o ponto visível mais distante
    const path = [];
    for (let c = goal; c !== -1; c = this.from[c]) path.push(c);
    path.reverse();
    let tx = bx, tz = bz;
    for (let k = path.length - 1; k >= 1; k--) {
      const x = (path[k] % N) - H + 0.5, z = ((path[k] / N) | 0) - H + 0.5;
      if (this.los(ax, az, x, z)) { tx = x; tz = z; break; }
      if (k === 1) { tx = x; tz = z; }
    }
    return out.set(tx - ax, tz - az);
  }

  // distância livre em linha reta numa direção (para a fuga)
  clearance(ax, az, dx, dz, max) {
    for (let d = 0.5; d <= max; d += 0.5) if (this.blocked[this.idx(ax + dx * d, az + dz * d)]) return d - 0.5;
    return max;
  }
}
