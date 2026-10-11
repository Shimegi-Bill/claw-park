// 爪：天車（運動學）+ 捲揚滑軌（馬達）+ 爪頭（動態）+ 爪指（鉸鏈＋限力馬達）
// 甩爪機：滑軌下面多一個滑輪，爪頭用繩吊喺滑輪下面，可以擺動
import { Q, LAYER } from './phys.js';

// 由兩點整一條膠囊（喺零件本地座標）
export function seg(a, b, r) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  return {
    s: { t: 'capsule', hh: Math.max(0.001, len / 2), r },
    p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    q: Q.fromUp(d[0], d[1], d[2]),
    a, b, r,
  };
}

// 爪款定義（本地座標：+X = 向外，-Y = 向下，原點 = 鉸位）
export const CLAW_TYPES = {
  three: {
    fingers: 3, headR: 0.62, headHH: 0.42, hingeR: 0.5, hingeY: -0.42,
    path: [[0, 0, 0], [0.3, -0.45, 0], [0.33, -1.5, 0], [0.06, -2.0, 0], [-0.26, -2.13, 0]],
    radius: 0.085, tipRadius: 0.07,
    open: 0.8, closedLimit: -0.08, closeTarget: -0.4, rest: -0.04,
    maxTorque: 10, openTorque: 10, fingerMass: 0.07, headMass: 1.4,
  },
  three_rope: {
    fingers: 3, headR: 0.55, headHH: 0.38, hingeR: 0.45, hingeY: -0.38,
    path: [[0, 0, 0], [0.27, -0.4, 0], [0.3, -1.35, 0], [0.05, -1.8, 0], [-0.24, -1.92, 0]],
    radius: 0.08, tipRadius: 0.065,
    open: 0.8, closedLimit: -0.08, closeTarget: -0.4, rest: -0.04,
    maxTorque: 8.5, openTorque: 9, fingerMass: 0.06, headMass: 1.1,
  },
  two: { // UFO 式兩爪，長臂，爪尖有膠墊
    fingers: 2, headR: 0.75, headHH: 0.4, hingeR: 0.62, hingeY: -0.25,
    path: [[0, 0, 0], [0.18, -0.35, 0], [0.2, -2.35, 0], [-0.18, -2.62, 0], [-0.32, -2.62, 0]],
    radius: 0.09, tipRadius: 0.1,
    open: 0.72, closedLimit: -0.07, closeTarget: -0.4, rest: -0.04,
    maxTorque: 40, openTorque: 22, fingerMass: 0.12, headMass: 1.8, pad: true,
  },
  two_slim: { // 幼爪尖，用嚟穿膠環 / 推吊環
    fingers: 2, headR: 0.7, headHH: 0.38, hingeR: 0.56, hingeY: -0.25,
    path: [[0, 0, 0], [0.16, -0.32, 0], [0.18, -2.1, 0], [-0.06, -2.38, 0], [-0.34, -2.44, 0]],
    radius: 0.075, tipRadius: 0.05,
    open: 0.7, closedLimit: -0.08, closeTarget: -0.4, rest: -0.05,
    maxTorque: 36, openTorque: 20, fingerMass: 0.1, headMass: 1.6,
  },
};

const WINCH_FORCE = 4000;

export class Claw {
  // cfg: {type, rope, ropeLen, topY, floorY|maxDrop, home:[x,z], bounds:{x0,x1,z0,z1},
  //       speed, accel, dropSpeed, liftSpeed, yaw, fingerFriction}
  constructor(P, cfg) {
    this.P = P;
    this.cfg = cfg;
    this.T = CLAW_TYPES[cfg.type];
    this.state = 'idle';
    this.t = 0;
    this.rest = cfg.rest || cfg.home; // 等候位置（兩掣模式由呢度出發）
    this.cx = this.rest[0]; this.cz = this.rest[1];
    this.vx = 0; this.vz = 0;
    this.move = [0, 0];
    this.grip = { g1: 0.7, g2: 0.35, stage2: 'top', jitter: 0, topShake: 0.4 };
    this.curTorque = 0; this.targetTorque = 0;
    this.manualClose = false;
    this.events = [];
    this.ropeLen = cfg.rope ? (cfg.ropeLen ?? 2.0) : 0;
    // 計爪最低點（任何開合角度）
    const T = this.T;
    let low = 0;
    for (let a = T.closedLimit; a <= T.open + 1e-6; a += 0.02)
      for (const p of T.path) low = Math.min(low, p[0] * Math.sin(a) + p[1] * Math.cos(a));
    this.lowestBelowHinge = low - T.tipRadius;
    const lowestAtZero = cfg.topY - this.ropeLen - 2 * T.headHH + (T.headHH + T.hingeY) + this.lowestBelowHinge;
    this.lowestAtZero = lowestAtZero;
    if (cfg.floorY != null) cfg.maxDrop = Math.max(0.3, lowestAtZero - (cfg.floorY + (cfg.floorGap ?? 0.05)));
    this.build();
  }

