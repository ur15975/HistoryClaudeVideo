// 角色：参数化绘制的半身/全身动画角色
// 设计参考《天幕的魔女》（天幕のジャードゥーガル）的人设：圆润的脸、大而黑的眼睛、
// 简洁的平涂与少量阴影、干净的线条，服装纹样只出现在领口与衣缘。
import { svg, group, PALETTE as P, rng, noise1, clamp, onTwos, uid } from './core.js';
import { register } from './registry.js';

const LINE = '#3b2f29';
const SKIN_LINE = '#8a5443';
const SW = 2.6;

// ───────────────────────── 预设 ─────────────────────────
export const PRESETS = {
  han_official: {
    skin: P.skin, hair: '#2b2422', hairStyle: 'topknot', headwear: 'guan',
    eyes: 'round', robe: 'han', robeColor: '#33476a', collarColor: '#a8382a', innerColor: '#f3ecdc',
    beltColor: '#2b2422',
  },
  emperor: {
    skin: P.skin, hair: '#221c1b', hairStyle: 'topknot', headwear: 'mian',
    eyes: 'sharp', robe: 'han', robeColor: '#26201f', collarColor: '#a8382a', innerColor: '#f3ecdc',
    emblems: true, beltColor: '#a8382a',
  },
  han_soldier: {
    skin: '#efcfae', hair: '#2b2422', hairStyle: 'topknot', headwear: 'ze',
    eyes: 'round', robe: 'armor', robeColor: '#8c3a2c', collarColor: '#3b2f29', innerColor: '#d9cbb0',
  },
  han_woman: {
    skin: P.skin, hair: '#2b2422', hairStyle: 'bun', headwear: 'none',
    eyes: 'gentle', robe: 'han', robeColor: '#b4553f', collarColor: '#2f4a6d', innerColor: '#f3ecdc',
  },
  xiongnu_man: {
    skin: '#e8c19c', hair: '#2a211d', hairStyle: 'braids', headwear: 'fur',
    eyes: 'narrow', robe: 'nomad', robeColor: '#8e5a35', collarColor: '#d9c39a', innerColor: '#5a3b2a',
    hatColor: '#7a3a2a', furColor: '#cdb28a',
  },
  xiongnu_chief: {
    skin: '#e3b994', hair: '#241c19', hairStyle: 'braids', headwear: 'eagle',
    eyes: 'sharp', robe: 'nomad', robeColor: '#5b2f2a', collarColor: '#d6b37a', innerColor: '#2f2420',
    beard: 'full', furColor: '#cfb48c', goldBelt: true,
  },
  xiongnu_woman: {
    skin: '#efcaa6', hair: '#2a211d', hairStyle: 'braids_long', headwear: 'beads',
    eyes: 'gentle', robe: 'nomad', robeColor: '#a8442f', collarColor: '#e9d6ae', innerColor: '#3d4f6b',
    furColor: '#d8c19b', blush: 0.55,
  },
};

function resolveDef(id, ctx, params) {
  const base = (id && ctx.character(id)) || {};
  const preset = PRESETS[params.preset || base.preset || 'han_official'] || PRESETS.han_official;
  return { ...preset, ...base, ...params };
}

// ───────────────────────── 头部零件 ─────────────────────────
function face(def) {
  const g = group();
  const d = 'M-92,-382 C-97,-330 -93,-290 -81,-256 C-67,-222 -37,-199 0,-195 C37,-199 67,-222 81,-256 C93,-290 97,-330 92,-382 C88,-452 -88,-452 -92,-382Z';
  // 下颌阴影投在脖子上
  g.appendChild(svg('path', { d, fill: def.skin, stroke: SKIN_LINE, 'stroke-width': SW, 'stroke-linejoin': 'round' }));
  return g;
}

function ears(def) {
  const g = group();
  for (const s of [-1, 1]) {
    g.appendChild(svg('path', {
      d: `M${s * 86},-338 C${s * 106},-350 ${s * 112},-318 ${s * 104},-298 C${s * 99},-284 ${s * 90},-284 ${s * 84},-292`,
      fill: def.skin, stroke: SKIN_LINE, 'stroke-width': SW,
    }));
    g.appendChild(svg('path', { d: `M${s * 92},-330 C${s * 101},-330 ${s * 101},-312 ${s * 94},-304`, fill: 'none', stroke: SKIN_LINE, 'stroke-width': 1.6, opacity: 0.7 }));
  }
  return g;
}

function neck(def) {
  return group([
    svg('path', { d: 'M-30,-240 L-33,-168 C-20,-158 20,-158 33,-168 L30,-240Z', fill: def.skin, stroke: SKIN_LINE, 'stroke-width': SW }),
    svg('path', { d: 'M-30,-236 C-12,-214 12,-214 30,-236 L31,-210 C12,-196 -12,-196 -31,-210Z', fill: P.skinShade, opacity: 0.9 }),
  ]);
}

