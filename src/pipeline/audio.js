// 混音：旁白/对白 + 背景音乐（自动闪避）+ 环境音
import path from 'node:path';
import { config } from '../config.js';
import { log } from '../util/log.js';
import { readWav, resample, toMono, writeWav } from '../util/wav.js';
import { decodeAudio, run } from '../util/ffmpeg.js';
import { synthAmbience } from './synth.js';

const SR = config.sampleRate;

function rms(chs) {
  let s = 0;
  let n = 0;
  for (const ch of chs) for (let i = 0; i < ch.length; i += 4) { s += ch[i] * ch[i]; n++; }
  return Math.sqrt(s / Math.max(1, n));
}

export async function mixEpisode(timeline, cuesWithFiles, outDir, opts = {}) {
  const musicVolume = opts.musicVolume ?? 0.35;
  const duckDepth = opts.duckDepth ?? 0.58;
  const n = Math.ceil((timeline.duration + 0.5) * SR);
  const voice = new Float32Array(n);
  const music = [new Float32Array(n), new Float32Array(n)];
  const amb = [new Float32Array(n), new Float32Array(n)];

  // 1. 台词
  for (const scene of timeline.scenes) {
    for (const line of scene.lines) {
      if (!line.audio) continue;
      const wav = readWav(line.audio);
      const mono = resample(toMono(wav.channels), wav.sampleRate, SR);
      const gain = line.volume ?? 1;
      const at = Math.floor(line.start * SR);
      for (let i = 0; i < mono.length && at + i < n; i++) voice[at + i] += mono[i] * gain;
    }
  }
  // 旁白整体归一到约 -19 dBFS（仅计算有声部分）
  {
    let s = 0;
    let c = 0;
    for (let i = 0; i < n; i += 4) if (Math.abs(voice[i]) > 0.01) { s += voice[i] ** 2; c++; }
    const r = Math.sqrt(s / Math.max(1, c));
    const g = r > 0 ? Math.min(4, 0.112 / r) : 1;
    for (let i = 0; i < n; i++) voice[i] *= g;
  }

  // 2. 背景音乐（每段归一化后交叉淡化）
  for (const cue of cuesWithFiles) {
    const chs = await decodeAudio(cue.file, SR);
    const g0 = Math.min(4, 0.1 / Math.max(1e-4, rms(chs))) * musicVolume * (cue.volume ?? 1);
    const fadeIn = Math.floor((cue.fadeIn ?? (cue.start === 0 ? 0.3 : 2.0)) * SR);
    const tailSec = cue.tail ?? 2.5;
    const len = Math.min(chs[0].length, Math.floor((cue.duration + tailSec) * SR));
    const fadeOut = Math.floor(Math.min(tailSec + 1, cue.duration / 3) * SR);
    const at = Math.floor(cue.start * SR);
    for (let i = 0; i < len && at + i < n; i++) {
      let g = g0;
      if (i < fadeIn) g *= i / fadeIn;
      if (i > len - fadeOut) g *= (len - i) / fadeOut;
      music[0][at + i] += chs[0][i] * g;
      music[1][at + i] += chs[1][i] * g;
    }
    if (chs[0].length < (cue.duration + 1) * SR) {
      log.warn(`音乐段落「${cue.id}」只有 ${(chs[0].length / SR).toFixed(1)}s，短于需要的 ${cue.duration.toFixed(1)}s`);
    }
  }

  // 3. 环境音
  for (const scene of timeline.scenes) {
    if (!scene.ambience) continue;
    const kinds = Array.isArray(scene.ambience) ? scene.ambience : [scene.ambience];
    for (const kind of kinds) {
      const dur = scene.end - scene.start + 1.2;
      const [l, r] = synthAmbience(kind, dur, scene.id);
      const g = scene.ambienceVolume ?? 0.16;
      const at = Math.floor(Math.max(0, scene.start - 0.6) * SR);
      for (let i = 0; i < l.length && at + i < n; i++) {
        amb[0][at + i] += l[i] * g;
        amb[1][at + i] += r[i] * g;
      }
    }
  }

  // 4. 侧链闪避：说话时压低音乐和环境音
  const attack = Math.exp(-1 / (0.04 * SR));
  const release = Math.exp(-1 / (0.5 * SR));
  let env = 0;
  // 预读 150ms，让音乐在开口前就开始下沉
  const look = Math.floor(0.15 * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const x = Math.abs(voice[Math.min(n - 1, i + look)]);
    env = x > env ? attack * env + (1 - attack) * x : release * env + (1 - release) * x;
    const duck = 1 - duckDepth * Math.min(1, env / 0.03);
    const ambDuck = 1 - 0.4 * Math.min(1, env / 0.03);
    out[0][i] = voice[i] + music[0][i] * duck + amb[0][i] * ambDuck;
    out[1][i] = voice[i] + music[1][i] * duck + amb[1][i] * ambDuck;
  }

  const raw = path.join(outDir, 'mix_raw.wav');
  writeWav(raw, out, SR);
  // 响度标准化到 -16 LUFS（适合网络视频平台）
  const final = path.join(outDir, 'mix.wav');
  await run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', String(SR), final]);
  return final;
}