  emit(e, data) { this.events.push([e, data]); }

  build() {
    const P = this.P, T = this.T, c = this.cfg;
    const top = c.topY;
    const yaw = c.yaw || 0;
    this.yawQ = Q.axisAngle(0, 1, 0, yaw);
    this.carriage = P.body({ shape: { t: 'sphere', r: 0.1 }, pos: [this.cx, top, this.cz], motion: 'kinematic', layer: LAYER.GHOST });
    const headTop = top - this.ropeLen;
    const headY = headTop - T.headHH;
    this.head = P.body({
      shape: { t: 'cyl', hh: T.headHH, r: T.headR, cr: 0.05 }, pos: [this.cx, headY, this.cz], rot: this.yawQ,
      layer: LAYER.CLAW, mass: T.headMass, sleep: false, friction: 0.4,
      angDamp: c.rope ? 2.0 : 0.5, linDamp: c.rope ? 0.04 : 0.1,
    });
    let winchBody = this.head;
    if (c.rope) {
      this.pulley = P.body({ shape: { t: 'sphere', r: 0.08 }, pos: [this.cx, top, this.cz], layer: LAYER.GHOST, mass: 0.4, sleep: false, linDamp: 0.0, angDamp: 0.5 });
      winchBody = this.pulley;
      this.rope = P.distance(this.pulley, this.head, { p1: [this.cx, top, this.cz], p2: [this.cx, headTop, this.cz], min: 0, max: this.ropeLen });
    }
    this.slider = P.slider(this.carriage, winchBody, {
      point1: [this.cx, top, this.cz], point2: c.rope ? [this.cx, top, this.cz] : [this.cx, headTop, this.cz],
      axis: [0, -1, 0], normal: [1, 0, 0], min: 0, max: c.maxDrop,
      motor: { freq: 6, damping: 1, maxForce: WINCH_FORCE },
    });
    this.winch('hold');

    this.fingers = [];
    this.hinges = [];
    const n = T.fingers;
    for (let i = 0; i < n; i++) {
      const th = (n === 2 ? (i === 0 ? 0 : Math.PI) : (i * 2 * Math.PI / 3 + Math.PI / 2)) + yaw;
      const rx = Math.cos(th), rz = -Math.sin(th);
      const hp = [this.cx + rx * T.hingeR, headY + T.hingeY, this.cz + rz * T.hingeR];
      const rotq = Q.axisAngle(0, 1, 0, th);
      const parts = [];
      for (let k = 0; k < T.path.length - 1; k++) {
        const r = k >= T.path.length - 3 ? T.tipRadius : T.radius;
        parts.push(seg(T.path[k], T.path[k + 1], r));
      }
      if (T.pad) parts.push({ s: { t: 'box', h: [0.06, 0.12, 0.28], cr: 0.03 }, p: [T.path[3][0] + 0.02, T.path[3][1] + 0.02, 0], q: Q.axisAngle(0, 0, 1, -0.5), pad: true });
      const shape = { t: 'compound', parts: parts.map(p => ({ s: p.s, p: p.p, q: p.q })) };
      const f = P.body({ shape, pos: hp, rot: rotq, layer: LAYER.CLAW, mass: T.fingerMass, sleep: false, friction: +(c.fingerFriction ?? 1.0), restitution: 0, angDamp: 0.5, ccd: true });
      f.vis = { parts, th };
      // 鉸鏈軸 = 徑向 × Y = (-rz, 0, rx)
      const hg = P.hinge(this.head, f, {
        point: hp, axis: [-rz, 0, rx], normal: [rx, 0, rz], min: T.closedLimit, max: T.open + 0.05,
        motor: { freq: 7, damping: 1, maxTorque: T.openTorque },
      });
      hg.SetMotorState(P.J.EMotorState_Position);
      hg.SetTargetAngle(T.rest);
      this.fingers.push(f);
      this.hinges.push(hg);
    }
    this.setTorque(T.openTorque, true);
    this.fingerTarget = T.rest;
  }

  // 捲揚機：只可以拉（向上），唔可以推（向下靠重力）
  winch(mode, v = 0) {
    const J = this.P.J, s = this.slider, m = s.GetMotorSettings();
    s.SetMotorState(J.EMotorState_Velocity);
    m.mMinForceLimit = -WINCH_FORCE; // 向上拉
    m.mMaxForceLimit = 0;            // 唔可以向下推
    if (mode === 'down') s.SetTargetVelocity(v);
    else if (mode === 'up') s.SetTargetVelocity(-v);
    else if (mode === 'top') s.SetTargetVelocity(-0.6);
    else s.SetTargetVelocity(0); // hold
    this.winchMode = mode;
  }

