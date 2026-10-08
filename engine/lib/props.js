// 道具：汉节、篝火、奔马/骑手、骆驼、旗帜、竹简
import { svg, group, PALETTE as P, noise1, onTwos, clamp, lerp } from './core.js';
import { register } from './registry.js';
import { drawFigure } from './characters.js';

const LINE = '#3b2f29';

// ───────────────────────── 汉节 ─────────────────────────
// 竹竿 + 三重牦牛尾“旄”，使者身份的象征（“持汉节不失”）
export function drawJie({ length = 760, color = '#b5352a', worn = 0 } = {}) {
  const g = group();
  g.appendChild(svg('rect', { x: -6, y: -length, width: 12, height: length, rx: 5, fill: '#b38a4e', stroke: LINE, 'stroke-width': 2.4 }));
  for (let y = -length + 60; y < 0; y += 70) g.appendChild(svg('line', { x1: -6, y1: y, x2: 6, y2: y, stroke: LINE, 'stroke-width': 2, opacity: 0.6 }));
  g.appendChild(svg('path', { d: `M-10,${-length} L10,${-length} L6,${-length - 26} L-6,${-length - 26}Z`, fill: P.gold, stroke: LINE, 'stroke-width': 2 }));
  const tiers = [];
  for (let i = 0; i < 3; i++) {
    const y = -length + 30 + i * 92;
    const tier = group();
    tier.appendChild(svg('ellipse', { cx: 0, cy: y, rx: 16, ry: 8, fill: P.gold, stroke: LINE, 'stroke-width': 2 }));
    // 旄：一束下垂的长毛
    const strands = 7;
    const len = 76 * (1 - worn * 0.45);
    for (let k = 0; k < strands; k++) {
      const x = -26 + (k * 52) / (strands - 1);
      tier.appendChild(svg('path', {
        d: `M${x * 0.4},${y + 4} C${x * 0.8},${y + len * 0.4} ${x},${y + len * 0.7} ${x * 1.1},${y + len}`,
        fill: 'none', stroke: worn > 0.5 ? '#9a6a52' : color, 'stroke-width': 9, 'stroke-linecap': 'round',
      }));
    }
    tier.appendChild(svg('path', { d: `M-30,${y + 6} C-24,${y + len} 24,${y + len} 30,${y + 6}`, fill: 'none', stroke: LINE, 'stroke-width': 1.6, opacity: 0.5 }));
    g.appendChild(tier);
    tiers.push({ tier, y });
  }
  return { el: g, tiers };
}

register('prop.jie', (p) => {
  const j = drawJie(p);
  return {
    el: j.el,
    update(t) {
      const tt = onTwos(t);
      j.tiers.forEach(({ tier, y }, i) => {
        const a = Math.sin(tt * 1.7 + i * 0.8) * (p.wind ?? 3) + (p.lean ?? 0);
        tier.setAttribute('transform', `rotate(${a.toFixed(2)} 0 ${y})`);
      });
    },
  };
});

