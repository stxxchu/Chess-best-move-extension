export const N = 24;
const FEAT = 2 * N * N;
const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';

export function downscale(img, k) {
  if (k <= 1) return img;
  const W = Math.floor(img.width / k), H = Math.floor(img.height / k);
  const src = img.data, sw = img.width, n = k * k;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < k; dy++) {
        let i = ((y * k + dy) * sw + x * k) * 4;
        for (let dx = 0; dx < k; dx++, i += 4) { r += src[i]; g += src[i + 1]; b += src[i + 2]; }
      }
      const o = (y * W + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

export function crop(img, x, y, w, h) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.min(img.width - x, Math.ceil(w)); h = Math.min(img.height - y, Math.ceil(h));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const s = ((y + row) * img.width + x) * 4;
    out.set(img.data.subarray(s, s + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h, ox: x, oy: y };
}

function xScore(data, W, x, y, d) {
  const ia = ((y - d) * W + (x - d)) * 4, ib = ia + 2 * d * 4;
  const ic = ((y + d) * W + (x - d)) * 4, ie = ic + 2 * d * 4;
  const ar = data[ia], ag = data[ia + 1], ab = data[ia + 2];
  const br = data[ib], bg = data[ib + 1], bb = data[ib + 2];
  const cr = data[ic], cg = data[ic + 1], cb = data[ic + 2];
  const er = data[ie], eg = data[ie + 1], eb = data[ie + 2];
  const same = Math.abs(ar - er) + Math.abs(ag - eg) + Math.abs(ab - eb)
             + Math.abs(br - cr) + Math.abs(bg - cg) + Math.abs(bb - cb);
  const dab = Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
  if (dab - same <= 0) return 0;
  const dac = Math.abs(ar - cr) + Math.abs(ag - cg) + Math.abs(ab - cb);
  const deb = Math.abs(er - br) + Math.abs(eg - bg) + Math.abs(eb - bb);
  const dec = Math.abs(er - cr) + Math.abs(eg - cg) + Math.abs(eb - cb);
  return Math.min(dab, dac, deb, dec) - same;
}

function cornerMap(img, d) {
  const { data, width: W, height: H } = img;
  const S = new Float32Array(W * H);
  for (let y = d; y < H - d; y++) {
    for (let x = d; x < W - d; x++) {
      const v = xScore(data, W, x, y, d);
      if (v > 0) S[y * W + x] = v;
    }
  }
  return S;
}

export function findCorners(img, d = 3, T = 40) {
  const W = img.width, H = img.height;
  const S = cornerMap(img, d);
  const r = d + 1, R = 2 * d;
  const pts = [];
  for (let y = R; y < H - R; y++) {
    for (let x = R; x < W - R; x++) {
      const idx = y * W + x, v = S[idx];
      if (v <= T) continue;
      let isMax = true;
      for (let yy = y - r; yy <= y + r && isMax; yy++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          const j = yy * W + xx, u = S[j];
          if (u > v || (u === v && j < idx)) { isMax = false; break; }
        }
      }
      if (!isMax) continue;
      let sw = 0, sx = 0, sy = 0;
      for (let yy = y - R; yy <= y + R; yy++) {
        for (let xx = x - R; xx <= x + R; xx++) {
          const u = S[yy * W + xx];
          if (u > T * 0.5) { sw += u; sx += u * xx; sy += u * yy; }
        }
      }
      pts.push({ x: sx / sw + 0.5, y: sy / sw + 0.5, s: v });
    }
  }
  if (pts.length > 3000) { pts.sort((a, b) => b.s - a.s); pts.length = 3000; }
  return pts;
}

function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
}

function lsq(pairs) {
  let n = 0, si = 0, sv = 0, sii = 0, siv = 0;
  for (const [i, v] of pairs) { n++; si += i; sv += v; sii += i * i; siv += i * v; }
  const den = n * sii - si * si;
  if (n < 2 || den === 0) return null;
  const b = (n * siv - si * sv) / den;
  return { a: (sv - b * si) / n, b };
}

function scoreLattice(pts, xs, x0, y0, sx, sy) {
  const tol = Math.max(2, 0.09 * sx);
  const occ = new Int32Array(225).fill(-1);
  const lo = lowerBound(xs, x0 - 7.5 * sx), hi = lowerBound(xs, x0 + 7.5 * sx);
  for (let b = lo; b < hi; b++) {
    const q = pts[b];
    const i = Math.round((q.x - x0) / sx), j = Math.round((q.y - y0) / sy);
    if (i < -7 || i > 7 || j < -7 || j > 7) continue;
    if (Math.abs(q.x - x0 - i * sx) > tol || Math.abs(q.y - y0 - j * sy) > tol) continue;
    occ[(j + 7) * 15 + i + 7] = b;
  }
  let hits = 0, bi = 0, bj = 0;
  for (let j0 = -6; j0 <= 0; j0++) {
    for (let i0 = -6; i0 <= 0; i0++) {
      let h = 0;
      for (let j = j0; j <= j0 + 6; j++) for (let i = i0; i <= i0 + 6; i++) if (occ[(j + 7) * 15 + i + 7] >= 0) h++;
      if (h > hits) { hits = h; bi = i0; bj = j0; }
    }
  }
  const matched = [];
  for (let j = bj; j <= bj + 6; j++) {
    for (let i = bi; i <= bi + 6; i++) {
      const b = occ[(j + 7) * 15 + i + 7];
      if (b >= 0) matched.push({ i, j, p: pts[b] });
    }
  }
  return { hits, bi, bj, matched };
}

