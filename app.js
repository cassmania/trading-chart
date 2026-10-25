/* 트레이딩 챠트 — 실시간 데이터 · 차트 · 자동 지표 적용 */
'use strict';
const E = window.Engine;
const $ = id => document.getElementById(id);

/* ===================== 상태 ===================== */
const STORE_KEY = 'tc2-state';
const DEFAULT_WATCH = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ONDO'];
const SUGGEST = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'TRX', 'SUI', 'APT', 'ONDO', 'AAVE', 'NEAR', 'ARB', 'OP', 'PEPE', 'SHIB', 'BCH'];
const TF = {
  m15: { label: '15분', sec: 900, binance: '15m', okx: '15m', upbit: 'minutes/15' },
  h1: { label: '1시간', sec: 3600, binance: '1h', okx: '1H', upbit: 'minutes/60' },
  h4: { label: '4시간', sec: 14400, binance: '4h', okx: '4H', upbit: 'minutes/240' },
  h12: { label: '12시간', sec: 43200, binance: '12h', okx: '12Hutc', upbit: 'minutes/240', resample: 3 },
  D: { label: '일봉', sec: 86400, binance: '1d', okx: '1Dutc', upbit: 'days' },
  W: { label: '주봉', sec: 604800, binance: '1w', okx: '1Wutc', upbit: 'weeks' },
  M: { label: '월봉', sec: 2592000, binance: '1M', okx: '1Mutc', upbit: 'months' }
};
const BARS = 1000;

const state = {
  sym: 'BTC', quote: 'USDT', tf: 'h4', mode: 'long', theme: null, view: 'auto', watch: DEFAULT_WATCH.slice()
};
try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (s && typeof s === 'object') {
    for (const k of ['sym', 'quote', 'tf', 'mode', 'theme']) if (typeof s[k] === 'string') state[k] = s[k];
    if (Array.isArray(s.watch) && s.watch.length) state.watch = s.watch.filter(x => typeof x === 'string').slice(0, 30);
  }
} catch (e) { /* 저장소 사용 불가 시 기본값 */ }
if (!TF[state.tf]) state.tf = 'h4';
if (!['USDT', 'KRW'].includes(state.quote)) state.quote = 'USDT';
if (!['long', 'both'].includes(state.mode)) state.mode = 'long';
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ sym: state.sym, quote: state.quote, tf: state.tf, mode: state.mode, theme: state.theme, watch: state.watch })); } catch (e) {}
}

let bars = [];            // 현재 차트 봉
let source = null;        // { exch, market, kind }
let analysis = null;      // Engine.analyze 결과
let loadSeq = 0;
let usdKrw = null;

