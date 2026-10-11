// 獎品：布娃娃公仔（多個剛體 + 關節）、盒裝、膠環、吊環
import { Q, LAYER } from './phys.js';
import { seg } from './claw.js';

// 自創角色（全部原創，冇版權問題）
export const CHARACTERS = {
  bear: { name: '布丁熊', body: 0xc98a52, belly: 0xf3d7b0, ear: 'round', nose: 0x3a2418, rarity: 1 },
  bunny: { name: '棉花兔', body: 0xf6eef0, belly: 0xffd6e2, ear: 'long', nose: 0xff8fab, rarity: 1 },
  cat: { name: '芝麻貓', body: 0x5a5a66, belly: 0xe9e4dc, ear: 'tri', nose: 0xff9aa2, rarity: 1 },
  chick: { name: '波波雞', body: 0xffd84a, belly: 0xfff1a8, ear: 'tuft', nose: 0xff8a1f, rarity: 1 },
  pig: { name: '團子豬', body: 0xffb3c6, belly: 0xffd9e3, ear: 'tri', nose: 0xff7aa0, snout: true, rarity: 2 },
  frog: { name: '抹茶蛙', body: 0x8bc34a, belly: 0xe6f4c8, ear: 'eyes', nose: 0x33691e, rarity: 2 },
  panda: { name: '飯糰貓熊', body: 0xf7f7f2, belly: 0xf7f7f2, ear: 'round', earColor: 0x222222, patch: 0x222222, nose: 0x222222, rarity: 3 },
  seal: { name: '雪糕海豹', body: 0xe9f1f7, belly: 0xffffff, ear: 'none', nose: 0x333333, rarity: 3 },
  dino: { name: '小恐龍嘉嘉', body: 0x5fc6b8, belly: 0xfff2c2, ear: 'spike', nose: 0x2d6b63, rarity: 4 },
  golden: { name: '金色招財熊', body: 0xf2c14e, belly: 0xfff0b8, ear: 'round', nose: 0x6b4a10, rarity: 5, shiny: true },
};

const PLUSH_FRICTION = 0.9;

// 公仔身：蛋形、底部扁平
export const TORSO_PROFILE = [[-0.62, 0.36], [-0.55, 0.5], [-0.4, 0.57], [-0.2, 0.58], [0, 0.55], [0.2, 0.5], [0.4, 0.42], [0.55, 0.3], [0.62, 0.12]];
export function torsoHull(s) {
  const pts = [];
  for (const [y, r] of TORSO_PROFILE) for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    pts.push([Math.cos(a) * r * s, y * s, Math.sin(a) * r * s * 0.92]);
  }
  return { t: 'hull', pts, cr: 0.04 * s };
}

