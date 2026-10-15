/* 트레이딩 챠트 지표 엔진 — 순수 함수(테스트 가능). data: [{time,open,high,low,close,volume}] */
'use strict';

const C = a => a.map(b => b.close), H = a => a.map(b => b.high), L = a => a.map(b => b.low);
const T = a => a.map(b => b.time), V = a => a.map(b => b.volume);
const TP = a => a.map(b => (b.high + b.low + b.close) / 3);
const MED = a => a.map(b => (b.high + b.low) / 2);

function emaArr(v, n) {
  const k = 2 / (n + 1), out = new Array(v.length).fill(null);
  let e = 0;
  for (let i = 0; i < v.length; i++) {
    e = i === 0 ? v[0] : v[i] * k + e * (1 - k);
    if (i >= n - 1) out[i] = e;
  }
  return out;
}
function smaArr(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
function rmaArr(v, n) {  // Wilder
  const out = new Array(v.length).fill(null);
  let e = NaN;
  for (let i = 0; i < v.length; i++) {
    e = isNaN(e) ? v[i] : (e * (n - 1) + v[i]) / n;
    if (i >= n - 1) out[i] = e;
  }
  return out;
}
function wmaArr(v, n) {
  const out = new Array(v.length).fill(null), d = n * (n + 1) / 2;
  for (let i = n - 1; i < v.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += v[i - j] * (n - j);
    out[i] = s / d;
  }
  return out;
}
function hmaArr(v, n) {
  const h = Math.max(1, Math.round(n / 2)), s = Math.round(Math.sqrt(n));
  const w1 = wmaArr(v, h), w2 = wmaArr(v, n);
  const raw = v.map((_, i) => (w1[i] === null || w2[i] === null) ? null : 2 * w1[i] - w2[i]);
  return wmaArr(raw.map(x => x === null ? NaN : x), s).map((x, i) => (raw[i] === null || isNaN(x)) ? null : x);
}
function linregArr(v, n) {  // LSMA
  const out = new Array(v.length).fill(null);
  const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6;
  for (let i = n - 1; i < v.length; i++) {
    let sy = 0, sxy = 0;
    for (let j = 0; j < n; j++) { sy += v[i - j]; sxy += v[i - j] * (n - 1 - j); }
    out[i] = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  }
  return out;
}
function linSlope(v, n) {
  const out = new Array(v.length).fill(null);
  const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, den = (n * sxx - sx * sx) || 1;
  for (let i = n - 1; i < v.length; i++) {
    let sy = 0, sxy = 0;
    for (let j = 0; j < n; j++) { sy += v[i - j]; sxy += v[i - j] * j; }
    out[i] = (n * sxy - sx * sy) / den;
  }
  return out;
}
function stdevArr(v, n) {
  const out = new Array(v.length).fill(null);
  for (let i = n - 1; i < v.length; i++) {
    const w = v.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n;
    out[i] = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  }
  return out;
}
function highest(v, n) {
  const out = new Array(v.length).fill(null);
  for (let i = 0; i < v.length; i++) {
    if (i >= n - 1) { let m = -Infinity; for (let j = 0; j < n; j++) m = Math.max(m, v[i - j]); out[i] = m; }
  }
  return out;
}
function lowest(v, n) {
  const out = new Array(v.length).fill(null);
  for (let i = 0; i < v.length; i++) {
    if (i >= n - 1) { let m = Infinity; for (let j = 0; j < n; j++) m = Math.min(m, v[i - j]); out[i] = m; }
  }
  return out;
}
function nz(x, d = 0) { return (x === null || x === undefined || isNaN(x)) ? d : x; }
function cl(x, lo, hi) { return x === null ? null : Math.min(hi, Math.max(lo, x)); }
const cl01 = x => cl(x, 0, 100);
function TR(d) {
  return d.map((b, i) => i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - d[i - 1].close), Math.abs(b.low - d[i - 1].close)));
}
function ATR(d, n) { return rmaArr(TR(d), n); }
function RSI(d, n = 14) {
  const c = C(d), out = new Array(c.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = cl01(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = cl01(l === 0 ? 100 : 100 - 100 / (1 + g / l)); }
  }
  return out;
}
function Stoch(d, k = 14, sk = 3, sd = 3) {
  const h = H(d), l = L(d), c = C(d);
  const raw = c.map((_, i) => {
    if (i < k - 1) return null;
    const hh = Math.max(...h.slice(i - k + 1, i + 1)), ll = Math.min(...l.slice(i - k + 1, i + 1));
    return hh === ll ? 50 : 100 * (c[i] - ll) / (hh - ll);
  });
  const K = smaArr(raw.map(x => x ?? 50), sk).map((x, i) => raw[i] === null ? null : cl01(x));
  const D = smaArr(K.map(x => x ?? 50), sd).map((x, i) => K[i] === null ? null : cl01(x));
  return { K, D };
}
function StochRSI(d, rsiLen = 14, stLen = 14, k = 3, sd = 3) {
  const r = RSI(d, rsiLen);
  const raw = r.map((v, i) => {
    if (v === null || i < rsiLen + stLen - 2) return null;
    const w = r.slice(i - stLen + 1, i + 1);
    const hh = Math.max(...w), ll = Math.min(...w);
    return hh === ll ? 50 : 100 * (v - ll) / (hh - ll);
  });
  const K = smaArr(raw.map(x => x ?? 50), k).map((x, i) => raw[i] === null ? null : cl01(x));
  const D = smaArr(K.map(x => x ?? 50), sd).map((x, i) => K[i] === null ? null : cl01(x));
  return { K, D };
}
function ConnorsRSI(d, rsiLen = 3, streakLen = 2, pctLen = 100) {
  const c = C(d), r = RSI(d, rsiLen), out = new Array(c.length).fill(null);
  let streak = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1];
    streak = ch > 0 ? (streak >= 0 ? streak + 1 : 1) : ch < 0 ? (streak <= 0 ? streak - 1 : -1) : streak;
    const rs = RSI(Array.from({ length: Math.min(i + 1, 200) }, (_, k) => ({ close: streak })), streakLen);
    const streakRSI = 100 - 100 / (1 + Math.max(0, streak) / Math.max(1, -Math.min(0, streak)) || 1);
    const from = Math.max(1, i - pctLen + 1);
    const rocs = [];
    for (let j = from; j <= i; j++) rocs.push((c[j] - c[j - 1]) / c[j - 1]);
    const cur = rocs[rocs.length - 1];
    const rank = 100 * rocs.filter(x => x < cur).length / rocs.length;
    if (r[i] !== null) out[i] = cl01((r[i] + Math.min(100, Math.max(0, 50 + streak * 5)) + rank) / 3);
  }
  return out;
}
function MFI(d, n = 14) {
  const tp = TP(d), v = V(d), out = new Array(d.length).fill(null);
  for (let i = n; i < d.length; i++) {
    let pos = 0, neg = 0;
    for (let j = 0; j < n; j++) {
      const k = i - j, f = tp[k] * v[k];
      if (tp[k] > tp[k - 1]) pos += f; else if (tp[k] < tp[k - 1]) neg += f;
    }
    out[i] = cl01(neg === 0 ? 100 : 100 - 100 / (1 + pos / neg));
  }
  return out;
}
function CCI(d, n = 20) {
  const tp = TP(d), m = smaArr(tp, n), out = new Array(d.length).fill(null);
  for (let i = n - 1; i < d.length; i++) {
    let md = 0;
    for (let j = 0; j < n; j++) md += Math.abs(tp[i - j] - m[i]);
    md /= n;
    out[i] = md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md);
  }
  return out;
}
function WilliamsR(d, n = 14) {
  const h = H(d), l = L(d), c = C(d);
  return c.map((_, i) => {
    if (i < n - 1) return null;
    const hh = Math.max(...h.slice(i - n + 1, i + 1)), ll = Math.min(...l.slice(i - n + 1, i + 1));
    return cl(hh === ll ? -50 : (hh - c[i]) / (hh - ll) * -100, -100, 0);
  });
}
function ROC(d, n = 12) {
  const c = C(d);
  return c.map((v, i) => i < n ? null : 100 * (v - c[i - n]) / c[i - n]);
}
function Momentum(d, n = 10) {
  const c = C(d);
  return c.map((v, i) => i < n ? null : v - c[i - n]);
}
function CMO(d, n = 9) {
  const c = C(d), out = new Array(c.length).fill(null);
  for (let i = n; i < c.length; i++) {
    let su = 0, sd = 0;
    for (let j = 0; j < n; j++) {
      const ch = c[i - j] - c[i - j - 1];
      if (ch > 0) su += ch; else sd -= ch;
    }
    out[i] = cl((su + sd) === 0 ? 0 : 100 * (su - sd) / (su + sd), -100, 100);
  }
  return out;
}
function TSI(d, long = 25, short = 13, sig = 13) {
  const c = C(d), m = c.map((v, i) => i === 0 ? 0 : v - c[i - 1]);
  const e1 = emaArr(m, long), e2 = emaArr(e1.map(x => x ?? 0), short);
  const a1 = emaArr(m.map(Math.abs), long), a2 = emaArr(a1.map(x => x ?? 0), short);
  const tsi = e2.map((v, i) => (v === null || !a2[i]) ? null : 100 * v / a2[i]);
  const s = emaArr(tsi.map(x => x ?? 0), sig).map((x, i) => tsi[i] === null ? null : x);
  return { tsi, signal: s };
}
function UO(d, n1 = 7, n2 = 14, n3 = 28) {
  const out = new Array(d.length).fill(null);
  for (let i = n3; i < d.length; i++) {
    const bp = (a, n) => {
      let s1 = 0, s2 = 0;
      for (let j = 0; j < n; j++) {
        const k = i - j;
        s1 += d[k].close - Math.min(d[k].low, d[k - 1].close);
        s2 += Math.max(d[k].high, d[k - 1].close) - Math.min(d[k].low, d[k - 1].close);
      }
      return s2 === 0 ? 0 : s1 / s2;
    };
    out[i] = cl01(100 * (4 * bp(0, n1) + 2 * bp(0, n2) + bp(0, n3)) / 7);
  }
  return out;
}
function AO(d) {
  const m = MED(d);
  const f = smaArr(m, 5), s = smaArr(m, 34);
  return f.map((v, i) => (v === null || s[i] === null) ? null : v - s[i]);
}
function DeMarker(d, n = 13) {
  const out = new Array(d.length).fill(null);
  for (let i = n; i < d.length; i++) {
    let mx = 0, mn = 0;
    for (let j = 0; j < n; j++) {
      const k = i - j;
      mx += Math.max(d[k].high - d[k - 1].high, 0);
      mn += Math.max(d[k - 1].low - d[k].low, 0);
    }
    out[i] = (mx + mn) === 0 ? 0.5 : mx / (mx + mn);
  }
  return out;
}
function RVI(d, n = 10) {  // Relative Vigor Index
  const co = d.map(b => b.close - b.open), hl = d.map(b => b.high - b.low);
  const a = smaArr(co, n), b = smaArr(hl.map(x => x === 0 ? 1e-9 : x), n);
  const rvi = a.map((v, i) => (v === null || b[i] === null) ? null : v / b[i]);
  const s = smaArr(rvi.map(x => x ?? 0), 4).map((x, i) => rvi[i] === null ? null : x);
  return { rvi, signal: s };
}
function RelVolIndex(d, n = 10) {
  const c = C(d), lr = c.map((v, i) => i === 0 ? 0 : Math.log(v / c[i - 1]));
  const a = stdevArr(lr, n), b = stdevArr(lr, n).map((_, i) => a[Math.max(0, i - n)]);
  return a.map((v, i) => (v === null || !b[i]) ? null : v / b[i]);
}
function SchaffTC(d, tc = 10, fast = 23, slow = 50, cycle = 10) {
  const c = C(d);
  const ef = emaArr(c, fast), es = emaArr(c, slow);
  const macd = ef.map((v, i) => (v === null || es[i] === null) ? null : v - es[i]);
  const st = (arr, n) => arr.map((_, i) => {
    const w = [];
    for (let j = 0; j < n && i - j >= 0; j++) if (arr[i - j] !== null) w.push(arr[i - j]);
    if (w.length < n) return null;
    const hh = Math.max(...w), ll = Math.min(...w);
    return hh === ll ? 0 : 100 * (arr[i] - ll) / (hh - ll);
  });
  const f = st(macd, cycle);
  const pf = emaArr(f.map(x => x ?? 50), tc).map((x, i) => f[i] === null ? null : x);
  const pff = st(pf, cycle);
  const s = emaArr(pff.map(x => x ?? 50), tc).map((x, i) => pff[i] === null ? null : cl01(x));
  return s;
}
function Coppock(d, wmaLen = 10, longROC = 14, shortROC = 11) {
  const c = C(d);
  const roc = (n) => c.map((v, i) => i < n ? 0 : 100 * (v - c[i - n]) / c[i - n]);
  const rl = roc(longROC), rs = roc(shortROC);
  return wmaArr(rl.map((v, i) => v + rs[i]), wmaLen);
}
function PGO(d, n = 14, factor = 3) {  // Pretty Good Oscillator
  const c = C(d), m = smaArr(c, n), tr = TR(d), a = smaArr(tr, n);
  return m.map((v, i) => (v === null || !a[i]) ? null : (c[i] - v) / (factor * a[i]));
}
function ForceIndex(d, n = 13) {
  const c = C(d), v = V(d);
  return emaArr(c.map((x, i) => i === 0 ? 0 : v[i] * (x - c[i - 1])), n);
}
function ADL(d) {
  let s = 0;
  return d.map(b => {
    const r = b.high === b.low ? 0 : ((b.close - b.low) - (b.high - b.close)) / (b.high - b.low);
    s += r * b.volume;
    return s;
  });
}
function ChaikinOsc(d, fast = 3, slow = 10) {
  const a = ADL(d);
  const e1 = emaArr(a, fast), e2 = emaArr(a, slow);
  return e1.map((v, i) => (v === null || e2[i] === null) ? null : v - e2[i]);
}
function ChaikinVol(d, n = 10) {
  const e = emaArr(H(d).map((h, i) => h - L(d)[i]), n);
  return e.map((v, i) => (v === null || i < 2 * n || !e[i - n]) ? null : 100 * (v - e[i - n]) / e[i - n]);
}
function Ulcer(d, n = 14) {
  const c = C(d), out = new Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    const mx = Math.max(...c.slice(i - n + 1, i + 1));
    let s = 0;
    for (let j = 0; j < n; j++) s += ((mx - c[i - j]) / mx * 100) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}
