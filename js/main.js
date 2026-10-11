// 夾公仔樂園：主程式（大廳、投幣、操控、設定、圖鑑）
import initJolt from '../lib/jolt-physics.wasm-compat.js';
import { Phys } from './phys.js';
import { Game, DT } from './game.js';
import { MACHINES, getMachine, BOX_DESIGNS } from './machines.js';
import { CHARACTERS } from './prizes.js';
import { store, save } from './store.js';
import { sfx, initAudio, motorSet, motorStop, startMusic, stopMusic, setSound, setMusic } from './audio.js';
import { portraitURL } from './portrait.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let P, G, R;
const S = {
  screen: 'boot', M: null, mstate: null,
  credits: store.s.credits ||= {}, paid: store.s.paid ||= {}, bought: store.s.bought ||= {},
  playing: false, phase: null, timer: 0, timerOn: false, winsThisPlay: 0, playGrip: null, payoutPlay: false,
  joy: [0, 0], joyActive: false, b1: false, b2: false, b1Used: false, b2Used: false,
  keys: new Set(), settleT: 0, winQueue: [], lastTick: 0,
};
const G_ = () => store.global();

// ---------- 開機 ----------
async function boot() {
  try {
    P = await Phys.create(initJolt);
  } catch (e) {
    console.error(e);
    $('#bootMsg').textContent = '';
    const er = $('#bootErr'); er.hidden = false;
    er.textContent = '物理引擎載入唔到（呢個瀏覽器可能唔支援 WebAssembly）。請用最新版 Chrome / Safari 再試。';
    $('.spinner').hidden = true;
    return;
  }
  G = new Game(P);
  $('#bootMsg').textContent = '準備 3D 畫面…';
  const { Renderer } = await import('./render.js');
  R = new Renderer($('#view'), pickQuality());
  G.on('prizeAdded', p => R.addPrize(p));
  G.on('prizeRemoved', p => R.removePrize(p));
  G.on('win', onWin);
  G.on('claw:drop', () => { sfx.open(); });
  G.on('claw:close', () => sfx.close());
  G.on('claw:stage2', () => { if (S.playGrip && S.playGrip.g2 < S.playGrip.g1 - 0.02) { sfx.weaken(); } });
  G.on('claw:top', () => sfx.top());
  G.on('claw:release', () => sfx.open());
  G.on('claw:end', onPlayEnd);
  setSound(G_().sound); setMusic(G_().music);
  bindUI();
  $('#boot').hidden = true;
  showLobby();
  requestAnimationFrame(loop);
}

function pickQuality() {
  const q = G_().quality;
  if (q && q !== 'auto') return q;
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  return mobile ? 'mid' : 'high';
}

// ---------- 大廳 ----------
const ICONS = {
  three: '<path d="M50 4v22" stroke="#555" stroke-width="3"/><rect x="38" y="24" width="24" height="16" rx="5" fill="#cfd6df"/><path d="M42 40c-14 10-16 26-8 40M58 40c14 10 16 26 8 40M50 40v40" stroke="#cfd6df" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="50" cy="96" r="13" fill="#c98a52"/><circle cx="41" cy="85" r="5" fill="#c98a52"/><circle cx="59" cy="85" r="5" fill="#c98a52"/>',
  two: '<path d="M50 4v20" stroke="#555" stroke-width="3"/><rect x="32" y="22" width="36" height="14" rx="5" fill="#cfd6df"/><path d="M36 36L22 80l10 4M64 36l14 44-10 4" stroke="#cfd6df" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 100h84" stroke="#eee" stroke-width="5" stroke-linecap="round"/><rect x="24" y="84" width="52" height="16" rx="3" fill="#ffc8dd" transform="rotate(-6 50 92)"/>',
  rope: '<path d="M50 4 C50 20 60 30 64 40" stroke="#555" stroke-width="3" fill="none"/><g transform="rotate(-18 64 50)"><rect x="54" y="38" width="20" height="13" rx="4" fill="#cfd6df"/><path d="M57 51c-10 8-11 20-5 30M71 51c10 8 11 20 5 30M64 51v30" stroke="#cfd6df" stroke-width="4.5" fill="none" stroke-linecap="round"/></g><path d="M18 30c6-4 12-4 18 0" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/><circle cx="34" cy="96" r="12" fill="#f6eef0"/><circle cx="66" cy="98" r="10" fill="#ffd84a"/>',
  ring: '<path d="M50 4v20" stroke="#555" stroke-width="3"/><rect x="34" y="22" width="32" height="13" rx="5" fill="#cfd6df"/><path d="M38 35l-8 40 12 2M62 35l8 40-12 2" stroke="#cfd6df" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="50" cy="78" rx="7" ry="11" fill="none" stroke="#2ec4ff" stroke-width="4"/><circle cx="50" cy="100" r="11" fill="#5a5a66"/>',
  hook: '<path d="M4 44h56" stroke="#e8edf2" stroke-width="5" stroke-linecap="round"/><path d="M60 44v-8" stroke="#e8edf2" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="52" r="9" fill="none" stroke="#ffc531" stroke-width="4"/><path d="M40 61v8" stroke="#d9c08a" stroke-width="2"/><circle cx="40" cy="80" r="11" fill="#8bc34a"/><path d="M78 6v12" stroke="#555" stroke-width="3"/><path d="M70 18h16l-4 26M70 18l4 26" stroke="#cfd6df" stroke-width="4" fill="none" stroke-linecap="round"/>',
};
const ICON_OF = { tri: 'three', bridge: 'two', swing: 'rope', ring: 'ring', hook: 'hook' };