// ───────────────────────── 篝火 ─────────────────────────
register('prop.fire', (p, ctx) => {
  const g = group();
  g.appendChild(svg('ellipse', { cx: 0, cy: 6, rx: 120, ry: 22, fill: 'rgba(0,0,0,0.3)' }));
  g.appendChild(svg('path', { d: 'M-90,0 L80,-30 L86,-14 L-84,16Z', fill: '#5a3a26', stroke: LINE, 'stroke-width': 2.4 }));
  g.appendChild(svg('path', { d: 'M90,0 L-80,-30 L-86,-14 L84,16Z', fill: '#6b452c', stroke: LINE, 'stroke-width': 2.4 }));
  for (let i = -3; i <= 3; i++) g.appendChild(svg('ellipse', { cx: i * 30, cy: 14, rx: 18, ry: 10, fill: '#8a8070', stroke: LINE, 'stroke-width': 2 }));
  const glow = svg('circle', { cx: 0, cy: -60, r: 220, fill: 'url(#fireglow)', opacity: 0.8 });
  ctx.defs.appendChild(svg('radialGradient', { id: 'fireglow' }, [
    svg('stop', { offset: 0, 'stop-color': '#ffcf7a', 'stop-opacity': 0.55 }),
    svg('stop', { offset: 1, 'stop-color': '#ff9a4a', 'stop-opacity': 0 }),
  ]));
  const flames = group();
  const layers = [
    { c: '#e0532f', w: 70, h: 190 },
    { c: '#f39a3a', w: 52, h: 150 },
    { c: '#ffd76a', w: 30, h: 100 },
  ];
  const fl = layers.map((L) => {
    const path = svg('path', { fill: L.c, stroke: L.c === '#e0532f' ? LINE : 'none', 'stroke-width': 2 });
    flames.appendChild(path);
    return { ...L, path };
  });
  const sparks = [];
  for (let i = 0; i < 10; i++) {
    const s = svg('circle', { r: 3, fill: '#ffd76a' });
    flames.appendChild(s);
    sparks.push(s);
  }
  g.insertBefore(glow, g.firstChild);
  g.appendChild(flames);
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      for (const [i, L] of fl.entries()) {
        const n1 = noise1(tt * 4 + i * 3, 1) - 0.5;
        const n2 = noise1(tt * 5 + i * 7, 2) - 0.5;
        const h = L.h * (0.85 + noise1(tt * 3 + i, 3) * 0.3);
        const w = L.w;
        L.path.setAttribute('d', `M${-w},-6 C${-w},${-h * 0.4} ${-w * 0.3 + n1 * 30},${-h * 0.6} ${n2 * 30},${-h} C${w * 0.2 + n1 * 20},${-h * 0.7} ${w * 0.5},${-h * 0.75} ${w * 0.45},${-h * 0.55} C${w},${-h * 0.4} ${w},${-h * 0.2} ${w},-6Z`);
      }
      sparks.forEach((s, i) => {
        const k = (tt * 0.6 + i / sparks.length) % 1;
        s.setAttribute('cx', ((noise1(i * 9.1, 4) - 0.5) * 120 + Math.sin(k * 8 + i) * 20).toFixed(1));
        s.setAttribute('cy', (-80 - k * 300).toFixed(1));
        s.setAttribute('opacity', (1 - k).toFixed(2));
      });
      glow.setAttribute('opacity', (0.65 + noise1(tt * 4, 8) * 0.35).toFixed(2));
    },
  };
});

// ───────────────────────── 马 ─────────────────────────
// 汉画像砖式的马：弓颈、小头、细腿。gait = gallop | walk | stand
function legPath(len1, len2, a1, a2) {
  const kx = Math.sin(a1) * len1;
  const ky = Math.cos(a1) * len1;
  const fx = kx + Math.sin(a1 + a2) * len2;
  const fy = ky + Math.cos(a1 + a2) * len2;
  return { d: `M-7,0 L${(kx - 5).toFixed(1)},${ky.toFixed(1)} L${(fx - 4).toFixed(1)},${fy.toFixed(1)} L${(fx + 6).toFixed(1)},${fy.toFixed(1)} L${(kx + 5).toFixed(1)},${ky.toFixed(1)} L7,0Z`, fx, fy };
}

