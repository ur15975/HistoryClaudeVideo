// 特效层：雪、风沙、花瓣、火星、雾、光束、色调、速度线
import { svg, group, W, H, PALETTE as P, noise1, onTwos, clamp, radialGradient, linearGradient } from './core.js';
import { register } from './registry.js';

const BLEED = 200;

// 通用粒子：位置完全由时间决定，可逐帧复现
function particles(p, ctx, shape) {
  const r = ctx.rng(`fx:${p.kind || 'p'}:${p.seed || ''}`);
  const g = group();
  const n = p.count || 90;
  const items = [];
  for (let i = 0; i < n; i++) {
    const el = shape(r, i);
    g.appendChild(el);
    items.push({ el, x: r.range(-BLEED, W + BLEED), y: r.range(-BLEED, H + BLEED), z: r.range(0.4, 1.3), ph: r() * 100 });
  }
  return { g, items };
}

register('fx.snow', (p, ctx) => {
  const { g, items } = particles({ ...p, kind: 'snow' }, ctx, (r) => svg('circle', { r: r.range(2, 5.5), fill: '#fbf8f0', opacity: r.range(0.55, 0.95) }));
  const wind = p.wind ?? 40;
  const speed = p.speed ?? 70;
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const it of items) {
        const y = ((it.y + tt * speed * it.z) % (H + 2 * BLEED)) - BLEED;
        const x = ((it.x + tt * wind * it.z + Math.sin(tt * 1.3 + it.ph) * 20) % (W + 2 * BLEED) + (W + 2 * BLEED)) % (W + 2 * BLEED) - BLEED;
        it.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${it.z.toFixed(2)})`);
      }
    },
  };
});

register('fx.sand', (p, ctx) => {
  const color = p.color || '#e3c592';
  const { g, items } = particles({ ...p, kind: 'sand', count: p.count || 140 }, ctx, (r) =>
    svg('line', { x1: 0, y1: 0, x2: r.range(14, 46), y2: r.range(-2, 2), stroke: color, 'stroke-width': r.range(1.5, 3.5), 'stroke-linecap': 'round', opacity: r.range(0.3, 0.75) }));
  const veil = svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: color, opacity: p.haze ?? 0.18 });
  g.insertBefore(veil, g.firstChild);
  const speed = p.speed ?? 520;
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const it of items) {
        const x = ((it.x + tt * speed * it.z) % (W + 2 * BLEED)) - BLEED;
        const y = it.y + Math.sin(tt * 2 + it.ph) * 30;
        it.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      }
      veil.setAttribute('opacity', ((p.haze ?? 0.18) * (0.8 + noise1(tt * 0.8, 3) * 0.4)).toFixed(3));
    },
  };
});

register('fx.petals', (p, ctx) => {
  const colors = p.colors || ['#f2c0c4', '#f7d9d6', '#efe3d0'];
  const { g, items } = particles({ ...p, kind: 'petals', count: p.count || 50 }, ctx, (r) =>
    svg('path', { d: 'M0,-7 C6,-5 7,4 0,8 C-7,4 -6,-5 0,-7Z', fill: r.pick(colors), stroke: '#8a5a50', 'stroke-width': 0.8 }));
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const it of items) {
        const y = ((it.y + tt * 60 * it.z) % (H + 2 * BLEED)) - BLEED;
        const x = ((it.x + tt * 50 * it.z + Math.sin(tt + it.ph) * 50) % (W + 2 * BLEED)) - BLEED;
        it.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${((tt * 90 + it.ph * 10) % 360).toFixed(0)}) scale(${(it.z * 1.6).toFixed(2)})`);
      }
    },
  };
});

register('fx.embers', (p, ctx) => {
  const { g, items } = particles({ ...p, kind: 'embers', count: p.count || 40 }, ctx, (r) =>
    svg('circle', { r: r.range(1.5, 4), fill: r() > 0.5 ? '#ffd27a' : '#ff8a4a' }));
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const it of items) {
        const k = ((tt * 0.12 * it.z + it.ph) % 1);
        const x = it.x + Math.sin(tt * 1.5 + it.ph) * 40;
        const y = H + 50 - k * (H + 100);
        it.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        it.el.setAttribute('opacity', (Math.sin(k * Math.PI) * 0.9).toFixed(2));
      }
    },
  };
});

