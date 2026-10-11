// 畫面：機殼、獎品、爪、鏡頭
import * as THREE from 'three';
import { RoomEnvironment } from '../lib/RoomEnvironment.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from '../lib/RoundedBoxGeometry.js';
import { torsoMesh, headMesh, limbMesh, miniMesh, ringMesh, boxMesh, clawHeadMesh, fingerMesh, CHROME, DARK_METAL, plastic } from './meshes.js';
import { Q } from './phys.js';

// 將一個 group 入面同材質嘅 mesh 合併，減少 draw call
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const g = o.geometry.clone();
    if (g.index) { /* keep */ }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const arr = byMat.get(o.material) || []; arr.push(g.index ? g : g); byMat.set(o.material, arr);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const ng = geos.map(g => g.index ? g.toNonIndexed() : g);
    const merged = mergeGeometries(ng, false);
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true; m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const css = (n) => '#' + new THREE.Color(n).getHexString();

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = quality !== 'low';
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x140c22);
    this.scene.fog = new THREE.Fog(0x140c22, 40, 90);
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camCtl = { preset: 'front', yaw: 0, pitch: 0, dragYaw: 0, dragPitch: 0, zoom: 1, cur: null };
    this.dyn = []; // {body, obj}
    this.prizeObjs = new Map();
    this.links = [];
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.setupLights();
    if (quality !== 'high') this.key.shadow.mapSize.set(1024, 1024);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    this.r.shadowMap.enabled = q !== 'low';
    const sz = q === 'high' ? 2048 : 1024;
    if (this.key.shadow.mapSize.x !== sz) { this.key.shadow.mapSize.set(sz, sz); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; } }
    this.r.shadowMap.needsUpdate = true;
    this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    this.resize();
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xcfd9ff, 0x3a2a4a, 0.9);
    this.scene.add(hemi);
    const key = this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
    this.scene.add(key); this.scene.add(key.target);
    this.rimA = new THREE.PointLight(0xff4f8b, 30, 30, 1.6); this.scene.add(this.rimA);
    this.rimB = new THREE.PointLight(0x3fd0ff, 30, 30, 1.6); this.scene.add(this.rimB);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    const cap = this.quality === 'high' ? 2 : this.quality === 'mid' ? 1.5 : 1;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    this.root.clear();
    this.dyn = []; this.prizeObjs.clear(); this.links = [];
    this.clawObjs = null;
  }

  // ---------- 機殼 ----------
  buildMachine(game) {
    this.clear();
    const M = game.M, g = M.geo, th = M.theme;
    this.M = M;
    const fy = g.floorY, W = g.w, D = g.d, H = g.topY + 1.2;
    const baseTop = fy - 0.5, baseBot = fy - 7.2;
    this.baseBot = baseBot;
    const paint = new THREE.MeshPhysicalMaterial({ color: th.body, roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const trim = new THREE.MeshStandardMaterial({ color: th.trim, roughness: 0.3, metalness: 0.4 });
    const add = (m) => { this.root.add(m); return m; };

    // 房間地板
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#1d1430'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#241a3b' : '#1a1229'; c.fillRect(x * 64, y * 64, 64, 64); }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(12, 12);
    const room = add(new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.1 })));
    room.rotation.x = -Math.PI / 2; room.position.y = baseBot; room.receiveShadow = true;

    // 機底座
    const base = add(new THREE.Mesh(new RoundedBoxGeometry(W + 1.4, baseTop - baseBot, D + 1.4, 3, 0.25), paint));
    base.position.set(0, (baseTop + baseBot) / 2, 0); base.castShadow = true; base.receiveShadow = true;
    // 前面控制台
    const panel = add(new THREE.Mesh(new RoundedBoxGeometry(W + 1.6, 0.5, 2.2, 3, 0.2), trim));
    panel.position.set(0, baseTop - 0.5, D / 2 + 1.2); panel.rotation.x = 0.22; panel.castShadow = true;
    const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10), DARK_METAL)); stick.position.set(-W * 0.22, baseTop + 0.05, D / 2 + 1.2);
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), plastic(0xff3355, { rough: 0.2 }))); ball.position.set(-W * 0.22, baseTop + 0.55, D / 2 + 1.2);
    this.stickBall = ball; this.stickBase = stick.position.clone();
    [0x3fa9ff, 0xffc531].forEach((c, i) => {
      const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.22, 24), plastic(c, { rough: 0.25 })));
      b.position.set(W * 0.12 + i * 1.1, baseTop - 0.12, D / 2 + 1.25); b.rotation.x = 0.22;
    });
    // 投幣口
    const slot = add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.4, 0.12, 2, 0.05), CHROME)); slot.position.set(W / 2 - 0.9, baseTop - 2.2, D / 2 + 0.72);
    const slotHole = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x111111 }))); slotHole.position.set(W / 2 - 0.9, baseTop - 2.0, D / 2 + 0.79);
    // 出貨門
    const holeX = g.hole ? (g.hole.x0 + g.hole.x1) / 2 : 0;
    const door = add(new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.8, 0.2, 2, 0.12), new THREE.MeshStandardMaterial({ color: 0x111018, roughness: 0.4, metalness: 0.3 })));
    door.position.set(holeX, baseTop - 4.4, D / 2 + 0.66);
    const flap = add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshPhysicalMaterial({ color: 0xbfe7ff, transparent: true, opacity: 0.35, roughness: 0.1 })));
    flap.position.set(holeX, baseTop - 4.4, D / 2 + 0.78);
    const doorLabel = add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, w, h) => { c.fillStyle = css(th.trim); c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('獎品出口', w / 2, h / 2 + 2); }) })));
    doorLabel.position.set(holeX, baseTop - 3.2, D / 2 + 0.72);

    // 柱 + LED
    this.leds = [];
    const ledMat = this.ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(th.main), emissiveIntensity: 2.2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = add(new THREE.Mesh(new RoundedBoxGeometry(0.5, H - baseTop + 0.2, 0.5, 2, 0.12), paint));
      p.position.set(sx * (W / 2 + 0.45), (H + baseTop) / 2, sz * (D / 2 + 0.45)); p.castShadow = true;
      if (sz > 0) {
        const led = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, H - baseTop - 0.4, 0.06), ledMat));
        led.position.set(sx * (W / 2 + 0.45), (H + baseTop) / 2, D / 2 + 0.72);
      }
    }
    // 頂箱 + 招牌
    const head = add(new THREE.Mesh(new RoundedBoxGeometry(W + 1.4, 2.6, D + 1.4, 3, 0.25), paint));
    head.position.set(0, H + 1.3, 0); head.castShadow = true;
    const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 2.0), new THREE.MeshBasicMaterial({
      map: canvasTex(1024, 256, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, th.glow); gr.addColorStop(1, th.main);
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 0, 7); c.fill(); }
        c.font = '900 130px "Noto Sans TC", "PingFang TC", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 18; c.strokeStyle = 'rgba(40,10,40,0.55)'; c.strokeText(M.name, w / 2, h / 2 + 6);
        c.fillStyle = '#fff'; c.fillText(M.name, w / 2, h / 2 + 6);
      }), toneMapped: false,
    })));
    sign.position.set(0, H + 1.3, D / 2 + 0.71);
    // 天花燈
    const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0xfff6e8 })));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H - 0.02;

    // 靜態物件
    for (const s of game.statics) this.addStatic(s, th);

    // 天車路軌
    const rail = new THREE.CylinderGeometry(0.09, 0.09, W, 12); rail.rotateZ(Math.PI / 2);
    for (const sz of [-1, 1]) { const r = add(new THREE.Mesh(rail, CHROME)); r.position.set(0, g.topY + 0.35, sz * (D / 2 - 0.15)); }
    const bridgeGeo = new THREE.BoxGeometry(0.3, 0.22, D - 0.2);
    this.gantry = add(new THREE.Mesh(bridgeGeo, DARK_METAL));
    this.trolley = add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.9, 2, 0.1), trim));

    // 燈
    this.key.position.set(1.5, g.topY + 9, 5);
    this.key.target.position.set(0, fy, 0);
    this.rimA.position.set(-W, g.topY, D + 4);
    this.rimB.position.set(W, fy, D + 4);

    this.buildClaw(game.claw, th);
    this.ignoreAdds = false;
    for (const p of game.prizes) this.addPrize(p);
    this.fitCamera(true);
  }

  addStatic(s, th) {
    const v = s.vis, sh = s.shape, M = this.M, g = M.geo;
    if (!v || v.kind === 'none') return;
    let mesh;
    const geoFor = () => {
      if (sh.t === 'box') return new THREE.BoxGeometry(sh.h[0] * 2, sh.h[1] * 2, sh.h[2] * 2);
      if (sh.t === 'capsule') return new THREE.CapsuleGeometry(sh.r, sh.hh * 2, 6, 16);
      if (sh.t === 'cyl') return new THREE.CylinderGeometry(sh.r, sh.r, sh.hh * 2, 20);
    };
    switch (v.kind) {
      case 'floor': {
        const col = v.color ?? 0xf4c3d6;
        const tex = canvasTex(256, 256, (c, w, h) => {
          c.fillStyle = css(col); c.fillRect(0, 0, w, h);
          for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
          c.fillStyle = 'rgba(255,255,255,0.35)';
          for (let y = 16; y < h; y += 32) for (let x = (y / 32 % 2) * 16 + 8; x < w; x += 32) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
        });
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(sh.h[0] / 1.5, sh.h[2] / 1.5);
        mesh = new THREE.Mesh(geoFor(), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
        mesh.receiveShadow = true;
        break;
      }
      case 'glass': {
        const h = v.y1 - v.y0;
        const w = v.side === 'front' ? g.w : g.d;
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.02, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8 }));
        const x = v.side === 'left' ? -g.w / 2 : v.side === 'right' ? g.w / 2 : 0;
        mesh.position.set(x, (v.y0 + v.y1) / 2, v.side === 'front' ? g.d / 2 : 0);
        if (v.side !== 'front') mesh.rotation.y = Math.PI / 2;
        mesh.renderOrder = 10;
        this.root.add(mesh);
        if (v.side === 'front') this.frontGlass = mesh;
        return;
      }
      case 'back': {
        const h = v.y1 - v.y0;
        const col = v.color ?? 0xff7aa8;
        const tex = canvasTex(512, 512, (c, w, hh) => {
          const gr = c.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, css(new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35))); gr.addColorStop(1, css(col));
          c.fillStyle = gr; c.fillRect(0, 0, w, hh);
          c.fillStyle = 'rgba(255,255,255,0.28)';
          for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = Math.random() * hh, r = 6 + Math.random() * 16; star(c, x, y, r); }
          c.font = '900 64px sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillText('CLAW', w / 2, hh * 0.55);
        });
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(g.w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
        mesh.position.set(0, (v.y0 + v.y1) / 2, -g.d / 2 + 0.01);
        mesh.receiveShadow = true;
        this.root.add(mesh);
        return;
      }
      case 'acrylic':
        mesh = new THREE.Mesh(geoFor(), new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }));
        mesh.renderOrder = 5;
        { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geoFor()), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); mesh.add(e); }
        break;
      case 'chute': case 'chuteBottom':
        mesh = new THREE.Mesh(geoFor(), new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 0.8 }));
        break;
      case 'bar':
        mesh = new THREE.Mesh(geoFor(), CHROME); mesh.castShadow = true; mesh.receiveShadow = true;
        break;
      case 'hook':
        mesh = new THREE.Mesh(geoFor(), CHROME); mesh.castShadow = true;
        break;
      case 'hookBase':
        mesh = new THREE.Mesh(geoFor(), DARK_METAL);
        break;
      case 'ledge':
        mesh = new THREE.Mesh(geoFor(), new THREE.MeshStandardMaterial({ color: th.body, roughness: 0.5 }));
        mesh.receiveShadow = true;
        break;
      default:
        mesh = new THREE.Mesh(geoFor(), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    }
    mesh.position.set(...s.pos);
    mesh.quaternion.set(...s.rot);
    this.root.add(mesh);
  }

  // ---------- 爪 ----------
  buildClaw(claw, th) {
    const T = claw.T;
    const head = clawHeadMesh(T, th.trim);
    this.root.add(head);
    this.dyn.push({ body: claw.head, obj: head });
    for (const f of claw.fingers) {
      const fm = fingerMesh(f.vis, T, th.main);
      fm.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.root.add(fm);
      this.dyn.push({ body: f, obj: fm });
    }
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6, metalness: 0.4 });
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), cableMat);
    this.root.add(this.cable);
    if (claw.rope) { this.rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), CHROME); this.root.add(this.rod); }
    this.clawObjs = { head };
  }

  // ---------- 獎品 ----------
  addPrize(p) {
    if (this.ignoreAdds) return;
    const objs = [];
    for (const part of p.parts) {
      const v = part.vis;
      let o;
      switch (v.kind) {
        case 'torso': o = bake(torsoMesh(v.char, v.s)); break;
        case 'head': o = bake(headMesh(v.char, v.s)); break;
        case 'arm': case 'leg': o = bake(limbMesh(v.char, v.s, v.kind)); break;
        case 'mini': o = bake(miniMesh(v.char, v.s)); break;
        case 'ring': o = ringMesh(v.R, v.r, v.color); break;
        case 'box': o = boxMesh(v.size, v.design); break;
      }
      if (!o) continue;
      this.root.add(o);
      const d = { body: part.body, obj: o };
      this.dyn.push(d); objs.push(d);
    }
    // 環同公仔之間條繩
    if (p.type === 'ring' || p.type === 'hang') {
      const ring = p.parts.find(x => x.vis.kind === 'ring'), body = p.parts.find(x => x.vis.kind === 'mini');
      const s = body.vis.s;
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshStandardMaterial({ color: p.type === 'ring' ? 0xffffff : 0xd9c08a, roughness: 0.7 }));
      this.root.add(cord);
      const link = { a: ring.body, la: [0, -ring.vis.R, 0], b: body.body, lb: [0, 1.68 * s, 0], mesh: cord };
      this.links.push(link); objs.push({ obj: cord, link });
    }
    this.prizeObjs.set(p, objs);
  }

  removePrize(p) {
    const objs = this.prizeObjs.get(p);
    if (!objs) return;
    for (const d of objs) {
      this.root.remove(d.obj);
      const i = this.dyn.indexOf(d); if (i >= 0) this.dyn.splice(i, 1);
      if (d.link) { const j = this.links.indexOf(d.link); if (j >= 0) this.links.splice(j, 1); }
    }
    this.prizeObjs.delete(p);
  }

  // ---------- 每格更新 ----------
  sync(game, time) {
    const P = game.P;
    for (const d of this.dyn) {
      const p = d.body.GetPosition(), q = d.body.GetRotation();
      d.obj.position.set(p.GetX(), p.GetY(), p.GetZ());
      d.obj.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW());
    }
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    for (const l of this.links) {
      const pa = P.pos(l.a), qa = P.rot(l.a), pb = P.pos(l.b), qb = P.rot(l.b);
      const ra = Q.rot(qa, l.la), rb = Q.rot(qb, l.lb);
      tmpA.set(pa[0] + ra[0], pa[1] + ra[1], pa[2] + ra[2]); tmpB.set(pb[0] + rb[0], pb[1] + rb[1], pb[2] + rb[2]);
      stretch(l.mesh, tmpA, tmpB);
    }
    const c = game.claw, g = game.M.geo;
    if (c) {
      this.gantry.position.set(c.cx, g.topY + 0.3, 0);
      this.trolley.position.set(c.cx, g.topY + 0.15, c.cz);
      const ht = c.headTop();
      if (c.rope) {
        const pp = P.pos(c.pulley);
        stretch(this.rod, tmpA.set(c.cx, g.topY, c.cz), tmpB.set(pp[0], pp[1], pp[2]));
        stretch(this.cable, tmpA.set(pp[0], pp[1], pp[2]), tmpB.set(ht[0], ht[1] + 0.1, ht[2]));
      } else stretch(this.cable, tmpA.set(c.cx, g.topY, c.cz), tmpB.set(ht[0], ht[1] + 0.1, ht[2]));
      // 控制台搖桿跟住郁
      if (this.stickBall) {
        this.stickBall.position.set(this.stickBase.x + c.move[0] * 0.25, this.stickBase.y + 0.5, this.stickBase.z - c.move[1] * 0.25);
      }
    }
    if (this.ledMat) {
      const hue = (time * 0.08) % 1;
      this.ledMat.emissive.setHSL(hue, 0.85, 0.55);
    }
  }

  // ---------- 鏡頭 ----------
  setView(preset) { this.camCtl.preset = preset; this.camCtl.dragYaw = 0; this.camCtl.dragPitch = 0; }
  fitCamera(instant) {
    const g = this.M.geo, cc = this.camCtl;
    const fy = g.floorY, top = g.topY + 1.2;
    const midY = fy + (top - fy) * 0.45;
    const asp = this.camera.aspect;
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    let yaw = 0, needW, needH = (top - fy) + 0.6;
    if (cc.preset === 'side') { yaw = Math.PI / 2; needW = g.d + 0.8; }
    else if (cc.preset === 'corner') { yaw = Math.PI / 4.5; needW = Math.hypot(g.w, g.d) * 0.82; }
    else needW = g.w + 0.7;
    const dist = Math.max((needW / 2) / Math.tan(hf / 2), (needH / 2) / Math.tan(vf / 2)) * cc.zoom + (cc.preset === 'side' ? g.w / 2 : g.d / 2);
    const Y = yaw + cc.dragYaw, pitch = 0.12 + cc.dragPitch;
    const target = new THREE.Vector3(0, midY, 0);
    const pos = new THREE.Vector3(Math.sin(Y) * Math.cos(pitch) * dist, midY + Math.sin(pitch) * dist, Math.cos(Y) * Math.cos(pitch) * dist);
    if (instant || !cc.cur) cc.cur = { pos: pos.clone(), target: target.clone() };
    cc.goal = { pos, target };
    cc.yawNow = Y;
  }
  updateCamera(dt) {
    this.fitCamera(false);
    const cc = this.camCtl, k = 1 - Math.exp(-dt * 6);
    cc.cur.pos.lerp(cc.goal.pos, k); cc.cur.target.lerp(cc.goal.target, k);
    this.camera.position.copy(cc.cur.pos);
    this.camera.lookAt(cc.cur.target);
  }
  // 鏡頭水平角度（用嚟將搖桿方向轉做機台方向）
  viewYaw() { const p = this.camera.position, t = this.camCtl.cur?.target || new THREE.Vector3(); return Math.atan2(p.x - t.x, p.z - t.z); }

  render() { this.r.render(this.scene, this.camera); }
}

function stretch(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, Math.max(0.001, len), 1);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
function star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
}
