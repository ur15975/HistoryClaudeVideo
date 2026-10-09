// 天幕动画引擎：把时间线 JSON 变成可逐帧确定渲染的 SVG 画面
import { svg, html, W, H, PALETTE, rng, clamp, lerp, getEase, uid, smooth } from './lib/core.js';
import { get as getComponent, components } from './lib/registry.js';
import './lib/backgrounds.js';
import './lib/characters.js';
import './lib/props.js';
import './lib/effects.js';
import './lib/maps.js';
import './lib/text.js';

// ───────────────────────── 时间表达式 ─────────────────────────
// 数字（场景内秒数）、"line:2"、"line:2:end"、"end-1.5"、"line:0+0.8"
function makeTimeOf(scene) {
  const dur = scene.end - scene.start;
  return (spec, fallback = 0) => {
    if (spec === undefined || spec === null) return fallback;
    if (typeof spec === 'number') return spec;
    const m = /^\s*(start|end|line:(\d+)(:end)?)\s*([+-]\s*[\d.]+)?\s*$/.exec(String(spec));
    if (!m) throw new Error(`无法解析时间 "${spec}"（场景 ${scene.id}）`);
    let base;
    if (m[1] === 'start') base = 0;
    else if (m[1] === 'end') base = dur;
    else {
      const line = scene.lines[Number(m[2])];
      if (!line) throw new Error(`场景 ${scene.id} 没有第 ${m[2]} 句台词`);
      base = (m[3] ? line.end : line.start) - scene.start;
    }
    return base + (m[4] ? Number(m[4].replace(/\s/g, '')) : 0);
  };
}

