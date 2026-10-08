// 剧本加载与基本校验
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from './config.js';

export function resolveEpisode(arg) {
  if (!arg) throw new Error('请指定剧集，例如：npm run build -- zhang-qian');
  const candidates = [
    path.resolve(arg),
    path.resolve(arg, 'episode.json'),
    path.join(config.dirs.episodes, arg, 'episode.json'),
    path.join(config.dirs.episodes, `${arg}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) throw new Error(`找不到剧集 "${arg}"（已尝试：${candidates.map((c) => path.relative(ROOT, c)).join('，')}）`);
  return file;
}

export function loadEpisode(arg) {
  const file = resolveEpisode(arg);
  const episode = JSON.parse(fs.readFileSync(file, 'utf8'));
  episode.id ||= path.basename(path.dirname(file));
  episode.__dir = path.dirname(file);
  validate(episode, file);
  if (episode.components) {
    // 浏览器通过 HTTP 加载剧集自定义组件
    episode.components = '/' + path.relative(ROOT, path.resolve(episode.__dir, episode.components)).split(path.sep).join('/');
  }
  return episode;
}

function validate(ep, file) {
  const errs = [];
  if (!Array.isArray(ep.scenes) || !ep.scenes.length) errs.push('scenes 不能为空');
  const ids = new Set();
  for (const [i, s] of (ep.scenes || []).entries()) {
    if (!s.id) errs.push(`第 ${i} 个场景缺少 id`);
    if (ids.has(s.id)) errs.push(`场景 id 重复：${s.id}`);
    ids.add(s.id);
    if (!Array.isArray(s.layers)) errs.push(`场景 ${s.id} 缺少 layers 数组`);
    for (const [k, l] of (s.lines || []).entries()) {
      if (!l.text) errs.push(`场景 ${s.id} 第 ${k} 句缺少 text`);
      if (!l.speaker) errs.push(`场景 ${s.id} 第 ${k} 句缺少 speaker`);
      else if (!ep.cast?.[l.speaker]) errs.push(`场景 ${s.id} 第 ${k} 句的说话人 "${l.speaker}" 不在 cast 中`);
    }
    for (const layer of s.layers || []) {
      if (layer.type === 'character') {
        const cid = layer.params?.character;
        if (cid && !ep.characters?.[cid]) errs.push(`场景 ${s.id} 引用了未定义的角色 "${cid}"`);
      }
    }
  }
  if (errs.length) throw new Error(`剧本 ${file} 有问题：\n  - ${errs.join('\n  - ')}`);
}
