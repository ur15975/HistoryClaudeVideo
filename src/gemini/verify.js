// 配音校对：让 Gemini 听写配音并对照台词判断是否多读、漏读、读错
import fs from 'node:fs';
import { config } from '../config.js';
import { generateWithFallback, firstText } from './client.js';

const strip = (s) => s.replace(/[\s，。！？、；：“”‘’（）《》,.!?;:"'()\-—…·「」]/g, '');

export function similarity(a, b) {
  const x = [...strip(a)];
  const y = [...strip(b)];
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return 1 - dp[x.length][y.length] / Math.max(1, x.length, y.length);
}

// expected：字幕原文；spoken：实际送进 TTS 的文本（可能用同音字纠正了读音）
export async function verifyClip(wavFile, expected, spoken = expected) {
  const data = fs.readFileSync(wavFile).toString('base64');
  const hint = spoken !== expected ? `（为纠正读音，配音文本写作「${spoken}」，按这个读音读出即为正确）` : '';
  const prompt = [
    `下面是一段中文配音。预期台词：「${expected}」${hint}`,
    '请仔细听，然后：',
    '1. heard：逐字写下你实际听到的全部内容，包括台词之外多读出来的话。读音与预期台词相同的字沿用预期台词的写法，数字也按预期台词的写法，使用简体中文。',
    '2. ok：实际内容与预期台词一致（允许停顿和语气差异）为 true；如果多读（例如把“用……的语气说”之类的提示读了出来）、漏读、换词或明显读错字音，为 false。',
    '3. issue：如果 ok 为 false，用一句话说明问题。',
    '只输出 JSON：{"heard": "...", "ok": true, "issue": ""}',
  ].join('\n');
  const { json } = await generateWithFallback(config.gemini.checkModels, {
    contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  let r;
  try {
    r = JSON.parse(firstText(json));
  } catch {
    r = { heard: firstText(json), ok: false, issue: '校对结果无法解析' };
  }
  const score = Math.max(similarity(expected, r.heard || ''), similarity(spoken, r.heard || ''));
  return { heard: r.heard || '', ok: !!r.ok && score >= 0.8, score, issue: r.issue || (score < 0.8 ? '听写与台词差异较大' : '') };
}