function showLobby() {
  S.screen = 'lobby';
  stopPlayLoopSounds();
  $('#game').hidden = true; $('#lobby').hidden = false;
  $('#lobbyCoins').textContent = store.coins();
  $('#dailyBtn').classList.toggle('hot', store.canDaily());
  const list = $('#machineList');
  list.innerHTML = '';
  for (const M of MACHINES) {
    const ms = store.machine(M.id, M.defaults);
    const card = document.createElement('div');
    card.className = 'mcard';
    card.style.setProperty('--c', M.theme.main);
    const diff = '<b>' + '●'.repeat(M.difficulty) + '</b>' + '○'.repeat(5 - M.difficulty);
    card.innerHTML = `
      <div class="cab"><div class="nm">${M.name}</div><svg viewBox="0 0 100 112">${ICONS[ICON_OF[M.id]]}</svg></div>
      <div style="min-width:0">
        <h3>${M.name}<span class="tag">${M.tag}</span></h3>
        <p>${M.desc}</p>
        <div class="meta">
          <span class="price"><span class="coin-ico">¢</span>${M.price} 幣 1 局</span>
          <span class="diff" title="難度">${diff}</span>
          ${ms.wins ? `<span class="stat">已夾 ${ms.wins} 件</span>` : ''}
        </div>
        <button class="play-btn" data-id="${M.id}">開 機</button>
      </div>`;
    list.appendChild(card);
  }
  $$('.play-btn').forEach(b => b.onclick = () => { initAudio(); sfx.button(); enterMachine(b.dataset.id); });
}

// ---------- 入機 ----------
function enterMachine(id) {
  const M = getMachine(id);
  S.M = M; S.mstate = store.machine(id, M.defaults);
  S.credits[id] ||= 0; S.paid[id] ||= 0; S.bought[id] ||= 0;
  S.playing = false; S.phase = null; S.timerOn = false; S.winQueue = [];
  $('#lobby').hidden = true; $('#game').hidden = false;
  S.screen = 'game';
  $('#hudTitle').textContent = M.name;
  document.documentElement.style.setProperty('--machine', M.theme.main);
  R.resize();
  R.ignoreAdds = true;
  G.load(id);
  R.buildMachine(G);
  setView(M.view || 'front');
  S.settleT = 2.6;
  $('#settleMsg').hidden = false;
  if (G_().music) startMusic();
  renderControls();
  updateHUD();
}

function setView(v) {
  R.setView(v);
  $$('.overlay-tr button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
}

// ---------- 投幣 ----------
function credits() { return S.credits[S.M.id] || 0; }
function insertCoin() {
  if (!S.M) return false;
  if (!store.spend(1)) { sfx.deny(); toast('冇金幣喇', '返大廳領每日金幣'); return false; }
  sfx.coinDrop();
  const id = S.M.id;
  S.paid[id]++;
  if (S.paid[id] >= S.M.price) {
    S.paid[id] -= S.M.price;
    S.credits[id]++; S.bought[id]++;
    setTimeout(() => sfx.credit(), 180);
    if (S.bought[id] % 5 === 0) { S.credits[id]++; setTimeout(() => { sfx.bonus(); toast('5 局送 1 局！'); }, 300); }
  } else setTimeout(() => sfx.coin(), 120);
  save();
  updateHUD();
  renderControls();
  return true;
}

function setupCoinDrag() {
  const stack = $('#coinStack'), slot = $('#coinSlot');
  let drag = null;
  const overSlot = (x, y) => { const r = slot.getBoundingClientRect(); return x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24; };
  stack.addEventListener('pointerdown', (e) => {
    initAudio();
    if (store.coins() <= 0) { sfx.deny(); toast('冇金幣喇', '返大廳領每日金幣'); return; }
    e.preventDefault();
    stack.setPointerCapture(e.pointerId);
    const el = document.createElement('div'); el.className = 'flycoin'; el.textContent = '¢';
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px';
    document.body.appendChild(el);
    drag = { el, x0: e.clientX, y0: e.clientY, moved: false };
  });
  stack.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.el.style.left = e.clientX + 'px'; drag.el.style.top = e.clientY + 'px';
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
    slot.classList.toggle('hover', overSlot(e.clientX, e.clientY));
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    slot.classList.remove('hover');
    const r = slot.getBoundingClientRect();
    const into = !d.moved || overSlot(e.clientX, e.clientY);
    d.el.classList.add('in');
    if (into) {
      d.el.style.left = (r.left + r.width / 2) + 'px'; d.el.style.top = (r.top + r.height / 2) + 'px';
      d.el.style.transform = 'translate(-50%,-50%) scale(0.2) rotateY(80deg)'; d.el.style.opacity = '0.2';
      setTimeout(() => { d.el.remove(); insertCoin(); }, 260);
    } else {
      const s = stack.getBoundingClientRect();
      d.el.style.left = (s.left + s.width / 2) + 'px'; d.el.style.top = (s.top + s.height / 2) + 'px';
      setTimeout(() => d.el.remove(), 300);
    }
  };
  stack.addEventListener('pointerup', end);
  stack.addEventListener('pointercancel', end);
}

