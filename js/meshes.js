// 3D 模型：公仔、盒、膠環、爪
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../lib/RoundedBoxGeometry.js';
import { CHARACTERS, TORSO_PROFILE } from './prizes.js';
import { portraitCanvas } from './portrait.js';

const matCache = new Map();
export function fabric(color, opts = {}) {
  const key = 'f' + color + (opts.shiny ? 's' : '');
  if (matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color(color);
  const m = opts.shiny
    ? new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 })
    : new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.92, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.55) });
  matCache.set(key, m);
  return m;
}
export function plastic(color, opts = {}) {
  const key = 'p' + color + (opts.transparent ? 't' : '') + (opts.rough ?? '');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.25, metalness: 0.05, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
  matCache.set(key, m);
  return m;
}
export const CHROME = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 });
export const DARK_METAL = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.8, roughness: 0.35 });
const EYE = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.15, metalness: 0.2 });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const CHEEK = new THREE.MeshStandardMaterial({ color: 0xff8fa6, roughness: 0.9, transparent: true, opacity: 0.75 });

const geoCache = new Map();
function cachedGeo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
const SPHERE = () => cachedGeo('sphere', () => new THREE.SphereGeometry(1, 28, 20));
const SPHERE_LO = () => cachedGeo('sphereLo', () => new THREE.SphereGeometry(1, 14, 10));

