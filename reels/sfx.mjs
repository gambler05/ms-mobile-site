// Effets sonores des reels, entièrement synthétisés : aucun fichier audio tiers,
// donc aucun droit à vérifier. mixToWav(événements, durée) renvoie un WAV stéréo 16 bits.
const SR = 44100;

// Bruit pseudo-aléatoire à graine fixe : deux rendus donnent le même son.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2147483648 - 1; };
}
const buf = (sec) => new Float32Array(Math.round(sec * SR));
const expo = (a, b, x) => a * Math.pow(b / a, x);

// Sinusoïde dont la fréquence glisse de f0 à f1, avec décroissance exponentielle.
function sweep(sec, f0, f1, decay, attack = 0.004) {
  const o = buf(sec); let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const x = i / o.length, tt = i / SR;
    ph += (2 * Math.PI * expo(f0, f1, x)) / SR;
    o[i] = Math.sin(ph) * Math.min(1, tt / attack) * Math.exp(-tt * decay) * (1 - x) ** 0.5;
  }
  return o;
}
// Bruit filtré passe-bande (filtre à variable d'état), fréquence et enveloppe en fonction du temps.
function noise(sec, freq, env, q = 0.6, seed = 1) {
  const o = buf(sec), r = rng(seed); let low = 0, band = 0;
  for (let i = 0; i < o.length; i++) {
    const x = i / o.length, f = 2 * Math.sin((Math.PI * Math.min(freq(x), 9000)) / SR);
    const high = r() - low - q * band;
    band += f * high; low += f * band;
    o[i] = band * env(x);
  }
  return o;
}
function bell(sec, freqs, decay) {
  const o = buf(sec);
  for (let i = 0; i < o.length; i++) {
    const tt = i / SR; let v = 0;
    freqs.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * decay * (1 + k * 0.6)) / (k + 1); });
    o[i] = v * Math.min(1, tt / 0.003) * 0.6;
  }
  return o;
}
function add(dst, src, at = 0, g = 1) {
  const off = Math.round(at * SR);
  for (let i = 0; i < src.length && off + i < dst.length; i++) dst[off + i] += src[i] * g;
  return dst;
}

const SOUNDS = {
  // Passage entre deux scènes
  whoosh: () => noise(0.62, (x) => expo(350, 5200, Math.sin(Math.PI * x) ** 1.2), (x) => Math.sin(Math.PI * x) ** 2 * 1.6, 0.5, 7),
  // Apparition d'un élément
  pop: () => sweep(0.14, 880, 260, 26),
  // Mot ou petit détail
  tick: () => add(sweep(0.035, 2400, 1500, 120, 0.0008), noise(0.012, () => 6000, (x) => (1 - x) ** 3 * 0.5, 1, 3)),
  // Impact grave
  thud: () => add(sweep(0.42, 150, 42, 9, 0.002), noise(0.06, () => 900, (x) => (1 - x) ** 4 * 0.6, 0.8, 5)),
  // Erreur / interdit
  buzz: () => {
    const o = buf(0.36);
    for (let i = 0; i < o.length; i++) {
      const tt = i / SR, x = i / o.length;
      const sq = (f) => Math.tanh(4 * Math.sin(2 * Math.PI * f * tt));
      o[i] = (sq(98) + sq(104) * 0.8) * 0.32 * Math.min(1, tt / 0.004) * Math.min(1, (1 - x) / 0.25);
    }
    return o;
  },
  // Validation
  ding: () => bell(0.9, [1318.5, 2637, 3955.5], 5),
  // Fin : deux notes montantes
  chime: () => add(add(buf(1.4), bell(1.0, [987.8, 1975.5, 2963], 4.5), 0), bell(1.2, [1318.5, 2637, 3955.5], 4), 0.16),
  // Goutte
  drop: () => sweep(0.16, 420, 1500, 20, 0.006),
  // Montée (jauge, température)
  rise: () => {
    const o = buf(1.8); let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const x = i / o.length;
      ph += (2 * Math.PI * expo(180, 760, x)) / SR;
      o[i] = (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * 0.5 * Math.sin(Math.PI * Math.min(1, x * 1.02)) ** 0.6 * (0.75 + 0.25 * Math.sin(2 * Math.PI * 14 * x * 1.8));
    }
    return o;
  },
  // Extinction
  down: () => sweep(0.75, 620, 60, 2.2, 0.01),
  // Grésillement électrique
  zap: () => noise(0.22, (x) => 2500 + 2500 * Math.sin(x * 90), (x) => (Math.sin(x * 140) > 0 ? 1 : 0.15) * (1 - x) * 1.1, 0.9, 11),
  // Verre qui se fend
  crack: () => {
    const o = noise(0.2, () => 5200, (x) => (1 - x) ** 5 * 2.2, 1.1, 13), r = rng(17);
    for (let k = 0; k < 6; k++) add(o, sweep(0.02, 5200 + 2500 * r(), 3000, 200, 0.0005), 0.01 + 0.03 * k * (0.6 + 0.4 * Math.abs(r())), 0.45);
    return o;
  },
};

// Chaque son est ramené à la même crête : le volume d'un événement ne dépend plus que de son gain.
function normalize(a) {
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < a.length; i++) a[i] /= peak;
  return a;
}

export function mixToWav(events, seconds) {
  const cache = {}, n = Math.round(seconds * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  events.forEach((e, k) => {
    const make = SOUNDS[e.n];
    if (!make) throw new Error('Effet sonore inconnu : ' + e.n);
    const s = (cache[e.n] ||= normalize(make()));
    const pan = e.n === 'tick' || e.n === 'drop' || e.n === 'pop' ? (k % 2 ? 0.3 : -0.3) : 0; // léger écart stéréo
    add(L, s, Math.max(0, e.t), (e.g ?? 1) * (1 - pan));
    add(R, s, Math.max(0, e.t), (e.g ?? 1) * (1 + pan));
  });
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { // tanh : limiteur doux, jamais de saturation
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * 0.75) * 30000), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * 0.75) * 30000), 46 + i * 4);
  }
  return pcm;
}
