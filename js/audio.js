// 音效：全部用 WebAudio 即時合成，唔使任何音效檔
let ctx = null, master = null, sfxGain = null, musicGain = null;
let motor = null, musicTimer = 0, musicOn = false;
let enabled = { sound: true, music: true };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = enabled.sound ? 1 : 0; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = enabled.music ? 0.16 : 0; musicGain.connect(master);
  } catch (e) { ctx = null; }
}

export function setSound(on) { enabled.sound = on; if (sfxGain) sfxGain.gain.value = on ? 1 : 0; if (!on) motorStop(); }
export function setMusic(on) { enabled.music = on; if (musicGain) musicGain.gain.value = on ? 0.16 : 0; }

function tone(freq, dur, type = 'square', vol = 0.2, when = 0, slide = 0, dest = sfxGain) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 2000, when = 0, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t);
}

export const sfx = {
  coin() { tone(1318, 0.09, 'square', 0.14); tone(1760, 0.22, 'square', 0.12, 0.07); noise(0.12, 0.12, 5200, 0.0, 6); },
  coinDrop() { noise(0.06, 0.18, 3800, 0, 4); noise(0.05, 0.12, 2600, 0.09, 4); noise(0.05, 0.08, 2000, 0.17, 4); },
  credit() { [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.06)); },
  bonus() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, i * 0.07)); },
  button() { tone(660, 0.06, 'square', 0.1); },
  deny() { tone(220, 0.15, 'sawtooth', 0.08, 0, 0.7); },
  open() { noise(0.08, 0.22, 900, 0, 2); tone(180, 0.08, 'square', 0.06); },
  close() { noise(0.1, 0.3, 700, 0, 2); tone(140, 0.12, 'square', 0.08, 0, 0.8); },
  weaken() { tone(420, 0.25, 'sine', 0.08, 0, 0.6); },
  top() { noise(0.12, 0.35, 400, 0, 1.5); },
  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, 0.18, 'square', 0.12, i * 0.09));
    notes.forEach((f, i) => tone(f / 2, 0.18, 'triangle', 0.12, i * 0.09));
  },
  lose() { [523, 466, 392, 330].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.13)); },
  tick() { tone(1400, 0.03, 'square', 0.05); },
  payout() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.1, 'square', 0.1, i * 0.05)); },
};

// 天車 / 捲揚機摩打聲
export function motorSet(level, pitch = 1) {
  if (!ctx || !enabled.sound) return;
  if (!motor) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 70; o2.frequency.value = 141;
    f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(sfxGain); o.start(); o2.start();
    motor = { o, o2, f, g };
  }
  const t = ctx.currentTime;
  motor.g.gain.setTargetAtTime(level * 0.06, t, 0.05);
  motor.o.frequency.setTargetAtTime(70 * pitch, t, 0.1);
  motor.o2.frequency.setTargetAtTime(141 * pitch, t, 0.1);
}
export function motorStop() { if (motor && ctx) motor.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }

// 背景音樂：細細聲嘅機舖小調
const MELODY = [
  [72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [81, 1], [79, 2],
  [74, 1], [77, 1], [81, 1], [77, 1], [76, 1], [79, 1], [72, 2],
  [72, 1], [76, 1], [79, 1], [84, 1], [83, 1], [79, 1], [81, 2],
  [77, 1], [76, 1], [74, 1], [71, 1], [72, 3], [0, 1],
];
const BASS = [48, 48, 53, 53, 50, 50, 55, 55, 48, 48, 53, 53, 50, 55, 48, 48];
export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  const beat = 0.2;
  let step = 0, bar = 0, mi = 0, left = 0;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const tick = () => {
    if (!musicOn) return;
    if (left <= 0) {
      const [n, len] = MELODY[mi % MELODY.length]; mi++;
      if (n) tone(midi(n), beat * len * 0.9, 'square', 0.25, 0, 0, musicGain);
      left = len;
    }
    left--;
    if (step % 2 === 0) { const b = BASS[(bar++) % BASS.length]; tone(midi(b), beat * 1.8, 'triangle', 0.4, 0, 0, musicGain); }
    step++;
    musicTimer = setTimeout(tick, beat * 1000);
  };
  tick();
}
export function stopMusic() { musicOn = false; clearTimeout(musicTimer); }