function Klinger(d, short = 34, long = 55, sig = 13) {
  const tp = TP(d), v = V(d);
  const trend = tp.map((x, i) => i === 0 ? 1 : x > tp[i - 1] ? 1 : -1);
  const vf = trend.map((t, i) => v[i] * t);
  const k = emaArr(vf, short).map((x, i) => { const y = emaArr(vf, long)[i]; return (x === null || y === null) ? null : x - y; });
  const s = emaArr(k.map(x => x ?? 0), sig).map((x, i) => k[i] === null ? null : x);
  return { k, signal: s };
}
function PVT(d) {
  const c = C(d), v = V(d);
  let s = 0;
  return c.map((x, i) => { if (i > 0 && c[i - 1]) s += (x - c[i - 1]) / c[i - 1] * v[i]; return s; });
}
function CMF(d, n = 20) {
  const out = new Array(d.length).fill(null);
  for (let i = n - 1; i < d.length; i++) {
    let nf = 0, dv = 0;
    for (let j = 0; j < n; j++) {
      const b = d[i - j], r = b.high === b.low ? 0 : ((b.close - b.low) - (b.high - b.close)) / (b.high - b.low);
      nf += r * b.volume; dv += b.volume;
    }
    out[i] = dv === 0 ? 0 : nf / dv;
  }
  return out;
}
function EMV(d, n = 14) {
  const e = d.map((b, i) => {
    if (i === 0) return 0;
    const dm = (b.high + b.low) / 2 - (d[i - 1].high + d[i - 1].low) / 2;
    const br = (b.volume / 1e8) / ((b.high - b.low) || 1e-9);
    return br === 0 ? 0 : dm / br;
  });
  return smaArr(e, n);
}
function NetVol(d) { return d.map(b => (b.close >= b.open ? 1 : -1) * b.volume); }
function VolOsc(d, s = 5, l = 10) {
  const v = V(d), a = smaArr(v, s), b = smaArr(v, l);
  return a.map((x, i) => (x === null || !b[i]) ? null : 100 * (x - b[i]) / b[i]);
}
function OBV(d) {
  const c = C(d), v = V(d);
  let s = 0;
  return c.map((x, i) => { if (i > 0) s += x > c[i - 1] ? v[i] : x < c[i - 1] ? -v[i] : 0; return s; });
}
function Aroon(d, n = 14) {
  const h = H(d), l = L(d), up = [], dn = [];
  for (let i = 0; i < d.length; i++) {
    if (i < n - 1) { up.push(null); dn.push(null); continue; }
    let bh = 0, bl = 0;
    for (let j = 0; j < n; j++) {
      if (h[i - j] >= h[i - bh]) bh = j;
      if (l[i - j] <= l[i - bl]) bl = j;
    }
    // 가장 최근 고점/저점까지 거리: 값이 같은 경우 가장 최근 선택
    let dh = 0, dl = 0;
    for (let j = 0; j < n; j++) {
      if (h[i - j] === Math.max(...h.slice(i - n + 1, i + 1))) { dh = j; break; }
    }
    for (let j = 0; j < n; j++) {
      if (l[i - j] === Math.min(...l.slice(i - n + 1, i + 1))) { dl = j; break; }
    }
    up.push(cl01(100 * (n - dh) / n)); dn.push(cl01(100 * (n - dl) / n));
  }
  return { up, dn };
}
function ADX(d, n = 14) {
  const h = H(d), l = L(d), tr = TR(d);
  const pdm = h.map((x, i) => i === 0 ? 0 : Math.max(x - h[i - 1], 0));
  const mdm = l.map((x, i) => i === 0 ? 0 : Math.max(l[i - 1] - x, 0));
  const str = rmaArr(tr, n), sp = rmaArr(pdm, n), sm = rmaArr(mdm, n);
  const pdi = sp.map((v, i) => !str[i] ? null : cl01(100 * v / str[i]));
  const mdi = sm.map((v, i) => !str[i] ? null : cl01(100 * v / str[i]));
  const dx = pdi.map((v, i) => (v === null || mdi[i] === null || (v + mdi[i]) === 0) ? null : cl01(100 * Math.abs(v - mdi[i]) / (v + mdi[i])));
  const adx = rmaArr(dx.map(x => x ?? 0), n).map((x, i) => dx[i] === null ? null : cl01(x));
  return { adx, pdi, mdi };
}
function Vortex(d, n = 14) {
  const h = H(d), l = L(d), tr = TR(d);
  const str = smaArr(tr, n);
  const sp = [], sm = [];
  for (let i = 0; i < d.length; i++) {
    if (i < n) { sp.push(null); sm.push(null); continue; }
    let a = 0, b = 0;
    for (let j = 0; j < n; j++) { a += Math.abs(h[i - j] - l[i - j - 1]); b += Math.abs(l[i - j] - h[i - j - 1]); }
    sp.push(str[i] ? a / (n * 0 + (function () { let s = 0; for (let k = 0; k < n; k++) s += tr[i - k]; return s / n; })()) : null);
    sm.push(str[i] ? b / (function () { let s = 0; for (let k = 0; k < n; k++) s += tr[i - k]; return s / n; })() : null);
  }
  return { plus: sp, minus: sm };
}
function KST(d, r1 = 10, r2 = 15, r3 = 20, r4 = 30, a1 = 10, a2 = 10, a3 = 10, a4 = 15, sig = 9) {
  const c = C(d);
  const roc = n => c.map((v, i) => i < n ? 0 : (v - c[i - n]) / c[i - n]);
  const k = roc(r1).map((v, i) => v + 0 * i);
  const sum = k.map((_, i) => smaArr(roc(r1), a1)[i] * 1 + smaArr(roc(r2), a2)[i] * 2 + smaArr(roc(r3), a3)[i] * 3 + smaArr(roc(r4), a4)[i] * 4);
  const s = smaArr(sum, sig);
  return { kst: sum, signal: s };
}
function MACD(d, f = 12, s = 26, sig = 9) {
  const c = C(d);
  const ef = emaArr(c, f), es = emaArr(c, s);
  const m = ef.map((v, i) => (v === null || es[i] === null) ? null : v - es[i]);
  const g = emaArr(m.map(x => x ?? 0), sig).map((x, i) => m[i] === null ? null : x);
  const h = m.map((v, i) => (v === null || g[i] === null) ? null : v - g[i]);
  return { macd: m, signal: g, hist: h };
}
function BB(d, n = 20, m = 2) {
  const c = C(d), mid = smaArr(c, n), sd = stdevArr(c, n);
  return {
    mid, upper: mid.map((v, i) => (v === null || sd[i] === null) ? null : v + m * sd[i]),
    lower: mid.map((v, i) => (v === null || sd[i] === null) ? null : v - m * sd[i])
  };
}
function PctB(d, n = 20, m = 2) {
  const b = BB(d, n, m), c = C(d);
  return b.upper.map((u, i) => (u === null || b.lower[i] === null || u === b.lower[i]) ? null : (c[i] - b.lower[i]) / (u - b.lower[i]));
}
function Keltner(d, n = 20, mult = 1) {
  const c = C(d), mid = emaArr(c, n), a = ATR(d, n);
  return {
    mid, upper: mid.map((v, i) => (v === null || a[i] === null) ? null : v + mult * a[i]),
    lower: mid.map((v, i) => (v === null || a[i] === null) ? null : v - mult * a[i])
  };
}
function Donchian(d, n = 20) {
  const h = H(d), l = L(d);
  const up = highest(h, n), lo = lowest(l, n);
  return { upper: up, lower: lo, mid: up.map((v, i) => (v === null || lo[i] === null) ? null : (v + lo[i]) / 2) };
}
function Envelopes(d, n = 20, pct = 2.5) {
  const m = smaArr(C(d), n);
  return {
    mid: m,
    upper: m.map(v => v === null ? null : v * (1 + pct / 100)),
    lower: m.map(v => v === null ? null : v * (1 - pct / 100))
  };
}
function Supertrend(d, n = 10, mult = 3) {
  const h = H(d), l = L(d), c = C(d), a = ATR(d, n);
  const dir = new Array(c.length).fill(1), st = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    if (a[i] === null) continue;
    const basicUp = (h[i] + l[i]) / 2 - mult * a[i];
    const basicDn = (h[i] + l[i]) / 2 + mult * a[i];
    let up = basicUp, dn = basicDn;
    if (i > 0 && st[i - 1] !== null) {
      up = (c[i - 1] > st[i - 1]) ? Math.max(basicUp, st[i - 1] === null ? basicUp : (dir[i - 1] === 1 ? Math.max(basicUp, prevUp(i)) : basicUp)) : basicUp;
      dn = (c[i - 1] < st[i - 1]) ? Math.min(basicDn, dir[i - 1] === -1 ? Math.min(basicDn, prevDn(i)) : basicDn) : basicDn;
    }
    dir[i] = i === 0 || st[i - 1] === null ? 1 : (c[i] > dn ? 1 : c[i] < up ? -1 : dir[i - 1]);
    st[i] = dir[i] === 1 ? up : dn;
  }
  function prevUp(i) { for (let k = i - 1; k >= 0; k--) if (st[k] !== null && dir[k] === 1) return st[k]; return -Infinity; }
  function prevDn(i) { for (let k = i - 1; k >= 0; k--) if (st[k] !== null && dir[k] === -1) return st[k]; return Infinity; }
  return { line: st, dir };
}
function SAR(d, start = 0.02, inc = 0.02, max = 0.2) {
  const h = H(d), l = L(d), out = new Array(d.length).fill(null);
  let bull = true, af = start, ep = h[0], sar = l[0];
  for (let i = 1; i < d.length; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      if (l[i] < sar) { bull = false; sar = ep; af = start; ep = l[i]; }
      else { if (h[i] > ep) { ep = h[i]; af = Math.min(af + inc, max); } sar = Math.min(sar, l[i - 1], l[i]); }
    } else {
      if (h[i] > sar) { bull = true; sar = ep; af = start; ep = h[i]; }
      else { if (l[i] < ep) { ep = l[i]; af = Math.min(af + inc, max); } sar = Math.max(sar, h[i - 1], h[i]); }
    }
    out[i] = sar;
  }
  return out;
}
function Ichimoku(d, conv = 9, base = 26, spanB = 52, disp = 26) {
  const h = H(d), l = L(d);
  const mid = n => h.map((_, i) => {
    if (i < n - 1) return null;
    return (Math.max(...h.slice(i - n + 1, i + 1)) + Math.min(...l.slice(i - n + 1, i + 1))) / 2;
  });
  const ten = mid(conv), kij = mid(base), spB = mid(spanB);
  const shift = (arr, n) => {
    const o = new Array(arr.length).fill(null);
    arr.forEach((v, i) => { if (v !== null && i + n >= 0 && i + n < o.length) o[i + n] = v; });
    return o;
  };
  const spAraw = ten.map((v, i) => (v === null || kij[i] === null) ? null : (v + kij[i]) / 2);
  return { tenkan: ten, kijun: kij, senkouA: shift(spAraw, disp), senkouB: shift(spB, disp), chikou: shift(C(d), -disp) };
}
function VWAP(d) {
  let pv = 0, vv = 0;
  return d.map(b => {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume; vv += b.volume;
    return vv === 0 ? null : pv / vv;
  });
}
function VWMA(d, n = 20) {
  const c = C(d), v = V(d), out = new Array(c.length).fill(null);
  for (let i = n - 1; i < c.length; i++) {
    let p = 0, s = 0;
    for (let j = 0; j < n; j++) { p += c[i - j] * v[i - j]; s += v[i - j]; }
    out[i] = s === 0 ? null : p / s;
  }
  return out;
}
function KAMA(d, n = 10, fast = 2, slow = 30) {
  const c = C(d), out = new Array(c.length).fill(null);
  const fs = 2 / (fast + 1), ss = 2 / (slow + 1);
  let k = c[0];
  for (let i = 0; i < c.length; i++) {
    if (i < n) continue;
    const change = Math.abs(c[i] - c[i - n]);
    let vol = 0;
    for (let j = 0; j < n; j++) vol += Math.abs(c[i - j] - c[i - j - 1]);
    const er = vol === 0 ? 0 : change / vol;
    const sc = (er * (fs - ss) + ss) ** 2;
    k = k + sc * (c[i] - k);
    out[i] = k;
  }
  return out;
}
function McGinley(d, n = 14) {
  const c = C(d), out = new Array(c.length).fill(null);
  let md = c[0] || 1;
  for (let i = 0; i < c.length; i++) {
    md = i === 0 ? c[0] : md + (c[i] - md) / (n * Math.pow(c[i] / md, 4) || 1);
    if (i >= n - 1) out[i] = md;
  }
  return out;
}
function ALMA(d, n = 9, offset = 0.85, sigma = 6) {
  const c = C(d), out = new Array(c.length).fill(null);
  const m = offset * (n - 1), s = n / sigma;
  let den = 0;
  const w = [];
  for (let i = 0; i < n; i++) { const x = Math.exp(-((i - m) ** 2) / (2 * s * s)); w.push(x); den += x; }
  for (let i = n - 1; i < c.length; i++) {
    let v = 0;
    for (let j = 0; j < n; j++) v += c[i - j] * w[j];
    out[i] = v / den;
  }
  return out;
}
function VIDYA(d, n = 14) {
  const c = C(d);
  const cmo = CMO(d, n).map(x => x ?? 0);
  const k = cmo.map(x => Math.abs(x) / 100);
  let v = c[0];
  return c.map((x, i) => {
    if (i === 0) return null;
    v = x * k[i] + v * (1 - k[i]);
    return i >= n - 1 ? v : null;
  });
}
function T3(d, n = 5, vfactor = 0.7) {
  const c = C(d);
  const e = x => emaArr(x, n);
  const e1 = e(c), e2 = e(e1.map(x => x ?? c[0])), e3 = e(e2.map(x => x ?? c[0])),
    e4 = e(e3.map(x => x ?? c[0])), e5 = e(e4.map(x => x ?? c[0])), e6 = e(e5.map(x => x ?? c[0]));
  const a = vfactor;
  return e6.map((_, i) => {
    const c1 = -(a ** 3), c2 = 3 * a ** 2 + 3 * a ** 3, c3 = -6 * a ** 2 - 3 * a - 3 * a ** 3, c4 = 1 + 3 * a + a ** 3 + 3 * a ** 2;
    const vals = [e6[i], e5[i], e4[i], e3[i]];
    if (vals.some(x => x === null)) return null;
    return c1 * vals[0] + c2 * vals[1] + c3 * vals[2] + c4 * vals[3];
  });
}
function ZLEMA(d, n = 14) {
  const c = C(d), lag = Math.floor((n - 1) / 2);
  const adj = c.map((x, i) => x + (x - (c[Math.max(0, i - lag)] ?? x)));
  return emaArr(adj, n);
}
function DEMA(d, n = 14) {
  const c = C(d);
  const e1 = emaArr(c, n), e2 = emaArr(e1.map(x => x ?? 0), n);
  return e1.map((v, i) => (v === null || e2[i] === null) ? null : 2 * v - e2[i]);
}
function TEMA(d, n = 14) {
  const c = C(d);
  const e1 = emaArr(c, n), e2 = emaArr(e1.map(x => x ?? 0), n), e3 = emaArr(e2.map(x => x ?? 0), n);
  return e1.map((v, i) => (v === null || e2[i] === null || e3[i] === null) ? null : 3 * v - 3 * e2[i] + e3[i]);
}
function TRIX(d, n = 18) {
  const c = C(d);
  const e1 = emaArr(c, n), e2 = emaArr(e1.map(x => x ?? 0), n), e3 = emaArr(e2.map(x => x ?? 0), n);
  return e3.map((v, i) => (v === null || i === 0 || !e3[i - 1]) ? null : 100 * (v - e3[i - 1]) / e3[i - 1]);
}
function Alligator(d, jawLen = 13, jawOff = 8, teethLen = 8, teethOff = 5, lipsLen = 5, lipsOff = 3) {
  const m = MED(d);
  const sm = (v, n) => {
    const out = new Array(v.length).fill(null);
    let s = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < v.length; i++) {
      if (i < n - 1) continue;
      if (i === n - 1) { out[i] = s; continue; }
      s = (s * (n - 1) + v[i]) / n;
      out[i] = s;
    }
    return out;
  };
  const sh = (arr, n) => { const o = new Array(arr.length).fill(null); arr.forEach((v, i) => { if (v !== null && i + n < o.length) o[i + n] = v; }); return o; };
  return { jaw: sh(sm(m, jawLen), jawOff), teeth: sh(sm(m, teethLen), teethOff), lips: sh(sm(m, lipsLen), lipsOff) };
}
function Gator(d) {
  const g = Alligator(d);
  const up = g.jaw.map((v, i) => (v === null || g.teeth[i] === null) ? null : Math.abs(v - g.teeth[i]));
  const lo = g.teeth.map((v, i) => (v === null || g.lips[i] === null) ? null : -Math.abs(v - g.lips[i]));
  return { upper: up, lower: lo };
}
function BWMFI(d) {
  return d.map(b => (b.high - b.low) === 0 ? 0 : (b.high - b.low) / Math.max(1, b.volume));
}
function Fractals(d, n = 2) {
  const h = H(d), l = L(d), up = [], dn = [];
  for (let i = 0; i < d.length; i++) {
    up.push(null); dn.push(null);
    if (i < n || i + n >= d.length) continue;
    let isUp = true, isDn = true;
    for (let j = 1; j <= n; j++) {
      if (h[i] <= h[i - j] || h[i] < h[i + j]) isUp = false;
      if (l[i] >= l[i - j] || l[i] > l[i + j]) isDn = false;
    }
    if (isUp) up[i] = h[i];
    if (isDn) dn[i] = l[i];
  }
  return { up, dn };
}
function ZigZag(d, devPct = 5) {
  const h = H(d), l = L(d), c = C(d);
  const piv = [];
  let dir = 0, ph = h[0], pl = l[0], phi = 0, pli = 0;
  for (let i = 1; i < d.length; i++) {
    if (dir >= 0) {
      if (h[i] > ph) { ph = h[i]; phi = i; }
      if ((ph - l[i]) / ph * 100 >= devPct) { piv.push({ i: phi, v: ph }); dir = -1; pl = l[i]; pli = i; }
    }
    if (dir <= 0) {
      if (l[i] < pl) { pl = l[i]; pli = i; }
      if ((h[i] - pl) / pl * 100 >= devPct) { piv.push({ i: pli, v: pl }); dir = 1; ph = h[i]; phi = i; }
    }
  }
  const line = new Array(d.length).fill(null);
  for (let k = 0; k + 1 < piv.length; k++) {
    const a = piv[k], b = piv[k + 1];
    for (let i = a.i; i <= b.i; i++) line[i] = a.v + (b.v - a.v) * (i - a.i) / Math.max(1, b.i - a.i);
  }
  return line;
}
function pivotLevels(Hp, Lp, Cp, type) {
  const P = (Hp + Lp + Cp) / 3, R = Hp - Lp;
  const fib = { P, R1: P + 0.382 * R, S1: P - 0.382 * R, R2: P + 0.618 * R, S2: P - 0.618 * R, R3: P + R, S3: P - R };
  const std = { P, R1: 2 * P - Lp, S1: 2 * P - Hp, R2: P + R, S2: P - R, R3: Hp + 2 * (P - Lp), S3: Lp - 2 * (Hp - P) };
  const woodie = (() => {
    const Q = (Hp + Lp + 2 * Cp) / 4;
    return { P: Q, R1: 2 * Q - Lp, S1: 2 * Q - Hp, R2: Q + R, S2: Q - R, R3: Hp + 2 * (Q - Lp), S3: Lp - 2 * (Hp - Q) };
  })();
  const demark = (() => {
    let X;
    if (Cp < (Hp + Lp) / 2 + 0) X = Hp + 2 * Lp + Cp; else if (Cp > (Hp + Lp) / 2) X = 2 * Hp + Lp + Cp; else X = Hp + Lp + 2 * Cp;
    void X;
    const Xd = Cp < (Hp + Lp) / 2 ? Hp + 2 * Lp + Cp : Cp > (Hp + Lp) / 2 ? 2 * Hp + Lp + Cp : Hp + Lp + 2 * Cp;
    return { P: null, R1: Xd / 2 - Lp, S1: Xd / 2 - Hp };
  })();
  const camarilla = { P: null, R1: Cp + R * 1.1 / 12, S1: Cp - R * 1.1 / 12, R2: Cp + R * 1.1 / 6, S2: Cp - R * 1.1 / 6, R3: Cp + R * 1.1 / 4, S3: Cp - R * 1.1 / 4, R4: Cp + R * 1.1 / 2, S4: Cp - R * 1.1 / 2 };
  return { fib, std, woodie, demark, camarilla }[type];
}
function CandlePatterns(d) {
  const out = [];
  const body = i => Math.abs(d[i].close - d[i].open);
  const range = i => d[i].high - d[i].low || 1e-9;
  for (let i = 1; i < d.length; i++) {
    const b = d[i], p = d[i - 1], bull = b.close > b.open;
    if (body(i) / range(i) < 0.1) out.push({ i, name: '도지', pos: 'above' });
    const lowerW = Math.min(b.open, b.close) - b.low, upperW = b.high - Math.max(b.open, b.close);
    if (bull && lowerW > 2 * body(i) && upperW < body(i)) out.push({ i, name: '망치형', pos: 'below' });
    if (!bull && upperW > 2 * body(i) && lowerW < body(i)) out.push({ i, name: '역망치/유성형', pos: 'above' });
    if (!bull && p.close < p.open === false && b.close > p.open && b.open < p.close) out.push({ i, name: '상승장악형', pos: 'below' });
    if (bull === false && false) void 0;
    if (p.close > p.open && !bull && b.open > p.close && b.close < p.open) out.push({ i, name: '하락장악형', pos: 'above' });
    if (i >= 2) {
      const a = d[i - 2];
      const downTrend = a.close < a.open && p.close < p.open;
      const upTrend = a.close > a.open && p.close > p.open;
      if (downTrend && body(i - 1) / range(i - 1) < 0.3 && bull && b.close > (a.open + a.close) / 2) out.push({ i, name: '샛별형', pos: 'below' });
      if (upTrend && body(i - 1) / range(i - 1) < 0.3 && !bull && b.close < (a.open + a.close) / 2) out.push({ i, name: '석별형', pos: 'above' });
    }
  }
  return out;
}
function VProfile(d, rows = 24, vaPct = 0.7) {
  const h = Math.max(...H(d)), l = Math.min(...L(d));
  if (!(h > l)) return { poc: null, vah: null, val: null, bins: [] };
  const bins = new Array(rows).fill(0);
  for (const b of d) {
    const idx = Math.min(rows - 1, Math.floor((b.close - l) / (h - l) * rows));
    bins[idx] += b.volume;
  }
  let pocIdx = 0;
  bins.forEach((v, i) => { if (v > bins[pocIdx]) pocIdx = i; });
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  let acc = bins[pocIdx], up = pocIdx, dn = pocIdx;
  while (acc / total < vaPct && (up < rows - 1 || dn > 0)) {
    const upV = up < rows - 1 ? bins[up + 1] : -1, dnV = dn > 0 ? bins[dn - 1] : -1;
    if (upV >= dnV) { up++; acc += Math.max(0, upV); } else { dn--; acc += Math.max(0, dnV); }
  }
  const px = i => l + (h - l) * (i + 0.5) / rows;
  return { poc: px(pocIdx), vah: px(up), val: px(dn), bins, lo: l, hi: h };
}