// ---------- 開局 / 完局 ----------
function canStart() { return S.screen === 'game' && !S.playing && S.settleT <= 0 && G.claw && G.claw.state === 'idle' && credits() > 0; }

function startPlay() {
  if (!canStart()) return false;
  const id = S.M.id, ms = S.mstate, st = ms.settings;
  S.credits[id]--;
  ms.plays++; ms.playsSinceWin++;
  const payout = st.payout > 0 && ms.playsSinceWin >= st.payout;
  const grip = payout
    ? { g1: Math.max(1.2, st.g1), g2: Math.max(1.1, st.g1), stage2: st.stage2 === 'off' ? 'top' : st.stage2, jitter: 0, topShake: 0 }
    : { g1: st.g1, g2: st.stage2 === 'off' ? st.g1 : st.g2, stage2: st.stage2 === 'off' ? 'top' : st.stage2, jitter: st.jitter, topShake: st.topShake };
  S.playGrip = grip; S.payoutPlay = payout;
  G.claw.configureGrip(grip);
  G.claw.start();
  S.playing = true; S.winsThisPlay = 0;
  S.b1 = S.b2 = false; S.b1Used = S.b2Used = false;
  const mode = G_().control;
  S.phase = mode === 'buttons' ? 'b1' : 'joy';
  S.timer = mode === 'buttons' ? 30 : (G_().timer || 20);
  S.timerOn = true;
  save();
  if (payout) { sfx.payout(); toast('保底強爪！', '今局爪力全開'); }
  sfx.credit();
  renderControls(); updateHUD();
  return true;
}

function doDrop() {
  if (!S.playing || !G.claw) return;
  if (G.claw.drop()) { S.phase = 'drop'; S.timerOn = false; S.joy = [0, 0]; renderControls(); updateHUD(); }
}
function doGrab() { if (G.claw && S.mstate.settings.manualClose && G.claw.close()) { sfx.close(); renderControls(); } }

function onPlayEnd() {
  S.playing = false; S.phase = null; S.timerOn = false;
  setTimeout(() => {
    if (S.screen !== 'game') return;
    if (S.winsThisPlay === 0 && !S.winQueue.length && !$('#modal').dataset.kind) { sfx.lose(); toast(pickLose()); }
    renderControls(); updateHUD();
  }, 900);
  renderControls(); updateHUD();
}
const LOSE = ['差少少！', '再嚟過！', '就快得喇！', '甩咗…', '下次一定得！'];
function pickLose() { return LOSE[Math.floor(Math.random() * LOSE.length)]; }

function onWin(p) {
  S.winsThisPlay++;
  const ms = S.mstate;
  ms.wins++; ms.playsSinceWin = 0;
  const entry = store.addPrize(p, S.M.id);
  S.winQueue.push({ p, entry });
  sfx.win();
  if (!$('#modal').dataset.kind) setTimeout(showNextWin, 500);
}

// ---------- 每格 ----------
let last = performance.now(), acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.screen === 'game' && G.M) {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 4) { preStep(DT); G.step(); acc -= DT; n++; }
    if (n === 4) acc = 0;
    if (S.settleT > 0) { S.settleT -= dt; if (S.settleT <= 0) { $('#settleMsg').hidden = true; renderControls(); } }
    if (S.timerOn) {
      S.timer -= dt;
      const sec = Math.ceil(S.timer);
      if (sec <= 5 && sec !== S.lastTick && sec > 0) { S.lastTick = sec; sfx.tick(); }
      if (S.timer <= 0) timeUp();
    }
    R.sync(G, now / 1000);
    R.updateCamera(dt);
    R.render();
    hudFrame();
    clawSounds();
  }
  requestAnimationFrame(loop);
}

function timeUp() {
  S.timerOn = false;
  if (S.phase === 'b1') { S.phase = 'b2'; S.timer = 30; S.timerOn = true; S.b1 = false; renderControls(); }
  else doDrop();
}

function preStep() {
  const C = G.claw;
  if (!C) return;
  if (!S.playing || C.busy) { C.move = [0, 0]; return; }
  const mode = G_().control;
  let mx = 0, mz = 0;
  if (mode === 'buttons') {
    if (S.phase === 'b1' && S.b1) mx = 1;
    if (S.phase === 'b2' && S.b2) mz = -1;
    // 鍵盤
  } else {
    let jx = S.joy[0], jy = S.joy[1];
    if (S.keys.size) {
      jx = (S.keys.has('ArrowRight') || S.keys.has('d') ? 1 : 0) - (S.keys.has('ArrowLeft') || S.keys.has('a') ? 1 : 0);
      jy = (S.keys.has('ArrowUp') || S.keys.has('w') ? 1 : 0) - (S.keys.has('ArrowDown') || S.keys.has('s') ? 1 : 0);
    }
    // 將畫面方向轉做機台方向（畫面向上 = 遠離鏡頭）
    const yaw = R.viewYaw();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // 向前
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);  // 向右
    mx = rx * jx + fx * jy; mz = rz * jx + fz * jy;
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
  }
  C.move = [mx, mz];
}