/* ===================== 포맷 ===================== */
function decimalsFor(v) {
  const a = Math.abs(v);
  if (a >= 1000) return state.quote === 'KRW' ? 0 : 2;
  if (a >= 100) return state.quote === 'KRW' ? 0 : 2;
  if (a >= 1) return state.quote === 'KRW' ? 2 : 3;
  if (a >= 0.01) return 4;
  if (a >= 0.0001) return 6;
  return 8;
}
function fmtPx(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const d = decimalsFor(v);
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
const fmtPct = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const fmtKrw = v => v == null || !Number.isFinite(v) ? '' : '₩' + Math.round(v).toLocaleString('ko-KR');
const kstFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const kstDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' });
function fmtTime(t) { return kstFmt.format(new Date(t * 1000)).replace(/\. /g, '-').replace('.', ''); }

function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ===================== 심볼 해석 ===================== */
function parseSymbol(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  let quote = null;
  if (/^KRW-/.test(s)) { quote = 'KRW'; s = s.slice(4); }
  else if (/^USDT-/.test(s)) { quote = 'USDT'; s = s.slice(5); }
  s = s.replace(/[\/_-]/g, '');
  if (s.length > 4 && s.endsWith('USDT')) { quote = 'USDT'; s = s.slice(0, -4); }
  else if (s.length > 3 && s.endsWith('KRW')) { quote = 'KRW'; s = s.slice(0, -3); }
  if (!/^[A-Z0-9]{1,15}$/.test(s)) return null;
  return { base: s, quote };
}

/* ===================== 시간 버킷 ===================== */
function bucketStart(tSec, tf) {
  const c = TF[tf];
  if (tf === 'W') { const day = Math.floor(tSec / 86400); return (day - ((day + 3) % 7)) * 86400; }
  if (tf === 'M') { const d = new Date(tSec * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
  return Math.floor(tSec / c.sec) * c.sec;
}

/* ===================== REST 데이터 ===================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, signal) {
  const r = await fetch(url, { signal, cache: 'no-store' });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

async function binanceHistory(base, tf, signal) {
  const url = 'https://data-api.binance.vision/api/v3/klines?symbol=' + base + 'USDT&interval=' + TF[tf].binance + '&limit=' + BARS;
  const j = await getJSON(url, signal);
  if (!Array.isArray(j) || j.length < 30) throw new Error('데이터 부족');
  return j.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function okxHistory(base, tf, signal) {
  const inst = base + '-USDT', bar = TF[tf].okx;
  const out = [];
  let after = '';
  for (let p = 0; p < 4 && out.length < BARS; p++) {
    const ep = p === 0 ? 'candles' : 'history-candles';
    const url = 'https://www.okx.com/api/v5/market/' + ep + '?instId=' + inst + '&bar=' + bar + '&limit=' + (p === 0 ? 300 : 100) + (after ? '&after=' + after : '');
    const j = await getJSON(url, signal);
    if (j.code !== '0' || !Array.isArray(j.data) || !j.data.length) break;
    out.push(...j.data);
    after = j.data[j.data.length - 1][0];
    await sleep(120);
  }
  if (out.length < 30) throw new Error('데이터 부족');
  return out.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}

async function upbitHistory(base, tf, signal) {
  const market = 'KRW-' + base;
  const c = TF[tf];
  const target = c.resample ? BARS * c.resample : BARS;
  const rows = [];
  let to = '';
  while (rows.length < target) {
    const count = Math.min(200, target - rows.length);
    const url = 'https://api.upbit.com/v1/candles/' + c.upbit + '?market=' + market + '&count=' + count + (to ? '&to=' + encodeURIComponent(to) : '');
    let page;
    try { page = await getJSON(url, signal); }
    catch (e) { if (e.status === 429) { await sleep(600); continue; } throw e; }
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    to = page[page.length - 1].candle_date_time_utc + 'Z';
    if (page.length < count) break;
    await sleep(130); // 업비트 초당 요청 제한 보호
  }
  if (rows.length < 30) throw new Error('데이터 부족');
  let data = rows.map(r => ({
    time: Math.floor(Date.parse(r.candle_date_time_utc + 'Z') / 1000),
    open: r.opening_price, high: r.high_price, low: r.low_price, close: r.trade_price, volume: r.candle_acc_trade_volume
  }));
  data = normalize(data);
  if (c.resample) data = resample(data, tf);
  return data;
}

function normalize(data) {
  const m = new Map();
  for (const b of data) if (b && Number.isFinite(b.time) && Number.isFinite(b.close) && b.close > 0) m.set(b.time, b);
  return [...m.values()].sort((a, b) => a.time - b.time);
}
function resample(data, tf) {
  const out = [];
  for (const b of data) {
    const t = bucketStart(b.time, tf);
    const last = out[out.length - 1];
    if (!last || last.time !== t) out.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    else { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume; }
  }
  return out;
}

async function loadHistory(base, quote, tf, signal) {
  if (quote === 'KRW') {
    const data = await upbitHistory(base, tf, signal);
    return { data, src: { exch: '업비트', kind: 'upbit', market: 'KRW-' + base } };
  }
  try {
    const data = await binanceHistory(base, tf, signal);
    return { data: normalize(data), src: { exch: '바이낸스', kind: 'binance', market: base + 'USDT' } };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const data = await okxHistory(base, tf, signal);
    return { data: normalize(data), src: { exch: 'OKX', kind: 'okx', market: base + '-USDT' } };
  }
}

/* ===================== 실시간 스트림 ===================== */
class Stream {
  constructor() { this.ws = null; this.timer = null; this.retry = 0; this.closed = true; }
  stop() {
    this.closed = true;
    clearTimeout(this.timer); clearInterval(this.poll);
    if (this.ws) { this.ws.onclose = null; this.ws.onerror = null; this.ws.onmessage = null; try { this.ws.close(); } catch (e) {} }
    this.ws = null;
  }
  open(url, { onOpen, onMessage, binary } = {}) {
    this.stop();
    this.closed = false;
    const connect = () => {
      if (this.closed) return;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return this.schedule(connect); }
      if (binary) ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => { this.retry = 0; onOpen && onOpen(ws); setLive(true); };
      ws.onmessage = ev => {
        let txt = ev.data;
        if (txt instanceof ArrayBuffer) txt = new TextDecoder().decode(txt);
        try { onMessage(JSON.parse(txt)); } catch (e) {}
      };
      ws.onerror = () => {};
      ws.onclose = () => { setLive(false); this.schedule(connect); };
    };
    connect();
  }
  schedule(fn) {
    if (this.closed) return;
    const wait = Math.min(15000, 1000 * 2 ** this.retry++);
    this.timer = setTimeout(fn, wait);
  }
  startPolling(fn, ms) {
    this.stop(); this.closed = false;
    const run = () => fn().then(() => setLive(true)).catch(() => setLive(false));
    run();
    this.poll = setInterval(run, ms);
  }
}
const chartStream = new Stream();
const watchStreams = { binance: new Stream(), upbit: new Stream() };

function setLive(on) { $('liveDot').classList.toggle('on', !!on); }

function startLive() {
  const tf = state.tf, src = source;
  if (!src) return;
  if (src.kind === 'binance') {
    const url = 'wss://data-stream.binance.vision/ws/' + src.market.toLowerCase() + '@kline_' + TF[tf].binance;
    chartStream.open(url, {
      onMessage: m => {
        const k = m && m.k;
        if (!k) return;
        applyTick({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, k.x);
      }
    });
  } else if (src.kind === 'upbit') {
    chartStream.open('wss://api.upbit.com/websocket/v1', {
      binary: true,
      onOpen: ws => ws.send(JSON.stringify([{ ticket: 'tc-' + Date.now() }, { type: 'trade', codes: [src.market], is_only_realtime: true }])),
      onMessage: m => {
        if (m.type !== 'trade' || m.code !== src.market) return;
        applyTrade(m.trade_timestamp / 1000, m.trade_price, m.trade_volume);
      }
    });
  } else if (src.kind === 'okx') {
    chartStream.startPolling(async () => {
      const j = await getJSON('https://www.okx.com/api/v5/market/candles?instId=' + src.market + '&bar=' + TF[tf].okx + '&limit=2');
      if (!j.data || !j.data.length) return;
      const rows = j.data.slice().reverse();
      for (const k of rows) applyTick({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }, k[8] === '1');
    }, 4000);
  }
}

// 바이낸스/OKX 봉 단위 갱신
function applyTick(bar, closed) {
  if (!bars.length) return;
  const last = bars[bars.length - 1];
  if (bar.time < last.time) return;
  let newBar = false;
  if (bar.time === last.time) Object.assign(last, bar);
  else { bars.push(bar); newBar = true; }
  candle.update(bar);
  volume.update(volBar(bar));
  onPrice(bar.close);
  if (newBar) scheduleAnalyze(); // 이전 봉이 마감됨
  else if (closed) scheduleAnalyze(true);
}

// 업비트 체결 → 봉 집계
function applyTrade(tSec, price, qty) {
  if (!bars.length || !Number.isFinite(price)) return;
  const t = bucketStart(tSec, state.tf);
  const last = bars[bars.length - 1];
  if (t < last.time) return;
  if (t === last.time) {
    last.high = Math.max(last.high, price); last.low = Math.min(last.low, price);
    last.close = price; last.volume += qty || 0;
    candle.update(last); volume.update(volBar(last));
  } else {
    const b = { time: t, open: price, high: price, low: price, close: price, volume: qty || 0 };
    bars.push(b);
    candle.update(b); volume.update(volBar(b));
    scheduleAnalyze();
  }
  onPrice(price);
}

let analyzeTimer = null;
function scheduleAnalyze(lastClosed) {
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => runAnalysis(), 300);
}

/* ===================== 차트 ===================== */
let main, osc, candle, volume;
let overlaySeries = [], oscSeries = [], priceLines = [];

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function palette() {
  return {
    bg: cssVar('--surface'), text: cssVar('--text'), muted: cssVar('--muted'), line: cssVar('--line'),
    accent: cssVar('--accent'), up: cssVar('--up'), down: cssVar('--down'), buy: cssVar('--buy'), sell: cssVar('--sell'),
    blue: '#5b8ff9', violet: '#8b6fd6', teal: '#2aa198', gray: cssVar('--muted'), bad: cssVar('--bad')
  };
}
function chartOptions() {
  const p = palette();
  const grid = document.documentElement.dataset.theme === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(31,30,27,.05)';
  return {
    layout: { background: { type: 'solid', color: p.bg }, textColor: p.muted, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11 },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: p.line },
    timeScale: { borderColor: p.line, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    crosshair: { mode: 0, vertLine: { color: p.muted, labelBackgroundColor: p.accent, style: 3 }, horzLine: { color: p.muted, labelBackgroundColor: p.accent, style: 3 } },
    localization: {
      locale: 'ko-KR',
      timeFormatter: t => fmtTime(t),
      priceFormatter: v => fmtPx(v)
    },
    handleScroll: true, handleScale: true
  };
}
function oscFmt(v) {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 10) return v.toFixed(1);
  if (a >= 0.1 || a === 0) return v.toFixed(2);
  return v.toPrecision(3);
}
function tickFormatter(t, type) {
  const d = new Date(t * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  if (type === 0) return parts.year + '년';
  if (type === 1) return parts.month + '월';
  if (type === 2) return parts.month + '/' + parts.day;
  return parts.hour + ':' + parts.minute;
}

function initCharts() {
  const LW = LightweightCharts;
  main = LW.createChart($('chartMain'), Object.assign(chartOptions(), { autoSize: true }));
  osc = LW.createChart($('chartOsc'), Object.assign(chartOptions(), { autoSize: true }));
  main.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter } });
  osc.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter, visible: true }, localization: { locale: 'ko-KR', timeFormatter: t => fmtTime(t), priceFormatter: oscFmt } });
  const p = palette();
  candle = main.addCandlestickSeries({
    upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down,
    priceLineColor: p.accent, priceLineStyle: 2
  });
  volume = main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  candle.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.18 } });

  // 두 차트 시간축 동기화
  let syncing = false;
  const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (syncing || !r) return;
    syncing = true; b.timeScale().setVisibleLogicalRange(r); syncing = false;
  });
  sync(main, osc); sync(osc, main);
  main.subscribeCrosshairMove(param => updateLegend(param));
}