export function fitLattice(pts, W, H, minHits = 16) {
  if (pts.length < minHits) return null;
  pts = pts.slice().sort((a, b) => a.x - b.x);
  const xs = pts.map(p => p.x);
  const smin = 9, smax = Math.min(W, H) / 7;
  const seen = new Set();
  let best = null;
  for (let a = 0; a < pts.length; a++) {
    const p = pts[a];
    let s = 0;
    for (let b = lowerBound(xs, p.x + smin); b < pts.length; b++) {
      const dx = pts[b].x - p.x;
      if (dx > smax) break;
      if (Math.abs(pts[b].y - p.y) <= 2) { s = dx; break; }
    }
    if (!s) continue;
    const key = Math.round(s) + ':' + Math.round(((p.x % s) + s) % s / 2) + ':' + Math.round(((p.y % s) + s) % s / 2);
    if (seen.has(key)) continue;
    seen.add(key);

    let L = scoreLattice(pts, xs, p.x, p.y, s, s);
    if (L.hits < minHits) continue;
    for (let it = 0; it < 2; it++) {
      const fx = lsq(L.matched.map(m => [m.i, m.p.x]));
      const fy = lsq(L.matched.map(m => [m.j, m.p.y]));
      if (!fx || !fy || fx.b < smin || fy.b < smin) break;
      if (Math.abs(fx.b - fy.b) > 0.06 * fx.b) break;
      const L2 = scoreLattice(pts, xs, fx.a, fy.a, fx.b, fy.b);
      L2.fit = { x0: fx.a, y0: fy.a, sx: fx.b, sy: fy.b };
      if (L2.hits < L.hits) break;
      L = L2;
    }
    if (!L.fit) continue;
    const { x0, y0, sx, sy } = L.fit;
    const score = L.hits * Math.sqrt(sx);
    if (!best || score > best.score) {
      best = {
        score, hits: L.hits,
        x: x0 + (L.bi - 1) * sx, y: y0 + (L.bj - 1) * sy,
        w: 8 * sx, h: 8 * sy,
      };
    }
  }
  return best;
}

export function detectBoard(img, region = null) {
  let work = img, ox = 0, oy = 0;
  if (region) {
    const m = 0.08 * Math.max(region.w, region.h);
    work = crop(img, region.x - m, region.y - m, region.w + 2 * m, region.h + 2 * m);
    ox = work.ox; oy = work.oy;
  }
  const k = Math.max(1, Math.floor(Math.max(work.width, work.height) / 1600));
  const small = downscale(work, k);
  const pts = findCorners(small, 3, 40);
  const lat = fitLattice(pts, small.width, small.height);
  if (!lat) return null;
  const rect = { x: lat.x * k + ox, y: lat.y * k + oy, w: lat.w * k, h: lat.h * k, hits: lat.hits };
  if (rect.x < -rect.w * 0.02 || rect.y < -rect.h * 0.02 ||
      rect.x + rect.w > img.width + rect.w * 0.02 || rect.y + rect.h > img.height + rect.h * 0.02) {
    rect.partial = true;
  }
  return rect;
}

export function verifyBoard(img, rect) {
  const s = rect.w / 8, d = Math.max(2, Math.min(4, Math.round(s * 0.05)));
  let hits = 0;
  for (let j = 1; j <= 7; j++) {
    for (let i = 1; i <= 7; i++) {
      const cx = Math.round(rect.x + i * rect.w / 8), cy = Math.round(rect.y + j * rect.h / 8);
      let best = 0;
      for (let y = cy - 2; y <= cy + 1; y++) {
        for (let x = cx - 2; x <= cx + 1; x++) {
          if (x < d || y < d || x >= img.width - d || y >= img.height - d) continue;
          best = Math.max(best, xScore(img.data, img.width, x, y, d));
        }
      }
      if (best > 40) hits++;
    }
  }
  return hits;
}

function median(arr) {
  const a = Float32Array.from(arr).sort();
  return a.length ? a[a.length >> 1] : 0;
}