/* 전략 신호: 각 함수는 'BUY' | 'SELL' | null 배열 반환 */
const Strat = {
  emaCross: d => sigCross(emaArr(C(d), 9), emaArr(C(d), 21)),
  maCross: d => sigCross(smaArr(C(d), 50), smaArr(C(d), 200)),
  macd: d => {
    const m = MACD(d);
    return sigCross(m.macd, m.signal);
  },
  rsi: d => {
    const r = RSI(d, 14), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (r[i - 1] === null || r[i] === null) continue;
      if (r[i - 1] <= 30 && r[i] > 30) out[i] = 'BUY';
      if (r[i - 1] >= 70 && r[i] < 70) out[i] = 'SELL';
    }
    return out;
  },
  supertrend: d => {
    const s = Supertrend(d), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (s.dir[i - 1] === null || s.dir[i] === null) continue;
      if (s.dir[i - 1] === -1 && s.dir[i] === 1) out[i] = 'BUY';
      if (s.dir[i - 1] === 1 && s.dir[i] === -1) out[i] = 'SELL';
    }
    return out;
  },
  sar: d => {
    const c = C(d), s = SAR(d), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (s[i - 1] === null || s[i] === null) continue;
      if (c[i - 1] < s[i - 1] && c[i] > s[i]) out[i] = 'BUY';
      if (c[i - 1] > s[i - 1] && c[i] < s[i]) out[i] = 'SELL';
    }
    return out;
  },
  bb: d => {
    const b = BB(d), c = C(d), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (!b.lower[i - 1]) continue;
      if (c[i - 1] < b.lower[i - 1] && c[i] > b.lower[i]) out[i] = 'BUY';
      if (c[i - 1] > b.upper[i - 1] && c[i] < b.upper[i]) out[i] = 'SELL';
    }
    return out;
  },
  stoch: d => {
    const s = Stoch(d), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (s.K[i - 1] === null || s.K[i] === null) continue;
      if (s.K[i - 1] < s.D[i - 1] && s.K[i] > s.D[i] && s.K[i] < 30) out[i] = 'BUY';
      if (s.K[i - 1] > s.D[i - 1] && s.K[i] < s.D[i] && s.K[i] > 70) out[i] = 'SELL';
    }
    return out;
  },
  atrStop: d => {
    const s = Supertrend(d, 10, 3), out = new Array(d.length).fill(null);
    for (let i = 1; i < d.length; i++) {
      if (s.dir[i - 1] === null || s.dir[i] === null) continue;
      if (s.dir[i - 1] === -1 && s.dir[i] === 1) out[i] = 'BUY';
      if (s.dir[i - 1] === 1 && s.dir[i] === -1) out[i] = 'SELL';
    }
    return out;
  }
};
function sigCross(a, b) {
  const out = new Array(a.length).fill(null);
  for (let i = 1; i < a.length; i++) {
    if (a[i - 1] === null || b[i - 1] === null || a[i] === null || b[i] === null) continue;
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) out[i] = 'BUY';
    if (a[i - 1] >= b[i - 1] && a[i] < b[i]) out[i] = 'SELL';
  }
  return out;
}
function backtest(d, sig) {
  const c = C(d);
  let pos = null, wins = 0, n = 0, eq = 1;
  for (let i = 0; i < d.length; i++) {
    if (sig[i] === 'BUY' && pos === null) pos = c[i];
    else if (sig[i] === 'SELL' && pos !== null) {
      const r = c[i] / pos;
      eq *= r; n++;
      if (r > 1) wins++;
      pos = null;
    }
  }
  if (pos !== null && c.length) { const r = c[c.length - 1] / pos; eq *= r; n++; if (r > 1) wins++; }
  return { trades: n, winRate: n ? 100 * wins / n : 0, totalReturn: (eq - 1) * 100 };
}
function compareStrategies(d) {
  // 정확도(승률) 우선, 거래 3회 미만은 감점. 동점은 수익률로 결정
  const rows = [];
  for (const [id, fn] of Object.entries(Strat)) {
    const sig = fn(d);
    const bt = backtest(d, sig);
    let lastSig = null, barsAgo = -1;
    for (let i = sig.length - 1; i >= 0; i--) {
      if (sig[i] !== null) { lastSig = sig[i]; barsAgo = sig.length - 1 - i; break; }
    }
    const eligible = bt.trades >= 3;
    const score = (eligible ? bt.winRate : bt.winRate * bt.trades / 3) + bt.totalReturn / 1000;
    rows.push({ id, trades: bt.trades, winRate: bt.winRate, totalReturn: bt.totalReturn, lastSig, barsAgo, eligible, score });
  }
  rows.sort((a, b) => b.score - a.score || b.totalReturn - a.totalReturn);
  return { rows, best: rows[0] ? rows[0].id : null };
}
function aggregateHistory(hist) {
  const m = {};
  for (const h of hist) {
    for (const r of (h.rows || [])) {
      const e = m[r.id] || (m[r.id] = { id: r.id, runs: 0, wrSum: 0, trades: 0, retSum: 0, lastWr: 0 });
      e.runs++; e.wrSum += r.winRate; e.trades += r.trades; e.retSum += r.totalReturn; e.lastWr = r.winRate;
    }
  }
  const perf = Object.values(m).map(e => ({ id: e.id, runs: e.runs, trades: e.trades, avgWr: e.wrSum / e.runs, avgRet: e.retSum / e.runs, lastWr: e.lastWr }));
  perf.sort((a, b) => b.avgWr - a.avgWr || b.avgRet - a.avgRet);
  return { perf, best: perf.length ? perf[0].id : null };
}

