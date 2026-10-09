#!/usr/bin/env node
// 命令行入口：hcv <命令> <剧集> [选项]
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDir, ROOT } from './config.js';
import { log } from './util/log.js';
import { hasBinary } from './util/ffmpeg.js';
import { loadEpisode } from './episode.js';
import { buildTimeline, toSrt, episodeSection } from './pipeline/timeline.js';

const HELP = `
天幕 · 中国历史动画生成器

用法：node src/cli.js <命令> [参数] [选项]

命令：
  build <剧集>         一键出片：配音 → 时间线 → 配乐 → 混音 → 逐帧渲染 → 合成
  tts <剧集>           只生成配音（Gemini TTS）
  music <剧集>         只生成配乐（Lyria）
  still <剧集>         渲染关键帧截图（默认每个场景取中间一帧）
  preview <剧集>       启动本地预览服务器，在浏览器里拖动时间轴查看
  check <剧集>         用 Gemini 转写配音，检查是否读错字
  write "<主题>"       调用 Claude 根据主题写一集新剧本
  translate <剧集> --lang en   调用 Claude 为剧集写某种语言的覆盖层（台词、字幕、画面文字）
  voices               列出可用的 Gemini 音色

常用选项：
  --no-tts             不调用 TTS，按字数估算时长（无配音，快速看画面）
  --music <方式>       lyria（默认）| synth（本地合成）| none
  --force-tts          忽略缓存重新配音
  --no-verify          不做逐句配音校对（更快，但可能有读错的句子）
  --force-music        忽略缓存重新生成配乐
  --from <场景id>      只渲染从该场景开始的部分
  --to <场景id>        只渲染到该场景为止
  --workers <n>        并行渲染进程数（默认 ${config.workers}）
  --scale <0.5>        渲染缩放（草稿用 0.5 更快）
  --lang <en>          语言版本：叠加 episodes/<剧集>/episode.<lang>.json，输出到 build/<剧集>-<lang>/
  --t <1,5.5,10>       still 命令：指定时间点（秒）
  --id <slug>          write 命令：新剧集的目录名
  --minutes <n>        write 命令：目标时长（分钟）
`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key.startsWith('no-')) out[key.slice(3)] = false;
      else if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

const load = (opts) => loadEpisode(opts._[1], { lang: typeof opts.lang === 'string' ? opts.lang : undefined });

function buildDir(episode) {
  return ensureDir(path.join(config.dirs.build, episode.id));
}

// 无配音模式：按字数估算时长，并生成假的口型包络
function estimateVoices(episode) {
  const map = new Map();
  for (const scene of episode.scenes) {
    (scene.lines || []).forEach((line, i) => {
      // 中文、日文按字数（约 4 字/秒）；西文按词数（约 2.7 词/秒）
      const duration = /^(zh|ja)/.test(episode.lang || 'zh')
        ? Math.max(1.2, [...line.text.replace(/[，。！？、；：“”‘’（）《》\s]/g, '')].length * 0.24 + 0.3)
        : Math.max(1.2, line.text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length / 2.7 + 0.3);
      const frames = Math.ceil(duration * config.fps);
      const envelope = Array.from({ length: frames }, (_, f) => (Math.floor(f / 3) % 3 === 2 ? 0.1 : 0.7));
      map.set(`${scene.id}#${i}`, { file: null, duration, envelope });
    });
  }
  return map;
}

async function makeTimeline(episode, opts) {
  const dir = buildDir(episode);
  let voices;
  if (opts.tts === false) {
    log.warn('无配音模式：时长按字数估算');
    voices = estimateVoices(episode);
  } else {
    const { synthesizeEpisode } = await import('./gemini/tts.js');
    voices = await synthesizeEpisode(episode, path.join(dir, 'voice'), { force: !!opts['force-tts'], verify: opts.verify !== false });
  }
  const timeline = buildTimeline(episode, voices, { fps: config.fps, width: config.width, height: config.height });
  const file = path.join(dir, 'timeline.json');
  fs.writeFileSync(file, JSON.stringify(timeline));
  fs.writeFileSync(path.join(dir, `${episode.id}.srt`), toSrt(timeline));
  log.ok(`时间线：${timeline.scenes.length} 个场景，总长 ${timeline.duration.toFixed(1)}s → ${path.relative(ROOT, file)}`);
  return { timeline, file, dir };
}

