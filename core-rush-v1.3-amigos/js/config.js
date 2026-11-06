// Valores de ajuste do jogo. Tudo aqui é provisório e pensado para balanceamento.
export const CFG = {
  matchTime: 120,          // segundos
  pointsPerSec: 1,         // pontos por segundo com o núcleo
  arenaHalf: 16,           // metade do lado da arena (32 x 32)
  charScale: 1.9,

  move: {
    maxSpeed: 7.4,         // velocidade máxima normal
    carrierMul: 0.8,       // portador anda 20% mais devagar
    attackMul: 0.4,        // velocidade durante o ataque
    accel: 62,             // aceleração (u/s²)
    reverseBoost: 1.8,     // aceleração extra ao inverter direção (evita "patinar")
    decel: 48,             // frenagem sem input
    turnRate: 24,          // velocidade de giro do corpo (v1.2: 18 -> 24, resposta mais imediata)
    radius: 0.7,
  },

  attack: {
    windup: 0.10,          // antecipação
    active: 0.10,          // janela de acerto
    recovery: 0.24,        // recuperação
    cooldown: 0.62,        // tempo entre ataques (conta desde o início)
    range: 2.7,            // alcance a partir do centro do corpo
    arc: 80,               // abertura do cone em graus
    lunge: 6.5,            // pequeno avanço ao atacar
    knockback: 12,
    stun: 0.5,
    invuln: 0.7,           // proteção após ser atingido (evita stun infinito)
    assistAngle: 32,       // correção suave de mira (não ataca sozinho)
    assistRange: 3.6,
    hitstop: 0.07,
  },

  core: {
    pickupRadius: 1.3,
    dropCooldown: 1.0,     // quem derrubou não pega de volta na hora
    carrierShield: 0.45,   // proteção curta logo após capturar
    dropSpeed: 8.5,
    floatY: 0.95,
    carryY: 3.1,
    // v0.3 (experimental) — janela de fuga na captura
    pulseRadius: 3.4,      // pulso de luz empurra quem está colado no portador
    pulsePush: 9,          // força do empurrão
    pulseStagger: 0.3,     // desequilíbrio de quem é empurrado (s)
    boostTime: 0.8,        // arrancada do portador logo após capturar (s)
    boostMul: 1.3,         // multiplicador de velocidade durante a arrancada
  },

  // v0.8 (experimental): percepção dos bots — eles decidem com base no que acontecia há X segundos,
  // como um jogador humano, sem prever a trajetória do núcleo. 0 = percepção instantânea (v0.7).
  ai: { perceptionDelay: 0.25 },

  camera: { height: 15.5, back: 10.5, fov: 42, follow: 7, lookAhead: 0.28 },
};

export const ROSTER = [
  { name: 'VOCÊ',   color: 0xffc83a, hue: 0,    player: true },
  { name: 'NÉBULA', color: 0x38b6ff, hue: 2.95, speedMul: 0.93, reaction: 0.20, accuracy: 0.72, aggression: 0.8, flank: 0.9 },
  { name: 'PRISMA', color: 0xff4fd2, hue: 4.55, speedMul: 0.92, reaction: 0.24, accuracy: 0.66, aggression: 1.0, flank: -0.9 },
  { name: 'FAÍSCA', color: 0x53f57a, hue: 1.35, speedMul: 0.94, reaction: 0.28, accuracy: 0.62, aggression: 0.6, flank: 0.0 },
];
