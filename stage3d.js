// The 3D preview stage. Each device is a shadow box: its glass is the z = 0 plane, the layout's
// back wall sits behind it, and panels float in front of it or recede into it.
//
// Two ways to draw it, on one persistent canvas (DisplayXR woven-canvas rules 1-3):
// - In the DisplayXR Browser on a Leia display: a woven inline-3D scene (display rig, the devices
//   are the subject), drawn per eye from the views the runtime hands us. Glasses-free 3D with
//   head tracking.
// - Anywhere else: one perspective camera with a slow sway and drag-to-look, so the depth still
//   reads on a 2D monitor.
// Rules followed: DisplayXR/displayxr-web docs/woven-canvas-rules.md.

import * as THREE from 'three';
import { createInline3D, inline3DAvailable, ViewerEase, frameTrackingState } from '@displayxr/inline3d';
import { EyeCamera } from '@displayxr/inline3d/three';
import { LIB, FONTS, STAMP, LINES, ORBIT, ALERT } from './data.js';

const VDH = 0.3; // metres: the virtual display the woven scene is authored for
const DEV = {
  it: { W: 16, H: 10, D: 3, label: 'IT workstation' },
  auto: { W: 24, H: 8, D: 2.6, label: 'Car dashboard' },
  mobile: { W: 6.4, H: 13.6, D: 2, label: 'Phone' },
};
const ALL_POS = { it: [-4, 6.4], auto: [-4, -7.6], mobile: [12.8, -0.4] };
const HARDWARE = '#16191f';

// ---------- small helpers ----------

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
BOX.userData.shared = PLANE.userData.shared = true;

const col = (c) => new THREE.Color(c);
const mix = (a, b, t) => col(a).lerp(col(b), t);
const hex = (c) => '#' + c.getHexString();
const rgba = (c, a) => { const k = col(c); return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`; };

const isLight = (c) => { const k = col(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b > 0.5; };

// A soft radial falloff, shared by glows and motes. Soft edges matter on a lenticular panel: crosstalk
// ghosting scales with contrast × edge sharpness, so anything lifted off the glass is drawn soft.
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  GLOW_TEX.userData.shared = true;
  return GLOW_TEX;
}
// A halo behind an emissive object: per-eye bloom without a post pass (the woven path draws two
// viewports into one buffer, which a screen-space bloom would bleed across).
function glow(parent, c, color, size, x, y, z, opacity = 0.7) {
  const light = isLight(c.P.bg);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, depthWrite: false, opacity: light ? opacity * 0.55 : opacity,
    blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
  }));
  s.scale.set(size, size, 1);
  s.position.set(x, y, z);
  parent.add(s);
  return s;
}

function box(parent, w, h, d, color, x, y, z, { emissive = 0, opacity = 1 } = {}) {
  const m = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({
    color, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive,
    transparent: opacity < 1, opacity,
  }));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// A plane textured by a 2D canvas you draw on. Size in device units; `dens` is texture px per unit.
function canvasPlane(parent, w, h, dens, draw, { x = 0, y = 0, z = 0, glass = false, opacity = 1 } = {}) {
  let pw = Math.round(w * dens), ph = Math.round(h * dens);
  const k = Math.min(1, 1024 / Math.max(pw, ph));
  pw = Math.max(8, Math.round(pw * k)); ph = Math.max(8, Math.round(ph * k));
  const cv = document.createElement('canvas');
  cv.width = pw; cv.height = ph;
  const g = cv.getContext('2d');
  draw(g, pw, ph);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity, depthWrite: !glass, alphaTest: glass ? 0 : 0.04, side: THREE.DoubleSide,
  }));
  m.scale.set(w, h, 1);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function rrect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
}
function fitText(g, text, maxW, px, weight, family) {
  let size = px;
  g.font = `${weight} ${size}px ${family}`;
  while (size > 6 && g.measureText(text).width > maxW) { size *= 0.92; g.font = `${weight} ${size}px ${family}`; }
  return size;
}
function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function wrap(g, text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function setSpacing(g, v) { try { g.letterSpacing = v; } catch { /* older canvas */ } }

// A text label as its own plane, sized to the text. Anchored at its centre unless align says otherwise.
function text(parent, c, str, { size, color, x = 0, y = 0, z = 0, weight = 500, family = c.font, align = 'center', maxW = 0, upper = false, spacing = '0px', lineH = 1.2 }) {
  const dens = c.dens * 1.4, px = size * dens;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${weight} ${px}px ${family}`;
  setSpacing(probe, spacing);
  const s = upper ? str.toUpperCase() : str;
  const lines = maxW ? wrap(probe, s, maxW * dens) : [s];
  const wpx = Math.max(...lines.map((l) => probe.measureText(l).width)) + px * 0.3;
  const hpx = px * lineH * lines.length + px * 0.2;
  const w = wpx / dens, h = hpx / dens;
  const m = canvasPlane(parent, w, h, dens, (g, pw, ph) => {
    const k = pw / wpx;
    g.scale(k, k);
    g.font = `${weight} ${px}px ${family}`;
    setSpacing(g, spacing);
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    const tx = align === 'left' ? px * 0.15 : align === 'right' ? wpx - px * 0.15 : wpx / 2;
    lines.forEach((l, i) => g.fillText(l, tx, px * 0.1 + px * lineH * (i + 0.5)));
  }, { z });
  m.position.set(align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x, y, z);
  return m;
}

// ---------- a module tile ----------
// styles: solid (slab with thickness), glass (translucent, glowing edge), line (accent bar, no fill),
// outline (thin border), pane (tiling window with a header), flat (text only, centred).

function tileDraw(c, m, style, { accent, header } = {}) {
  const P = c.P, fam = c.font;
  return (g, pw, ph) => {
    const base = Math.min(ph, pw * 0.62);
    const pad = base * 0.09, r = c.radius * base * 0.035;
    const ac = accent || P.accent;
    if (style === 'solid') { g.fillStyle = P.surface; rrect(g, 0, 0, pw, ph, r); g.fill(); }
    if (style === 'glass') {
      g.fillStyle = rgba(ac, 0.12); rrect(g, 2, 2, pw - 4, ph - 4, r); g.fill();
      g.strokeStyle = rgba(ac, 0.85); g.lineWidth = Math.max(2, base * 0.014); g.stroke();
    }
    if (style === 'outline') {
      g.fillStyle = rgba(P.surface, 0.85); rrect(g, 1, 1, pw - 2, ph - 2, r); g.fill();
      g.strokeStyle = P.muted; g.lineWidth = Math.max(1.5, base * 0.008); g.stroke();
    }
    if (style === 'line') { g.fillStyle = rgba(P.bg, 0.6); g.fillRect(0, 0, pw, ph); g.fillStyle = ac; g.fillRect(0, 0, base * 0.05, ph); }
    let top = pad;
    if (style === 'pane') {
      g.fillStyle = P.bg; rrect(g, 0, 0, pw, ph, r); g.fill();
      g.strokeStyle = header?.on ? P.accent : P.muted; g.lineWidth = Math.max(2, base * 0.012); g.stroke();
      const hh = base * 0.13;
      g.fillStyle = header?.on ? P.accent : P.muted; g.fillRect(0, 0, pw, hh);
      g.fillStyle = P.bg; g.font = `500 ${hh * 0.66}px ${fam}`; g.textBaseline = 'middle';
      g.fillText(header?.text || '', pad * 0.6, hh / 2);
      top = hh + pad * 0.8;
    }
    const left = style === 'line' ? pad + base * 0.05 : pad, maxW = pw - left - pad;
    const center = style === 'flat';
    g.textAlign = center ? 'center' : 'left';
    const tx = center ? pw / 2 : left;
    g.textBaseline = 'top';
    // label
    g.font = `500 ${base * 0.105}px ${fam}`; setSpacing(g, `${base * 0.008}px`);
    g.fillStyle = P.muted;
    g.fillText(ellipsize(g, m.l.toUpperCase(), maxW), tx, top);
    setSpacing(g, '0px');
    top += base * 0.16;
    // value
    if (m.k === 'term') {
      const lh = base * 0.11;
      g.font = `400 ${lh * 0.86}px 'IBM Plex Mono', ui-monospace, monospace`; g.fillStyle = ac;
      m.v.split('\n').forEach((l, i) => { if (top + lh * (i + 1) < ph - pad - base * 0.1) g.fillText(ellipsize(g, l, maxW), tx, top + lh * i); });
      top += lh * Math.min(4, m.v.split('\n').length) + base * 0.04;
    } else {
      const want = m.k === 'text' ? base * 0.19 : base * 0.3;
      const sz = fitText(g, m.v, maxW, want, 600, fam);
      g.fillStyle = style === 'glass' ? ac : P.fg;
      g.fillText(m.v, tx, top);
      top += sz * 1.12;
    }
    // bar or sparkline
    if (m.k === 'bar') {
      const bh = Math.max(3, base * 0.04), bw = maxW;
      const bx = center ? (pw - bw) / 2 : left;
      g.fillStyle = rgba(P.fg, 0.15); rrect(g, bx, top, bw, bh, bh / 2); g.fill();
      g.fillStyle = ac; rrect(g, bx, top, bw * m.p, bh, bh / 2); g.fill();
      top += bh + base * 0.06;
    } else if (m.k === 'spark' && m.sp) {
      const sh = base * 0.2, mn = Math.min(...m.sp), mx = Math.max(...m.sp);
      if (top + sh < ph - pad - base * 0.1) {
        const pts = m.sp.map((v, i) => [left + (i / (m.sp.length - 1)) * maxW, top + sh - ((v - mn) / (mx - mn || 1)) * sh]);
        g.beginPath(); g.moveTo(left, top + sh); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(left + maxW, top + sh); g.closePath();
        g.fillStyle = rgba(ac, 0.22); g.fill();
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.strokeStyle = ac; g.lineWidth = Math.max(2, base * 0.012); g.stroke();
        top += sh + base * 0.05;
      }
    }
    // sub line, pinned to the bottom when there is room
    g.font = `400 ${base * 0.1}px ${fam}`;
    g.fillStyle = rgba(P.fg, 0.72);
    g.textBaseline = 'bottom';
    g.fillText(ellipsize(g, m.s, maxW), tx, Math.max(top + base * 0.12, ph - pad));
  };
}