function sampleSquare(img, x0, y0, w, h) {
  const { data, width: W, height: H } = img;
  const px = (x, y) => {
    const xi = Math.min(W - 1, Math.max(0, Math.floor(x)));
    const yi = Math.min(H - 1, Math.max(0, Math.floor(y)));
    return (yi * W + xi) * 4;
  };

  const R = [], G = [], B = [];
  const a = 0.04, b = 0.12;
  const step = Math.max(1, Math.min(w, h) / 40);
  for (let fy = a; fy < 1 - a; fy += step / h) {
    for (let fx = a; fx < 1 - a; fx += step / w) {
      if (fx > b && fx < 1 - b && fy > b && fy < 1 - b) continue;
      const i = px(x0 + fx * w, y0 + fy * h);
      R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]);
    }
  }
  const bg = [median(R), median(G), median(B)];
  const dev = R.map((r, k) => Math.hypot(r - bg[0], G[k] - bg[1], B[k] - bg[2]));
  const noise = median(dev) * 1.4826;
  const t1 = Math.max(18, 3 * noise), t2 = t1 + 30;

  const f = new Float32Array(FEAT);
  const m = 0.03, cw = (1 - 2 * m) / N;
  let mass = 0, lumMass = 0;
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      let mm = 0, ml = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const i = px(x0 + (m + (cx + 0.25 + 0.5 * sx) * cw) * w, y0 + (m + (cy + 0.25 + 0.5 * sy) * cw) * h);
          const r = data[i], g = data[i + 1], bl = data[i + 2];
          const dist = Math.hypot(r - bg[0], g - bg[1], bl - bg[2]);
          const v = Math.min(1, Math.max(0, (dist - t1) / (t2 - t1)));
          const L = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
          mm += v; ml += v * (2 * L - 1);
        }
      }
      const c = cy * N + cx;
      f[c] = mm / 4; f[N * N + c] = ml / 4;
      mass += mm / 4; lumMass += ml / 4;
    }
  }
  return { f, bg, occ: mass / (N * N), lum: mass > 0.5 ? lumMass / mass : 0 };
}

export function analyzeSquares(img, rect) {
  const sw = rect.w / 8, sh = rect.h / 8;
  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) squares.push(sampleSquare(img, rect.x + c * sw, rect.y + r * sh, sw, sh));
  }
  const pick = (parity, ch) => median(squares.filter((_, i) => ((i >> 3) + (i & 7)) % 2 === parity).map(s => s.bg[ch]));
  const colors = {
    light: [0, 1, 2].map(ch => Math.round(pick(0, ch))),
    dark: [0, 1, 2].map(ch => Math.round(pick(1, ch))),
  };
  return { squares, colors };
}

const OCC = 0.04;

export function looksLikeStart(sq) {
  const occ = sq.squares.map(s => s.occ > OCC);
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, want = r < 2 || r > 5;
    if (occ[i] !== want) return false;
  }
  const lumOf = rows => {
    const v = sq.squares.filter((_, i) => rows.includes(i >> 3)).map(s => s.lum);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  return Math.abs(lumOf([0, 1]) - lumOf([6, 7])) > 0.15;
}

function encode(f) {
  const u = new Uint8Array(FEAT);
  for (let i = 0; i < N * N; i++) u[i] = Math.round(f[i] * 255);
  for (let i = N * N; i < FEAT; i++) u[i] = Math.round((f[i] + 1) * 127.5);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function decode(b64) {
  const s = atob(b64), f = new Float32Array(FEAT);
  for (let i = 0; i < N * N; i++) f[i] = s.charCodeAt(i) / 255;
  for (let i = N * N; i < FEAT; i++) f[i] = s.charCodeAt(i) / 127.5 - 1;
  return f;
}

export function calibrate(sq) {
  if (!looksLikeStart(sq)) return { ok: false, error: 'not-start' };
  const lumOf = rows => sq.squares.filter((_, i) => rows.includes(i >> 3)).reduce((a, s) => a + s.lum, 0) / 16;
  const whiteBottom = lumOf([6, 7]) > lumOf([0, 1]);
  const items = sq.squares.map((s, i) => ({ p: START[whiteBottom ? i : 63 - i], d: encode(s.f) }));
  return { ok: true, templates: { v: 1, n: N, whiteBottom, colors: sq.colors, items, created: Date.now() } };
}

export function loadTemplates(t) {
  if (!t || t.v !== 1 || t.n !== N) return null;
  return t.items.map(it => ({ p: it.p, f: decode(it.d) }));
}

export function teach(t, sq, index, piece, limit = 64) {
  const learned = t.items.filter(it => it.learned).concat({ p: piece, d: encode(sq.squares[index].f), learned: true });
  return { ...t, items: t.items.filter(it => !it.learned).concat(learned.slice(-limit)) };
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < FEAT; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

export const MISMATCH = 25;

export function classify(sq, templates) {
  const grid = [], conf = [];
  let sum = 0, n = 0;
  for (const s of sq.squares) {
    if (s.occ < OCC * 0.5) { grid.push('.'); conf.push(1); continue; }
    const best = new Map();
    for (const t of templates) {
      const d = dist2(s.f, t.f);
      if (!best.has(t.p) || d < best.get(t.p)) best.set(t.p, d);
    }
    const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
    const d1 = ranked[0][1], d2 = ranked.length > 1 ? ranked[1][1] : d1 * 4 + 1;
    grid.push(ranked[0][0]);
    conf.push(Math.max(0, Math.min(1, 1 - Math.sqrt(d1 / (d2 || 1)))));
    if (ranked[0][0] !== '.') { sum += d1; n++; }
  }
  return { grid: grid.join(''), conf, mismatch: n ? (sum / n / FEAT) * 1000 : 0 };
}

export { START };
