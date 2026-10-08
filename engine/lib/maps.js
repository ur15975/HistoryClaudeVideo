// 古舆图风格的历史地图：山形符号、双线河流、竖排地名、朱砂路线
import { svg, group, W, H, PALETTE as P, clamp, getEase, smoothPath, rng, onTwos } from './core.js';
import { register } from './registry.js';

const LINE = '#3b2f29';

// 示意坐标（非精确投影，只保证相对方位）：西汉与西域
export const GEO = {
  western_regions: {
    places: {
      changan: { name: '长安', x: 1640, y: 650, kind: 'capital' },
      longxi: { name: '陇西', x: 1470, y: 640, kind: 'city' },
      wuwei: { name: '河西', x: 1330, y: 520, kind: 'region' },
      dunhuang: { name: '敦煌', x: 1150, y: 470, kind: 'city', lx: 30, ly: 46 },
      yumen: { name: '玉门', x: 1100, y: 450, kind: 'pass', lx: -40, ly: -28 },
      loulan: { name: '楼兰', x: 980, y: 500, kind: 'city' },
      qiuci: { name: '龟兹', x: 760, y: 430, kind: 'city' },
      shule: { name: '疏勒', x: 520, y: 470, kind: 'city' },
      yutian: { name: '于阗', x: 700, y: 640, kind: 'city' },
      dayuan: { name: '大宛', x: 390, y: 400, kind: 'state' },
      kangju: { name: '康居', x: 250, y: 260, kind: 'state' },
      yuezhi: { name: '大月氏', x: 230, y: 520, kind: 'state', lx: 20 },
      daxia: { name: '大夏', x: 250, y: 660, kind: 'state' },
      xiongnu: { name: '单于庭', x: 1330, y: 230, kind: 'court' },
      qiang: { name: '羌', x: 1150, y: 720, kind: 'region' },
      pamir: { name: '葱岭', x: 440, y: 560, kind: 'mountain' },
    },
    regions: [
      { name: '匈奴', x: 1180, y: 170, size: 120, color: '#5b2f2a' },
      { name: '汉', x: 1760, y: 820, size: 150, color: '#a8382a' },
      { name: '西域', x: 820, y: 560, size: 80, color: '#33476a' },
    ],
  },
};

function mountainGlyph(x, y, s = 1, color = '#6f9a7c') {
  return group([
    svg('path', { d: 'M-34,0 L-10,-40 L4,-22 L16,-48 L40,0Z', fill: color, stroke: LINE, 'stroke-width': 2 }),
    svg('path', { d: 'M-10,-40 L-4,-20 M16,-48 L20,-24', stroke: LINE, 'stroke-width': 1.4, opacity: 0.6 }),
    svg('path', { d: 'M12,-40 L16,-48 L21,-38Z', fill: '#f6f1e6' }),
  ], { transform: `translate(${x},${y}) scale(${s})` });
}

function range(points, s, color, seed) {
  const g = group();
  const r = rng(seed);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (54 * s)));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      g.appendChild(mountainGlyph(x0 + (x1 - x0) * u + r.range(-6, 6), y0 + (y1 - y0) * u + r.range(-8, 8), s * r.range(0.8, 1.15), color));
    }
  }
  return g;
}