function applyChartTheme() {
  const p = palette();
  main.applyOptions(chartOptions()); osc.applyOptions(chartOptions());
  main.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter } });
  osc.applyOptions({ timeScale: { tickMarkFormatter: tickFormatter }, localization: { locale: 'ko-KR', timeFormatter: t => fmtTime(t), priceFormatter: oscFmt } });
  candle.applyOptions({ upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down, priceLineColor: p.accent });
  if (bars.length) { volume.setData(bars.map(volBar)); renderView(); }
}

function volBar(b) {
  const p = palette();
  return { time: b.time, value: b.volume, color: (b.close >= b.open ? p.up : p.down) + '55' };
}

function priceFormatFor(v) {
  const d = decimalsFor(v);
  return { type: 'price', precision: d, minMove: 1 / 10 ** d };
}

function seriesData(arr, offset = 0) {
  // 지표 배열 → 시간 정렬 데이터 (값이 없는 구간은 공백으로 두어 두 차트 인덱스 일치)
  return bars.map((b, i) => arr[i] == null || !Number.isFinite(arr[i]) ? { time: b.time } : { time: b.time, value: arr[i] + offset });
}

function clearOverlays() {
  for (const s of overlaySeries) main.removeSeries(s);
  for (const s of oscSeries) osc.removeSeries(s);
  for (const l of priceLines) candle.removePriceLine(l);
  overlaySeries = []; oscSeries = []; priceLines = [];
}

function addLine(chart, arr, color, opts = {}) {
  const s = chart.addLineSeries(Object.assign({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, opts));
  s.setData(seriesData(arr));
  (chart === main ? overlaySeries : oscSeries).push(s);
  return s;
}

function drawOverlay(built) {
  const p = palette();
  const legend = [];
  for (const o of built.overlay) {
    if (o.type === 'line') {
      const c = p[o.color] || o.color;
      addLine(main, o.data, c, { lineWidth: 2 });
      legend.push([o.name, c]);
    } else if (o.type === 'st') {
      const up = o.data.line.map((v, i) => o.data.dir[i] === 1 ? v : null);
      const dn = o.data.line.map((v, i) => o.data.dir[i] === -1 ? v : null);
      addLine(main, up, p.buy, { lineWidth: 2 });
      addLine(main, dn, p.sell, { lineWidth: 2 });
      legend.push(['슈퍼트렌드 10/3', p.buy]);
    } else if (o.type === 'bb') {
      addLine(main, o.data.upper, p.violet, { lineWidth: 1 });
      addLine(main, o.data.mid, p.accent, { lineWidth: 1, lineStyle: 2 });
      addLine(main, o.data.lower, p.violet, { lineWidth: 1 });
      legend.push(['볼린저 20/2', p.violet]);
    } else if (o.type === 'band') {
      addLine(main, o.upper, p.teal, { lineWidth: 1 });
      addLine(main, o.lower, p.teal, { lineWidth: 1 });
      legend.push([o.name + ' 20/10', p.teal]);
    } else if (o.type === 'dots') {
      addLine(main, o.data, p.accent, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6 });
      legend.push([o.name, p.accent]);
    }
  }
  $('lgInd').innerHTML = legend.map(([n, c]) => '<i style="--c:' + c + '">' + n + '</i>').join('');
}

