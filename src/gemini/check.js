// 配音校对报告：列出每句配音的听写结果（生成配音时已自动校对，这里汇总展示）
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../util/log.js';
import { synthesizeEpisode } from './tts.js';

export async function checkEpisode(episode, voiceDir) {
  const voices = await synthesizeEpisode(episode, voiceDir, { verify: true });
  const rows = [];
  for (const scene of episode.scenes) {
    (scene.lines || []).forEach((line, i) => {
      const id = `${scene.id}#${i}`;
      const v = voices.get(id);
      const meta = v.cacheFile.replace(/\.wav$/, '.check.json');
      const c = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : { ok: true, score: 1, heard: '' };
      rows.push({ id, text: line.text, ...c, duration: v.duration, tempo: v.tempo });
      const mark = c.ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
      console.log(`${mark} ${id.padEnd(6)} ${v.duration.toFixed(1).padStart(5)}s ${line.text}${c.ok ? '' : `\n     听到：${c.heard}\n     问题：${c.issue}`}`);
    });
  }
  fs.writeFileSync(path.join(path.dirname(voiceDir), 'tts_check.json'), JSON.stringify(rows, null, 2));
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) log.warn(`${bad.length} 句未通过校对。可给台词加 "say" 改写读音，或把 "take" 加 1 重新生成。`);
  else log.ok('全部配音通过校对');
}
