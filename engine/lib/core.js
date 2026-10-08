// 引擎基础工具：SVG 构造、随机数、缓动、调色板
export const SVGNS = 'http://www.w3.org/2000/svg';
export const W = 1920;
export const H = 1080;

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

export function html(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

export function group(children = [], attrs = {}) {
  return svg('g', attrs, children);
}

// 可复现的伪随机数（同一 seed 每帧结果一致）
export function rng(seed = 1) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

// 平滑噪声（一维），用于摆动、闪烁
export function noise1(x, seed = 0) {
  const hash = (i) => {
    let h = Math.imul((i | 0) ^ Math.imul(seed | 0, 374761393), 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: (t) => t,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
};
export const getEase = (name) => ease[name] || ease.inOutSine;

// 动画“一拍二”：把时间量化到 12fps，模仿手绘动画的顿挫感
export const onTwos = (t, fps = 12) => Math.floor(t * fps) / fps;

// 天幕风格调色板：低饱和矿物色 + 暖纸色
export const PALETTE = {
  paper: '#efe6d2',
  paperDark: '#e2d5ba',
  ink: '#2e2520',
  line: '#3b2f29',
  vermilion: '#c2452d',
  cinnabar: '#a8382a',
  ochre: '#b8763e',
  gold: '#d6a84a',
  goldLight: '#ecd08a',
  indigo: '#2f4a6d',
  indigoDeep: '#1d2b45',
  azurite: '#3e6f8c',
  malachite: '#5f9c86',
  celadon: '#9dbfa8',
  night: '#18203a',
  nightMid: '#26335a',
  nightLow: '#3a4a78',
  star: '#f8ecbf',
  grass: '#a7b06a',
  grassDark: '#7f8c4f',
  sand: '#dcb983',
  sandDark: '#c39a62',
  snow: '#f4f1e8',
  skin: '#f5dcc2',
  skinShade: '#e9bea0',
  blush: '#ec9f8f',
  felt: '#efe7d6',
  wood: '#7a4f33',
  black: '#2a2523',
  white: '#fbf7ee',
};

let uidCounter = 0;
export const uid = (p = 'u') => `${p}${++uidCounter}`;

// 多边形/路径辅助
export function pathFromPoints(pts, close = true) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + (close ? 'Z' : '');
}

// 经过所有点的平滑曲线（Catmull-Rom 转贝塞尔）
export function smoothPath(pts, close = false, tension = 0.5) {
  if (pts.length < 2) return '';
  const p = close ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1][0].toFixed(1)},${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return close ? d + 'Z' : d;
}

// 起伏的地平线（用于山丘、沙丘）
export function ridge({ x0 = -200, x1 = W + 200, y, amp = 40, freq = 3, seed = 1, bottom = H + 200, steps = 24, sharp = 0 }) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = lerp(x0, x1, i / steps);
    const u = (i / steps) * freq;
    let n = (noise1(u, seed) - 0.5) * 2;
    n += (noise1(u * 2.3, seed + 7) - 0.5) * 0.5;
    if (sharp) n = Math.sign(n) * Math.abs(n) ** (1 - sharp * 0.5);
    pts.push([x, y - n * amp]);
  }
  return smoothPath(pts) + `L${x1},${bottom}L${x0},${bottom}Z`;
}

export function linearGradient(defs, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1, id = uid('lg') } = {}) {
  defs.appendChild(svg('linearGradient', { id, x1, y1, x2, y2 },
    stops.map(([o, c, a = 1]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }))));
  return `url(#${id})`;
}

export function radialGradient(defs, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy, id = uid('rg') } = {}) {
  defs.appendChild(svg('radialGradient', { id, cx, cy, r, fx, fy },
    stops.map(([o, c, a = 1]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }))));
  return `url(#${id})`;
}

// 把元素设置为 transform
export function setTransform(node, { x = 0, y = 0, scale = 1, sx, sy, rotate = 0, ox = 0, oy = 0 } = {}) {
  const scx = sx ?? scale;
  const scy = sy ?? scale;
  node.setAttribute('transform',
    `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${rotate.toFixed(3)}) scale(${scx.toFixed(4)},${scy.toFixed(4)}) translate(${-ox},${-oy})`);
}
