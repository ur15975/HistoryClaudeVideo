// Gemini TTS：逐句合成配音，按内容哈希缓存
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDir } from '../config.js';
import { log, pool } from '../util/log.js';
import { readWav, pcm16ToChannels, toMono, trimSilence, compressPauses, envelope, writeWav } from '../util/wav.js';
import { run } from '../util/ffmpeg.js';
import { verifyClip } from './verify.js';
import { generateContent, firstInlineData, GeminiError, QuotaExhaustedError, isExhausted } from './client.js';
import { applyPronunciations } from './pronounce.js';

// Gemini 预置音色（可在剧本 cast 中任选）
export const VOICES = {
  Zephyr: '明亮', Puck: '欢快', Charon: '沉稳、知性', Kore: '坚定', Fenrir: '激动',
  Leda: '青春', Orus: '坚毅', Aoede: '轻快', Callirrhoe: '随和', Autonoe: '明亮',
  Enceladus: '气声', Iapetus: '清晰', Umbriel: '随和', Algieba: '圆润', Despina: '柔顺',
  Erinome: '清晰', Algenib: '沙哑', Rasalgethi: '知性', Laomedeia: '欢快', Achernar: '柔和',
  Alnilam: '果断', Schedar: '平稳', Gacrux: '成熟', Pulcherrima: '外向', Achird: '友善',
  Zubenelgenubi: '随意', Vindemiatrix: '温柔', Sadachbia: '活泼', Sadaltager: '博学', Sulafat: '温暖',
};

// 组合导演提示 + 台词。提示语不会被朗读出来（已用转写校验过）。
export function buildPrompt(line, cast, pronunciations) {
  const role = cast[line.speaker] || cast.narrator || {};
  const direction = [role.style, line.tone].filter(Boolean).join('，');
  const spoken = applyPronunciations(line.say || line.text, pronunciations);
  return direction ? `用${direction}的语气说：${spoken}` : spoken;
}

// take：同一句想换一个“版本”时递增（TTS 每次生成略有不同）
function cacheKey(model, voice, prompt, take = 0) {
  const t = take ? `|take${take}` : '';
  return crypto.createHash('sha1').update(`${model}|${voice}|${prompt}${t}`).digest('hex').slice(0, 20);
}

async function synthesize(model, voice, prompt) {
  const json = await generateContent(model, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });
  const inline = firstInlineData(json);
  if (!inline) throw new GeminiError(`${model} 未返回音频`, 200, json);
  const bytes = Buffer.from(inline.data, 'base64');
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return readWav(bytes);
  // audio/L16;codec=pcm;rate=24000
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1] || 24000);
  return { channels: pcm16ToChannels(bytes, 1), sampleRate: rate };
}

