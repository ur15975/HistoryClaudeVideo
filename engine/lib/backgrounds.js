// 背景：星空天幕、草原穹庐、汉宫、帐内、沙漠、山脉、河谷、城门、纸面
// 原则：平面化构图（左右对称的建筑、层叠的地形）、低饱和矿物色、细线勾边、少量动态
import { svg, group, W, H, PALETTE as P, rng, noise1, clamp, lerp, ridge, smoothPath, linearGradient, radialGradient, onTwos } from './core.js';
import { register } from './registry.js';

const LINE = '#3b2f29';
const BLEED = 260;

const SKIES = {
  day: [[0, '#9ec3cf'], [0.55, '#cfe0d6'], [1, '#efe6cc']],
  dusk: [[0, '#3b4a78'], [0.45, '#c07a6a'], [0.8, '#e8b27a'], [1, '#f2d39a']],
  night: [[0, '#0f1630'], [0.55, '#1e2a52'], [1, '#3a4a7a']],
  dawn: [[0, '#5a6a96'], [0.5, '#c9a3a6'], [1, '#f1d6b0']],
  storm: [[0, '#4a4f5c'], [0.6, '#7d7f7c'], [1, '#a8a08a']],
};

function sky(defs, time = 'day', h = H) {
  const fill = linearGradient(defs, SKIES[time] || SKIES.day);
  return svg('rect', { x: -BLEED, y: -BLEED, width: W + BLEED * 2, height: h + BLEED, fill });
}

// 星点（带少量闪烁），返回 { el, update }
function starField(r, { count = 360, x0 = -BLEED, x1 = W + BLEED, y0 = -BLEED, y1 = 700, twinkle = 80, sparkle = 8 } = {}) {
  const g = group();
  const tw = [];
  for (let i = 0; i < count; i++) {
    const x = r.range(x0, x1);
    // 越靠近地平线越稀疏
    const y = y0 + (y1 - y0) * r() ** 1.35;
    const size = r() ** 3 * 2.4 + 0.7;
    const c = svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: size.toFixed(2), fill: r() < 0.15 ? '#cfe0ff' : P.star, opacity: (0.45 + r() * 0.55).toFixed(2) });
    g.appendChild(c);
    if (i < twinkle) tw.push({ el: c, base: Number(c.getAttribute('opacity')), seed: i * 7.3 });
  }
  // 动画风格的十字星芒
  for (let i = 0; i < sparkle; i++) {
    const x = r.range(x0 + 200, x1 - 200);
    const y = r.range(y0 + 150, y1 - 200);
    const s = r.range(7, 15);
    const star = svg('path', {
      d: `M0,${-s * 2} C${s * 0.18},${-s * 0.3} ${s * 0.3},${-s * 0.18} ${s * 2},0 C${s * 0.3},${s * 0.18} ${s * 0.18},${s * 0.3} 0,${s * 2} C${-s * 0.18},${s * 0.3} ${-s * 0.3},${s * 0.18} ${-s * 2},0 C${-s * 0.3},${-s * 0.18} ${-s * 0.18},${-s * 0.3} 0,${-s * 2}Z`,
      fill: '#fff6d8', transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`,
    });
    g.appendChild(star);
    tw.push({ el: star, base: 1, seed: 100 + i * 3.1, sparkle: true, x, y });
  }
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const s of tw) {
        const n = noise1(tt * 1.6 + s.seed, 5);
        if (s.sparkle) {
          const k = 0.75 + n * 0.45;
          s.el.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) scale(${k.toFixed(3)})`);
        } else s.el.setAttribute('opacity', (s.base * (0.45 + n * 0.55)).toFixed(2));
      }
    },
  };
}

// 祥云（扁平卷云纹）
export function cloud(x, y, s = 1, color = '#f6efe0', line = LINE, opacity = 1) {
  const d = 'M-120,0 C-150,0 -150,-34 -118,-36 C-112,-66 -70,-72 -54,-50 C-44,-86 10,-92 22,-56 C40,-76 84,-70 86,-38 C118,-42 132,-8 108,0Z';
  return group([
    svg('path', { d, fill: color, stroke: line, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
    svg('path', { d: 'M-54,-50 C-60,-34 -50,-22 -36,-24 M22,-56 C18,-36 30,-24 46,-28', fill: 'none', stroke: line, 'stroke-width': 2, opacity: 0.6 }),
  ], { transform: `translate(${x},${y}) scale(${s})`, opacity });
}

// 穹庐（蒙古包）
export function yurt(x, y, s = 1, { lit = false, felt = P.felt, band = '#a8382a', night = false } = {}) {
  const g = group([], { transform: `translate(${x},${y}) scale(${s})` });
  const fc = night ? '#4a5272' : felt;
  g.appendChild(svg('ellipse', { cx: 0, cy: 2, rx: 70, ry: 8, fill: 'rgba(0,0,0,0.18)' }));
  g.appendChild(svg('path', { d: 'M-62,0 L-62,-40 C-60,-72 -30,-94 0,-98 C30,-94 60,-72 62,-40 L62,0Z', fill: fc, stroke: LINE, 'stroke-width': 2.4 }));
  g.appendChild(svg('path', { d: 'M-62,-40 C-20,-46 20,-46 62,-40', fill: 'none', stroke: LINE, 'stroke-width': 2 }));
  g.appendChild(svg('path', { d: 'M-62,-34 C-20,-40 20,-40 62,-34 L62,-26 C20,-32 -20,-32 -62,-26Z', fill: night ? '#5b3040' : band }));
  for (const k of [-0.6, -0.2, 0.2, 0.6]) {
    g.appendChild(svg('path', { d: `M${k * 62},-44 C${k * 50},-70 ${k * 25},-90 ${k * 6},-97`, fill: 'none', stroke: LINE, 'stroke-width': 1.4, opacity: 0.5 }));
  }
  g.appendChild(svg('rect', { x: -10, y: -96, width: 20, height: 6, rx: 2, fill: LINE, opacity: 0.6 }));
  const door = svg('path', { d: 'M-13,0 L-13,-30 L13,-30 L13,0Z', fill: lit ? '#f2b45a' : '#8a3a2a', stroke: LINE, 'stroke-width': 2 });
  g.appendChild(door);
  if (lit) g.appendChild(svg('path', { d: 'M-13,0 L13,0 L40,26 L-40,26Z', fill: '#f2b45a', opacity: 0.25 }));
  return g;
}

// 炊烟：若干逐渐上升、变大、变淡的烟团
function smoke(x, y, { color = '#efe8da', count = 6, height = 160, seed = 1, opacity = 0.5 } = {}) {
  const g = group();
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const c = svg('circle', { cx: x, cy: y, r: 8, fill: color, opacity: 0 });
    g.appendChild(c);
    puffs.push(c);
  }
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      puffs.forEach((c, i) => {
        const p = ((tt * 0.18 + i / count + seed * 0.13) % 1);
        const drift = (noise1(p * 3 + seed, i) - 0.5) * 40 + p * 30;
        c.setAttribute('cx', (x + drift).toFixed(1));
        c.setAttribute('cy', (y - p * height).toFixed(1));
        c.setAttribute('r', (6 + p * 22).toFixed(1));
        c.setAttribute('opacity', (Math.sin(p * Math.PI) * opacity).toFixed(3));
      });
    },
  };
}