function drawOsc(o) {
  const p = palette();
  let title = '';
  const guide = (v, color) => {
    const arr = bars.map(() => v);
    addLine(osc, arr, color || p.line, { lineWidth: 1, lineStyle: 2 });
  };
  if (o.type === 'rsi') {
    guide(70, p.sell); guide(30, p.buy); guide(50);
    addLine(osc, o.data, p.accent, { lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
    title = 'RSI 14';
  } else if (o.type === 'macd') {
    const h = osc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    h.setData(bars.map((b, i) => o.data.hist[i] == null ? { time: b.time } : { time: b.time, value: o.data.hist[i], color: (o.data.hist[i] >= 0 ? p.up : p.down) + '88' }));
    oscSeries.push(h);
    addLine(osc, o.data.line, p.accent, { lastValueVisible: true });
    addLine(osc, o.data.signal, p.blue, { lineWidth: 1 });
    title = 'MACD 12/26/9';
  } else if (o.type === 'stoch') {
    guide(80, p.sell); guide(20, p.buy);
    addLine(osc, o.data.K, p.accent, { lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
    addLine(osc, o.data.D, p.blue, { lineWidth: 1 });
    title = '스토캐스틱 14/3/3';
  } else if (o.type === 'cci') {
    guide(100, p.sell); guide(-100, p.buy); guide(0);
    addLine(osc, o.data, p.accent, { lastValueVisible: true, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    title = 'CCI 20';
  }
  $('oscHead').innerHTML = '<span>' + title + '</span>';
}

/* ===================== 분석 · 렌더 ===================== */
function runAnalysis() {
  if (bars.length < 120) {
    analysis = null;
    $('sigMain').textContent = '데이터 부족 (봉 120개 미만)';
    $('sigMain').className = 'sig-main';
    return;
  }
  try {
    analysis = E.analyze(bars, { mode: state.mode }); // 마지막 봉(형성 중)은 신호 계산에서 제외
  } catch (e) {
    console.error(e);
    toast('분석 중 오류: ' + e.message);
    return;
  }
  renderView();
  renderPanels();
}

function currentView() {
  if (!analysis) return null;
  if (state.view !== 'auto') {
    const row = analysis.rows.find(r => r.id === state.view);
    if (row) return { kind: 'single', id: row.id, name: row.name, trades: row.trades, open: row.open, pending: row.pending, stats: row.oos, row };
    state.view = 'auto';
  }
  const ad = analysis.adaptive;
  const id = analysis.chosen || analysis.rows[0].id;
  return { kind: 'auto', id, name: E.STRAT_BY_ID[id].name, trades: ad.trades, open: ad.open, pending: ad.pending, stats: ad.stats };
}

function renderView() {
  if (!analysis || !bars.length) return;
  clearOverlays();
  const v = currentView();
  const built = analysis.prep.built[v.id];
  drawOverlay(built);
  drawOsc(built.osc);
  drawMarkers(v);
  drawLevels(v);
}

function drawMarkers(v) {
  const p = palette();
  const ms = [];
  const isLong = d => d === 1;
  for (const t of v.trades) {
    const eb = bars[t.entryIdx], xb = bars[t.exitIdx];
    if (!eb || !xb) continue;
    ms.push({
      time: eb.time, position: isLong(t.dir) ? 'belowBar' : 'aboveBar', shape: isLong(t.dir) ? 'arrowUp' : 'arrowDown',
      color: isLong(t.dir) ? p.buy : p.sell, text: isLong(t.dir) ? '매수' : '숏'
    });
    const label = t.reason === 'stop' ? '손절 ' : isLong(t.dir) ? '매도 ' : '청산 ';
    ms.push({
      time: xb.time, position: isLong(t.dir) ? 'aboveBar' : 'belowBar', shape: isLong(t.dir) ? 'arrowDown' : 'arrowUp',
      color: t.reason === 'stop' ? p.gray : (isLong(t.dir) ? p.sell : p.buy), text: label + fmtPct(t.pnl)
    });
  }
  if (v.open) {
    const eb = bars[v.open.idx];
    if (eb) ms.push({ time: eb.time, position: isLong(v.open.dir) ? 'belowBar' : 'aboveBar', shape: isLong(v.open.dir) ? 'arrowUp' : 'arrowDown', color: isLong(v.open.dir) ? p.buy : p.sell, text: isLong(v.open.dir) ? '매수 보유' : '숏 보유' });
  }
  if (v.pending) {
    const lb = bars[bars.length - 1];
    const txt = v.pending.type === 'exit' ? '청산 대기' : v.pending.dir === 1 ? '매수 대기' : '숏 대기';
    ms.push({ time: lb.time, position: v.pending.dir === 1 ? 'belowBar' : 'aboveBar', shape: 'circle', color: p.accent, text: txt });
  }
  if (v.kind === 'auto' && bars[analysis.adaptive.from]) {
    ms.push({ time: bars[analysis.adaptive.from].time, position: 'aboveBar', shape: 'square', color: p.gray, text: '검증 시작' });
  }
  // 같은 봉의 여러 마커 허용, 시간순 정렬 필수
  ms.sort((a, b) => a.time - b.time);
  candle.setMarkers(ms);
}

function drawLevels(v) {
  const p = palette();
  const vp = E.volumeProfile(bars, Math.min(300, bars.length), 48);
  const add = (price, color, title, style = 2, width = 1) => {
    if (!Number.isFinite(price)) return;
    priceLines.push(candle.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title }));
  };
  if (vp) {
    add(vp.poc, p.accent, 'POC', 0, 1);
    add(vp.vah, p.gray, 'VAH', 2);
    add(vp.val, p.gray, 'VAL', 2);
  }
  const lv = positionLevels(v);
  if (lv) {
    add(lv.entry, lv.dir === 1 ? p.buy : p.sell, lv.dir === 1 ? '진입' : '숏 진입', 0, 2);
    add(lv.stop, p.bad, '손절', 1, 1);
    add(lv.tp1, p.buy, '1차 목표', 1, 1);
    add(lv.tp2, p.buy, '2차 목표', 1, 1);
  }
  analysis.vp = vp;
}

// 진입가 · 손절 · 목표가 (R 배수)
function positionLevels(v) {
  if (!v) return null;
  const a = analysis.context.atr || 0;
  if (v.open) {
    const risk = Math.abs(v.open.entry - v.open.stop);
    const d = v.open.dir;
    return { dir: d, entry: v.open.entry, stop: v.open.stop, tp1: v.open.entry + d * risk * 1.5, tp2: v.open.entry + d * risk * 3, open: true };
  }
  if (v.pending && v.pending.type === 'enter') {
    const d = v.pending.dir, e = bars[bars.length - 1].close;
    const risk = 2.5 * a;
    return { dir: d, entry: e, stop: e - d * risk, tp1: e + d * risk * 1.5, tp2: e + d * risk * 3, open: false };
  }
  return null;
}

function confidence(st) {
  if (!st || st.trades < 5) return { label: '표본 부족', cls: 'warn' };
  if (st.pf >= 1.5 && st.lb >= 0.4 && st.ret > 0) return { label: '신뢰도 높음', cls: 'good' };
  if (st.pf >= 1.1 && st.ret > 0) return { label: '신뢰도 보통', cls: 'warn' };
  return { label: '신뢰도 낮음', cls: 'bad' };
}

function renderPanels() {
  const a = analysis;
  const v = currentView();
  const last = bars[bars.length - 1];

  // --- 현재 판단 ---
  const conf = confidence(v.stats);
  $('sigConf').textContent = conf.label;
  $('sigConf').className = 'pill ' + conf.cls;
  const lv = positionLevels(v);
  let mainTxt = '신호 없음 · 관망', cls = '';
  if (v.kind === 'auto' && !a.chosen && !v.open) mainTxt = '관망 (현 국면에서 검증된 지표 없음)';
  if (v.open) { mainTxt = v.open.dir === 1 ? '매수 포지션 유지' : '숏 포지션 유지'; cls = v.open.dir === 1 ? 'buy' : 'sell'; }
  if (v.pending) {
    if (v.pending.type === 'exit') { mainTxt = '다음 봉 시가 청산'; cls = 'sell'; }
    else { mainTxt = v.pending.dir === 1 ? '매수 신호 · 다음 봉 진입' : '숏 신호 · 다음 봉 진입'; cls = v.pending.dir === 1 ? 'buy' : 'sell'; }
  }
  $('sigMain').textContent = mainTxt;
  $('sigMain').className = 'sig-main ' + cls;
  let why;
  if (v.open) {
    const src = E.STRAT_BY_ID[v.open.src].name;
    why = src + ' 신호로 ' + fmtTime(bars[v.open.idx].time) + ' 진입 · 해당 지표의 반대 신호 또는 손절가 도달 시 청산';
    if (v.kind === 'auto' && v.open.src !== v.id) why += ' · 신규 진입 기준은 ' + v.name;
  } else {
    const ls = a.lastSignal(v.id);
    why = (v.kind === 'auto' ? '자동 선택 ' : '수동 선택 ') + v.name + ' · ' + (ls ? '최근 신호: ' + (ls.dir === 1 ? '매수' : '매도') + ' ' + ls.barsAgo + '봉 전 (' + fmtTime(bars[ls.idx].time) + ')' : '최근 신호 없음');
  }
  $('sigWhy').textContent = why;
  let lvHtml = '';
  if (lv) {
    const pctFrom = x => fmtPct((x - lv.entry) / lv.entry);
    lvHtml += '<dt>' + (lv.open ? '진입가' : '예상 진입') + '</dt><dd>' + fmtPx(lv.entry) + '</dd>';
    lvHtml += '<dt>손절가</dt><dd>' + fmtPx(lv.stop) + '<small>' + pctFrom(lv.stop) + '</small></dd>';
    lvHtml += '<dt>1차 목표 (1.5R)</dt><dd>' + fmtPx(lv.tp1) + '<small>' + pctFrom(lv.tp1) + '</small></dd>';
    lvHtml += '<dt>2차 목표 (3R)</dt><dd>' + fmtPx(lv.tp2) + '<small>' + pctFrom(lv.tp2) + '</small></dd>';
    if (v.open) lvHtml += '<dt>평가 손익</dt><dd class="' + (v.open.unreal >= 0 ? 'pos' : 'neg') + '">' + fmtPct(v.open.unreal, 2) + '</dd>';
  }
  $('sigLevels').innerHTML = lvHtml;

  // --- 시장 국면 ---
  const c = a.context;
  const rg = $('regName');
  rg.textContent = E.REGIME_NAME[a.regime] || '—';
  rg.className = 'pill ' + (a.regime === 'up' ? 'up' : a.regime === 'down' ? 'down' : 'neutral');
  const vp = a.vp;
  const lvls = vp ? vp.nodes.concat([{ price: vp.poc }, { price: vp.val }, { price: vp.vah }]) : [];
  const sup = lvls.filter(n => n.price < last.close * 0.999).sort((x, y) => y.price - x.price)[0];
  const res = lvls.filter(n => n.price > last.close * 1.001).sort((x, y) => x.price - y.price)[0];
  let kv = '';
  kv += '<dt>ADX 14</dt><dd>' + (c.adx != null ? c.adx.toFixed(1) : '—') + '<small>' + (c.adx >= 25 ? '추세 강함' : c.adx >= 20 ? '추세 형성' : '추세 약함') + '</small></dd>';
  kv += '<dt>+DI / −DI</dt><dd>' + (c.pdi != null ? c.pdi.toFixed(1) + ' / ' + c.mdi.toFixed(1) : '—') + '</dd>';
  kv += '<dt>볼린저 폭</dt><dd>' + (c.bbPct != null ? '하위 ' + Math.round(c.bbPct * 100) + '%' : '—') + '<small>' + (c.bbPct != null && c.bbPct <= 0.2 ? '수축 · 변동성 임박' : c.bbPct >= 0.8 ? '확장' : '보통') + '</small></dd>';
  if (vp) {
    kv += '<dt>VPVR POC</dt><dd>' + fmtPx(vp.poc) + '</dd>';
    kv += '<dt>밸류 영역</dt><dd>' + fmtPx(vp.val) + ' ~ ' + fmtPx(vp.vah) + '</dd>';
    kv += '<dt>근접 지지 매물대</dt><dd>' + (sup ? fmtPx(sup.price) + '<small>' + fmtPct((sup.price - last.close) / last.close) + '</small>' : '—') + '</dd>';
    kv += '<dt>근접 저항 매물대</dt><dd>' + (res ? fmtPx(res.price) + '<small>' + fmtPct((res.price - last.close) / last.close) + '</small>' : '—') + '</dd>';
  }
  $('regKv').innerHTML = kv;

  // --- 자동 적용 ---
  $('autoBtn').disabled = state.view === 'auto';
  $('autoBtn').textContent = state.view === 'auto' ? '자동 적용 중' : '자동으로 되돌리기';
  $('autoDesc').textContent = a.method === 'regime'
    ? '시장 국면(ADX·DI·EMA50)별로 과거 성과가 가장 좋은 지표를 골라, 현재 국면에 맞는 지표를 차트에 자동 적용합니다.'
    : '최근 검증에서는 국면별 선택보다 단일 최적 지표가 더 안정적이어서, 전 구간 최고 점수 지표를 자동 적용합니다.';
  let sh = '<tr><th>국면</th><th>적용 지표</th><th class="num">국면 승률</th><th class="num">PF</th></tr>';
  for (const g of ['up', 'down', 'range']) {
    const id = a.selection[g];
    const st = id ? a.regimeTable[id][g] : null;
    sh += '<tr class="' + (g === a.regime ? 'cur-reg' : '') + '"><td>' + (g === a.regime ? '▸ ' : '') + E.REGIME_NAME[g] + '</td><td>' + (id ? E.STRAT_BY_ID[id].name : '관망') + '</td>'
      + '<td class="num">' + (st && st.trades ? Math.round(st.winRate * 100) + '% <span class="muted">(' + st.trades + ')</span>' : '—') + '</td>'
      + '<td class="num">' + (st && st.trades ? st.pf.toFixed(2) : '—') + '</td></tr>';
  }
  $('selTbl').innerHTML = sh;
  const w = a.adaptive.stats;
  const other = a.metas[a.method === 'regime' ? 'single' : 'regime'].stats;
  $('wfBox').innerHTML = '<b>워크포워드 검증</b> (과거 데이터로만 고른 지표를 다음 구간에 적용)<br>'
    + '거래 ' + w.trades + '회 · 승률 ' + Math.round(w.winRate * 100) + '% · PF ' + w.pf.toFixed(2)
    + ' · 수익 <span class="' + (w.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(w.ret) + '</span> · MDD ' + fmtPct(-w.mdd)
    + '<br><span class="muted">비교: ' + (a.method === 'regime' ? '단일 최적' : '국면별') + ' 방식 수익 ' + fmtPct(other.ret) + ', 같은 기간 보유 ' + fmtPct(bars[bars.length - 1].close / bars[a.adaptive.from].close - 1) + '</span>';

  // --- 순위 ---
  $('btMeta').textContent = bars.length + '봉 · ' + (state.mode === 'long' ? '롱만' : '롱·숏');
  let rh = '<thead><tr><th>지표</th><th class="num">승률</th><th class="num">PF</th><th class="num">수익</th><th class="num">MDD</th><th class="num">점수</th></tr></thead><tbody>';
  rh += '<tr data-id="auto" class="' + (state.view === 'auto' ? 'on' : '') + '"><td><span class="nm">✦ 자동 (' + (a.method === 'regime' ? '국면 적응' : '단일 최적') + ')</span></td>'
    + '<td class="num">' + Math.round(w.winRate * 100) + '%</td><td class="num">' + w.pf.toFixed(2) + '</td><td class="num ' + (w.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(w.ret) + '</td><td class="num">' + fmtPct(-w.mdd, 0) + '</td><td class="num">' + w.score.toFixed(0) + '</td></tr>';
  a.rows.forEach((r, i) => {
    const s = r.oos;
    rh += '<tr data-id="' + r.id + '" class="' + (state.view === r.id ? 'on' : '') + '" title="' + r.desc + '\n전체 구간: 거래 ' + r.full.trades + ' · 승률 ' + Math.round(r.full.winRate * 100) + '% · 수익 ' + fmtPct(r.full.ret) + '">'
      + '<td><span class="nm">' + (i + 1) + '. ' + r.name + '</span><span class="kind">' + r.kind + '</span></td>'
      + '<td class="num">' + (s.trades ? Math.round(s.winRate * 100) + '%' : '—') + ' <span class="muted">' + s.trades + '</span></td>'
      + '<td class="num">' + (s.trades ? s.pf.toFixed(2) : '—') + '</td>'
      + '<td class="num ' + (s.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(s.ret) + '</td>'
      + '<td class="num">' + fmtPct(-s.mdd, 0) + '</td>'
      + '<td class="num">' + s.score.toFixed(0) + '</td></tr>';
  });
  $('rankTbl').innerHTML = rh + '</tbody>';
}

/* ===================== 범례 · 가격 ===================== */
function updateLegend(param) {
  let b = null;
  if (param && param.time != null) b = bars.find(x => x.time === param.time);
  if (!b) b = bars[bars.length - 1];
  if (!b) { $('lgOhlc').innerHTML = ''; return; }
  const i = bars.indexOf(b);
  const prev = i > 0 ? bars[i - 1].close : b.open;
  const ch = (b.close - prev) / prev;
  $('lgOhlc').innerHTML = '시 <b>' + fmtPx(b.open) + '</b>고 <b>' + fmtPx(b.high) + '</b>저 <b>' + fmtPx(b.low) + '</b>종 <b class="' + (ch >= 0 ? 'up-t' : 'down-t') + '">' + fmtPx(b.close) + ' (' + fmtPct(ch, 2) + ')</b>';
}

let dayRef = null; // 24시간 등락 기준가
function onPrice(price) {
  $('pcPrice').textContent = fmtPx(price);
  if (dayRef) {
    const ch = (price - dayRef) / dayRef;
    $('pcChg').textContent = fmtPct(ch, 2) + ' (24h)';
    $('pcChg').className = ch >= 0 ? 'up-t' : 'down-t';
  }
  $('pcKrw').textContent = state.quote === 'USDT' && usdKrw ? '≈ ' + fmtKrw(price * usdKrw) : '';
  try { document.title = fmtPx(price) + ' · ' + state.sym + ' — 트레이딩 챠트'; } catch (e) {}
  updateLegend(null);
  // 보유 포지션 평가손익 실시간 반영
  if (analysis) {
    const v = currentView();
    if (v && v.open) {
      v.open.unreal = (v.open.dir === 1 ? price / v.open.entry : v.open.entry / price) - 1;
      const dd = $('sigLevels').querySelector('dd:last-child');
      if (dd) { dd.textContent = fmtPct(v.open.unreal, 2); dd.className = v.open.unreal >= 0 ? 'pos' : 'neg'; }
    }
  }
}

async function refreshDayRef() {
  try {
    if (!source) return;
    if (source.kind === 'binance') { const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + source.market); dayRef = +j.openPrice; }
    else if (source.kind === 'upbit') { const j = await getJSON('https://api.upbit.com/v1/ticker?markets=' + source.market); dayRef = j[0].prev_closing_price; }
    else if (source.kind === 'okx') { const j = await getJSON('https://www.okx.com/api/v5/market/ticker?instId=' + source.market); dayRef = +j.data[0].open24h; }
    if (bars.length) onPrice(bars[bars.length - 1].close);
  } catch (e) {}
}

async function refreshFx() {
  try { const j = await getJSON('https://api.upbit.com/v1/ticker?markets=KRW-USDT'); usdKrw = j[0].trade_price; }
  catch (e) {}
}

/* ===================== 로드 ===================== */
async function load(symRaw) {
  const parsed = parseSymbol(symRaw);
  if (!parsed) { toast('심볼 형식을 확인하세요 (예: BTC, ETH, KRW-XRP)'); return; }
  if (parsed.quote && parsed.quote !== state.quote) { state.quote = parsed.quote; syncSegs(); }
  const seq = ++loadSeq;
  if (load.ctrl) load.ctrl.abort();
  const ctrl = load.ctrl = new AbortController();
  chartStream.stop(); setLive(false);
  $('loading').classList.remove('hidden');
  $('loadingText').textContent = parsed.base + '/' + state.quote + ' ' + TF[state.tf].label + ' 불러오는 중…';
  try {
    const { data, src } = await loadHistory(parsed.base, state.quote, state.tf, ctrl.signal);
    if (seq !== loadSeq) return;
    state.sym = parsed.base; source = src; bars = data; dayRef = null;
    save();
    $('symInput').value = '';
    $('symInput').placeholder = parsed.base + ' · 심볼 검색';
    $('lgSym').textContent = parsed.base + '/' + state.quote;
    $('lgExch').textContent = src.exch;
    $('lgTf').textContent = TF[state.tf].label;
    $('pcName').textContent = parsed.base + ' / ' + state.quote;
    $('pcSrc').textContent = src.exch + ' 실시간';
    const pf = priceFormatFor(bars[bars.length - 1].close);
    candle.applyOptions({ priceFormat: pf });
    candle.setData(bars);
    volume.setData(bars.map(volBar));
    main.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - (window.innerWidth < 700 ? 90 : 180)), to: bars.length + 6 });
    onPrice(bars[bars.length - 1].close);
    runAnalysis();
    main.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - (window.innerWidth < 700 ? 90 : 180)), to: bars.length + 6 });
    startLive();
    refreshDayRef();
    renderWatch();
  } catch (e) {
    if (e.name === 'AbortError' || seq !== loadSeq) return;
    console.warn(e);
    toast(parsed.base + '/' + state.quote + ' 데이터를 불러오지 못했습니다' + (state.quote === 'KRW' ? ' (업비트 원화 마켓 미상장일 수 있습니다)' : ' (바이낸스·OKX 미상장일 수 있습니다)'));
    if (source) startLive();
  } finally {
    if (seq === loadSeq) $('loading').classList.add('hidden');
  }
}