function swingPoints(data, lo, hi, order = 3) {
  const h = H(data), l = L(data), ups = [], dns = [];
  for (let i = Math.max(lo + order, 0); i <= Math.min(hi - order, data.length - 1); i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= order; j++) {
      if (h[i] < h[i - j] || h[i] < h[i + j]) isH = false;
      if (l[i] > l[i - j] || l[i] > l[i + j]) isL = false;
    }
    if (isH) ups.push(i);
    if (isL) dns.push(i);
  }
  return { ups, dns };
}
function linFit(idx, vals) {
  const n = idx.length;
  if (n < 2) return null;
  const mx = idx.reduce((a, b) => a + b, 0) / n, my = vals.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let k = 0; k < n; k++) { sxy += (idx[k] - mx) * (vals[k] - my); sxx += (idx[k] - mx) ** 2; }
  if (sxx === 0) return null;
  const a = sxy / sxx;
  return { a, b: my - a * mx };
}
function nextBizDates(lastTime, n, weekends, stepSec) {
  if (typeof lastTime === 'number') {
    const out = [];
    for (let k = 1; k <= n; k++) out.push(lastTime + (stepSec || 60) * k);
    return out;
  }
  const out = [];
  const dt = new Date(lastTime + 'T00:00:00');
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  while (out.length < n) {
    dt.setDate(dt.getDate() + 1);
    if (!weekends && (dt.getDay() === 0 || dt.getDay() === 6)) continue;
    out.push(key(dt));
  }
  return out;
}
function autoLevels(data, endIdx, weekends = false, stepSec = 60) {
  const hi = Math.min(endIdx, data.length - 1);
  const lo = Math.max(0, hi - 119);
  const { ups, dns } = swingPoints(data, lo, hi, 3);
  const val = (arr, i) => arr[i];
  const fitLine = (idxs, prices) => {
    const use = idxs.slice(-4);
    if (use.length < 2) return [];
    const f = linFit(use, use.map(i => prices[i]));
    if (!f) return [];
    const fut = nextBizDates(data[hi].time, 30, weekends, stepSec);
    const times = [];
    for (let i = use[0]; i <= hi; i++) times.push(data[i].time);
    const all = times.concat(fut);
    const x0 = use[0];
    return all.map((t, k) => ({ time: t, value: f.a * (x0 + k) + f.b }));
  };
  const supLine = fitLine(dns, L(data));
  const resLine = fitLine(ups, H(data));
  const atrArr = ATR(data, 14);
  const atr = atrArr[hi] || (data[hi].high - data[hi].low) || 1;
  const tol = atr * 0.5, close = data[hi].close;
  const ptsAll = [
    ...ups.map(i => ({ p: H(data)[i], side: 1 })),
    ...dns.map(i => ({ p: L(data)[i], side: -1 }))
  ];
  const clusters = [];
  for (const q of ptsAll) {
    const c = clusters.find(c => Math.abs(c.p - q.p) <= tol);
    if (c) { c.n++; c.p = (c.p * (c.n - 1) + q.p) / c.n; }
    else clusters.push({ p: q.p, n: 1 });
  }
  clusters.sort((a, b) => b.n - a.n || Math.abs(a.p - close) - Math.abs(b.p - close));
  const supports = clusters.filter(c => c.p < close).slice(0, 3);
  const resistances = clusters.filter(c => c.p > close).slice(0, 3);
  return { supLine, resLine, supports, resistances };
}

