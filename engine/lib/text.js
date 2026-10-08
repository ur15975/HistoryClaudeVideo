// 文字：书法标题、印章、引文
import { svg, group, W, H, PALETTE as P, clamp, getEase, rng, uid } from './core.js';
import { register } from './registry.js';

const BRUSH = 'Ma Shan Zheng, LXGW WenKai, serif';
const KAI = 'LXGW WenKai, serif';

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
  const size = p.size || 220;
  const color = p.color || '#2b2422';
  const at = ctx.timeOf(p.at ?? 0.3);
  const per = p.perChar ?? 0.45;
  const vertical = p.vertical !== false;
  const x0 = p.x ?? W / 2;
  const y0 = p.y ?? (vertical ? H / 2 - ((chars.length - 1) * size * 1.02) / 2 : H / 2);

  let stroke = null;
  if (p.brush !== false) {
    stroke = brushStroke(vertical ? chars.length * size * 1.3 : chars.length * size * 1.15, vertical ? size * 1.05 : size * 1.1, p.text, p.brushColor || '#a8382a');
    if (vertical) stroke.setAttribute('transform', `translate(${x0 + size * 0.06},${y0 + ((chars.length - 1) * size * 1.02) / 2 - size * 0.36}) rotate(84)`);
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
  if (p.sub) {
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
  const sealX = p.sealX ?? (vertical ? x0 + size * 0.85 : x0 + (chars.length / 2) * size * 1.05 + 60);
  const sealY = p.sealY ?? (vertical ? y0 + (chars.length - 0.6) * size * 1.02 : y0 + size * 0.2);
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
  return {
    el: g,
    update(t) {
      for (const c of all) c.el.setAttribute('opacity', clamp((t - at - c.i * per) / 0.3).toFixed(3));
      if (src) src.setAttribute('opacity', clamp((t - at - all.length * per - 0.2) / 0.5).toFixed(3));
    },
  };
});

// 横排说明文字（简洁的信息卡）
register('text.label', (p, ctx) => {
  const size = p.size || 48;
  const el = svg('text', { x: 0, y: 0, 'text-anchor': p.anchor || 'middle', 'font-family': p.font === 'brush' ? BRUSH : KAI, 'font-weight': 700, 'font-size': size, fill: p.color || '#2b2422', 'letter-spacing': p.spacing ?? 4, text: p.text || '' });
  const g = group([el]);
  if (p.outline) {
    el.setAttribute('stroke', p.outline);
    el.setAttribute('stroke-width', p.outlineWidth || 8);
    el.setAttribute('paint-order', 'stroke');
    el.setAttribute('stroke-linejoin', 'round');
  }
  return { el: g };
});