/* ===================== 관심종목 ===================== */
const watchPx = new Map();
function renderWatch() {
  const ul = $('watchList');
  ul.innerHTML = '';
  for (const s of state.watch) {
    const li = document.createElement('li');
    li.className = s === state.sym ? 'on' : '';
    const q = watchPx.get(s);
    li.innerHTML = '<span class="w-s"></span><span class="w-p"></span><span class="w-c"></span><button class="w-x" title="삭제" aria-label="삭제">✕</button>';
    li.children[0].textContent = s;
    li.children[1].textContent = q ? fmtPx(q.p) : '—';
    li.children[2].textContent = q ? fmtPct(q.c, 2) : '';
    li.children[2].className = 'w-c ' + (q && q.c >= 0 ? 'up-t' : 'down-t');
    li.dataset.s = s;
    li.onclick = () => load(s);
    li.children[3].onclick = ev => { ev.stopPropagation(); state.watch = state.watch.filter(x => x !== s); save(); renderWatch(); startWatch(); };
    ul.appendChild(li);
  }
}
function updateWatchRow(s) {
  const li = $('watchList').querySelector('li[data-s="' + s + '"]');
  const q = watchPx.get(s);
  if (!li || !q) return;
  li.children[1].textContent = fmtPx(q.p);
  li.children[2].textContent = fmtPct(q.c, 2);
  li.children[2].className = 'w-c ' + (q.c >= 0 ? 'up-t' : 'down-t');
}

