// 文字：书法标题、印章、引文
import { svg, group, W, H, PALETTE as P, clamp, getEase, rng, uid, latinWidth } from './core.js';
import { register } from './registry.js';

const BRUSH = 'Ma Shan Zheng, LXGW WenKai, serif';
const KAI = 'LXGW WenKai, serif';
// 拉丁文字（英文版）：碑刻风格的大写体 + 古典衬线正文
const ROMAN = 'Cinzel, EB Garamond, serif';
const SERIF = 'EB Garamond, LXGW WenKai, serif';
const hasHan = (s) => /\p{Script=Han}/u.test(s || '');


// 一笔浓墨（用作标题底衬）：起笔顿、收笔尖，带飞白
function brushStroke(w, h, seed, color = '#2b2422') {
  const r = rng(seed);
  const n = 28;
  const top = [];
  const bot = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = -w / 2 + w * u;
    // 起笔圆钝、收笔渐细并略微上挑
    const body = u < 0.12 ? Math.sin((u / 0.12) * Math.PI / 2) ** 0.7 : 1 - Math.max(0, (u - 0.6) / 0.4) ** 1.6 * 0.85;
    const lift = u > 0.7 ? -(((u - 0.7) / 0.3) ** 2) * h * 0.25 : 0;
    top.push([x, lift - (h / 2) * body + r.range(-h * 0.04, h * 0.04)]);
    bot.push([x, lift + (h / 2) * body * 0.92 + r.range(-h * 0.05, h * 0.05)]);
  }
  const pts = [...top, ...bot.reverse()];
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}Z`;
  const g = group([svg('path', { d, fill: color })]);
  // 飞白：沿笔势方向的细缝
  for (let i = 0; i < 14; i++) {
    const y = r.range(-h * 0.38, h * 0.38);
    const x0 = r.range(-w * 0.1, w * 0.35);
    const len = r.range(w * 0.15, w * 0.5);
    g.appendChild(svg('path', { d: `M${x0.toFixed(1)},${y.toFixed(1)} L${(x0 + len).toFixed(1)},${(y + r.range(-6, 6) - (x0 > w * 0.2 ? h * 0.08 : 0)).toFixed(1)}`, stroke: '#efe6d2', 'stroke-width': r.range(1.5, 5), 'stroke-linecap': 'round', opacity: r.range(0.35, 0.8) }));
  }
  // 溅墨
  for (let i = 0; i < 5; i++) {
    g.appendChild(svg('circle', { cx: r.range(-w / 2, w / 2).toFixed(1), cy: (r() > 0.5 ? 1 : -1) * r.range(h * 0.55, h * 0.8), r: r.range(2, 7), fill: color, opacity: 0.8 }));
  }
  return g;
}

export function seal(text, size = 120, color = '#b5352a') {
  const chars = [...text];
  const g = group();
  const r = rng(text);
  const jag = (v) => v + r.range(-2.5, 2.5);
  g.appendChild(svg('path', { d: `M${jag(-size / 2)},${jag(-size / 2)} L${jag(size / 2)},${jag(-size / 2)} L${jag(size / 2)},${jag(size / 2)} L${jag(-size / 2)},${jag(size / 2)}Z`, fill: color }));
  g.appendChild(svg('rect', { x: -size / 2 + 8, y: -size / 2 + 8, width: size - 16, height: size - 16, fill: 'none', stroke: '#f6efe0', 'stroke-width': 3 }));
  if (chars.length <= 1) {
    g.appendChild(svg('text', { y: size * 0.24, 'text-anchor': 'middle', 'font-family': BRUSH, 'font-size': size * 0.66, fill: '#f6efe0', text: text }));
  } else if (chars.length === 2) {
    // 竖排两字（右起）
    chars.forEach((c, i) => g.appendChild(svg('text', { x: 0, y: -size * 0.06 + i * size * 0.4, 'text-anchor': 'middle', 'font-family': BRUSH, 'font-size': size * 0.4, fill: '#f6efe0', text: c })));
  } else {
    // 四字印：右列两字、左列两字
    const pos = [[size * 0.2, -size * 0.04], [size * 0.2, size * 0.34], [-size * 0.2, -size * 0.04], [-size * 0.2, size * 0.34]];
    chars.slice(0, 4).forEach((c, i) => g.appendChild(svg('text', { x: pos[i][0], y: pos[i][1], 'text-anchor': 'middle', 'font-family': BRUSH, 'font-size': size * 0.38, fill: '#f6efe0', text: c })));
  }
  return g;
}

// 竖排书法大标题 + 副标题 + 印章
register('text.title', (p, ctx) => {
  const g = group();
  const chars = [...(p.text || '')];
  const n = chars.length;
  const color = p.color || '#2b2422';
  const at = ctx.timeOf(p.at ?? 0.3);
  const per = p.perChar ?? 0.45;
  const vertical = p.vertical !== false;
  // 西文版本且副标题是西文时：书法竖排在上，西文副标题横排在下（中文版排版保持不变）
  const latinSub = ctx.latin && !!p.sub && !hasHan(p.sub) && vertical;
  const subSize = p.subSize || 50;
  const sub2Size = p.sub2Size || 38;
  // 西文副标题这一块的固定高度（不随书法字号变化）
  const subBlock = latinSub ? 30 + subSize * 0.4 + (p.sub2 ? sub2Size * 1.6 : 0) : 0;
  let size = p.size || 220;
  if (latinSub && !p.size) {
    // 书法列 + 副标题整体放进画面（上下各留 70px），字多时自动缩小
    size = Math.min(size, (H - 140 - subBlock) / ((n - 1) * 1.02 + 0.95 + 0.55));
  }
  const x0 = p.x ?? W / 2;
  const y0 = p.y ?? (latinSub
    // 整块（书法顶 → 副标题底）垂直居中；第一个字的基线在字顶下方约 0.95 个字号
    ? (H - ((n - 1) * size * 1.02 + size * 0.55 + subBlock + size * 0.95)) / 2 + size * 0.95
    : vertical ? H / 2 - ((n - 1) * size * 1.02) / 2 : H / 2);

  let stroke = null;
  if (p.brush !== false) {
    // 下方有西文副标题时笔触收短，不压到副标题
    const len = vertical ? (n * 1.3 - (latinSub ? 0.35 : 0)) * size : n * size * 1.15;
    stroke = brushStroke(len, vertical ? size * 1.05 : size * 1.1, p.text, p.brushColor || '#a8382a');
    if (vertical) stroke.setAttribute('transform', `translate(${x0 + size * 0.06},${y0 + ((n - 1) * size * 1.02) / 2 - size * (latinSub ? 0.46 : 0.36)}) rotate(84)`);
    else stroke.setAttribute('transform', `translate(${x0},${y0 - size * 0.35})`);
    stroke.setAttribute('opacity', '0');
    g.appendChild(stroke);
  }
  const charEls = chars.map((c, i) => {
    const x = vertical ? x0 : x0 + (i - (chars.length - 1) / 2) * size * 1.05;
    const y = vertical ? y0 + i * size * 1.02 : y0;
    const clipId = uid('tclip');
    const rect = svg('rect', { x: x - size, y: y - size * 0.95, width: size * 2, height: 0 });
    ctx.defs.appendChild(svg('clipPath', { id: clipId }, [rect]));
    const el = svg('text', { x, y, 'text-anchor': 'middle', 'font-family': BRUSH, 'font-size': size, fill: color, 'clip-path': `url(#${clipId})`, text: c });
    g.appendChild(el);
    return { el, rect, i, y };
  });
  let subEl = null;
  let ornaments = null;
  if (latinSub) {
    subEl = group();
    const sy = y0 + (n - 1) * size * 1.02 + size * 0.55 + 30;
    const label = String(p.sub).toUpperCase();
    const subText = svg('text', { x: x0, y: sy, 'text-anchor': 'middle', 'font-family': ROMAN, 'font-weight': 700, 'font-size': subSize, 'letter-spacing': 5, fill: p.subColor || color, text: label });
    subEl.appendChild(subText);
    // 两侧装饰线：先按估算宽度放置，首次可见时按实际渲染宽度校正（字体已预加载）
    const parts = [-1, 1].map((sgn) => {
      const line = svg('line', { y1: sy - subSize * 0.34, y2: sy - subSize * 0.34, stroke: p.brushColor || '#a8382a', 'stroke-width': 3 });
      const dot = svg('circle', { cy: sy - subSize * 0.34, r: 4.5, fill: p.brushColor || '#a8382a' });
      subEl.append(line, dot);
      return { sgn, line, dot };
    });
    const place = (w) => {
      for (const { sgn, line, dot } of parts) {
        const a = x0 + sgn * (w / 2 + 34);
        line.setAttribute('x1', a.toFixed(1));
        line.setAttribute('x2', (a + sgn * 90).toFixed(1));
        dot.setAttribute('cx', (a + sgn * 98).toFixed(1));
      }
    };
    place(latinWidth(label, subSize, true) + label.length * 5);
    ornaments = { subText, place, measured: false };
    if (p.sub2) {
      subEl.appendChild(svg('text', { x: x0, y: sy + subSize * 1.25, 'text-anchor': 'middle', 'font-family': SERIF, 'font-style': 'italic', 'font-weight': 500, 'font-size': sub2Size, fill: p.subColor || color, text: p.sub2 }));
    }
    subEl.setAttribute('opacity', '0');
    g.appendChild(subEl);
  } else if (p.sub) {
    const sx = vertical ? x0 - size * 0.95 : x0;
    const sy = vertical ? y0 - size * 0.55 : y0 + size * 0.75;
    subEl = group();
    if (vertical) {
      [...p.sub].forEach((c, i) => subEl.appendChild(svg('text', { x: sx, y: sy + i * 62, 'text-anchor': 'middle', 'font-family': KAI, 'font-weight': 700, 'font-size': 54, fill: p.subColor || color, text: c })));
    } else {
      subEl.appendChild(svg('text', { x: sx, y: sy, 'text-anchor': 'middle', 'font-family': KAI, 'font-weight': 700, 'font-size': 60, 'letter-spacing': 12, fill: p.subColor || color, text: p.sub }));
    }
    subEl.setAttribute('opacity', '0');
    g.appendChild(subEl);
  }
  let sealEl = null;
  if (p.seal) {
    sealEl = seal(p.seal, p.sealSize || 110);
    g.appendChild(sealEl);
  }
  // 西文副标题占了下方，印章移到书法右上
  const sealX = p.sealX ?? (vertical ? x0 + size * 0.85 : x0 + (chars.length / 2) * size * 1.05 + 60);
  const sealY = p.sealY ?? (latinSub ? Math.max(y0 - size * 0.3, (p.sealSize || 110) / 2 + 50) : vertical ? y0 + (chars.length - 0.6) * size * 1.02 : y0 + size * 0.2);
  const tSeal = at + chars.length * per + 0.5;

  return {
    el: g,
    update(t) {
      if (stroke) {
        const k = clamp((t - at + 0.25) / 0.5);
        stroke.setAttribute('opacity', (getEase('outCubic')(k) * (p.brushOpacity ?? 0.9)).toFixed(3));
      }
      for (const c of charEls) {
        const k = getEase('inOutSine')(clamp((t - at - c.i * per) / (per * 1.1)));
        c.rect.setAttribute('height', (k * size * 1.3).toFixed(1));
      }
      if (subEl) subEl.setAttribute('opacity', clamp((t - at - chars.length * per) / 0.6).toFixed(3));
      if (ornaments && !ornaments.measured) {
        // 渲染宽度只与字体有关，与时间无关；量到一次即可（图层隐藏时为 0，下次再量）
        const w = ornaments.subText.getBBox().width;
        if (w > 0) {
          ornaments.place(w);
          ornaments.measured = true;
        }
      }
      if (sealEl) {
        const k = clamp((t - tSeal) / 0.3);
        const s = k <= 0 ? 0 : 1.5 - 0.5 * getEase('outBack')(k);
        sealEl.style.display = k <= 0 ? 'none' : '';
        sealEl.setAttribute('transform', `translate(${sealX},${sealY}) rotate(-4) scale(${s.toFixed(3)})`);
      }
    },
  };
});