const countChars = (t) => [...t.replace(/[\s，。！？、；：“”‘’（）《》,.!?;:"'()\-—…·「」]/g, '')].length;

// 生成（或取缓存）某一句的某个“版本”。缓存按模型区分；主模型配额用尽时换后备模型
async function getTake({ voice, prompt, take, force, cacheDir, id, text }) {
  const models = config.gemini.ttsModels;
  if (!force) {
    for (const model of models) {
      const raw = path.join(cacheDir, `${cacheKey(model, voice, prompt, take)}.wav`);
      if (fs.existsSync(raw)) return { raw, model, fresh: false };
    }
  }
  let lastErr;
  for (const model of models) {
    if (isExhausted(model)) continue;
    try {
      const audio = await synthesize(model, voice, prompt);
      const raw = path.join(cacheDir, `${cacheKey(model, voice, prompt, take)}.wav`);
      writeWav(raw, audio.channels, audio.sampleRate);
      const tag = model === models[0] ? '' : `（${model}）`;
      log.info(`  🎙  ${id}${take ? ` 第${take + 1}版` : ''} [${voice}]${tag} ${text.slice(0, 26)}${text.length > 26 ? '…' : ''}`);
      return { raw, model, fresh: true };
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      if (!(err instanceof QuotaExhaustedError)) log.warn(`  ${id} ${model} 生成失败（${err.message.slice(0, 100)}），换下一个模型`);
      lastErr = err;
    }
  }
  throw lastErr || new Error('没有可用的 TTS 模型');
}

// 后期：去首尾静音 → 压缩长停顿 → 语速过慢时适度提速
async function postProcess(raw, outFile, text, opts) {
  const wav = readWav(raw);
  let mono = trimSilence(toMono(wav.channels), wav.sampleRate);
  if (opts.compressPauses !== false) mono = compressPauses(mono, wav.sampleRate, { maxPause: opts.maxPause ?? 0.34 });
  const chars = countChars(text);
  const rate = chars / (mono.length / wav.sampleRate);
  let tempo = opts.speed || 1;
  if (chars >= 6 && rate * tempo < (opts.minRate ?? 3.2)) tempo = Math.min(opts.maxTempo ?? 1.25, (opts.minRate ?? 3.2) / rate);
  writeWav(outFile, [mono], wav.sampleRate);
  if (Math.abs(tempo - 1) > 0.02) {
    const tmp = `${outFile}.tmp.wav`;
    await run('ffmpeg', ['-y', '-v', 'error', '-i', outFile, '-af', `atempo=${tempo.toFixed(3)}`, tmp]);
    fs.renameSync(tmp, outFile);
    const sped = readWav(outFile);
    mono = toMono(sped.channels);
  }
  return { samples: mono, sampleRate: wav.sampleRate, tempo };
}

/**
 * 为剧本中的每一句台词生成配音，并逐句校对。
 * 返回 Map<lineId, { file, duration, envelope }>
 */
export async function synthesizeEpisode(episode, outDir, { force = false, verify = true } = {}) {
  const cacheDir = ensureDir(path.join(config.dirs.cache, 'tts'));
  ensureDir(outDir);
  const cast = episode.cast || {};
  const ttsOpts = episode.tts || {};
  const maxTakes = ttsOpts.maxTakes ?? 3;
  const jobs = [];
  for (const scene of episode.scenes) {
    (scene.lines || []).forEach((line, i) => {
      jobs.push({ id: `${scene.id}#${i}`, line });
    });
  }
  log.step(`TTS：共 ${jobs.length} 句（模型 ${config.gemini.ttsModels[0]}${verify ? `，${config.gemini.checkModels[0]} 逐句校对` : ''}）`);

  let fresh = 0;
  let flagged = 0;
  const results = await pool(jobs, config.gemini.ttsConcurrency, async ({ id, line }) => {
    const role = cast[line.speaker] || cast.narrator;
    if (!role) throw new Error(`台词 ${id} 的说话人 "${line.speaker}" 未在 cast 中定义`);
    const voice = line.voice || role.voice || 'Charon';
    const prompt = buildPrompt(line, cast, episode.pronunciations);
    const spoken = applyPronunciations(line.say || line.text, episode.pronunciations);
    const base = line.take || 0;

    let chosen = null;
    const tried = [];
    for (let k = 0; k < (verify ? maxTakes : 1); k++) {
      const take = await getTake({ voice, prompt, take: base + k, force: force && k === 0, cacheDir, id, text: line.text });
      if (take.fresh) fresh++;
      if (!verify) { chosen = take; break; }
      const metaFile = take.raw.replace(/\.wav$/, '.check.json');
      let check = !take.fresh && fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null;
      const cachedCheck = !!check;
      if (!check) {
        try {
          check = await verifyClip(take.raw, line.text, spoken);
          fs.writeFileSync(metaFile, JSON.stringify(check));
        } catch (err) {
          // 校对服务不可用时不阻塞出片，也不写缓存，下次再校
          log.warn(`  ${id} 校对失败（${err.message.slice(0, 100)}），跳过校对`);
          check = { ok: true, score: 1, heard: '', issue: 'unchecked' };
        }
      }
      tried.push({ ...take, check });
      if (check.ok) { chosen = take; break; }
      // 缓存里早已判过不合格的版本不再重复提示
      if (!cachedCheck) log.warn(`  ${id} 第${base + k + 1}版不合格：${check.issue || ''}（听到：${check.heard.slice(0, 40)}）`);
    }
    if (!chosen) {
      tried.sort((a, b) => b.check.score - a.check.score);
      chosen = tried[0];
      flagged++;
      log.warn(`  ${id} ${maxTakes} 个版本都未通过校对，暂用相似度最高的一版。可修改 say 字段后重试`);
    }

    const file = path.join(outDir, `${id.replace('#', '_')}.wav`);
    const pp = await postProcess(chosen.raw, file, line.text, { ...ttsOpts, speed: role.speed || ttsOpts.speed });
    return [id, {
      file,
      cacheFile: chosen.raw,
      prompt,
      voice,
      tempo: pp.tempo,
      duration: pp.samples.length / pp.sampleRate,
      envelope: envelope(pp.samples, pp.sampleRate, config.fps),
    }];
  });
  log.ok(`TTS 完成：新生成 ${fresh} 句，其余来自缓存${flagged ? `；${flagged} 句未通过校对` : ''}`);
  return new Map(results);
}