function tile(parent, c, m, x, y, z, w, h, { style = 'solid', rx = 0, ry = 0, accent, header, thick } = {}) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.set(rx, ry, 0);
  parent.add(grp);
  const glass = style === 'glass';
  canvasPlane(grp, w, h, c.dens, tileDraw(c, m, style, { accent, header }), { z: 0.004, glass });
  if (style === 'solid' || style === 'pane' || style === 'outline') {
    const t = thick ?? Math.min(w, h) * 0.06;
    box(grp, w * 0.97, h * 0.97, t, hex(mix(c.P.surface, '#000', 0.35)), 0, 0, -t / 2);
  }
  return grp;
}

// Backdrop on the device's back wall.
function backdrop(c, draw) {
  const { W, H, D } = c;
  const m = canvasPlane(c.g, W, H, c.dens * 0.5, draw || ((g, pw, ph) => { g.fillStyle = c.P.bg; g.fillRect(0, 0, pw, ph); }), { z: -D + 0.01 });
  m.userData.backdrop = true;
}

// ---------- the ten layouts, in device units (glass at z = 0, +z toward the viewer) ----------

const A = {};

A.bands = (c) => {
  const { W, H, D, P, mods, tall, g } = c;
  backdrop(c);
  const m = 0.035 * Math.min(W, H), gap = m * 0.5;
  const cw = tall ? 0.26 * W : 0.18 * H, bh = tall ? 0.035 * H : 0.065 * H;
  const L = -W / 2 + m, R = W / 2 - m, T = H / 2 - m, B = -H / 2 + m, fz = -0.12 * D, fd = 0.12 * D;
  const titleW = Math.min((R - L) * 0.4, W * 0.3);
  box(g, cw, bh * 2, fd, P.accent, L + cw / 2, T - bh, fz);
  box(g, R - L - cw - titleW - gap, bh, fd, P.accent, (L + cw + R - titleW - gap) / 2, T - bh / 2, fz);
  text(g, c, c.spec.name, { size: bh * 0.8, color: P.accent, x: R, y: T - bh / 2, z: fz, align: 'right', upper: true, weight: 600 });
  box(g, cw, bh * 2, fd, P.accent2, L + cw / 2, B + bh, fz);
  box(g, (R - L - cw) * 0.3, bh, fd, P.muted, L + cw + gap + (R - L - cw) * 0.15, B + bh / 2, fz);
  box(g, (R - L - cw) * 0.62, bh, fd, P.accent, R - (R - L - cw) * 0.31, B + bh / 2, fz);
  const colTop = T - bh * 2 - gap, colBot = B + bh * 2 + gap;
  const ph = Math.min((colTop - colBot) / (mods.length + 1), bh * 1.8);
  const cols = [P.accent, P.accent2, P.muted];
  mods.forEach((mo, i) => {
    const y = colTop - ph * (i + 0.5);
    box(g, cw, ph - gap, fd, cols[i % 3], L + cw / 2, y, fz);
    text(g, c, mo.l, { size: ph * 0.34, color: P.bg, x: L + cw - m * 0.4, y: y - ph * 0.12, z: fz + fd / 2 + 0.01, align: 'right', upper: true, weight: 600 });
  });
  const fillTop = colTop - ph * mods.length;
  if (fillTop - colBot > gap) box(g, cw, fillTop - colBot - gap, fd, P.muted, L + cw / 2, (fillTop - gap + colBot) / 2, fz);
  const x0 = L + cw + gap * 2, x1 = R, y0 = T - bh - gap * 2, y1 = B + bh + gap * 2;
  const k = Math.min(mods.length, tall ? 4 : 6), ncol = tall ? 1 : 3, rows = Math.ceil(k / ncol);
  const tw = (x1 - x0 - gap * (ncol - 1)) / ncol, th = Math.min((y0 - y1 - gap * (rows - 1)) / rows, tw * 0.8);
  mods.slice(0, k).forEach((mo, i) => {
    const cx = x0 + tw / 2 + (i % ncol) * (tw + gap), cy = y0 - th / 2 - Math.floor(i / ncol) * (th + gap);
    tile(g, c, mo, cx, cy, i === 0 ? 0.06 * H : 0.015 * H, tw, th, { style: 'line', accent: cols[i % 3] });
  });
};

A.arc = (c) => {
  const { W, H, D, P, mods, tall, g, d } = c;
  backdrop(c, (gx, pw, ph) => {
    const gr = gx.createLinearGradient(0, 0, 0, ph);
    gr.addColorStop(0, P.bg); gr.addColorStop(0.62, P.bg); gr.addColorStop(1, hex(mix(P.bg, P.accent, 0.3)));
    gx.fillStyle = gr; gx.fillRect(0, 0, pw, ph);
  });
  if (!tall) box(g, W * 0.96, H * 0.006, 0.02, P.accent, 0, -0.3 * H, -0.6 * D, { emissive: 0.8 });
  const ms = mods.slice(0, 5), n = ms.length, mid = (n - 1) / 2, on = Math.round(mid);
  if (!tall) {
    const tw = W * (d === 'auto' ? 0.15 : 0.19), th = H * (d === 'auto' ? 0.66 : 0.46), R = W * 0.7, step = (tw * 1.1) / R;
    ms.forEach((mo, i) => {
      const a = (i - mid) * step, foc = i === on;
      const t = tile(g, c, mo, R * Math.sin(a), 0.03 * H, R * (1 - Math.cos(a)) - 0.12 * H + (foc ? 0.06 * H : 0), tw, th, { style: foc ? 'glass' : 'solid', ry: -a });
      if (foc) t.scale.setScalar(1.06);
    });
  } else {
    const tw = 0.8 * W, th = 0.15 * H, R = 0.75 * H, step = (th * 1.15) / R;
    ms.forEach((mo, i) => {
      const a = (mid - i) * step, foc = i === on;
      tile(g, c, mo, 0, R * Math.sin(a) + 0.02 * H, R * (1 - Math.cos(a)) - 0.08 * W + (foc ? 0.08 * W : 0), tw, th, { style: foc ? 'glass' : 'solid', rx: a });
    });
  }
  text(g, c, `Look to focus  ·  Pinch to open  ·  ${STAMP[d]}`, { size: Math.min(W, H) * 0.03, color: P.muted, y: -H / 2 + Math.min(W, H) * 0.05, z: 0.02 });
};