function clawSounds() {
  const C = G.claw;
  if (!C) return;
  const moving = Math.hypot(C.vx, C.vz) > 0.15;
  const winch = C.state === 'down' || C.state === 'up';
  if (moving || winch) motorSet(1, winch ? (C.state === 'up' ? 1.3 : 1.1) : 0.9);
  else motorStop();
}
function stopPlayLoopSounds() { motorStop(); }

// ---------- HUD ----------
function updateHUD() {
  $('#hudCoins').textContent = store.coins();
  if (!S.M) return;
  $('#hudCredits').textContent = credits();
  const paid = S.paid[S.M.id] || 0;
  $('#paidDots').innerHTML = S.M.price > 1 ? Array.from({ length: S.M.price }, (_, i) => `<span class="coin-ico" style="width:12px;height:12px;font-size:0;${i < paid ? '' : 'filter:grayscale(1) brightness(.45)'}"></span>`).join('') : '';
  $('#coinStack').classList.toggle('empty', store.coins() <= 0);
  const st = S.mstate.settings;
  const g = S.playing && S.playGrip ? S.playGrip : { g1: st.g1, g2: st.stage2 === 'off' ? st.g1 : st.g2 };
  const pct = (v) => Math.round(v * 100) + '%';
  $('#gripChip').innerHTML = (S.payoutPlay && S.playing) ? '保底局 · 爪力 <b>全開</b>' : (st.stage2 === 'off' ? `爪力 <b>${pct(g.g1)}</b>` : `爪力 <b>${pct(g.g1)}</b> → 2收爪 <b>${pct(g.g2)}</b>`);
  $('#gripChip').classList.toggle('payout', !!(S.payoutPlay && S.playing));
  const pc = $('#payoutChip');
  if (st.payout > 0) { pc.hidden = false; pc.innerHTML = `保底 <b>${Math.min(S.mstate.playsSinceWin, st.payout)}/${st.payout}</b>`; } else pc.hidden = true;
  let hint;
  if (store.coins() <= 0 && credits() === 0) hint = '冇金幣喇，返大廳領<b>每日金幣</b>';
  else if (credits() > 0 && !S.playing) hint = `有 <b>${credits()}</b> 局，${G_().control === 'buttons' ? '撳 <b>①</b> 開始' : '推<b>搖桿</b>開始'}`;
  else if (S.M.price > 1 && paid > 0) hint = `已入 <b>${paid}/${S.M.price}</b> 幣，再入 <b>${S.M.price - paid}</b> 個`;
  else if (S.playing) hint = `${S.M.price} 幣 1 局 · 5 局送 1 局`;
  else hint = `將金幣<b>拖入投幣口</b> <span class="arrow">→</span><br>${S.M.price} 幣 1 局 · 5 局送 1 局`;
  $('#trayHint').innerHTML = hint;
  $('#coinSlot').classList.toggle('need', credits() === 0 && !S.playing && store.coins() > 0);
}

let lastHudKey = '';
function hudFrame() {
  const t = $('#timer');
  if (S.timerOn) { t.hidden = false; const s = Math.max(0, Math.ceil(S.timer)); t.textContent = s; t.classList.toggle('low', s <= 5); }
  else t.hidden = true;
  const C = G.claw;
  const key = [S.playing, S.phase, C && C.state, credits(), S.settleT > 0].join('|');
  if (key !== lastHudKey) { lastHudKey = key; renderControls(); }
}

// ---------- 按鈕 ----------
let ctrlLayout = '';
function renderControls() {
  const box = $('#controls');
  if (!S.M || !G.claw) { box.innerHTML = ''; ctrlLayout = ''; return; }
  const mode = G_().control, C = G.claw;
  const canGrab = S.mstate.settings.manualClose && (C.state === 'down' || C.state === 'opening');
  const ready = canStart();
  const layout = mode + '|' + canGrab;
  if (layout !== ctrlLayout) {
    ctrlLayout = layout;
    const grab = `<button class="abtn grab live" id="btnGrab"><span><span class="big">✊</span>收爪</span></button>`;
    if (mode === 'buttons') {
      box.innerHTML = `<button class="abtn b1" id="btn1"><span><span class="big">①</span>向右 ▶</span></button>
        <div class="ctrl-mid" id="ctrlMid"></div>
        ${canGrab ? grab : `<button class="abtn b2" id="btn2"><span><span class="big">②</span>向入 ▲</span></button>`}`;
    } else {
      box.innerHTML = `<div class="joy" id="joy"><div class="knob" id="knob"></div></div>
        <div class="ctrl-mid" id="ctrlMid"></div>
        ${canGrab ? grab : `<button class="abtn drop" id="btnDrop"><span><span class="big">▼</span>落爪</span></button>`}`;
    }
    bindControlButtons();
  }
  const set = (el, on) => { if (!el) return; el.disabled = !on; el.classList.toggle('live', on); };
  if (mode === 'buttons') {
    set($('#btn1'), (S.playing && S.phase === 'b1') || ready);
    set($('#btn2'), S.playing && S.phase === 'b2');
  } else {
    const dropOn = (S.playing && S.phase === 'joy') || ready;
    set($('#btnDrop'), dropOn);
    $('#joy')?.classList.toggle('dim', !dropOn);
  }
  $('#ctrlMid').innerHTML = midText();
}