// ───────────────────────── 场景运行时 ─────────────────────────
class SceneRuntime {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.duration = scene.end - scene.start;
    this.timeOf = makeTimeOf(scene);
    this.root = html('div', { class: 'scene', 'data-scene': scene.id });
    this.svg = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'scene-svg' });
    this.defs = svg('defs');
    this.svg.appendChild(this.defs);
    this.root.appendChild(this.svg);
    this.ctx = this.makeCtx();
    this.layers = [];
    this.byId = {};
    for (const [i, spec] of (scene.layers || []).entries()) this.addLayer(spec, i);
  }

  makeCtx() {
    const scene = this.scene;
    const tl = this.player.timeline;
    const self = this;
    return {
      scene,
      timeline: tl,
      episode: tl.episode,
      // 画面文字的语言；拉丁文字（英文等）时组件改用横排与西文字体
      lang: tl.episode.lang || 'zh',
      latin: !/^(zh|ja)/.test(tl.episode.lang || 'zh'),
      fps: tl.fps,
      defs: this.defs,
      duration: this.duration,
      timeOf: this.timeOf,
      rng: (seed) => rng(`${scene.id}:${seed}`),
      uid,
      character: (id) => tl.episode.characters?.[id],
      // 某角色在时刻 t 的张嘴程度（0..1），由配音音量包络驱动
      mouth(charId, t) {
        const abs = scene.start + t;
        for (const line of scene.lines) {
          if (line.speaker !== charId || abs < line.start || abs > line.end) continue;
          const f = Math.floor((abs - line.start) * tl.fps);
          return line.envelope?.[f] ?? 0;
        }
        return 0;
      },
      speaking(charId, t) {
        const abs = scene.start + t;
        return scene.lines.some((l) => l.speaker === charId && abs >= l.start && abs <= l.end);
      },
      // 当前台词（用于随台词切换表情）
      lineAt(t) {
        const abs = scene.start + t;
        let current = null;
        for (const l of scene.lines) if (abs >= l.start - 0.2) current = l;
        return current;
      },
      layer: (id) => self.byId[id],
    };
  }

  addLayer(spec, i) {
    const factory = getComponent(spec.type);
    const params = { ...(spec.params || {}) };
    const inst = factory(params, this.ctx, spec) || {};
    const cam = svg('g', { class: 'cam' });
    const wrap = svg('g', { class: `layer layer-${spec.type.replace(/\./g, '-')}`, 'data-id': spec.id || `L${i}` });
    if (spec.blend) wrap.style.mixBlendMode = spec.blend;
    if (spec.filter) wrap.setAttribute('filter', spec.filter);
    wrap.appendChild(inst.el);
    cam.appendChild(wrap);
    this.svg.appendChild(cam);
    const depth = spec.depth ?? (spec.type.startsWith('bg.') ? 0.6 : spec.type.startsWith('overlay.') || spec.type.startsWith('text.') ? 0 : 1);
    const layer = { spec, inst, cam, wrap, depth };
    this.layers.push(layer);
    if (spec.id) this.byId[spec.id] = layer;
  }

  cameraAt(t) {
    const c = this.scene.camera;
    const base = { x: W / 2, y: H / 2, zoom: 1, rotate: 0 };
    if (!c) return base;
    let cam;
    if (Array.isArray(c)) {
      // 关键帧形式 [{at, x, y, zoom, ease}]
      const keys = c.map((k) => ({ ...base, ...k, at: this.timeOf(k.at, 0) })).sort((a, b) => a.at - b.at);
      cam = keys[0];
      for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (t >= a.at && t <= b.at) {
          const p = getEase(b.ease)((t - a.at) / Math.max(1e-6, b.at - a.at));
          cam = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), zoom: lerp(a.zoom, b.zoom, p), rotate: lerp(a.rotate, b.rotate, p) };
          break;
        }
        if (t > b.at) cam = b;
      }
    } else {
      const from = { ...base, ...(c.from || {}) };
      const to = { ...from, ...(c.to || {}) };
      const a = this.timeOf(c.start, 0);
      const b = this.timeOf(c.end, this.duration);
      const p = getEase(c.ease || 'inOutSine')(clamp((t - a) / Math.max(1e-6, b - a)));
      cam = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), zoom: lerp(from.zoom, to.zoom, p), rotate: lerp(from.rotate, to.rotate, p) };
    }
    // 手持感/震动
    const shake = this.scene.cameraShake;
    if (shake) {
      const amp = typeof shake === 'number' ? shake : shake.amp || 4;
      cam.x += Math.sin(t * 13.1) * amp + Math.sin(t * 7.3) * amp * 0.5;
      cam.y += Math.cos(t * 11.7) * amp * 0.6;
    }
    return cam;
  }

  layerState(layer, t) {
    const s = layer.spec;
    let x = s.x ?? 0;
    let y = s.y ?? 0;
    let scale = s.scale ?? 1;
    let rotate = s.rotate ?? 0;
    let opacity = s.opacity ?? 1;
    // 位移关键帧
    for (const m of s.moves || []) {
      const a = this.timeOf(m.at, 0);
      const d = m.until !== undefined ? this.timeOf(m.until) - a : m.duration ?? 1;
      const p = getEase(m.ease || 'inOutSine')(clamp((t - a) / Math.max(1e-6, d)));
      if (p <= 0) continue;
      if (m.x !== undefined) x = lerp(x, m.x, p);
      if (m.y !== undefined) y = lerp(y, m.y, p);
      if (m.scale !== undefined) scale = lerp(scale, m.scale, p);
      if (m.rotate !== undefined) rotate = lerp(rotate, m.rotate, p);
      if (m.opacity !== undefined) opacity = lerp(opacity, m.opacity, p);
    }
    // 入场/出场
    const apply = (anim, p, dir) => {
      const k = 1 - p; // 未完成的比例
      switch (anim.type || 'fade') {
        case 'fade': opacity *= p; break;
        case 'rise': opacity *= p; y += (anim.distance ?? 60) * k * dir; break;
        case 'sink': opacity *= p; y -= (anim.distance ?? 60) * k * dir; break;
        case 'slide-left': x += (anim.distance ?? 400) * k; opacity *= Math.min(1, p * 2); break;
        case 'slide-right': x -= (anim.distance ?? 400) * k; opacity *= Math.min(1, p * 2); break;
        case 'pop': opacity *= Math.min(1, p * 3); scale *= lerp(0.6, 1, getEase('outBack')(p)); break;
        case 'zoom': opacity *= p; scale *= lerp(anim.from ?? 1.15, 1, p); break;
        case 'none': break;
        default: opacity *= p;
      }
    };
    if (s.enter) {
      const e = typeof s.enter === 'string' ? { type: s.enter } : s.enter;
      const a = this.timeOf(e.at, 0);
      const p = getEase(e.ease || 'outCubic')(clamp((t - a) / (e.duration ?? 0.8)));
      apply(e, p, 1);
    }
    if (s.exit) {
      const e = typeof s.exit === 'string' ? { type: s.exit } : s.exit;
      const d = e.duration ?? 0.8;
      const a = this.timeOf(e.at, this.duration - d);
      const p = getEase(e.ease || 'inCubic')(clamp((t - a) / d));
      apply(e, 1 - p, -1);
    }
    if (s.show) {
      const [a, b] = s.show.map((v, i) => this.timeOf(v, i ? this.duration : 0));
      if (t < a || t > b) opacity = 0;
    }
    return { x, y, scale, rotate, opacity };
  }

  update(t) {
    const cam = this.cameraAt(t);
    for (const layer of this.layers) {
      const d = layer.depth;
      const zoom = 1 + (cam.zoom - 1) * d;
      const cx = W / 2 + (cam.x - W / 2) * d;
      const cy = H / 2 + (cam.y - H / 2) * d;
      const rot = (cam.rotate || 0) * d;
      layer.cam.setAttribute('transform',
        `translate(${W / 2},${H / 2}) rotate(${rot.toFixed(3)}) scale(${zoom.toFixed(5)}) translate(${(-cx).toFixed(2)},${(-cy).toFixed(2)})`);
      const st = this.layerState(layer, t);
      const flip = layer.spec.flip ? -1 : 1;
      layer.wrap.setAttribute('transform',
        `translate(${st.x.toFixed(2)},${st.y.toFixed(2)}) rotate(${st.rotate.toFixed(3)}) scale(${(st.scale * flip).toFixed(4)},${st.scale.toFixed(4)})`);
      layer.wrap.style.opacity = st.opacity.toFixed(3);
      layer.wrap.style.display = st.opacity <= 0.001 ? 'none' : '';
      if (st.opacity > 0.001 && layer.inst.update) layer.inst.update(t, this.ctx);
    }
  }
}

