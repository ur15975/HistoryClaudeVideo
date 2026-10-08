// 本地程序化音频：Lyria 不可用时的五声音阶配乐兜底，以及风声、篝火等环境音
const SR = 48000;

function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// 宫调（D 宫）与羽调（B 羽）五声音阶
const SCALES = {
  gong: [62, 64, 66, 69, 71],
  yu: [59, 62, 64, 66, 69],
};

const MOODS = {
  calm: { scale: 'gong', bpm: 66, density: 0.55, drone: 0.12, register: 0 },
  sad: { scale: 'yu', bpm: 56, density: 0.45, drone: 0.14, register: -12 },
  tense: { scale: 'yu', bpm: 84, density: 0.7, drone: 0.18, register: -12, pulse: true },
  epic: { scale: 'gong', bpm: 92, density: 0.8, drone: 0.16, register: 0, pulse: true },
  wonder: { scale: 'gong', bpm: 72, density: 0.6, drone: 0.1, register: 12 },
};

function pluck(out, start, freq, amp, pan, rand, decay = 0.996) {
  const N = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = rand() * 2 - 1;
  const len = Math.min(out[0].length - start, SR * 4);
  let idx = 0;
  let prev = 0;
  const gl = Math.cos((pan * Math.PI) / 2);
  const gr = Math.sin((pan * Math.PI) / 2);
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const next = (cur + prev) * 0.5 * decay;
    prev = cur;
    buf[idx] = next;
    idx = (idx + 1) % N;
    const env = i < 48 ? i / 48 : 1;
    out[0][start + i] += cur * amp * gl * env;
    out[1][start + i] += cur * amp * gr * env;
  }
}

function reverb(ch, mix = 0.28) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0, fb: 0.82 }));
  const aps = [225, 556].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const out = new Float32Array(ch.length);
  for (let n = 0; n < ch.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = ch[n] + y * c.fb;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    s *= 0.25;
    for (const a of aps) {
      const y = a.buf[a.i];
      const x = s + y * 0.5;
      a.buf[a.i] = x;
      a.i = (a.i + 1) % a.d;
      s = y - x * 0.5;
    }
    out[n] = ch[n] * (1 - mix) + s * mix;
  }
  return out;
}

export function synthMusic({ seconds, mood = 'calm', seed = 'hcv' }) {
  const m = MOODS[mood] || MOODS.calm;
  const rand = rng(seed + mood);
  const n = Math.ceil(seconds * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  const scale = SCALES[m.scale].map((x) => x + m.register);
  const beat = 60 / m.bpm;

  // 持续低音
  const root = midiHz(scale[0] - 24);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const swell = 0.6 + 0.4 * Math.sin((2 * Math.PI * t) / 11);
    const v = (Math.sin(2 * Math.PI * root * t) + 0.5 * Math.sin(2 * Math.PI * root * 1.5 * t) +
      0.25 * Math.sin(2 * Math.PI * root * 2 * t)) * m.drone * swell;
    out[0][i] += v;
    out[1][i] += v;
  }

  // 旋律：在音阶上随机游走的拨弦（类古筝）
  let deg = 2;
  for (let t = beat; t < seconds - 2; t += beat / 2) {
    if (rand() > m.density) continue;
    deg = Math.max(0, Math.min(scale.length * 2 - 1, deg + Math.round((rand() - 0.5) * 3)));
    const midi = scale[deg % scale.length] + 12 * Math.floor(deg / scale.length);
    const start = Math.floor(t * SR);
    pluck(out, start, midiHz(midi), 0.32, 0.3 + rand() * 0.4, rand);
    // 偶尔加一个上方纯五度的和音
    if (rand() < 0.2) pluck(out, start + 2400, midiHz(midi + 7), 0.16, rand(), rand);
  }

  // 紧张或史诗段落加低沉鼓点
  if (m.pulse) {
    for (let t = 0; t < seconds; t += beat) {
      const start = Math.floor(t * SR);
      const len = Math.min(n - start, SR * 0.5);
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / (SR * 0.09));
        const v = Math.sin(2 * Math.PI * 55 * (i / SR) * (1 + env)) * env * 0.35;
        out[0][start + i] += v;
        out[1][start + i] += v;
      }
    }
  }

  const l = reverb(out[0]);
  const r = reverb(out[1]);
  fadeEdges([l, r], 1.5, 2.5);
  normalize([l, r], 0.7);
  return [l, r];
}

// 环境音
export function synthAmbience(kind, seconds, seed = 'amb') {
  const rand = rng(seed + kind);
  const n = Math.ceil(seconds * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  if (kind === 'wind' || kind === 'sand') {
    let bl = 0;
    let br = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const gust = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.7 + Math.sin(t * 0.23) * 3)) ** 2;
      const a = 0.02 + 0.03 * gust;
      bl += (rand() * 2 - 1 - bl) * a;
      br += (rand() * 2 - 1 - br) * a;
      l[i] = bl * gust * 1.6;
      r[i] = br * gust * 1.6;
    }
  } else if (kind === 'fire') {
    let b = 0;
    for (let i = 0; i < n; i++) {
      b += (rand() * 2 - 1 - b) * 0.015;
      l[i] = r[i] = b * 0.5;
    }
    for (let k = 0; k < seconds * 9; k++) {
      const start = Math.floor(rand() * n);
      const amp = 0.08 + rand() * 0.25;
      const len = Math.min(n - start, 600);
      const pan = rand();
      for (let i = 0; i < len; i++) {
        const v = (rand() * 2 - 1) * amp * Math.exp(-i / 60);
        l[start + i] += v * (1 - pan);
        r[start + i] += v * pan;
      }
    }
  } else if (kind === 'night') {
    let b = 0;
    for (let i = 0; i < n; i++) {
      b += (rand() * 2 - 1 - b) * 0.01;
      l[i] = r[i] = b * 0.3;
    }
    // 稀疏虫鸣
    for (let t = 0.5; t < seconds; t += 0.6 + rand() * 1.5) {
      const start = Math.floor(t * SR);
      const f = 4200 + rand() * 900;
      const pan = rand();
      for (let c = 0; c < 3; c++) {
        const s0 = start + c * 2600;
        for (let i = 0; i < 1800 && s0 + i < n; i++) {
          const v = Math.sin((2 * Math.PI * f * i) / SR) * Math.sin((Math.PI * i) / 1800) * 0.05;
          l[s0 + i] += v * (1 - pan);
          r[s0 + i] += v * pan;
        }
      }
    }
  }
  fadeEdges([l, r], 0.8, 0.8);
  normalize([l, r], 0.5);
  return [l, r];
}

function fadeEdges(chs, fin, fout) {
  const n = chs[0].length;
  const a = Math.floor(fin * SR);
  const b = Math.floor(fout * SR);
  for (const ch of chs) {
    for (let i = 0; i < a && i < n; i++) ch[i] *= i / a;
    for (let i = 0; i < b && i < n; i++) ch[n - 1 - i] *= i / b;
  }
}

function normalize(chs, target) {
  let peak = 1e-6;
  for (const ch of chs) for (const v of ch) peak = Math.max(peak, Math.abs(v));
  const g = target / peak;
  for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= g;
}