register('text.seal', (p, ctx) => {
  const el = seal(p.text || '印', p.size || 120, p.color);
  const holder = group([el]);
  const at = ctx.timeOf(p.at ?? 0);
  return {
    el: holder,
    update(t) {
      const k = clamp((t - at) / 0.3);
      const s = k <= 0 ? 0 : 1.5 - 0.5 * getEase('outBack')(k);
      holder.style.display = k <= 0 ? 'none' : '';
      el.setAttribute('transform', `rotate(${p.rotate ?? -5}) scale(${s.toFixed(3)})`);
    },
  };
});

// 竖排引文（如《史记》原文），逐字显现
register('text.quote', (p, ctx) => {
  const g = group();
  const cols = (p.text || '').split('\n');
  const size = p.size || 64;
  const color = p.color || '#2b2422';
  const at = ctx.timeOf(p.at ?? 0.3);
  const per = p.perChar ?? 0.09;
  const vertical = p.vertical !== false;
  let idx = 0;
  const all = [];
  cols.forEach((col, ci) => {
    [...col].forEach((ch, k) => {
      const x = vertical ? -ci * size * 1.5 : (k - col.length / 2) * size * 1.05;
      const y = vertical ? k * size * 1.12 : ci * size * 1.6;
      const el = svg('text', { x, y, 'text-anchor': 'middle', 'font-family': p.font === 'kai' ? KAI : BRUSH, 'font-weight': p.font === 'kai' ? 700 : 400, 'font-size': size, fill: color, opacity: 0, text: ch });
      g.appendChild(el);
      all.push({ el, i: idx++ });
    });
  });
  let src = null;
  if (p.source) {
    // 出处：竖排小字，底端与引文最后一字对齐，放在左侧
    const maxLen = Math.max(...cols.map((c) => c.length));
    const ss = size * 0.46;
    const chars = [...`——${p.source}`];
    src = group([], { opacity: 0 });
    if (vertical) {
      const x = -(cols.length - 1) * size * 1.5 - size * 1.05;
      const y0 = (maxLen - 1) * size * 1.12 - (chars.length - 1) * ss * 1.08 + size * 0.4;
      chars.forEach((ch, i) => {
        const isDash = ch === '—';
        src.appendChild(isDash
          ? svg('line', { x1: x, y1: y0 + i * ss * 1.08 - ss * 0.9, x2: x, y2: y0 + i * ss * 1.08 + ss * 0.1, stroke: '#c2452d', 'stroke-width': 2.4 })
          : svg('text', { x, y: y0 + i * ss * 1.08, 'text-anchor': 'middle', 'font-family': KAI, 'font-weight': 700, 'font-size': ss, fill: '#d9604a', text: ch }));
      });
    } else {
      src.appendChild(svg('text', { x: 0, y: cols.length * size * 1.6 + 20, 'text-anchor': 'middle', 'font-family': KAI, 'font-weight': 700, 'font-size': ss, fill: '#d9604a', text: `——${p.source}` }));
    }
    g.appendChild(src);
  }
  // 译文（英文版）：横排放在竖排原文下方
  let tr = null;
  if (p.translation) {
    const maxLen = Math.max(...cols.map((c) => c.length));
    const cx = vertical ? -((cols.length - 1) * size * 1.5) / 2 : 0;
    const ts = p.translationSize || 46;
    let y = vertical ? (maxLen - 1) * size * 1.12 + size * 0.5 + ts : cols.length * size * 1.6 + ts * 1.6;
    tr = group([], { opacity: 0 });
    for (const row of String(p.translation).split('\n')) {
      tr.appendChild(svg('text', { x: cx, y, 'text-anchor': 'middle', 'font-family': SERIF, 'font-style': 'italic', 'font-weight': 500, 'font-size': ts, fill: p.translationColor || color, text: row }));
      y += ts * 1.25;
    }
    if (p.translationSource) {
      tr.appendChild(svg('text', { x: cx, y: y + ts * 0.15, 'text-anchor': 'middle', 'font-family': ROMAN, 'font-weight': 600, 'font-size': Math.round(ts * 0.5), 'letter-spacing': 3, fill: '#d9604a', text: `— ${p.translationSource}` }));
    }
    g.appendChild(tr);
  }
  return {
    el: g,
    update(t) {
      for (const c of all) c.el.setAttribute('opacity', clamp((t - at - c.i * per) / 0.3).toFixed(3));
      if (src) src.setAttribute('opacity', clamp((t - at - all.length * per - 0.2) / 0.5).toFixed(3));
      if (tr) tr.setAttribute('opacity', clamp((t - at - all.length * per - 0.4) / 0.8).toFixed(3));
    },
  };
});

// 横排说明文字（简洁的信息卡）
register('text.label', (p, ctx) => {
  const size = p.size || 48;
  const font = { brush: BRUSH, roman: ROMAN, serif: SERIF }[p.font] || (ctx.latin && !hasHan(p.text) ? SERIF : KAI);
  const el = svg('text', { x: 0, y: 0, 'text-anchor': p.anchor || 'middle', 'font-family': font, 'font-weight': 700, 'font-size': size, fill: p.color || '#2b2422', 'letter-spacing': p.spacing ?? 4, text: p.text || '' });
  const g = group([el]);
  if (p.outline) {
    el.setAttribute('stroke', p.outline);
    el.setAttribute('stroke-width', p.outlineWidth || 8);
    el.setAttribute('paint-order', 'stroke');
    el.setAttribute('stroke-linejoin', 'round');
  }
  return { el: g };
});
