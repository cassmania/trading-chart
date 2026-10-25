/* 트레이딩 챠트 — 멀티차트(최대 8분할) · 실시간 데이터 · 자동 지표 적용 */
'use strict';
const E = window.Engine;
const $ = id => document.getElementById(id);

/* ===================== 상수 · 상태 ===================== */
const STORE_KEY = 'tc2-state';
const DEFAULT_WATCH = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ONDO'];
const DEFAULT_SYMS = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ONDO', 'ADA', 'LINK'];
const SUGGEST = ['BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'TRX', 'SUI', 'APT', 'ONDO', 'AAVE', 'NEAR', 'ARB', 'OP', 'PEPE', 'SHIB', 'BCH'];
const LAYOUTS = [1, 2, 3, 4, 6, 8];
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
  quote: 'USDT', mode: 'long', theme: null, layout: 1, active: 0,
  panes: DEFAULT_SYMS.map(s => ({ sym: s, tf: 'h4' })),
  watch: DEFAULT_WATCH.slice()
};
try {
  const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (s && typeof s === 'object') {
    for (const k of ['quote', 'mode', 'theme']) if (typeof s[k] === 'string') state[k] = s[k];
    if (LAYOUTS.includes(s.layout)) state.layout = s.layout;
    if (Number.isInteger(s.active)) state.active = s.active;
    if (Array.isArray(s.watch) && s.watch.length) state.watch = s.watch.filter(x => typeof x === 'string').slice(0, 30);
    if (Array.isArray(s.panes)) s.panes.slice(0, 8).forEach((p, i) => { if (p && typeof p.sym === 'string') state.panes[i] = { sym: p.sym, tf: TF[p.tf] ? p.tf : 'h4' }; });
    else if (typeof s.sym === 'string') state.panes[0] = { sym: s.sym, tf: TF[s.tf] ? s.tf : 'h4' }; // 이전 버전 저장값
  }
} catch (e) { /* 저장소 사용 불가 시 기본값 */ }
if (!['USDT', 'KRW'].includes(state.quote)) state.quote = 'USDT';
if (!['long', 'both'].includes(state.mode)) state.mode = 'long';
if (state.active >= state.layout || state.active < 0) state.active = 0;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      quote: state.quote, mode: state.mode, theme: state.theme, layout: state.layout, active: state.active,
      panes: state.panes, watch: state.watch
    }));
  } catch (e) {}
}

let panes = [];
let usdKrw = null;
const activePane = () => panes[state.active] || panes[0];