  setTorque(t, instant) {
    this.targetTorque = t;
    if (instant) this.curTorque = t;
  }
  _applyTorque() {
    for (const h of this.hinges) {
      const m = h.GetMotorSettings();
      m.mMaxTorqueLimit = this.curTorque;
      m.mMinTorqueLimit = -this.curTorque;
    }
  }
  setFingers(target) {
    this.fingerTarget = target;
    for (const h of this.hinges) h.SetTargetAngle(target);
  }
  fingerAngle() { let s = 0; for (const h of this.hinges) s += h.GetCurrentAngle(); return s / this.hinges.length; }
  extension() { return this.slider.GetCurrentPosition(); }
  // 繩有幾鬆（甩爪機：爪頭擱住嘢）
  ropeSlack() {
    if (!this.rope) return 0;
    const pp = this.P.pos(this.pulley), hp = this.P.pos(this.head), hq = this.P.rot(this.head);
    const tl = Q.rot(hq, [0, this.T.headHH, 0]);
    return this.ropeLen - Math.hypot(hp[0] + tl[0] - pp[0], hp[1] + tl[1] - pp[1], hp[2] + tl[2] - pp[2]);
  }
  // 爪頭頂（畫條繩用）
  headTop() {
    const hp = this.P.pos(this.head), hq = this.P.rot(this.head);
    const tl = Q.rot(hq, [0, this.T.headHH, 0]);
    return [hp[0] + tl[0], hp[1] + tl[1], hp[2] + tl[2]];
  }

  // ---------- 對外控制 ----------
  start() {
    if (this.state !== 'idle') return false;
    this.state = 'ready'; this.t = 0;
    return true;
  }
  drop() {
    if (this.state !== 'ready' && this.state !== 'moving') return false;
    this.move = [0, 0];
    this.state = 'opening'; this.t = 0;
    this.manualClose = false;
    this.setTorque(this.T.openTorque, true);
    this.setFingers(this.T.open);
    this.emit('drop');
    return true;
  }
  close() { // 2收爪：落爪途中再按一下即刻收爪
    if (this.state === 'down' || this.state === 'opening') { this.manualClose = true; return true; }
    return false;
  }
  configureGrip(g) { Object.assign(this.grip, g); }
  get busy() { return !['idle', 'ready', 'moving'].includes(this.state); }

