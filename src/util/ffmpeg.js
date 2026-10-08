import { spawn, spawnSync } from 'node:child_process';

export function hasBinary(bin) {
  const r = spawnSync(bin, ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

export function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${bin} 退出码 ${code}\n${Buffer.concat(err).toString().slice(-2000)}`));
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

// 把任意音频解码为指定采样率的立体声 float32
export async function decodeAudio(file, sampleRate = 48000) {
  const buf = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(sampleRate), '-']);
  const n = buf.length / 8;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = buf.readFloatLE(i * 8);
    r[i] = buf.readFloatLE(i * 8 + 4);
  }
  return [l, r];
}

export async function probeDuration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.toString().trim());
}