/* ===================== 포맷 ===================== */
function decimalsFor(v) {
  const a = Math.abs(v), krw = state.quote === 'KRW';
  if (a >= 100) return krw ? 0 : 2;
  if (a >= 1) return krw ? 2 : 3;
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
const kstParts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
function fmtTime(t) { return kstFmt.format(new Date(t * 1000)).replace(/\. /g, '-').replace('.', ''); }
function oscFmt(v) {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 10) return v.toFixed(1);
  if (a >= 0.1 || a === 0) return v.toFixed(2);
  return v.toPrecision(3);
}
function tickFormatter(t, type) {
  const parts = Object.fromEntries(kstParts.formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
  if (type === 0) return parts.year + '년';
  if (type === 1) return parts.month + '월';
  if (type === 2) return parts.month + '/' + parts.day;
  return parts.hour + ':' + parts.minute;
}

function toast(msg, ms = 3200) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===================== 심볼 · 시간 ===================== */
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
function bucketStart(tSec, tf) {
  if (tf === 'W') { const day = Math.floor(tSec / 86400); return (day - ((day + 3) % 7)) * 86400; }
  if (tf === 'M') { const d = new Date(tSec * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
  return Math.floor(tSec / TF[tf].sec) * TF[tf].sec;
}

/* ===================== REST ===================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, signal) {
  const r = await fetch(url, { signal, cache: 'no-store' });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
// 업비트는 초당 요청 수 제한이 있어 모든 차트의 요청을 한 줄로 세웁니다.
let upbitChain = Promise.resolve();
function upbitJSON(url, signal) {
  const job = upbitChain.then(async () => {
    for (let k = 0; k < 4; k++) {
      if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
      try { const j = await getJSON(url, signal); await sleep(110); return j; }
      catch (e) { if (e.status === 429) { await sleep(700); continue; } await sleep(110); throw e; }
    }
    throw new Error('업비트 요청 제한');
  });
  upbitChain = job.catch(() => {});
  return job;
}
// OKX도 IP당 요청 제한이 있어 순차 처리
let okxChain = Promise.resolve();
function okxJSON(url, signal) {
  const job = okxChain.then(async () => { const j = await getJSON(url, signal); await sleep(120); return j; });
  okxChain = job.catch(() => {});
  return job;
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

async function binanceHistory(base, tf, signal) {
  const j = await getJSON('https://data-api.binance.vision/api/v3/klines?symbol=' + base + 'USDT&interval=' + TF[tf].binance + '&limit=' + BARS, signal);
  if (!Array.isArray(j) || j.length < 30) throw new Error('데이터 부족');
  return j.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}
async function okxHistory(base, tf, signal) {
  const inst = base + '-USDT', bar = TF[tf].okx;
  const out = [];
  let after = '';
  for (let p = 0; p < 4 && out.length < BARS; p++) {
    const ep = p === 0 ? 'candles' : 'history-candles';
    const j = await okxJSON('https://www.okx.com/api/v5/market/' + ep + '?instId=' + inst + '&bar=' + bar + '&limit=' + (p === 0 ? 300 : 100) + (after ? '&after=' + after : ''), signal);
    if (j.code !== '0' || !Array.isArray(j.data) || !j.data.length) break;
    out.push(...j.data);
    after = j.data[j.data.length - 1][0];
  }
  if (out.length < 30) throw new Error('데이터 부족');
  return out.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
}
async function upbitHistory(base, tf, signal) {
  const market = 'KRW-' + base, c = TF[tf];
  const target = c.resample ? BARS * c.resample : BARS;
  const rows = [];
  let to = '';
  while (rows.length < target) {
    const count = Math.min(200, target - rows.length);
    const page = await upbitJSON('https://api.upbit.com/v1/candles/' + c.upbit + '?market=' + market + '&count=' + count + (to ? '&to=' + encodeURIComponent(to) : ''), signal);
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    to = page[page.length - 1].candle_date_time_utc + 'Z';
    if (page.length < count) break;
  }
  if (rows.length < 30) throw new Error('데이터 부족');
  let data = normalize(rows.map(r => ({
    time: Math.floor(Date.parse(r.candle_date_time_utc + 'Z') / 1000),
    open: r.opening_price, high: r.high_price, low: r.low_price, close: r.trade_price, volume: r.candle_acc_trade_volume
  })));
  if (c.resample) data = resample(data, tf);
  return data;
}
async function loadHistory(base, quote, tf, signal) {
  if (quote === 'KRW') return { data: await upbitHistory(base, tf, signal), src: { exch: '업비트', kind: 'upbit', market: 'KRW-' + base } };
  try {
    return { data: normalize(await binanceHistory(base, tf, signal)), src: { exch: '바이낸스', kind: 'binance', market: base + 'USDT' } };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { data: normalize(await okxHistory(base, tf, signal)), src: { exch: 'OKX', kind: 'okx', market: base + '-USDT' } };
  }
}

/* ===================== WebSocket 허브 ===================== */
// 모든 차트·관심종목이 거래소별 WebSocket 1개를 공유합니다.
class Socket {
  constructor(name) { this.name = name; this.ws = null; this.url = ''; this.retry = 0; this.timer = null; this.onMessage = null; this.onOpen = null; this.binary = false; this.connected = false; }
  open(url, { onOpen, onMessage, binary } = {}) {
    if (this.url === url && this.ws && this.ws.readyState <= 1) { this.onOpen = onOpen; this.onMessage = onMessage; if (this.ws.readyState === 1 && onOpen) onOpen(this.ws); return; }
    this.close();
    this.url = url; this.onOpen = onOpen; this.onMessage = onMessage; this.binary = !!binary;
    this.connect();
  }
  connect() {
    if (!this.url) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { return this.reconnect(); }
    if (this.binary) ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.connected = true; this.onOpen && this.onOpen(ws); refreshLiveDots(); };
    ws.onmessage = ev => {
      let txt = ev.data;
      if (txt instanceof ArrayBuffer) txt = new TextDecoder().decode(txt);
      try { this.onMessage && this.onMessage(JSON.parse(txt)); } catch (e) {}
    };
    ws.onerror = () => {};
    ws.onclose = () => { this.connected = false; refreshLiveDots(); if (this.ws === ws) this.reconnect(); };
  }
  reconnect() {
    clearTimeout(this.timer);
    if (!this.url) return;
    this.timer = setTimeout(() => this.connect(), Math.min(15000, 1000 * 2 ** this.retry++));
  }
  close() {
    clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null; this.url = ''; this.connected = false;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; try { ws.close(); } catch (e) {} }
  }
  get alive() { return this.connected && this.ws && this.ws.readyState === 1; }
}
const binanceWS = new Socket('binance');
const upbitWS = new Socket('upbit');
const watchPx = new Map();
let watchValid = []; // 바이낸스 미니티커 구독 대상
let resubTimer = null;
function resubscribe() { clearTimeout(resubTimer); resubTimer = setTimeout(doResubscribe, 250); }
function doResubscribe() {
  // 바이낸스: 차트 kline + 관심종목 miniTicker
  const bStreams = new Set();
  for (const p of panes) if (p.source && p.source.kind === 'binance') bStreams.add(p.source.market.toLowerCase() + '@kline_' + TF[p.tf].binance);
  if (state.quote === 'USDT') for (const s of watchValid) bStreams.add(s.toLowerCase() + 'usdt@miniTicker');
  if (bStreams.size) {
    binanceWS.open('wss://data-stream.binance.vision/stream?streams=' + [...bStreams].sort().join('/'), {
      onMessage: m => {
        const d = m && m.data; if (!d) return;
        if (d.e === 'kline') {
          const k = d.k, key = d.s + '|' + k.i;
          for (const p of panes) if (p.source && p.source.kind === 'binance' && p.source.market + '|' + TF[p.tf].binance === key) {
            p.applyBar({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
          }
        } else if (d.e === '24hrMiniTicker') {
          const s = d.s.slice(0, -4), px = +d.c, o = +d.o;
          watchPx.set(s, { p: px, c: o ? px / o - 1 : 0 }); updateWatchRow(s);
        }
      }
    });
  } else binanceWS.close();

  // 업비트: 차트 체결(trade) + 관심종목 시세(ticker)
  const trades = [...new Set(panes.filter(p => p.source && p.source.kind === 'upbit').map(p => p.source.market))];
  const tickers = state.quote === 'KRW' ? state.watch.map(s => 'KRW-' + s) : [];
  if (trades.length || tickers.length) {
    const req = [{ ticket: 'tc-' + Date.now() }];
    if (trades.length) req.push({ type: 'trade', codes: trades, is_only_realtime: true });
    if (tickers.length) req.push({ type: 'ticker', codes: tickers });
    const payload = JSON.stringify(req);
    // 구독 목록이 바뀌면 같은 연결에서 다시 요청 (업비트는 마지막 요청으로 구독 교체)
    upbitWS.open('wss://api.upbit.com/websocket/v1', {
      binary: true,
      onOpen: ws => { try { ws.send(payload); } catch (e) {} },
      onMessage: m => {
        if (m.type === 'trade') { for (const p of panes) if (p.source && p.source.kind === 'upbit' && p.source.market === m.code) p.applyTrade(m.trade_timestamp / 1000, m.trade_price, m.trade_volume); }
        else if (m.type === 'ticker') { const s = m.code.slice(4); watchPx.set(s, { p: m.trade_price, c: m.signed_change_rate }); updateWatchRow(s); }
      }
    });
  } else upbitWS.close();
  refreshLiveDots();
}
function refreshLiveDots() { for (const p of panes) p.updateLive(); }

/* ===================== 차트 공통 ===================== */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
let PAL = null;
function palette() {
  if (!PAL) PAL = {
    bg: cssVar('--surface'), text: cssVar('--text'), muted: cssVar('--muted'), line: cssVar('--line'),
    accent: cssVar('--accent'), up: cssVar('--up'), down: cssVar('--down'), buy: cssVar('--buy'), sell: cssVar('--sell'),
    blue: '#5b8ff9', violet: '#8b6fd6', teal: '#2aa198', gray: cssVar('--muted'), bad: cssVar('--bad')
  };
  return PAL;
}
function chartOptions(isOsc) {
  const p = palette();
  const grid = document.documentElement.dataset.theme === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(31,30,27,.05)';
  return {
    layout: { background: { type: 'solid', color: p.bg }, textColor: p.muted, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11 },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: p.line },
    timeScale: { borderColor: p.line, timeVisible: true, secondsVisible: false, rightOffset: 6, tickMarkFormatter: tickFormatter },
    crosshair: { mode: 0, vertLine: { color: p.muted, labelBackgroundColor: p.accent, style: 3 }, horzLine: { color: p.muted, labelBackgroundColor: p.accent, style: 3 } },
    localization: { locale: 'ko-KR', timeFormatter: t => fmtTime(t), priceFormatter: isOsc ? oscFmt : v => fmtPx(v) }
  };
}
function priceFormatFor(v) { const d = decimalsFor(v); return { type: 'price', precision: d, minMove: 1 / 10 ** d }; }
function confidence(st) {
  if (!st || st.trades < 5) return { label: '표본 부족', cls: 'warn' };
  if (st.pf >= 1.5 && st.lb >= 0.4 && st.ret > 0) return { label: '신뢰도 높음', cls: 'good' };
  if (st.pf >= 1.1 && st.ret > 0) return { label: '신뢰도 보통', cls: 'warn' };
  return { label: '신뢰도 낮음', cls: 'bad' };
}

/* ===================== 차트 패널 ===================== */
class Pane {
  constructor(idx, cfg) {
    this.idx = idx; this.sym = cfg.sym; this.tf = cfg.tf;
    this.bars = []; this.source = null; this.analysis = null; this.view = 'auto'; this.dayRef = null; this.vp = null;
    this.seq = 0; this.ctrl = null; this.poll = null; this.analyzeTimer = null;
    this.overlay = []; this.oscS = []; this.lines = [];
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.className = 'pane';
    el.innerHTML =
      '<div class="pane-bar">'
      + '<input class="p-sym" spellcheck="false" aria-label="심볼"/>'
      + '<select class="p-tf" aria-label="시간봉">' + Object.entries(TF).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('') + '</select>'
      + '<span class="badge p-ex">—</span><span class="live p-live"></span>'
      + '<span class="p-px">—</span><span class="p-ch"></span>'
      + '<span class="pill p-sig">—</span>'
      + '<button class="p-max" title="이 차트 크게 보기" aria-label="크게 보기">⤢</button>'
      + '</div>'
      + '<div class="pane-body">'
      + '<div class="legend"><div class="lg-row1"><b class="lg-sym">—</b><span class="lg-tf"></span></div><div class="lg-row2"></div><div class="lg-row3"></div></div>'
      + '<div class="chart main"></div><div class="osc-head"></div><div class="chart osc"></div>'
      + '<div class="loading hidden"><span class="spinner"></span><span class="l-txt">불러오는 중…</span></div>'
      + '</div>';
    const q = s => el.querySelector(s);
    this.el = el;
    this.$ = { sym: q('.p-sym'), tf: q('.p-tf'), ex: q('.p-ex'), live: q('.p-live'), px: q('.p-px'), ch: q('.p-ch'), sig: q('.p-sig'), max: q('.p-max'),
      lgSym: q('.lg-sym'), lgTf: q('.lg-tf'), lg2: q('.lg-row2'), lg3: q('.lg-row3'), main: q('.chart.main'), osc: q('.chart.osc'), oscHead: q('.osc-head'), loading: q('.loading'), lTxt: q('.l-txt') };
    this.$.sym.value = this.sym;
    this.$.tf.value = this.tf;
    this.$.sym.addEventListener('keydown', e => { if (e.key === 'Enter') { this.$.sym.blur(); this.load(this.$.sym.value); } if (e.key === 'Escape') { this.$.sym.value = this.sym; this.$.sym.blur(); } });
    this.$.sym.addEventListener('blur', () => { if (!this.$.sym.value.trim()) this.$.sym.value = this.sym; });
    this.$.tf.addEventListener('change', () => { this.tf = this.$.tf.value; this.persist(); this.load(this.sym); if (this === activePane()) syncSegs(); });
    this.$.max.addEventListener('click', ev => { ev.stopPropagation(); toggleMax(this); });
    el.addEventListener('mousedown', () => setActive(this.idx));
    el.addEventListener('touchstart', () => setActive(this.idx), { passive: true });
  }

  mount(host) {
    host.appendChild(this.el);
    const LW = LightweightCharts;
    this.main = LW.createChart(this.$.main, Object.assign(chartOptions(false), { autoSize: true }));
    this.osc = LW.createChart(this.$.osc, Object.assign(chartOptions(true), { autoSize: true }));
    const p = palette();
    this.candle = this.main.addCandlestickSeries({ upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down, priceLineColor: p.accent, priceLineStyle: 2 });
    this.volume = this.main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    this.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    this.candle.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.18 } });
    let syncing = false;
    const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange(r => { if (syncing || !r) return; syncing = true; b.timeScale().setVisibleLogicalRange(r); syncing = false; });
    sync(this.main, this.osc); sync(this.osc, this.main);
    this.main.subscribeCrosshairMove(param => this.updateLegend(param));
  }

  destroy() {
    if (this.ctrl) this.ctrl.abort();
    clearInterval(this.poll); clearTimeout(this.analyzeTimer);
    try { this.main.remove(); this.osc.remove(); } catch (e) {}
    this.el.remove();
    this.source = null;
  }

  persist() { state.panes[this.idx] = { sym: this.sym, tf: this.tf }; save(); }

  setDensity(n) {
    this.el.classList.toggle('no-osc', n >= 6);
    this.el.classList.toggle('compact', n >= 3);
    this.el.classList.toggle('tiny', n >= 6);
    this.dense = n >= 4;
    if (this.analysis) this.renderView();
  }

  updateLive() {
    const s = this.source;
    const on = !!s && (s.kind === 'binance' ? binanceWS.alive : s.kind === 'upbit' ? upbitWS.alive : !!this.okxOk);
    this.$.live.classList.toggle('on', on);
    this.$.live.title = on ? '실시간 연결됨' : '연결 대기';
  }

  async load(symRaw) {
    const parsed = parseSymbol(symRaw);
    if (!parsed) { toast('심볼 형식을 확인하세요 (예: BTC, ETH, KRW-XRP)'); this.$.sym.value = this.sym; return; }
    if (parsed.quote && parsed.quote !== state.quote) { setQuote(parsed.quote, parsed.base, this); return; }
    const seq = ++this.seq;
    if (this.ctrl) this.ctrl.abort();
    const ctrl = this.ctrl = new AbortController();
    clearInterval(this.poll); this.okxOk = false;
    this.$.loading.classList.remove('hidden');
    this.$.lTxt.textContent = parsed.base + '/' + state.quote + ' ' + TF[this.tf].label + ' 불러오는 중…';
    try {
      const { data, src } = await loadHistory(parsed.base, state.quote, this.tf, ctrl.signal);
      if (seq !== this.seq) return;
      this.sym = parsed.base; this.source = src; this.bars = data; this.dayRef = null; this.view = 'auto';
      this.persist();
      this.$.sym.value = this.sym;
      this.$.ex.textContent = src.exch;
      this.$.lgSym.textContent = this.sym + '/' + state.quote;
      this.$.lgTf.textContent = TF[this.tf].label;
      this.candle.applyOptions({ priceFormat: priceFormatFor(data[data.length - 1].close) });
      this.candle.setData(data);
      this.volume.setData(data.map(b => this.volBar(b)));
      this.runAnalysis();
      this.fitRecent();
      this.onPrice(data[data.length - 1].close);
      if (src.kind === 'okx') this.startOkxPoll();
      resubscribe();
      this.refreshDayRef();
      if (this === activePane()) { renderSide(); renderWatch(); }
    } catch (e) {
      if (e.name === 'AbortError' || seq !== this.seq) return;
      console.warn(e);
      this.$.sym.value = this.sym;
      toast('차트 ' + (this.idx + 1) + ': ' + parsed.base + '/' + state.quote + ' 데이터를 불러오지 못했습니다' + (state.quote === 'KRW' ? ' (업비트 원화 마켓 미상장일 수 있음)' : ' (바이낸스·OKX 미상장일 수 있음)'));
    } finally {
      if (seq === this.seq) this.$.loading.classList.add('hidden');
    }
  }

  fitRecent() {
    const w = this.$.main.clientWidth || 600;
    const n = Math.max(50, Math.min(220, Math.floor(w / 6)));
    this.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, this.bars.length - n), to: this.bars.length + 4 });
  }

  startOkxPoll() {
    const run = async () => {
      try {
        const j = await okxJSON('https://www.okx.com/api/v5/market/candles?instId=' + this.source.market + '&bar=' + TF[this.tf].okx + '&limit=2');
        if (!j.data || !j.data.length) return;
        for (const k of j.data.slice().reverse()) this.applyBar({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
        this.okxOk = true;
      } catch (e) { this.okxOk = false; }
      this.updateLive();
    };
    this.poll = setInterval(run, 4000);
    run();
  }

  volBar(b) { const p = palette(); return { time: b.time, value: b.volume, color: (b.close >= b.open ? p.up : p.down) + '55' }; }

  // 바이낸스/OKX 봉 갱신
  applyBar(bar) {
    const bars = this.bars;
    if (!bars.length) return;
    const last = bars[bars.length - 1];
    if (bar.time < last.time) return;
    const isNew = bar.time > last.time;
    if (isNew) bars.push(bar); else Object.assign(last, bar);
    this.candle.update(bar); this.volume.update(this.volBar(bar));
    this.onPrice(bar.close);
    if (isNew) this.scheduleAnalyze();
  }

  // 업비트 체결 → 봉 집계
  applyTrade(tSec, price, qty) {
    const bars = this.bars;
    if (!bars.length || !Number.isFinite(price)) return;
    const t = bucketStart(tSec, this.tf);
    const last = bars[bars.length - 1];
    if (t < last.time) return;
    if (t === last.time) {
      last.high = Math.max(last.high, price); last.low = Math.min(last.low, price); last.close = price; last.volume += qty || 0;
      this.candle.update(last); this.volume.update(this.volBar(last));
    } else {
      const b = { time: t, open: price, high: price, low: price, close: price, volume: qty || 0 };
      bars.push(b); this.candle.update(b); this.volume.update(this.volBar(b));
      this.scheduleAnalyze();
    }
    this.onPrice(price);
  }

  scheduleAnalyze() {
    clearTimeout(this.analyzeTimer);
    this.analyzeTimer = setTimeout(() => { this.runAnalysis(); if (this === activePane()) renderSide(); }, 300 + this.idx * 80);
  }

  runAnalysis() {
    if (this.bars.length < 120) { this.analysis = null; this.clearOverlays(); this.$.sig.textContent = '데이터 부족'; this.$.sig.className = 'pill p-sig'; return; }
    try { this.analysis = E.analyze(this.bars, { mode: state.mode }); } // 형성 중인 마지막 봉은 신호에서 제외
    catch (e) { console.error(e); this.analysis = null; return; }
    this.renderView();
  }

  currentView() {
    const a = this.analysis;
    if (!a) return null;
    if (this.view !== 'auto') {
      const row = a.rows.find(r => r.id === this.view);
      if (row) return { kind: 'single', id: row.id, name: row.name, trades: row.trades, open: row.open, pending: row.pending, stats: row.oos };
      this.view = 'auto';
    }
    const ad = a.adaptive, id = a.chosen || a.rows[0].id;
    return { kind: 'auto', id, name: E.STRAT_BY_ID[id].name, trades: ad.trades, open: ad.open, pending: ad.pending, stats: ad.stats };
  }

  clearOverlays() {
    for (const s of this.overlay) this.main.removeSeries(s);
    for (const s of this.oscS) this.osc.removeSeries(s);
    for (const l of this.lines) this.candle.removePriceLine(l);
    this.overlay = []; this.oscS = []; this.lines = [];
  }

  sData(arr) { return this.bars.map((b, i) => arr[i] == null || !Number.isFinite(arr[i]) ? { time: b.time } : { time: b.time, value: arr[i] }); }

  addLine(onOsc, arr, color, opts = {}) {
    const chart = onOsc ? this.osc : this.main;
    const s = chart.addLineSeries(Object.assign({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, opts));
    s.setData(this.sData(arr));
    (onOsc ? this.oscS : this.overlay).push(s);
    return s;
  }

  renderView() {
    if (!this.analysis || !this.bars.length) return;
    this.clearOverlays();
    const v = this.currentView();
    const built = this.analysis.prep.built[v.id];
    this.drawOverlay(built);
    if (!this.el.classList.contains('no-osc')) this.drawOsc(built.osc);
    this.drawMarkers(v);
    this.drawLevels(v);
    this.updateSigPill(v);
  }

  drawOverlay(built) {
    const p = palette(), lg = [];
    for (const o of built.overlay) {
      if (o.type === 'line') { const c = p[o.color] || o.color; this.addLine(false, o.data, c); lg.push([o.name, c]); }
      else if (o.type === 'st') {
        this.addLine(false, o.data.line.map((v, i) => o.data.dir[i] === 1 ? v : null), p.buy);
        this.addLine(false, o.data.line.map((v, i) => o.data.dir[i] === -1 ? v : null), p.sell);
        lg.push(['슈퍼트렌드 10/3', p.buy]);
      } else if (o.type === 'bb') {
        this.addLine(false, o.data.upper, p.violet, { lineWidth: 1 });
        this.addLine(false, o.data.mid, p.accent, { lineWidth: 1, lineStyle: 2 });
        this.addLine(false, o.data.lower, p.violet, { lineWidth: 1 });
        lg.push(['볼린저 20/2', p.violet]);
      } else if (o.type === 'band') {
        this.addLine(false, o.upper, p.teal, { lineWidth: 1 }); this.addLine(false, o.lower, p.teal, { lineWidth: 1 });
        lg.push([o.name + ' 20/10', p.teal]);
      } else if (o.type === 'dots') {
        this.addLine(false, o.data, p.accent, { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.6 });
        lg.push([o.name, p.accent]);
      }
    }
    const v = this.currentView();
    this.$.lg3.innerHTML = '<i style="--c:' + p.accent + '">' + esc(v.name) + (v.kind === 'auto' ? ' (자동)' : '') + '</i>' + lg.map(([n, c]) => '<i style="--c:' + c + '">' + esc(n) + '</i>').join('');
  }

  drawOsc(o) {
    const p = palette(), bars = this.bars;
    const guide = (val, color) => this.addLine(true, bars.map(() => val), color || p.line, { lineWidth: 1, lineStyle: 2 });
    let title = '';
    if (o.type === 'rsi') { guide(70, p.sell); guide(30, p.buy); guide(50); this.addLine(true, o.data, p.accent, { lastValueVisible: true }); title = 'RSI 14'; }
    else if (o.type === 'macd') {
      const h = this.osc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      h.setData(bars.map((b, i) => o.data.hist[i] == null ? { time: b.time } : { time: b.time, value: o.data.hist[i], color: (o.data.hist[i] >= 0 ? p.up : p.down) + '88' }));
      this.oscS.push(h);
      this.addLine(true, o.data.line, p.accent, { lastValueVisible: true }); this.addLine(true, o.data.signal, p.blue, { lineWidth: 1 });
      title = 'MACD 12/26/9';
    } else if (o.type === 'stoch') { guide(80, p.sell); guide(20, p.buy); this.addLine(true, o.data.K, p.accent, { lastValueVisible: true }); this.addLine(true, o.data.D, p.blue, { lineWidth: 1 }); title = '스토캐스틱 14/3/3'; }
    else if (o.type === 'cci') { guide(100, p.sell); guide(-100, p.buy); guide(0); this.addLine(true, o.data, p.accent, { lastValueVisible: true }); title = 'CCI 20'; }
    this.$.oscHead.innerHTML = '<span>' + title + '</span>';
  }

  drawMarkers(v) {
    const p = palette(), bars = this.bars, ms = [];
    const L = d => d === 1;
    for (const t of v.trades) {
      const eb = bars[t.entryIdx], xb = bars[t.exitIdx];
      if (!eb || !xb) continue;
      ms.push({ time: eb.time, position: L(t.dir) ? 'belowBar' : 'aboveBar', shape: L(t.dir) ? 'arrowUp' : 'arrowDown', color: L(t.dir) ? p.buy : p.sell, text: this.dense ? '' : L(t.dir) ? '매수' : '숏' });
      const lab = t.reason === 'stop' ? '손절 ' : L(t.dir) ? '매도 ' : '청산 ';
      ms.push({ time: xb.time, position: L(t.dir) ? 'aboveBar' : 'belowBar', shape: L(t.dir) ? 'arrowDown' : 'arrowUp', color: t.reason === 'stop' ? p.gray : (L(t.dir) ? p.sell : p.buy), text: this.dense ? '' : lab + fmtPct(t.pnl) });
    }
    if (v.open && bars[v.open.idx]) ms.push({ time: bars[v.open.idx].time, position: L(v.open.dir) ? 'belowBar' : 'aboveBar', shape: L(v.open.dir) ? 'arrowUp' : 'arrowDown', color: L(v.open.dir) ? p.buy : p.sell, text: L(v.open.dir) ? '매수 보유' : '숏 보유' });
    if (v.pending) {
      const txt = v.pending.type === 'exit' ? '청산 대기' : v.pending.dir === 1 ? '매수 대기' : '숏 대기';
      ms.push({ time: bars[bars.length - 1].time, position: v.pending.dir === 1 ? 'belowBar' : 'aboveBar', shape: 'circle', color: p.accent, text: txt });
    }
    if (v.kind === 'auto' && !this.dense && bars[this.analysis.adaptive.from]) ms.push({ time: bars[this.analysis.adaptive.from].time, position: 'aboveBar', shape: 'square', color: p.gray, text: '검증 시작' });
    ms.sort((a, b) => a.time - b.time);
    this.candle.setMarkers(ms);
  }

  levels(v) {
    if (!v) return null;
    const a = this.analysis.context.atr || 0;
    if (v.open) {
      const d = v.open.dir, risk = Math.abs(v.open.entry - v.open.stop);
      return { dir: d, entry: v.open.entry, stop: v.open.stop, tp1: v.open.entry + d * risk * 1.5, tp2: v.open.entry + d * risk * 3, open: true };
    }
    if (v.pending && v.pending.type === 'enter') {
      const d = v.pending.dir, e = this.bars[this.bars.length - 1].close, risk = 2.5 * a;
      return { dir: d, entry: e, stop: e - d * risk, tp1: e + d * risk * 1.5, tp2: e + d * risk * 3, open: false };
    }
    return null;
  }

  drawLevels(v) {
    const p = palette();
    const vp = this.vp = E.volumeProfile(this.bars, Math.min(300, this.bars.length), 48);
    const add = (price, color, title, style = 2, width = 1) => {
      if (!Number.isFinite(price)) return;
      this.lines.push(this.candle.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title: this.dense ? '' : title }));
    };
    if (vp) { add(vp.poc, p.accent, 'POC', 0); if (!this.dense) { add(vp.vah, p.gray, 'VAH'); add(vp.val, p.gray, 'VAL'); } }
    const lv = this.levels(v);
    if (lv) {
      add(lv.entry, lv.dir === 1 ? p.buy : p.sell, lv.dir === 1 ? '진입' : '숏 진입', 0, 2);
      add(lv.stop, p.bad, '손절', 1);
      add(lv.tp1, p.buy, '1차 목표', 1);
      if (!this.dense) add(lv.tp2, p.buy, '2차 목표', 1);
    }
  }

  signalText(v) {
    let txt = '관망', cls = '';
    if (v.kind === 'auto' && !this.analysis.chosen && !v.open) txt = '관망';
    if (v.open) { txt = v.open.dir === 1 ? '매수 보유' : '숏 보유'; cls = v.open.dir === 1 ? 'up' : 'down'; }
    if (v.pending) {
      if (v.pending.type === 'exit') { txt = '청산 대기'; cls = 'down'; }
      else { txt = v.pending.dir === 1 ? '매수 신호' : '숏 신호'; cls = v.pending.dir === 1 ? 'up' : 'down'; }
    }
    return { txt, cls };
  }

  updateSigPill(v) {
    const s = this.signalText(v);
    this.$.sig.textContent = s.txt;
    this.$.sig.className = 'pill p-sig ' + s.cls;
    this.$.sig.title = v.name + ' · ' + confidence(v.stats).label;
  }

  updateLegend(param) {
    const bars = this.bars;
    let b = null;
    if (param && param.time != null) b = bars.find(x => x.time === param.time);
    if (!b) b = bars[bars.length - 1];
    if (!b) { this.$.lg2.innerHTML = ''; return; }
    const i = bars.indexOf(b), prev = i > 0 ? bars[i - 1].close : b.open, ch = (b.close - prev) / prev;
    this.$.lg2.innerHTML = '시 <b>' + fmtPx(b.open) + '</b>고 <b>' + fmtPx(b.high) + '</b>저 <b>' + fmtPx(b.low) + '</b>종 <b class="' + (ch >= 0 ? 'up-t' : 'down-t') + '">' + fmtPx(b.close) + ' (' + fmtPct(ch, 2) + ')</b>';
  }

  onPrice(price) {
    this.$.px.textContent = fmtPx(price);
    if (this.dayRef) {
      const ch = (price - this.dayRef) / this.dayRef;
      this.$.ch.textContent = fmtPct(ch, 2);
      this.$.ch.className = 'p-ch ' + (ch >= 0 ? 'up-t' : 'down-t');
    }
    this.updateLegend(null);
    const v = this.currentView();
    if (v && v.open) v.open.unreal = (v.open.dir === 1 ? price / v.open.entry : v.open.entry / price) - 1;
    if (this === activePane()) sidePrice(this, price, v);
  }

  async refreshDayRef() {
    const s = this.source;
    if (!s) return;
    try {
      if (s.kind === 'binance') { const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + s.market); this.dayRef = +j.openPrice; }
      else if (s.kind === 'upbit') { const j = await upbitJSON('https://api.upbit.com/v1/ticker?markets=' + s.market); this.dayRef = j[0].prev_closing_price; }
      else if (s.kind === 'okx') { const j = await okxJSON('https://www.okx.com/api/v5/market/ticker?instId=' + s.market); this.dayRef = +j.data[0].open24h; }
      if (this.bars.length) this.onPrice(this.bars[this.bars.length - 1].close);
    } catch (e) {}
  }

  applyTheme() {
    const p = palette();
    this.main.applyOptions(chartOptions(false)); this.osc.applyOptions(chartOptions(true));
    this.candle.applyOptions({ upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down, priceLineColor: p.accent });
    if (this.bars.length) { this.volume.setData(this.bars.map(b => this.volBar(b))); this.renderView(); }
  }
}

