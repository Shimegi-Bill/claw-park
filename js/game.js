// 遊戲核心（物理 + 規則），唔依賴畫面，可以喺 Node 測試
import { Phys } from './phys.js';
import { Claw } from './claw.js';
import { removePrize } from './prizes.js';
import { getMachine, clawConfig } from './machines.js';

export const DT = 1 / 60;

export class Game {
  constructor(P) {
    this.P = P;
    this.statics = [];
    this.prizes = [];
    this.listeners = {};
    this.M = null;
    this.claw = null;
    this.time = 0;
    this.refillQueue = 0;
  }
  on(e, f) { (this.listeners[e] ||= []).push(f); }
  fire(e, d) { for (const f of this.listeners[e] || []) f(d); }

  load(id) {
    this.unload();
    const M = getMachine(id);
    this.M = M;
    const P = this.P;
    const ctx = this.ctx = {
      P, prizes: this.prizes,
      addStatic: (shape, pos, rot, vis, o = {}) => {
        const body = P.body({ shape, pos, rot: rot || [0, 0, 0, 1], motion: 'static', friction: o.friction ?? 0.5, restitution: 0.05 });
        const s = { body, shape, pos, rot: rot || [0, 0, 0, 1], vis };
        this.statics.push(s);
        return s;
      },
      addPrize: (p) => { this.prizes.push(p); this.fire('prizeAdded', p); return p; },
    };
    M.build(ctx);
    this.claw = new Claw(P, clawConfig(M));
    this.fire('loaded', M);
    return M;
  }

  // 開機前預先跑物理，等公仔跌定
  settle(seconds = 3) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step(true);
  }

  unload() {
    if (this.claw) { this.claw.destroy(); this.claw = null; }
    for (const p of this.prizes) removePrize(this.P, p);
    for (const s of this.statics) this.P.removeBody(s.body);
    this.prizes.length = 0; this.statics.length = 0;
    this.P.clear();
    this.fire('unloaded');
  }

  step(silent = false) {
    const P = this.P;
    if (this.claw) this.claw.update(DT);
    P.step(DT, 2);
    this.time += DT;
    // 判斷贏 / 跌出界
    for (let i = this.prizes.length - 1; i >= 0; i--) {
      const p = this.prizes[i];
      const q = P.pos(p.main);
      if (this.M.isWin(p, P)) {
        this.prizes.splice(i, 1);
        if (!silent) this.fire('win', p);
        removePrize(P, p);
        this.fire('prizeRemoved', p);
        this.refillQueue++;
      } else if (q[1] < -30 || Math.abs(q[0]) > this.M.geo.w || Math.abs(q[2]) > this.M.geo.d) {
        this.prizes.splice(i, 1);
        removePrize(P, p);
        this.fire('prizeRemoved', p);
        this.refillQueue++;
      }
    }
    // 卡住喺爪上面嘅獎品：爪停咗都仲喺高處，就輕輕推佢落嚟
    if (this.claw && this.claw.state === 'idle') {
      const hy = this.M.geo.topY - 3.2;
      for (const p of this.prizes) {
        const q = P.pos(p.main);
        if (q[1] > hy) { p.stuckT = (p.stuckT || 0) + DT; if (p.stuckT > 1.5) { P.setVel(p.main, [(Math.random() - 0.5) * 6, -4, (Math.random() - 0.5) * 6]); p.stuckT = 0; } }
        else p.stuckT = 0;
      }
    }
    if (this.claw) {
      for (const [e, d] of this.claw.events) this.fire('claw:' + e, d);
      this.claw.events.length = 0;
      // 局完先補貨
      if (this.refillQueue > 0 && this.claw.state === 'idle') {
        while (this.refillQueue > 0 && this.prizes.length < this.M.target) { this.M.refill(this.ctx); this.refillQueue--; }
        this.refillQueue = 0;
      }
    }
  }

  restock() { // 重新擺貨
    const id = this.M.id;
    this.load(id);
  }
}
