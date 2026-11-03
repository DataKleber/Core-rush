import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CFG } from './config.js';
import { assets } from './assets.js';

// v0.9: personagens jogáveis. Só muda a aparência e as animações — a jogabilidade é idêntica para todos.
export const CHARACTERS = [
  { id: 'abelha', name: 'Abelha Guerreira' },
  { id: 'golem', name: 'Golem de Lava' },
  { id: 'espirito', name: 'Espírito da Floresta' },
  { id: 'encapuzado', name: 'Figura Encapuzada', look: 'hood' },
  { id: 'mergulhador', name: 'Mergulhador Steampunk' },
];

const data = new Map();

// Remove o deslocamento horizontal do quadril (root motion), como já era feito com a Abelha
function stripRoot(clip) {
  const c = clip.clone();
  for (const tr of c.tracks) {
    if (/Hips\.position$/.test(tr.name)) {
      const v = tr.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

function posed(gltf, clip, t) {
  const m = SkeletonUtils.clone(gltf.scene);
  const mixer = new THREE.AnimationMixer(m);
  mixer.clipAction(clip).play(); mixer.setTime(t);
  m.updateMatrixWorld(true);
  m.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  return m;
}

// Mede altura, base e ponta do canhão (mesmo método validado na galeria)
function measure(gltf) {
  const fire = gltf.animations.find(c => c.name === 'fire');
  const box = new THREE.Box3().setFromObject(posed(gltf, fire, 0), true);
  const height = box.max.y - box.min.y, minY = box.min.y;
  const m = posed(gltf, fire, 0.31); // instante do disparo no jogo
  let best = null, bz = -1e9; const v = new THREE.Vector3();
  m.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      if (v.y > height * 0.3 + minY && v.z > bz) { bz = v.z; best = v.clone(); }
    }
  });
  return { height, minY, muzzle: best };
}

export function prepareCharacters() {
  const bee = assets['char_abelha'];
  const beeH = measure(bee).height;
  const refHeight = beeH * CFG.charScale; // todos ficam com a altura da Abelha no jogo
  for (const c of CHARACTERS) {
    const gltf = assets['char_' + c.id];
    const m = measure(gltf);
    const scale = refHeight / m.height;
    const byName = n => gltf.animations.find(a => a.name === n);
    const fire = stripRoot(byName('fire'));
    data.set(c.id, {
      ...c, gltf, scale, refHeight,
      offsetY: -m.minY * scale,
      muzzle: new THREE.Vector3(m.muzzle.x * scale, (m.muzzle.y - m.minY) * scale, m.muzzle.z * scale),
      clips: { fire, run: stripRoot(byName('run')), idle: THREE.AnimationUtils.subclip(fire, 'idle', 0, 2, 30) },
    });
  }
}
export const getCharacter = id => data.get(id) || data.get('abelha');

// Visual da Figura Encapuzada aprovado na galeria: túnica roxo-escura, detalhes lilás e contorno fino
export function applyLook(mat, look) {
  if (look !== 'hood') return;
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float clTrim = 0.0;
        {
          vec3 sc = pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2));
          float l = dot(sc, vec3(0.2126, 0.7152, 0.0722));
          float s = max(sc.r, max(sc.g, sc.b)) - min(sc.r, min(sc.g, sc.b));
          float cloth = smoothstep(0.075, 0.095, l) * (1.0 - smoothstep(0.17, 0.22, l)) * (1.0 - smoothstep(0.06, 0.12, s));
          sc = mix(sc, vec3(0.16, 0.075, 0.25) * (l / 0.11), cloth);
          clTrim = smoothstep(0.10, 0.20, s) * smoothstep(0.14, 0.22, l);
          diffuseColor.rgb = pow(sc, vec3(2.2));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.62, 0.40, 1.0) * clTrim * 0.13;`)
      .replace('#include <opaque_fragment>', `
        {
          float fres = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          outgoingLight += vec3(0.70, 0.45, 1.0) * pow(fres, 5.0) * 0.42;
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'hoodLook';
}