/* 방향 신호: +1 매수우위, -1 매도우위, 0 중립 (막대별) */
function trendVs(c, m) { return m.map((v, i) => v === null ? 0 : c[i] > v ? 1 : c[i] < v ? -1 : 0); }
function dirSeries(id, d) {
  const n = d.length, z = () => new Array(n).fill(0);
  const C_ = C(d);
  const sgn = (v, up, dn) => v === null ? 0 : v >= up ? 1 : v <= dn ? -1 : 0;
  switch (id) {
    case 'rsi14': { const r = RSI(d, 14); return r.map(v => sgn(v, 55, 45)); }
    case 'stoch': { const s = Stoch(d); return s.K.map((v, i) => (v === null || s.D[i] === null) ? 0 : v > s.D[i] && v < 80 ? 1 : v < s.D[i] && v > 20 ? -1 : 0); }
    case 'stochrsi': { const s = StochRSI(d); return s.K.map((v, i) => (v === null || s.D[i] === null) ? 0 : v > s.D[i] && v < 80 ? 1 : v < s.D[i] && v > 20 ? -1 : 0); }
    case 'connors': { const c = ConnorsRSI(d); return c.map(v => sgn(v, 60, 40)); }
    case 'mfi14': { const m = MFI(d, 14); return m.map(v => sgn(v, 55, 45)); }
    case 'cci20': { const c = CCI(d, 20); return c.map(v => sgn(v, 100, -100)); }
    case 'willr14': { const w = WilliamsR(d, 14); return w.map(v => sgn(v, -20, -80)); }
    case 'roc12': { const r = ROC(d, 12); return r.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'mom10': { const m = Momentum(d, 10); return m.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'cmo9': { const c = CMO(d, 9); return c.map(v => sgn(v, 20, -20)); }
    case 'tsi': { const t = TSI(d); return t.tsi.map((v, i) => (v === null || t.signal[i] === null) ? 0 : v > t.signal[i] ? 1 : v < t.signal[i] ? -1 : 0); }
    case 'uo': { const u = UO(d); return u.map(v => sgn(v, 60, 40)); }
    case 'ao': { const a = AO(d); return a.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'demarker13': { const x = DeMarker(d, 13); return x.map(v => sgn(v, 0.6, 0.4)); }
    case 'rvi': { const r = RVI(d); return r.rvi.map((v, i) => (v === null || r.signal[i] === null) ? 0 : v > r.signal[i] ? 1 : v < r.signal[i] ? -1 : 0); }
    case 'schaff': { const s = SchaffTC(d); return s.map(v => sgn(v, 75, 25)); }
    case 'coppock': { const c = Coppock(d); return c.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'pgo': { const p = PGO(d); return p.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'force13': { const f = ForceIndex(d, 13); return f.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'chaikinosc': { const c = ChaikinOsc(d); return c.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'macd': { const m = MACD(d); return m.hist.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'adx': { const a = ADX(d); return a.adx.map((v, i) => (v === null || v < 20) ? 0 : a.pdi[i] > a.mdi[i] ? 1 : -1); }
    case 'aroon': { const a = Aroon(d); return a.up.map((v, i) => (v === null || a.dn[i] === null) ? 0 : v > a.dn[i] ? 1 : v < a.dn[i] ? -1 : 0); }
    case 'vortex': { const v = Vortex(d); return v.plus.map((x, i) => (x === null || v.minus[i] === null) ? 0 : x > v.minus[i] ? 1 : x < v.minus[i] ? -1 : 0); }
    case 'kst': { const k = KST(d); return k.kst.map((v, i) => (v === null || k.signal[i] === null) ? 0 : v > k.signal[i] ? 1 : v < k.signal[i] ? -1 : 0); }
    case 'supertrend': { const s = Supertrend(d); return s.dir.map(v => v === null ? 0 : v); }
    case 'sar': { const s = SAR(d); return s.map((v, i) => v === null ? 0 : C_[i] > v ? 1 : -1); }
    case 'bb20': { const b = PctB(d); return b.map(v => v === null ? 0 : v > 0.8 ? -1 : v < 0.2 ? 1 : 0); }
    case 'cmf20': { const c = CMF(d, 20); return c.map(v => v === null ? 0 : v > 0.05 ? 1 : v < -0.05 ? -1 : 0); }
    case 'obv': { const o = OBV(d); return o.map((v, i) => i < 6 || v === null ? 0 : v > o[i - 5] ? 1 : v < o[i - 5] ? -1 : 0); }
    case 'emv14': { const e = EMV(d, 14); return e.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'klinger': { const k = Klinger(d); return k.k.map((v, i) => (v === null || k.signal[i] === null) ? 0 : v > k.signal[i] ? 1 : v < k.signal[i] ? -1 : 0); }
    case 'trix18': { const t = TRIX(d, 18); return t.map(v => v === null ? 0 : v > 0 ? 1 : v < 0 ? -1 : 0); }
    case 'sma20': return trendVs(C_, smaArr(C_, 20));
    case 'sma50': return trendVs(C_, smaArr(C_, 50));
    case 'ema20': return trendVs(C_, emaArr(C_, 20));
    default: return z();
  }
}
const COMBO_IDS = ['rsi14', 'stoch', 'stochrsi', 'macd', 'adx', 'supertrend', 'sar', 'bb20', 'ema20', 'sma50', 'cci20', 'mfi14', 'mom10', 'cmo9', 'ao', 'cmf20', 'obv', 'kst', 'aroon', 'vortex', 'trix18', 'willr14', 'roc12', 'klinger', 'tsi', 'force13'];
function comboSignals(d, ids, thresh = 0.34) {
  const series = ids.map(id => dirSeries(id, d));
  const sig = new Array(d.length).fill(null);
  let pos = 0;
  for (let i = 0; i < d.length; i++) {
    let s = 0, k = 0;
    for (const arr of series) { if (arr[i] !== 0) { s += arr[i]; k++; } }
    const score = k ? s / series.length : 0;
    if (pos <= 0 && score >= thresh) { sig[i] = 'BUY'; pos = 1; }
    else if (pos >= 0 && score <= -thresh) { sig[i] = 'SELL'; pos = -1; }
  }
  return sig;
}
function greedyBundle(d, candidateIds, maxK = 5) {
  const cands = (candidateIds && candidateIds.length ? candidateIds : COMBO_IDS).filter(id => COMBO_IDS.includes(id));
  const evalSet = ids => backtest(d, comboSignals(d, ids));
  const steps = [];
  let bundle = [], best = { totalReturn: -Infinity };
  for (let k = 0; k < Math.min(maxK, cands.length); k++) {
    let pick = null, pickStats = null;
    for (const id of cands) {
      if (bundle.includes(id)) continue;
      const st = evalSet(bundle.concat([id]));
      if (st.totalReturn > (pickStats ? pickStats.totalReturn : -Infinity)) { pick = id; pickStats = st; }
    }
    if (!pick || pickStats.totalReturn <= best.totalReturn) break;
    bundle.push(pick); best = pickStats;
    steps.push({ add: pick, trades: best.trades, winRate: best.winRate, totalReturn: best.totalReturn });
  }
  const sig = comboSignals(d, bundle.length ? bundle : cands.slice(0, 1));
  const stats = backtest(d, sig);
  return { bundle: bundle.length ? bundle : cands.slice(0, 1), signals: sig, stats, steps };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    smaArr, emaArr, rmaArr, wmaArr, hmaArr, linregArr, linSlope, stdevArr, highest, lowest,
    ATR, RSI, Stoch, StochRSI, ConnorsRSI, MFI, CCI, WilliamsR, ROC, Momentum, CMO, TSI, UO,
    AO, DeMarker, RVI, RelVolIndex, SchaffTC, Coppock, PGO, ForceIndex, ADL, ChaikinOsc,
    ChaikinVol, Ulcer, Klinger, PVT, CMF, EMV, NetVol, VolOsc, OBV, Aroon, ADX, Vortex, KST,
    MACD, BB, PctB, Keltner, Donchian, Envelopes, Supertrend, SAR, Ichimoku, VWAP, VWMA,
    KAMA, McGinley, ALMA, VIDYA, T3, ZLEMA, DEMA, TEMA, TRIX, Alligator, Gator, BWMFI,
    Fractals, ZigZag, pivotLevels, CandlePatterns, VProfile, swingPoints, autoLevels, Strat, backtest, compareStrategies, aggregateHistory, comboSignals, greedyBundle, COMBO_IDS
  };
}