function sph(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, lo = false) {
  const m = new THREE.Mesh(lo ? SPHERE_LO() : SPHERE(), mat);
  m.scale.set(r * sx, r * sy, r * sz); m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function capsuleMesh(mat, r, len, radial = 14) {
  const g = cachedGeo(`cap${r.toFixed(3)}_${len.toFixed(3)}_${radial}`, () => new THREE.CapsuleGeometry(r, len, 6, radial));
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

// ---------- 公仔 ----------
function torsoGeo(s) {
  return cachedGeo('torso' + s.toFixed(3), () => {
    const pts = [new THREE.Vector2(0.001, TORSO_PROFILE[0][0] * s)];
    for (const [y, r] of TORSO_PROFILE) pts.push(new THREE.Vector2(r * s * 1.05, y * s * 1.03));
    pts.push(new THREE.Vector2(0.001, TORSO_PROFILE[TORSO_PROFILE.length - 1][0] * s * 1.03));
    const g = new THREE.LatheGeometry(pts, 28);
    g.scale(1, 1, 0.92);
    g.computeVertexNormals();
    return g;
  });
}

export function torsoMesh(char, s) {
  const C = CHARACTERS[char];
  const grp = new THREE.Group();
  const body = new THREE.Mesh(torsoGeo(s), fabric(C.body, C));
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  if (C.belly !== C.body) grp.add(sph(fabric(C.belly), 0.4 * s, 0, -0.12 * s, 0.3 * s, 1, 1.1, 0.55));
  if (char === 'dino') { // 背脊
    const spikeMat = fabric(0xffb84d);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(cachedGeo('cone', () => new THREE.ConeGeometry(1, 2, 10)), spikeMat);
      c.scale.set(0.11 * s, 0.11 * s, 0.11 * s); c.position.set(0, (0.3 - i * 0.35) * s, -0.5 * s); c.rotation.x = -1.2;
      grp.add(c);
    }
  }
  if (char === 'chick' || char === 'seal') { // 細翼 / 鰭
    const m = fabric(C.body);
    for (const sx of [1, -1]) { const w = sph(m, 0.22 * s, sx * 0.52 * s, -0.05 * s, 0, 0.5, 1, 0.8); w.rotation.z = sx * 0.4; grp.add(w); }
  }
  return grp;
}

export function headMesh(char, s) {
  const C = CHARACTERS[char];
  const grp = new THREE.Group();
  const fm = fabric(C.body, C);
  const head = sph(fm, 0.6 * s * 1.04, 0, 0, 0);
  head.receiveShadow = true;
  grp.add(head);
  const earMat = C.earColor ? fabric(C.earColor) : fm;
  const inner = fabric(C.belly === C.body ? 0xffc2d1 : C.belly);
  if (C.ear === 'round') {
    for (const sx of [1, -1]) {
      grp.add(sph(earMat, 0.2 * s, sx * 0.42 * s, 0.42 * s, 0, 1, 1, 0.75));
      if (!C.earColor) grp.add(sph(inner, 0.11 * s, sx * 0.42 * s, 0.42 * s, 0.1 * s, 1, 1, 0.4, true));
    }
  } else if (C.ear === 'tri') {
    for (const sx of [1, -1]) {
      const e = new THREE.Mesh(cachedGeo('cone4', () => new THREE.ConeGeometry(1, 1.6, 4)), earMat);
      e.scale.set(0.2 * s, 0.22 * s, 0.12 * s); e.position.set(sx * 0.36 * s, 0.5 * s, 0); e.rotation.z = -sx * 0.35; e.rotation.y = Math.PI / 4; e.castShadow = true;
      grp.add(e);
    }
  } else if (C.ear === 'long') {
    for (const sx of [1, -1]) {
      const e = capsuleMesh(earMat, 0.13 * s, 0.45 * s);
      e.position.set(sx * 0.26 * s, 0.75 * s, 0); e.rotation.z = -sx * 0.14; e.scale.z = 0.7;
      grp.add(e);
      const ie = capsuleMesh(inner, 0.07 * s, 0.38 * s);
      ie.position.set(sx * 0.26 * s, 0.78 * s, 0.07 * s); ie.rotation.z = -sx * 0.14; ie.scale.z = 0.4;
      grp.add(ie);
    }
  } else if (C.ear === 'tuft') {
    for (const a of [-0.4, 0, 0.4]) { const t = sph(fm, 0.09 * s, Math.sin(a) * 0.12 * s, 0.62 * s, 0, 0.6, 1.4, 0.6, true); t.rotation.z = a; grp.add(t); }
  } else if (C.ear === 'spike') {
    const sm = fabric(0xffb84d);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(cachedGeo('cone', () => new THREE.ConeGeometry(1, 2, 10)), sm);
      c.scale.set(0.12 * s, 0.13 * s, 0.12 * s); const a = -0.5 + i * 0.5;
      c.position.set(0, Math.cos(a) * 0.6 * s, -Math.sin(-a) * 0.0 - 0.1 * s + i * 0.0); c.position.z = (-0.15 - i * 0.18) * s; c.position.y = (0.6 - i * 0.12) * s;
      c.rotation.x = -0.3 - i * 0.35;
      grp.add(c);
    }
  }
  // 面
  const fz = 0.6 * s * 1.04;
  if (C.ear === 'eyes') { // 青蛙眼
    for (const sx of [1, -1]) {
      grp.add(sph(fm, 0.2 * s, sx * 0.3 * s, 0.48 * s, 0.18 * s));
      grp.add(sph(WHITE, 0.13 * s, sx * 0.3 * s, 0.5 * s, 0.32 * s, 1, 1, 0.6, true));
      grp.add(sph(EYE, 0.07 * s, sx * 0.3 * s, 0.5 * s, 0.38 * s, 1, 1, 0.6, true));
    }
  } else {
    if (C.patch) for (const sx of [1, -1]) { const p = sph(fabric(C.patch), 0.15 * s, sx * 0.22 * s, 0.05 * s, fz * 0.9, 1, 1.3, 0.35, true); p.rotation.z = sx * 0.5; grp.add(p); }
    for (const sx of [1, -1]) {
      grp.add(sph(EYE, 0.075 * s, sx * 0.22 * s, 0.05 * s, fz * 0.95, 1, 1.15, 0.5, true));
      grp.add(sph(WHITE, 0.025 * s, sx * 0.2 * s, 0.09 * s, fz * 0.98, 1, 1, 0.5, true));
    }
  }
  // 口鼻
  if (char === 'chick') {
    const b = new THREE.Mesh(cachedGeo('cone', () => new THREE.ConeGeometry(1, 2, 10)), plastic(C.nose, { rough: 0.6 }));
    b.scale.set(0.09 * s, 0.09 * s, 0.09 * s); b.position.set(0, -0.08 * s, fz * 1.02); b.rotation.x = Math.PI / 2; grp.add(b);
  } else if (C.snout) {
    grp.add(sph(fabric(C.nose), 0.16 * s, 0, -0.1 * s, fz * 0.92, 1.2, 0.85, 0.5));
    for (const sx of [1, -1]) grp.add(sph(EYE, 0.03 * s, sx * 0.06 * s, -0.1 * s, fz * 0.92 + 0.08 * s, 1, 1.3, 0.5, true));
  } else {
    if (char !== 'frog') grp.add(sph(fabric(C.belly === C.body ? 0xffffff : C.belly), 0.17 * s, 0, -0.15 * s, fz * 0.86, 1.25, 0.9, 0.6, true));
    grp.add(sph(plastic(C.nose, { rough: 0.5 }), 0.05 * s, 0, -0.1 * s, fz * 0.86 + 0.1 * s, 1.3, 1, 0.8, true));
  }
  if (char !== 'golden') for (const sx of [1, -1]) grp.add(sph(CHEEK, 0.08 * s, sx * 0.36 * s, -0.12 * s, fz * 0.8, 1, 0.7, 0.3, true));
  if (char === 'frog') { const m = new THREE.Mesh(cachedGeo('mouth', () => new THREE.TorusGeometry(1, 0.12, 6, 20, Math.PI)), EYE); m.scale.setScalar(0.14 * s); m.position.set(0, -0.12 * s, fz * 0.96); m.rotation.z = Math.PI; grp.add(m); }
  return grp;
}