// ───────────────────────── 转场 ─────────────────────────
function applyTransition(node, tr, p, seed) {
  node.style.opacity = '';
  node.style.clipPath = '';
  node.style.webkitMaskImage = '';
  node.style.maskImage = '';
  node.style.filter = '';
  if (p >= 1) return null;
  const type = tr.type || 'fade';
  if (type === 'fade') {
    node.style.opacity = p.toFixed(3);
  } else if (type === 'ink') {
    // 墨晕：若干个墨点向外洇开
    const r = rng(seed);
    const blobs = [];
    const n = tr.blobs || 5;
    for (let i = 0; i < n; i++) {
      const cx = i === 0 ? 50 : r.range(10, 90);
      const cy = i === 0 ? 50 : r.range(15, 85);
      const delay = i === 0 ? 0 : r.range(0.05, 0.35);
      const q = clamp((p - delay) / (1 - delay));
      const rad = getEase('inOutQuad')(q) * (i === 0 ? 125 : r.range(55, 90));
      if (rad <= 0) continue;
      blobs.push(`radial-gradient(circle at ${cx}% ${cy}%, #000 ${Math.max(0, rad - 9).toFixed(2)}%, transparent ${rad.toFixed(2)}%)`);
    }
    const mask = blobs.length ? blobs.join(',') : 'linear-gradient(transparent, transparent)';
    node.style.webkitMaskImage = mask;
    node.style.maskImage = mask;
  } else if (type === 'scroll' || type === 'wipe') {
    // 手卷从右向左展开
    const e = getEase('inOutCubic')(p);
    node.style.clipPath = `inset(0 0 0 ${((1 - e) * 100).toFixed(3)}%)`;
    return type === 'scroll' ? { rodX: (1 - e) * W } : null;
  } else if (type === 'wipe-right') {
    const e = getEase('inOutCubic')(p);
    node.style.clipPath = `inset(0 ${((1 - e) * 100).toFixed(3)}% 0 0)`;
  } else if (type === 'iris') {
    const e = getEase('inOutCubic')(p);
    node.style.clipPath = `circle(${(e * 75).toFixed(3)}% at ${tr.x ?? 50}% ${tr.y ?? 50}%)`;
  } else if (type === 'dip' || type === 'dip-black' || type === 'flash') {
    node.style.opacity = p < 0.5 ? '0' : smooth(0.5, 1, p).toFixed(3);
    const color = type === 'dip-black' ? '#0d0b10' : type === 'flash' ? '#fffaf0' : PALETTE.paper;
    return { dip: Math.sin(Math.PI * p), color };
  } else if (type === 'blur') {
    node.style.opacity = p.toFixed(3);
    node.style.filter = `blur(${((1 - p) * 18).toFixed(1)}px)`;
  }
  return null;
}

// ───────────────────────── 播放器 ─────────────────────────
export class Player {
  constructor(stage) {
    this.stage = stage;
    this.runtimes = new Map();
  }

