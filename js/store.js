// 本機儲存：金幣、圖鑑、各機設定（存喺瀏覽器 localStorage）
const KEY = 'clawpark.v1';

const DEFAULT = () => ({
  coins: 30,
  lastDaily: '',
  lastRefill: 0,
  collection: {},   // key -> {count, name, char, type, first}
  machines: {},     // id -> {settings, playsSinceWin, plays, wins}
  global: { control: 'buttons', timer: 20, quality: 'auto', sound: true, music: true },
  totalWins: 0,
});

let state = DEFAULT();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = Object.assign(DEFAULT(), JSON.parse(raw));
} catch (e) { /* 無痕模式等等：照玩，唔儲存 */ }

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } }, 150);
}

export const store = {
  get s() { return state; },
  coins() { return state.coins; },
  addCoins(n) { state.coins = Math.max(0, state.coins + n); save(); return state.coins; },
  spend(n) { if (state.coins < n) return false; state.coins -= n; save(); return true; },
  today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  canDaily() { return state.lastDaily !== store.today(); },
  claimDaily() { if (!store.canDaily()) return 0; state.lastDaily = store.today(); state.coins += 20; save(); return 20; },
  // 冇錢時每 30 分鐘可以免費補 10 個
  refillWait() { return Math.max(0, state.lastRefill + 30 * 60 * 1000 - Date.now()); },
  claimRefill() { if (store.refillWait() > 0) return 0; state.lastRefill = Date.now(); state.coins += 10; save(); return 10; },
  machine(id, defaults) {
    let m = state.machines[id];
    if (!m) m = state.machines[id] = { settings: { ...defaults }, playsSinceWin: 0, plays: 0, wins: 0 };
    m.settings = { ...defaults, ...m.settings };
    return m;
  },
  resetMachine(id, defaults) { const m = store.machine(id, defaults); m.settings = { ...defaults }; save(); return m; },
  addPrize(p, machineId) {
    const key = (p.char || p.design?.char || 'box') + ':' + p.type;
    const c = state.collection[key] || { count: 0, name: p.name, char: p.char || p.design?.char, type: p.type, rarity: p.rarity, first: Date.now() };
    c.count++; c.last = Date.now(); c.machine = machineId;
    state.collection[key] = c;
    state.totalWins++;
    save();
    return c;
  },
  global() { return state.global; },
  setGlobal(k, v) { state.global[k] = v; save(); },
};