export function limbMesh(char, s, kind) {
  const C = CHARACTERS[char];
  const grp = new THREE.Group();
  const r = (kind === 'arm' ? 0.16 : 0.19) * s * 1.05, len = (kind === 'arm' ? 0.32 : 0.24) * s;
  grp.add(capsuleMesh(fabric(C.body, C), r, len));
  if (kind === 'leg' && C.belly !== C.body) {
    const pad = sph(fabric(C.belly), r * 0.75, 0, len / 2 + r * 0.55, 0, 1, 0.35, 1, true);
    grp.add(pad);
  }
  return grp;
}

// 細公仔（膠環 / 吊飾）：身同頭係同一個剛體
export function miniMesh(char, s) {
  const grp = new THREE.Group();
  grp.add(torsoMesh(char, s));
  const h = headMesh(char, s); h.position.y = 1.08 * s; grp.add(h);
  for (const sx of [1, -1]) {
    const a = limbMesh(char, s, 'arm'); a.position.set(sx * 0.55 * s, 0.05 * s, 0.12 * s); a.rotation.z = sx * 0.6; grp.add(a);
    const l = limbMesh(char, s, 'leg'); l.position.set(sx * 0.3 * s, -0.55 * s, 0.38 * s); l.rotation.x = Math.PI / 2 - 0.3; grp.add(l);
  }
  return grp;
}

export function ringMesh(R, r, color) {
  const m = new THREE.Mesh(cachedGeo(`torus${R}_${r}`, () => new THREE.TorusGeometry(R, r * 1.05, 12, 40)),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.92 }));
  m.castShadow = true;
  return m;
}

// ---------- 盒裝獎品 ----------
function boxFace(design, w, h, kind) {
  const c = document.createElement('canvas');
  const scale = 128;
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  const col = '#' + new THREE.Color(design.color).getHexString(), acc = '#' + new THREE.Color(design.accent).getHexString();
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  // 斜紋
  g.globalAlpha = 0.18; g.fillStyle = '#ffffff';
  for (let x = -c.height; x < c.width; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 14 + c.height, c.height); g.lineTo(x + c.height, c.height); g.fill(); }
  g.globalAlpha = 1;
  g.fillStyle = acc; g.fillRect(0, c.height - c.height * 0.2, c.width, c.height * 0.2);
  if (kind === 'front') {
    // 透明窗 + 公仔
    const pw = c.height * 0.72;
    const pc = portraitCanvas(design.char, 256);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    roundRect(g, c.width / 2 - pw / 2 - 8, c.height * 0.06 - 4, pw + 16, pw + 8, 18); g.fill();
    g.drawImage(pc, c.width / 2 - pw / 2, c.height * 0.06, pw, pw);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(c.height * 0.11)}px "Noto Sans TC", sans-serif`; g.textAlign = 'center';
    g.fillText(design.name, c.width / 2, c.height - c.height * 0.06);
  } else if (kind === 'top') {
    g.fillStyle = acc; g.font = `900 ${Math.round(c.height * 0.3)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('PREMIUM', c.width / 2, c.height * 0.42);
  } else {
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(c.height * 0.16)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★ FIGURE ★', c.width / 2, c.height * 0.45);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0 });
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export function boxMesh(size, design) {
  const [w, h, d] = size;
  const g = new RoundedBoxGeometry(w, h, d, 2, 0.05);
  const side = boxFace(design, d, h, 'side'), side2 = side;
  const front = boxFace(design, w, h, 'front'), top = boxFace(design, w, d, 'top');
  const m = new THREE.Mesh(g, [side, side2, top, top, front, front]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- 爪 ----------
export function clawHeadMesh(T, trimColor) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(T.headR * 0.92, T.headR, T.headHH * 2, 28), CHROME);
  body.castShadow = true; grp.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(T.headR * 1.02, T.headR * 1.02, T.headHH * 0.5, 28), plastic(trimColor, { rough: 0.35 }));
  band.position.y = T.headHH * 0.25; grp.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(T.headR * 0.35, T.headR * 0.6, 0.18, 20), DARK_METAL);
  cap.position.y = T.headHH + 0.09; grp.add(cap);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(T.headR * 0.55, T.headR * 0.4, 0.14, 20), DARK_METAL);
  hub.position.y = -T.headHH - 0.04; grp.add(hub);
  return grp;
}

export function fingerMesh(vis, T, tipColor) {
  const grp = new THREE.Group();
  const n = vis.parts.length;
  vis.parts.forEach((p, i) => {
    if (p.pad) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.24, 0.56, 2, 0.04), plastic(0x222222, { rough: 0.9 }));
      m.position.set(...p.p); m.quaternion.set(...p.q); m.castShadow = true; grp.add(m); return;
    }
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
    const tip = i >= n - 2 && !T.pad;
    const m = capsuleMesh(tip ? plastic(tipColor, { rough: 0.4 }) : CHROME, p.r, len, 10);
    m.position.set(...p.p); m.quaternion.set(...p.q);
    grp.add(m);
  });
  // 鉸位
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), DARK_METAL);
  pin.rotation.x = Math.PI / 2; grp.add(pin);
  return grp;
}