  async load(timeline, { base = '' } = {}) {
    this.timeline = timeline;
    // 剧集自带的自定义组件（Claude 为某一集专门绘制的画面）
    if (timeline.episode.components) {
      await import(`${base}${timeline.episode.components}`);
    }
    this.layersEl = html('div', { class: 'scenes' });
    this.dipEl = html('div', { class: 'dip' });
    this.rodEl = html('div', { class: 'scroll-rod' });
    this.subEl = html('div', { class: 'subtitle' });
    this.capEl = html('div', { class: 'caption' });
    this.grainEl = html('div', { class: 'grain' });
    this.paperEl = html('div', { class: 'paper' });
    this.vignetteEl = html('div', { class: 'vignette' });
    this.stage.append(this.layersEl, this.dipEl, this.rodEl, this.paperEl, this.grainEl, this.vignetteEl, this.capEl, this.subEl);
    const lang = timeline.episode.lang || 'zh';
    this.stage.classList.add(`lang-${lang}`);
    if (!/^(zh|ja)/.test(lang)) this.stage.classList.add('latin');
    document.documentElement.lang = lang;
    makeTextures(this);
    await this.preloadFonts();
  }

  async preloadFonts() {
    // 把所有会出现的文字先排一遍，触发按需字体子集加载
    const texts = [];
    for (const s of this.timeline.scenes) {
      for (const l of s.lines) texts.push(l.text);
      if (s.caption) texts.push(s.caption);
      for (const layer of s.layers || []) texts.push(JSON.stringify(layer.params || {}));
    }
    for (const c of Object.values(this.timeline.episode.cast || {})) texts.push(c.name || '');
    const all = texts.join('') + (this.timeline.episode.title || '') + (this.timeline.episode.subtitle || '');
    const probe = html('div', { class: 'font-probe' });
    for (const fam of ['var(--font-sub)', 'var(--font-title)', 'var(--font-brush)', 'var(--font-latin)', 'var(--font-latin-title)']) {
      probe.appendChild(html('span', { style: { fontFamily: fam }, text: all }));
      probe.appendChild(html('b', { style: { fontFamily: fam }, text: all }));
      probe.appendChild(html('i', { style: { fontFamily: fam, fontWeight: 500 }, text: all }));
    }
    document.body.appendChild(probe);
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r()));
    await document.fonts.ready;
    probe.remove();
  }

  sceneIndexAt(t) {
    const scenes = this.timeline.scenes;
    for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i].start) return i;
    return 0;
  }

  runtime(i) {
    if (!this.runtimes.has(i)) {
      const rt = new SceneRuntime(this.timeline.scenes[i], this);
      this.runtimes.set(i, rt);
      this.layersEl.appendChild(rt.root);
    }
    return this.runtimes.get(i);
  }

  renderAt(t) {
    const tl = this.timeline;
    t = clamp(t, 0, tl.duration - 1e-4);
    const i = this.sceneIndexAt(t);
    const scene = tl.scenes[i];
    const tr = scene.transition || { type: 'cut', duration: 0 };
    const inTransition = i > 0 && tr.duration > 0 && t < scene.start + tr.duration;
    const needed = new Set([i]);
    if (inTransition) needed.add(i - 1);
    // 只保留需要的场景，其余卸载以节省内存
    for (const [k, rt] of this.runtimes) {
      if (!needed.has(k) && Math.abs(k - i) > 1) {
        rt.root.remove();
        this.runtimes.delete(k);
      }
    }
    for (const [k, rt] of this.runtimes) rt.root.style.display = needed.has(k) ? '' : 'none';

    let overlay = null;
    if (inTransition) {
      const prev = this.runtime(i - 1);
      prev.root.style.zIndex = 1;
      prev.update(t - prev.scene.start);
      applyTransition(prev.root, { type: 'cut' }, 1);
    }
    const cur = this.runtime(i);
    cur.root.style.zIndex = 2;
    cur.update(t - scene.start);
    const p = inTransition ? (t - scene.start) / tr.duration : 1;
    overlay = applyTransition(cur.root, tr, p, scene.id);

    // 场景结尾淡出（通常用于最后一幕）
    if (!overlay && scene.fadeOut) {
      const k = smooth(scene.end - scene.fadeOut, scene.end, t);
      if (k > 0) overlay = { dip: k, color: scene.fadeColor || '#0d0b10' };
    }
    // 浸染色/闪白
    if (overlay?.dip !== undefined) {
      this.dipEl.style.background = overlay.color;
      this.dipEl.style.opacity = overlay.dip.toFixed(3);
    } else this.dipEl.style.opacity = '0';
    // 卷轴轴杆
    if (overlay?.rodX !== undefined) {
      this.rodEl.style.display = 'block';
      this.rodEl.style.transform = `translateX(${overlay.rodX.toFixed(1)}px)`;
    } else this.rodEl.style.display = 'none';

    this.updateSubtitle(t, scene);
    this.updateCaption(t, scene);
    // 胶片颗粒按 12fps 换帧
    const g = Math.floor(t * 12) % 3;
    this.grainEl.style.backgroundPosition = `${g * 173}px ${g * 97}px`;
    return document.fonts.ready;
  }

  updateSubtitle(t, scene) {
    if (this.timeline.episode.subtitles === false || scene.subtitles === false) {
      this.subEl.style.opacity = '0';
      return;
    }
    let line = null;
    for (const l of scene.lines) if (t >= l.start - 0.05 && t <= l.end + 0.25) line = l;
    if (!line) {
      this.subEl.style.opacity = '0';
      return;
    }
    const key = line.id;
    if (this.subEl.dataset.key !== key) {
      this.subEl.dataset.key = key;
      this.subEl.innerHTML = '';
      const cast = this.timeline.episode.cast || {};
      const who = cast[line.speaker];
      if (line.speaker !== 'narrator' && who?.name) {
        this.subEl.appendChild(html('span', { class: 'speaker', text: who.name, style: { background: who.color || PALETTE.vermilion } }));
      }
      this.subEl.appendChild(html('span', { class: line.speaker === 'narrator' ? 'text narration' : 'text dialogue', text: line.subtitle || line.text }));
    }
    const a = smooth(line.start - 0.05, line.start + 0.12, t);
    const b = 1 - smooth(line.end + 0.1, line.end + 0.25, t);
    this.subEl.style.opacity = Math.min(a, b).toFixed(3);
  }

  updateCaption(t, scene) {
    if (!scene.caption) {
      this.capEl.style.opacity = '0';
      return;
    }
    if (this.capEl.dataset.key !== scene.id) {
      this.capEl.dataset.key = scene.id;
      this.capEl.innerHTML = '';
      const parts = String(scene.caption).split(/\s*[·|]\s*/);
      for (const part of parts) this.capEl.appendChild(html('span', { text: part }));
    }
    const local = t - scene.start;
    const start = (scene.transition?.duration || 0) + 0.3;
    const end = scene.captionDuration ?? Math.min(6, scene.end - scene.start - 0.8);
    const o = smooth(start, start + 0.6, local) * (1 - smooth(end, end + 0.6, local));
    this.capEl.style.opacity = o.toFixed(3);
    this.capEl.style.transform = `translateY(${((1 - smooth(start, start + 0.8, local)) * 14).toFixed(1)}px)`;
  }
}