export function drawHorse({ color = '#7a4f33', mane = '#2b2422', saddle = '#a8382a' } = {}) {
  const g = group();
  const legsBack = group();
  const legsFront = group();
  const body = group();
  const legs = [];
  const mk = (x, back, front) => {
    const leg = svg('path', { fill: back ? shade(color) : color, stroke: LINE, 'stroke-width': 2.2, 'stroke-linejoin': 'round' });
    const hoof = svg('rect', { width: 14, height: 8, fill: '#2b2422' });
    const gg = group([leg, hoof], { transform: `translate(${x},-150)` });
    (back ? legsBack : legsFront).appendChild(gg);
    legs.push({ leg, hoof, gg, x, front, back });
  };
  mk(70, true, true); mk(-80, true, false);
  // 尾
  const tail = svg('path', { d: 'M-118,-170 C-170,-160 -190,-110 -200,-70 C-176,-100 -150,-130 -116,-150Z', fill: mane, stroke: LINE, 'stroke-width': 2.2 });
  body.appendChild(tail);
  body.appendChild(svg('path', {
    d: 'M-120,-172 C-122,-206 -80,-214 -20,-210 C30,-208 70,-214 96,-226 C110,-262 130,-298 160,-318 C176,-328 196,-326 206,-312 L236,-262 C240,-252 232,-244 222,-248 L190,-262 C176,-246 162,-220 150,-186 C144,-160 120,-138 90,-134 L-90,-134 C-112,-138 -122,-152 -120,-172Z',
    fill: color, stroke: LINE, 'stroke-width': 2.6, 'stroke-linejoin': 'round',
  }));
  // 鬃毛与耳
  body.appendChild(svg('path', { d: 'M104,-228 C118,-266 140,-300 164,-318 L172,-306 C150,-290 132,-260 120,-224Z', fill: mane, stroke: LINE, 'stroke-width': 2 }));
  body.appendChild(svg('path', { d: 'M178,-322 L184,-346 L192,-320Z', fill: color, stroke: LINE, 'stroke-width': 2 }));
  body.appendChild(svg('circle', { cx: 196, cy: -300, r: 3.6, fill: '#1c1312' }));
  body.appendChild(svg('path', { d: 'M222,-250 l8,6', stroke: LINE, 'stroke-width': 2 }));
  // 鞍鞯
  body.appendChild(svg('path', { d: 'M-40,-210 C-20,-224 30,-224 50,-212 L46,-150 L-36,-150Z', fill: saddle, stroke: LINE, 'stroke-width': 2.2 }));
  body.appendChild(svg('path', { d: 'M-36,-160 L46,-160', stroke: P.gold, 'stroke-width': 3 }));
  // 缰绳
  body.appendChild(svg('path', { d: 'M204,-288 C170,-260 120,-230 60,-214', fill: 'none', stroke: '#3b2f29', 'stroke-width': 2 }));
  mk(84, false, true); mk(-70, false, false);
  g.append(legsBack, body, legsFront);
  return { el: g, body, legs, tail };
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

function animateHorse(h, t, gait = 'gallop', speed = 1) {
  const tt = onTwos(t);
  const freq = gait === 'gallop' ? 2.2 : gait === 'walk' ? 0.9 : 0;
  const ph = tt * freq * speed * Math.PI * 2;
  const bob = gait === 'gallop' ? Math.sin(ph * 1) * 8 : gait === 'walk' ? Math.sin(ph * 2) * 2 : 0;
  const pitch = gait === 'gallop' ? Math.sin(ph + 1) * 3 : 0;
  h.body.setAttribute('transform', `translate(0,${bob.toFixed(1)}) rotate(${pitch.toFixed(2)} 0 -170)`);
  const offsets = { gallop: [0, 0.12, 0.5, 0.62], walk: [0, 0.5, 0.25, 0.75] }[gait] || [0, 0, 0, 0];
  h.legs.forEach((L, i) => {
    const o = offsets[[0, 2, 1, 3][i]] ?? 0;
    const p = ph + o * Math.PI * 2;
    let a1 = 0;
    let a2 = 0;
    if (gait === 'gallop') {
      a1 = Math.sin(p) * (L.front ? 0.75 : 0.65);
      a2 = (L.front ? -1 : 1) * Math.max(0, Math.sin(p + (L.front ? 1.4 : -1.2))) * 0.9;
    } else if (gait === 'walk') {
      a1 = Math.sin(p) * 0.35;
      a2 = (L.front ? -1 : 1) * Math.max(0, Math.sin(p + 1.2)) * 0.5;
    }
    const lp = legPath(76, 78, -a1, -a2);
    L.leg.setAttribute('d', lp.d);
    L.hoof.setAttribute('x', (lp.fx - 6).toFixed(1));
    L.hoof.setAttribute('y', (lp.fy - 2).toFixed(1));
    L.gg.setAttribute('transform', `translate(${L.x},${(-150 + bob).toFixed(1)})`);
  });
  const tw = Math.sin(ph * 1.3) * (gait === 'gallop' ? 8 : 3);
  h.tail.setAttribute('transform', `rotate(${tw.toFixed(1)} -118 -160)`);
}

register('prop.horse', (p) => {
  const h = drawHorse(p);
  return { el: h.el, update: (t) => animateHorse(h, t, p.gait || 'stand', p.speed || 1) };
});

// 骑手（汉使持节 / 匈奴骑兵）
register('prop.rider', (p) => {
  const h = drawHorse({ color: p.horseColor || '#7a4f33', saddle: p.saddle });
  const riderG = group();
  const kind = p.kind || 'han';
  const robe = p.color || (kind === 'nomad' ? '#8e5a35' : '#33476a');
  riderG.appendChild(svg('path', { d: 'M-30,-196 C-40,-230 -36,-270 -20,-292 L24,-292 C36,-270 40,-230 36,-196Z', fill: robe, stroke: LINE, 'stroke-width': 2.4 }));
  riderG.appendChild(svg('path', { d: 'M-24,-200 C-10,-170 10,-150 30,-136 L44,-150 C24,-170 18,-190 20,-204Z', fill: robe, stroke: LINE, 'stroke-width': 2.2 }));
  riderG.appendChild(svg('circle', { cx: 4, cy: -318, r: 26, fill: kind === 'nomad' ? '#e8c19c' : P.skin, stroke: '#8a5443', 'stroke-width': 2.2 }));
  if (kind === 'nomad') {
    riderG.appendChild(svg('path', { d: 'M-24,-322 C-24,-360 4,-376 14,-380 C24,-366 34,-350 32,-322Z', fill: p.hat || '#7a3a2a', stroke: LINE, 'stroke-width': 2 }));
    riderG.appendChild(svg('path', { d: 'M-26,-326 L34,-326', stroke: '#cdb28a', 'stroke-width': 9, 'stroke-linecap': 'round' }));
    // 弓
    riderG.appendChild(svg('path', { d: 'M-40,-300 C-70,-260 -70,-200 -40,-170', fill: 'none', stroke: '#5a3a26', 'stroke-width': 5 }));
  } else {
    riderG.appendChild(svg('path', { d: 'M-22,-326 C-22,-346 30,-346 30,-326Z', fill: '#2b2422' }));
    riderG.appendChild(svg('rect', { x: -8, y: -364, width: 24, height: 22, rx: 3, fill: '#221d1c' }));
  }
  riderG.appendChild(svg('circle', { cx: 16, cy: -320, r: 3, fill: '#2a1f1c' }));
  let jie = null;
  if (p.jie) {
    jie = drawJie({ length: 520 });
    const holder = group([jie.el], { transform: 'translate(46,-140) rotate(8)' });
    riderG.appendChild(holder);
    riderG.appendChild(svg('circle', { cx: 46, cy: -220, r: 10, fill: P.skin, stroke: '#8a5443', 'stroke-width': 2 }));
  }
  h.body.appendChild(riderG);
  return {
    el: h.el,
    update(t) {
      animateHorse(h, t, p.gait || 'gallop', p.speed || 1);
      if (jie) {
        const tt = onTwos(t);
        jie.tiers.forEach(({ tier, y }, i) => tier.setAttribute('transform', `rotate(${(-14 + Math.sin(tt * 6 + i) * 6).toFixed(1)} 0 ${y})`));
      }
    },
  };
});

// 行进的队列：一组骑手或骆驼从画面一侧移动到另一侧
register('prop.caravan', (p, ctx) => {
  const g = group();
  const items = [];
  const n = p.count || 4;
  for (let i = 0; i < n; i++) {
    const unit = p.kind === 'camel' ? drawCamel(p) : drawHorse({ color: i % 2 ? '#6b452c' : '#8a5a3a' });
    const holder = group([unit.el]);
    if (p.kind !== 'camel' && p.riders !== false) {
      const fig = drawFigure({ kind: p.riderKind || 'han', color: p.colors?.[i % p.colors.length] || '#33476a' });
      fig.setAttribute('transform', 'translate(0,-170) scale(1.6)');
      unit.body.appendChild(fig);
    }
    g.appendChild(holder);
    items.push({ unit, holder, offset: i * (p.spacing || 300), phase: i * 0.37 });
  }
  return {
    el: g,
    update(t) {
      for (const it of items) {
        it.holder.setAttribute('transform', `translate(${-it.offset},0)`);
        if (p.kind === 'camel') animateCamel(it.unit, t + it.phase);
        else animateHorse(it.unit, t + it.phase, p.gait || 'walk', p.speed || 1);
      }
    },
  };
});

// ───────────────────────── 骆驼 ─────────────────────────
function drawCamel({ color = '#c49a64', load = '#8a3a2a' } = {}) {
  const g = group();
  const legs = [];
  const legsBack = group();
  const legsFront = group();
  const body = group();
  const mk = (x, back) => {
    const leg = svg('path', { fill: back ? shade(color) : color, stroke: LINE, 'stroke-width': 2.2 });
    const gg = group([leg], { transform: `translate(${x},-170)` });
    (back ? legsBack : legsFront).appendChild(gg);
    legs.push({ leg, gg, x, back });
  };
  mk(70, true); mk(-70, true);
  body.appendChild(svg('path', {
    d: 'M-110,-190 C-120,-230 -90,-250 -70,-236 C-60,-290 -20,-296 -6,-244 C10,-292 50,-292 60,-236 C80,-232 100,-226 110,-210 C130,-230 150,-270 160,-300 C166,-318 190,-322 200,-306 C206,-296 206,-286 196,-282 C178,-276 170,-246 150,-200 C140,-176 120,-166 90,-166 L-80,-166 C-100,-168 -110,-176 -110,-190Z',
    fill: color, stroke: LINE, 'stroke-width': 2.6, 'stroke-linejoin': 'round',
  }));
  body.appendChild(svg('circle', { cx: 190, cy: -304, r: 3.2, fill: '#1c1312' }));
  body.appendChild(svg('path', { d: 'M-50,-250 L40,-250 L50,-200 L-60,-200Z', fill: load, stroke: LINE, 'stroke-width': 2.2 }));
  body.appendChild(svg('path', { d: 'M-54,-226 L46,-226', stroke: P.goldLight, 'stroke-width': 3, 'stroke-dasharray': '8 6' }));
  mk(80, false); mk(-60, false);
  g.append(legsBack, body, legsFront);
  return { el: g, body, legs };
}

function animateCamel(c, t) {
  const tt = onTwos(t);
  const ph = tt * 0.8 * Math.PI * 2;
  c.body.setAttribute('transform', `translate(0,${(Math.sin(ph * 2) * 3).toFixed(1)})`);
  c.legs.forEach((L, i) => {
    const p = ph + [0, 0.5, 0.5, 0][i] * Math.PI * 2;
    const lp = legPath(84, 86, -Math.sin(p) * 0.3, -Math.max(0, Math.sin(p + 1.2)) * 0.4 * (i % 2 ? 1 : -1));
    L.leg.setAttribute('d', lp.d);
  });
}

register('prop.camel', (p) => {
  const c = drawCamel(p);
  return { el: c.el, update: (t) => animateCamel(c, t) };
});

// ───────────────────────── 旗帜 ─────────────────────────
register('prop.banner', (p) => {
  const g = group();
  const h = p.height || 520;
  g.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: -h, stroke: '#3b2f29', 'stroke-width': 7 }));
  g.appendChild(svg('circle', { cx: 0, cy: -h - 8, r: 9, fill: P.gold, stroke: LINE, 'stroke-width': 2 }));
  const flag = svg('path', { fill: p.color || '#a8382a', stroke: LINE, 'stroke-width': 2.4 });
  const text = p.text ? svg('text', { x: 90, y: -h + 120, 'text-anchor': 'middle', 'font-family': 'Ma Shan Zheng, serif', 'font-size': 110, fill: p.textColor || '#f6efe0', text: p.text }) : null;
  const fg = group([flag, text]);
  g.appendChild(fg);
  return {
    el: g,
    update(t) {
      const tt = onTwos(t);
      const w = Math.sin(tt * 3) * 12;
      const w2 = Math.sin(tt * 3 + 1.5) * 16;
      flag.setAttribute('d', `M0,${-h} C60,${-h + w} 120,${-h - w} 180,${-h + w2} L180,${-h + 200 + w2} C120,${-h + 200 - w} 60,${-h + 200 + w} 0,${-h + 200}Z`);
      if (text) text.setAttribute('transform', `skewY(${(w2 * 0.1).toFixed(2)})`);
    },
  };
});

