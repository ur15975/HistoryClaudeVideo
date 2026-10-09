// 用 Claude 为已有剧集写某种语言的覆盖层 episode.<lang>.json（台词、地点牌、画面文字、角色名）
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '../config.js';
import { log } from '../util/log.js';
import { loadEpisode, resolveEpisode, overlayPath } from '../episode.js';
import { askClaudeForJson } from './client.js';

const LANG_NAMES = { en: 'English', ja: '日本語', fr: 'Français', de: 'Deutsch', es: 'Español', ko: '한국어' };

export async function translateEpisode(arg, lang) {
  const file = resolveEpisode(arg);
  const dir = path.dirname(file);
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const example = path.join(ROOT, 'episodes/zhang-qian/episode.en.json');
  const target = LANG_NAMES[lang] || lang;

  // 实际配音时长决定了每句译文的目标长度
  let durations = '';
  const tl = path.join(config.dirs.build, base.id || path.basename(dir), 'timeline.json');
  if (fs.existsSync(tl)) {
    const t = JSON.parse(fs.readFileSync(tl, 'utf8'));
    durations = t.scenes.flatMap((s) => s.lines.map((l) => `${l.id} ${l.duration.toFixed(1)}s`)).join('\n');
  }

  const system = [
    {
      type: 'text',
      text: `你是中国历史动画的译制导演。为已有的中文剧集写 ${target} 语言覆盖层：只翻译台词、地点牌、画面文字和角色名，画面与镜头不变。
要求：忠于史实与原意；旁白像高水准纪录片一样自然、克制、有画面感；人名地名用通行拼写；每句台词翻译后的朗读时长应接近原配音时长；
每句不超过两行字幕；句数与顺序必须与原剧本完全一致。地图地名由引擎处理，不用翻译。只输出一个 \`\`\`json 代码块。`,
    },
    { type: 'text', text: `# 风格指南\n\n${read('docs/style-guide.md')}` },
    { type: 'text', text: `# 剧本格式（含“多语言版本”一节）\n\n${read('docs/episode-format.md')}` },
    ...(fs.existsSync(example) ? [{ type: 'text', text: `# 示例：《凿空》的英文覆盖层\n\n\`\`\`json\n${fs.readFileSync(example, 'utf8')}\n\`\`\`` }] : []),
    { type: 'text', text: `# 要翻译的剧本\n\n\`\`\`json\n${fs.readFileSync(file, 'utf8')}\n\`\`\``, cache_control: { type: 'ephemeral' } },
  ];
  const ask = [
    `目标语言：${target}（lang: "${lang}"）`,
    durations ? `原配音每句时长（译文按每秒约 2.7 个英文词或相当的长度控制）：\n${durations}` : '',
    `请输出完整的 episode.${lang}.json。`,
  ].filter(Boolean).join('\n\n');

  log.step(`Claude（${config.claude.model}）正在把《${base.title}》译为 ${target}…`);
  const out = overlayPath(file, lang);
  // 校验要求先落盘；全部失败时恢复原来的覆盖层（可能是手工调过的）
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  try {
    return await askClaudeForJson({
    system,
    ask,
    what: path.basename(out),
    accept(overlay) {
      overlay.lang = lang;
      fs.writeFileSync(out, JSON.stringify(overlay, null, 2) + '\n');
      loadEpisode(file, { lang }); // 校验覆盖层，失败会让 Claude 修正
      log.ok(`已写入 ${path.relative(ROOT, out)}`);
      log.info(`下一步：npm run still -- ${base.id} --lang ${lang} --no-tts --rebuild  检查画面文字；npm run build -- ${base.id} --lang ${lang}  出片`);
      return out;
    },
    });
  } catch (err) {
    if (prev !== null) fs.writeFileSync(out, prev);
    else if (fs.existsSync(out)) fs.rmSync(out);
    throw err;
  }
}