register('fx.fog', (p, ctx) => {
  const g = group();
  const bands = [];
  const color = p.color || '#f3eee2';
  for (let i = 0; i < (p.bands || 3); i++) {
    const y = (p.y ?? 700) + i * 90;
    const b = svg('path', { d: `M-400,${y} C200,${y - 40} 700,${y + 30} 1200,${y - 10} C1700,${y - 40} 2100,${y + 20} 2400,${y} L2400,${y + 90} C1800,${y + 110} 900,${y + 70} -400,${y + 100}Z`, fill: color, opacity: p.opacity ?? 0.35 });
    g.appendChild(b);
    bands.push({ b, v: (i % 2 ? 1 : -1) * (14 + i * 6) });
  }
  return { el: g, update(t) { for (const o of bands) o.b.setAttribute('transform', `translate(${(t * o.v) % 400},0)`); } };
});

register('fx.rays', (p, ctx) => {
  const g = group([], { style: 'mix-blend-mode:screen' });
  const fill = linearGradient(ctx.defs, [[0, p.color || '#fff0c8', 0.5], [1, p.color || '#fff0c8', 0]]);
  const rays = [];
  const n = p.count || 6;
  const ox = p.x ?? 960;
  const oy = p.y ?? -80;
  for (let i = 0; i < n; i++) {
    const a = -30 + (60 * i) / (n - 1);
    const ray = svg('path', { d: 'M-20,0 L20,0 L160,1300 L-160,1300Z', fill, transform: `translate(${ox},${oy}) rotate(${a})` });
    g.appendChild(ray);
    rays.push({ ray, a, ph: i * 1.7 });
  }
  return {
    el: g,
    update(t) {
      for (const r of rays) r.ray.setAttribute('opacity', (0.5 + Math.sin(t * 0.8 + r.ph) * 0.3).toFixed(2));
    },
  };
});

// 全屏色调（夜色、回忆、危险）
register('fx.tint', (p) => {
  const el = svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: p.color || '#1d2b45', opacity: p.opacity ?? 0.3 });
  el.style.mixBlendMode = p.blend || 'multiply';
  return { el };
});

// 动画式集中线（戏剧性时刻）
register('fx.speedlines', (p, ctx) => {
  const r = ctx.rng('speed');
  const g = group();
  const lines = [];
  for (let i = 0; i < (p.count || 70); i++) {
    const a = r() * Math.PI * 2;
    const l = svg('path', { fill: p.color || '#2b1f19', opacity: 0.55 });
    g.appendChild(l);
    lines.push({ l, a, w: r.range(0.004, 0.02), inner: r.range(380, 560) });
  }
  const cx = p.x ?? 960;
  const cy = p.y ?? 540;
  return {
    el: g,
    update(t) {
      const tt = onTwos(t, 8);
      for (const o of lines) {
        const a = o.a + (noise1(tt * 3 + o.a, 2) - 0.5) * 0.06;
        const R = 1400;
        const inner = o.inner + (noise1(tt * 5 + o.a * 3, 4) - 0.5) * 80;
        const x1 = cx + Math.cos(a - o.w) * R;
        const y1 = cy + Math.sin(a - o.w) * R;
        const x2 = cx + Math.cos(a + o.w) * R;
        const y2 = cy + Math.sin(a + o.w) * R;
        const xi = cx + Math.cos(a) * inner;
        const yi = cy + Math.sin(a) * inner;
        o.l.setAttribute('d', `M${xi.toFixed(1)},${yi.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}Z`);
      }
    },
  };
});

// 柔光晕（篝火、灯火、晨光）
register('fx.glow', (p, ctx) => {
  const el = svg('circle', { cx: p.cx ?? 960, cy: p.cy ?? 540, r: p.r ?? 500, fill: radialGradient(ctx.defs, [[0, p.color || '#ffd27a', p.intensity ?? 0.45], [1, p.color || '#ffd27a', 0]]) });
  el.style.mixBlendMode = p.blend || 'screen';
  return { el, update(t) { if (p.flicker) el.setAttribute('opacity', (0.8 + noise1(onTwos(t) * 4, 1) * 0.3).toFixed(2)); } };
});

// 电影遮幅
register('fx.letterbox', (p) => {
  const h = p.height ?? 110;
  return {
    el: group([
      svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: h + BLEED, fill: '#0d0b0c' }),
      svg('rect', { x: -BLEED, y: H - h, width: W + 2 * BLEED, height: h + BLEED, fill: '#0d0b0c' }),
    ]),
  };
});

// 原始 SVG：剧本里可以直接写一段 SVG 标记，用于一次性的特殊画面
register('svg.raw', (p) => {
  const g = group();
  g.innerHTML = p.markup || '';
  return { el: g };
});