A.radial = (c) => {
  const { W, H, P, mods, tall, g, d } = c;
  backdrop(c);
  const ms = mods.slice(0, 8), n = ms.length;
  const S = tall ? 0.9 * W : 0.84 * H, cy = tall ? -0.06 * H : 0.02 * H;
  const r1 = 0.22 * S, r2 = 0.5 * S, dep = 0.03 * S, step = (2 * Math.PI) / n, gp = 0.025;
  const wheel = new THREE.Group();
  wheel.position.set(0, cy, 0);
  g.add(wheel);
  ms.forEach((mo, i) => {
    const ca = Math.PI / 2 - i * step, a0 = ca - step / 2 + gp, a1 = ca + step / 2 - gp, on = i === 0;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r2, a0, a1, false);
    sh.absarc(0, 0, r1, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: false, curveSegments: 20 });
    const z = on ? 0.1 * S : 0.02 * S;
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: on ? P.accent : P.surface, emissive: on ? P.accent : 0x000000, emissiveIntensity: on ? 0.25 : 0 }));
    mesh.position.z = z;
    wheel.add(mesh);
    const rm = (r1 + r2) / 2;
    if (on) glow(wheel, c, P.accent, S * 0.55, Math.cos(ca) * rm, Math.sin(ca) * rm, z - 0.01, 0.55);
    text(wheel, c, mo.l.slice(0, 10), { size: S * 0.036, color: on ? P.bg : P.fg, x: Math.cos(ca) * rm, y: Math.sin(ca) * rm, z: z + dep + 0.01, weight: 600 });
  });
  const r0 = 0.19 * S, cz = 0.16 * S;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, dep, 40), new THREE.MeshLambertMaterial({ color: P.bg }));
  disc.rotation.x = Math.PI / 2; disc.position.z = cz;
  wheel.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r0, S * 0.008, 8, 48), new THREE.MeshLambertMaterial({ color: P.accent2, emissive: P.accent2, emissiveIntensity: 0.5 }));
  ring.position.z = cz + dep / 2;
  wheel.add(ring);
  glow(wheel, c, P.accent2, r0 * 3.2, 0, 0, cz - dep, 0.45);
  if (c.motion) c.anim.push((s) => { wheel.rotation.z = Math.sin(s * 0.5) * 0.05; });
  const c0 = ms[0];
  text(wheel, c, String(c0.k === 'term' ? '>_' : c0.v).slice(0, 9), { size: S * 0.07, color: P.fg, y: S * 0.025, z: cz + dep / 2 + 0.01, weight: 600 });
  text(wheel, c, c0.l, { size: S * 0.03, color: P.muted, y: -S * 0.06, z: cz + dep / 2 + 0.01, upper: true });
  const m = 0.04 * Math.min(W, H);
  if (!tall) {
    const side = W / 2 - S / 2, w = Math.min(side - m * 2, H * 0.6), h = H * 0.4;
    [ms[1], ms[2]].forEach((mo, i) => mo && tile(g, c, mo, (i ? 1 : -1) * (W / 2 - side / 2), cy, 0.05 * H, w, h, { style: 'flat' }));
  } else {
    const space = H / 2 - (cy + S / 2) - m * 2, w = W / 2 - m * 1.5, h = Math.min(space, w * 0.7);
    [ms[1], ms[2]].forEach((mo, i) => mo && tile(g, c, mo, (i ? 1 : -1) * W / 4, H / 2 - m - h / 2, 0.04 * W, w, h, { style: 'flat' }));
  }
  text(g, c, `Flick toward a slice, release to open  ·  ${STAMP[d]}`, { size: Math.min(W, H) * 0.028, color: P.muted, y: -H / 2 + m, z: 0.02 });
};

A.tiling = (c) => {
  const { W, H, P, mods, tall, g, d } = c;
  backdrop(c);
  const m = 0.012 * Math.max(W, H), gap = m * 0.8, barH = (tall ? 0.035 : 0.05) * H;
  const T = H / 2 - m, L = -W / 2 + m, R = W / 2 - m, B = -H / 2 + m;
  canvasPlane(g, R - L, barH, c.dens, (gx, pw, ph) => {
    gx.font = `500 ${ph * 0.55}px ${c.font}`; gx.textBaseline = 'middle';
    let x = ph * 0.2;
    for (let i = 1; i <= 5; i++) {
      const w = ph * 0.9;
      if (i === 1) { gx.fillStyle = P.accent; gx.fillRect(x, ph * 0.1, w, ph * 0.8); }
      gx.fillStyle = i === 1 ? P.bg : P.muted; gx.textAlign = 'center'; gx.fillText(String(i), x + w / 2, ph / 2);
      x += w + ph * 0.15;
    }
    gx.textAlign = 'center'; gx.fillStyle = P.accent2; gx.fillText(c.spec.name.toLowerCase(), pw / 2, ph / 2);
    gx.textAlign = 'right'; gx.fillStyle = P.fg; gx.fillText(STAMP[d], pw - ph * 0.2, ph / 2);
  }, { y: T - barH / 2, z: 0.01 });
  const top = T - barH - gap, ah = top - B, aw = R - L;
  const ms = mods.slice(0, 5), cells = [];
  if (!tall) {
    const w0 = (aw - gap * 2) * 0.5, wc = (aw - gap * 2) * 0.25, hc = (ah - gap) / 2;
    cells.push([L + w0 / 2, top - ah / 2, w0, ah]);
    for (let i = 0; i < 4; i++) cells.push([L + w0 + gap + wc / 2 + (i % 2) * (wc + gap), top - hc / 2 - Math.floor(i / 2) * (hc + gap), wc, hc]);
  } else {
    const h0 = (ah - gap * 2) * 0.5, hc = (ah - gap * 2) * 0.25, wc = (aw - gap) / 2;
    cells.push([0, top - h0 / 2, aw, h0]);
    for (let i = 0; i < 4; i++) cells.push([L + wc / 2 + (i % 2) * (wc + gap), top - h0 - gap - hc / 2 - Math.floor(i / 2) * (hc + gap), wc, hc]);
  }
  ms.forEach((mo, i) => {
    const [x, y, w, h] = cells[i];
    tile(g, c, mo, x, y, i === 0 ? 0.05 * H : 0.008 * H, w, h, { style: 'pane', header: { on: i === 0, text: `[${i + 1}] ${mo.l.toLowerCase()}` }, thick: 0.01 * H });
  });
};

const HW = [[6, 10, 30, 36, -8, 0.18], [40, 6, 24, 30, 4, -0.12], [70, 14, 24, 32, 10, 0.28], [10, 56, 26, 32, 6, -0.2], [42, 48, 26, 38, -4, 0.08], [74, 58, 20, 30, -10, 0.34]];
const HT = [[6, 8, 86, 16, 0, 0.15], [14, 27, 72, 14, 8, -0.1], [4, 44, 62, 14, -8, 0.25], [34, 61, 60, 14, 8, -0.15], [8, 79, 84, 14, 0, 0.05]];
A.holo = (c) => {
  const { W, H, D, P, mods, tall, g, d } = c;
  backdrop(c, (gx, pw, ph) => {
    const gr = gx.createRadialGradient(pw / 2, ph * 0.45, 0, pw / 2, ph * 0.45, Math.max(pw, ph) * 0.6);
    gr.addColorStop(0, hex(mix(P.bg, P.accent, 0.16))); gr.addColorStop(1, P.bg);
    gx.fillStyle = gr; gx.fillRect(0, 0, pw, ph);
    gx.strokeStyle = rgba(P.accent, 0.14); gx.lineWidth = 1;
    const s = Math.min(pw, ph) / 14;
    for (let x = 0; x < pw; x += s) { gx.beginPath(); gx.moveTo(x, 0); gx.lineTo(x, ph); gx.stroke(); }
    for (let y = 0; y < ph; y += s) { gx.beginPath(); gx.moveTo(0, y); gx.lineTo(pw, y); gx.stroke(); }
  });
  const pos = tall ? HT : HW, S = tall ? W : H;
  mods.slice(0, pos.length).forEach((mo, i) => {
    const [l, t, w, h, r, z] = pos[i];
    const tw = (w / 100) * W, th = (h / 100) * H;
    const grp = tile(g, c, mo, -W / 2 + (l / 100) * W + tw / 2, H / 2 - (t / 100) * H - th / 2, z * S * 0.6, tw, th, { style: 'glass', ry: THREE.MathUtils.degToRad(r), accent: i === 2 ? P.accent2 : P.accent });
    const y0 = grp.position.y;
    if (c.motion) c.anim.push((s) => { grp.position.y = y0 + Math.sin(s * 1.1 + i * 1.3) * 0.012 * S; });
  });
  const hx = tall ? 0.22 * W : 0.2 * W, hy = tall ? -0.12 * H : -0.28 * H, hz = 0.4 * S * 0.9;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.035 * S, 0.005 * S, 8, 32), new THREE.MeshLambertMaterial({ color: P.accent2, emissive: P.accent2, emissiveIntensity: 0.8 }));
  torus.position.set(hx, hy, hz); g.add(torus);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012 * S, 16, 8), new THREE.MeshLambertMaterial({ color: P.accent2, emissive: P.accent2, emissiveIntensity: 0.9 }));
  dot.position.set(hx, hy, hz); g.add(dot);
  const hg = glow(g, c, P.accent2, 0.18 * S, hx, hy, hz - 0.01, 0.8);
  if (c.motion) c.anim.push((s) => { const k = 1 + Math.sin(s * 3) * 0.15; torus.scale.setScalar(k); hg.material.opacity = 0.5 + Math.sin(s * 3) * 0.25; });
  text(g, c, `${STAMP[d]}  ·  say a name, grab to move`, { size: Math.min(W, H) * 0.028, color: P.muted, x: -W / 2 + Math.min(W, H) * 0.04, y: H / 2 - Math.min(W, H) * 0.04, z: -D * 0.5, align: 'left' });
};