/* ===================== 레이아웃 ===================== */
function buildLayout(n) {
  const grid = $('grid');
  const keep = panes.slice(0, n);
  for (const p of panes.slice(n)) p.destroy();
  panes = keep;
  grid.className = 'grid n' + n;
  for (let i = panes.length; i < n; i++) {
    const p = new Pane(i, state.panes[i] || { sym: DEFAULT_SYMS[i], tf: 'h4' });
    p.mount(grid);
    panes.push(p);
    // 여러 차트를 한꺼번에 열 때 요청이 몰리지 않도록 순차 시작
    setTimeout(() => p.load(p.sym), (i - keep.length) * 250);
  }
  for (const p of panes) p.setDensity(n);
  state.layout = n;
  if (state.active >= n) state.active = 0;
  setActive(state.active, true);
  syncSegs();
  save();
  resubscribe();
}

function setActive(i, force) {
  if (!panes[i]) return;
  if (state.active === i && !force) return;
  state.active = i;
  panes.forEach((p, k) => p.el.classList.toggle('active', k === i));
  syncSegs();
  renderSide();
  renderWatch();
  save();
}

function toggleMax(pane) {
  const grid = $('grid');
  const on = !pane.el.classList.contains('max');
  panes.forEach(p => p.el.classList.remove('max'));
  grid.classList.toggle('has-max', on);
  if (on) pane.el.classList.add('max');
  pane.$.max.textContent = on ? '⤡' : '⤢';
  panes.forEach(p => { if (p !== pane) p.$.max.textContent = '⤢'; p.setDensity(on && p === pane ? 1 : state.layout); });
  setActive(pane.idx);
  setTimeout(() => pane.fitRecent(), 50);
}

