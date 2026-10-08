// Lyria 3 配乐：按“音乐段落（cue）”生成与时长匹配的背景音乐
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDir, ROOT } from '../config.js';
import { log } from '../util/log.js';
import { writeWav } from '../util/wav.js';
import { generateWithFallback, firstInlineData, firstText } from './client.js';
import { synthMusic } from '../pipeline/synth.js';

const DEFAULT_STYLE =
  'Instrumental underscore for a Chinese history anime. Traditional Chinese instruments, ' +
  'pentatonic melodies, warm and cinematic, even dynamics so narration can sit on top';

// 无论剧本怎么写，都追加这条：旁白下面的配乐不能有人声
const NO_VOICE = 'Strictly instrumental: absolutely no human voice, no singing, no choir, no humming, no chanting, no lyrics';

export function buildMusicPrompt(cue, style, seconds) {
  return [
    cue.prompt,
    style || DEFAULT_STYLE,
    NO_VOICE,
    `Length: about ${seconds} seconds, with a clean ending that resolves gently.`,
  ].join('. ');
}

/**
 * 为每个 cue 准备音频文件。返回 [{ ...cue, file }]
 * 优先级：cue.file（本地曲目） > Lyria 生成 > 本地合成兜底
 */
export async function prepareMusic(episode, cues, outDir, { force = false, provider } = {}) {
  ensureDir(outDir);
  const cacheDir = ensureDir(path.join(config.dirs.cache, 'music'));
  const mode = provider || episode.music?.provider || 'lyria';
  const style = episode.music?.style;
  const out = [];

  for (const cue of cues) {
    if (cue.file) {
      const candidates = [path.resolve(ROOT, cue.file), path.join(config.dirs.music, cue.file)];
      const file = candidates.find((f) => fs.existsSync(f));
      if (!file) throw new Error(`找不到音乐文件 ${cue.file}`);
      out.push({ ...cue, file });
      continue;
    }

    // 时长取整到 10 秒，避免剧本微调导致频繁重生成；多留几秒给交叉淡化
    const seconds = Math.min(180, Math.ceil((cue.duration + 4) / 10) * 10);
    const prompt = buildMusicPrompt(cue, style, seconds);

    if (mode === 'lyria') {
      const model = config.gemini.musicModels[0];
      let chosen = null;
      for (let take = 0; take < 3 && !chosen; take++) {
        const key = crypto.createHash('sha1').update(`${model}|${prompt}${take ? `|take${take}` : ''}`).digest('hex').slice(0, 20);
        const file = path.join(cacheDir, `${key}.mp3`);
        if (force || !fs.existsSync(file)) {
          log.info(`  🎵 Lyria 生成「${cue.id}」${seconds}s${take ? `（第${take + 1}版）` : ''} …`);
          try {
            const { json } = await generateWithFallback(config.gemini.musicModels, { contents: [{ parts: [{ text: prompt }] }] }, { retries: 2 });
            const inline = firstInlineData(json);
            if (!inline) throw new Error('未返回音频');
            fs.writeFileSync(file, Buffer.from(inline.data, 'base64'));
          } catch (err) {
            log.warn(`Lyria 生成失败（${err.message.slice(0, 160)}）`);
            break;
          }
        }
        const qa = await checkMusic(file);
        if (!qa || !qa.vocals) chosen = file;
        else log.warn(`  「${cue.id}」第${take + 1}版含人声（${qa.description.slice(0, 40)}），重新生成`);
        if (take === 2 && !chosen) chosen = file;
      }
      if (chosen) out.push({ ...cue, file: chosen, prompt });
      else {
        log.warn(`「${cue.id}」改用本地合成`);
        out.push({ ...cue, file: synthFallback(cue, outDir) });
      }
    } else if (mode === 'synth') {
      out.push({ ...cue, file: synthFallback(cue, outDir) });
    } else if (mode === 'none') {
      // 不要背景音乐
    } else {
      throw new Error(`未知的 music.provider: ${mode}`);
    }
  }
  return out;
}

function synthFallback(cue, outDir) {
  const file = path.join(outDir, `synth_${cue.id}.wav`);
  const channels = synthMusic({ seconds: cue.duration + 4, mood: cue.mood || 'calm', seed: cue.id });
  writeWav(file, channels, config.sampleRate);
  return file;
}

// 配乐质检：让 Gemini 听一遍，确认没有人声。结果缓存在同名 .check.json
async function checkMusic(file) {
  const meta = file.replace(/\.mp3$/, '.check.json');
  if (fs.existsSync(meta)) return JSON.parse(fs.readFileSync(meta, 'utf8'));
  try {
    const { json } = await generateWithFallback(config.gemini.checkModels, {
      contents: [{ parts: [
        { inlineData: { mimeType: 'audio/mpeg', data: fs.readFileSync(file).toString('base64') } },
        { text: '听这段音乐，只输出 JSON：{"vocals": 是否出现任何人声（歌唱、合唱、哼唱、吟唱、念白）, "description": "一句话描述乐器和情绪"}' },
      ] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const r = JSON.parse(firstText(json));
    const out = { vocals: !!r.vocals, description: String(r.description || '') };
    fs.writeFileSync(meta, JSON.stringify(out));
    return out;
  } catch (err) {
    log.warn(`配乐质检失败（${err.message.slice(0, 100)}），跳过`);
    return null;
  }
}
