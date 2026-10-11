// 五款機：三爪機、兩爪橋機、甩爪機、塑膠環機、吊環機
import { Q, LAYER } from './phys.js';
import { makePlush, makeBox, makeRingPrize, makeHangPrize, CHARACTERS } from './prizes.js';

const PLUSH_POOL = ['bear', 'bunny', 'cat', 'chick', 'pig', 'frog', 'panda', 'seal', 'dino'];

// 隨機揀角色（稀有度越高越少見）
export function pickChar(rng = Math.random, pool = PLUSH_POOL, goldenChance = 0.03) {
  if (rng() < goldenChance) return 'golden';
  const w = pool.map(c => 1 / CHARACTERS[c].rarity);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}

export const BOX_DESIGNS = [
  { name: '布丁熊 珍藏手辦盒', char: 'bear', color: 0xf7c873, accent: 0x8a4f22, rarity: 3 },
  { name: '棉花兔 夢幻手辦盒', char: 'bunny', color: 0xffc8dd, accent: 0xd94f86, rarity: 3 },
  { name: '小恐龍嘉嘉 冒險盒', char: 'dino', color: 0x9be3d6, accent: 0x1f7a6d, rarity: 4 },
  { name: '芝麻貓 夜光手辦盒', char: 'cat', color: 0xb9b6e8, accent: 0x3b3580, rarity: 3 },
  { name: '抹茶蛙 野餐禮盒', char: 'frog', color: 0xc9eb9c, accent: 0x3f7a1d, rarity: 3 },
];