A.ambient = (c) => {
  const { W, H, P, mods, g, d } = c;
  backdrop(c, (gx, pw, ph) => {
    const gr = gx.createRadialGradient(pw / 2, ph / 2, 0, pw / 2, ph / 2, Math.max(pw, ph) * 0.7);
    gr.addColorStop(0, hex(mix(P.bg, '#ffffff', 0.12))); gr.addColorStop(1, P.bg);
    gx.fillStyle = gr; gx.fillRect(0, 0, pw, ph);
  });
  const S = Math.min(W, H), row = d === 'auto';
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075 * S, 32, 16), new THREE.MeshLambertMaterial({ color: P.accent, emissive: P.accent, emissiveIntensity: 0.55 }));
  orb.position.set(row ? -0.38 * W : 0, row ? 0 : 0.24 * H, 0.22 * S);
  g.add(orb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.11 * S, 32, 16), new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.18, depthWrite: false }));
  orb.add(halo);
  const og = glow(orb, c, P.accent, 0.5 * S, 0, 0, -0.02 * S, 0.75);
  if (c.motion) c.anim.push((s) => { const k = 1 + Math.sin(s * 1.6) * 0.08; orb.scale.setScalar(k); halo.material.opacity = 0.12 + Math.sin(s * 1.6) * 0.06; });
  text(g, c, LINES[d], { size: S * (d === 'mobile' ? 0.085 : 0.07), color: P.fg, x: row ? -0.04 * W : 0, y: row ? 0 : 0, z: 0.04 * S, family: c.font, weight: 400, maxW: row ? 0.48 * W : 0.82 * W, lineH: 1.15 });
  text(g, c, STAMP[d], { size: S * 0.03, color: P.muted, y: H / 2 - S * 0.06, z: 0.01 });
  const chips = mods.slice(0, 3), ch = S * 0.075;
  chips.forEach((mo, i) => {
    const label = `${mo.l}   ${mo.k === 'term' ? 'ready' : mo.v}`;
    const w = Math.min(row ? 0.22 * W : 0.3 * W, ch * 0.38 * label.length * 0.62 + ch);
    const x = row ? 0.36 * W : (i - 1) * (d === 'mobile' ? 0 : 0.32 * W);
    const y = row ? (1 - i) * ch * 1.4 : d === 'mobile' ? -0.22 * H - i * ch * 1.3 : -0.26 * H;
    canvasPlane(g, w, ch, c.dens, (gx, pw, ph) => {
      gx.fillStyle = P.surface; rrect(gx, 0, 0, pw, ph, ph / 2); gx.fill();
      gx.textBaseline = 'middle'; gx.font = `500 ${ph * 0.36}px ${c.font}`;
      gx.fillStyle = P.muted; gx.textAlign = 'left'; gx.fillText(mo.l, ph * 0.4, ph / 2);
      gx.fillStyle = P.fg; gx.textAlign = 'right'; gx.fillText(ellipsize(gx, String(mo.k === 'term' ? 'ready' : mo.v), pw * 0.45), pw - ph * 0.4, ph / 2);
    }, { x, y, z: 0.1 * S });
  });
};

const CW = [[16, 0.15, 22], [32, 0.45, 32], [50, 0.3, 40], [67, 0.55, 28], [84, 0.2, 18], [42, 0.85, 14]];
const CT = [[24, 0.4, 20], [72, 0.3, 24], [46, 0.65, 14], [80, 0.8, 10], [20, 0.95, 8]];
A.cyber = (c) => {
  const { W, H, D, P, mods, tall, g, d } = c;
  const horizon = 0.5 - 0.28; // fraction of height from the bottom where the floor meets the back wall
  backdrop(c, (gx, pw, ph) => {
    const gr = gx.createLinearGradient(0, 0, 0, ph);
    gr.addColorStop(0, P.bg); gr.addColorStop(1 - horizon - 0.15, P.bg);
    gr.addColorStop(1 - horizon, hex(mix(P.bg, P.accent, 0.35))); gr.addColorStop(1, P.bg);
    gx.fillStyle = gr; gx.fillRect(0, 0, pw, ph);
    const r = Math.min(pw, ph) * 0.24, cx = pw / 2, cy = ph * (1 - horizon);
    const sg = gx.createLinearGradient(0, cy - r, 0, cy);
    sg.addColorStop(0, rgba(P.accent2, 0.55)); sg.addColorStop(1, rgba(P.accent, 0.55));
    gx.fillStyle = sg; gx.beginPath(); gx.arc(cx, cy, r, Math.PI, 0); gx.fill();
  });
  const fy = -0.28 * H, fz0 = -D, fz1 = 0.22 * H, fd = fz1 - fz0;
  const grid = document.createElement('canvas'); grid.width = grid.height = 128;
  const gg = grid.getContext('2d');
  gg.fillStyle = hex(mix(P.bg, '#000', 0.2)); gg.fillRect(0, 0, 128, 128);
  gg.strokeStyle = rgba(P.accent, 0.85); gg.lineWidth = 3; gg.beginPath(); gg.moveTo(0, 1.5); gg.lineTo(128, 1.5); gg.stroke();
  gg.strokeStyle = rgba(P.accent2, 0.7); gg.beginPath(); gg.moveTo(1.5, 0); gg.lineTo(1.5, 128); gg.stroke();
  const gt = new THREE.CanvasTexture(grid);
  gt.colorSpace = THREE.SRGBColorSpace; gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.anisotropy = 8;
  const cell = Math.min(W, H) * 0.07;
  gt.repeat.set(W / cell, fd / cell);
  const floor = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: gt }));
  floor.scale.set(W, fd, 1); floor.rotation.x = -Math.PI / 2; floor.position.set(0, fy, (fz0 + fz1) / 2);
  g.add(floor);
  if (c.motion) c.anim.push((s) => { gt.offset.y = (s * 0.35) % 1; });
  const pos = tall ? CT : CW, ms = mods.slice(0, pos.length), hot = ms.length > 2 ? 2 : 0;
  ms.forEach((mo, i) => {
    const [xp, zf, hp] = pos[i];
    const x = -W / 2 + (xp / 100) * W, z = fz0 + 0.12 * fd + zf * 0.8 * fd;
    const h = (hp / 100) * H * (0.5 + 0.5 * mo.p) * 1.35, w = (tall ? 0.08 : 0.035) * W;
    const color = i === hot ? P.accent : P.accent2;
    box(g, w, h, w, color, x, fy + h / 2, z, { emissive: 0.55 });
    glow(g, c, color, w * 4, x, fy + h, z, 0.6);
    glow(g, c, color, w * 5, x, fy + 0.01, z, 0.25);
    const lw = Math.max(w * 3.2, Math.min(W, H) * 0.2), lh = lw * 0.42;
    canvasPlane(g, lw, lh, c.dens, (gx, pw, ph) => {
      gx.fillStyle = rgba(P.bg, 0.78); gx.fillRect(0, 0, pw, ph);
      gx.strokeStyle = color; gx.lineWidth = Math.max(2, ph * 0.03); gx.strokeRect(1, 1, pw - 2, ph - 2);
      gx.textAlign = 'center'; gx.textBaseline = 'middle';
      gx.font = `500 ${ph * 0.22}px ${c.font}`; gx.fillStyle = P.muted; gx.fillText(mo.l.toUpperCase(), pw / 2, ph * 0.3);
      const sz = fitText(gx, String(mo.k === 'term' ? 'live' : mo.v), pw * 0.9, ph * 0.36, 600, c.font);
      gx.fillStyle = P.fg; gx.fillText(String(mo.k === 'term' ? 'live' : mo.v), pw / 2, ph * 0.68 + sz * 0.02);
    }, { x, y: fy + h + lh / 2 + Math.min(W, H) * 0.02, z });
  });
  text(g, c, `${STAMP[d]}  ·  ${c.spec.name}`, { size: Math.min(W, H) * 0.03, color: P.accent2, x: -W / 2 + Math.min(W, H) * 0.04, y: H / 2 - Math.min(W, H) * 0.05, z: 0.02, align: 'left', upper: true });
};

