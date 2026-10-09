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

/**
 * 加载剧本。lang 与剧本自身语言不同时，叠加同目录下的语言覆盖层 episode.<lang>.json：
 * 覆盖层只写台词、地点牌、画面文字、角色名和读音表，画面与镜头沿用原剧本。
 */
export function loadEpisode(arg, { lang } = {}) {
  const file = resolveEpisode(arg);
  let episode = JSON.parse(fs.readFileSync(file, 'utf8'));
  episode.id ||= path.basename(path.dirname(file));
  episode.lang ||= 'zh';
  episode.__dir = path.dirname(file);
  validate(episode, file);
  if (lang && lang !== episode.lang) {
    const overlayFile = overlayPath(file, lang);
    if (!fs.existsSync(overlayFile)) {
      throw new Error(`没有 ${lang} 语言版本：缺少 ${path.relative(ROOT, overlayFile)}（格式见 docs/episode-format.md “多语言版本”）`);
    }
    const overlay = JSON.parse(fs.readFileSync(overlayFile, 'utf8'));
    episode = applyOverlay(episode, overlay, lang, overlayFile);
    validate(episode, overlayFile);
  }
  if (episode.components) {
    // 浏览器通过 HTTP 加载剧集自定义组件
    episode.components = '/' + path.relative(ROOT, path.resolve(episode.__dir, episode.components)).split(path.sep).join('/');
  }
  return episode;
}

// 覆盖层文件与剧本同名：episode.json → episode.en.json；foo.json → foo.en.json
export function overlayPath(file, lang) {
  return path.join(path.dirname(file), `${path.basename(file, '.json')}.${lang}.json`);
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// 深合并：对象逐键合并；两边都是数组时按下标逐个合并（覆盖层只需写出要改的字段）
export function mergeDeep(base, over) {
  if (over === undefined) return base;
  if (isObj(base) && isObj(over)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = mergeDeep(base[k], v);
    return out;
  }
  if (Array.isArray(base) && Array.isArray(over)) {
    const out = base.slice();
    over.forEach((v, i) => { out[i] = mergeDeep(base[i], v); });
    return out;
  }
  return over;
}

// 与语言绑定、换语言后必须丢弃的台词字段（中文的读音改写、配音版本号、中文语气提示、字幕改写）
const LANG_BOUND_LINE_FIELDS = ['say', 'take', 'tone', 'subtitle'];

function applyOverlay(base, ov, lang, file) {
  const errs = [];
  const ep = { ...base, lang, baseId: base.id, id: `${base.id}-${lang}` };
  for (const k of ['title', 'subtitle', 'description']) if (ov[k] !== undefined) ep[k] = ov[k];
  ep.cast = mergeDeep(base.cast, ov.cast || {});
  // 读音表按语言区分，不继承原剧本的
  ep.pronunciations = ov.pronunciations || {};
  if (ov.tts) ep.tts = ov.tts;
  if (ov.music) {
    const cues = (base.music?.cues || []).map((c) => mergeDeep(c, (ov.music.cues || []).find((o) => o.id === c.id) || {}));
    ep.music = { ...mergeDeep(base.music || {}, { ...ov.music, cues: undefined }), cues };
  }
  const overScenes = ov.scenes || {};
  for (const id of Object.keys(overScenes)) {
    if (!base.scenes.some((s) => s.id === id)) errs.push(`覆盖层引用了不存在的场景 ${id}`);
  }
  ep.scenes = base.scenes.map((scene) => {
    const o = overScenes[scene.id];
    // 没有覆盖的台词仍是原语言，这通常是遗漏
    if (!o) {
      if ((scene.lines || []).length) errs.push(`场景 ${scene.id} 有台词但覆盖层没有翻译`);
      return scene;
    }
    const { lines: oLines, layers: oLayers, ...rest } = o;
    const out = { ...scene, ...rest };
    const baseLines = scene.lines || [];
    if (baseLines.length) {
      if (!Array.isArray(oLines) || oLines.length !== baseLines.length) {
        errs.push(`场景 ${scene.id} 的台词数应为 ${baseLines.length}，覆盖层是 ${Array.isArray(oLines) ? oLines.length : 0}（镜头和动作按句子下标对齐，句数必须一致）`);
      } else {
        const latin = !/^(zh|ja)/.test(lang);
        out.lines = baseLines.map((line, i) => {
          const clean = { ...line };
          for (const f of LANG_BOUND_LINE_FIELDS) delete clean[f];
          // 允许直接写字符串；每句都必须有新的 text，否则原文会悄悄留在译制版里
          const o = oLines[i];
          const patch = typeof o === 'string' ? { text: o } : o;
          if (!isObj(patch) || typeof patch.text !== 'string' || !patch.text.trim()) {
            errs.push(`场景 ${scene.id} 第 ${i} 句覆盖层缺少 text`);
            return line;
          }
          if (latin && /\p{Script=Han}/u.test(patch.text)) errs.push(`场景 ${scene.id} 第 ${i} 句译文里还有汉字：${patch.text}`);
          return { ...clean, ...patch, speaker: line.speaker };
        });
      }
    }
    if (oLayers) {
      out.layers = scene.layers.map((layer, i) => {
        const patch = oLayers[i] ?? (layer.id ? oLayers[layer.id] : undefined);
        return patch ? mergeDeep(layer, patch) : layer;
      });
      for (const key of Object.keys(oLayers)) {
        const ok = /^\d+$/.test(key) ? Number(key) < scene.layers.length : scene.layers.some((l) => l.id === key);
        if (!ok) errs.push(`场景 ${scene.id} 的覆盖层引用了不存在的图层 ${key}`);
      }
    }
    return out;
  });
  if (errs.length) throw new Error(`语言覆盖层 ${path.relative(ROOT, file)} 有问题：\n  - ${errs.join('\n  - ')}`);
  return ep;
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