function setQuote(q, sym, pane) {
  if (state.quote === q) { if (pane && sym) pane.load(sym); return; }
  state.quote = q;
  syncSegs(); save();
  watchPx.clear();
  panes.forEach((p, i) => setTimeout(() => p.load(p === pane && sym ? sym : p.sym), i * 250));
  startWatch();
}

/* ===================== 사이드바 ===================== */
function sidePrice(pane, price, v) {
  $('pcPrice').textContent = fmtPx(price);
  if (pane.dayRef) {
    const ch = (price - pane.dayRef) / pane.dayRef;
    $('pcChg').textContent = fmtPct(ch, 2) + ' (24h)';
    $('pcChg').className = ch >= 0 ? 'up-t' : 'down-t';
  } else { $('pcChg').textContent = '—'; $('pcChg').className = ''; }
  $('pcKrw').textContent = state.quote === 'USDT' && usdKrw ? '≈ ' + fmtKrw(price * usdKrw) : '';
  try { document.title = fmtPx(price) + ' · ' + pane.sym + ' — 트레이딩 챠트'; } catch (e) {}
  if (v && v.open) {
    const dd = $('sigLevels').querySelector('dd.unreal');
    if (dd) { dd.textContent = fmtPct(v.open.unreal, 2); dd.className = 'unreal ' + (v.open.unreal >= 0 ? 'pos' : 'neg'); }
  }
}