A.tactical = (c) => {
  const { W, H, P, mods, tall, g, d } = c;
  backdrop(c);
  const m = 0.02 * Math.max(W, H) * (tall ? 1.4 : 1), gap = m * 0.7, ah = (tall ? 0.06 : 0.1) * H;
  const L = -W / 2 + m, R = W / 2 - m, T = H / 2 - m, B = -H / 2 + m;
  // alert strip
  const ay = B + ah / 2;
  box(g, R - L, ah, 0.01 * H, P.accent2, 0, ay, 0.05 * H, { emissive: 0.15, opacity: 0.35 });
  box(g, 0.008 * Math.max(W, H), ah, 0.012 * H, P.accent2, L, ay, 0.055 * H, { emissive: 0.6 });
  text(g, c, `▲ ALERT   ${ALERT[d]}`, { size: ah * 0.42, color: P.fg, x: L + m, y: ay, z: 0.065 * H, align: 'left' });
  const top = T, bot = B + ah + gap;
  let map, leftCol, rightCol;
  if (!tall) {
    const u = (R - L - gap * 2) / 3.5;
    leftCol = [L, L + u]; map = [L + u + gap, L + u * 2.5 + gap]; rightCol = [R - u, R];
  } else {
    const side = R - L;
    map = [L, R]; leftCol = [L, (L + R) / 2 - gap / 2]; rightCol = [(L + R) / 2 + gap / 2, R];
    map.top = T; map.bot = T - side;
  }
  const mTop = map.top ?? top, mBot = map.bot ?? bot, mcx = (map[0] + map[1]) / 2, mcy = (mTop + mBot) / 2;
  const rr = (Math.min(map[1] - map[0], mTop - mBot) / 2) * 0.9;
  canvasPlane(g, map[1] - map[0], mTop - mBot, c.dens, (gx, pw, ph) => {
    gx.strokeStyle = P.muted; gx.lineWidth = Math.max(2, pw * 0.004); gx.strokeRect(1, 1, pw - 2, ph - 2);
    gx.font = `500 ${ph * 0.04}px ${c.font}`; gx.fillStyle = P.accent; gx.textBaseline = 'top';
    gx.fillText(`SITUATION  ·  ${STAMP[d]}`, ph * 0.03, ph * 0.03);
  }, { x: mcx, y: mcy, z: 0 });
  const radar = new THREE.Group();
  radar.position.set(mcx, mcy, 0.005);
  g.add(radar);
  const lineMat = new THREE.MeshBasicMaterial({ color: P.muted, side: THREE.DoubleSide });
  [1, 0.66, 0.33].forEach((f) => radar.add(new THREE.Mesh(new THREE.RingGeometry(rr * f - rr * 0.01, rr * f, 72), lineMat)));
  box(radar, rr * 2.05, rr * 0.006, 0.001, P.muted, 0, 0, 0);
  box(radar, rr * 0.006, rr * 2.05, 0.001, P.muted, 0, 0, 0);
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(rr, 32, 0, 0.6), new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  sweep.position.z = 0.002;
  radar.add(sweep);
  if (c.motion) c.anim.push((s) => { sweep.rotation.z = -s * 1.25; });
  const blips = [[12, -18, 0.6], [-22, 8, 0.3], [26, 20, 0.8], [-8, -32, 0.2], [5, 14, 0.45]].slice(0, Math.max(2, Math.min(5, mods.length)));
  blips.forEach(([bx, by, hz], i) => {
    const x = (bx / 46) * rr, y = (-by / 46) * rr, z = hz * rr * 0.55, hotb = i === 0;
    const color = hotb ? P.accent2 : P.accent;
    const s = new THREE.Mesh(new THREE.SphereGeometry(rr * (hotb ? 0.045 : 0.032), 16, 8), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.7 }));
    s.position.set(x, y, z); radar.add(s);
    const bg2 = glow(radar, c, color, rr * (hotb ? 0.4 : 0.25), x, y, z - 0.005, 0.8);
    if (c.motion && hotb) c.anim.push((t) => { bg2.material.opacity = 0.45 + Math.abs(Math.sin(t * 2.4)) * 0.45; });
    box(radar, rr * 0.006, rr * 0.006, z, color, x, y, z / 2, { emissive: 0.5, opacity: 0.6 });
    radar.add(new THREE.Mesh(new THREE.RingGeometry(rr * 0.03, rr * 0.042, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })).translateX(x).translateY(y).translateZ(0.003));
    if (mods[i]) text(radar, c, mods[i].l.slice(0, 9).toUpperCase(), { size: rr * 0.06, color: P.fg, x: x + rr * 0.06, y: y + rr * 0.06, z, align: 'left' });
  });
  radar.add(new THREE.Mesh(new THREE.CircleGeometry(rr * 0.03, 16), new THREE.MeshBasicMaterial({ color: P.fg })).translateZ(0.004));
  // readouts
  const colTop = tall ? mBot - gap : top;
  const Lm = mods.slice(0, tall ? 2 : 3), Rm = mods.slice(tall ? 2 : 3, 6);
  const lh = (colTop - bot - gap * (Lm.length - 1)) / Math.max(1, Lm.length);
  Lm.forEach((mo, i) => tile(g, c, mo, (leftCol[0] + leftCol[1]) / 2, colTop - lh / 2 - i * (lh + gap), 0.03 * H, leftCol[1] - leftCol[0], lh, { style: 'outline', thick: 0.01 * H }));
  const rw = rightCol[1] - rightCol[0], rh = colTop - bot;
  canvasPlane(g, rw, rh, c.dens, (gx, pw, ph) => {
    const rowH = Math.min(ph / Math.max(3, Rm.length), pw * 0.32);
    Rm.forEach((mo, i) => {
      const y = rowH * (i + 1);
      gx.strokeStyle = P.muted; gx.lineWidth = Math.max(1.5, pw * 0.006);
      gx.beginPath(); gx.moveTo(0, y); gx.lineTo(pw, y); gx.stroke();
      gx.textBaseline = 'alphabetic';
      gx.font = `500 ${rowH * 0.2}px ${c.font}`; gx.fillStyle = P.muted; gx.textAlign = 'left';
      gx.fillText(mo.l.toUpperCase(), 0, y - rowH * 0.18);
      gx.textAlign = 'right'; gx.fillStyle = P.fg;
      fitText(gx, String(mo.k === 'term' ? 'ok' : mo.v), pw * 0.5, rowH * 0.36, 500, c.font);
      gx.fillText(String(mo.k === 'term' ? 'ok' : mo.v), pw, y - rowH * 0.16);
    });
  }, { x: (rightCol[0] + rightCol[1]) / 2, y: colTop - rh / 2, z: 0.02 * H });
};