// 布娃娃：身、頭、雙手、雙腳，用 SwingTwist 關節連住
export function makePlush(P, char, pos, yaw = 0, s = 1, opts = {}) {
  const C = CHARACTERS[char];
  const g = P.newGroup();
  const rq = Q.axisAngle(0, 1, 0, yaw);
  const W = (lp) => { const r = Q.rot(rq, lp); return [pos[0] + r[0] * s, pos[1] + r[1] * s, pos[2] + r[2] * s]; };
  const Wd = (ld) => Q.rot(rq, ld);
  const parts = [];
  const common = { friction: PLUSH_FRICTION, restitution: 0.02, linDamp: 0.25, angDamp: 0.6 };
  const dens = opts.heavy ? 1.6 : 1;

  // 身（上窄下闊，底部平啲坐得穩）
  const torso = P.body({ ...common, shape: torsoHull(s), pos: W([0, 0, 0]), rot: rq, mass: 0.08 * s * s * s * dens, group: [g, 0] });
  parts.push({ body: torso, vis: { kind: 'torso', char, s } });

  // 頭（比頸大，爪容易卡住）
  const headParts = [{ s: { t: 'sphere', r: 0.6 * s } }];
  if (C.ear === 'round' || C.ear === 'tri') {
    headParts.push({ s: { t: 'sphere', r: 0.19 * s }, p: [0.42 * s, 0.42 * s, 0] }, { s: { t: 'sphere', r: 0.19 * s }, p: [-0.42 * s, 0.42 * s, 0] });
  } else if (C.ear === 'long') {
    headParts.push(seg([0.22 * s, 0.45 * s, 0], [0.3 * s, 1.05 * s, 0], 0.13 * s), seg([-0.22 * s, 0.45 * s, 0], [-0.3 * s, 1.05 * s, 0], 0.13 * s));
  } else if (C.ear === 'eyes') {
    headParts.push({ s: { t: 'sphere', r: 0.2 * s }, p: [0.3 * s, 0.48 * s, 0.18 * s] }, { s: { t: 'sphere', r: 0.2 * s }, p: [-0.3 * s, 0.48 * s, 0.18 * s] });
  }
  const headShape = headParts.length === 1 ? headParts[0].s : { t: 'compound', parts: headParts.map(p => ({ s: p.s, p: p.p, q: p.q })) };
  const head = P.body({ ...common, shape: headShape, pos: W([0, 1.08, 0]), rot: rq, mass: 0.05 * s * s * s * dens, group: [g, 1] });
  parts.push({ body: head, vis: { kind: 'head', char, s } });
  const nj = P.swingTwist(torso, head, { pos: W([0, 0.6, 0]), twist: Wd([0, 1, 0]), plane: Wd([1, 0, 0]), cone: 0.35, twistMin: -0.25, twistMax: 0.25, friction: 0.08 * s });

  // 手
  const limbs = [];
  for (const side of [1, -1]) {
    const a0 = [0.42 * side, 0.32, 0.04], a1 = [0.62 * side, -0.12, 0.16];
    const mid = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2];
    const dir = Wd([a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]]);
    const lq = Q.mul(Q.fromUp(dir[0], dir[1], dir[2]), [0, 0, 0, 1]);
    const arm = P.body({ ...common, shape: { t: 'capsule', hh: 0.16 * s, r: 0.16 * s }, pos: W(mid), rot: lq, mass: 0.008 * s * s * s * dens, group: [g, side > 0 ? 2 : 3] });
    parts.push({ body: arm, vis: { kind: 'arm', char, s } });
    const tw = Wd([a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]].map(v => v / Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2])));
    limbs.push(P.swingTwist(torso, arm, { pos: W(a0), twist: tw, plane: Wd([0, 0, 1]), cone: 0.7, twistMin: -0.3, twistMax: 0.3, friction: 0.02 * s }));
  }
  // 腳（坐姿向前）
  for (const side of [1, -1]) {
    const l0 = [0.27 * side, -0.48, 0.12], l1 = [0.32 * side, -0.62, 0.58];
    const mid = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2, (l0[2] + l1[2]) / 2];
    const d = [l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]], dl = Math.hypot(...d);
    const dir = Wd(d.map(v => v / dl));
    const leg = P.body({ ...common, shape: { t: 'capsule', hh: 0.12 * s, r: 0.19 * s }, pos: W(mid), rot: Q.fromUp(...dir), mass: 0.01 * s * s * s * dens, group: [g, side > 0 ? 4 : 5] });
    parts.push({ body: leg, vis: { kind: 'leg', char, s } });
    limbs.push(P.swingTwist(torso, leg, { pos: W(l0), twist: dir, plane: Wd([1, 0, 0]), cone: 0.45, twistMin: -0.2, twistMax: 0.2, friction: 0.02 * s }));
  }
  return { type: 'plush', char, name: C.name, rarity: C.rarity, parts, main: torso, joints: [nj, ...limbs], group: g };
}

// 盒裝獎品（兩爪橋機用）
export function makeBox(P, design, pos, size, yaw = 0, opts = {}) {
  const rq = Q.axisAngle(0, 1, 0, yaw);
  const h = [size[0] / 2, size[1] / 2, size[2] / 2];
  const body = P.body({
    shape: { t: 'box', h, cr: 0.04 }, pos, rot: opts.rot || rq, mass: opts.mass ?? 0.35,
    friction: opts.friction ?? 0.45, restitution: 0.05, linDamp: 0.1, angDamp: 0.3, ccd: true,
  });
  return { type: 'box', name: design.name, rarity: design.rarity ?? 2, design, parts: [{ body, vis: { kind: 'box', size, design } }], main: body, joints: [] };
}

// 環形碰撞體（一圈膠囊），喺 XY 平面，中心原點
export function ringParts(R, r, n = 12) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    parts.push(seg([Math.cos(a0) * R, Math.sin(a0) * R, 0], [Math.cos(a1) * R, Math.sin(a1) * R, 0], r));
  }
  return parts;
}