function renderSide() {
  const pane = activePane();
  if (!pane) return;
  $('pcTag').textContent = '차트 ' + (pane.idx + 1);
  $('pcName').textContent = pane.sym + ' / ' + state.quote + ' · ' + TF[pane.tf].label;
  $('pcSrc').textContent = pane.source ? pane.source.exch + ' 실시간' : '';
  const a = pane.analysis, bars = pane.bars;
  if (!a) {
    $('sigMain').textContent = bars.length ? '데이터 부족 (봉 120개 미만)' : '불러오는 중…';
    $('sigMain').className = 'sig-main'; $('sigWhy').textContent = ''; $('sigLevels').innerHTML = '';
    $('sigConf').textContent = '—'; $('sigConf').className = 'pill';
    $('regKv').innerHTML = ''; $('regName').textContent = '—'; $('selTbl').innerHTML = ''; $('wfBox').innerHTML = ''; $('rankTbl').innerHTML = ''; $('autoDesc').textContent = '';
    if (bars.length) sidePrice(pane, bars[bars.length - 1].close, null);
    return;
  }
  const v = pane.currentView(), last = bars[bars.length - 1];

  // 현재 판단
  const conf = confidence(v.stats);
  $('sigConf').textContent = conf.label; $('sigConf').className = 'pill ' + conf.cls;
  let mainTxt = '신호 없음 · 관망', cls = '';
  if (v.kind === 'auto' && !a.chosen && !v.open) mainTxt = '관망 (현 국면에서 검증된 지표 없음)';
  if (v.open) { mainTxt = v.open.dir === 1 ? '매수 포지션 유지' : '숏 포지션 유지'; cls = v.open.dir === 1 ? 'buy' : 'sell'; }
  if (v.pending) {
    if (v.pending.type === 'exit') { mainTxt = '다음 봉 시가 청산'; cls = 'sell'; }
    else { mainTxt = v.pending.dir === 1 ? '매수 신호 · 다음 봉 진입' : '숏 신호 · 다음 봉 진입'; cls = v.pending.dir === 1 ? 'buy' : 'sell'; }
  }
  $('sigMain').textContent = mainTxt; $('sigMain').className = 'sig-main ' + cls;
  let why;
  if (v.open) {
    why = E.STRAT_BY_ID[v.open.src].name + ' 신호로 ' + fmtTime(bars[v.open.idx].time) + ' 진입 · 해당 지표의 반대 신호 또는 손절가 도달 시 청산';
    if (v.kind === 'auto' && v.open.src !== v.id) why += ' · 신규 진입 기준은 ' + v.name;
  } else {
    const ls = a.lastSignal(v.id);
    why = (v.kind === 'auto' ? '자동 선택 ' : '수동 선택 ') + v.name + ' · ' + (ls ? '최근 신호: ' + (ls.dir === 1 ? '매수' : '매도') + ' ' + ls.barsAgo + '봉 전 (' + fmtTime(bars[ls.idx].time) + ')' : '최근 신호 없음');
  }
  $('sigWhy').textContent = why;
  const lv = pane.levels(v);
  let h = '';
  if (lv) {
    const pf = x => fmtPct((x - lv.entry) / lv.entry);
    h += '<dt>' + (lv.open ? '진입가' : '예상 진입') + '</dt><dd>' + fmtPx(lv.entry) + '</dd>';
    h += '<dt>손절가</dt><dd>' + fmtPx(lv.stop) + '<small>' + pf(lv.stop) + '</small></dd>';
    h += '<dt>1차 목표 (1.5R)</dt><dd>' + fmtPx(lv.tp1) + '<small>' + pf(lv.tp1) + '</small></dd>';
    h += '<dt>2차 목표 (3R)</dt><dd>' + fmtPx(lv.tp2) + '<small>' + pf(lv.tp2) + '</small></dd>';
    if (v.open) h += '<dt>평가 손익</dt><dd class="unreal ' + (v.open.unreal >= 0 ? 'pos' : 'neg') + '">' + fmtPct(v.open.unreal, 2) + '</dd>';
  }
  $('sigLevels').innerHTML = h;

  // 시장 국면
  const c = a.context, vp = pane.vp;
  $('regName').textContent = E.REGIME_NAME[a.regime] || '—';
  $('regName').className = 'pill ' + (a.regime === 'up' ? 'up' : a.regime === 'down' ? 'down' : 'neutral');
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

  // 자동 적용
  $('autoBtn').disabled = pane.view === 'auto';
  $('autoBtn').textContent = pane.view === 'auto' ? '자동 적용 중' : '자동으로 되돌리기';
  $('autoDesc').textContent = a.method === 'regime'
    ? '시장 국면(ADX·DI·EMA50)별로 과거 성과가 가장 좋은 지표를 골라, 현재 국면에 맞는 지표를 차트에 자동 적용합니다.'
    : '최근 검증에서는 국면별 선택보다 단일 최적 지표가 더 안정적이어서, 전 구간 최고 점수 지표를 자동 적용합니다.';
  let sh = '<tr><th>국면</th><th>적용 지표</th><th class="num">국면 승률</th><th class="num">PF</th></tr>';
  for (const g of ['up', 'down', 'range']) {
    const id = a.selection[g], st = id ? a.regimeTable[id][g] : null;
    sh += '<tr class="' + (g === a.regime ? 'cur-reg' : '') + '"><td>' + (g === a.regime ? '▸ ' : '') + E.REGIME_NAME[g] + '</td><td>' + (id ? E.STRAT_BY_ID[id].name : '관망') + '</td>'
      + '<td class="num">' + (st && st.trades ? Math.round(st.winRate * 100) + '% <span class="muted">(' + st.trades + ')</span>' : '—') + '</td>'
      + '<td class="num">' + (st && st.trades ? st.pf.toFixed(2) : '—') + '</td></tr>';
  }
  $('selTbl').innerHTML = sh;
  const w = a.adaptive.stats, other = a.metas[a.method === 'regime' ? 'single' : 'regime'].stats;
  const hold = bars[a.adaptive.from] ? bars[bars.length - 1].close / bars[a.adaptive.from].close - 1 : null;
  $('wfBox').innerHTML = '<b>워크포워드 검증</b> (과거 데이터로만 고른 지표를 다음 구간에 적용)<br>'
    + '거래 ' + w.trades + '회 · 승률 ' + Math.round(w.winRate * 100) + '% · PF ' + w.pf.toFixed(2)
    + ' · 수익 <span class="' + (w.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(w.ret) + '</span> · MDD ' + fmtPct(-w.mdd)
    + '<br><span class="muted">비교: ' + (a.method === 'regime' ? '단일 최적' : '국면별') + ' 방식 수익 ' + fmtPct(other.ret) + ', 같은 기간 보유 ' + fmtPct(hold) + '</span>';

  // 순위
  $('btMeta').textContent = '차트 ' + (pane.idx + 1) + ' · ' + bars.length + '봉 · ' + (state.mode === 'long' ? '롱만' : '롱·숏');
  let rh = '<thead><tr><th>지표</th><th class="num">승률</th><th class="num">PF</th><th class="num">수익</th><th class="num">MDD</th><th class="num">점수</th></tr></thead><tbody>';
  rh += '<tr data-id="auto" class="' + (pane.view === 'auto' ? 'on' : '') + '"><td><span class="nm">✦ 자동 (' + (a.method === 'regime' ? '국면 적응' : '단일 최적') + ')</span></td>'
    + '<td class="num">' + Math.round(w.winRate * 100) + '%</td><td class="num">' + w.pf.toFixed(2) + '</td><td class="num ' + (w.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(w.ret) + '</td><td class="num">' + fmtPct(-w.mdd, 0) + '</td><td class="num">' + w.score.toFixed(0) + '</td></tr>';
  a.rows.forEach((r, i) => {
    const s = r.oos;
    rh += '<tr data-id="' + r.id + '" class="' + (pane.view === r.id ? 'on' : '') + '" title="' + esc(r.desc) + '\n전체 구간: 거래 ' + r.full.trades + ' · 승률 ' + Math.round(r.full.winRate * 100) + '% · 수익 ' + fmtPct(r.full.ret) + '">'
      + '<td><span class="nm">' + (i + 1) + '. ' + r.name + '</span><span class="kind">' + r.kind + '</span></td>'
      + '<td class="num">' + (s.trades ? Math.round(s.winRate * 100) + '%' : '—') + ' <span class="muted">' + s.trades + '</span></td>'
      + '<td class="num">' + (s.trades ? s.pf.toFixed(2) : '—') + '</td>'
      + '<td class="num ' + (s.ret >= 0 ? 'pos' : 'neg') + '">' + fmtPct(s.ret) + '</td>'
      + '<td class="num">' + fmtPct(-s.mdd, 0) + '</td><td class="num">' + s.score.toFixed(0) + '</td></tr>';
  });
  $('rankTbl').innerHTML = rh + '</tbody>';
  sidePrice(pane, last.close, v);
}

/* ===================== 관심종목 ===================== */
function renderWatch() {
  const ul = $('watchList');
  const act = activePane();
  ul.innerHTML = '';
  for (const s of state.watch) {
    const li = document.createElement('li');
    li.className = act && s === act.sym ? 'on' : '';
    li.dataset.s = s;
    li.innerHTML = '<span class="w-s"></span><span class="w-p"></span><span class="w-c"></span><button class="w-x" title="삭제" aria-label="삭제">✕</button>';
    li.children[0].textContent = s;
    ul.appendChild(li);
    updateWatchRow(s);
    li.onclick = () => { const p = activePane(); if (p) p.load(s); };
    li.children[3].onclick = ev => { ev.stopPropagation(); state.watch = state.watch.filter(x => x !== s); save(); renderWatch(); startWatch(); };
  }
}
function updateWatchRow(s) {
  const li = $('watchList').querySelector('li[data-s="' + s + '"]');
  const q = watchPx.get(s);
  if (!li) return;
  li.children[1].textContent = q ? fmtPx(q.p) : '—';
  li.children[2].textContent = q ? fmtPct(q.c, 2) : '';
  li.children[2].className = 'w-c ' + (q && q.c >= 0 ? 'up-t' : 'down-t');
}
async function startWatch() {
  const list = state.watch.slice();
  watchValid = [];
  if (list.length) {
    if (state.quote === 'KRW') {
      try {
        const j = await upbitJSON('https://api.upbit.com/v1/ticker?markets=' + list.map(s => 'KRW-' + s).join(','));
        for (const t of j) watchPx.set(t.market.slice(4), { p: t.trade_price, c: t.signed_change_rate });
      } catch (e) {
        for (const s of list) { try { const j = await upbitJSON('https://api.upbit.com/v1/ticker?markets=KRW-' + s); watchPx.set(s, { p: j[0].trade_price, c: j[0].signed_change_rate }); } catch (er) {} }
      }
    } else {
      const syms = list.map(s => s + 'USDT');
      try {
        const j = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(syms)));
        for (const t of j) watchPx.set(t.symbol.slice(0, -4), { p: +t.lastPrice, c: +t.priceChangePercent / 100 });
      } catch (e) {
        for (const s of syms) { try { const t = await getJSON('https://data-api.binance.vision/api/v3/ticker/24hr?symbol=' + s); watchPx.set(s.slice(0, -4), { p: +t.lastPrice, c: +t.priceChangePercent / 100 }); } catch (er) {} }
      }
      watchValid = list.filter(s => watchPx.has(s));
    }
  }
  renderWatch();
  resubscribe();
}