const PT = ['07:30', '08:12', '09:05', '09:38', '10:10'], FT = ['11:00', '14:00', '16:30', '18:00'];
A.stream = (c) => {
  const { W, H, D, P, mods, tall, g, d } = c;
  backdrop(c);
  const n = mods.length, past = Math.max(1, Math.ceil(n * 0.6)), pts = PT.slice(Math.max(0, PT.length - past));
  const m = 0.04 * Math.min(W, H), S = Math.min(W, H);
  text(g, c, 'Today', { size: S * 0.055, color: P.fg, x: -W / 2 + m, y: H / 2 - m - S * 0.035, z: 0.02, align: 'left', weight: 600 });
  const qw = Math.min(W * 0.4, S * 0.7), qh = S * 0.07;
  canvasPlane(g, qw, qh, c.dens, (gx, pw, ph) => {
    gx.strokeStyle = rgba(P.fg, 0.25); gx.lineWidth = Math.max(2, ph * 0.04); rrect(gx, 2, 2, pw - 4, ph - 4, ph / 2); gx.stroke();
    gx.font = `400 ${ph * 0.4}px ${c.font}`; gx.fillStyle = P.muted; gx.textBaseline = 'middle'; gx.fillText('Search your stream', ph * 0.45, ph / 2);
  }, { x: W / 2 - m - qw / 2, y: H / 2 - m - S * 0.035, z: 0.02 });
  const dzBack = (D * 0.85) / past, dzFwd = 0.07 * S;
  const zOf = (i) => (i < past ? -(past - i) * dzBack + dzBack * 0.5 : (i - past + 1) * dzFwd);
  if (d !== 'auto') {
    const top = H / 2 - m * 2 - S * 0.08, avail = top - (-H / 2 + m), nowH = S * 0.05;
    const step = Math.min((avail - nowH) / n, S * (tall ? 0.2 : 0.16)), th = step * 0.86;
    const tw = tall ? 0.74 * W : Math.min(0.6 * W, th * 4.2), tx = tall ? W * 0.1 : 0.04 * W;
    let y = top;
    mods.forEach((mo, i) => {
      if (i === past) { y -= nowH / 2; nowLine(c, 0, y, W - m * 2, nowH); y -= nowH / 2; }
      const fut = i >= past, z = zOf(i);
      y -= step / 2;
      tile(g, c, mo, tx, y, z, tw, th, { style: fut ? 'glass' : 'solid', accent: P.muted });
      text(g, c, fut ? FT[i - past] || 'later' : pts[i] || 'earlier', { size: S * 0.035, color: P.muted, x: tx - tw / 2 - S * 0.03, y, z, align: 'right' });
      y -= step / 2;
    });
    if (past >= n) nowLine(c, 0, y - nowH / 2, W - m * 2, nowH);
  } else {
    const left = -W / 2 + m, avail = W - m * 2, nowW = S * 0.12;
    const step = (avail - nowW) / n, tw = step * 0.9, th = Math.min(H * 0.6, tw * 0.9), y = -0.08 * H;
    let x = left;
    mods.forEach((mo, i) => {
      if (i === past) { x += nowW / 2; nowLineV(c, x, y, th * 1.25, nowW); x += nowW / 2; }
      const fut = i >= past, z = zOf(i);
      x += step / 2;
      tile(g, c, mo, x, y, z, tw, th, { style: fut ? 'glass' : 'solid', accent: P.muted });
      text(g, c, fut ? FT[i - past] || 'later' : pts[i] || 'earlier', { size: S * 0.055, color: P.muted, x, y: y + th / 2 + S * 0.06, z });
      x += step / 2;
    });
  }
};
function nowLine(c, x, y, w, h) {
  box(c.g, w, h * 0.12, h * 0.12, c.P.accent2, x, y, 0, { emissive: 0.6 });
  text(c.g, c, 'NOW', { size: h * 0.55, color: c.P.accent2, x: x - w / 2, y: y + h * 0.45, z: 0.01, align: 'left', weight: 600, spacing: '2px' });
}
function nowLineV(c, x, y, h, w) {
  box(c.g, w * 0.05, h, w * 0.05, c.P.accent2, x, y, 0, { emissive: 0.6 });
  text(c.g, c, 'NOW', { size: w * 0.3, color: c.P.accent2, x, y: y + h / 2 + w * 0.25, z: 0.01, weight: 600 });
}

A.orbit = (c) => {
  const { W, H, P, mods, tall, g, d } = c;
  backdrop(c, (gx, pw, ph) => {
    const gr = gx.createRadialGradient(pw / 2, ph / 2, 0, pw / 2, ph / 2, Math.max(pw, ph) * 0.55);
    gr.addColorStop(0, hex(mix(P.bg, P.accent, 0.2))); gr.addColorStop(1, P.bg);
    gx.fillStyle = gr; gx.fillRect(0, 0, pw, ph);
  });
  const S = Math.min(W, H);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 40, 20), new THREE.MeshLambertMaterial({ color: P.accent, emissive: P.accent, emissiveIntensity: 0.6 }));
  core.position.set(0, 0.06 * S, 0.02 * S);
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.15 * S, 32, 16), new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.15, depthWrite: false }));
  core.add(halo);
  glow(core, c, P.accent, 0.75 * S, 0, 0, -0.02 * S, 0.8);
  text(g, c, ORBIT[d], { size: S * 0.045, color: P.fg, y: -0.09 * S, z: 0.16 * S, weight: 600, maxW: tall ? 0.6 * W : 0.3 * W });
  const ms = mods.slice(0, 6), n = ms.length;
  text(g, c, `${n} agents  ·  ${STAMP[d]}`, { size: S * 0.03, color: P.muted, y: -0.16 * S, z: 0.16 * S });
  const rx = tall ? 0.36 * W : (d === 'auto' ? 0.4 : 0.36) * W, ry = tall ? 0.36 * H : 0.32 * H, rz = 0.3 * S;
  const at = (a, k = 1) => new THREE.Vector3(rx * k * Math.cos(a), ry * k * Math.sin(a), -rz * k * Math.sin(a) + 0.05 * S);
  [1, 0.55].forEach((k) => {
    const pts = []; for (let i = 0; i < 96; i++) pts.push(at((i / 96) * Math.PI * 2, k));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.004 * S, 6, true), new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.55 }));
    g.add(tube);
  });
  const sw = tall ? 0.44 * W : (d === 'auto' ? 0.15 : 0.2) * W, sh = sw * 0.34;
  const sats = ms.map((mo, i) => {
    const pc = Math.round(mo.p * 100);
    const grp = new THREE.Group(); g.add(grp);
    canvasPlane(grp, sw, sh, c.dens, (gx, pw, ph) => {
      const r = c.radius * ph * 0.06;
      gx.fillStyle = P.surface; rrect(gx, 0, 0, pw, ph, r + ph * 0.1); gx.fill();
      gx.strokeStyle = rgba(P.accent, 0.4); gx.lineWidth = Math.max(2, ph * 0.02); gx.stroke();
      const cx = ph / 2, cy = ph / 2, rad = ph * 0.32;
      gx.lineWidth = ph * 0.08;
      gx.strokeStyle = rgba(P.fg, 0.14); gx.beginPath(); gx.arc(cx, cy, rad, 0, Math.PI * 2); gx.stroke();
      gx.strokeStyle = P.accent2; gx.beginPath(); gx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mo.p); gx.stroke();
      gx.fillStyle = P.fg; gx.font = `500 ${ph * 0.2}px ${c.font}`; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText(String(pc), cx, cy);
      gx.textAlign = 'left'; gx.font = `600 ${ph * 0.24}px ${c.font}`;
      gx.fillText(ellipsize(gx, mo.l, pw - ph * 1.1), ph * 0.98, ph * 0.36);
      gx.fillStyle = P.muted; gx.font = `400 ${ph * 0.17}px ${c.font}`;
      gx.fillText(ellipsize(gx, mo.s, pw - ph * 1.1), ph * 0.98, ph * 0.68);
    }, {});
    box(grp, sw * 0.96, sh * 0.9, sh * 0.12, hex(mix(P.surface, '#000', 0.35)), 0, 0, -sh * 0.07);
    return { grp, a0: -Math.PI / 2 + (i * Math.PI * 2) / n };
  });
  const place = (s) => sats.forEach(({ grp, a0 }) => grp.position.copy(at(a0 + s)));
  place(0);
  if (c.motion) c.anim.push((s) => { place(s * 0.12); const k = 1 + Math.sin(s * 1.8) * 0.06; core.scale.setScalar(k); });
  text(g, c, 'Approve  ·  Redirect  ·  Ask', { size: S * 0.03, color: P.muted, y: -H / 2 + S * 0.05, z: 0.02 });
};

// ---------- a device: shadow box, hardware, then the layout inside it ----------