function grassTufts(r, { y0, y1, count = 80, color = P.grassDark, x0 = -BLEED, x1 = W + BLEED }) {
  const g = group();
  const tufts = [];
  for (let i = 0; i < count; i++) {
    const x = r.range(x0, x1);
    const y = r.range(y0, y1);
    const s = lerp(0.6, 1.6, (y - y0) / Math.max(1, y1 - y0));
    const blade = svg('path', { d: `M-8,0 Q-10,-14 -14,-24 M0,0 Q0,-18 2,-32 M8,0 Q12,-14 16,-22`, fill: 'none', stroke: color, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    const tg = group([blade], { transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})` });
    g.appendChild(tg);
    tufts.push({ blade, phase: r() * 6 });
  }
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const tf of tufts) tf.blade.setAttribute('transform', `skewX(${(Math.sin(tt * 1.8 + tf.phase) * 7).toFixed(1)})`);
    },
  };
}

function compose(parts) {
  const g = group(parts.map((p) => p.el || p));
  const updaters = parts.filter((p) => p.update);
  return { el: g, update: (t, ctx) => updaters.forEach((p) => p.update(t, ctx)) };
}

// ───────────────────────── 星空天幕 ─────────────────────────
register('bg.nightsky', (p, ctx) => {
  const r = ctx.rng('nightsky');
  const parts = [sky(ctx.defs, p.time || 'night')];
  // 银河：几层旋转的径向渐变椭圆
  if (p.milkyway !== false) {
    const mw = group([], { transform: `translate(${p.milkyX ?? 1040},${p.milkyY ?? 330}) rotate(${p.milkyAngle ?? -24})` });
    const glow = radialGradient(ctx.defs, [[0, '#c9c4ff', 0.33], [0.5, '#8a8fd8', 0.13], [1, '#4a5a9a', 0]]);
    const core = radialGradient(ctx.defs, [[0, '#fff2d0', 0.3], [0.6, '#e8d8c0', 0.08], [1, '#e8d8c0', 0]]);
    mw.appendChild(svg('ellipse', { cx: 0, cy: 0, rx: 1300, ry: 230, fill: glow }));
    mw.appendChild(svg('ellipse', { cx: -120, cy: 10, rx: 900, ry: 110, fill: core }));
    mw.appendChild(svg('ellipse', { cx: 260, cy: -20, rx: 520, ry: 70, fill: core }));
    // 暗尘带
    mw.appendChild(svg('path', { d: 'M-900,10 C-500,-30 -200,40 200,0 C500,-30 700,20 1000,0', fill: 'none', stroke: '#141b38', 'stroke-width': 26, opacity: 0.35, 'stroke-linecap': 'round' }));
    parts.push(mw);
    const dense = starField(r, { count: 260, x0: -400, x1: 2300, y0: 0, y1: 700, twinkle: 0, sparkle: 0 });
    dense.el.setAttribute('transform', `translate(${p.milkyX ?? 1040},${p.milkyY ?? 330}) rotate(${p.milkyAngle ?? -24}) translate(-1150,-350) scale(1,0.32)`);
    dense.el.setAttribute('opacity', '0.7');
    parts.push(dense);
  }
  const stars = starField(r, { count: p.stars ?? 380, y1: p.horizonY ? p.horizonY : 760 });
  parts.push(stars);

  // 北斗七星 + 金色星官连线（致敬古代星图）
  if (p.dipper !== false) {
    const dx = p.dipperX ?? 420;
    const dy = p.dipperY ?? 200;
    const sc = p.dipperScale ?? 1;
    const pts = [[0, 0], [70, 18], [128, 52], [196, 70], [214, 140], [306, 150], [310, 72]];
    const dg = group([], { transform: `translate(${dx},${dy}) scale(${sc})` });
    dg.appendChild(svg('path', { d: `${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('')}L196,70`, fill: 'none', stroke: P.gold, 'stroke-width': 1.6, opacity: 0.55 }));
    for (const [x, y] of pts) {
      dg.appendChild(svg('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: P.gold, 'stroke-width': 1.4, opacity: 0.7 }));
      dg.appendChild(svg('circle', { cx: x, cy: y, r: 3.8, fill: '#fff4d2' }));
    }
    parts.push(dg);
  }
  // 星图同心圆（淡金色）
  if (p.chart) {
    const cg = group([], { opacity: 0.22 });
    for (const rad of [380, 560, 760]) cg.appendChild(svg('circle', { cx: p.chartX ?? 960, cy: p.chartY ?? 980, r: rad, fill: 'none', stroke: P.gold, 'stroke-width': 1.5, 'stroke-dasharray': rad === 560 ? '10 8' : '' }));
    parts.push(cg);
  }
  // 月亮
  if (p.moon) {
    const m = p.moon === true ? {} : p.moon;
    const mg = group([], { transform: `translate(${m.x ?? 1560},${m.y ?? 190})` });
    mg.appendChild(svg('circle', { r: (m.r ?? 54) * 2.2, fill: radialGradient(ctx.defs, [[0, '#fff3c8', 0.35], [1, '#fff3c8', 0]]) }));
    mg.appendChild(svg('circle', { r: m.r ?? 54, fill: '#f8edc6', stroke: '#e3cf98', 'stroke-width': 2 }));
    if (m.crescent !== false) mg.appendChild(svg('circle', { cx: (m.r ?? 54) * 0.45, cy: -(m.r ?? 54) * 0.2, r: (m.r ?? 54) * 0.92, fill: SKIES.night[1][1] }));
    parts.push(mg);
  }
  // 流星
  if (p.shootingStar !== undefined) {
    const ss = svg('path', { d: 'M0,0 L-260,-90', stroke: '#fff6dc', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 });
    const t0 = ctx.timeOf(p.shootingStar);
    parts.push({
      el: ss,
      update(t) {
        const k = clamp((t - t0) / 0.7);
        if (k <= 0 || k >= 1) { ss.setAttribute('opacity', '0'); return; }
        const x = lerp(1500, 900, k);
        const y = lerp(120, 330, k);
        ss.setAttribute('transform', `translate(${x},${y}) rotate(160) scale(${(Math.sin(k * Math.PI)).toFixed(2)},1)`);
        ss.setAttribute('opacity', Math.sin(k * Math.PI).toFixed(2));
      },
    });
  }
  // 地平线：草原剪影与亮着灯的穹庐
  const horizon = p.horizon ?? 'steppe';
  if (horizon !== 'none') {
    const hy = p.horizonY ?? 820;
    parts.push(svg('path', { d: ridge({ y: hy - 40, amp: 50, freq: 2.2, seed: 11 }), fill: '#1b2340' }));
    parts.push(svg('path', { d: ridge({ y: hy + 30, amp: 26, freq: 3, seed: 5 }), fill: '#12172b' }));
    if (horizon === 'steppe') {
      for (const [x, s, lit] of p.yurts || [[620, 0.9, true], [760, 0.65, false], [1290, 1.05, true], [1420, 0.7, true]]) {
        parts.push(yurt(x, hy + 30 - (1 - s) * 20, s, { lit, night: true }));
      }
    }
  }
  return compose(parts);
});

// ───────────────────────── 草原 ─────────────────────────
register('bg.steppe', (p, ctx) => {
  const r = ctx.rng('steppe');
  const time = p.time || 'day';
  const night = time === 'night';
  const parts = [sky(ctx.defs, time)];
  if (night) parts.push(starField(r, { count: 220, y1: 560 }));
  // 太阳/月亮
  if (time === 'dusk' || time === 'dawn') {
    parts.push(svg('circle', { cx: p.sunX ?? 1380, cy: p.sunY ?? 520, r: 70, fill: '#f6d38c', opacity: 0.95 }));
  } else if (time === 'day') {
    parts.push(svg('circle', { cx: p.sunX ?? 1500, cy: p.sunY ?? 170, r: 56, fill: '#fbf1d6', opacity: 0.9 }));
  }
  // 漂移的云
  const clouds = group();
  const cloudList = [];
  if (!night) {
    for (let i = 0; i < (p.clouds ?? 4); i++) {
      const c = cloud(0, 0, r.range(0.7, 1.3), time === 'dusk' ? '#e9b9a0' : '#f7f1e2', LINE, 0.95);
      clouds.appendChild(c);
      cloudList.push({ el: c, x: r.range(-100, W), y: r.range(90, 330), s: r.range(0.7, 1.3), v: r.range(4, 10) });
    }
  }
  parts.push({ el: clouds, update(t) { for (const c of cloudList) c.el.setAttribute('transform', `translate(${((c.x + t * c.v) % (W + 400)) - 200},${c.y}) scale(${c.s})`); } });

  const tints = {
    day: ['#9fb5b8', '#a9b98a', '#9cad66', '#8e9e55'],
    dusk: ['#8a7f98', '#a5876f', '#8e7a50', '#6f6a3e'],
    night: ['#28345a', '#222c4c', '#1b243e', '#151c33'],
    dawn: ['#a6a2b8', '#b0a98a', '#9aa070', '#86905a'],
  }[time] || ['#9fb5b8', '#a9b98a', '#9cad66', '#8e9e55'];
  const hy = p.horizonY ?? 600;
  parts.push(svg('path', { d: ridge({ y: hy, amp: 46, freq: 2.4, seed: 3 }), fill: tints[0] }));
  parts.push(svg('path', { d: ridge({ y: hy + 70, amp: 36, freq: 2.8, seed: 8 }), fill: tints[1], stroke: LINE, 'stroke-width': 1.5, 'stroke-opacity': 0.25 }));

  // 远处穹庐与炊烟
  const yurts = p.yurts ?? [[520, hy + 92, 0.9], [690, hy + 104, 0.7], [1240, hy + 96, 1.0], [1380, hy + 110, 0.75]];
  for (const [x, y, s, lit] of yurts) {
    parts.push(yurt(x, y, s, { lit: lit ?? night, night }));
    if (p.smoke !== false) parts.push(smoke(x, y - 96 * s, { seed: x, color: night ? '#6a7090' : '#f1ece0', opacity: night ? 0.3 : 0.5 }));
  }
  // 吃草的马（剪影）
  for (const [x, y, s, f] of p.horses ?? [[880, hy + 150, 0.55, 1], [980, hy + 160, 0.5, -1], [1580, hy + 140, 0.45, 1]]) {
    parts.push(horseGrazing(x, y, s, f, night ? '#121828' : '#5b4030'));
  }
  parts.push(svg('path', { d: ridge({ y: hy + 210, amp: 40, freq: 2, seed: 21 }), fill: tints[2], stroke: LINE, 'stroke-width': 2, 'stroke-opacity': 0.35 }));
  parts.push(grassTufts(r, { y0: hy + 240, y1: H + 40, count: p.grass ?? 70, color: night ? '#0f1528' : '#6f7d40' }));
  parts.push(svg('path', { d: ridge({ y: H - 50, amp: 24, freq: 2.5, seed: 33 }), fill: tints[3] }));
  return compose(parts);
});

export function horseGrazing(x, y, s, flip, color) {
  return group([
    svg('path', {
      d: 'M-50,-40 C-30,-52 20,-52 40,-44 C52,-40 60,-30 70,-6 C74,4 66,8 62,0 C58,-10 52,-20 44,-24 L40,-10 L42,20 L36,20 L32,-8 C10,-4 -20,-4 -34,-8 L-36,20 L-42,20 L-44,-6 C-52,-12 -60,-14 -66,-30 C-70,-40 -62,-46 -50,-40Z',
      fill: color,
    }),
    svg('path', { d: 'M-66,-30 C-80,-26 -84,-10 -80,-2', fill: 'none', stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' }),
  ], { transform: `translate(${x},${y}) scale(${s * flip},${s})` });
}

// ───────────────────────── 汉宫大殿（对称构图） ─────────────────────────
register('bg.palace', (p, ctx) => {
  const r = ctx.rng('palace');
  const parts = [];
  const wall = p.wall || '#3a2620';
  parts.push(svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: wall }));
  // 后墙木构
  for (let x = -200; x <= W + 200; x += 240) {
    parts.push(svg('rect', { x: x - 10, y: -BLEED, width: 20, height: 780 + BLEED, fill: '#2a1a15' }));
  }
  parts.push(svg('rect', { x: -BLEED, y: 150, width: W + 2 * BLEED, height: 18, fill: '#2a1a15' }));
  // 高窗透光
  const beams = group([], { opacity: p.lightBeams === false ? 0 : 1 });
  const beamFill = linearGradient(ctx.defs, [[0, '#ffe7b0', 0.35], [1, '#ffe7b0', 0]]);
  for (const bx of [300, 1620]) beams.appendChild(svg('path', { d: `M${bx - 60},40 L${bx + 60},40 L${bx + 260 * Math.sign(960 - bx)},900 L${bx + 60 * Math.sign(960 - bx)},900Z`, fill: beamFill }));
  // 屏风（黑漆朱绘云气纹）
  const sx = 960;
  const screen = group();
  screen.appendChild(svg('rect', { x: sx - 380, y: 200, width: 760, height: 520, fill: '#1e1716', stroke: P.gold, 'stroke-width': 6 }));
  for (let i = 1; i < 4; i++) screen.appendChild(svg('line', { x1: sx - 380 + i * 190, y1: 200, x2: sx - 380 + i * 190, y2: 720, stroke: P.gold, 'stroke-width': 3 }));
  for (let i = 0; i < 4; i++) {
    const cx = sx - 285 + i * 190;
    for (const [k, cy] of [320, 470, 610].entries()) {
      const f = (i + k) % 2 ? -1 : 1;
      // 卷云纹：一条 S 形曲线，两端内卷
      screen.appendChild(svg('path', {
        d: 'M-62,18 C-70,-12 -46,-34 -22,-24 C-6,-17 -8,4 -24,4 C-36,4 -36,-10 -28,-12 M-22,-24 C6,-38 34,-4 18,14 C8,26 40,30 58,10 C70,-4 62,-24 48,-24 C38,-24 36,-12 44,-8',
        fill: 'none', stroke: '#b5432f', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        transform: `translate(${cx},${cy}) scale(${f * 1.15},1.15)`,
      }));
      screen.appendChild(svg('circle', { cx: cx + f * 52, cy: cy - 40, r: 5, fill: P.gold }));
    }
  }
  parts.push(screen);
  // 天花彩画梁
  parts.push(svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: 140 + BLEED, fill: '#2b1b16' }));
  const pattern = group();
  for (let x = -200; x < W + 200; x += 120) {
    pattern.appendChild(svg('path', { d: `M${x},70 l30,-30 l30,30 l-30,30Z`, fill: '#3e6f8c', stroke: P.gold, 'stroke-width': 2 }));
    pattern.appendChild(svg('circle', { cx: x + 90, cy: 70, r: 12, fill: '#b5432f', stroke: P.gold, 'stroke-width': 2 }));
  }
  parts.push(pattern);
  parts.push(svg('rect', { x: -BLEED, y: 118, width: W + 2 * BLEED, height: 14, fill: P.gold, opacity: 0.8 }));
  // 帷幔：顶部垂花
  const drape = group();
  let d = `M${-BLEED},130`;
  for (let x = -BLEED; x < W + BLEED; x += 160) d += ` Q${x + 80},250 ${x + 160},130`;
  d += ` L${W + BLEED},100 L${-BLEED},100Z`;
  drape.appendChild(svg('path', { d, fill: '#7e2b24', stroke: LINE, 'stroke-width': 2.4 }));
  for (let x = -BLEED + 160; x < W + BLEED; x += 160) {
    drape.appendChild(svg('line', { x1: x, y1: 132, x2: x, y2: 210, stroke: P.gold, 'stroke-width': 3 }));
    drape.appendChild(svg('path', { d: `M${x - 9},210 L${x + 9},210 L${x + 5},246 L${x - 5},246Z`, fill: P.gold }));
  }
  parts.push(drape);
  // 朱红立柱（两对）
  for (const cx of [250, 560, 1360, 1670]) {
    const near = cx < 400 || cx > 1520;
    const w = near ? 70 : 52;
    parts.push(svg('rect', { x: cx - w / 2, y: 120, width: w, height: 820, fill: '#a8382a', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('rect', { x: cx - w / 2 + w * 0.62, y: 120, width: w * 0.2, height: 820, fill: '#7e2b24', opacity: 0.6 }));
    parts.push(svg('rect', { x: cx - w / 2 - 10, y: 120, width: w + 20, height: 30, fill: '#2b1b16', stroke: P.gold, 'stroke-width': 2 }));
    parts.push(svg('path', { d: `M${cx - w / 2 - 14},940 L${cx + w / 2 + 14},940 L${cx + w / 2 + 6},905 L${cx - w / 2 - 6},905Z`, fill: '#5d4a3e', stroke: LINE, 'stroke-width': 2 }));
  }
  // 侧帘
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -BLEED : W + BLEED;
    parts.push(svg('path', { d: `M${x0},100 L${s < 0 ? 170 : W - 170},100 C${s < 0 ? 150 : W - 150},400 ${s < 0 ? 60 : W - 60},520 ${s < 0 ? 110 : W - 110},940 L${x0},940Z`, fill: '#6e2520', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('path', { d: `M${s < 0 ? 90 : W - 90},560 C${s < 0 ? 110 : W - 110},590 ${s < 0 ? 150 : W - 150},590 ${s < 0 ? 150 : W - 150},560`, fill: 'none', stroke: P.gold, 'stroke-width': 8 }));
  }
  // 地面（透视地砖）
  const floorY = 780;
  parts.push(svg('rect', { x: -BLEED, y: floorY, width: W + 2 * BLEED, height: H - floorY + BLEED, fill: '#4a3a30' }));
  const lines = group([], { opacity: 0.35 });
  for (let i = -14; i <= 14; i++) lines.appendChild(svg('line', { x1: 960 + i * 60, y1: floorY, x2: 960 + i * 260, y2: H + BLEED, stroke: '#2a1f1a', 'stroke-width': 2 }));
  for (const y of [820, 880, 960, 1060]) lines.appendChild(svg('line', { x1: -BLEED, y1: y, x2: W + BLEED, y2: y, stroke: '#2a1f1a', 'stroke-width': 2 }));
  parts.push(lines);
  // 御座台阶与案几
  if (p.dais !== false) {
    parts.push(svg('path', { d: 'M560,700 L1360,700 L1420,780 L500,780Z', fill: '#5a3e30', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('path', { d: 'M500,780 L1420,780 L1480,830 L440,830Z', fill: '#4e352a', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('rect', { x: 620, y: 660, width: 680, height: 46, fill: '#2b1d18', stroke: P.gold, 'stroke-width': 3 }));
  }
  parts.push(beams);
  // 两侧青铜灯
  const flames = [];
  for (const lx of p.lamps ?? [420, 1500]) {
    parts.push(svg('path', { d: `M${lx - 36},880 L${lx + 36},880 L${lx + 12},860 L${lx + 6},620 L${lx + 30},604 L${lx - 30},604 L${lx - 6},620 L${lx - 12},860Z`, fill: '#4f6a5f', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('ellipse', { cx: lx, cy: 600, rx: 46, ry: 12, fill: '#3e5a50', stroke: LINE, 'stroke-width': 2 }));
    const glow = svg('circle', { cx: lx, cy: 572, r: 90, fill: radialGradient(ctx.defs, [[0, '#ffd27a', 0.5], [1, '#ffd27a', 0]]) });
    const fl = svg('path', { d: `M${lx},540 C${lx + 14},560 ${lx + 12},590 ${lx},596 C${lx - 12},590 ${lx - 14},560 ${lx},540Z`, fill: '#ffcf6a', stroke: '#e07a3a', 'stroke-width': 2 });
    parts.push(glow, fl);
    flames.push({ fl, glow, lx, seed: lx });
  }
  // 博山炉香烟
  if (p.incense !== false) {
    parts.push(svg('path', { d: 'M930,880 C930,850 990,850 990,880 L976,900 L944,900Z M944,900 L976,900 L970,930 L950,930Z', fill: '#6b7a5a', stroke: LINE, 'stroke-width': 2 }));
    parts.push(svg('path', { d: 'M936,860 L948,836 L960,850 L972,830 L984,860', fill: '#6b7a5a', stroke: LINE, 'stroke-width': 2 }));
    parts.push(smoke(960, 830, { count: 7, height: 320, color: '#d8d0c0', opacity: 0.35, seed: 4 }));
  }
  const base = compose(parts);
  return {
    el: base.el,
    update(t, c) {
      base.update(t, c);
      const tt = onTwos(t);
      for (const f of flames) {
        const k = 0.85 + noise1(tt * 3 + f.seed, 2) * 0.3;
        f.fl.setAttribute('transform', `translate(${f.lx},596) scale(${(1 / k).toFixed(3)},${k.toFixed(3)}) translate(${-f.lx},-596)`);
        f.glow.setAttribute('opacity', (0.7 + k * 0.3).toFixed(2));
      }
    },
  };
});

// ───────────────────────── 穹庐内部 ─────────────────────────
register('bg.yurt_interior', (p, ctx) => {
  const r = ctx.rng('yurtin');
  const parts = [];
  const felt = p.felt || '#8a6a4e';
  parts.push(svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: '#4a3426' }));
  // 天窗（陶脑）：圆形开口看见夜空
  const tx = 960;
  const ty = p.toonoY ?? 40;
  const tr = 150;
  const clipId = ctx.uid('toono');
  ctx.defs.appendChild(svg('clipPath', { id: clipId }, [svg('circle', { cx: tx, cy: ty, r: tr })]));
  const skyG = group([svg('rect', { x: tx - tr, y: ty - tr, width: tr * 2, height: tr * 2, fill: p.daylight ? '#9ec3cf' : '#1a2448' })], { 'clip-path': `url(#${clipId})` });
  if (!p.daylight) {
    const st = starField(r, { count: 60, x0: tx - tr, x1: tx + tr, y0: ty - tr, y1: ty + tr, twinkle: 20, sparkle: 2 });
    skyG.appendChild(st.el);
    parts.push({ el: skyG, update: st.update });
  } else parts.push(skyG);
  // 屋顶椽子（乌尼）由天窗向外辐射
  const roof = group();
  roof.appendChild(svg('path', { d: `M${-BLEED},${-BLEED} L${W + BLEED},${-BLEED} L${W + BLEED},420 L${-BLEED},420Z`, fill: felt, 'fill-rule': 'evenodd' }));
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * (i / 40);
    const x2 = tx - Math.cos(a) * 1500;
    const y2 = ty + Math.sin(a) * 900;
    roof.appendChild(svg('line', { x1: tx - Math.cos(a) * tr, y1: ty + Math.sin(a) * tr, x2, y2, stroke: '#c0763e', 'stroke-width': 7 }));
    roof.appendChild(svg('line', { x1: tx - Math.cos(a) * tr, y1: ty + Math.sin(a) * tr, x2, y2, stroke: LINE, 'stroke-width': 1.2, opacity: 0.6, transform: 'translate(4,2)' }));
  }
  parts.push(roof);
  parts.push(svg('circle', { cx: tx, cy: ty, r: tr, fill: 'none', stroke: '#c0763e', 'stroke-width': 18 }));
  parts.push(svg('circle', { cx: tx, cy: ty, r: tr + 10, fill: 'none', stroke: LINE, 'stroke-width': 3 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(svg('line', { x1: tx, y1: ty, x2: tx + Math.cos(a) * tr, y2: ty + Math.sin(a) * tr, stroke: '#c0763e', 'stroke-width': 6 }));
  }
  // 哈那（菱格围墙）
  const wallTop = 430;
  const wallBot = 800;
  const wallG = group();
  wallG.appendChild(svg('rect', { x: -BLEED, y: wallTop, width: W + 2 * BLEED, height: wallBot - wallTop, fill: '#6d4a33' }));
  const lattice = group([], { opacity: 0.85 });
  for (let x = -BLEED - 400; x < W + BLEED + 400; x += 64) {
    lattice.appendChild(svg('line', { x1: x, y1: wallTop, x2: x + 370, y2: wallBot, stroke: '#c48a52', 'stroke-width': 6 }));
    lattice.appendChild(svg('line', { x1: x + 370, y1: wallTop, x2: x, y2: wallBot, stroke: '#c48a52', 'stroke-width': 6 }));
  }
  wallG.appendChild(lattice);
  wallG.appendChild(svg('rect', { x: -BLEED, y: wallTop - 16, width: W + 2 * BLEED, height: 26, fill: '#a8382a', stroke: LINE, 'stroke-width': 2 }));
  for (let x = -BLEED; x < W + BLEED; x += 46) wallG.appendChild(svg('path', { d: `M${x},${wallTop - 3} l12,-9 l12,9 l12,-9`, fill: 'none', stroke: P.goldLight, 'stroke-width': 2.5 }));
  parts.push(wallG);
  // 挂毯
  for (const [x, w] of p.tapestries ?? [[240, 260], [1420, 260]]) {
    parts.push(svg('rect', { x, y: wallTop + 20, width: w, height: 300, fill: '#8a3326', stroke: LINE, 'stroke-width': 2.4 }));
    parts.push(svg('rect', { x: x + 16, y: wallTop + 36, width: w - 32, height: 268, fill: 'none', stroke: P.goldLight, 'stroke-width': 4 }));
    parts.push(svg('path', { d: `M${x + w / 2},${wallTop + 80} l50,60 l-50,60 l-50,-60Z M${x + w / 2},${wallTop + 130} l14,14 l-14,14 l-14,-14Z`, fill: '#2f4a6d', stroke: P.goldLight, 'stroke-width': 3 }));
  }
  // 地毡
  parts.push(svg('rect', { x: -BLEED, y: wallBot, width: W + 2 * BLEED, height: H - wallBot + BLEED, fill: '#5a3a28' }));
  parts.push(svg('path', { d: `M220,${wallBot + 60} L1700,${wallBot + 60} L1900,${H + 40} L20,${H + 40}Z`, fill: '#9a3a2a', stroke: LINE, 'stroke-width': 2.4 }));
  parts.push(svg('path', { d: `M270,${wallBot + 80} L1650,${wallBot + 80} L1830,${H + 20} L90,${H + 20}Z`, fill: 'none', stroke: P.goldLight, 'stroke-width': 4, 'stroke-dasharray': '18 10' }));
  // 火光
  const glow = svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: radialGradient(ctx.defs, [[0, '#ffb35a', 0.38], [0.55, '#ff9a4a', 0.12], [1, '#000', 0.25]], { cx: (p.fireX ?? 960) / W, cy: 0.95, r: 0.75 }) });
  parts.push(glow);
  const base = compose(parts);
  return {
    el: base.el,
    update(t, c) {
      base.update(t, c);
      glow.setAttribute('opacity', (0.85 + noise1(onTwos(t) * 4, 7) * 0.25).toFixed(3));
    },
  };
});

// ───────────────────────── 沙漠 ─────────────────────────
register('bg.desert', (p, ctx) => {
  const r = ctx.rng('desert');
  const time = p.time || 'day';
  const parts = [sky(ctx.defs, time)];
  if (time === 'night') parts.push(starField(r, { count: 300, y1: 620 }));
  if (time === 'night' && p.moon !== false) {
    parts.push(svg('circle', { cx: p.moonX ?? 1500, cy: p.moonY ?? 200, r: 60, fill: '#f6ecc6' }));
  } else if (time !== 'night') {
    parts.push(svg('circle', { cx: p.sunX ?? 600, cy: p.sunY ?? (time === 'dusk' ? 560 : 200), r: time === 'dusk' ? 90 : 64, fill: time === 'dusk' ? '#f3c27a' : '#fbf0cf' }));
  }
  const pal = time === 'night'
    ? [['#2a3156', '#1f2645'], ['#262c4e', '#1a2040'], ['#202644', '#151a33']]
    : time === 'dusk'
      ? [['#d69a6a', '#a8684a'], ['#c98a58', '#94583a'], ['#bd7d4c', '#82492f']]
      : [['#e6c896', '#c9a06a'], ['#dcb983', '#bb8d58'], ['#d3ad74', '#ad7f4b']];
  const hy = p.horizonY ?? 600;
  pal.forEach(([light, dark], i) => {
    const y = hy + i * 150;
    const seed = 40 + i * 9;
    parts.push(svg('path', { d: ridge({ y, amp: 70 - i * 10, freq: 1.6 + i * 0.4, seed, sharp: 0.6 }), fill: light, stroke: LINE, 'stroke-width': 1.6, 'stroke-opacity': 0.3 }));
    // 沙丘背阴面
    parts.push(svg('path', { d: ridge({ y: y + 26, amp: 70 - i * 10, freq: 1.6 + i * 0.4, seed, sharp: 0.6 }), fill: dark, opacity: 0.55, transform: 'translate(60,0)' }));
  });
  // 风沙纹理线
  const ripples = group([], { opacity: 0.25 });
  for (let i = 0; i < 26; i++) {
    const x = r.range(-200, W);
    const y = r.range(hy + 160, H);
    ripples.appendChild(svg('path', { d: `M${x},${y} q60,-10 120,0 t120,0`, fill: 'none', stroke: time === 'night' ? '#0e1328' : '#8a5a34', 'stroke-width': 2 }));
  }
  parts.push(ripples);
  return compose(parts);
});

// ───────────────────────── 青绿山水 ─────────────────────────
register('bg.mountains', (p, ctx) => {
  const r = ctx.rng('mountains');
  const time = p.time || 'day';
  const parts = [sky(ctx.defs, time)];
  if (time === 'night') parts.push(starField(r, { count: 240, y1: 500 }));
  const layers = p.snow === false
    ? [['#8fb2b0', 0.5], ['#5f9c86', 0.7], ['#3e6f8c', 0.85], ['#2f5a5a', 1]]
    : [['#a9c3cc', 0.5], ['#7fa6b0', 0.7], ['#3e6f8c', 0.85], ['#2e5560', 1]];
  const mist = [];
  layers.forEach(([color, k], i) => {
    const y = 360 + i * 140;
    const peaks = [];
    const n = 5 + i * 2;
    const g = group();
    for (let j = 0; j <= n; j++) {
      const x = -BLEED + ((W + 2 * BLEED) * j) / n + r.range(-60, 60);
      const h = r.range(160, 300) * (1.2 - i * 0.15);
      peaks.push([x, y - h]);
      if (j < n) peaks.push([x + (W + 2 * BLEED) / n / 2, y - h * r.range(0.2, 0.5)]);
    }
    const d = smoothPath(peaks, false, 0.35) + `L${W + BLEED},${H + BLEED} L${-BLEED},${H + BLEED}Z`;
    const fill = linearGradient(ctx.defs, [[0, color], [1, i < 2 ? '#d8d6c0' : '#5f9c86']]);
    g.appendChild(svg('path', { d, fill, stroke: LINE, 'stroke-width': 2, 'stroke-opacity': 0.5 }));
    // 雪顶
    if (p.snow !== false && i < 3) {
      for (const [px, py] of peaks.filter((_, idx) => idx % 2 === 0)) {
        if (py > y - 140) continue;
        g.appendChild(svg('path', { d: `M${px - 46},${py + 52} L${px},${py} L${px + 46},${py + 52} L${px + 22},${py + 40} L${px + 8},${py + 58} L${px - 10},${py + 40}Z`, fill: '#f6f3ea', stroke: LINE, 'stroke-width': 1.5, 'stroke-opacity': 0.4 }));
      }
    }
    parts.push(g);
    // 留白云带
    const band = svg('path', { d: `M${-BLEED},${y + 20} C400,${y - 10} 800,${y + 40} 1200,${y + 10} C1500,${y - 10} 1800,${y + 30} ${W + BLEED},${y + 10} L${W + BLEED},${y + 60} C1500,${y + 80} 900,${y + 50} ${-BLEED},${y + 70}Z`, fill: '#f6f1e6', opacity: 0.55 });
    parts.push(band);
    mist.push({ band, v: (i % 2 ? 1 : -1) * (6 + i * 3) });
  });
  const base = compose(parts);
  return { el: base.el, update(t, c) { base.update(t, c); for (const m of mist) m.band.setAttribute('transform', `translate(${(Math.sin(t * 0.1) * m.v * 4).toFixed(1)},0)`); } };
});

// ───────────────────────── 河谷沃野（大月氏、大夏） ─────────────────────────
register('bg.river_land', (p, ctx) => {
  const r = ctx.rng('river');
  const parts = [sky(ctx.defs, p.time || 'day')];
  parts.push(svg('path', { d: ridge({ y: 470, amp: 60, freq: 2, seed: 61 }), fill: '#a7b8b3' }));
  // 远城
  const town = group();
  for (let i = 0; i < 9; i++) {
    const x = 1180 + i * 60 + r.range(-10, 10);
    const h = r.range(40, 90);
    town.appendChild(svg('rect', { x, y: 500 - h, width: 54, height: h, fill: '#d9c39a', stroke: LINE, 'stroke-width': 1.8 }));
    town.appendChild(svg('rect', { x: x + 20, y: 500 - h + 14, width: 12, height: 18, fill: '#7a5a3a' }));
  }
  town.appendChild(svg('rect', { x: 1150, y: 496, width: 600, height: 30, fill: '#c8ae84', stroke: LINE, 'stroke-width': 1.8 }));
  parts.push(town);
  // 田畴
  const fields = ['#b9c27a', '#a3b36a', '#c9c08a', '#9aaf62', '#d0c68e'];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 7; i++) {
      const y = 520 + row * 60;
      const x = -200 + i * 330 + row * 40;
      parts.push(svg('path', { d: `M${x},${y} L${x + 320},${y} L${x + 340},${y + 58} L${x + 10},${y + 58}Z`, fill: r.pick(fields), stroke: LINE, 'stroke-width': 1.4, 'stroke-opacity': 0.4 }));
    }
  }
  // 白杨树
  for (let i = 0; i < 14; i++) {
    const x = r.range(-100, W + 100);
    const y = r.range(560, 700);
    const s = lerp(0.6, 1.1, (y - 560) / 140);
    parts.push(group([
      svg('rect', { x: -3, y: -20, width: 6, height: 26, fill: '#6b4a32' }),
      svg('path', { d: 'M0,-130 C18,-100 20,-40 12,-16 L-12,-16 C-20,-40 -18,-100 0,-130Z', fill: '#6f9a5c', stroke: LINE, 'stroke-width': 2 }),
    ], { transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(2)})` }));
  }
  // 河流（妫水）
  const river = 'M-300,780 C200,720 600,830 1000,770 C1400,710 1700,800 2200,740 L2200,900 C1700,960 1300,870 900,940 C500,1000 200,900 -300,960Z';
  parts.push(svg('path', { d: river, fill: '#6f9fb0', stroke: LINE, 'stroke-width': 2.4 }));
  const waves = group();
  const waveList = [];
  for (let i = 0; i < 18; i++) {
    const w = svg('path', { d: 'M0,0 q20,-10 40,0 t40,0', fill: 'none', stroke: '#e6f1ef', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.8 });
    waves.appendChild(w);
    waveList.push({ w, x: r.range(-200, W), y: r.range(800, 900), v: r.range(10, 22) });
  }
  parts.push({ el: waves, update(t) { for (const o of waveList) o.w.setAttribute('transform', `translate(${(((o.x + onTwos(t) * o.v) % (W + 300)) - 150).toFixed(1)},${o.y.toFixed(1)})`); } });
  parts.push(svg('path', { d: ridge({ y: H - 60, amp: 30, freq: 2.2, seed: 70 }), fill: '#8e9e55' }));
  parts.push(grassTufts(r, { y0: H - 70, y1: H + 20, count: 50, color: '#6f7d40' }));
  return compose(parts);
});

// ───────────────────────── 长安城门 ─────────────────────────
register('bg.citygate', (p, ctx) => {
  const r = ctx.rng('gate');
  const time = p.time || 'dusk';
  const parts = [sky(ctx.defs, time)];
  if (time === 'night') parts.push(starField(r, { count: 200, y1: 400 }));
  parts.push(svg('path', { d: ridge({ y: 520, amp: 40, freq: 2, seed: 81 }), fill: time === 'night' ? '#202a48' : '#8b8aa0', opacity: 0.8 }));
  const wallTop = 420;
  // 城墙（夯土，下宽上窄）
  parts.push(svg('path', { d: `M${-BLEED},${wallTop + 30} L${W + BLEED},${wallTop + 30} L${W + BLEED},860 L${-BLEED},860Z`, fill: '#b98e5c', stroke: LINE, 'stroke-width': 2.4 }));
  for (let y = wallTop + 70; y < 860; y += 44) parts.push(svg('line', { x1: -BLEED, y1: y, x2: W + BLEED, y2: y, stroke: '#8a6440', 'stroke-width': 2, opacity: 0.5 }));
  // 城垛
  for (let x = -BLEED; x < W + BLEED; x += 50) parts.push(svg('rect', { x, y: wallTop, width: 30, height: 34, fill: '#b98e5c', stroke: LINE, 'stroke-width': 2 }));
  // 门楼（两层庑殿顶）
  const cx = 960;
  const tower = group();
  tower.appendChild(svg('rect', { x: cx - 330, y: 250, width: 660, height: 180, fill: '#8c3a2c', stroke: LINE, 'stroke-width': 2.4 }));
  for (let i = 0; i <= 6; i++) tower.appendChild(svg('rect', { x: cx - 330 + i * 106, y: 250, width: 22, height: 180, fill: '#a8382a', stroke: LINE, 'stroke-width': 1.6 }));
  tower.appendChild(svg('path', { d: `M${cx - 460},270 C${cx - 380},250 ${cx - 300},210 ${cx - 260},160 L${cx + 260},160 C${cx + 300},210 ${cx + 380},250 ${cx + 460},270 L${cx + 420},286 L${cx - 420},286Z`, fill: '#2f2a2c', stroke: LINE, 'stroke-width': 2.4 }));
  tower.appendChild(svg('rect', { x: cx - 220, y: 120, width: 440, height: 44, fill: '#8c3a2c', stroke: LINE, 'stroke-width': 2 }));
  tower.appendChild(svg('path', { d: `M${cx - 320},140 C${cx - 260},124 ${cx - 210},96 ${cx - 180},60 L${cx + 180},60 C${cx + 210},96 ${cx + 260},124 ${cx + 320},140 L${cx + 290},152 L${cx - 290},152Z`, fill: '#2f2a2c', stroke: LINE, 'stroke-width': 2.4 }));
  tower.appendChild(svg('path', { d: `M${cx - 190},60 L${cx + 190},60`, stroke: LINE, 'stroke-width': 6 }));
  tower.appendChild(svg('path', { d: `M${cx - 210},56 l-14,-24 M${cx + 210},56 l14,-24`, stroke: LINE, 'stroke-width': 8, 'stroke-linecap': 'round' }));
  parts.push(tower);
  // 三门道（汉代为平顶过梁式门道）
  for (const dx of [-260, 0, 260]) {
    const w = dx === 0 ? 170 : 140;
    parts.push(svg('path', { d: `M${cx + dx - w / 2},860 L${cx + dx - w / 2},${560} L${cx + dx - w / 2 + 20},${540} L${cx + dx + w / 2 - 20},${540} L${cx + dx + w / 2},${560} L${cx + dx + w / 2},860Z`, fill: time === 'night' ? '#120e10' : '#2a1f1c', stroke: LINE, 'stroke-width': 2.4 }));
  }
  // 地面与道路
  parts.push(svg('rect', { x: -BLEED, y: 858, width: W + 2 * BLEED, height: H - 858 + BLEED, fill: '#c9a878' }));
  parts.push(svg('path', { d: 'M870,860 L1050,860 L1300,1340 L620,1340Z', fill: '#d9bc8c' }));
  // 旗帜
  const flags = [];
  for (const fx of [180, 560, 1360, 1740]) {
    parts.push(svg('line', { x1: fx, y1: wallTop + 10, x2: fx, y2: wallTop - 200, stroke: '#3b2f29', 'stroke-width': 5 }));
    const flag = svg('path', { d: '', fill: '#a8382a', stroke: LINE, 'stroke-width': 2 });
    parts.push(flag);
    flags.push({ flag, fx, y: wallTop - 196, ph: fx * 0.01 });
  }
  const base = compose(parts);
  return {
    el: base.el,
    update(t, c) {
      base.update(t, c);
      const tt = onTwos(t);
      for (const f of flags) {
        const w1 = Math.sin(tt * 3 + f.ph) * 10;
        const w2 = Math.sin(tt * 3 + f.ph + 1.4) * 14;
        f.flag.setAttribute('d', `M${f.fx},${f.y} C${f.fx + 40},${f.y + w1} ${f.fx + 80},${f.y - w1} ${f.fx + 120},${f.y + w2} L${f.fx + 120},${f.y + 80 + w2} C${f.fx + 80},${f.y + 80 - w1} ${f.fx + 40},${f.y + 80 + w1} ${f.fx},${f.y + 80}Z`);
      }
    },
  };
});

// ───────────────────────── 纸面、纯色 ─────────────────────────
register('bg.paper', (p, ctx) => {
  const parts = [svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: p.color || P.paper })];
  if (p.wash) {
    parts.push(svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: radialGradient(ctx.defs, [[0, p.wash, 0], [0.7, p.wash, 0.12], [1, p.wash, 0.35]]) }));
  }
  if (p.border !== false) {
    const m = 46;
    parts.push(svg('rect', { x: m, y: m, width: W - 2 * m, height: H - 2 * m, fill: 'none', stroke: p.borderColor || '#8a3a2a', 'stroke-width': 4 }));
    parts.push(svg('rect', { x: m + 12, y: m + 12, width: W - 2 * m - 24, height: H - 2 * m - 24, fill: 'none', stroke: p.borderColor || '#8a3a2a', 'stroke-width': 1.6 }));
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      parts.push(svg('path', { d: `M0,40 L0,0 L40,0 M12,52 L12,12 L52,12 M24,24 l10,0 l0,10 l-10,0Z`, fill: 'none', stroke: p.borderColor || '#8a3a2a', 'stroke-width': 3, transform: `translate(${x},${y}) scale(${sx},${sy})` }));
    }
  }
  return compose(parts);
});

register('bg.solid', (p) => ({ el: svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: p.color || P.paper }) }));

// 水墨远山（回忆、尾声）
register('bg.inkwash', (p, ctx) => {
  const parts = [svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: p.color || '#eee6d4' })];
  const tones = ['#c9c3b6', '#a39d92', '#77726b', '#4a4643'];
  tones.forEach((c, i) => {
    const fill = linearGradient(ctx.defs, [[0, c, 0.95], [1, c, 0.1]]);
    parts.push(svg('path', { d: ridge({ y: 420 + i * 130, amp: 140 - i * 20, freq: 2 + i * 0.6, seed: 90 + i, sharp: 0.4 }), fill }));
  });
  if (p.sun !== false) parts.push(svg('circle', { cx: p.sunX ?? 1420, cy: p.sunY ?? 260, r: 70, fill: '#c2452d', opacity: 0.85 }));
  return compose(parts);
});

// 平涂纹样背景：人物特写、情绪段落用（类似动画里的图形化背景）
register('bg.pattern', (p, ctx) => {
  const g = group([svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: p.color || '#2f4a6d' })]);
  const mc = p.motifColor || 'rgba(255,255,255,0.08)';
  const motif = p.motif || 'cloud';
  const step = p.step || 220;
  const tile = group();
  for (let y = -BLEED; y < H + BLEED; y += step * 0.8) {
    const row = Math.round((y + BLEED) / (step * 0.8));
    for (let x = -BLEED + (row % 2) * step * 0.5; x < W + BLEED; x += step) {
      if (motif === 'cloud') tile.appendChild(cloud(x, y, step / 300, 'none', mc, 1));
      else if (motif === 'diamond') tile.appendChild(svg('path', { d: `M${x},${y - step * 0.3} l${step * 0.3},${step * 0.3} l${-step * 0.3},${step * 0.3} l${-step * 0.3},${-step * 0.3}Z`, fill: 'none', stroke: mc, 'stroke-width': 3 }));
      else if (motif === 'wave') tile.appendChild(svg('path', { d: `M${x - step / 2},${y} a${step / 4},${step / 4} 0 0 1 ${step / 2},0 a${step / 4},${step / 4} 0 0 1 ${step / 2},0`, fill: 'none', stroke: mc, 'stroke-width': 3 }));
      else if (motif === 'star') tile.appendChild(svg('circle', { cx: x, cy: y, r: 3, fill: mc }));
    }
  }
  g.appendChild(tile);
  if (p.vignette !== false) {
    g.appendChild(svg('rect', { x: -BLEED, y: -BLEED, width: W + 2 * BLEED, height: H + 2 * BLEED, fill: radialGradient(ctx.defs, [[0, '#000', 0], [0.65, '#000', 0.05], [1, '#000', 0.4]]) }));
  }
  const drift = p.drift ?? 6;
  return { el: g, update(t) { tile.setAttribute('transform', `translate(${(t * drift) % step},${(t * drift * 0.3) % step})`); } };
});