// 纸纹与胶片颗粒（只生成一次）
function makeTextures(player) {
  const r = rng('texture');
  const paper = document.createElement('canvas');
  paper.width = 960;
  paper.height = 540;
  const pc = paper.getContext('2d');
  const img = pc.createImageData(960, 540);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 236 + (r() - 0.5) * 26;
    img.data[i] = v;
    img.data[i + 1] = v - 6;
    img.data[i + 2] = v - 18;
    img.data[i + 3] = 255;
  }
  pc.putImageData(img, 0, 0);
  // 纸纤维
  pc.globalAlpha = 0.07;
  pc.strokeStyle = '#7a6040';
  for (let i = 0; i < 900; i++) {
    const x = r() * 960;
    const y = r() * 540;
    const a = r() * Math.PI;
    const l = 4 + r() * 18;
    pc.lineWidth = 0.4 + r() * 0.6;
    pc.beginPath();
    pc.moveTo(x, y);
    pc.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    pc.stroke();
  }
  // 斑驳的大色块
  for (let i = 0; i < 40; i++) {
    pc.globalAlpha = 0.03;
    pc.fillStyle = r() > 0.5 ? '#8a6a40' : '#ffffff';
    pc.beginPath();
    pc.arc(r() * 960, r() * 540, 30 + r() * 120, 0, Math.PI * 2);
    pc.fill();
  }
  player.paperEl.style.backgroundImage = `url(${paper.toDataURL('image/png')})`;

  const grain = document.createElement('canvas');
  grain.width = 512;
  grain.height = 512;
  const gc = grain.getContext('2d');
  const gimg = gc.createImageData(512, 512);
  for (let i = 0; i < gimg.data.length; i += 4) {
    const v = r() * 255;
    gimg.data[i] = gimg.data[i + 1] = gimg.data[i + 2] = v;
    gimg.data[i + 3] = 255;
  }
  gc.putImageData(gimg, 0, 0);
  player.grainEl.style.backgroundImage = `url(${grain.toDataURL('image/png')})`;
}

export { components };