function buildDevice(parent, spec, d, opts) {
  const { W, H, D } = DEV[d];
  const P = spec.palette;
  const g = new THREE.Group();
  parent.add(g);
  const bz = Math.min(W, H) * 0.045, lip = 0.25;
  const hw = HARDWARE;
  box(g, W + bz * 2, bz, D + lip, hw, 0, H / 2 + bz / 2, -D / 2 + lip / 2);
  box(g, W + bz * 2, bz, D + lip, hw, 0, -H / 2 - bz / 2, -D / 2 + lip / 2);
  box(g, bz, H, D + lip, hw, -W / 2 - bz / 2, 0, -D / 2 + lip / 2);
  box(g, bz, H, D + lip, hw, W / 2 + bz / 2, 0, -D / 2 + lip / 2);
  const wall = hex(mix(P.bg, '#000', 0.22)), floorWall = hex(mix(P.bg, '#000', 0.32));
  box(g, W, 0.02, D, floorWall, 0, -H / 2 + 0.01, -D / 2);
  box(g, W, 0.02, D, wall, 0, H / 2 - 0.01, -D / 2);
  box(g, 0.02, H, D, wall, -W / 2 + 0.01, 0, -D / 2);
  box(g, 0.02, H, D, wall, W / 2 - 0.01, 0, -D / 2);
  if (d === 'it') {
    box(g, W * 0.08, H * 0.28, D * 0.4, '#2a2f38', 0, -H / 2 - bz - H * 0.14, -D * 0.6);
    box(g, W * 0.34, H * 0.035, D * 1.6, '#2a2f38', 0, -H / 2 - bz - H * 0.28, -D * 0.6);
  } else if (d === 'auto') {
    box(g, W + bz * 2 + 1, H * 0.22, D + 1.6, '#20242c', 0, -H / 2 - bz - H * 0.11, -D / 2 + 0.4);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(H * 0.2, H * 0.028, 12, 48), new THREE.MeshLambertMaterial({ color: '#2b3039' }));
    wheel.position.set(-W * 0.3, -H / 2 - bz - H * 0.24, D * 0.15 + 0.3);
    wheel.rotation.x = -0.5;
    g.add(wheel);
    box(wheel, H * 0.39, H * 0.045, H * 0.03, '#2b3039', 0, 0, 0);
  } else {
    box(g, W * 0.24, bz * 0.45, 0.12, '#000000', 0, H / 2 + bz / 2, lip + 0.02);
    box(g, bz * 0.3, H * 0.12, 0.5, hw, W / 2 + bz * 1.1, H * 0.2, -D / 2);
  }
  const max = { calm: 4, balanced: 6, dense: 8 }[spec.density] || 6;
  let keys = (spec.modules[d] || []).filter((k) => LIB[d][k]);
  if (keys.length < 3) keys = [...new Set([...keys, ...Object.keys(LIB[d])])].slice(0, 3);
  const cg = new THREE.Group(); // the layout itself; hardware stays in g
  g.add(cg);
  g.userData.content = cg;
  g.userData.D = D;
  const S = Math.min(W, H), light = isLight(P.bg);

  // Motes: soft particles at every depth in the box. On a 3D display they are the cheapest strong
  // depth cue there is: each one sits at its own disparity.
  const N = Math.round(50 + (W * H) / 4);
  const pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W * 0.96;
    pos[i * 3 + 1] = (Math.random() - 0.5) * H * 0.96;
    pos[i * 3 + 2] = -D * 0.95 + Math.random() * (D * 0.95 + 0.12 * S);
    spd[i] = 0.3 + Math.random() * 0.7;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(pg, new THREE.PointsMaterial({
    map: glowTex(), color: P.accent, size: S * 0.022, transparent: true, depthWrite: false,
    opacity: light ? 0.3 : 0.5, blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
  }));
  motes.userData.baseSize = S * 0.012; // device units; frame() turns it into metres (points ignore parent scale)
  g.add(motes);
  // A light in the accent colour that sweeps across the box, so slabs and walls catch moving colour.
  const sweep = new THREE.PointLight(P.accent, light ? 0.5 : 1.1, 0, 0);
  sweep.position.set(0, H * 0.3, 0.2 * S);
  g.add(sweep);
  if (opts.motion) {
    opts.anim.push((s, dt) => {
      for (let i = 0; i < N; i++) {
        let y = pos[i * 3 + 1] + spd[i] * dt * S * 0.03;
        if (y > H * 0.48) y = -H * 0.48;
        pos[i * 3 + 1] = y;
      }
      pg.attributes.position.needsUpdate = true;
      sweep.position.x = Math.sin(s * 0.45) * W * 0.45;
      sweep.position.y = Math.cos(s * 0.31) * H * 0.3;
    });
  }

  const c = {
    g: cg, W, H, D, d, spec, P, motion: opts.motion,
    mods: keys.slice(0, max).map((k) => LIB[d][k]),
    tall: d === 'mobile', font: FONTS[spec.font][1], radius: spec.radius,
    dens: 1400 / Math.max(H, W / 1.6), anim: opts.anim,
  };
  A[spec.archetype](c);
  if (opts.caption) text(g, c, DEV[d].label.toUpperCase(), { size: Math.min(W, H) * 0.05, color: opts.captionColor, x: d === 'it' ? W * 0.32 : d === 'auto' ? W * 0.2 : 0, y: -H / 2 - bz - (d === 'it' ? H * 0.27 : d === 'auto' ? H * 0.3 : H * 0.06), z: 0.5, family: "'IBM Plex Mono', monospace", spacing: '2px' });
  return g;
}

// ---------- the stage ----------

