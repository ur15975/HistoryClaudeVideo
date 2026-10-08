// 配音校对：用专用听写模型逐字转写配音，再由程序对照台词判断是否多读、漏读、读错。
// 注意：通用对话模型听写时会自作主张地省略“用……的语气说”这类指令性话语，
// 所以首选 gemini-3.5-transcribe，并且不把参考台词交给模型（避免它照抄）。
import fs from 'node:fs';
import { config } from '../config.js';
import { pinyin } from 'pinyin-pro';
import { generateWithFallback } from './client.js';

export const VERIFY_VERSION = 3;

const PUNCT = /[\s，。！？、；：“”‘’（）《》,.!?;:"'()\-—…·「」]/g;
const DIGITS = '〇一二三四五六七八九';

// 阿拉伯数字的两种中文读法：逐位（一三八）与数位（一百三十八）
function numberForms(s) {
  const perDigit = s.replace(/\d/g, (d) => DIGITS[d]);
  const positional = s.replace(/\d+/g, (n) => toChineseNumber(Number(n)));
  return [perDigit, positional];
}

function toChineseNumber(n) {
  if (!Number.isFinite(n) || n > 99999) return String(n);
  if (n < 10) return DIGITS[n];
  const units = ['', '十', '百', '千', '万'];
  const ds = String(n).split('').map(Number);
  let out = '';
  ds.forEach((d, i) => {
    const pos = ds.length - 1 - i;
    if (d === 0) {
      if (!out.endsWith('〇') && pos > 0 && ds.slice(i + 1).some((x) => x)) out += '〇';
    } else out += DIGITS[d] + units[pos];
  });
  return out.replace(/^一十/, '十').replace(/〇+$/, '');
}

const norm = (s) => s.replace(PUNCT, '');

// 不带声调的拼音序列：同音字（臣/陈、凿/早）视为相同，听写模型常写成更常见的同音词
const toPinyin = (s) => pinyin(norm(s), { toneType: 'none', type: 'array' });

function editSimilarity(x, y) {
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return 1 - dp[x.length][y.length] / Math.max(1, x.length, y.length);
}

export function similarity(a, b) {
  return Math.max(editSimilarity([...norm(a)], [...norm(b)]), editSimilarity(toPinyin(a), toPinyin(b)));
}

export async function transcribe(wavFile) {
  const data = fs.readFileSync(wavFile).toString('base64');
  const audio = { inlineData: { mimeType: 'audio/wav', data } };
  const { json, model } = await generateWithFallback(config.gemini.checkModels, {
    contents: [{ parts: [audio, { text: '逐字转写这段语音中说出的全部内容，开头结尾的每一个字都不要省略，使用简体中文，只输出转写文本。' }] }],
  });
  const parts = json.candidates[0].content.parts;
  const text = parts.map((p) => p.audioTranscription?.text ?? p.text ?? '').join('').trim();
  return { text, model };
}

/**
 * 判定一次听写结果（纯函数，可以对缓存的听写原文反复判定）。
 * expected：字幕原文；spoken：实际送进 TTS 的文本（可能用同音字纠正了读音）；
 * direction：送进 TTS 的语气提示（用来识别“把提示读出来”的情况）
 */
export function judge(heard, expected, spoken = expected, direction = '') {
  const forms = numberForms(heard);
  const score = Math.max(...forms.flatMap((h) => [similarity(expected, h), similarity(spoken, h)]));
  // 是否把语气提示读了出来：出现“语气”二字，或与提示有 4 字以上的连续重合
  let leak = /语气/.test(heard) && !/语气/.test(expected);
  const dir = norm(direction);
  const h = norm(heard);
  for (let i = 0; !leak && i + 4 <= dir.length; i++) {
    const piece = dir.slice(i, i + 4);
    if (h.includes(piece) && !norm(expected).includes(piece)) leak = true;
  }
  const ok = !leak && score >= 0.8;
  const issue = leak ? '把语气提示读了出来' : score < 0.8 ? `与台词差异较大（相似度 ${(score * 100).toFixed(0)}%）` : '';
  return { ok, score, issue };
}

export async function verifyClip(wavFile, expected, spoken = expected, direction = '') {
  const { text: heard, model } = await transcribe(wavFile);
  return { v: VERIFY_VERSION, heard, model, ...judge(heard, expected, spoken, direction) };
}