function river(d, w = 10) {
  return group([
    svg('path', { d, fill: 'none', stroke: LINE, 'stroke-width': w + 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svg('path', { d, fill: 'none', stroke: '#8fb6c4', 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ]);
}

function label(name, x, y, { vertical = false, size = 34, color = LINE, box = true, font = 'LXGW WenKai, serif', weight = 700 } = {}) {
  const g = group([], { transform: `translate(${x},${y})` });
  const chars = [...name];
  if (vertical) {
    const h = chars.length * size * 1.08;
    if (box) g.appendChild(svg('rect', { x: -size * 0.68, y: -size * 0.95, width: size * 1.36, height: h + size * 0.4, fill: '#f4ecd8', stroke: color, 'stroke-width': 2 }));
    chars.forEach((c, i) => g.appendChild(svg('text', { x: 0, y: i * size * 1.08, 'text-anchor': 'middle', 'font-family': font, 'font-weight': weight, 'font-size': size, fill: color, text: c })));
  } else {
    const w = chars.length * size * 1.02;
    if (box) g.appendChild(svg('rect', { x: -w / 2 - 10, y: -size * 0.95, width: w + 20, height: size * 1.32, fill: '#f4ecd8', stroke: color, 'stroke-width': 2 }));
    g.appendChild(svg('text', { x: 0, y: 0, 'text-anchor': 'middle', 'font-family': font, 'font-weight': weight, 'font-size': size, fill: color, text: name }));
  }
  return g;
}

function placeIcon(kind) {
  if (kind === 'capital') return group([svg('rect', { x: -14, y: -14, width: 28, height: 28, fill: '#a8382a', stroke: LINE, 'stroke-width': 2.4 }), svg('rect', { x: -6, y: -6, width: 12, height: 12, fill: '#f4ecd8' })]);
  if (kind === 'pass') return group([svg('path', { d: 'M-14,8 L-14,-8 L-6,-8 L-6,-14 L6,-14 L6,-8 L14,-8 L14,8Z', fill: '#7a4f33', stroke: LINE, 'stroke-width': 2 })]);
  if (kind === 'court') return group([svg('path', { d: 'M-16,8 L-16,-4 C-14,-16 14,-16 16,-4 L16,8Z', fill: '#efe7d6', stroke: LINE, 'stroke-width': 2.2 })]);
  if (kind === 'region' || kind === 'mountain') return group();
  return group([svg('circle', { r: 10, fill: '#f4ecd8', stroke: LINE, 'stroke-width': 2.4 }), svg('circle', { r: 4, fill: LINE })]);
}

register('map.ancient', (p, ctx) => {
  const geo = GEO[p.preset || 'western_regions'];
  const places = { ...(geo?.places || {}), ...(p.places || {}) };
  const g = group();
  // 纸面底
  g.appendChild(svg('rect', { x: -300, y: -300, width: W + 600, height: H + 600, fill: p.paper || '#eadfc4' }));
  // 塔克拉玛干沙漠（斜线纹）
  const hatchId = ctx.uid('hatch');
  ctx.defs.appendChild(svg('pattern', { id: hatchId, width: 16, height: 16, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(30)' }, [
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 16, stroke: '#c9a46a', 'stroke-width': 3 }),
  ]));
  g.appendChild(svg('ellipse', { cx: 790, cy: 540, rx: 250, ry: 82, fill: '#e3caa0' }));
  g.appendChild(svg('ellipse', { cx: 790, cy: 540, rx: 250, ry: 82, fill: `url(#${hatchId})`, opacity: 0.8 }));
  // 戈壁与草原色块
  g.appendChild(svg('path', { d: 'M700,120 C900,60 1500,60 1900,140 L1900,330 C1600,360 1300,330 1100,360 C950,380 820,320 700,300Z', fill: '#d6d3a4', opacity: 0.55 }));
  g.appendChild(svg('path', { d: 'M1500,520 C1600,480 1800,470 2000,500 L2000,1100 L1400,1100 C1380,900 1420,700 1500,520Z', fill: '#d9c9a0', opacity: 0.6 }));
  // 河流
  // 黄河“几”字弯
  g.appendChild(river('M1300,760 C1380,700 1420,620 1430,520 C1440,420 1470,330 1540,320 C1620,310 1660,380 1650,460 C1640,540 1690,600 1760,620 C1840,640 1900,640 1980,620', 9));
  g.appendChild(river('M1080,500 C980,470 880,460 760,470 C640,480 560,470 500,450', 6));
  g.appendChild(river('M430,640 C360,620 300,560 240,520 C180,480 120,440 60,430', 9)); // 妫水
  g.appendChild(river('M470,330 C400,300 330,290 260,300 C200,310 140,300 80,280', 7)); // 药杀水
  g.appendChild(svg('ellipse', { cx: 1015, cy: 500, rx: 34, ry: 20, fill: '#8fb6c4', stroke: LINE, 'stroke-width': 2 })); // 盐泽
  // 山脉
  g.appendChild(range([[540, 380], [800, 360], [1060, 380]], 0.9, '#7fa38a', 'tianshan'));
  g.appendChild(range([[600, 690], [860, 700], [1110, 660]], 0.9, '#8aa58a', 'kunlun'));
  g.appendChild(range([[430, 470], [440, 560], [430, 650]], 1.1, '#6f9a7c', 'pamir'));
  g.appendChild(range([[1200, 600], [1300, 560], [1400, 560]], 0.7, '#8aa58a', 'qilian'));
  // 长城（战国秦长城沿线，示意）
  if (p.wall !== false) {
    g.appendChild(svg('path', { d: 'M1460,600 C1490,520 1530,460 1600,440 C1700,420 1800,420 1960,400', fill: 'none', stroke: '#8a3a2a', 'stroke-width': 5, 'stroke-dasharray': '14 6' }));
  }
  // 区域大字
  for (const rg of [...(geo?.regions || []), ...(p.regions || [])]) {
    g.appendChild(svg('text', { x: rg.x, y: rg.y, 'text-anchor': 'middle', 'font-family': 'Ma Shan Zheng, serif', 'font-size': rg.size || 80, fill: rg.color || LINE, opacity: 0.7, text: rg.name }));
  }
  // 地名
  const show = p.show || Object.keys(places);
  for (const id of show) {
    const pl = places[id];
    if (!pl) continue;
    const icon = placeIcon(pl.kind);
    icon.setAttribute('transform', `translate(${pl.x},${pl.y})`);
    g.appendChild(icon);
    const lx = pl.x + (pl.lx ?? 0);
    const ly = pl.y + (pl.ly ?? (pl.kind === 'region' || pl.kind === 'mountain' ? 10 : -26));
    g.appendChild(label(pl.name, lx, ly, { size: pl.kind === 'capital' ? 40 : pl.kind === 'state' ? 36 : 30, box: pl.kind !== 'region' && pl.kind !== 'mountain', color: pl.kind === 'capital' ? '#a8382a' : LINE }));
  }
  // 方位：北
  g.appendChild(group([
    svg('circle', { r: 46, fill: '#f4ecd8', stroke: '#a8382a', 'stroke-width': 3 }),
    svg('path', { d: 'M0,-36 L12,0 L0,-8 L-12,0Z', fill: '#a8382a' }),
    svg('text', { y: 30, 'text-anchor': 'middle', 'font-family': 'Ma Shan Zheng, serif', 'font-size': 34, fill: '#a8382a', text: '北' }),
  ], { transform: `translate(${p.compassX ?? 1800},${p.compassY ?? 150})` }));

  // 路线
  const routeG = group();
  g.appendChild(routeG);
  const routes = (p.routes || []).map((rt, i) => {
    const pts = rt.points.map((q) => (typeof q === 'string' ? [places[q].x, places[q].y] : q));
    const d = smoothPath(pts, false, rt.tension ?? 0.6);
    const shadow = svg('path', { d, fill: 'none', stroke: '#f4ecd8', 'stroke-width': (rt.width || 7) + 8, 'stroke-linecap': 'round', opacity: 0.9 });
    const path = svg('path', { d, fill: 'none', stroke: rt.color || '#b5352a', 'stroke-width': rt.width || 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const dash = rt.dashed ? svg('path', { d, fill: 'none', stroke: '#f4ecd8', 'stroke-width': (rt.width || 7) * 0.5, 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }) : null;
    const marker = group([
      svg('circle', { r: 16, fill: rt.color || '#b5352a', stroke: '#f4ecd8', 'stroke-width': 4 }),
      svg('text', { y: 8, 'text-anchor': 'middle', 'font-family': 'Ma Shan Zheng, serif', 'font-size': 22, fill: '#f4ecd8', text: rt.icon || '节' }),
    ]);
    routeG.append(shadow, path);
    if (dash) routeG.appendChild(dash);
    routeG.appendChild(marker);
    return { rt, path, shadow, dash, marker, len: null, i };
  });
  // 事件标记（如“被俘”印记）
  const marks = (p.markers || []).map((m) => {
    const pl = typeof m.place === 'string' ? places[m.place] : { x: m.x, y: m.y };
    const el = group([
      svg('rect', { x: -34, y: -34, width: 68, height: 68, rx: 6, fill: m.color || '#a8382a', stroke: '#6e2018', 'stroke-width': 2 }),
      svg('rect', { x: -27, y: -27, width: 54, height: 54, rx: 3, fill: 'none', stroke: '#f4ecd8', 'stroke-width': 2 }),
      svg('text', { y: 14, 'text-anchor': 'middle', 'font-family': 'Ma Shan Zheng, serif', 'font-size': (m.text || '').length > 1 ? 26 : 44, fill: '#f4ecd8', text: m.text || '' }),
    ]);
    g.appendChild(el);
    return { m, el, x: pl.x + (m.dx ?? 40), y: pl.y + (m.dy ?? -40) };
  });

  return {
    el: g,
    update(t) {
      for (const R of routes) {
        if (R.len === null) R.len = R.path.getTotalLength();
        const a = ctx.timeOf(R.rt.start ?? 0);
        const dur = R.rt.duration ?? 3;
        const k = getEase(R.rt.ease || 'inOutSine')(clamp((t - a) / dur));
        const shown = R.len * k;
        for (const el of [R.path, R.shadow]) {
          el.setAttribute('stroke-dasharray', `${shown.toFixed(1)} ${R.len.toFixed(1)}`);
        }
        if (R.dash) R.dash.setAttribute('opacity', k > 0 ? 1 : 0);
        const vis = k > 0 && (R.rt.keepMarker !== false || k < 1);
        R.marker.style.display = vis ? '' : 'none';
        if (vis) {
          const pt = R.path.getPointAtLength(Math.max(0.01, shown));
          R.marker.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
        }
      }
      for (const M of marks) {
        const a = ctx.timeOf(M.m.at ?? 0);
        const k = clamp((t - a) / 0.35);
        const s = k <= 0 ? 0 : k < 1 ? 1.6 - 0.6 * getEase('outBack')(k) : 1;
        M.el.style.display = k <= 0 ? 'none' : '';
        M.el.setAttribute('transform', `translate(${M.x},${M.y}) rotate(-8) scale(${s.toFixed(3)})`);
      }
    },
  };
});