function midText() {
  const C = G.claw;
  if (S.settleT > 0) return '擺貨中…';
  if (S.playing) {
    if (S.phase === 'b1') return '<b>按住 ①</b> 向右行<br>放手就唔可以再郁';
    if (S.phase === 'b2') return '<b>按住 ②</b> 向入行<br>放手即刻落爪';
    if (S.phase === 'joy') return '<b>搖桿</b>移動<br>撳<b>落爪</b>';
    const st = C.state;
    if (st === 'opening' || st === 'down') return S.mstate.settings.manualClose ? '落緊爪…<br>撳<b>收爪</b>即刻收（2收爪）' : '落緊爪…';
    if (st === 'closing') return '收爪！';
    if (st === 'up') return '扯起…';
    if (st === 'top' || st === 'return') return '返去出口…';
    return '…';
  }
  if (credits() > 0) return G_().control === 'buttons' ? '撳 <b>①</b> 開始' : '推搖桿或撳<b>落爪</b>開始';
  return '入幣先開機';
}

function holdBtn(el, on, off) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('pressed'); on(); });
  const up = () => { el.classList.remove('pressed'); off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

function bindControlButtons() {
  holdBtn($('#btn1'), () => {
    initAudio();
    if (!S.playing && !startPlay()) return;
    if (S.phase !== 'b1') return;
    S.b1 = true; S.b1Used = true; sfx.button();
  }, () => {
    if (S.phase === 'b1' && S.b1Used) { S.b1 = false; S.phase = 'b2'; S.timer = 30; renderControls(); }
  });
  holdBtn($('#btn2'), () => { if (S.phase !== 'b2') return; S.b2 = true; S.b2Used = true; sfx.button(); }, () => {
    if (S.phase === 'b2' && S.b2Used) { S.b2 = false; doDrop(); }
  });
  holdBtn($('#btnDrop'), () => {
    initAudio();
    if (!S.playing) { if (startPlay()) sfx.button(); return; }
    sfx.button(); doDrop();
  }, () => { });
  holdBtn($('#btnGrab'), () => doGrab(), () => { });
  const joy = $('#joy'), knob = $('#knob');
  if (joy) {
    let id = null;
    const set = (e) => {
      const r = joy.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.36), y = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.36);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      const dz = Math.hypot(x, y) < 0.18;
      S.joy = dz ? [0, 0] : [x, -y];
      knob.style.transform = `translate(${x * r.width * 0.3}px, ${y * r.height * 0.3}px)`;
    };
    joy.addEventListener('pointerdown', (e) => {
      initAudio();
      if (!S.playing) { if (!startPlay()) return; }
      if (S.phase !== 'joy') return;
      e.preventDefault(); id = e.pointerId; joy.setPointerCapture(id); set(e);
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const up = (e) => { if (e.pointerId !== id) return; id = null; S.joy = [0, 0]; knob.style.transform = ''; };
    joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  }
}

// ---------- 鏡頭拖動 ----------
function setupCameraDrag() {
  const cv = $('#view');
  const pts = new Map();
  let pinch0 = 0, zoom0 = 1;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = R.camCtl.zoom; } });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const cc = R.camCtl;
    if (pts.size === 1) {
      cc.dragYaw = Math.max(-1.1, Math.min(1.1, cc.dragYaw - dx * 0.006));
      cc.dragPitch = Math.max(-0.1, Math.min(0.7, cc.dragPitch + dy * 0.004));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      cc.zoom = Math.max(0.55, Math.min(1.3, zoom0 * pinch0 / Math.max(1, d)));
    }
  });
  const up = (e) => pts.delete(e.pointerId);
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); R.camCtl.zoom = Math.max(0.55, Math.min(1.3, R.camCtl.zoom * (1 + e.deltaY * 0.001))); }, { passive: false });
  cv.addEventListener('dblclick', () => { R.camCtl.dragYaw = 0; R.camCtl.dragPitch = 0; R.camCtl.zoom = 1; });
}