  update(dt) {
    const P = this.P, T = this.T, c = this.cfg;
    this.t += dt;
    const k = Math.min(1, dt * 10);
    this.curTorque += (this.targetTorque - this.curTorque) * k;
    this._applyTorque();

    let tvx = 0, tvz = 0;
    const sp = c.speed ?? 2.6;
    switch (this.state) {
      case 'idle':
        if (this.winchMode !== 'top') this.winch('top');
        break;
      case 'ready':
      case 'moving':
        tvx = this.move[0] * sp; tvz = this.move[1] * sp;
        if (tvx || tvz) this.state = 'moving';
        break;
      case 'opening':
        if (this.manualClose && this.t > 0.12) { this.goClose(); break; }
        if (this.t > (c.openTime ?? 0.45)) {
          this.state = 'down'; this.t = 0; this.slowT = 0;
          this.winch('down', c.dropSpeed ?? 5);
        }
        break;
      case 'down': {
        const ext = this.extension();
        const prev = this.prevExt ?? ext;
        const v = (ext - prev) / dt;
        const vd = c.dropSpeed ?? 5;
        let landed = false;
        if (this.rope) landed = this.ropeSlack() > 0.18;
        else if (this.t > 0.3 && v < vd * 0.25) { this.slowT += dt; landed = this.slowT > 0.1; }
        else this.slowT = 0;
        const bottom = ext >= c.maxDrop - 0.02;
        if (this.manualClose || landed || bottom || this.t > 8) this.goClose();
        break;
      }
      case 'closing':
        // 收爪頭 0.3 秒：捲揚機收少少繩，等爪頭重量由繩承受，爪尖唔會壓死喺獎品上面
        if (this.t < 0.3) { if (this.winchMode !== 'up') this.winch('up', this.takeUp / 0.3); }
        else if (this.winchMode !== 'hold') this.winch('hold');
        if (this.t > (c.closeTime ?? 1.0)) {
          this.state = 'up'; this.t = 0; this.liftFrom = Math.max(0.01, this.extension());
          this.winch('up', c.liftSpeed ?? 4);
          this.emit('lift');
        }
        break;
      case 'up': {
        const ext = this.extension();
        if (this.grip.stage2 === 'mid' && !this.stage2Done && ext < this.liftFrom * 0.5) this.applyStage2();
        if (ext <= 0.03) {
          this.state = 'top'; this.t = 0;
          this.winch('top');
          if (this.grip.stage2 === 'top') this.applyStage2();
          if (this.grip.topShake > 0) P.impulse(this.head, [0, -this.grip.topShake * T.headMass * 5, 0]);
          this.emit('top');
        } else if (this.t > 10) { this.state = 'top'; this.t = 0; this.winch('top'); }
        break;
      }
      case 'top':
        if (this.t > 0.35) { this.state = 'return'; this.t = 0; }
        break;
      case 'return': {
        const dx = c.home[0] - this.cx, dz = c.home[1] - this.cz;
        const d = Math.hypot(dx, dz);
        if (this.grip.stage2 === 'move' && !this.stage2Done && this.t > 0.3) this.applyStage2();
        if (d < 0.02 && Math.hypot(this.vx, this.vz) < 0.2) {
          this.state = 'release'; this.t = 0;
          if (!this.stage2Done) this.applyStage2();
          this.setTorque(T.openTorque, true);
          this.setFingers(T.open);
          this.emit('release');
        } else {
          const s = Math.min(sp * 1.1, d * 3 + 0.3);
          tvx = dx / (d || 1) * s; tvz = dz / (d || 1) * s;
        }
        break;
      }
      case 'release':
        if (this.t > (c.releaseTime ?? 1.4)) {
          this.setFingers(T.rest);
          this.setTorque(T.openTorque);
          this.state = 'reset'; this.t = 0;
        }
        break;
      case 'reset': {
        const dx = this.rest[0] - this.cx, dz = this.rest[1] - this.cz, d = Math.hypot(dx, dz);
        if (d > 0.02) { const s = Math.min(sp * 1.1, d * 3 + 0.3); tvx = dx / d * s; tvz = dz / d * s; }
        else if (this.t > 0.6 && Math.hypot(this.vx, this.vz) < 0.2) { this.state = 'idle'; this.t = 0; this.manualClose = false; this.emit('end'); }
        break;
      }
    }
    this.prevExt = this.extension();

    // 天車加減速
    const acc = c.accel ?? 14;
    const ax = tvx - this.vx, az = tvz - this.vz, am = Math.hypot(ax, az);
    const maxDv = acc * dt;
    if (am > maxDv) { this.vx += ax / am * maxDv; this.vz += az / am * maxDv; } else { this.vx = tvx; this.vz = tvz; }
    let nx = this.cx + this.vx * dt, nz = this.cz + this.vz * dt;
    const b = c.bounds;
    if (nx < b.x0) { nx = b.x0; this.vx = 0; } if (nx > b.x1) { nx = b.x1; this.vx = 0; }
    if (nz < b.z0) { nz = b.z0; this.vz = 0; } if (nz > b.z1) { nz = b.z1; this.vz = 0; }
    this.cx = nx; this.cz = nz;
    P.moveKinematic(this.carriage, [this.cx, c.topY, this.cz], [0, 0, 0, 1], dt);
  }

  goClose() {
    const T = this.T;
    this.state = 'closing'; this.t = 0;
    this.manualClose = false;
    this.stage2Done = false;
    this.takeUp = (this.rope ? Math.max(0, this.ropeSlack()) : 0) + (this.cfg.takeUp ?? 0.08);
    this.winch('hold');
    const j = this.grip.jitter ? 1 + (Math.random() * 2 - 1) * this.grip.jitter : 1;
    this.setTorque(T.maxTorque * Math.max(0.02, Math.min(1.6, this.grip.g1 * j)));
    this.curTorque = Math.min(this.curTorque, this.targetTorque);
    this.setFingers(T.closeTarget);
    this.emit('close');
  }

  applyStage2() {
    if (this.stage2Done) return;
    this.stage2Done = true;
    const j = this.grip.jitter ? 1 + (Math.random() * 2 - 1) * this.grip.jitter : 1;
    this.setTorque(this.T.maxTorque * Math.max(0.02, Math.min(1.6, this.grip.g2 * j)));
    this.emit('stage2');
  }

  destroy() {
    const P = this.P;
    for (const h of this.hinges) P.removeConstraint(h);
    P.removeConstraint(this.slider);
    if (this.rope) P.removeConstraint(this.rope);
    for (const f of this.fingers) P.removeBody(f);
    P.removeBody(this.head); P.removeBody(this.carriage);
    if (this.pulley) P.removeBody(this.pulley);
  }
}
