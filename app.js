/* 트레이딩 챠트 — 앱 셸: 레이아웃·툴바·관심종목 (차트는 pane.js ChartPane) */
'use strict';
const $ = id => document.getElementById(id);
let tf = 'D', currency = 'USDT', light = true, autoMode = true, autoStrat = 'supertrend';
try {
  const savedTheme = localStorage.getItem('tvchart-theme');
  if (savedTheme) light = savedTheme === 'light';
} catch (e) {}
let favs = [];
try { favs = JSON.parse(localStorage.getItem('tvchart-fav') || '[]'); if (!Array.isArray(favs)) favs = []; } catch (e) { favs = []; }
function saveFavs() { try { localStorage.setItem('tvchart-fav', JSON.stringify(favs)); } catch (e) {} }

const WATCH = ['BTC', 'ETH', 'XRP', 'SOL', 'ONDO', 'AAPL', '005930.KS'];
// 현재 정적 사이트에서는 주식 시세 API를 제공하지 않으므로 예시 주식은 데모로 표시합니다.
const DEMO_ONLY_SYMBOLS = new Set(['AAPL', '005930.KS']);
const INTRA = { m1: 1, m5: 5, m15: 15, m30: 30, h1: 60, h4: 240, h12: 'H12' };
const BINV = { D: '1d', W: '1w', M: '1M', m1: '1m', m5: '5m', m15: '15m', m30: '30m', h1: '1h', h4: '4h', h12: '12h' };
const UPBIT_MIN = { m1: 1, m5: 5, m15: 15, m30: 30, h1: 60, h4: 240 };
// 장기 이동평균과 주봉·월봉 지표가 충분한 표본을 사용하도록 최근 600봉을 기본으로 받습니다.
// 업비트는 한 번에 최대 200봉만 제공하므로 아래 페이지 크기로 나누어 누적합니다.
const HISTORY_LIMIT = 600;
const UPBIT_PAGE = 200;
const DATA_CACHE_TTL = 15 * 1000;
const candleCache = new Map();

function cloneBars(data) {
  return data.map(b => ({ ...b }));
}

function normalizeBars(data) {
  const byTime = new Map();
  for (const bar of data) {
    if (!bar || bar.time == null || !Number.isFinite(Number(bar.close))) continue;
    byTime.set(String(bar.time), {
      time: bar.time,
      open: Number(bar.open), high: Number(bar.high), low: Number(bar.low),
      close: Number(bar.close), volume: Number(bar.volume) || 0
    });
  }
  return [...byTime.values()].sort((a, b) => {
    if (typeof a.time === 'number' && typeof b.time === 'number') return a.time - b.time;
    return String(a.time).localeCompare(String(b.time));
  });
}

async function cachedCandles(key, signal, loader) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.savedAt < DATA_CACHE_TTL) return cloneBars(hit.data);
  const data = normalizeBars(await loader());
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  candleCache.set(key, { savedAt: Date.now(), data: cloneBars(data) });
  return cloneBars(data);
}

async function fetchUpbitCandles(path, market, target, signal, mapRow) {
  const rows = [];
  let to = '';
  while (rows.length < target) {
    const count = Math.min(UPBIT_PAGE, target - rows.length);
    const params = new URLSearchParams({ market, count: String(count) });
    if (to) params.set('to', to);
    const r = await fetch('https://api.upbit.com/v1/candles/' + path + '?' + params.toString(), { signal, cache: 'no-store' });
    if (!r.ok) throw new Error('upbit ' + r.status);
    const page = await r.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    const oldest = page[page.length - 1]?.candle_date_time_utc;
    const nextTo = oldest ? (oldest.endsWith('Z') ? oldest : oldest + 'Z') : '';
    if (!nextTo || nextTo === to || page.length < count) break;
    to = nextTo;
  }
  return rows.map(mapRow);
}

function resampleIntra(data, seconds) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const b of data) {
    const k = Math.floor(b.time / seconds);
    if (!cur || cur.k !== k) { flush(); cur = { k, time: k * seconds, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }; }
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume; }
  }
  flush();
  return out.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }));
}
const NATIVE = ['binance', 'mexc', 'upbit'];
const isIntra = () => !!INTRA[tf];
const THEMES = {
  dark: { bg: '#211f1c', text: '#f2ede6', grid: 'rgba(111,96,83,.35)', border: '#4a4038', cross: '#b19b8b', crossBg: '#755849' },
  light: { bg: '#f7f3ed', text: '#2f2a26', grid: 'rgba(127,106,90,.16)', border: '#dfd4c8', cross: '#a47967', crossBg: '#c97758' }
};