// ───────────────────────── 竹简 ─────────────────────────
register('prop.slips', (p, ctx) => {
  const g = group();
  const cols = p.text ? [...p.text] : [];
  const n = p.count || Math.max(cols.length, 12);
  const w = 46;
  const h = p.height || 620;
  const reveal = [];
  for (let i = 0; i < n; i++) {
    const x = (n / 2 - i - 1) * (w + 4); // 从右向左书写
    const slip = group();
    slip.appendChild(svg('rect', { x, y: -h / 2, width: w, height: h, rx: 6, fill: '#d9b878', stroke: LINE, 'stroke-width': 2 }));
    slip.appendChild(svg('rect', { x: x + w * 0.65, y: -h / 2, width: w * 0.2, height: h, fill: '#b8945a', opacity: 0.5 }));
    g.appendChild(slip);
    reveal.push(slip);
  }
  for (const yy of [-h * 0.32, h * 0.32]) g.appendChild(svg('line', { x1: -(n / 2) * (w + 4) - 10, y1: yy, x2: (n / 2) * (w + 4) + 10, y2: yy, stroke: '#5a3a26', 'stroke-width': 4 }));
  // 每片竹简写一个大字（或若干行小字）
  const lines = p.lines || [];
  lines.forEach((line, i) => {
    const x = (n / 2 - i - 1) * (w + 4) + w / 2;
    [...line].forEach((ch, k) => g.appendChild(svg('text', { x, y: -h / 2 + 50 + k * 40, 'text-anchor': 'middle', 'font-family': 'LXGW WenKai, serif', 'font-weight': 700, 'font-size': 32, fill: '#2b1f19', text: ch })));
  });
  return {
    el: g,
    update(t) {
      if (p.unroll === undefined) return;
      const a = ctx.timeOf(p.unroll);
      const k = clamp((t - a) / (p.unrollDuration || 1.6));
      reveal.forEach((s, i) => s.setAttribute('opacity', (k * n > i ? 1 : 0)));
    },
  };
});

