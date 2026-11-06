import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const assets = {};
const MODELS = ['piso', 'piso-faixa', 'caixa', 'reator', 'poste', 'grade', 'disco'];
// v0.9: personagens jogáveis, com texturas otimizadas de 1024
const CHAR_IDS = ['abelha', 'golem', 'espirito', 'encapuzado', 'mergulhador'];

export async function loadAll(onProgress) {
  const loader = new GLTFLoader();
  const total = MODELS.length + CHAR_IDS.length + 1;
  let done = 0;
  const tick = () => onProgress(++done / total);
  // Modelos vêm em base64 (.glb.txt) para poderem ser servidos junto da página
  const loadGlb = async n => {
    const b64 = (await (await fetch(`assets/${n}.glb.txt`)).text()).trim();
    return parse(b64);
  };
  const parse = b64 => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return loader.parseAsync(bin.buffer, '');
  };
  const jobs = MODELS.map(n => loadGlb(n).then(g => { assets[n] = g; tick(); }));
  for (const id of CHAR_IDS) jobs.push(loadGlb('chars/' + id).then(g => { assets['char_' + id] = g; tick(); }));
  jobs.push(new THREE.TextureLoader().loadAsync('assets/fundo-espaco.jpg').then(t => {
    t.colorSpace = THREE.SRGBColorSpace; assets.bg = t; tick();
  }));
  await Promise.all(jobs);
}

// Cópia estática de um modelo de cenário (geometria compartilhada)
export function prop(name, sx, sy = sx, sz = sx, shadows = true) {
  const o = assets[name].scene.clone(true);
  o.scale.set(sx, sy, sz);
  o.traverse(m => { if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = true; } });
  return o;
}

// Textura radial reutilizada por brilhos e partículas
let _glow;
export function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}