/* ===================== UI ===================== */
function syncSegs() {
  const p = activePane();
  document.querySelectorAll('#tfSeg button').forEach(b => b.classList.toggle('on', !!p && b.dataset.tf === p.tf));
  document.querySelectorAll('#quoteSeg button').forEach(b => b.classList.toggle('on', b.dataset.q === state.quote));
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
  document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('on', +b.dataset.n === state.layout));
}

function applyTheme() {
  const dark = state.theme ? state.theme === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#1f1e1c' : '#f5f4ee';
  PAL = null;
  for (const p of panes) p.applyTheme();
}

function bind() {
  $('symList').innerHTML = SUGGEST.map(s => '<option value="' + s + '">').join('');
  $('symForm').onsubmit = e => { e.preventDefault(); const v = $('symInput').value; const p = activePane(); if (v.trim() && p) { p.load(v); $('symInput').value = ''; } };
  document.querySelectorAll('#tfSeg button').forEach(b => b.onclick = () => {
    const p = activePane(); if (!p || p.tf === b.dataset.tf) return;
    p.tf = b.dataset.tf; p.$.tf.value = p.tf; p.persist(); syncSegs(); p.load(p.sym);
  });
  document.querySelectorAll('#quoteSeg button').forEach(b => b.onclick = () => setQuote(b.dataset.q));
  document.querySelectorAll('#modeSeg button').forEach(b => b.onclick = () => {
    if (state.mode === b.dataset.m) return;
    state.mode = b.dataset.m; syncSegs(); save();
    panes.forEach(p => p.runAnalysis()); renderSide();
  });
  document.querySelectorAll('#layoutSeg button').forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    if (n === state.layout && !$('grid').classList.contains('has-max')) return;
    $('grid').classList.remove('has-max'); panes.forEach(p => { p.el.classList.remove('max'); p.$.max.textContent = '⤢'; });
    buildLayout(n);
  });
  $('themeBtn').onclick = () => { state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); };
  $('autoBtn').onclick = () => { const p = activePane(); if (!p) return; p.view = 'auto'; p.renderView(); renderSide(); };
  $('rankTbl').onclick = e => {
    const tr = e.target.closest('tr[data-id]'); const p = activePane();
    if (!tr || !p || !p.analysis) return;
    p.view = tr.dataset.id; p.renderView(); renderSide();
    toast('차트 ' + (p.idx + 1) + ': ' + (p.view === 'auto' ? '자동 지표 적용' : E.STRAT_BY_ID[p.view].name + ' 적용 — 매매 타점을 표시했습니다'), 2200);
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
    if (mq.addEventListener) mq.addEventListener('change', () => { if (!state.theme) applyTheme(); });
  }
  // 탭 복귀 시 끊긴 연결 복구
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const need = panes.some(p => p.source && p.source.kind !== 'okx' && !(p.source.kind === 'binance' ? binanceWS.alive : upbitWS.alive));
    if (need) { binanceWS.close(); upbitWS.close(); panes.forEach((p, i) => setTimeout(() => p.load(p.sym), i * 250)); }
  });
}

async function refreshFx() {
  try { const j = await getJSON('https://api.upbit.com/v1/ticker?markets=KRW-USDT'); usdKrw = j[0].trade_price; } catch (e) {}
}

function init() {
  applyTheme();
  bind();
  buildLayout(state.layout);
  renderWatch();
  refreshFx();
  setInterval(refreshFx, 60000);
  setInterval(() => panes.forEach(p => p.refreshDayRef()), 60000);
  startWatch();
}
document.addEventListener('DOMContentLoaded', init);