// 膠環公仔：細公仔（單一剛體）+ 頭頂一個可擺動嘅膠環
export function makeRingPrize(P, char, pos, yaw = 0, opts = {}) {
  const C = CHARACTERS[char];
  const g = P.newGroup();
  const s = opts.s ?? 0.8;
  const rq = Q.axisAngle(0, 1, 0, yaw);
  const W = (lp) => { const r = Q.rot(rq, lp); return [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]]; };
  // 公仔：身 + 頭 合成一個剛體（細件，穩陣啲）
  const body = P.body({
    shape: {
      t: 'compound', parts: [
        { s: torsoHull(s), p: [0, 0, 0] },
        { s: { t: 'sphere', r: 0.6 * s }, p: [0, 1.08 * s, 0] },
      ]
    },
    pos, rot: rq, mass: opts.mass ?? 0.16, friction: 0.8, linDamp: 0.2, angDamp: 0.5, group: [g, 0],
  });
  const R = opts.ringR ?? 0.34, rr = opts.ringTube ?? 0.05;
  const ringY = 1.08 * s + 0.6 * s + R + 0.12;
  const rparts = ringParts(R, rr, 14);
  // 環面向 X（兩爪橫向收埋時，爪尖可以穿入去）
  const ringQ = Q.mul(rq, Q.axisAngle(0, 1, 0, Math.PI / 2));
  const ring = P.body({
    shape: { t: 'compound', parts: rparts.map(p => ({ s: p.s, p: p.p, q: p.q })) },
    pos: W([0, ringY, 0]), rot: ringQ, mass: 0.02, friction: 0.5, linDamp: 0.2, angDamp: 0.4, ccd: true, group: [g, 1],
  });
  // 環同頭之間用一條短繩（點約束 + 擺動）
  const attach = W([0, 1.08 * s + 0.6 * s + 0.02, 0]);
  const j = P.swingTwist(body, ring, { pos: attach, twist: Q.rot(rq, [0, 1, 0]), plane: Q.rot(rq, [0, 0, 1]), cone: 0.4, cone2: 0.4, twistMin: -0.3, twistMax: 0.3, friction: 0.03 });
  return {
    type: 'ring', char, name: C.name + '（膠環）', rarity: C.rarity + 1,
    parts: [{ body, vis: { kind: 'mini', char, s } }, { body: ring, vis: { kind: 'ring', R, r: rr, color: opts.ringColor ?? 0xff4f8b } }],
    main: body, joints: [j], group: g,
  };
}

// 吊環獎品：膠環掛喺鈎上，下面吊住一件細公仔/匙扣
export function makeHangPrize(P, char, ringCenter, opts = {}) {
  const C = CHARACTERS[char];
  const g = P.newGroup();
  const s = opts.s ?? 0.62;
  const R = opts.ringR ?? 0.42, rr = opts.ringTube ?? 0.06;
  // 環平面 = XY（面向玩家），穿過 Z 方向嘅鈎
  const rparts = ringParts(R, rr, 14);
  const ring = P.body({
    shape: { t: 'compound', parts: rparts.map(p => ({ s: p.s, p: p.p, q: p.q })) },
    pos: ringCenter, mass: 0.025, friction: 0.25, linDamp: 0.15, angDamp: 0.3, ccd: true, group: [g, 0],
  });
  const tagTop = [ringCenter[0], ringCenter[1] - R - 0.05, ringCenter[2]];
  const bodyPos = [tagTop[0], tagTop[1] - 0.25 - 1.7 * s, tagTop[2]];
  const body = P.body({
    shape: {
      t: 'compound', parts: [
        { s: torsoHull(s), p: [0, 0, 0] },
        { s: { t: 'sphere', r: 0.6 * s }, p: [0, 1.08 * s, 0] },
      ]
    },
    pos: bodyPos, mass: opts.mass ?? 0.12, friction: 0.7, linDamp: 0.3, angDamp: 0.6, group: [g, 1],
  });
  const j = P.point(ring, body, { pos: [tagTop[0], bodyPos[1] + 1.68 * s, tagTop[2]] });
  return {
    type: 'hang', char, name: C.name + '（吊飾）', rarity: C.rarity + 1,
    parts: [{ body: ring, vis: { kind: 'ring', R, r: rr, color: opts.ringColor ?? 0xffc531 } }, { body, vis: { kind: 'mini', char, s, string: true } }],
    main: body, joints: [j], group: g,
  };
}

export function removePrize(P, prize) {
  for (const j of prize.joints) P.removeConstraint(j);
  for (const p of prize.parts) P.removeBody(p.body);
}