// ---------- 共用：機殼（地台、玻璃、出口洞） ----------
function cabinet(ctx, o) {
  const { P } = ctx;
  const W = o.w, D = o.d, fy = o.floorY ?? 0, H = o.topY + 1.2;
  const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
  const th = 0.5;
  const rects = [];
  if (o.hole) {
    const h = o.hole;
    if (h.x0 > x0) rects.push([x0, h.x0, z0, z1]);
    if (h.x1 < x1) rects.push([h.x1, x1, z0, z1]);
    if (h.z0 > z0) rects.push([h.x0, h.x1, z0, h.z0]);
    if (h.z1 < z1) rects.push([h.x0, h.x1, h.z1, z1]);
  } else if (o.floor !== false) rects.push([x0, x1, z0, z1]);
  for (const [a, b, c, d] of rects) {
    ctx.addStatic({ t: 'box', h: [(b - a) / 2, th / 2, (d - c) / 2], cr: 0.02 }, [(a + b) / 2, fy - th / 2, (c + d) / 2], null, { kind: 'floor', color: o.floorColor }, { friction: o.floorFriction ?? 0.55 });
  }
  // 牆（玻璃 / 背板）
  const wt = 0.3, wh = (H - fy) + 6;
  const wy = fy - 6 + wh / 2;
  ctx.addStatic({ t: 'box', h: [wt / 2, wh / 2, D / 2 + wt] }, [x0 - wt / 2, wy, 0], null, { kind: 'glass', side: 'left', y0: fy, y1: H }, { friction: 0.2 });
  ctx.addStatic({ t: 'box', h: [wt / 2, wh / 2, D / 2 + wt] }, [x1 + wt / 2, wy, 0], null, { kind: 'glass', side: 'right', y0: fy, y1: H }, { friction: 0.2 });
  ctx.addStatic({ t: 'box', h: [W / 2 + wt, wh / 2, wt / 2] }, [0, wy, z0 - wt / 2], null, { kind: 'back', y0: fy, y1: H, color: o.backColor }, { friction: 0.3 });
  ctx.addStatic({ t: 'box', h: [W / 2 + wt, wh / 2, wt / 2] }, [0, wy, z1 + wt / 2], null, { kind: 'glass', side: 'front', y0: fy, y1: H }, { friction: 0.2 });
  ctx.addStatic({ t: 'box', h: [W / 2, 0.2, D / 2] }, [0, H + 0.2, 0], null, { kind: 'none' });
  // 出口洞：透明擋板 + 下面嘅槽
  if (o.hole) {
    const h = o.hole, gh = o.guard ?? 1.1, gt = 0.08;
    if (h.x1 < x1) ctx.addStatic({ t: 'box', h: [gt / 2, gh / 2, (h.z1 - h.z0) / 2], cr: 0.02 }, [h.x1 + gt / 2, fy + gh / 2, (h.z0 + h.z1) / 2], null, { kind: 'acrylic' }, { friction: 0.25 });
    if (h.x0 > x0) ctx.addStatic({ t: 'box', h: [gt / 2, gh / 2, (h.z1 - h.z0) / 2], cr: 0.02 }, [h.x0 - gt / 2, fy + gh / 2, (h.z0 + h.z1) / 2], null, { kind: 'acrylic' }, { friction: 0.25 });
    if (h.z0 > z0) ctx.addStatic({ t: 'box', h: [(h.x1 - h.x0) / 2 + gt, gh / 2, gt / 2], cr: 0.02 }, [(h.x0 + h.x1) / 2, fy + gh / 2, h.z0 - gt / 2], null, { kind: 'acrylic' }, { friction: 0.25 });
    if (h.z1 < z1) ctx.addStatic({ t: 'box', h: [(h.x1 - h.x0) / 2 + gt, gh / 2, gt / 2], cr: 0.02 }, [(h.x0 + h.x1) / 2, fy + gh / 2, h.z1 + gt / 2], null, { kind: 'acrylic' }, { friction: 0.25 });
    // 槽底（斜向前面個出口）
    const by = fy - 5.5;
    ctx.addStatic({ t: 'box', h: [(h.x1 - h.x0) / 2, 0.2, (h.z1 - h.z0) / 2 + 0.3] }, [(h.x0 + h.x1) / 2, by, (h.z0 + h.z1) / 2], Q.axisAngle(1, 0, 0, 0.18), { kind: 'chuteBottom' }, { friction: 0.3 });
    // 槽壁（洞內側）
    if (h.x1 < x1) ctx.addStatic({ t: 'box', h: [0.1, 2.8, (h.z1 - h.z0) / 2] }, [h.x1 + 0.1, fy - 2.8, (h.z0 + h.z1) / 2], null, { kind: 'chute' });
    if (h.x0 > x0) ctx.addStatic({ t: 'box', h: [0.1, 2.8, (h.z1 - h.z0) / 2] }, [h.x0 - 0.1, fy - 2.8, (h.z0 + h.z1) / 2], null, { kind: 'chute' });
    if (h.z0 > z0) ctx.addStatic({ t: 'box', h: [(h.x1 - h.x0) / 2, 2.8, 0.1] }, [(h.x0 + h.x1) / 2, fy - 2.8, h.z0 - 0.1], null, { kind: 'chute' });
  }
}

function inHole(p, h, pad = 0) { return p[0] > h.x0 - pad && p[0] < h.x1 + pad && p[2] > h.z0 - pad && p[2] < h.z1 + pad; }

// 撒公仔：喺洞以外隨機位置由高處跌落
function scatterPlush(ctx, M, n, s = 1) {
  const { w, d, hole } = M.geo;
  for (let i = 0; i < n; i++) {
    let x, z, tries = 0;
    do {
      x = (Math.random() * 2 - 1) * (w / 2 - 1.0);
      z = (Math.random() * 2 - 1) * (d / 2 - 1.0);
      tries++;
    } while (hole && inHole([x, 0, z], hole, 1.3) && tries < 50);
    const y = 1.2 + (i % 4) * 1.6 + Math.random() * 0.6;
    ctx.addPrize(makePlush(ctx.P, pickChar(), [x, y, z], Math.random() * Math.PI * 2, s * (0.92 + Math.random() * 0.16)));
  }
}