/* ---- 데이터 소스 ---- */
function sma(data, n) {
  const out = [];
  let s = 0;
  for (let i = 0; i < data.length; i++) {
    s += data[i].close;
    if (i >= n) s -= data[i - n].close;
    if (i >= n - 1) out.push({ time: data[i].time, value: s / n });
  }
  return out;
}
function resample(d, tf) {
  if (tf === 'D') return d;
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const b of d) {
    const dt = new Date(b.time + 'T00:00:00');
    const key = tf === 'W' ? weekKey(dt) : b.time.slice(0, 7);
    if (!cur || cur.k !== key) { flush(); cur = { k: key, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }; }
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume; }
  }
  flush();
  return out.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }));
}
function weekKey(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + '-W' + week;
}
function genDemo(sym) {
  let seed = 0;
  for (const ch of sym) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const out = [];
  let p = 100 + rnd() * 200;
  const t = new Date(); t.setDate(t.getDate() - 400);
  while (t.getDay() === 0 || t.getDay() === 6) t.setDate(t.getDate() - 1);
  for (let i = 0; i < 260; i++) {
    do { t.setDate(t.getDate() + 1); } while (t.getDay() === 0 || t.getDay() === 6);
    const drift = (rnd() - 0.485) * p * 0.03;
    const o = p, c = Math.max(1, p + drift);
    const h = Math.max(o, c) * (1 + rnd() * 0.008);
    const l = Math.min(o, c) * (1 - rnd() * 0.008);
    out.push({ time: t.toISOString().slice(0, 10), open: r2(o), high: r2(h), low: r2(l), close: r2(c), volume: Math.round(rnd() * 8e6) });
    p = c;
  }
  return out;
}
const r2 = x => Math.round(x * 100) / 100;
function upbitMarket(sym, quote) {
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return 'KRW-' + u.slice(0, -3);
  if (u.endsWith('USDT')) return 'USDT-' + u.slice(0, -4);
  return (quote || currency) + '-' + u;
}
async function tryUpbit(sym, tf, quote, signal) {
  const market = upbitMarket(sym, quote);
  const unit = tf === 'W' ? 'weeks' : tf === 'M' ? 'months' : 'days';
  const data = await cachedCandles('upbit:' + market + ':' + tf, signal, () => fetchUpbitCandles(
    unit, market, HISTORY_LIMIT, signal,
    c => ({
      time: c.candle_date_time_kst.slice(0, 10),
      open: c.opening_price, high: c.high_price, low: c.low_price, close: c.trade_price,
      volume: c.candle_acc_trade_volume
    })
  ));
  if (data.length < 10) throw new Error('upbit empty');
  return {
    market,
    data
  };
}
async function tryBinanceTicker(base) {
  const symbol = base.toUpperCase() + 'USDT';
  const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + encodeURIComponent(symbol), { cache: 'no-store' });
  if (!r.ok) throw new Error('binance ticker ' + r.status);
  const j = await r.json();
  const last = Number(j.lastPrice), previous = Number(j.prevClosePrice);
  if (!Number.isFinite(last) || !Number.isFinite(previous) || last <= 0 || previous <= 0) throw new Error('binance ticker invalid');
  return [last, previous, true];
}
async function tryBinanceTickers(bases) {
  const symbols = [...new Set(bases.map(base => base.toUpperCase() + 'USDT'))];
  if (!symbols.length) return new Map();
  const url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(symbols));
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('binance ticker batch ' + r.status);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('binance ticker batch invalid');
  const quotes = new Map();
  for (const item of rows) {
    const last = Number(item.lastPrice), previous = Number(item.prevClosePrice);
    if (Number.isFinite(last) && Number.isFinite(previous) && last > 0 && previous > 0) {
      quotes.set(item.symbol, [last, previous, true]);
    }
  }
  return quotes;
}
async function tryMexcTicker(base) {
  const symbol = base.toUpperCase() + 'USDT';
  const r = await fetch('https://api.mexc.com/api/v3/ticker/24hr?symbol=' + encodeURIComponent(symbol), { cache: 'no-store' });
  if (!r.ok) throw new Error('mexc ticker ' + r.status);
  const j = await r.json();
  const last = Number(j.lastPrice), previous = Number(j.prevClosePrice);
  if (!Number.isFinite(last) || !Number.isFinite(previous) || last <= 0 || previous <= 0) throw new Error('mexc ticker invalid');
  return [last, previous, true];
}
async function tryUpbitTicker(sym, quote) {
  const market = upbitMarket(sym, quote);
  const r = await fetch('https://api.upbit.com/v1/ticker?markets=' + encodeURIComponent(market), { cache: 'no-store' });
  if (!r.ok) throw new Error('upbit ticker ' + r.status);
  const j = await r.json();
  const last = Number(j?.[0]?.trade_price), previous = Number(j?.[0]?.prev_closing_price);
  if (!Number.isFinite(last) || !Number.isFinite(previous) || last <= 0 || previous <= 0) throw new Error('upbit ticker invalid');
  return [last, previous, true];
}
async function tryUpbitIntra(sym, unit, quote, signal, target = HISTORY_LIMIT) {
  const market = upbitMarket(sym, quote);
  if (unit === 'h12') {
    const r = await tryUpbitIntra(sym, 240, quote, signal, target * 3);
    return { market: r.market, data: resampleIntra(r.data, 12 * 3600).slice(-HISTORY_LIMIT) };
  }
  const data = await cachedCandles('upbit-intra:' + market + ':' + unit + ':' + target, signal, async () => {
    const rows = [];
    let to = '';
    while (rows.length < target) {
      const count = Math.min(UPBIT_PAGE, target - rows.length);
      const params = new URLSearchParams({ market, count: String(count) });
      if (to) params.set('to', to);
      const r = await fetch('https://api.upbit.com/v1/candles/minutes/' + unit + '?' + params.toString(), { signal, cache: 'no-store' });
      if (!r.ok) throw new Error('upbit ' + r.status);
      const page = await r.json();
      if (!Array.isArray(page) || !page.length) break;
      rows.push(...page);
      const oldest = page[page.length - 1]?.candle_date_time_utc;
      const nextTo = oldest ? (oldest.endsWith('Z') ? oldest : oldest + 'Z') : '';
      if (!nextTo || nextTo === to || page.length < count) break;
      to = nextTo;
    }
    return rows.map(c => ({
      time: Math.floor(new Date(c.candle_date_time_kst + '+09:00').getTime() / 1000),
      open: c.opening_price, high: c.high_price, low: c.low_price, close: c.trade_price,
      volume: c.candle_acc_trade_volume
    }));
  });
  if (data.length < 10) throw new Error('upbit empty');
  return {
    market,
    data
  };
}
async function fetchStooq(sym, signal) {
  const url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(sym.toLowerCase()) + '&i=d';
  const r = await fetch(url, { signal, cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  const t = await r.text();
  if (t.trim().startsWith('<')) throw new Error('blocked');
  const rows = t.trim().split('\n').slice(1);
  const out = [];
  for (const row of rows) {
    const [date, o, h, l, c, v] = row.split(',');
    const close = parseFloat(c);
    if (!date || isNaN(close) || close <= 0) continue;
    out.push({ time: date, open: +o, high: +h, low: +l, close, volume: parseInt(v || '0', 10) });
  }
  if (out.length < 30) throw new Error('too few rows');
  return out;
}
async function fetchKlines(url, signal) {
  return cachedCandles('klines:' + url, signal, async () => {
    const r = await fetch(url, { signal, cache: 'no-store' });
    if (!r.ok) throw new Error('klines ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j) || j.length < 10) throw new Error('klines empty');
    return j.map(k => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
    }));
  });
}
async function tryBinance(base, tf, signal) {
  const data = await fetchKlines('https://api.binance.com/api/v3/klines?symbol=' + base + 'USDT&interval=' + BINV[tf] + '&limit=' + HISTORY_LIMIT, signal);
  return { market: base + '/USDT', exch: '바이낸스', data };
}
async function tryMexc(base, tf, signal) {
  const data = await fetchKlines('https://api.mexc.com/api/v3/klines?symbol=' + base + 'USDT&interval=' + BINV[tf] + '&limit=' + HISTORY_LIMIT, signal);
  return { market: base + '/USDT', exch: 'MEXC', data };
}
function cryptoBase(sym) {
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return u.slice(0, -3);
  if (u.endsWith('USDT')) return u.slice(0, -4);
  return u;
}
function cryptoPlan(sym) {
  if (isDemoOnlySymbol(sym)) return [];
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return ['upbit'];
  if (u.endsWith('USDT')) return ['binance', 'mexc', 'upbit'];
  if (currency === 'KRW') return ['upbit'];
  return ['binance', 'mexc', 'upbit'];
}
function isDemoOnlySymbol(sym) {
  const normalized = String(sym || '').trim().toUpperCase();
  return DEMO_ONLY_SYMBOLS.has(normalized) || /^\d{6}\.KS$/.test(normalized);
}
async function lastClose(s) {
  if (isDemoOnlySymbol(s)) {
    const data = genDemo(s);
    return [data[data.length - 1].close, data[data.length - 2].close, false];
  }
  const plan = cryptoPlan(s);
  const base = cryptoBase(s);
  for (const step of plan) {
    try {
      if (step === 'binance') return await tryBinanceTicker(base);
      if (step === 'mexc') return await tryMexcTicker(base);
      if (step === 'upbit') return await tryUpbitTicker(s, currency);
    } catch (e) {}
  }
  const d = genDemo(s);
  return [d[d.length - 1].close, d[d.length - 2].close, false];
}

/* ---- 표시 형식 ---- */
function fmt(n, d = 2) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtV(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return '' + Math.round(v);
}
function fmtT(t) {
  if (typeof t === 'number') {
    const d = new Date(t * 1000);
    const p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  return t;
}
function fmtPx(v) {
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function marketLabelFor(kind, quote, sym) {
  if (kind === 'binance' || kind === 'mexc') return quote;
  if (kind !== 'upbit') return sym;
  const m = quote.split('-');
  return m[1] + '/' + m[0];
}
function tfName(t) {
  t = t || tf;
  const m = { D: '일봉', W: '주봉', M: '월봉', m1: '1분봉', m5: '5분봉', m15: '15분봉', m30: '30분봉', h1: '1시간봉', h4: '4시간봉', h12: '12시간봉' };
  return m[t] || t;
}
const RK_RE = /(매도우위|매수우위|매도|매수|지지|저항|현재가|하락|상승|과열|과매도|돌파|이탈|반등|조정)/g;
function hl(s) { return String(s).replace(RK_RE, '<b class="rk">$1</b>'); }
function buildBriefing(data, label, weekends, stepSec) {
  if (!data || data.length < 60) return null;
  const last = data[data.length - 1];
  const C_ = data.map(b => b.close);
  const fval = a => { const v = a.filter(x => x !== null); return v[v.length - 1]; };
  const ma20 = fval(smaArr(C_, 20)), ma50 = fval(smaArr(C_, 50));
  const rsi = fval(RSI(data, 14));
  const mc = MACD(data), mh = fval(mc.hist);
  const st = Stoch(data), sk = fval(st.K);
  const ax = ADX(data), adx = fval(ax.adx), pdi = fval(ax.pdi), mdi = fval(ax.mdi);
  const al = autoLevels(data, data.length - 1, weekends, stepSec);
  const cmp = compareStrategies(data);
  const pct = (x, r) => (r ? (100 * (x - r) / r) : 0);
  const sup = al.supports[0], res = al.resistances[0];
  const trend = last.close > ma20 && last.close > ma50 ? '정배열 상승' : last.close < ma20 && last.close < ma50 ? '역배열 하락' : '이평 혼조';
  const mom = rsi >= 70 ? '과열' : rsi <= 30 ? '과매도' : rsi >= 50 ? '매수 우위' : '매도 우위';
  const lines = [
    '현재가 ' + fmtPx(last.close) + ' · 20일 이평 ' + fmtPx(ma20) + ' · 50일 이평 ' + fmtPx(ma50) + ' → ' + trend,
    'RSI ' + rsi.toFixed(1) + '(' + mom + ') · MACD 히스토 ' + (mh >= 0 ? '+' : '') + mh.toFixed(2) + ' · 스토캐 ' + sk.toFixed(1),
    'ADX ' + adx.toFixed(1) + (adx >= 25 ? '(추세 강함, ' + (pdi > mdi ? '+DI 우세 상승' : '-DI 우세 하락') + ')' : '(추세 약함, 횡보 가능)'),
    sup ? '지지 S1 ' + fmtPx(sup.p) + ' (' + pct(last.close, sup.p).toFixed(1) + '% 위, 터치 ' + sup.n + '회)' : '근접 지지 없음',
    res ? '저항 R1 ' + fmtPx(res.p) + ' (' + pct(res.p, last.close).toFixed(1) + '% 위, 터치 ' + res.n + '회)' : '근접 저항 없음',
  ];
  return { label, lines, cmp, last: last.close, time: last.time };
}

/* ---- 지표 테이블 ---- */
const INDS = [
  ['sma20','SMA 20','추세'],['sma50','SMA 50','추세'],['ema20','EMA 20','추세'],
  ['wma20','WMA 20','추세'],['hma9','HMA 9','추세'],['dema14','DEMA 14','추세'],
  ['tema14','TEMA 14','추세'],['kama10','KAMA 10','추세'],['mcginley14','맥긴리 14','추세'],
  ['alma9','ALMA 9','추세'],['vidya14','VIDYA 14','추세'],['t3','T3 5','추세'],
  ['zlema14','제로랙 EMA 14','추세'],['lsma25','LSMA 25','추세'],['vwma20','VWMA 20','추세'],
  ['vwap','VWAP','추세'],['smma14','SMMA 14','추세'],
  ['median','중앙값','추세'],['mode14','최빈값 14','추세'],['typical','Typical Price','추세'],
  ['wclose','Weighted Close','추세'],
  ['bb20','볼린저 20/2','채널'],['keltner','켈트너 20/1','채널'],['donchian','돈치안 20','채널'],
  ['pricechan','프라이스채널 20','채널'],['envelopes','엔벨로프 20/2.5%','채널'],
  ['supertrend','슈퍼트렌드 10/3','채널'],['sar','파라볼릭 SAR','채널'],
  ['ichimoku','일목균형표','채널'],['alligator','앨리게이터','채널'],['zigzag','지그재그 5%','채널'],
  ['rsi14','RSI 14','오실레이터'],['stoch','스토캐스틱 14/3/3','오실레이터'],
  ['stochrsi','스토캐스틱 RSI','오실레이터'],['connors','코너스 RSI','오실레이터'],
  ['mfi14','MFI 14','오실레이터'],['cci20','CCI 20','오실레이터'],['willr14','Williams %R','오실레이터'],
  ['roc12','ROC 12','오실레이터'],['mom10','모멘텀 10','오실레이터'],['cmo9','CMO 9','오실레이터'],
  ['tsi','TSI','오실레이터'],['uo','Ultimate Oscillator','오실레이터'],['ao','Awesome Oscillator','오실레이터'],
  ['demarker13','DeMarker 13','오실레이터'],['rvi','RVI','오실레이터'],['relvol','상대변동성 10','오실레이터'],
  ['schaff','샤프 추세사이클','오실레이터'],['coppock','코포크','오실레이터'],['pgo','PGO 14','오실레이터'],
  ['force13','엘더 포스 13','오실레이터'],['chaikinosc','차이킨 오실레이터','오실레이터'],
  ['chaikinvol','차이킨 변동성','오실레이터'],['ulcer14','Ulcers 14','오실레이터'],
  ['trix18','TRIX 18','오실레이터'],['linregslope','선형회귀 기울기 14','오실레이터'],
  ['pctb','볼린저 %B','오실레이터'],
  ['obv','OBV','거래량'],['adl','A/D','거래량'],['cmf20','CMF 20','거래량'],
  ['emv14','EMV 14','거래량'],['klinger','클링거','거래량'],['pvt','PVT','거래량'],
  ['netvol','Net Volume','거래량'],['volosc','거래량 오실레이터','거래량'],
  ['gator','게이터','BW'],['bwmfi','BW MFI','BW'],['fractals','프랙탈','BW'],
  ['aroon','Aroon 14','추세강도'],['adx','ADX/DI 14','추세강도'],['vortex','볼텍스 14','추세강도'],['kst','KST','추세강도'],
  ['macd','MACD 12/26/9','추세강도'],
  ['pivStd','피벗 스탠다드','피벗'],['pivFib','피벗 피보나치','피벗'],['pivDemark','피벗 디마크','피벗'],
  ['pivWoodie','피벗 우디','피벗'],['pivCam','피벗 카마릴라','피벗'],
  ['vprofile','거래량 프로파일','피벗'],['patterns','캔들 패턴','피벗'],
  ['breadthADL','등락주선','수급',1],['breadthADR','등락비율','수급',1],['trin','Arms지수(TRIN)','수급',1],
  ['mcclellan','매클렐란','수급',1],['highlow','하이로우 인덱스','수급',1],
];
const STRAT_NAME = { emaCross: 'EMA 크로스 9/21', maCross: 'MA 크로스 50/200', macd: 'MACD 크로스', rsi: 'RSI 반전', supertrend: '슈퍼트렌드 반전', sar: '파라볼릭SAR 반전', bb: '볼린저 돌파', stoch: '스토캐스틱 크로스', atrStop: 'ATR 추적손절 반전' };

/* ---- 멀티차트 레이아웃 ---- */
let panes = [], activePane = null, briefTimer = null;
function scheduleBriefing() {
  if (briefTimer) return;
  briefTimer = setTimeout(() => {
    briefTimer = null;
    if (activePane) analyzeActive();
  }, 3000);
}
const DEFAULT_SYMS = ['BTC', 'ETH', 'XRP', 'SOL', 'ONDO', 'AAPL', '005930.KS', 'DOGE'];
function setActive(p) {
  if (activePane) { activePane.stopLive(); activePane.els.cell.classList.remove('active'); }
  activePane = p;
  if (p) {
    p.els.cell.classList.add('active');
    p.startLive();
    updateFavBtn();
    buildIndPanel();
    updateChips();
    analyzeActive();
  }
}
function buildLayout(n, keepSyms) {
  const grid = $('grid');
  grid.className = 'cols-' + n;
  grid.innerHTML = '';
  const olds = panes.slice();
  panes = [];
  for (let i = 0; i < n; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = '<div class="cellbar"><input class="csym" spellcheck="false"/><button class="cgo">조회</button>'
      + '<span class="cpx"></span>'
      + '<select class="ctf"><option value="m1">1분</option><option value="m15">15분</option><option value="m30">30분</option><option value="h1">1시간</option><option value="h4">4시간</option><option value="h12">12시간</option><option value="D">1일</option><option value="W">주봉</option><option value="M">월봉</option></select>'
      + '<span class="cohlc"><b class="cs"></b> <span class="co"></span> <span class="ch"></span> <span class="cl"></span> <span class="cc"></span> <span class="cg"></span></span><button class="cfs" title="이 차트 전체화면">⛶</button><button class="cplay" title="이 차트 리플레이 재생" aria-label="이 차트 리플레이 재생">▶</button><button class="cstop" title="이 차트 리플레이 정지" aria-label="이 차트 리플레이 정지">■</button></div>'
      + '<div class="cchart" tabindex="0"></div><div class="cpanes"></div><div id="autoleg"></div>';
    grid.appendChild(cell);
    const q = s => cell.querySelector(s);
    q('.cfs').onclick = ev => {
      ev.stopPropagation();
      if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
      else if (cell.requestFullscreen) cell.requestFullscreen().catch(() => {});
      else if (cell.webkitRequestFullscreen) cell.webkitRequestFullscreen();
    };
    const els = {
      cell, box: q('.cchart'), panes: q('.cpanes'),
      symInput: q('.csym'), symGo: q('.cgo'), ctf: q('.ctf'), px: q('.cpx'),
      sym: q('.cs'), o: q('.co'), h: q('.ch'), l: q('.cl'), c: q('.cc'), chg: q('.cg')
    };
    const pane = new ChartPane(els, {
      onActivate: p => { if (p !== activePane) setActive(p); },
      onMsg: (p, t) => { if (p === activePane) routeMsg(t); },
      onInd: p => { if (p === activePane) { buildIndPanel(); updateChips(); } },
      onAuto: () => {},
      onAutoClear: () => {},
      onLive: (p, on) => { if (p === activePane) setLiveDot(on); },
      onTick: (p, price) => {
        if (p !== activePane) return;
        try { document.title = fmtPx(price) + ' · ' + p.label() + ' — 트레이딩 챠트'; } catch (e) {}
        scheduleBriefing();
      },
      onSymbol: p => {
        // 비활성 패널이 로드될 때 현재 선택된 차트의 무거운 분석을 중복 실행하지 않습니다.
        if (p === activePane) { updateFavBtn(); analyzeActive(); }
        saveLayout();
      }
    });
    q('.cplay').onclick = ev => {
      ev.stopPropagation();
      if (pane !== activePane) setActive(pane);
      if (pane.startReplay(400)) routeMsg('리플레이 시작 (클릭한 봉부터, 없으면 100봉 전)');
      else routeMsg('리플레이할 데이터 없음');
    };
    q('.cstop').onclick = ev => {
      ev.stopPropagation();
      if (pane !== activePane) setActive(pane);
      pane.stopReplay();
      routeMsg('리플레이 정지');
    };
    cell.addEventListener('mousedown', () => { if (pane !== activePane) setActive(pane); });
    els.ctf.value = pane.tf;
    els.ctf.onchange = ev => { pane.setTF(ev.target.value); saveLayout(); };
    panes.push(pane);
  }
  for (const o of olds) { try { o.destroy(); } catch (e) {} }
  const syms = keepSyms && keepSyms.length ? keepSyms : DEFAULT_SYMS;
  panes.forEach((p, i) => {
    const e = i < syms.length ? syms[i] : { s: DEFAULT_SYMS[i % DEFAULT_SYMS.length], t: tf };
    if (e && typeof e === 'object') { p.tf = e.t || tf; if (p.els.ctf) p.els.ctf.value = p.tf; p.load(e.s); }
    else p.load(e || 'BTC');
  });
  setActive(panes[0]);
  saveLayout();
}
function saveLayout() {
  try {
    if (!panes.length || panes.some(p => !p.symbol)) return;
    localStorage.setItem('tvchart-layout', JSON.stringify({
      n: panes.length, syms: panes.map(p => ({ s: p.symbol, t: p.tf })), tf, currency
    }));
  } catch (e) {}
}
function routeMsg(t) {
  if (t.startsWith('st:')) $('stTime').textContent = t.slice(3);
  else $('stMsg').textContent = t;
}
function analyzeActive() {
  const p = activePane;
  if (!p) return;
  if (!p.daily.length) {
    $('briefTitle').textContent = '차트 브리핑';
    $('briefTime').textContent = '';
    $('briefBody').innerHTML = '<p class="brief-empty">분석할 차트 데이터가 없습니다</p>';
    return;
  }
  const data = p.curData();
  if (data.length < 60) {
    $('briefBody').innerHTML = '<p class="brief-empty">봉이 60개 미만이라 분석 생략</p>';
    return;
  }
  const b = buildBriefing(data, p.label(), NATIVE.includes(p.srcKind), p.stepSec());
  if (!b) return;
  // 누적 신뢰도가 있으면 그것을 우선, 없으면 이번 분석 1위
  let best = b.cmp.best, basis = '이번 분석';
  const roll = aggregateHistory(histFor(p.symbol, p.tf));
  const rq = roll.perf.find(x => STRAT_NAME[x.id] && x.runs >= 2);
  if (rq) { best = rq.id; basis = '누적 ' + rq.runs + '회 평균승률 ' + rq.avgWr.toFixed(1) + '%'; }
  if (best && best !== p.curStrategy) {
    autoStrat = best;
    try { localStorage.setItem('tvchart-strat', autoStrat); } catch (e) {}
    p.runStrategy(best, true);
  }
  const rollMap = {};
  for (const x of roll.perf) rollMap[x.id] = x;
  $('briefTitle').textContent = b.label + ' 브리핑';
  $('briefTime').textContent = b.time + ' 기준 · 기본전략 ' + (STRAT_NAME[autoStrat] || autoStrat) + '(' + basis + ')';
  let h = b.lines.map(x => '<p class="bl">' + hl(x) + '</p>').join('');
  const lastRun = histFor(p.symbol, p.tf).reduce((m, x) => Math.max(m, x.t || 0), 0);
  const next = lastRun ? new Date(lastRun + BT_MS) : null;
  const p2 = n => String(n).padStart(2, '0');
  h += '<p class="bl">4시간 신뢰도 추적 ' + (lastRun ? '· 다음 분석 ' + p2(next.getHours()) + ':' + p2(next.getMinutes()) : '· 첫 추적 대기 중') + '</p>';
  h += '<table><tr><th>전략</th><th>신호</th><th>거래</th><th>승률</th><th>평균승률</th><th>수익</th></tr>';
  if (p.lastCombo) {
    const c = p.lastCombo, sg = c.lastSig ? (c.lastSig === 'BUY' ? '매수' : '매도') + ' ' + c.barsAgo + '봉전' : '—';
    h += '<tr class="best"><td>★ 조합(' + c.bundle.length + '종' + (c.oos ? '·OOS' : '') + ')</td><td>' + hl(sg) + '</td><td>' + c.stats.trades + '</td><td>' + c.stats.winRate.toFixed(1) + '%</td><td>—</td><td>' + (c.stats.totalReturn >= 0 ? '+' : '') + c.stats.totalReturn.toFixed(1) + '%</td></tr>';
  }
  for (const r of b.cmp.rows) {
    const nm = STRAT_NAME[r.id] || r.id;
    const sg = r.lastSig ? (r.lastSig === 'BUY' ? '매수' : '매도') + ' ' + r.barsAgo + '봉전' : '—';
    const avg = rollMap[r.id] ? rollMap[r.id].avgWr.toFixed(1) + '%(' + rollMap[r.id].runs + '회)' : '—';
    h += '<tr' + (r.id === b.cmp.best ? ' class="best"' : '') + '><td>' + (r.id === b.cmp.best ? '★ ' : '') + nm + '</td><td>' + hl(sg) + '</td><td>' + r.trades + '</td><td>' + r.winRate.toFixed(1) + '%</td><td>' + avg + '</td><td>' + (r.totalReturn >= 0 ? '+' : '') + r.totalReturn.toFixed(1) + '%</td></tr>';
  }
  $('briefBody').innerHTML = h + '</table>';
}
function setLiveDot(on) {
  const d = $('liveDot');
  if (d) d.classList.toggle('on', !!on);
}
function updateChips() {
  const box = $('chips');
  box.innerHTML = '';
  if (!activePane) return;
  for (const id of activePane.active.keys()) {
    const meta = INDS.find(x => x[0] === id);
    const c = document.createElement('span');
    c.className = 'chip';
    const t = document.createElement('span'); t.textContent = meta ? meta[1] : id;
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = () => activePane.toggleInd(id);
    c.appendChild(t); c.appendChild(x); box.appendChild(c);
  }
  if (activePane.curStrategy) {
    const c = document.createElement('span');
    c.className = 'chip';
    const t = document.createElement('span'); t.textContent = '전략: ' + activePane.curStrategy;
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = () => { delete activePane.markerLayers['strat']; activePane.curStrategy = null; activePane.refreshMarkers(); updateChips(); $('stMsg').textContent = '전략 해제'; };
    c.appendChild(t); c.appendChild(x); box.appendChild(c);
  }
  if (activePane.lastCombo) {
    const c = document.createElement('span');
    c.className = 'chip';
    const t = document.createElement('span'); t.textContent = '조합: ' + activePane.lastCombo.bundle.join('+');
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = () => { delete activePane.markerLayers['combo']; activePane.lastCombo = null; activePane.refreshMarkers(); updateChips(); $('stMsg').textContent = '조합 해제'; };
    c.appendChild(t); c.appendChild(x); box.appendChild(c);
  }
}
function buildIndPanel() {
  let panel = $('indPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'indPanel'; panel.className = 'hidden';
    $('center').appendChild(panel);
  }
  panel.innerHTML = '';
  const comboBtn = document.createElement('button');
  comboBtn.className = 'inditem';
  comboBtn.textContent = '★ 최적 조합 계산·적용';
  comboBtn.onclick = () => { if (activePane) { activePane.optimizeCombo(); buildIndPanel(); } };
  panel.appendChild(comboBtn);
  const groups = {};
  for (const [id, name, g, notice] of INDS) { (groups[g] = groups[g] || []).push([id, name, notice]); }
  for (const g of Object.keys(groups)) {
    const h = document.createElement('h4'); h.textContent = g; panel.appendChild(h);
    for (const [id, name, notice] of groups[g]) {
      const b = document.createElement('button');
      b.className = 'inditem' + (activePane && activePane.active.has(id) ? ' on' : '');
      b.textContent = name;
      if (notice) { const s = document.createElement('small'); s.textContent = '데이터 필요'; b.appendChild(s); }
      b.onclick = () => { if (activePane) activePane.toggleInd(id); buildIndPanel(); };
      panel.appendChild(b);
    }
  }
}

/* ---- 4시간 백테스트 스케줄러 ---- */
const BT_MS = 4 * 3600 * 1000, BT_MAX = 60;
let btHist = [];
try { btHist = JSON.parse(localStorage.getItem('tvchart-bt') || '[]'); if (!Array.isArray(btHist)) btHist = []; } catch (e) { btHist = []; }
function saveBt() { try { localStorage.setItem('tvchart-bt', JSON.stringify(btHist.slice(-BT_MAX))); } catch (e) {} }
function histFor(sym, tfv) { return btHist.filter(h => h.sym === sym && h.tf === tfv); }
async function scheduledBacktest() {
  const p = activePane;
  if (!p || !p.symbol) return;
  try { await p.load(p.symbol); } catch (e) {}
  const data = p.curData();
  if (data.length < 60) return;
  const cmp = compareStrategies(data);
  btHist.push({ t: Date.now(), sym: p.symbol, tf: p.tf, rows: cmp.rows.map(r => ({ id: r.id, trades: r.trades, winRate: r.winRate, totalReturn: r.totalReturn })) });
  try {
    const cands = [...p.active.keys()].filter(id => COMBO_IDS.includes(id));
    const g = walkForwardBundle(data, cands.length >= 2 ? cands : COMBO_IDS.slice(), 5);
    btHist.push({ t: Date.now(), sym: p.symbol, tf: p.tf, rows: [{ id: 'combo:' + g.bundle.slice().sort().join('+'), trades: g.stats.trades, winRate: g.stats.winRate, totalReturn: g.stats.totalReturn, maxDrawdown: g.stats.maxDrawdown, validationFolds: g.folds.length }] });
  } catch (e) {}
  btHist = btHist.slice(-BT_MAX);
  saveBt();
  analyzeActive();
}
function lastBtRun() {
  if (!activePane) return 0;
  return histFor(activePane.symbol, activePane.tf).reduce((m, x) => Math.max(m, x.t || 0), 0);
}

/* ---- 즐겨찾기·관심종목 ---- */
function isFav(s) { return favs.includes(s.toUpperCase()); }
function updateFavBtn() {
  const b = $('favBtn');
  if (!b || !activePane) return;
  const on = isFav(activePane.symbol);
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
}
function toggleFav() {
  if (!activePane || !activePane.symbol) return;
  const s = activePane.symbol.toUpperCase();
  if (isFav(s)) {
    favs = favs.filter(x => x !== s);
    saveFavs(); updateFavBtn(); refreshWatch();
    $('stMsg').textContent = s + ' 즐겨찾기 해제';
  } else {
    if (activePane.srcKind === 'demo') {
      $('stMsg').textContent = '실시간 조회된 종목만 즐겨찾기 등록 가능 (지금은 데모 데이터)';
      return;
    }
    favs.push(s);
    saveFavs(); updateFavBtn(); refreshWatch();
    $('stMsg').textContent = s + ' 즐겨찾기 등록';
  }
}
async function refreshWatch() {
  const box = $('wl');
  const refreshId = (refreshWatch.requestId || 0) + 1;
  refreshWatch.requestId = refreshId;
  box.innerHTML = '';
  const symbols = [...new Set([...favs, ...WATCH])];
  const quotes = new Map();
  const bases = [...new Set(symbols.filter(s => !isDemoOnlySymbol(s) && !s.toUpperCase().endsWith('KRW')).map(cryptoBase))];
  if (currency !== 'KRW' && bases.length) {
    // 거래소의 묶음 조회 한도보다 작게 나눠 즐겨찾기가 많아도 요청이 실패하지 않게 합니다.
    for (let offset = 0; offset < bases.length; offset += 20) {
      try {
        const batch = await tryBinanceTickers(bases.slice(offset, offset + 20));
        for (const s of symbols) {
          const quote = batch.get(cryptoBase(s) + 'USDT');
          if (quote) quotes.set(s, quote);
        }
      } catch (e) { /* 조회되지 않은 심볼은 아래에서 가능한 거래소로 보완합니다. */ }
      }
  }
  await Promise.all(symbols.filter(s => !quotes.has(s)).map(async s => {
    try { quotes.set(s, await lastClose(s)); }
    catch (e) {
      const d = genDemo(s);
      quotes.set(s, [d[d.length - 1].close, d[d.length - 2].close, false]);
    }
  }));
  if (refreshWatch.requestId !== refreshId) return;

  const drawRow = (s, isFavRow) => {
    const [last, prev, live] = quotes.get(s) || [NaN, NaN, false];
    const ch = prev ? (last - prev) / prev * 100 : 0;
    const row = document.createElement('div');
    row.className = 'wlrow' + (activePane && s === activePane.symbol ? ' on' : '') + (isFavRow ? ' fav' : '');
    row.dataset.s = s;
    row.innerHTML = '<span class="s"></span><span class="p"></span><span class="c"></span><span class="r"></span>';
    row.children[0].textContent = (isFavRow ? '★ ' : '') + s;
    row.children[1].textContent = fmtPx(last);
    row.children[2].textContent = live ? '실시간' : '데모';
    row.children[3].textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
    row.children[3].className = 'r ' + (ch >= 0 ? 'up' : 'down');
    if (isFavRow) {
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '✕'; x.title = '즐겨찾기 해제';
      x.onclick = ev => { ev.stopPropagation(); favs = favs.filter(f => f !== s); saveFavs(); updateFavBtn(); refreshWatch(); };
      row.appendChild(x);
    }
    row.onclick = () => { if (activePane) activePane.load(s); };
    return row;
  };
  if (favs.length) {
    const h = document.createElement('div');
    h.className = 'wlsec'; h.textContent = '★ 즐겨찾기';
    box.appendChild(h);
    favs.map(s => drawRow(s, true)).forEach(row => box.appendChild(row));
    const h2 = document.createElement('div');
    h2.className = 'wlsec'; h2.textContent = '기본 목록';
    box.appendChild(h2);
  }
  WATCH.filter(s => !favs.includes(s)).map(s => drawRow(s, false)).forEach(row => box.appendChild(row));
}

/* ---- 테마·전체화면 ---- */
function applyTheme() {
  document.body.classList.toggle('light', light);
  const b = $('themeBtn');
  if (b) b.textContent = light ? '☀' : '🌙';
  for (const p of panes) { p.applyTheme(); if (p.autoLayer.series.length) p.drawAuto(); }
  try { localStorage.setItem('tvchart-theme', light ? 'light' : 'dark'); } catch (e) {}
}
function toggleFullscreen() {
  const el = $('main');
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
}

/* ---- 초기화 ---- */
function init() {
  document.body.classList.toggle('light', light);
  try { const s = localStorage.getItem('tvchart-strat'); if (s && STRAT_NAME[s]) autoStrat = s; } catch (e) {}
  let savedLayout = null;
  try { savedLayout = JSON.parse(localStorage.getItem('tvchart-layout') || 'null'); } catch (e) {}
  document.querySelectorAll('#tfs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#tfs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); tf = b.dataset.tf;
    for (const p of panes) p.setTF(tf);
  });
  document.querySelectorAll('#cur button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#cur button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); currency = b.dataset.cur;
    for (const p of panes) p.load(p.symbol || 'BTC');
    refreshWatch();
  });
  document.querySelectorAll('#layoutSel button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#layoutSel button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    const syms = panes.map(p => ({ s: p.symbol, t: p.tf })).filter(x => x.s);
    buildLayout(parseInt(b.dataset.n, 10), syms);
  });
  ['tMA20', 'tMA50', 'tVol'].forEach(id => $(id).onchange = () => {
    const on = $(id).checked;
    for (const p of panes) {
      if (id === 'tMA20') p.ma20.applyOptions({ visible: on });
      if (id === 'tMA50') p.ma50.applyOptions({ visible: on });
      if (id === 'tVol') p.vol.applyOptions({ visible: on });
    }
  });
  $('symGo').onclick = () => { const v = $('symInput').value.trim(); if (v && activePane) activePane.load(v); };
  $('symInput').onkeydown = e => { if (e.key === 'Enter' && activePane) activePane.load($('symInput').value.trim()); };
  const fb = $('favBtn');
  if (fb) fb.onclick = toggleFav;
  const hb = $('helpBtn'), hm = $('helpModal'), hc = $('helpClose');
  if (hb && hm) hb.onclick = () => hm.classList.remove('hidden');
  if (hc && hm) hc.onclick = () => hm.classList.add('hidden');
  if (hm) hm.onclick = e => { if (e.target === hm) hm.classList.add('hidden'); };
  const tb = $('themeBtn');
  if (tb) tb.onclick = () => { light = !light; applyTheme(); };
  const fsb = $('fsBtn');
  if (fsb) fsb.onclick = toggleFullscreen;
  const pb = $('playBtn');
  if (pb) pb.onclick = () => {
    if (activePane && activePane.startReplay(400)) $('stMsg').textContent = '리플레이 시작 (클릭한 봉부터, 없으면 100봉 전)';
    else if (activePane) $('stMsg').textContent = '리플레이할 데이터 없음';
  };
  const sb = $('stopBtn');
  if (sb) sb.onclick = () => { if (activePane) { activePane.stopReplay(); $('stMsg').textContent = '리플레이 정지'; } };
  document.querySelectorAll('#rail .tool').forEach(t => t.onclick = () => {
    document.querySelectorAll('#rail .tool').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    $('stMsg').textContent = '그리기 도구는 표시 전용입니다';
  });
  const ab = $('autoBtn');
  if (ab) ab.onclick = () => {
    autoMode = !autoMode;
    ab.classList.toggle('on', autoMode);
    for (const p of panes) { if (autoMode) p.drawAuto(); else { p.clearAuto(); } }
    $('stMsg').textContent = autoMode ? '자동선 켜짐' : '자동선 꺼짐';
  };
  $('indBtn').onclick = () => { buildIndPanel(); $('indPanel').classList.toggle('hidden'); };
  $('stratGo').onclick = () => {
    const v = $('stratSel').value;
    if (!v) { $('stMsg').textContent = '전략을 선택하세요'; return; }
    if ($('indPanel') && !$('indPanel').classList.contains('hidden')) $('indPanel').classList.add('hidden');
    if (activePane) {
      activePane.runStrategy(v);
      try { localStorage.setItem('tvchart-strat', v); } catch (e) {}
    }
  };
  const bg = $('briefGo');
  if (bg) bg.onclick = analyzeActive;
  if (savedLayout && savedLayout.n >= 1 && savedLayout.n <= 8) {
    if (savedLayout.tf) tf = savedLayout.tf;
    if (savedLayout.currency) currency = savedLayout.currency;
    document.querySelectorAll('#tfs button').forEach(x => x.classList.toggle('on', x.dataset.tf === tf));
    document.querySelectorAll('#cur button').forEach(x => x.classList.toggle('on', x.dataset.cur === currency));
    document.querySelectorAll('#layoutSel button').forEach(x => x.classList.toggle('on', +x.dataset.n === savedLayout.n));
    buildLayout(savedLayout.n, savedLayout.syms && savedLayout.syms.length ? savedLayout.syms : undefined);
  } else {
    buildLayout(1);
  }
  refreshWatch();
  setInterval(() => { scheduledBacktest().catch(() => {}); }, BT_MS);
  setTimeout(() => {
    if (Date.now() - lastBtRun() > BT_MS) scheduledBacktest().catch(() => {});
  }, 60000);
}
document.addEventListener('DOMContentLoaded', init);
