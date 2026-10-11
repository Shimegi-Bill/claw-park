// 2D 角色頭像（用喺圖鑑、得獎畫面、盒面）
import { CHARACTERS } from './prizes.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const cache = new Map();

export function portraitCanvas(char, size = 160) {
  const key = char + size;
  if (cache.has(key)) return cache.get(key);
  const C = CHARACTERS[char];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const u = size / 100;
  const body = hex(C.body), belly = hex(C.belly), dark = '#1a1720';
  const shade = (col, k) => {
    const n = parseInt(col.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * k)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) * k)), b = Math.max(0, Math.min(255, (n & 255) * k));
    return `rgb(${r | 0},${gg | 0},${b | 0})`;
  };
  const circ = (x, y, r, fill, sx = 1, sy = 1) => { g.save(); g.translate(x * u, y * u); g.scale(sx, sy); g.beginPath(); g.arc(0, 0, r * u, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.restore(); };
  const grad = (x, y, r, col) => { const gr = g.createRadialGradient((x - r * 0.35) * u, (y - r * 0.4) * u, r * 0.1 * u, x * u, y * u, r * u); gr.addColorStop(0, shade(col, 1.1)); gr.addColorStop(1, shade(col, 0.9)); return gr; };
  const earCol = C.earColor ? hex(C.earColor) : body;
  // 耳
  if (C.ear === 'round') { for (const sx of [-1, 1]) { circ(50 + sx * 27, 26, 13, grad(50 + sx * 27, 26, 13, earCol)); if (!C.earColor) circ(50 + sx * 27, 27, 7, '#ffc2d1'); } }
  if (C.ear === 'tri') for (const sx of [-1, 1]) { g.beginPath(); g.moveTo((50 + sx * 14) * u, 26 * u); g.lineTo((50 + sx * 34) * u, 8 * u); g.lineTo((50 + sx * 36) * u, 36 * u); g.closePath(); g.fillStyle = earCol; g.fill(); }
  if (C.ear === 'long') for (const sx of [-1, 1]) { g.save(); g.translate((50 + sx * 15) * u, 18 * u); g.rotate(sx * 0.15); g.beginPath(); g.ellipse(0, 0, 8 * u, 20 * u, 0, 0, Math.PI * 2); g.fillStyle = body; g.fill(); g.beginPath(); g.ellipse(0, 2 * u, 4 * u, 14 * u, 0, 0, Math.PI * 2); g.fillStyle = '#ffc2d1'; g.fill(); g.restore(); }
  if (C.ear === 'spike') for (let i = 0; i < 3; i++) { g.beginPath(); const x = 38 + i * 12; g.moveTo((x - 6) * u, 22 * u); g.lineTo(x * u, 8 * u); g.lineTo((x + 6) * u, 22 * u); g.fillStyle = '#ffb84d'; g.fill(); }
  if (C.ear === 'tuft') for (const a of [-0.35, 0, 0.35]) { g.save(); g.translate(50 * u, 20 * u); g.rotate(a); g.beginPath(); g.ellipse(0, -6 * u, 3 * u, 8 * u, 0, 0, Math.PI * 2); g.fillStyle = body; g.fill(); g.restore(); }
  // 頭
  circ(50, 55, 36, grad(50, 55, 36, body));
  if (C.ear === 'eyes') for (const sx of [-1, 1]) { circ(50 + sx * 17, 25, 12, grad(50 + sx * 17, 25, 12, body)); circ(50 + sx * 17, 25, 8, '#fff'); circ(50 + sx * 17, 26, 4.5, dark); }
  if (C.patch) for (const sx of [-1, 1]) { g.save(); g.translate((50 + sx * 14) * u, 52 * u); g.rotate(sx * -0.5); g.beginPath(); g.ellipse(0, 0, 8 * u, 11 * u, 0, 0, Math.PI * 2); g.fillStyle = hex(C.patch); g.fill(); g.restore(); }
  if (C.ear !== 'eyes') for (const sx of [-1, 1]) { circ(50 + sx * 14, 52, 4.6, dark, 1, 1.15); circ(50 + sx * 14 - 1.5, 50, 1.6, '#fff'); }
  // 口鼻
  if (char === 'chick') { g.beginPath(); g.moveTo(44 * u, 63 * u); g.lineTo(56 * u, 63 * u); g.lineTo(50 * u, 71 * u); g.closePath(); g.fillStyle = hex(C.nose); g.fill(); }
  else if (C.snout) { circ(50, 64, 10, hex(C.nose), 1.2, 0.85); circ(46, 64, 2, dark); circ(54, 64, 2, dark); }
  else if (char === 'frog') { g.beginPath(); g.arc(50 * u, 62 * u, 9 * u, 0.15 * Math.PI, 0.85 * Math.PI); g.strokeStyle = dark; g.lineWidth = 2.2 * u; g.stroke(); }
  else { circ(50, 64, 10, C.belly === C.body ? '#fff' : belly, 1.2, 0.85); circ(50, 61, 3, hex(C.nose), 1.3, 1); g.beginPath(); g.moveTo(50 * u, 63 * u); g.lineTo(50 * u, 67 * u); g.arc(47 * u, 67 * u, 3 * u, 0, Math.PI * 0.8); g.moveTo(50 * u, 67 * u); g.arc(53 * u, 67 * u, 3 * u, Math.PI, Math.PI * 0.2, true); g.strokeStyle = dark; g.lineWidth = 1.2 * u; g.stroke(); }
  if (char !== 'golden') for (const sx of [-1, 1]) circ(50 + sx * 25, 63, 5.5, 'rgba(255,120,150,0.55)');
  if (C.shiny) { g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(0, 0, size, size); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, size, size); g.globalCompositeOperation = 'source-over'; }
  cache.set(key, cv);
  return cv;
}

export function portraitURL(char, size = 160) { return portraitCanvas(char, size).toDataURL(); }