// ---------- 鍵盤 ----------
function setupKeys() {
  window.addEventListener('keydown', (e) => {
    if (S.screen !== 'game' || $('#modal').dataset.kind) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (e.repeat) return;
    initAudio();
    const mode = G_().control;
    if (k === 'c') { insertCoin(); return; }
    if (k === 'x') { doGrab(); return; }
    if (mode === 'buttons') {
      if (k === '1' || k === 'ArrowRight') { if (!S.playing && !startPlay()) return; if (S.phase === 'b1') { S.b1 = true; S.b1Used = true; } }
      if ((k === '2' || k === 'ArrowUp') && S.phase === 'b2') { S.b2 = true; S.b2Used = true; }
      if (k === ' ') { if (G.claw && (G.claw.state === 'down' || G.claw.state === 'opening')) doGrab(); }
    } else {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) { if (!S.playing && !startPlay()) return; S.keys.add(k); }
      if (k === ' ') {
        if (!S.playing) { startPlay(); return; }
        if (G.claw.state === 'down' || G.claw.state === 'opening') doGrab(); else doDrop();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    S.keys.delete(k);
    if (G_().control === 'buttons') {
      if ((k === '1' || k === 'ArrowRight') && S.phase === 'b1' && S.b1Used) { S.b1 = false; S.phase = 'b2'; S.timer = 30; renderControls(); }
      if ((k === '2' || k === 'ArrowUp') && S.phase === 'b2' && S.b2Used) { S.b2 = false; doDrop(); }
    }
  });
}

// ---------- 提示字 ----------
let toastTimer = 0;
function toast(text, small) {
  const t = $('#toast');
  t.innerHTML = text + (small ? `<small>${small}</small>` : '');
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

// ---------- 彈出視窗 ----------
function openModal(kind, html) {
  const m = $('#modal'); m.dataset.kind = kind; m.hidden = false;
  $('#sheet').innerHTML = html;
  $$('#sheet [data-close]').forEach(b => b.onclick = closeModal);
}
function closeModal() {
  const m = $('#modal'); const kind = m.dataset.kind;
  m.hidden = true; delete m.dataset.kind; $('#sheet').innerHTML = '';
  if (kind === 'win') { stopConfetti(); if (S.winQueue.length) setTimeout(showNextWin, 250); }
  if (S.screen === 'lobby') showLobby(); else { updateHUD(); renderControls(); }
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

const TYPE_NAME = { plush: '公仔', ring: '膠環公仔', hang: '吊飾', box: '手辦盒' };
function stars(n) { n = Math.max(1, Math.min(5, n)); return '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>'; }

function showNextWin() {
  const w = S.winQueue.shift();
  if (!w) return;
  const { p, entry } = w;
  const ch = p.char || p.design?.char;
  openModal('win', `<div class="win-card">
      <p class="big">夾到喇！</p>
      <img src="${portraitURL(ch, 256)}" alt="">
      <p class="nm">${p.name}</p>
      <p class="stars">${stars(p.rarity)}</p>
      <p class="sub">${TYPE_NAME[p.type]} · ${entry.count === 1 ? '新收藏！已加入圖鑑' : `你已經有 ${entry.count} 件`}</p>
      <div class="btn-row"><button class="btn primary" data-close>收入圖鑑</button></div>
    </div>`);
  startConfetti();
  toast('夾到喇！');
}

function showSettings(inGame) {
  const gl = G_();
  let html = `<h2>${inGame ? '爪力調校' : '設定'}<button class="x" data-close aria-label="關閉">✕</button></h2>`;
  if (inGame) {
    const st = S.mstate.settings, M = S.M;
    html += `<p class="sub">${M.name} · 改完下一局生效</p>
    <div class="row"><label for="s_g1">抓起爪力</label><output id="o_g1"></output><input type="range" id="s_g1" min="5" max="150" step="5"><div class="hint">落到底收爪時嘅力度。100% 已經好夠力，150% 係超強爪。</div></div>
    <div class="row"><label for="s_stage2">二段收爪（2收爪）</label><span></span><div class="seg" id="s_stage2" style="grid-column:1/-1">
      <button data-v="top">到頂先轉弱</button><button data-v="mid">扯起一半</button><button data-v="move">返出口時</button><button data-v="off">關閉</button></div>
      <div class="hint">真機常見：夾起之後爪力會轉弱，公仔有機會甩返落嚟。</div></div>
    <div class="row" id="row_g2"><label for="s_g2">二段爪力</label><output id="o_g2"></output><input type="range" id="s_g2" min="0" max="150" step="5"><div class="hint">轉弱之後嘅力度。越細越易甩。</div></div>
    <div class="row"><label for="s_payout">保底局數</label><output id="o_payout"></output><input type="range" id="s_payout" min="0" max="30" step="1"><div class="hint">連續幾多局夾唔到，下一局就會全力。0 = 關閉。</div></div>
    <div class="row"><label for="s_jitter">爪力隨機浮動</label><output id="o_jitter"></output><input type="range" id="s_jitter" min="0" max="40" step="1"><div class="hint">每局爪力會上下浮動，好似真機咁時好時壞。</div></div>
    <div class="row"><label for="s_shake">到頂震動</label><output id="o_shake"></output><input type="range" id="s_shake" min="0" max="100" step="5"><div class="hint">爪升到頂嗰下會震一震。</div></div>
    <div class="row"><label for="s_manual">落爪途中可以「收爪」</label><button class="toggle" id="s_manual" aria-label="落爪途中可以收爪"></button><div class="hint">2收爪：落緊爪時再撳一下，即刻停低收爪。</div></div>
    <div class="btn-row"><button class="btn" id="s_reset">還原預設</button><button class="btn" id="s_restock">重新擺貨</button></div>`;
  }
  html += `<h3>操控</h3>
    <div class="row"><label>操控方式</label><span></span><div class="seg" id="g_control" style="grid-column:1/-1"><button data-v="buttons">日式兩掣 ① ②</button><button data-v="joystick">搖桿 + 限時</button></div>
    <div class="hint">兩掣：按住 ① 向右、按住 ② 向入，放手就落爪。搖桿：自由移動，限時內撳落爪。</div></div>
    <div class="row"><label>搖桿限時</label><span></span><div class="seg" id="g_timer" style="grid-column:1/-1"><button data-v="15">15 秒</button><button data-v="20">20 秒</button><button data-v="30">30 秒</button><button data-v="60">60 秒</button></div></div>
    <h3>畫面同聲音</h3>
    <div class="row"><label>畫質</label><span></span><div class="seg" id="g_quality" style="grid-column:1/-1"><button data-v="auto">自動</button><button data-v="high">高</button><button data-v="mid">中</button><button data-v="low">低（舊手機）</button></div></div>
    <div class="row"><label>音效</label><button class="toggle" id="g_sound" aria-label="音效"></button></div>
    <div class="row"><label>背景音樂</label><button class="toggle" id="g_music" aria-label="背景音樂"></button></div>
    <h3>玩法</h3>
    <ol class="howto"><li>將金幣<b>拖入投幣口</b>，夠錢就有一局。</li><li>移動爪到公仔上面，<b>落爪</b>。</li><li>落緊爪時可以撳<b>收爪</b>，提早收。</li><li>夾起嘅公仔跌入<b>出口</b>就贏，會自動收入圖鑑。</li><li>拖動畫面可以轉鏡頭，雙指可以縮放。電腦：方向鍵 / 空白鍵 / C 入幣。</li></ol>
    <div class="btn-row"><button class="btn primary" data-close>完成</button></div>`;
  openModal('settings', html);

  const segBind = (id, val, fn) => { const el = $(id); if (!el) return; const upd = (v) => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); upd(val); el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; sfx.button(); fn(b.dataset.v); upd(b.dataset.v); }; };
  const togBind = (id, val, fn) => { const el = $(id); el.classList.toggle('on', !!val); el.onclick = () => { const v = !el.classList.contains('on'); el.classList.toggle('on', v); fn(v); sfx.button(); }; };
  if (inGame) {
    const st = S.mstate.settings;
    const rng = (id, out, get, set, fmt) => { const el = $(id), o = $(out); el.value = get(); o.textContent = fmt(el.value); el.oninput = () => { set(+el.value); o.textContent = fmt(el.value); save(); updateHUD(); }; };
    rng('#s_g1', '#o_g1', () => Math.round(st.g1 * 100), v => st.g1 = v / 100, v => v + '%');
    rng('#s_g2', '#o_g2', () => Math.round(st.g2 * 100), v => st.g2 = v / 100, v => v + '%');
    rng('#s_payout', '#o_payout', () => st.payout, v => st.payout = v, v => +v ? v + ' 局' : '關');
    rng('#s_jitter', '#o_jitter', () => Math.round(st.jitter * 100), v => st.jitter = v / 100, v => '±' + v + '%');
    rng('#s_shake', '#o_shake', () => Math.round(st.topShake * 100), v => st.topShake = v / 100, v => v + '%');
    const g2row = () => { $('#row_g2').style.opacity = st.stage2 === 'off' ? 0.4 : 1; };
    segBind('#s_stage2', st.stage2, v => { st.stage2 = v; save(); updateHUD(); g2row(); });
    g2row();
    togBind('#s_manual', st.manualClose, v => { st.manualClose = v; save(); renderControls(); });
    $('#s_reset').onclick = () => { store.resetMachine(S.M.id, S.M.defaults); S.mstate = store.machine(S.M.id, S.M.defaults); sfx.button(); showSettings(true); updateHUD(); };
    $('#s_restock').onclick = () => { if (S.playing || G.claw.busy) { toast('等呢局完先'); return; } closeModal(); R.ignoreAdds = true; G.restock(); R.buildMachine(G); S.settleT = 2.6; $('#settleMsg').hidden = false; renderControls(); };
  }
  segBind('#g_control', gl.control, v => { if (S.playing) { toast('下一局先轉'); } store.setGlobal('control', v); if (!S.playing) renderControls(); });
  segBind('#g_timer', gl.timer, v => store.setGlobal('timer', +v));
  segBind('#g_quality', gl.quality || 'auto', v => { store.setGlobal('quality', v); R.setQuality(pickQuality()); });
  togBind('#g_sound', gl.sound, v => { store.setGlobal('sound', v); setSound(v); });
  togBind('#g_music', gl.music, v => { store.setGlobal('music', v); setMusic(v); if (v && S.screen === 'game') { initAudio(); startMusic(); } });
}

function catalog() {
  const items = [];
  for (const [k, c] of Object.entries(CHARACTERS)) items.push({ key: k + ':plush', char: k, type: 'plush', name: c.name, rarity: c.rarity });
  for (const [k, c] of Object.entries(CHARACTERS)) items.push({ key: k + ':ring', char: k, type: 'ring', name: c.name + '（膠環）', rarity: c.rarity + 1 });
  for (const [k, c] of Object.entries(CHARACTERS)) items.push({ key: k + ':hang', char: k, type: 'hang', name: c.name + '（吊飾）', rarity: c.rarity + 1 });
  for (const d of BOX_DESIGNS) items.push({ key: d.char + ':box', char: d.char, type: 'box', name: d.name, rarity: d.rarity });
  return items;
}

function showDex(tab = 'plush') {
  const col = store.s.collection, all = catalog();
  const got = all.filter(i => col[i.key]).length;
  const items = all.filter(i => i.type === tab);
  const html = `<h2>圖鑑<button class="x" data-close aria-label="關閉">✕</button></h2>
    <p class="sub">已收集 <b class="num">${got}</b> / ${all.length} 款 · 總共夾到 <b class="num">${store.s.totalWins}</b> 件</p>
    <div class="progress"><i style="width:${(got / all.length * 100).toFixed(1)}%"></i></div>
    <div class="tabs" id="dexTabs">${Object.entries(TYPE_NAME).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}</div>
    <div class="dex">${items.map(i => { const c = col[i.key]; return `<div class="it ${c ? 'got' : 'no'}"><img src="${portraitURL(i.char, 128)}" alt=""><div class="n">${c ? i.name : '？？？'}</div><div class="stars" style="font-size:10px">${stars(i.rarity)}</div><div class="c">${c ? '×' + c.count : ''}</div></div>`; }).join('')}</div>`;
  openModal('dex', html);
  $('#dexTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) showDex(b.dataset.t); };
}

function showDaily() {
  const can = store.canDaily(), wait = store.refillWait();
  const mins = Math.ceil(wait / 60000);
  openModal('daily', `<h2>領金幣<button class="x" data-close aria-label="關閉">✕</button></h2>
    <p class="sub">而家有 <b class="num">${store.coins()}</b> 個金幣</p>
    <div class="btn-row"><button class="btn gold" id="d_daily" ${can ? '' : 'disabled'}>${can ? '領取每日 20 幣' : '今日已經領咗'}</button></div>
    <div class="btn-row"><button class="btn" id="d_refill" ${store.coins() < 5 && wait <= 0 ? '' : 'disabled'}>${store.coins() >= 5 ? '少過 5 幣先可以免費補幣' : wait > 0 ? `${mins} 分鐘後可以補幣` : '免費補 10 幣'}</button></div>
    <p class="sub" style="margin-top:12px">每日金幣聽日再嚟領。金幣用晒（少過 5 個）每 30 分鐘可以免費補 10 個。</p>`);
  $('#d_daily').onclick = () => { if (store.claimDaily()) { sfx.bonus(); showDaily(); $('#lobbyCoins').textContent = store.coins(); } };
  $('#d_refill').onclick = () => { if (store.claimRefill()) { sfx.coin(); showDaily(); } };
}

// ---------- 彩紙 ----------
let confettiRAF = 0;
function startConfetti() {
  const cv = $('#confetti'); cv.hidden = false;
  const w = cv.width = innerWidth, h = cv.height = innerHeight;
  const g = cv.getContext('2d');
  const cols = ['#ff4f8b', '#ffc531', '#3fd0ff', '#52e3c2', '#ffffff', '#9b5cff'];
  const ps = Array.from({ length: 140 }, () => ({ x: w / 2 + (Math.random() - 0.5) * 80, y: h * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[Math.floor(Math.random() * cols.length)], s: 5 + Math.random() * 6 }));
  let t = 0;
  const f = () => {
    g.clearRect(0, 0, w, h); t++;
    for (const p of ps) { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (t < 180) confettiRAF = requestAnimationFrame(f); else stopConfetti();
  };
  cancelAnimationFrame(confettiRAF); f();
}
function stopConfetti() { cancelAnimationFrame(confettiRAF); const cv = $('#confetti'); cv.hidden = true; }

// ---------- 綁定 ----------
function bindUI() {
  $('#backBtn').onclick = () => { initAudio(); sfx.button(); if (S.playing) { toast('等呢局完先'); return; } G.unload(); R.clear(); stopMusic(); showLobby(); };
  $('#gSetBtn').onclick = () => { sfx.button(); showSettings(true); };
  $('#setBtn').onclick = () => { initAudio(); sfx.button(); showSettings(false); };
  $('#dexBtn').onclick = () => { initAudio(); sfx.button(); showDex(); };
  $('#dailyBtn').onclick = () => { initAudio(); sfx.button(); showDaily(); };
  $$('.overlay-tr button').forEach(b => b.onclick = () => { sfx.button(); setView(b.dataset.view); });
  setupCoinDrag();
  setupCameraDrag();
  setupKeys();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { motorStop(); } last = performance.now(); });
  window.addEventListener('resize', () => { if (R) R.resize(); });
}

window.__claw = { get G() { return G; }, get R() { return R; }, S, store, startPlay, doDrop, insertCoin, enterMachine };
boot();
