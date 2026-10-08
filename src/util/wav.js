// 最小化的 WAV 读写与处理工具（只处理 PCM s16 / float32）
import fs from 'node:fs';

export function readWav(input) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是有效的 WAV 文件');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    let size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // 部分流式 WAV 的 data 长度字段为 0 或 0xFFFFFFFF
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      data = buf.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV 缺少 fmt 或 data 块');
  return { ...decodePcm(data, fmt), sampleRate: fmt.sampleRate };
}

function decodePcm(data, fmt) {
  const { channels, bits, format } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bytes;
      let v;
      if (format === 3 && bits === 32) v = data.readFloatLE(p);
      else if (bits === 16) v = data.readInt16LE(p) / 32768;
      else if (bits === 24) v = (data.readIntLE(p, 3)) / 8388608;
      else if (bits === 32) v = data.readInt32LE(p) / 2147483648;
      else throw new Error(`不支持的位深 ${bits}`);
      out[c][i] = v;
    }
  }
  return { channels: out };
}

// 原始 PCM s16le（Gemini 旧版 TTS 返回 audio/L16）
export function pcm16ToChannels(buf, channels = 1) {
  return decodePcm(buf, { channels, bits: 16, format: 1 }).channels;
}

export function writeWav(file, channels, sampleRate) {
  const n = channels[0].length;
  const ch = channels.length;
  const data = Buffer.alloc(n * ch * 2);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      data.writeInt16LE(Math.round(v * 32767), (i * ch + c) * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * ch * 2, 28);
  header.writeUInt16LE(ch * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of channels) s += c[i];
    out[i] = s / channels.length;
  }
  return out;
}

// 线性插值重采样（对语音足够）
export function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const n = Math.floor(samples.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const f = x - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i0 + 1] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

// 去掉首尾静音，保留少量余量
export function trimSilence(samples, sampleRate, { threshold = 0.012, marginMs = 90 } = {}) {
  const win = Math.floor(sampleRate * 0.01);
  const rmsAt = (start) => {
    let s = 0;
    const end = Math.min(samples.length, start + win);
    for (let i = start; i < end; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / Math.max(1, end - start));
  };
  let start = 0;
  while (start < samples.length && rmsAt(start) < threshold) start += win;
  let end = samples.length;
  while (end > start && rmsAt(Math.max(0, end - win)) < threshold) end -= win;
  const margin = Math.floor((sampleRate * marginMs) / 1000);
  start = Math.max(0, start - margin);
  end = Math.min(samples.length, end + margin);
  if (end <= start) return samples;
  const out = samples.slice(start, end);
  // 极短的淡入淡出，避免爆音
  const fade = Math.min(Math.floor(sampleRate * 0.008), Math.floor(out.length / 4));
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return out;
}

// 口型包络：每帧一个 0..1 的响度值
export function envelope(samples, sampleRate, fps) {
  const hop = sampleRate / fps;
  const frames = Math.ceil(samples.length / hop);
  const env = new Array(frames);
  let peak = 1e-6;
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * hop);
    const b = Math.min(samples.length, Math.floor((f + 1) * hop));
    let s = 0;
    for (let i = a; i < b; i++) s += samples[i] * samples[i];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    env[f] = rms;
    if (rms > peak) peak = rms;
  }
  return env.map((v) => Math.round(Math.min(1, v / (peak * 0.7)) * 100) / 100);
}

// 压缩句中过长的停顿（TTS 有时会拖出 1 秒以上的空白）
export function compressPauses(samples, sampleRate, { maxPause = 0.32, threshold = 0.012 } = {}) {
  const win = Math.floor(sampleRate * 0.01);
  const n = Math.floor(samples.length / win);
  const silent = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * win; k < (i + 1) * win; k++) s += samples[k] * samples[k];
    silent[i] = Math.sqrt(s / win) < threshold;
  }
  const keep = Math.round(maxPause / 0.01);
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < n; ) {
    if (!silent[i]) { i++; continue; }
    let j = i;
    while (j < n && silent[j]) j++;
    if (j - i > keep && i > 0 && j < n) {
      // 保留停顿的前后各一半，中间切掉
      const cutA = (i + Math.floor(keep / 2)) * win;
      const cutB = (j - Math.ceil(keep / 2)) * win;
      parts.push(samples.subarray(cursor, cutA));
      cursor = cutB;
    }
    i = j;
  }
  parts.push(samples.subarray(cursor));
  if (parts.length === 1) return samples;
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  const fade = Math.floor(sampleRate * 0.005);
  for (const p of parts) {
    out.set(p, o);
    for (let k = 0; k < fade && k < p.length; k++) {
      out[o + k] *= k / fade;
      out[o + p.length - 1 - k] *= k / fade;
    }
    o += p.length;
  }
  return out;
}
