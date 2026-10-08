// 逐帧渲染：Playwright 驱动 Chromium 截图，管道送入 ffmpeg 编码
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { config, ROOT, ensureDir } from '../config.js';
import { log } from '../util/log.js';
import { run } from '../util/ffmpeg.js';
import { startServer } from './server.js';

async function launch() {
  const opts = { args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] };
  if (config.chromiumPath) opts.executablePath = config.chromiumPath;
  return chromium.launch(opts);
}

function relUrl(file) {
  return '/' + path.relative(ROOT, file).split(path.sep).join('/');
}

async function openPlayer(browser, baseUrl, timelineFile, scale = 1) {
  const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: scale });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${baseUrl}/engine/player.html?timeline=${encodeURIComponent(relUrl(timelineFile))}`);
  // 模块语法错误时 window.HCV 永远不会出现，所以同时监听页面报错
  const failed = new Promise((_, rej) => page.once('pageerror', (e) => rej(new Error(`播放器脚本错误：${e.message}`))));
  await Promise.race([
    page.waitForFunction(() => window.HCV && (window.HCV.ready || window.HCV.error), null, { timeout: 120_000 }),
    failed,
  ]);
  failed.catch(() => {}); // 之后的页面报错只记录，不再中断
  const err = await page.evaluate(() => window.HCV.error);
  if (err) throw new Error(`播放器加载失败：${err}`);
  return { page, errors };
}

const stageClip = { x: 0, y: 0, width: 1920, height: 1080 };

export async function renderStills(timelineFile, times, outDir, { scale = 1 } = {}) {
  ensureDir(outDir);
  const srv = await startServer();
  const browser = await launch();
  try {
    const { page, errors } = await openPlayer(browser, srv.url, timelineFile, scale);
    const files = [];
    for (const t of times) {
      await page.evaluate((tt) => window.HCV.renderAt(tt), t);
      const file = path.join(outDir, `still_${t.toFixed(2).padStart(7, '0')}.png`);
      await page.screenshot({ path: file, clip: stageClip });
      files.push(file);
    }
    if (errors.length) log.warn(`页面报错：\n  ${errors.slice(0, 5).join('\n  ')}`);
    return files;
  } finally {
    await browser.close();
    await srv.close();
  }
}

export async function renderVideo(timelineFile, outFile, { workers = config.workers, scale = 1, from = 0, to = null, quality = 90 } = {}) {
  const tl = JSON.parse(fs.readFileSync(timelineFile, 'utf8'));
  const fps = tl.fps;
  const first = Math.floor(from * fps);
  const last = Math.min(tl.frames, to === null ? tl.frames : Math.ceil(to * fps));
  const total = last - first;
  const n = Math.max(1, Math.min(workers, Math.ceil(total / 48)));
  const segDir = ensureDir(path.join(path.dirname(outFile), 'segments'));
  const chunk = Math.ceil(total / n);
  const srv = await startServer();
  log.step(`渲染画面：${total} 帧（${(total / fps).toFixed(1)}s @${fps}fps），${n} 个并行进程`);
  let done = 0;
  const t0 = Date.now();
  const tick = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    const rate = done / Math.max(1, el);
    log.info(`  渲染进度 ${done}/${total}（${((done / total) * 100).toFixed(1)}%），${rate.toFixed(1)} 帧/秒，剩余约 ${((total - done) / Math.max(rate, 0.01)).toFixed(0)}s`);
  }, 15000);

  const segs = [];
  try {
    await Promise.all(Array.from({ length: n }, async (_, w) => {
      const a = first + w * chunk;
      const b = Math.min(last, a + chunk);
      if (a >= b) return;
      const seg = path.join(segDir, `seg_${String(w).padStart(2, '0')}.mp4`);
      segs[w] = seg;
      const browser = await launch();
      try {
        const { page, errors } = await openPlayer(browser, srv.url, timelineFile, scale);
        const ff = spawn('ffmpeg', [
          '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
          '-vf', `scale=${config.width}:${config.height}:flags=lanczos,format=yuv420p`,
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(fps), '-movflags', '+faststart', seg,
        ], { stdio: ['pipe', 'ignore', 'pipe'] });
        let ffErr = '';
        ff.stderr.on('data', (d) => { ffErr += d; });
        const closed = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg 编码失败：${ffErr.slice(-800)}`)))));
        for (let f = a; f < b; f++) {
          await page.evaluate((tt) => window.HCV.renderAt(tt), f / fps);
          const buf = await page.screenshot({ type: 'jpeg', quality, clip: stageClip });
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
          done++;
        }
        ff.stdin.end();
        await closed;
        if (errors.length) log.warn(`worker ${w} 页面报错：${errors.slice(0, 3).join(' | ')}`);
      } finally {
        await browser.close();
      }
    }));
  } finally {
    clearInterval(tick);
    await srv.close();
  }
  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile]);
  log.ok(`画面渲染完成（${((Date.now() - t0) / 1000).toFixed(0)}s）：${path.relative(ROOT, outFile)}`);
  return outFile;
}

export async function muxFinal(videoFile, audioFile, outFile, { from = 0, to = null } = {}) {
  const args = ['-y', '-v', 'error', '-i', videoFile];
  if (audioFile) {
    args.push('-ss', String(from));
    if (to !== null) args.push('-to', String(to));
    args.push('-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else args.push('-c', 'copy');
  args.push('-movflags', '+faststart', outFile);
  await run('ffmpeg', args);
  return outFile;
}