// 漆案（可放竹简），常放在人物图层之后作前景
register('prop.table', (p) => {
  const w = p.width || 700;
  const g = group();
  g.appendChild(svg('path', { d: `M${-w / 2},0 L${w / 2},0 L${w / 2 + 20},40 L${-w / 2 - 20},40Z`, fill: '#2b1d18', stroke: P.gold, 'stroke-width': 3 }));
  g.appendChild(svg('rect', { x: -w / 2 - 20, y: 40, width: w + 40, height: 26, fill: '#1e1513', stroke: LINE, 'stroke-width': 2 }));
  g.appendChild(svg('path', { d: `M${-w / 2 - 20},52 L${w / 2 + 20},52`, stroke: '#a8382a', 'stroke-width': 4 }));
  for (const s of [-1, 1]) g.appendChild(svg('rect', { x: s * (w / 2 - 10) - 14, y: 66, width: 28, height: 140, fill: '#1e1513', stroke: LINE, 'stroke-width': 2 }));
  if (p.slips !== false) {
    for (let i = 0; i < 9; i++) g.appendChild(svg('rect', { x: -150 + i * 14, y: -10, width: 12, height: 22, fill: '#d9b878', stroke: LINE, 'stroke-width': 1 }));
    g.appendChild(svg('path', { d: 'M110,-8 C140,-26 180,-26 200,-8 L196,6 L114,6Z', fill: '#8a7a50', stroke: LINE, 'stroke-width': 1.6 }));
  }
  return { el: g };
});