async function startWatch() {
  watchStreams.binance.stop(); watchStreams.upbit.stop();
  watchPx.clear();
  const list = state.watch.slice();
  if (!list.length) return;
  if (state.quote === 'KRW') {
    const codes = list.map(s => 'KRW-' + s);
    try {
      const j = await getJSON('https://api.upbit.com/v1/ticker?markets=' + codes.join(','));
      for (const t of j) watchPx.set(t.market.slice(4), { p: t.trade_price, c: t.signed_change_rate });
    } catch (e) {
      // 미상장 심볼이 섞이면 한 번에 실패하므로 개별 조회
      for (const c of codes) { try { const j = await getJSON('https://api.upbit.com/v1/ticker?markets=' + c); watchPx.set(c.slice(4), { p: j[0].trade_price, c: j[0].signed_change_rate }); } catch (er) {} await sleep(120); }
    }
    renderWatch();
    watchStreams.upbit.open('wss://api.upbit.com/websocket/v1', {
      binary: true,
      onOpen: ws => ws.send(JSON.stringify([{ ticket: 'tcw-' + Date.now() }, { type: 'ticker', codes }])),
      onMessage: m => { if (m.type === 'ticker') { const s = m.code.slice(4); watchPx.set(s, { p: m.trade_price, c: m.signed_change_rate }); updateWatchRow(s); } }
    });
  } else {
    const syms = list.map(s => s + 'USDT');
    try {
      const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(syms)));
      for (const t of j) watchPx.set(t.symbol.slice(0, -4), { p: +t.lastPrice, c: +t.priceChangePercent / 100 });
    } catch (e) {
      for (const s of syms) { try { const t = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + s); watchPx.set(s.slice(0, -4), { p: +t.lastPrice, c: +t.priceChangePercent / 100 }); } catch (er) {} }
    }
    renderWatch();
    const valid = syms.filter(s => watchPx.has(s.slice(0, -4)));
    if (!valid.length) return;
    watchStreams.binance.open('wss://data-stream.binance.vision/stream?streams=' + valid.map(s => s.toLowerCase() + '@miniTicker').join('/'), {
      onMessage: m => {
        const d = m.data; if (!d) return;
        const s = d.s.slice(0, -4), p = +d.c, o = +d.o;
        watchPx.set(s, { p, c: o ? p / o - 1 : 0 }); updateWatchRow(s);
      }
    });
  }
}