// 眼睛：返回带动画句柄的对象
function eye(def, side, defs) {
  const type = def.eyes || 'round';
  const cx = side * 40;
  const cy = -316;
  const shapes = {
    round: { rx: 21, ry: 25, irx: 15, iry: 19, lid: 'M-25,-6 C-22,-28 18,-34 27,-10', lidW: 5.2 },
    gentle: { rx: 21, ry: 24, irx: 16, iry: 19, lid: 'M-24,-4 C-20,-27 18,-32 28,-8', lidW: 4.6, lashes: true },
    sharp: { rx: 23, ry: 17, irx: 12, iry: 14, lid: 'M-26,2 C-18,-18 16,-22 28,-6', lidW: 5.4 },
    narrow: { rx: 22, ry: 15, irx: 12, iry: 13, lid: 'M-25,0 C-16,-16 16,-18 27,-4', lidW: 5 },
  };
  const s = shapes[type] || shapes.round;
  const clipId = uid('eyeclip');
  const scleraPath = `M${-s.rx},0 C${-s.rx},${-s.ry * 1.25} ${s.rx},${-s.ry * 1.35} ${s.rx},${-s.ry * 0.1} C${s.rx},${s.ry * 1.0} ${-s.rx},${s.ry * 1.05} ${-s.rx},0Z`;
  defs.appendChild(svg('clipPath', { id: clipId }, [svg('path', { d: scleraPath })]));

  const iris = group([
    svg('ellipse', { cx: 0, cy: 0, rx: s.irx, ry: s.iry, fill: def.irisColor || '#3a2621' }),
    svg('ellipse', { cx: 0, cy: s.iry * 0.25, rx: s.irx * 0.8, ry: s.iry * 0.55, fill: def.irisLight || '#6b4535', opacity: 0.55 }),
    svg('ellipse', { cx: 0, cy: -1, rx: s.irx * 0.48, ry: s.iry * 0.5, fill: '#1c1312' }),
    svg('circle', { cx: -s.irx * 0.38, cy: -s.iry * 0.42, r: Math.max(3.5, s.irx * 0.3), fill: '#fffdf6' }),
    svg('circle', { cx: s.irx * 0.35, cy: s.iry * 0.4, r: 2.2, fill: '#fffdf6', opacity: 0.85 }),
  ]);
  const open = group([
    svg('path', { d: scleraPath, fill: '#fffaf1' }),
    group([iris], { 'clip-path': `url(#${clipId})` }),
    svg('path', { d: s.lid, fill: 'none', stroke: '#2a1f1c', 'stroke-width': s.lidW, 'stroke-linecap': 'round' }),
    svg('path', { d: `M${s.rx * 0.2},${s.ry * 0.92} C${s.rx * 0.6},${s.ry * 0.85} ${s.rx * 0.9},${s.ry * 0.55} ${s.rx},${s.ry * 0.25}`, fill: 'none', stroke: '#2a1f1c', 'stroke-width': 1.8, opacity: 0.75 }),
  ]);
  if (s.lashes) {
    open.appendChild(svg('path', { d: `M${s.rx + 4},-10 l9,-6 M${s.rx + 1},-16 l8,-9`, stroke: '#2a1f1c', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
  }
  const closed = svg('path', { d: `M${-s.rx},-2 C${-s.rx * 0.4},${s.ry * 0.5} ${s.rx * 0.5},${s.ry * 0.5} ${s.rx + 2},-4`, fill: 'none', stroke: '#2a1f1c', 'stroke-width': s.lidW * 0.85, 'stroke-linecap': 'round' });
  const happy = svg('path', { d: `M${-s.rx},4 C${-s.rx * 0.4},${-s.ry * 0.7} ${s.rx * 0.5},${-s.ry * 0.7} ${s.rx + 2},2`, fill: 'none', stroke: '#2a1f1c', 'stroke-width': s.lidW * 0.85, 'stroke-linecap': 'round' });
  const scaler = group([open]);
  const g = group([scaler, closed, happy], { transform: `translate(${cx},${cy}) scale(${side},1)` });
  return {
    el: g,
    set(openness, gx, gy, mode) {
      // gx/gy 视线方向 -1..1；镜像过的眼睛要反向
      iris.setAttribute('transform', `translate(${(gx * s.irx * 0.45 * side).toFixed(2)},${(gy * s.iry * 0.3).toFixed(2)})`);
      const o = clamp(openness, 0, 1.2);
      const showOpen = mode !== 'happy' && o > 0.18;
      scaler.style.display = showOpen ? '' : 'none';
      scaler.setAttribute('transform', `scale(1,${Math.max(0.2, o).toFixed(3)})`);
      closed.style.display = !showOpen && mode !== 'happy' ? '' : 'none';
      happy.style.display = mode === 'happy' ? '' : 'none';
    },
  };
}

function brows(def) {
  const color = def.browColor || def.hair || LINE;
  const thick = def.eyes === 'sharp' || def.eyes === 'narrow' ? 6 : 4.5;
  const make = (side) => {
    const p = svg('path', { d: 'M-22,4 C-8,-4 10,-5 24,0', fill: 'none', stroke: color, 'stroke-width': thick, 'stroke-linecap': 'round' });
    const g = group([p]);
    return { g, side };
  };
  const L = make(-1);
  const R = make(1);
  const root = group([L.g, R.g]);
  return {
    el: root,
    set(expr) {
      const cfg = {
        neutral: [0, 0], smile: [-2, -3], serious: [7, 3], angry: [16, 5], sad: [-14, -2],
        surprised: [-4, -12], worried: [-10, -3], determined: [9, 2], calm: [0, 1],
      }[expr] || [0, 0];
      for (const b of [L, R]) {
        // cfg[0] 为正 = 眉头（靠近鼻梁的一端）下压（皱眉、坚定）；为负 = 眉头上扬（悲伤、担忧）
        b.g.setAttribute('transform', `translate(${b.side * 42},${-356 + cfg[1]}) scale(${b.side},1) rotate(${-cfg[0]})`);
      }
    },
  };
}

function nose() {
  return svg('path', { d: 'M4,-292 C8,-282 6,-276 -2,-274', fill: 'none', stroke: SKIN_LINE, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
}

function mouth() {
  const lip = '#7a3f36';
  const shapes = {
    neutral: svg('path', { d: 'M-12,-246 C-4,-243 4,-243 12,-246', fill: 'none', stroke: lip, 'stroke-width': 2.8, 'stroke-linecap': 'round' }),
    smile: svg('path', { d: 'M-17,-250 C-8,-238 8,-238 17,-250', fill: 'none', stroke: lip, 'stroke-width': 2.8, 'stroke-linecap': 'round' }),
    frown: svg('path', { d: 'M-13,-241 C-5,-248 5,-248 13,-241', fill: 'none', stroke: lip, 'stroke-width': 2.8, 'stroke-linecap': 'round' }),
    flat: svg('path', { d: 'M-11,-245 L11,-245', fill: 'none', stroke: lip, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    small: group([
      svg('path', { d: 'M-10,-249 C-6,-252 6,-252 10,-249 C9,-240 -9,-240 -10,-249Z', fill: '#7d302b', stroke: lip, 'stroke-width': 2 }),
    ]),
    open: group([
      svg('path', { d: 'M-14,-252 C-8,-256 8,-256 14,-252 C13,-233 -13,-233 -14,-252Z', fill: '#7d302b', stroke: lip, 'stroke-width': 2.2 }),
      svg('path', { d: 'M-8,-238 C-3,-243 3,-243 8,-238 C4,-235 -4,-235 -8,-238Z', fill: '#d9776b' }),
      svg('path', { d: 'M-11,-252 L11,-252 L10,-248 L-10,-248Z', fill: '#fff8ee' }),
    ]),
    o: svg('ellipse', { cx: 0, cy: -245, rx: 8, ry: 10, fill: '#7d302b', stroke: lip, 'stroke-width': 2 }),
  };
  const g = group(Object.values(shapes));
  return {
    el: g,
    set(name) {
      for (const [k, el] of Object.entries(shapes)) el.style.display = k === name ? '' : 'none';
    },
  };
}

function blush(def) {
  const a = def.blush ?? 0.35;
  if (!a) return null;
  return group([-1, 1].map((s) => svg('ellipse', { cx: s * 56, cy: -270, rx: 17, ry: 7, fill: P.blush, opacity: a })));
}

function facialHair(def) {
  const c = def.hair;
  const kind = def.beard;
  if (!kind || kind === 'none') return null;
  const g = group();
  if (kind === 'mustache' || kind === 'full' || kind === 'goatee') {
    g.appendChild(svg('path', { d: 'M-3,-262 C-14,-266 -26,-262 -34,-248 C-24,-254 -14,-255 -3,-256Z M3,-262 C14,-266 26,-262 34,-248 C24,-254 14,-255 3,-256Z', fill: c }));
  }
  if (kind === 'goatee') {
    g.appendChild(svg('path', { d: 'M-12,-228 C-10,-206 -6,-186 0,-172 C6,-186 10,-206 12,-228 C6,-222 -6,-222 -12,-228Z', fill: c }));
  }
  if (kind === 'full') {
    g.appendChild(svg('path', {
      d: 'M-82,-262 C-80,-226 -54,-196 -26,-184 C-14,-170 -6,-158 0,-150 C6,-158 14,-170 26,-184 C54,-196 80,-226 82,-262 C70,-232 46,-218 20,-226 C10,-232 -10,-232 -20,-226 C-46,-218 -70,-232 -82,-262Z',
      fill: c, stroke: LINE, 'stroke-width': 1.6,
    }));
  }
  return g;
}

// ───────────────────────── 发型与冠帽 ─────────────────────────
function hairBack(def) {
  const c = def.hair;
  const st = def.hairStyle;
  const g = group();
  if (st === 'braids_long' || st === 'loose') {
    g.appendChild(svg('path', { d: 'M-100,-400 C-120,-300 -126,-200 -118,-120 L118,-120 C126,-200 120,-300 100,-400Z', fill: c, stroke: LINE, 'stroke-width': SW }));
  }
  if (st === 'bun') {
    g.appendChild(svg('path', { d: 'M-96,-380 C-120,-320 -112,-250 -96,-220 L96,-220 C112,-250 120,-320 96,-380Z', fill: c, stroke: LINE, 'stroke-width': SW }));
  }
  return g;
}

function hairFront(def) {
  const c = def.hair;
  const st = def.hairStyle;
  const g = group();
  const hl = def.hairHighlight || 'rgba(255,255,255,0.12)';
  if (st === 'topknot' || st === 'bun') {
    // 向上梳起的整齐发际 + 鬓角
    g.appendChild(svg('path', {
      d: 'M-97,-330 C-104,-410 -66,-470 0,-472 C66,-470 104,-410 97,-330 C92,-352 88,-366 82,-376 C60,-392 30,-398 0,-396 C-30,-398 -60,-392 -82,-376 C-88,-366 -92,-352 -97,-330Z',
      fill: c, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round',
    }));
    // 梳理的发丝线
    g.appendChild(svg('path', { d: 'M-50,-394 C-44,-430 -24,-456 -6,-466 M40,-392 C40,-430 26,-452 10,-466', fill: 'none', stroke: hl, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    if (st === 'topknot') {
      g.appendChild(svg('ellipse', { cx: 0, cy: -486, rx: 30, ry: 24, fill: c, stroke: LINE, 'stroke-width': SW }));
      g.appendChild(svg('rect', { x: -32, y: -478, width: 64, height: 8, rx: 3, fill: def.bandColor || '#a8382a' }));
    } else {
      // 女子发髻：两侧垂髫
      g.appendChild(svg('ellipse', { cx: 0, cy: -478, rx: 46, ry: 30, fill: c, stroke: LINE, 'stroke-width': SW }));
      g.appendChild(svg('path', { d: 'M-40,-484 L52,-500', stroke: P.gold, 'stroke-width': 4, 'stroke-linecap': 'round' }));
      g.appendChild(svg('circle', { cx: 54, cy: -501, r: 6, fill: P.gold }));
    }
  } else if (st === 'braids' || st === 'braids_long') {
    // 中分发型 + 两侧发辫
    g.appendChild(svg('path', {
      d: 'M-98,-320 C-106,-420 -60,-468 0,-470 C60,-468 106,-420 98,-320 C92,-360 74,-392 40,-404 C26,-396 12,-388 0,-372 C-12,-388 -26,-396 -40,-404 C-74,-392 -92,-360 -98,-320Z',
      fill: c, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round',
    }));
    const len = st === 'braids_long' ? 330 : 170;
    for (const s of [-1, 1]) {
      const segs = [];
      for (let y = -320; y < -320 + len; y += 26) {
        segs.push(svg('ellipse', { cx: s * 98, cy: y + 13, rx: 13, ry: 15, fill: c, stroke: LINE, 'stroke-width': 2 }));
      }
      segs.push(svg('path', { d: `M${s * 98 - 8},${-320 + len + 6} l8,22 l8,-22Z`, fill: c }));
      segs.push(svg('rect', { x: s * 98 - 10, y: -320 + len - 4, width: 20, height: 8, rx: 3, fill: def.braidTie || P.vermilion }));
      g.appendChild(group(segs, { class: `braid braid-${s}` }));
    }
  } else if (st === 'loose') {
    g.appendChild(svg('path', {
      d: 'M-98,-300 C-108,-420 -60,-470 0,-472 C60,-470 108,-420 98,-300 C88,-350 70,-384 30,-398 C20,-380 0,-366 -26,-360 C-50,-372 -80,-350 -98,-300Z',
      fill: c, stroke: LINE, 'stroke-width': SW,
    }));
  }
  return g;
}

function headwear(def, defs) {
  const kind = def.headwear;
  const g = group();
  const anim = {};
  if (kind === 'guan') {
    // 进贤冠（简化）：罩住发髻的黑色冠体 + 前高后低的冠梁
    g.appendChild(svg('path', { d: 'M-40,-462 C-40,-512 40,-512 40,-462 C20,-470 -20,-470 -40,-462Z', fill: '#221d1c', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('path', { d: 'M-28,-490 L-22,-532 C-6,-538 14,-536 28,-526 L30,-492Z', fill: '#2c2624', stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round' }));
    g.appendChild(svg('path', { d: 'M-20,-514 L26,-510', stroke: '#5d524c', 'stroke-width': 2.4 }));
    g.appendChild(svg('path', { d: 'M-46,-470 L50,-480', stroke: P.gold, 'stroke-width': 3.2, 'stroke-linecap': 'round' }));
  } else if (kind === 'ze') {
    // 赤帻（武士头巾）
    g.appendChild(svg('path', { d: 'M-98,-380 C-100,-470 100,-470 98,-380 C70,-404 -70,-404 -98,-380Z', fill: def.zeColor || '#8c3a2c', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('path', { d: 'M-40,-440 C-20,-520 30,-520 40,-440Z', fill: def.zeColor || '#8c3a2c', stroke: LINE, 'stroke-width': SW }));
  } else if (kind === 'mian') {
    // 冕冠：冕板 + 前后十二旒 + 充耳
    g.appendChild(svg('path', { d: 'M-70,-450 C-70,-505 70,-505 70,-450 L66,-436 L-66,-436Z', fill: '#1f1a19', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('rect', { x: -26, y: -528, width: 52, height: 40, fill: '#1f1a19', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('path', { d: 'M-170,-548 L170,-548 L176,-526 L-176,-526Z', fill: '#1f1a19', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('path', { d: 'M-176,-526 L176,-526 L172,-518 L-172,-518Z', fill: '#a8382a' }));
    g.appendChild(svg('path', { d: 'M-150,-480 L150,-480', stroke: P.gold, 'stroke-width': 5, 'stroke-linecap': 'round' }));
    const strings = [];
    const beadColors = ['#f4efe2', '#c2452d', '#6e9c8a', '#d6a84a', '#2f4a6d'];
    for (let i = 0; i < 12; i++) {
      const x = -160 + (i * 320) / 11;
      const s = group([], { class: 'liu' });
      s.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 118, stroke: '#3b2f29', 'stroke-width': 1.4 }));
      for (let b = 0; b < 6; b++) s.appendChild(svg('circle', { cx: 0, cy: 14 + b * 20, r: 6, fill: beadColors[(b + i) % beadColors.length], stroke: '#3b2f29', 'stroke-width': 1 }));
      const holder = group([s], { transform: `translate(${x},-520)` });
      strings.push({ g: s, x, phase: i * 0.6 });
      g.appendChild(holder);
    }
    for (const sd of [-1, 1]) {
      g.appendChild(svg('path', { d: `M${sd * 74},-450 C${sd * 104},-420 ${sd * 112},-380 ${sd * 112},-356`, fill: 'none', stroke: '#3b2f29', 'stroke-width': 1.6 }));
      g.appendChild(svg('circle', { cx: sd * 112, cy: -348, r: 9, fill: '#e9c66a', stroke: '#3b2f29', 'stroke-width': 1.4 }));
    }
    anim.liu = strings;
  } else if (kind === 'fur') {
    // 匈奴毡帽：尖顶毡帽 + 厚毛皮帽檐 + 护耳
    const hc = def.hatColor || '#7a3a2a';
    const fc = def.furColor || '#cdb28a';
    g.appendChild(svg('path', { d: 'M-92,-420 C-90,-520 -30,-580 10,-596 C30,-560 92,-500 92,-420Z', fill: hc, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round' }));
    g.appendChild(svg('path', { d: 'M-10,-590 C0,-540 4,-480 0,-430', fill: 'none', stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 3 }));
    for (const s of [-1, 1]) {
      g.appendChild(svg('path', { d: `M${s * 92},-420 C${s * 116},-380 ${s * 118},-320 ${s * 108},-286 C${s * 96},-280 ${s * 88},-300 ${s * 86},-330Z`, fill: fc, stroke: LINE, 'stroke-width': SW }));
    }
    g.appendChild(furBand(-112, 112, -428, 30, fc));
  } else if (kind === 'eagle') {
    // 单于金冠（参考内蒙古阿鲁柴登出土的鹰顶金冠）
    const gold = '#d9aa48';
    g.appendChild(svg('path', { d: 'M-90,-430 C-92,-540 92,-540 90,-430Z', fill: gold, stroke: '#6b4a1c', 'stroke-width': SW }));
    for (let i = 0; i < 4; i++) {
      g.appendChild(svg('path', { d: `M${-80 + i * 8},${-450 - i * 22} C-30,${-470 - i * 24} 30,${-470 - i * 24} ${80 - i * 8},${-450 - i * 22}`, fill: 'none', stroke: '#8a6224', 'stroke-width': 2.5 }));
    }
    g.appendChild(svg('path', { d: 'M-110,-436 C-60,-418 60,-418 110,-436 L106,-410 C60,-394 -60,-394 -106,-410Z', fill: gold, stroke: '#6b4a1c', 'stroke-width': SW }));
    for (let i = -4; i <= 4; i++) g.appendChild(svg('circle', { cx: i * 23, cy: -414 + Math.abs(i) * 1.6, r: 5, fill: '#3e8c8c', stroke: '#6b4a1c', 'stroke-width': 1 }));
    // 鹰
    const eagle = group([
      svg('path', { d: 'M-70,-560 C-40,-600 -16,-584 0,-566 C16,-584 40,-600 70,-560 C40,-570 20,-562 8,-548 L-8,-548 C-20,-562 -40,-570 -70,-560Z', fill: gold, stroke: '#6b4a1c', 'stroke-width': 2 }),
      svg('ellipse', { cx: 0, cy: -556, rx: 12, ry: 20, fill: gold, stroke: '#6b4a1c', 'stroke-width': 2 }),
      svg('circle', { cx: 0, cy: -584, r: 11, fill: '#3e8c8c', stroke: '#6b4a1c', 'stroke-width': 2 }),
      svg('path', { d: 'M4,-584 L16,-578 L4,-574Z', fill: gold }),
      svg('circle', { cx: 3, cy: -587, r: 2.2, fill: '#1c1312' }),
    ]);
    g.appendChild(eagle);
    anim.eagle = eagle;
  } else if (kind === 'beads') {
    // 匈奴女子额饰：珊瑚与绿松石串珠
    const fc = def.furColor || '#d8c19b';
    g.appendChild(svg('path', { d: 'M-100,-410 C-96,-470 96,-470 100,-410 C70,-430 -70,-430 -100,-410Z', fill: def.hatColor || '#a8442f', stroke: LINE, 'stroke-width': SW }));
    g.appendChild(furBand(-104, 104, -414, 20, fc));
    const beads = group();
    for (let i = -6; i <= 6; i++) {
      const x = i * 13;
      const y0 = -402 + Math.abs(i) * 2.5;
      const n = 2 + ((i + 6) % 3);
      beads.appendChild(svg('line', { x1: x, y1: y0, x2: x, y2: y0 + n * 11, stroke: '#3b2f29', 'stroke-width': 1 }));
      for (let b = 0; b < n; b++) beads.appendChild(svg('circle', { cx: x, cy: y0 + 6 + b * 11, r: 4.4, fill: b % 2 ? '#3e8c8c' : '#c2452d', stroke: '#3b2f29', 'stroke-width': 0.8 }));
    }
    g.appendChild(beads);
    for (const s of [-1, 1]) {
      g.appendChild(svg('line', { x1: s * 100, y1: -400, x2: s * 108, y2: -300, stroke: '#3b2f29', 'stroke-width': 1.2 }));
      for (let b = 0; b < 6; b++) g.appendChild(svg('circle', { cx: s * (101 + b * 1.2), cy: -392 + b * 16, r: 5, fill: b % 2 ? '#d6a84a' : '#c2452d', stroke: '#3b2f29', 'stroke-width': 0.8 }));
    }
  }
  return { el: g, anim };
}

function furBand(x0, x1, y, h, color) {
  const pts = [];
  const r = rng(`fur${x0}${y}`);
  const n = Math.round((x1 - x0) / 14);
  let d = `M${x0},${y}`;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    d += ` L${x.toFixed(1)},${(y - h / 2 - r() * 7).toFixed(1)}`;
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    d += ` L${x.toFixed(1)},${(y + h / 2 + r() * 7).toFixed(1)}`;
  }
  pts.push(svg('path', { d: d + 'Z', fill: color, stroke: LINE, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
  return group(pts);
}

// ───────────────────────── 身体与服装 ─────────────────────────
function torso(def, full) {
  const g = group();
  const robe = def.robeColor;
  const collar = def.collarColor;
  const inner = def.innerColor;
  const nomad = def.robe === 'nomad';
  const dir = nomad ? -1 : 1; // 汉服右衽（视觉上呈 y 字），游牧左衽为镜像

  // 下摆延伸（全身）
  const bottom = full ? (nomad ? 520 : 880) : 0;
  const flare = full ? (nomad ? 30 : 70) : 0;
  const body = `M-40,-206 C-92,-188 -160,-178 -186,-142 C-206,-112 -214,-46 -222,0 C-226,${bottom * 0.5} ${-226 - flare},${bottom * 0.9} ${-230 - flare},${bottom} L${230 + flare},${bottom} C${226 + flare},${bottom * 0.9} 226,${bottom * 0.5} 222,0 C214,-46 206,-112 186,-142 C160,-178 92,-188 40,-206Z`;

  // 领口后沿
  g.appendChild(svg('path', { d: 'M-46,-208 C-30,-236 30,-236 46,-208 L40,-196 C20,-214 -20,-214 -40,-196Z', fill: collar, stroke: LINE, 'stroke-width': SW }));
  g.appendChild(svg('path', { d: body, fill: robe, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round' }));

  // 交领：长边从一侧肩颈斜下到另一侧
  const crossY = -118;
  const endX = -150 * dir;
  const endY = full ? 40 : 0;
  // 内衣（中衣）领口三角区
  g.appendChild(svg('path', { d: `M${-36 * dir},-206 L${36 * dir},-206 L${-4 * dir},${crossY}Z`, fill: inner, stroke: LINE, 'stroke-width': 2 }));
  // 中衣领缘（白）
  g.appendChild(svg('path', { d: `M${-40 * dir},-205 L${-6 * dir},${crossY + 6} L${4 * dir},${crossY - 10} L${-26 * dir},-208Z`, fill: '#f6f0e2', stroke: LINE, 'stroke-width': 1.6 }));
  // 内襟领缘（短边）
  g.appendChild(svg('path', { d: `M${-46 * dir},-204 L${-12 * dir},${crossY + 14} L${-2 * dir},${crossY} L${-34 * dir},-207Z`, fill: collar, stroke: LINE, 'stroke-width': 2 }));
  // 外襟领缘（长边）
  const bw = 30;
  g.appendChild(svg('path', {
    d: `M${36 * dir},-207 L${(36 + bw) * dir},-203 L${(endX + bw * 1.2 * dir)},${endY} L${endX},${endY}Z`,
    fill: collar, stroke: LINE, 'stroke-width': 2, 'stroke-linejoin': 'round',
  }));
  // 领缘纹样（细线）
  g.appendChild(svg('path', { d: `M${(36 + bw * 0.5) * dir},-205 L${endX + bw * 0.6 * dir},${endY}`, stroke: nomad ? '#8a6a3a' : P.goldLight, 'stroke-width': 2, 'stroke-dasharray': '6 6', opacity: 0.8 }));
  // 中衣白色内缘
  g.appendChild(svg('path', { d: `M${30 * dir},-207 L${36 * dir},-207 L${endX + 2 * dir},${endY} L${endX - 6 * dir},${endY}Z`, fill: '#f6f0e2' }));

  if (nomad) {
    // 毛皮领与袖口
    g.appendChild(furBand(-60, 60, -210, 22, def.furColor || '#cdb28a'));
  }
  // 手臂分界线
  for (const s of [-1, 1]) {
    g.appendChild(svg('path', { d: `M${s * 150},-118 C${s * 156},-70 ${s * 160},-30 ${s * 162},${full ? 260 : 0}`, fill: 'none', stroke: LINE, 'stroke-width': 2, opacity: 0.55 }));
  }
  // 腰带
  if (full) {
    const by = 120;
    g.appendChild(svg('path', { d: `M-224,${by - 22} C-80,${by - 10} 80,${by - 10} 224,${by - 22} L226,${by + 18} C80,${by + 30} -80,${by + 30} -226,${by + 18}Z`, fill: def.beltColor || '#2b2422', stroke: LINE, 'stroke-width': 2 }));
    if (def.goldBelt || nomad) {
      g.appendChild(svg('rect', { x: -40, y: by - 16, width: 80, height: 40, rx: 6, fill: '#d6a84a', stroke: '#6b4a1c', 'stroke-width': 2 }));
      g.appendChild(svg('path', { d: `M-28,${by + 4} C-14,${by - 10} 14,${by + 18} 28,${by + 4}`, fill: 'none', stroke: '#6b4a1c', 'stroke-width': 2.5 }));
    } else {
      g.appendChild(svg('path', { d: `M-30,${by + 20} L-44,${by + 200} M-14,${by + 22} L-20,${by + 210}`, stroke: def.beltColor || '#2b2422', 'stroke-width': 9, 'stroke-linecap': 'round' }));
    }
    // 下摆边缘
    g.appendChild(svg('path', { d: `M${-230 - flare},${bottom - 26} L${230 + flare},${bottom - 26} L${230 + flare},${bottom} L${-230 - flare},${bottom}Z`, fill: collar, stroke: LINE, 'stroke-width': 2 }));
    if (nomad) {
      // 裤与靴
      for (const s of [-1, 1]) {
        g.appendChild(svg('path', { d: `M${s * 30},${bottom} L${s * 34},860 L${s * 130},860 L${s * 140},${bottom}Z`, fill: def.innerColor || '#3d2f28', stroke: LINE, 'stroke-width': SW }));
        g.appendChild(svg('path', { d: `M${s * 26},780 L${s * 22},900 C${s * 60},912 ${s * 150},914 ${s * 168},896 L${s * 140},780Z`, fill: '#5a3a26', stroke: LINE, 'stroke-width': SW }));
      }
    } else {
      for (const s of [-1, 1]) g.appendChild(svg('path', { d: `M${s * 40},${bottom - 4} C${s * 40},${bottom + 26} ${s * 120},${bottom + 26} ${s * 124},${bottom - 4}Z`, fill: '#221d1c', stroke: LINE, 'stroke-width': 2 }));
    }
  }

  // 帝王十二章：左肩日、右肩月
  if (def.emblems) {
    g.appendChild(svg('circle', { cx: 132, cy: -150, r: 20, fill: '#c2452d', stroke: P.gold, 'stroke-width': 3 }));
    g.appendChild(svg('circle', { cx: -132, cy: -150, r: 20, fill: '#f1ead6', stroke: P.gold, 'stroke-width': 3 }));
    g.appendChild(svg('path', { d: 'M126,-156 l6,-6 l6,6', fill: 'none', stroke: '#2b1f19', 'stroke-width': 2 }));
  }
  if (def.robe === 'armor') {
    // 札甲：成排的甲片
    const plates = group();
    for (let row = 0; row < 5; row++) {
      const y = -150 + row * 32;
      for (let x = -170 + (row % 2) * 14; x < 170; x += 28) {
        plates.appendChild(svg('rect', { x, y, width: 24, height: 28, rx: 3, fill: '#5d5650', stroke: '#2b2422', 'stroke-width': 1.6 }));
      }
    }
    const clipId = uid('armorclip');
    g.appendChild(svg('clipPath', { id: clipId }, [svg('path', { d: body })]));
    g.appendChild(group([plates], { 'clip-path': `url(#${clipId})` }));
  }
  return g;
}

// 手臂姿势（拱手、持节、下垂）
function arms(def, pose, full) {
  const g = group();
  const robe = def.robeColor;
  const cuff = def.collarColor;
  if (pose === 'gongshou') {
    // 拱手：双袖从两肩收向胸前，袖口相对，手在袖口上方相叠
    for (const sd of [-1, 1]) {
      g.appendChild(svg('path', {
        d: `M${sd * 186},-136 C${sd * 204},-80 ${sd * 176},-14 ${sd * 104},-8 C${sd * 70},-6 ${sd * 38},-22 ${sd * 16},-44 L${sd * 22},-116 C${sd * 64},-108 ${sd * 112},-104 ${sd * 150},-120Z`,
        fill: robe, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round',
      }));
      g.appendChild(svg('path', { d: `M${sd * 150},-118 C${sd * 120},-96 ${sd * 90},-70 ${sd * 70},-30`, fill: 'none', stroke: LINE, 'stroke-width': 1.8, opacity: 0.5 }));
    }
    // 手（右手握拳，左手覆于其上）
    g.appendChild(svg('path', { d: 'M-30,-96 C-34,-128 -10,-142 8,-138 C30,-134 38,-112 30,-92 C22,-76 -22,-74 -30,-96Z', fill: def.skin, stroke: SKIN_LINE, 'stroke-width': 2.2 }));
    g.appendChild(svg('path', { d: 'M-18,-128 C-8,-136 8,-136 18,-126 M-22,-112 C-8,-120 10,-120 24,-110', fill: 'none', stroke: SKIN_LINE, 'stroke-width': 1.8 }));
    for (const sd of [-1, 1]) {
      g.appendChild(svg('path', { d: `M${sd * 16},-44 L${sd * 22},-116 L${sd * 46},-112 L${sd * 40},-36Z`, fill: cuff, stroke: LINE, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      g.appendChild(svg('path', { d: `M${sd * 30},-40 L${sd * 34},-114`, stroke: '#f6f0e2', 'stroke-width': 2.4, opacity: 0.8 }));
    }
  } else if (pose === 'hold') {
    // 右手（画面左侧）握持一根竖杆，杆由 prop 层绘制
    g.appendChild(svg('path', { d: 'M-186,-136 C-210,-90 -196,-40 -170,-20 C-150,-6 -120,-10 -104,-30 L-120,-70 C-140,-60 -150,-80 -150,-110Z', fill: robe, stroke: LINE, 'stroke-width': SW }));
    g.appendChild(svg('path', { d: 'M-128,-60 C-120,-84 -96,-88 -84,-70 C-76,-56 -84,-36 -100,-30 C-116,-26 -132,-40 -128,-60Z', fill: def.skin, stroke: SKIN_LINE, 'stroke-width': 2 }));
    g.appendChild(svg('path', { d: 'M-122,-62 L-88,-66 M-124,-48 L-90,-50', stroke: SKIN_LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('path', { d: 'M-170,-26 C-150,-10 -126,-16 -116,-28 L-110,-20 C-124,0 -158,6 -178,-14Z', fill: cuff, stroke: LINE, 'stroke-width': 1.8 }));
  } else if (full) {
    // 全身：宽袖下垂
    for (const s of [-1, 1]) {
      g.appendChild(svg('path', {
        d: `M${s * 186},-138 C${s * 220},-60 ${s * 240},120 ${s * 250},300 C${s * 230},330 ${s * 170},330 ${s * 150},300 C${s * 156},180 ${s * 150},40 ${s * 150},-100Z`,
        fill: robe, stroke: LINE, 'stroke-width': SW, 'stroke-linejoin': 'round',
      }));
      g.appendChild(svg('path', { d: `M${s * 250},300 C${s * 230},330 ${s * 170},330 ${s * 150},300 L${s * 152},282 C${s * 172},306 ${s * 228},306 ${s * 246},280Z`, fill: cuff }));
    }
  }
  return g;
}

// ───────────────────────── 组件 ─────────────────────────
register('character', (params, ctx) => {
  const id = params.character || params.id;
  const def = resolveDef(id, ctx, params);
  const full = !!def.full;
  const pose = def.pose || 'rest';
  const defs = ctx.defs;

  const body = group([torso(def, full), arms(def, pose, full)]);
  const e1 = eye(def, -1, defs);
  const e2 = eye(def, 1, defs);
  const br = brows(def);
  const mo = mouth();
  const hw = headwear(def, defs);
  const features = group([e1.el, e2.el, br.el, nose(), blush(def), mo.el, facialHair(def)]);
  const shade = svg('path', {
    d: 'M-96,-460 L96,-460 L96,-300 C60,-290 -60,-290 -96,-300Z',
    fill: '#1d1426', opacity: 0,
  });
  const backHair = group([hairBack(def)]);
  const head = group([ears(def), face(def), features, shade, hairFront(def), hw.el]);
  const neckG = neck(def);
  const root = group([backHair, neckG, body, head]);

  const r = rng(`char:${id}:${ctx.scene.id}`);
  const blinkPhase = r.range(0, 3);
  const swayPhase = r.range(0, 10);

  function exprAt(t) {
    // 当前台词若由该角色说出且指定表情，则使用；其余时间用 reactions 或默认表情
    const line = ctx.lineAt(t);
    if (line) {
      if (line.speaker === id && line.expression) return line.expression;
      if (line.reactions?.[id]) return line.reactions[id];
    }
    return def.expression || 'neutral';
  }

  return {
    el: root,
    update(t) {
      const tt = onTwos(t);
      const expr = exprAt(t);
      // 呼吸
      const breathe = Math.sin(((t + swayPhase) * 2 * Math.PI) / 3.6);
      body.setAttribute('transform', `translate(0,${(breathe * -1.2).toFixed(2)}) scale(1,${(1 + breathe * 0.004).toFixed(4)})`);
      neckG.setAttribute('transform', `translate(0,${(breathe * -1.6).toFixed(2)})`);
      // 头部轻微摆动；说话时跟随音量点头
      const open = ctx.mouth(id, t);
      const talk = ctx.speaking(id, t);
      const sway = (noise1(tt * 0.35 + swayPhase, 3) - 0.5) * 2.4;
      const tilt = (def.tilt || 0) + sway + (talk ? (noise1(tt * 2.2, 9) - 0.5) * 2.2 : 0);
      const nod = talk ? open * 3.5 : 0;
      const headTf = `translate(${(def.turn || 0) * 4},${(breathe * -2 + nod).toFixed(2)}) rotate(${tilt.toFixed(2)} 0 -210)`;
      head.setAttribute('transform', headTf);
      backHair.setAttribute('transform', headTf);
      features.setAttribute('transform', `translate(${((def.turn || 0) * 10).toFixed(1)},0)`);

      // 眨眼（每 3~5 秒一次，持续两拍）
      let eyeOpen = 1;
      const period = 3.4 + (blinkPhase % 1.6);
      const bt = (t + blinkPhase) % period;
      if (bt < 0.09) eyeOpen = 0.05;
      else if (bt < 0.17) eyeOpen = 0.45;
      let mode = null;
      if (expr === 'closed' || expr === 'calm-closed') eyeOpen = 0;
      if (expr === 'happy') mode = 'happy';
      if (expr === 'surprised') eyeOpen *= 1.12;
      if (expr === 'sad' || expr === 'tired') eyeOpen *= 0.78;
      if (expr === 'serious' || expr === 'angry' || expr === 'determined') eyeOpen *= 0.88;
      const look = def.look || [0, 0];
      const gx = (Array.isArray(look) ? look[0] : look) + (noise1(tt * 0.25, 17) - 0.5) * 0.15;
      const gy = (Array.isArray(look) ? look[1] : 0) + (expr === 'sad' ? 0.35 : 0);
      e1.set(eyeOpen, gx, gy, mode);
      e2.set(eyeOpen, gx, gy, mode);
      br.set(expr);

      // 口型：按音量包络在三档之间切换（一拍二）
      let m;
      const env = ctx.mouth(id, tt);
      if (talk && env > 0.5) m = 'open';
      else if (talk && env > 0.16) m = 'small';
      else m = { smile: 'smile', happy: 'smile', sad: 'frown', angry: 'frown', worried: 'frown', surprised: 'o', serious: 'flat', determined: 'flat' }[expr] || 'neutral';
      mo.set(m);

      shade.setAttribute('opacity', String(def.shade ?? (expr === 'grim' ? 0.35 : 0)));

      // 冕旒随动作轻摆
      if (hw.anim.liu) {
        for (const s of hw.anim.liu) {
          const a = Math.sin(t * 2.1 + s.phase) * 1.2 - tilt * 0.6;
          s.g.setAttribute('transform', `rotate(${a.toFixed(2)})`);
        }
      }
    },
  };
});

// 远景小人（群像、行进队伍用的简化全身人物）
export function drawFigure(params) {
  const c = params.color || '#33476a';
  const kind = params.kind || 'han';
  const g = group();
  const skin = params.skin || P.skin;
  if (kind === 'han' || kind === 'official') {
    g.appendChild(svg('path', { d: 'M-16,-70 C-30,-60 -34,-20 -38,0 L38,0 C34,-20 30,-60 16,-70Z', fill: c, stroke: LINE, 'stroke-width': 2 }));
    g.appendChild(svg('circle', { cx: 0, cy: -82, r: 13, fill: skin, stroke: SKIN_LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('path', { d: 'M-13,-86 C-12,-100 12,-100 13,-86Z', fill: '#2b2422' }));
    g.appendChild(svg('rect', { x: -7, y: -108, width: 14, height: 14, rx: 2, fill: '#221d1c' }));
  } else if (kind === 'kneel') {
    // 跪坐的朝臣（背影）
    g.appendChild(svg('path', { d: 'M-40,0 C-44,-30 -30,-54 0,-58 C30,-54 44,-30 40,0Z', fill: c, stroke: LINE, 'stroke-width': 2 }));
    g.appendChild(svg('circle', { cx: 0, cy: -68, r: 14, fill: '#2b2422', stroke: LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('rect', { x: -9, y: -94, width: 18, height: 16, rx: 2, fill: '#221d1c' }));
  } else if (kind === 'nomad') {
    g.appendChild(svg('path', { d: 'M-18,-68 C-30,-56 -32,-28 -30,-20 L30,-20 C32,-28 30,-56 18,-68Z', fill: c, stroke: LINE, 'stroke-width': 2 }));
    g.appendChild(svg('path', { d: 'M-14,-20 L-16,0 L-4,0 L-2,-20 M14,-20 L16,0 L4,0 L2,-20', fill: '#4a3527', stroke: LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('circle', { cx: 0, cy: -80, r: 13, fill: params.skin || '#e8c19c', stroke: SKIN_LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('path', { d: 'M-15,-82 C-14,-104 0,-112 4,-112 C10,-104 16,-96 15,-82Z', fill: params.hat || '#7a3a2a', stroke: LINE, 'stroke-width': 1.6 }));
  } else if (kind === 'soldier') {
    g.appendChild(svg('path', { d: 'M-16,-70 C-30,-60 -32,-20 -34,0 L34,0 C32,-20 30,-60 16,-70Z', fill: c, stroke: LINE, 'stroke-width': 2 }));
    g.appendChild(svg('circle', { cx: 0, cy: -82, r: 13, fill: skin, stroke: SKIN_LINE, 'stroke-width': 1.6 }));
    g.appendChild(svg('path', { d: 'M-14,-86 C-13,-102 13,-102 14,-86Z', fill: '#8c3a2c' }));
    g.appendChild(svg('line', { x1: 30, y1: 10, x2: 30, y2: -150, stroke: '#5a3b2a', 'stroke-width': 3 }));
    g.appendChild(svg('path', { d: 'M30,-150 l-6,-22 l6,-8 l6,8Z', fill: '#9aa0a0', stroke: LINE, 'stroke-width': 1.2 }));
  }
  return g;
}

register('figure', (params) => ({ el: drawFigure(params) }));

// 一排人物（左右对称的朝堂、列队）
register('crowd', (params, ctx) => {
  const g = group();
  const n = params.count || 6;
  const kind = params.kind || 'kneel';
  const colors = params.colors || ['#33476a', '#5b2f2a', '#2f4a3d', '#4a3a5a'];
  const r = ctx.rng(`crowd${params.seed || ''}`);
  const rows = params.rows || 1;
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < n; i++) {
      const x = (params.spacing || 90) * i + row * (params.rowShift || 20) + r.range(-6, 6);
      const y = row * (params.rowGap || 40);
      const s = (params.size || 1) * (1 - row * 0.08);
      const one = drawFigure({ kind, color: colors[(i + row) % colors.length], skin: params.skin, hat: params.hat });
      one.setAttribute('transform', `translate(${x.toFixed(1)},${y}) scale(${s})`);
      g.appendChild(one);
    }
  }
  return { el: g };
});