export const MACHINES = [
  {
    id: 'tri', name: '三爪公仔機', tag: '經典', desc: '最經典嘅三爪機，公仔堆到成座山，夾起拎去左下角個洞就贏。',
    price: 1, difficulty: 2, theme: { main: '#ff4f8b', glow: '#ffd1e1', body: 0xe8336f, trim: 0xffc531 },
    geo: { w: 8, d: 7, floorY: 0, topY: 10, hole: { x0: -4, x1: -1.75, z0: 1.25, z1: 3.5 }, guard: 1.1, floorColor: 0xf4c3d6, backColor: 0xff7aa8 },
    claw: { type: 'three', speed: 2.6, accel: 14, dropSpeed: 5, liftSpeed: 4 },
    defaults: { g1: 0.85, g2: 0.35, stage2: 'top', payout: 12, jitter: 0.12, topShake: 0.35, manualClose: true },
    build(ctx) { cabinet(ctx, this.geo); scatterPlush(ctx, this, 13); },
    refill(ctx) { scatterPlush(ctx, this, 1); },
    target: 13,
    isWin(p, P) { const q = P.pos(p.main); return q[1] < this.geo.floorY - 1.0 && inHole(q, this.geo.hole, 0.3); },
  },
  {
    id: 'bridge', name: '兩爪橋機', tag: 'UFO式', desc: '盒裝手辦擺喺兩條橋上面，用兩爪推、撬、轉，等盒跌落中間就贏。',
    price: 2, difficulty: 4, view: 'corner', theme: { main: '#3fa9ff', glow: '#cfe9ff', body: 0x2f7fe0, trim: 0xffffff },
    geo: { w: 8, d: 7, floorY: -3, topY: 10, floorColor: 0x2b3a55, backColor: 0x4d8fe0 },
    claw: { type: 'two', speed: 2.4, accel: 12, dropSpeed: 4.5, liftSpeed: 3.6, floorY: 2.45, fingerFriction: 0.8 },
    defaults: { g1: 0.55, g2: 0.3, stage2: 'top', payout: 0, jitter: 0.1, topShake: 0.2, manualClose: true },
    bars: { x: 1.26, y: 2.6, r: 0.14 },
    build(ctx) {
      const g = this.geo, b = this.bars;
      cabinet(ctx, { ...g, floor: true });
      // 兩條橋
      for (const sx of [-1, 1]) {
        ctx.addStatic({ t: 'capsule', hh: g.d / 2 - 0.15, r: b.r }, [sx * b.x, b.y, 0], Q.axisAngle(1, 0, 0, Math.PI / 2), { kind: 'bar' }, { friction: 0.5 });
        // 兩邊台（擋住盒唔會跌出去）
        const top = b.y - 0.15, hh = (top + 3) / 2;
        ctx.addStatic({ t: 'box', h: [0.9, hh, g.d / 2] }, [sx * 3.1, -3 + hh, 0], null, { kind: 'ledge' }, { friction: 0.4 });
        ctx.addStatic({ t: 'box', h: [0.05, 0.6, g.d / 2] }, [sx * 2.2, b.y + 0.1, 0], Q.axisAngle(0, 0, 1, sx * -0.6), { kind: 'acrylic' }, { friction: 0.3 });
      }
      this.spawnBox(ctx, -1.65); this.spawnBox(ctx, 1.65);
    },
    spawnBox(ctx, z) {
      const d = BOX_DESIGNS[Math.floor(Math.random() * BOX_DESIGNS.length)];
      const yaw = (Math.random() * 2 - 1) * 0.08;
      ctx.addPrize(makeBox(ctx.P, d, [(Math.random() * 2 - 1) * 0.15, this.bars.y + this.bars.r + 0.57, z], [3.1, 1.1, 2.0], yaw, { mass: 0.3, friction: 0.4 }));
    },
    refill(ctx) {
      // 邊行空咗就補
      const used = ctx.prizes.map(p => ctx.P.pos(p.main)[2]);
      const z = used.some(v => v < 0) ? 1.65 : -1.65;
      this.spawnBox(ctx, z);
    },
    target: 2,
    isWin(p, P) { return P.pos(p.main)[1] < this.bars.y - 1.6; },
  },
  {
    id: 'swing', name: '甩爪機', tag: '繩吊', desc: '爪吊喺繩上面，天車一郁就會擺。趁佢擺嗰下落爪，可以甩去撞、去勾。',
    price: 1, difficulty: 3, theme: { main: '#9b5cff', glow: '#e6d7ff', body: 0x7a3fe0, trim: 0x52e3c2 },
    geo: { w: 9, d: 7, floorY: 0, topY: 11, hole: { x0: 2.2, x1: 4.5, z0: 1.25, z1: 3.5 }, guard: 0.9, floorColor: 0xd8ccff, backColor: 0x9b7bff },
    claw: { type: 'three_rope', rope: true, ropeLen: 2.4, speed: 3.6, accel: 16, dropSpeed: 4.5, liftSpeed: 4 },
    defaults: { g1: 0.85, g2: 0.4, stage2: 'top', payout: 10, jitter: 0.12, topShake: 0.3, manualClose: true },
    build(ctx) { cabinet(ctx, this.geo); scatterPlush(ctx, this, 14, 0.85); },
    refill(ctx) { scatterPlush(ctx, this, 1, 0.85); },
    target: 14,
    isWin(p, P) { const q = P.pos(p.main); return q[1] < this.geo.floorY - 1.0 && inHole(q, this.geo.hole, 0.3); },
  },
  {
    id: 'ring', name: '塑膠環機', tag: '穿環', desc: '每隻公仔頭頂有個膠環，要用幼爪尖穿入個環，吊起佢拎去出口。',
    price: 2, difficulty: 4, theme: { main: '#ff9d2e', glow: '#ffe3c2', body: 0xf07f12, trim: 0x2ec4ff },
    geo: { w: 8, d: 6.5, floorY: 0, topY: 10, hole: { x0: -4, x1: -1.85, z0: 1.15, z1: 3.25 }, guard: 0.9, floorColor: 0xffe0b8, backColor: 0xffa94d },
    claw: { type: 'two_slim', speed: 2.2, accel: 12, dropSpeed: 4, liftSpeed: 3.5, floorY: 2.25, fingerFriction: 0.5 },
    defaults: { g1: 0.6, g2: 0.25, stage2: 'top', payout: 0, jitter: 0.1, topShake: 0.35, manualClose: true },
    slots: [[-0.6, -1.8], [1.4, -1.8], [3.0, -1.8], [-2.6, -1.8], [-0.6, 0.6], [1.4, 0.6], [3.0, 0.6], [0.4, 2.4], [2.4, 2.4]],
    build(ctx) {
      cabinet(ctx, this.geo);
      const n = 8;
      this.slots.slice(0, n).forEach(([x, z]) => this.spawnAt(ctx, x, z));
    },
    spawnAt(ctx, x, z) {
      const colors = [0xff4f8b, 0x2ec4ff, 0xffc531, 0x52e3c2, 0x9b5cff];
      ctx.addPrize(makeRingPrize(ctx.P, pickChar(), [x + (Math.random() - 0.5) * 0.3, 0.85, z + (Math.random() - 0.5) * 0.3], (Math.random() - 0.5) * 1.0, { ringColor: colors[Math.floor(Math.random() * colors.length)] }));
    },
    refill(ctx) {
      // 揀個空位
      const ps = ctx.prizes.map(p => ctx.P.pos(p.main));
      let best = this.slots[0], bd = -1;
      for (const s of this.slots) { const d = Math.min(...ps.map(p => Math.hypot(p[0] - s[0], p[2] - s[1])), 99); if (d > bd) { bd = d; best = s; } }
      this.spawnAt(ctx, best[0], best[1]);
    },
    target: 8,
    isWin(p, P) { const q = P.pos(p.main); return q[1] < this.geo.floorY - 1.0 && inHole(q, this.geo.hole, 0.3); },
  },
  {
    id: 'hook', name: '吊環機', tag: '推環', desc: '獎品用環掛喺鈎上面。用爪推個環或者勾起佢，令佢甩出鈎頭跌落就贏。',
    price: 1, difficulty: 3, theme: { main: '#29c76f', glow: '#c9f5dc', body: 0x1fa65a, trim: 0xffe14d },
    geo: { w: 8, d: 6.5, floorY: 0, topY: 10.5, floorColor: 0xbfeccf, backColor: 0x4fd18b },
    claw: { type: 'two_slim', speed: 2.2, accel: 12, dropSpeed: 4, liftSpeed: 3.5, floorY: 4.7, fingerFriction: 0.5 },
    defaults: { g1: 0.6, g2: 0.45, stage2: 'top', payout: 0, jitter: 0.05, topShake: 0.2, manualClose: true },
    rods: { y: 5.6, r: 0.075, tip: 1.05, zs: [-1.5, 0.9], stop: 0.12 },
    build(ctx) {
      const g = this.geo, R = this.rods;
      cabinet(ctx, { ...g });
      this.hangSlots = [];
      for (const sx of [-1, 1]) for (const z of R.zs) {
        const len = g.w / 2 - R.tip;
        ctx.addStatic({ t: 'capsule', hh: len / 2, r: R.r }, [sx * (R.tip + len / 2), R.y, z], Q.axisAngle(0, 0, 1, Math.PI / 2), { kind: 'hook' }, { friction: 0.25 });
        ctx.addStatic({ t: 'capsule', hh: R.stop / 2, r: R.r * 0.9 }, [sx * R.tip, R.y + R.stop / 2 + 0.02, z], null, { kind: 'hook' }, { friction: 0.25 });
        ctx.addStatic({ t: 'box', h: [0.25, 0.25, 0.25] }, [sx * (g.w / 2 - 0.25), R.y, z], null, { kind: 'hookBase' });
        for (const x of [1.75, 2.75]) this.hangSlots.push([sx * x, z]);
      }
      for (const [x, z] of this.hangSlots) this.hangAt(ctx, x, z);
    },
    hangAt(ctx, x, z) {
      const R = this.rods, rr = 0.055, ringR = 0.4;
      const cy = R.y + R.r - (ringR - rr) + 0.005;
      ctx.addPrize(makeHangPrize(ctx.P, pickChar(), [x, cy, z], { ringR, ringTube: rr }));
    },
    refill(ctx) {
      const ps = ctx.prizes.map(p => ctx.P.pos(p.parts[0].body));
      for (const [x, z] of this.hangSlots) {
        if (!ps.some(p => Math.abs(p[0] - x) < 0.6 && Math.abs(p[2] - z) < 0.5)) { this.hangAt(ctx, x, z); return; }
      }
    },
    target: 8,
    isWin(p, P) { return P.pos(p.main)[1] < 1.0; },
  },
];

export function getMachine(id) { return MACHINES.find(m => m.id === id); }

// 由機款設定整爪設定
export function clawConfig(M) {
  const g = M.geo, c = M.claw;
  const T = { three: 0.62, three_rope: 0.55, two: 0.75, two_slim: 0.7 }[c.type];
  const mx = g.w / 2 - T - 0.25, mz = g.d / 2 - T - 0.25;
  let home;
  if (g.hole) home = [(g.hole.x0 + g.hole.x1) / 2, (g.hole.z0 + g.hole.z1) / 2];
  else home = [0, mz];
  home = [Math.max(-mx, Math.min(mx, home[0])), Math.max(-mz, Math.min(mz, home[1]))];
  // 冇出口洞嘅機（橋機、吊環機）：喺前面中間放手，返去左前角等
  const rest = g.hole ? home : [-mx, mz];
  return {
    ...c, topY: g.topY, floorY: c.floorY ?? g.floorY,
    home, rest, bounds: { x0: -mx, x1: mx, z0: -mz, z1: mz },
  };
}