/* ===================== UI 바인딩 ===================== */
function syncSegs() {
  document.querySelectorAll('#tfSeg button').forEach(b => b.classList.toggle('on', b.dataset.tf === state.tf));
  document.querySelectorAll('#quoteSeg button').forEach(b => b.classList.toggle('on', b.dataset.q === state.quote));
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
}

function applyTheme() {
  const dark = state.theme ? state.theme === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#1f1e1c' : '#f5f4ee';
  if (main) applyChartTheme();
}

function bind() {
  $('symList').innerHTML = SUGGEST.map(s => '<option value="' + s + '">').join('');
  $('symForm').onsubmit = e => { e.preventDefault(); const v = $('symInput').value; if (v.trim()) load(v); };
  document.querySelectorAll('#tfSeg button').forEach(b => b.onclick = () => { if (state.tf === b.dataset.tf) return; state.tf = b.dataset.tf; syncSegs(); load(state.sym); });
  document.querySelectorAll('#quoteSeg button').forEach(b => b.onclick = () => { if (state.quote === b.dataset.q) return; state.quote = b.dataset.q; syncSegs(); load(state.sym); startWatch(); });
  document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => { if (state.mode === b.dataset.m) return; state.mode = b.dataset.m; syncSegs(); save(); runAnalysis(); });
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme;
    state.theme = cur === 'dark' ? 'light' : 'dark'; save(); applyTheme();
  };
  $('autoBtn').onclick = () => { state.view = 'auto'; renderView(); renderPanels(); };
  $('rankTbl').onclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !analysis) return;
    state.view = tr.dataset.id;
    renderView(); renderPanels();
    toast(state.view === 'auto' ? '자동 지표 적용' : E.STRAT_BY_ID[state.view].name + ' 적용 — 차트에 매매 타점을 표시했습니다', 2200);
  };
  $('watchForm').onsubmit = e => {
    e.preventDefault();
    const p = parseSymbol($('watchInput').value);
    if (!p) return toast('심볼 형식을 확인하세요');
    if (!state.watch.includes(p.base)) { state.watch.push(p.base); save(); renderWatch(); startWatch(); }
    $('watchInput').value = '';
  };
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => { if (!state.theme) applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', fn);
  }
  // 탭 복귀 시 끊긴 연결 복구
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && source && (!chartStream.ws || chartStream.ws.readyState > 1) && source.kind !== 'okx') load(state.sym);
  });
}

function init() {
  applyTheme();
  syncSegs();
  initCharts();
  bind();
  renderWatch();
  refreshFx();
  setInterval(refreshFx, 60000);
  setInterval(refreshDayRef, 60000);
  load(state.sym);
  startWatch();
}
document.addEventListener('DOMContentLoaded', init);