function sceneRange(timeline, opts) {
  const find = (id) => {
    const s = timeline.scenes.find((x) => x.id === id);
    if (!s) throw new Error(`找不到场景 ${id}`);
    return s;
  };
  const from = opts.from ? find(opts.from).start : 0;
  const to = opts.to ? find(opts.to).end : null;
  return { from, to };
}

async function makeAudio(episode, timeline, dir, opts) {
  const { prepareMusic } = await import('./gemini/music.js');
  const { mixEpisode } = await import('./pipeline/audio.js');
  let cues = [];
  const provider = opts.music === false ? 'none' : typeof opts.music === 'string' ? opts.music : undefined;
  if (timeline.cues.length && provider !== 'none') {
    log.step(`配乐：${timeline.cues.length} 段`);
    cues = await prepareMusic(episode, timeline.cues, path.join(dir, 'music'), { force: !!opts['force-music'], provider });
    log.ok('配乐就绪');
  }
  log.step('混音');
  const mix = await mixEpisode(timeline, cues, dir, episode.mix || {});
  log.ok(`混音完成：${path.relative(ROOT, mix)}`);
  return mix;
}

const commands = {
  async build(opts) {
    for (const bin of ['ffmpeg', 'ffprobe']) if (!hasBinary(bin)) throw new Error(`需要安装 ${bin}`);
    const episode = load(opts);
    log.step(`开始制作《${episode.title}》${episode.subtitle ? `：${episode.subtitle}` : ''}`);
    const { timeline, file, dir } = await makeTimeline(episode, opts);
    const mix = await makeAudio(episode, timeline, dir, opts);
    const { from, to } = sceneRange(timeline, opts);
    const { renderVideo, muxFinal } = await import('./pipeline/render.js');
    const video = await renderVideo(file, path.join(dir, 'video.mp4'), {
      workers: Number(opts.workers || config.workers), scale: Number(opts.scale || 1), from, to,
    });
    const suffix = opts.from || opts.to ? `_${opts.from || 'start'}-${opts.to || 'end'}` : '';
    const out = path.join(dir, `${episode.id}${suffix}.mp4`);
    await muxFinal(video, mix, out, { from, to });
    log.ok(`成片：${path.relative(ROOT, out)}`);
  },

  async tts(opts) {
    const episode = load(opts);
    const { synthesizeEpisode } = await import('./gemini/tts.js');
    await synthesizeEpisode(episode, path.join(buildDir(episode), 'voice'), { force: !!opts.force, verify: opts.verify !== false });
  },

  async music(opts) {
    const episode = load(opts);
    const { timeline, dir } = await makeTimeline(episode, opts);
    await makeAudio(episode, timeline, dir, { ...opts, 'force-music': opts.force || opts['force-music'] });
  },

  async timeline(opts) {
    const episode = load(opts);
    await makeTimeline(episode, opts);
  },

  async still(opts) {
    const episode = load(opts);
    const dir = buildDir(episode);
    const file = path.join(dir, 'timeline.json');
    let timeline;
    if (fs.existsSync(file) && !opts.rebuild) {
      timeline = JSON.parse(fs.readFileSync(file, 'utf8'));
      // 剧本修改后时间线中的画面描述需要刷新（不重新配音）
      const fresh = load(opts);
      const byId = Object.fromEntries(fresh.scenes.map((s) => [s.id, s]));
      const sameShape = timeline.scenes.length === fresh.scenes.length && timeline.scenes.every((s) => byId[s.id] && (byId[s.id].lines || []).length === s.lines.length);
      if (sameShape) {
        timeline.scenes = timeline.scenes.map((s) => {
          const f = byId[s.id];
          const lines = s.lines.map((l, i) => ({ ...l, ...f.lines[i], start: l.start, end: l.end, duration: l.duration, envelope: l.envelope, audio: l.audio, id: l.id }));
          return { ...f, start: s.start, end: s.end, index: s.index, transition: s.transition, lines };
        });
        timeline.episode = episodeSection(fresh);
        fs.writeFileSync(file, JSON.stringify(timeline));
      } else {
        ({ timeline } = await makeTimeline(fresh, { ...opts, tts: opts.tts }));
      }
    } else {
      ({ timeline } = await makeTimeline(episode, opts));
    }
    let times;
    if (opts.t) times = String(opts.t).split(',').map(Number);
    else if (opts.scene) {
      const s = timeline.scenes.find((x) => x.id === opts.scene);
      times = [0.15, 0.4, 0.65, 0.9].map((k) => s.start + (s.end - s.start) * k);
    } else times = timeline.scenes.map((s) => s.start + Math.min(s.end - s.start - 0.1, Math.max((s.transition?.duration || 0) + 0.5, (s.end - s.start) * 0.55)));
    const { renderStills } = await import('./pipeline/render.js');
    const files = await renderStills(file, times, path.join(dir, 'stills'), { scale: Number(opts.scale || 1) });
    log.ok(`已输出 ${files.length} 张截图到 ${path.relative(ROOT, path.join(dir, 'stills'))}`);
    for (const f of files) console.log('  ' + path.relative(ROOT, f));
  },

  async preview(opts) {
    const episode = load(opts);
    const dir = buildDir(episode);
    const file = path.join(dir, 'timeline.json');
    if (!fs.existsSync(file)) await makeTimeline(episode, { ...opts, tts: opts.tts });
    const { startServer } = await import('./pipeline/server.js');
    const srv = await startServer({ port: Number(opts.port || 5173), host: opts.host || '127.0.0.1' });
    const rel = (f) => '/' + path.relative(ROOT, f).split(path.sep).join('/');
    const mix = path.join(dir, 'mix.wav');
    const url = `${srv.url}/engine/player.html?interactive&timeline=${encodeURIComponent(rel(file))}${fs.existsSync(mix) ? `&audio=${encodeURIComponent(rel(mix))}` : ''}`;
    log.ok(`预览地址：${url}`);
    log.info('按 Ctrl+C 退出');
  },

  async check(opts) {
    const episode = load(opts);
    const { checkEpisode } = await import('./gemini/check.js');
    await checkEpisode(episode, path.join(buildDir(episode), 'voice'));
  },

  async write(opts) {
    const topic = opts._.slice(1).join(' ');
    if (!topic) throw new Error('请提供主题，例如：npm run write -- "赤壁之战"');
    const { writeEpisode } = await import('./claude/writer.js');
    await writeEpisode(topic, { id: opts.id, minutes: Number(opts.minutes || 3) });
  },

  async translate(opts) {
    if (typeof opts.lang !== 'string') throw new Error('请指定语言，例如：node src/cli.js translate zhang-qian --lang en');
    const { translateEpisode } = await import('./claude/translate.js');
    await translateEpisode(opts._[1], opts.lang);
  },

  async voices() {
    const { VOICES } = await import('./gemini/tts.js');
    for (const [k, v] of Object.entries(VOICES)) console.log(`  ${k.padEnd(14)} ${v}`);
  },
};

const opts = parseArgs(process.argv.slice(2));
const cmd = opts._[0];
if (!cmd || opts.help || !commands[cmd]) {
  console.log(HELP);
  process.exit(cmd && !commands[cmd] ? 1 : 0);
}
commands[cmd](opts).catch((err) => {
  log.error(err.stack || err.message);
  process.exit(1);
});