export function createStage({ canvas, cover, host, params = new URLSearchParams(location.search), onMode = () => {} }) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tryWoven = !params.has('mono') && inline3DAvailable();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: tryWoven });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // stage → depthRoot (squashes depth into the budget) → root (devices, fitted to the display)
  const stage = new THREE.Scene();
  const depthRoot = new THREE.Group();
  const root = new THREE.Group();
  stage.add(depthRoot);
  depthRoot.add(root);
  stage.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.4, 0.8, 1);
  stage.add(sun);

  const camDist = VDH / 2 / Math.tan(THREE.MathUtils.degToRad(15));
  const t0 = performance.now();
  const secs = () => (performance.now() - t0) / 1000;
  let bg = '#d5d8df', captionColor = '#566072';
  let depth = Math.min(0.9, Math.max(0.05, Number(params.get('depth')) || 0.45));
  let anim = [], current = null, subjectDepth = 1, woven = false, intro = [], introAt = 0, lastS = 0, fogRange = 0.3;

  function dispose(o) {
    o.traverse((x) => {
      if (x.geometry && !x.geometry.userData.shared) x.geometry.dispose();
      const mats = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : [];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
  }

  function build(withIntro = false) {
    if (!current) return;
    root.children.slice().forEach((ch) => { root.remove(ch); dispose(ch); });
    anim = [];
    intro = [];
    const { spec, dev } = current;
    const devs = dev === 'all' ? ['it', 'auto', 'mobile'] : [dev];
    const motion = spec.motion && !reduceMotion;
    for (const d of devs) {
      const g = buildDevice(root, spec, d, { motion, anim, caption: dev === 'all', captionColor });
      if (dev === 'all') g.position.set(ALL_POS[d][0], ALL_POS[d][1], 0);
      if (withIntro && !reduceMotion) {
        // Panels fly out of the depths to their places, staggered: one orchestrated moment per layout.
        g.userData.content.children.filter((o) => !o.userData.backdrop).forEach((o, i) => {
          intro.push({ o, z: o.position.z, from: o.position.z - g.userData.D * 1.1, delay: i * 0.045 });
          o.position.z -= g.userData.D * 1.1;
        });
      }
    }
    introAt = secs();
    frame();
    // Depth fog in the layout's own background colour: far layers lose contrast, which is also what
    // keeps their crosstalk ghosts faint on a lenticular panel. The glass plane is untouched.
    fogRange = Math.max(0.12, subjectDepth * depthRoot.scale.z * 2.6);
    stage.fog = new THREE.Fog(spec.palette.bg, camDist * 0.995, camDist * 0.995 + fogRange);
  }
  function runIntro(s) {
    if (!intro.length) return;
    const t = s - introAt;
    let live = false;
    for (const it of intro) {
      const k = Math.min(1, Math.max(0, (t - it.delay) / 0.8));
      const e = 1 - Math.pow(1 - k, 3);
      it.o.position.z = it.from + (it.z - it.from) * e;
      if (k < 1) live = true;
    }
    if (!live) intro = [];
  }
  function tick() {
    const s = secs(), dt = Math.min(0.1, s - lastS);
    lastS = s;
    anim.forEach((f) => f(s, dt));
    runIntro(s);
  }

  function aspect() { return canvas.clientWidth / Math.max(1, canvas.clientHeight); }
  function frame() {
    root.position.set(0, 0, 0);
    root.scale.setScalar(1);
    depthRoot.scale.set(1, 1, 1);
    stage.updateMatrixWorld(true); // the whole chain: a stale parent matrix would skew the measurement
    const b = new THREE.Box3().setFromObject(root);
    if (b.isEmpty()) return; // nothing built yet
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
    const s = Math.min((VDH * aspect() * 0.94) / w, (VDH * 0.9) / h);
    root.scale.setScalar(s);
    root.traverse((o) => { if (o.isPoints) o.material.size = o.userData.baseSize * s; });
    root.position.set((-s * (b.min.x + b.max.x)) / 2, (-s * (b.min.y + b.max.y)) / 2, 0); // glass stays at z = 0
    subjectDepth = s * (b.max.z - b.min.z);
    applyDepth();
  }
  function applyDepth() { depthRoot.scale.z = Math.min(1.4, (depth * VDH) / Math.max(1e-6, subjectDepth)); }

  // ----- flat view: one camera, a slow sway, drag to look around -----
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  let drag = null, look = { x: 0, y: 0 }, lookTarget = { x: 0, y: 0 }, running = false, onScreen = true;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lx: lookTarget.x, ly: lookTarget.y }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    lookTarget.x = Math.max(-1, Math.min(1, drag.lx + (e.clientX - drag.x) / (canvas.clientWidth * 0.4)));
    lookTarget.y = Math.max(-1, Math.min(1, drag.ly - (e.clientY - drag.y) / (canvas.clientHeight * 0.5)));
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => { lookTarget = { x: 0, y: 0 }; });

  function resizeFlat() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    cam.aspect = aspect();
    cam.updateProjectionMatrix();
    frame();
  }
  function flatLoop() {
    if (woven || !onScreen) { running = false; return; }
    const s = secs();
    tick();
    look.x += (lookTarget.x - look.x) * 0.12;
    look.y += (lookTarget.y - look.y) * 0.12;
    const sway = reduceMotion || drag ? 0 : 1;
    const ox = (look.x * 0.16 + Math.sin(s * 0.35) * 0.05 * sway) * camDist;
    const oy = (look.y * 0.1 + Math.sin(s * 0.27) * 0.02 * sway) * camDist;
    cam.position.set(ox, oy, Math.sqrt(Math.max(0.01, camDist * camDist - ox * ox - oy * oy)));
    cam.lookAt(0, 0, 0);
    renderer.render(stage, cam);
    requestAnimationFrame(flatLoop);
  }
  function startFlat() {
    resizeFlat();
    if (!running) { running = true; requestAnimationFrame(flatLoop); }
  }

  // ----- woven view: DisplayXR inline-3D display rig -----
  let dxr = null, handle = null, haveGood = false;
  const eyes = [new EyeCamera(THREE), new EyeCamera(THREE)];
  const good = [0, 1].map(() => ({ proj: new Float32Array(16), pose: new Float32Array(16), x: 0, y: 0, width: 0, height: 0 }));
  const ease = new ViewerEase();

  // SBS backing store: two eyes side by side, no wider than the panel, within the GPU's limits.
  const gl = renderer.getContext();
  const maxDim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  function sizeSBS() {
    const dpr = devicePixelRatio || 1, cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    let scale = Math.max(0.5, Math.min(1, (screen.width * dpr) / 2 / (cssW * dpr)));
    let ew = Math.round(cssW * dpr * scale), eh = Math.round(cssH * dpr * scale);
    const k = Math.min(1, maxDim / (ew * 2), maxDim / eh);
    ew = Math.floor(ew * k); eh = Math.floor(eh * k);
    if (canvas.width === ew * 2 && canvas.height === eh) return false; // setSize clears even for equal values
    renderer.setSize(ew * 2, eh, false);
    return true;
  }
  function resizeWoven() { if (sizeSBS()) { frame(); drawGood(); } }

  function drawGood() {
    renderer.clear();
    if (!haveGood) return; // still present a frame: an undrawn canvas can drop out of the weave
    renderer.setScissorTest(true);
    for (let i = 0; i < 2; i++) {
      const g = good[i];
      renderer.setViewport(g.x, g.y, g.width, g.height);
      renderer.setScissor(g.x, g.y, g.width, g.height);
      eyes[i].setFromMatrices(g.proj, g.pose);
      renderer.render(stage, eyes[i].camera);
    }
    renderer.setScissorTest(false);
  }
  function onFrame(views, layer, xrFrame) {
    tick();
    // Validate before clearing: a short view list or a null viewport is the per-frame fallback.
    if (!views || views.length < 2 || !layer) return drawGood();
    const vps = [layer.getViewport(views[0]), layer.getViewport(views[1])];
    if (vps.some((vp) => !vp || vp.width <= 0 || vp.height <= 0)) return drawGood();
    for (let i = 0; i < 2; i++) {
      const g = good[i], vp = vps[i];
      g.proj.set(views[i].projectionMatrix);
      g.pose.set(views[i].transform.matrix);
      g.x = vp.x; g.y = vp.y; g.width = vp.width; g.height = vp.height;
    }
    ease.apply(good, frameTrackingState(xrFrame));
    haveGood = true;
    // Keep the fog starting at the glass for wherever the tracked viewer actually is.
    if (stage.fog) { stage.fog.near = Math.max(0.05, good[0].pose[14]) * 0.995; stage.fog.far = stage.fog.near + fogRange; }
    drawGood();
  }
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  async function startWoven() {
    let w;
    try { w = await createInline3D({ lazy: false }); } catch { return; }
    if (!w.supported) return;
    dxr = w;
    woven = true; // stops the flat loop
    cover.hidden = false; // over the canvas until the first woven frame; a hard cut, never a fade
    onMode('woven');
    renderer.setPixelRatio(1); // getViewport() is already in backing-store pixels
    renderer.autoClear = false;
    renderer.setClearColor(bg, 1); // a transparent woven frame comes out black on the panel
    sizeSBS();
    frame();
    renderer.clear();
    await nextFrame(); await nextFrame(); // settle the canvas before registering it (rule 4)
    handle = dxr.addScene(canvas, onFrame, { virtualDisplayHeight: VDH, rectCover: 'auto', onLayerLost: backToFlat });
    handle.firstWoven.then(() => { cover.hidden = true; });
    addEventListener('pagehide', () => dxr.close());
    // Reading the panels below a short screen: real 2D for sharp text, back to 3D when the stage returns.
    let stereoOn = true;
    new IntersectionObserver(([e]) => {
      const want = e.intersectionRatio >= 0.25;
      if (want === stereoOn) return;
      stereoOn = want;
      dxr.setStereoEnabled(want).catch(() => {});
    }, { threshold: [0, 0.25, 0.5] }).observe(canvas);
  }
  function backToFlat() {
    woven = false;
    haveGood = false;
    cover.hidden = true;
    onMode('flat');
    renderer.autoClear = true;
    startFlat();
  }

  new ResizeObserver(() => (woven ? resizeWoven() : resizeFlat())).observe(canvas);
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && !woven && !running) { running = true; requestAnimationFrame(flatLoop); }
  }).observe(canvas);

  renderer.setClearColor(bg, 1);
  startFlat();
  onMode('flat');
  if (tryWoven) startWoven();

  return {
    show(spec, dev, { intro: withIntro = false } = {}) { current = { spec, dev }; build(withIntro); },
    rebuild() { build(); },
    setDepth(v) { depth = v; applyDepth(); fogRange = Math.max(0.12, subjectDepth * depthRoot.scale.z * 2.6); if (stage.fog) stage.fog.far = stage.fog.near + fogRange; },
    get depth() { return depth; },
    setColors({ background, caption }) {
      bg = background; captionColor = caption;
      renderer.setClearColor(bg, 1);
      build();
    },
    get woven() { return woven; },
  };
}
