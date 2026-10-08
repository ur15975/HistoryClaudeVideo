// 用 Claude 根据主题写一集新剧本（剧情 + 分镜 + 配乐提示）
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { config, ROOT, ensureDir } from '../config.js';
import { log } from '../util/log.js';
import { loadEpisode } from '../episode.js';

const ROLE = `你是一名中国历史动画的编剧兼分镜导演。你的作品模仿 TV 动画《天幕的魔女》（天幕のジャードゥーガル，Science SARU）的气质：
平面化而有纵深的画面、克制的人物表演、旁白主导的史诗叙事、在宏大历史中凝视个人命运。

你要为本项目的动画引擎写出一集完整的 episode.json。引擎只认识下面文档里列出的组件和参数，所以：
- 只使用文档中存在的组件类型与参数；地图优先使用内置地点，其他地区用 places 自建坐标（西左东右、北上南下）。
- 每个场景都要有明确的画面构图：背景 + 人物/道具 + 必要的特效，并安排镜头运动和转场。
- 史实必须准确，年代、人名、地名、官职要经得起推敲；不确定的细节用旁白的推测语气。
- 台词口语化、短句，每句不超过 40 字；人物台词每句不超过 25 字。
- 为每个角色在 characters 中设计外观（选择合适的 preset 再覆盖颜色、发型、冠帽、胡须等），在 cast 中分配 Gemini 音色。
- music.cues 覆盖全部场景，prompt 用英文描述乐器、情绪、速度。
- 只输出一个 \`\`\`json 代码块，不要输出其他内容。`;

function extractJson(text) {
  const m = /```json\s*([\s\S]*?)```/.exec(text) || /```\s*([\s\S]*?)```/.exec(text);
  const raw = (m ? m[1] : text).trim();
  return JSON.parse(raw);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function writeEpisode(topic, { id, minutes = 3 } = {}) {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const system = [
    { type: 'text', text: ROLE },
    { type: 'text', text: `# 风格指南\n\n${read('docs/style-guide.md')}` },
    { type: 'text', text: `# 剧本格式\n\n${read('docs/episode-format.md')}` },
    {
      type: 'text',
      text: `# 示例剧本（《凿空：张骞出使西域》）\n\n\`\`\`json\n${read('episodes/zhang-qian/episode.json')}\n\`\`\``,
      cache_control: { type: 'ephemeral' },
    },
  ];
  const ask = [
    `主题：${topic}`,
    `目标时长：约 ${minutes} 分钟（配音语速约每秒 4 个字）`,
    id ? `剧集 id：${id}` : '剧集 id：请用英文小写加连字符拟一个（如 chibi-battle）',
    '请输出完整的 episode.json。',
  ].join('\n');
  const messages = [{ role: 'user', content: ask }];

  const client = new Anthropic();
  log.step(`Claude（${config.claude.model}）正在创作《${topic}》…`);

  for (let round = 1; round <= 3; round++) {
    let chars = 0;
    const stream = client.beta.messages.stream({
      model: config.claude.model,
      max_tokens: 64000,
      // 被安全分类器拒绝时，服务端自动换用推荐的后备模型重试
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system,
      messages,
    });
    stream.on('text', (delta) => {
      chars += delta.length;
      if (chars % 2000 < delta.length) process.stdout.write('.');
    });
    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error('Claude API 认证失败：请在 .env 中设置 ANTHROPIC_API_KEY。也可以直接在 Claude Code 里让 Claude 按 docs/ 写剧本。');
      }
      throw err;
    }
    process.stdout.write('\n');
    if (msg.stop_reason === 'refusal') throw new Error(`Claude 拒绝了这个请求：${msg.stop_details?.explanation || '未说明原因'}`);
    if (msg.stop_reason === 'max_tokens') log.warn('输出达到长度上限，剧本可能被截断');

    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let problem;
    try {
      const episode = extractJson(text);
      const slug = slugify(id || episode.id || `episode-${Date.now()}`);
      episode.id = slug;
      const dir = ensureDir(path.join(config.dirs.episodes, slug));
      const file = path.join(dir, 'episode.json');
      fs.writeFileSync(file, JSON.stringify(episode, null, 2) + '\n');
      loadEpisode(file); // 校验
      log.ok(`剧本已写入 ${path.relative(ROOT, file)}（${episode.scenes.length} 个场景）`);
      log.info(`下一步：npm run still -- ${slug} --no-tts  先看画面；npm run build -- ${slug}  出片`);
      return file;
    } catch (err) {
      problem = err.message;
    }
    log.warn(`第 ${round} 稿未通过校验：${problem.split('\n')[0]}`);
    // 原样带回上一轮回复（含思考块），再要求修正
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({ role: 'user', content: `剧本没有通过校验：\n${problem}\n请修正后重新输出完整的 episode.json。` });
  }
  throw new Error('Claude 三次生成的剧本都没有通过校验');
}
