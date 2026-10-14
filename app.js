/* TVChart — lightweight-charts(v4, TradingView OSS) 기반 차트 앱 */
'use strict';
const $ = id => document.getElementById(id);
const WATCH = ['BTC', 'ETH', 'XRP', 'SOL', 'ONDO', 'AAPL', '005930.KS'];
let symbol = 'BTC', tf = 'D', currency = 'USDT';
let srcKind = 'demo', srcQuote = '';
let favs = [];
try { favs = JSON.parse(localStorage.getItem('tvchart-fav') || '[]'); if (!Array.isArray(favs)) favs = []; } catch (e) { favs = []; }
function saveFavs() { try { localStorage.setItem('tvchart-fav', JSON.stringify(favs)); } catch (e) {} }
function isFav(s) { return favs.includes(s.toUpperCase()); }
function updateFavBtn() {
  const b = document.getElementById('favBtn');
  if (!b) return;
  const on = isFav(symbol);
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
}
function toggleFav() {
  const s = symbol.toUpperCase();
  if (isFav(s)) {
    favs = favs.filter(x => x !== s);
    saveFavs(); updateFavBtn(); refreshWatch();
    $('stMsg').textContent = s + ' 즐겨찾기 해제';
  } else {
    if (srcKind === 'demo') {
      $('stMsg').textContent = '실시간 조회된 종목만 즐겨찾기 등록 가능 (지금은 데모 데이터)';
      return;
    }
    favs.push(s);
    saveFavs(); updateFavBtn(); refreshWatch();
    $('stMsg').textContent = s + ' 즐겨찾기 등록';
  }
}
let daily = [];           // [{time:'YYYY-MM-DD',open,high,low,close,volume}]
let chart, candle, vol, ma20, ma50;

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
function upbitMarket(sym, quote) {
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return 'KRW-' + u.slice(0, -3);
  if (u.endsWith('USDT')) return 'USDT-' + u.slice(0, -4);
  return (quote || currency) + '-' + u;
}
async function tryUpbit(sym, tf, quote) {
  const market = upbitMarket(sym, quote);
  const unit = tf === 'W' ? 'weeks' : tf === 'M' ? 'months' : 'days';
  const r = await fetch('https://api.upbit.com/v1/candles/' + unit + '?market=' + market + '&count=200');
  if (!r.ok) throw new Error('upbit ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || j.length < 10) throw new Error('upbit empty');
  return {
    market,
    data: j.reverse().map(c => ({
      time: c.candle_date_time_kst.slice(0, 10),
      open: c.opening_price, high: c.high_price, low: c.low_price, close: c.trade_price,
      volume: c.candle_acc_trade_volume
    }))
  };
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
    else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
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
async function fetchStooq(sym) {
  const url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(sym.toLowerCase()) + '&i=d';
  const r = await fetch(url);
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
function genDemo(sym) {  // 오프라인 대체 데이터(결정적 랜덤워크)
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
const dec = () => {
  if (!daily.length) return 2;
  const c = daily[daily.length - 1].close;
  return c >= 1000 ? 0 : c >= 1 ? 2 : 4;
};
function fmt(n) { const d = dec(); return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtV(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return '' + Math.round(v);
}
function setHead(bar) {
  $('o').textContent = 'O ' + fmt(bar.open);
  $('h').textContent = 'H ' + fmt(bar.high);
  $('l').textContent = 'L ' + fmt(bar.low);
  $('c').textContent = 'C ' + fmt(bar.close);
}
function setChg(last, prev) {
  const el = $('chg'), d = last - prev, p = prev ? d / prev * 100 : 0;
  const dd = dec();
  el.textContent = (d >= 0 ? '+' : '') + d.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd })
    + ' (' + (p >= 0 ? '+' : '') + p.toFixed(2) + '%)';
  el.className = d >= 0 ? 'up' : 'down';
}
function render() {
  const data = NATIVE.includes(srcKind) ? daily : resample(daily, tf);
  document.querySelector('.ohlc .sym').textContent = marketLabel();
  candle.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  vol.setData(data.map(b => ({
    time: b.time, value: b.volume,
    color: b.close >= b.open ? 'rgba(242,54,69,.55)' : 'rgba(41,98,255,.55)'
  })));
  ma20.setData(sma(data, 20));
  ma50.setData(sma(data, 50));
  ma20.applyOptions({ visible: $('tMA20').checked });
  ma50.applyOptions({ visible: $('tMA50').checked });
  vol.applyOptions({ visible: $('tVol').checked });
  const last = data[data.length - 1], prev = data[data.length - 2] || last;
  setHead(last); setChg(last.close, prev.close);
  chart.applyOptions({ timeScale: { timeVisible: isIntra() } });
  chart.timeScale().fitContent();
  $('stTime').textContent = '봉 ' + data.length + '개 · ' + fmtT(data[0].time) + ' ~ ' + fmtT(last.time) + ' · Vol ' + fmtV(last.volume);
  updateFavBtn();
  reapplyAll();
}
async function loadSymbol(sym) {
  symbol = sym.toUpperCase();
  $('symInput').value = symbol;
  $('stSrc').textContent = symbol + ' 로딩 중…';
  document.querySelectorAll('.wlrow').forEach(e => e.classList.toggle('on', e.dataset.s === symbol));
  const plan = cryptoPlan(symbol);
  const base = cryptoBase(symbol);
  let done = false;
  for (const step of plan) {
    if (isIntra() && step === 'stooq') continue;
    try {
      if (step === 'binance') {
        const r = await tryBinance(base, tf);
        daily = r.data; srcKind = 'binance'; srcQuote = r.market;
        $('stSrc').textContent = '실시간 데이터: 바이낸스 ' + r.market + ' (' + tfName() + ')';
      } else if (step === 'mexc') {
        const r = await tryMexc(base, tf);
        daily = r.data; srcKind = 'mexc'; srcQuote = r.market;
        $('stSrc').textContent = '실시간 데이터: MEXC ' + r.market + ' (' + tfName() + ')';
      } else if (step === 'upbit') {
        const u = isIntra() ? await tryUpbitIntra(symbol, INTRA[tf]) : await tryUpbit(symbol, tf);
        daily = u.data; srcKind = 'upbit'; srcQuote = u.market;
        $('stSrc').textContent = '실시간 데이터: 업비트 ' + u.market + ' (' + tfName() + ')';
      } else {
        daily = await fetchStooq(symbol);
        srcKind = 'stooq'; srcQuote = '';
        $('stSrc').textContent = '실시간 데이터: stooq.com (일봉)';
      }
      done = true;
      break;
    } catch (e) { /* 다음 소스 시도 */ }
  }
  if (!done) {
    if (isIntra()) {
      $('stSrc').textContent = '분봉은 코인만 지원 — ' + symbol + ' 불가';
      return;
    }
    daily = genDemo(symbol);
    srcKind = 'demo'; srcQuote = '';
    $('stSrc').textContent = '오프라인 데모 데이터 (시세 서버 접근 실패)';
  }
  render();
}
const INTRA = { m1: 1, m5: 5, m15: 15 };
const BINV = { D: '1d', W: '1w', M: '1M', m1: '1m', m5: '5m', m15: '15m' };
const NATIVE = ['binance', 'mexc', 'upbit'];
function cryptoBase(sym) {
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return u.slice(0, -3);
  if (u.endsWith('USDT')) return u.slice(0, -4);
  return u;
}
function cryptoPlan(sym) {
  const u = sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.endsWith('KRW')) return ['upbit', 'stooq'];
  if (u.endsWith('USDT')) return ['binance', 'mexc', 'upbit', 'stooq'];
  if (currency === 'KRW') return ['upbit', 'stooq'];
  return ['binance', 'mexc', 'upbit', 'stooq'];
}
async function fetchKlines(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('klines ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || j.length < 10) throw new Error('klines empty');
  return j.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5]
  })).sort((a, b) => a.time - b.time);
}
async function tryBinance(base, tf) {
  const data = await fetchKlines('https://api.binance.com/api/v3/klines?symbol=' + base + 'USDT&interval=' + BINV[tf] + '&limit=200');
  return { market: base + '/USDT', exch: '바이낸스', data };
}
async function tryMexc(base, tf) {
  const data = await fetchKlines('https://api.mexc.com/api/v3/klines?symbol=' + base + 'USDT&interval=' + BINV[tf] + '&limit=200');
  return { market: base + '/USDT', exch: 'MEXC', data };
}
const isIntra = () => !!INTRA[tf];
async function tryUpbitIntra(sym, unit) {
  const market = upbitMarket(sym);
  const r = await fetch('https://api.upbit.com/v1/candles/minutes/' + unit + '?market=' + market + '&count=200');
  if (!r.ok) throw new Error('upbit ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j) || j.length < 10) throw new Error('upbit empty');
  return {
    market,
    data: j.reverse().map(c => ({
      time: Math.floor(new Date(c.candle_date_time_kst + '+09:00').getTime() / 1000),
      open: c.opening_price, high: c.high_price, low: c.low_price, close: c.trade_price,
      volume: c.candle_acc_trade_volume
    }))
  };
}
function fmtT(t) {
  if (typeof t === 'number') {
    const d = new Date(t * 1000);
    const p = n => String(n).padStart(2, '0');
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  return t;
}
function marketLabel() {
  if (srcKind === 'binance' || srcKind === 'mexc') return srcQuote;
  if (srcKind !== 'upbit') return symbol;
  const m = srcQuote.split('-');
  return m[1] + '/' + m[0];
}
function tfName() {
  return tf === 'D' ? '일봉' : tf === 'W' ? '주봉' : tf === 'M' ? '월봉' : tf === 'm1' ? '1분봉' : tf === 'm5' ? '5분봉' : '15분봉';
}
function fmtPx(v) {
  if (v >= 1000) return Math.round(v).toLocaleString('en-US');
  if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
async function lastClose(s) {
  const plan = cryptoPlan(s);
  const base = cryptoBase(s);
  for (const step of plan) {
    try {
      let d;
      if (step === 'binance') d = (await tryBinance(base, 'D')).data;
      else if (step === 'mexc') d = (await tryMexc(base, 'D')).data;
      else if (step === 'upbit') d = (await tryUpbit(s, 'D')).data;
      else d = await fetchStooq(s);
      return [d[d.length - 1].close, d[d.length - 2].close, true];
    } catch (e) { /* 다음 소스 시도 */ }
  }
  const d = genDemo(s);
  return [d[d.length - 1].close, d[d.length - 2].close, false];
}
async function refreshWatch() {
  const box = $('wl');
  box.innerHTML = '';
  const drawRow = async (s, isFavRow) => {
    let last = NaN, prev = NaN, live = false;
    try { [last, prev, live] = await lastClose(s); }
    catch (e) { const d = genDemo(s); last = d[d.length - 1].close; prev = d[d.length - 2].close; }
    const ch = prev ? (last - prev) / prev * 100 : 0;
    const row = document.createElement('div');
    row.className = 'wlrow' + (s === symbol ? ' on' : '') + (isFavRow ? ' fav' : '');
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
    row.onclick = () => loadSymbol(s);
    box.appendChild(row);
  };
  if (favs.length) {
    const h = document.createElement('div');
    h.className = 'wlsec'; h.textContent = '★ 즐겨찾기';
    box.appendChild(h);
    for (const s of favs) await drawRow(s, true);
    const h2 = document.createElement('div');
    h2.className = 'wlsec'; h2.textContent = '기본 목록';
    box.appendChild(h2);
  }
  for (const s of WATCH) {
    if (favs.includes(s)) continue;
    await drawRow(s, false);
  }
}
function init() {
  chart = LightweightCharts.createChart($('chart'), {
    layout: { background: { color: '#131722' }, textColor: '#d1d4dc', fontSize: 11 },
    grid: { vertLines: { color: 'rgba(42,46,57,.55)' }, horzLines: { color: 'rgba(42,46,57,.55)' } },
    crosshair: { vertLine: { color: '#758696', labelBackgroundColor: '#4c525e' }, horzLine: { color: '#758696', labelBackgroundColor: '#4c525e' } },
    rightPriceScale: { borderColor: '#2a2e39' },
    timeScale: { borderColor: '#2a2e39', timeVisible: false }
  });
  candle = chart.addCandlestickSeries({ upColor: BULL, downColor: BEAR, wickUpColor: BULL, wickDownColor: BEAR, borderVisible: false });
  applyTheme();
  vol = chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' } });
  chart.priceScale('').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
  ma20 = chart.addLineSeries({ color: '#ff9800', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  ma50 = chart.addLineSeries({ color: '#9c27b0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  chart.subscribeCrosshairMove(p => {
    if (!p.time || !daily.length) return;
    const data = NATIVE.includes(srcKind) ? daily : resample(daily, tf);
    const bar = data.find(b => b.time === p.time) || data.reduce((a, b) => b.time <= p.time ? b : a, data[0]);
    if (bar) { setHead(bar); const i = data.indexOf(bar); if (i > 0) setChg(bar.close, data[i - 1].close); }
  });
  new ResizeObserver(es => { const r = es[0].contentRect; chart.applyOptions({ width: r.width, height: r.height }); }).observe($('chart'));
  const chartBox = $('chart');
  chartBox.tabIndex = 0;
  chart.subscribeClick(p => {
    try { chartBox.focus({ preventScroll: true }); } catch (e) { chartBox.focus(); }
    if (p && p.time !== undefined) drawAuto(p.time);
  });
  chartBox.addEventListener('keydown', e => {
    const ts = chart.timeScale();
    let r;
    try { r = ts.getVisibleLogicalRange(); } catch (err) { return; }
    if (!r) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = (e.key === 'ArrowLeft' ? -step : step);
      ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d });
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const mid = (r.from + r.to) / 2, half = (r.to - r.from) / 2 * (e.key === 'ArrowUp' ? 0.8 : 1.25);
      ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
      e.preventDefault();
    } else if (e.key === 'End') { try { ts.scrollToRealTime(); } catch (err) {} e.preventDefault(); }
    else if (e.key === 'Home') { ts.setVisibleLogicalRange({ from: 0, to: r.to - r.from }); e.preventDefault(); }
  });
  document.querySelectorAll('#tfs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#tfs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); tf = b.dataset.tf;
    loadSymbol(symbol);
  });
  document.querySelectorAll('#cur button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#cur button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); currency = b.dataset.cur;
    loadSymbol(symbol); refreshWatch();
  });
  ['tMA20', 'tMA50', 'tVol'].forEach(id => $(id).onchange = render);
  $('symGo').onclick = () => { const v = $('symInput').value.trim(); if (v) loadSymbol(v); };
  $('symInput').onkeydown = e => { if (e.key === 'Enter') $('symGo').click(); };
  document.querySelectorAll('#rail .tool').forEach(t => t.onclick = () => {
    document.querySelectorAll('#rail .tool').forEach(x => x.classList.remove('on'));
    t.classList.add('on');
    $('stMsg').textContent = '그리기 도구는 표시 전용입니다';
  });
  loadSymbol(symbol);
  refreshWatch();
}
document.addEventListener('DOMContentLoaded', init);

/* ================= 지표·전략 매니저 ================= */
const INDS = [
  // 추세/이동평균 (오버레이)
  ['sma20','SMA 20','추세'],['sma50','SMA 50','추세'],['ema20','EMA 20','추세'],
  ['wma20','WMA 20','추세'],['hma9','HMA 9','추세'],['dema14','DEMA 14','추세'],
  ['tema14','TEMA 14','추세'],['kama10','KAMA 10','추세'],['mcginley14','맥긴리 14','추세'],
  ['alma9','ALMA 9','추세'],['vidya14','VIDYA 14','추세'],['t3','T3 5','추세'],
  ['zlema14','제로랙 EMA 14','추세'],['lsma25','LSMA 25','추세'],['vwma20','VWMA 20','추세'],
  ['vwap','VWAP','추세'],['avwap','앵커 VWAP','추세'],['smma14','SMMA 14','추세'],
  ['median','중앙값','추세'],['mode14','최빈값 14','추세'],['typical','Typical Price','추세'],
  ['wclose','Weighted Close','추세'],
  // 채널/변동성 (오버레이)
  ['bb20','볼린저 20/2','채널'],['keltner','켈트너 20/1','채널'],['donchian','돈치안 20','채널'],
  ['pricechan','프라이스채널 20','채널'],['envelopes','엔벨로프 20/2.5%','채널'],
  ['supertrend','슈퍼트렌드 10/3','채널'],['sar','파라볼릭 SAR','채널'],
  ['ichimoku','일목균형표','채널'],['alligator','앨리게이터','채널'],['zigzag','지그재그 5%','채널'],
  // 오실레이터 (서브패널)
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
  // 거래량 (서브패널)
  ['obv','OBV','거래량'],['adl','A/D','거래량'],['cmf20','CMF 20','거래량'],
  ['emv14','EMV 14','거래량'],['klinger','클링거','거래량'],['pvt','PVT','거래량'],
  ['netvol','Net Volume','거래량'],['volosc','거래량 오실레이터','거래량'],
  // 빌 윌리엄스
  ['gator','게이터','BW'],['bwmfi','BW MFI','BW'],['fractals','프랙탈','BW'],
  // 추세 오실레이터
  ['aroon','Aroon 14','추세강도'],['adx','ADX/DI 14','추세강도'],['vortex','볼텍스 14','추세강도'],['kst','KST','추세강도'],
  ['macd','MACD 12/26/9','추세강도'],
  // 피벗/프로파일/패턴
  ['pivStd','피벗 스탠다드','피벗'],['pivFib','피벗 피보나치','피벗'],['pivDemark','피벗 디마크','피벗'],
  ['pivWoodie','피벗 우디','피벗'],['pivCam','피벗 카마릴라','피벗'],
  ['vprofile','거래량 프로파일','피벗'],['patterns','캔들 패턴','피벗'],
  // 수급 (시장 전체 데이터 필요)
  ['breadthADL','등락주선','수급',1],['breadthADR','등락비율','수급',1],['trin','Arms지수(TRIN)','수급',1],
  ['mcclellan','매클렐란','수급',1],['highlow','하이로우 인덱스','수급',1],
];
const active = new Map();       // id -> {series:[{c,s}], panes:[paneId], lines:[]}
const markerLayers = {};        // layerId -> markers[]
let subCharts = [];             // {id, chart, box, handlers}
let curStrategy = null, syncing = false;
let autoStrat = 'supertrend';
let autoMode = true;
const autoLayer = { series: [], lines: [] };

function stepSec(data) {
  if (typeof data[0].time !== 'number') return 86400;
  const ds = [];
  for (let i = Math.max(1, data.length - 6); i < data.length; i++) ds.push(data[i].time - data[i - 1].time);
  ds.sort((a, b) => a - b);
  return ds.length ? ds[Math.floor(ds.length / 2)] : 60;
}
function clearAuto() {
  for (const s of autoLayer.series) { try { chart.removeSeries(s); } catch (e) {} }
  for (const l of autoLayer.lines) { try { candle.removePriceLine(l); } catch (e) {} }
  autoLayer.series = []; autoLayer.lines = [];
}
function drawAuto(anchorTime) {
  clearAuto();
  if (!autoMode || !daily.length || !chart || !candle) return;
  const data = curData();
  let idx = data.length - 1;
  if (anchorTime !== undefined && anchorTime !== null) {
    const f = data.findIndex(b => b.time === anchorTime);
    if (f >= 0) idx = f;
  }
  const weekends = NATIVE.includes(srcKind);
  const al = autoLevels(data, idx, weekends, stepSec(data));
  if (al.supLine.length > 1) {
    const s = chart.addLineSeries({ color: BULL, lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    s.setData(al.supLine); autoLayer.series.push(s);
  }
  if (al.resLine.length > 1) {
    const s = chart.addLineSeries({ color: BEAR, lineWidth: 3, priceLineVisible: false, lastValueVisible: false });
    s.setData(al.resLine); autoLayer.series.push(s);
  }
  al.supports.forEach((lv, i) => {
    try { autoLayer.lines.push(candle.createPriceLine({ price: lv.p, color: BULL, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'S' + (i + 1) + '×' + lv.n })); } catch (e) {}
  });
  al.resistances.forEach((lv, i) => {
    try { autoLayer.lines.push(candle.createPriceLine({ price: lv.p, color: BEAR, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'R' + (i + 1) + '×' + lv.n })); } catch (e) {}
  });
  $('stMsg').textContent = '자동선: 추세 ' + autoLayer.series.length + '개 · 지지 ' + al.supports.length + ' · 저항 ' + al.resistances.length;
}

const curData = () => NATIVE.includes(srcKind) ? daily : resample(daily, tf);
const pts = (data, arr) => arr.map((v, i) => ({ time: data[i].time, value: v }))
  .filter(p => p.value !== null && p.value !== undefined && isFinite(p.value));
const LC = { orange: '#ff9800', purple: '#9c27b0', blue: '#2962ff', cyan: '#00bcd4', green: '#089981', red: '#f23645', yellow: '#ffeb3b', gray: '#868993' };

function computeInd(id, data) {
  const C_ = data.map(b => b.close);
  switch (id) {
    case 'sma20': return { lines: [{ color: LC.orange, v: pts(data, smaArr(C_, 20)) }] };
    case 'sma50': return { lines: [{ color: LC.purple, v: pts(data, smaArr(C_, 50)) }] };
    case 'ema20': return { lines: [{ color: LC.blue, v: pts(data, emaArr(C_, 20)) }] };
    case 'wma20': return { lines: [{ color: LC.cyan, v: pts(data, wmaArr(C_, 20)) }] };
    case 'hma9': return { lines: [{ color: LC.yellow, v: pts(data, hmaArr(C_, 9)) }] };
    case 'dema14': return { lines: [{ color: LC.orange, v: pts(data, DEMA(data, 14)) }] };
    case 'tema14': return { lines: [{ color: LC.purple, v: pts(data, TEMA(data, 14)) }] };
    case 'kama10': return { lines: [{ color: LC.blue, v: pts(data, KAMA(data, 10)) }] };
    case 'mcginley14': return { lines: [{ color: LC.green, v: pts(data, McGinley(data, 14)) }] };
    case 'alma9': return { lines: [{ color: LC.cyan, v: pts(data, ALMA(data, 9)) }] };
    case 'vidya14': return { lines: [{ color: LC.yellow, v: pts(data, VIDYA(data, 14)) }] };
    case 't3': return { lines: [{ color: LC.orange, v: pts(data, T3(data)) }] };
    case 'zlema14': return { lines: [{ color: LC.blue, v: pts(data, ZLEMA(data, 14)) }] };
    case 'lsma25': return { lines: [{ color: LC.purple, v: pts(data, linregArr(C_, 25)) }] };
    case 'vwma20': return { lines: [{ color: LC.cyan, v: pts(data, VWMA(data, 20)) }] };
    case 'vwap': return { lines: [{ color: LC.blue, v: pts(data, VWAP(data)) }] };
    case 'avwap': return { lines: [{ color: LC.yellow, v: pts(data, VWAP(data)) }] };
    case 'smma14': return { lines: [{ color: LC.gray, v: pts(data, rmaArr(C_, 14)) }] };
    case 'median': return { lines: [{ color: LC.gray, v: pts(data, MED(data).map((v, i) => data[i] ? v : null)) }] };
    case 'mode14': {
      const m = C_.map((_, i) => {
        if (i < 13) return null;
        const w = C_.slice(i - 13, i + 1).map(x => Math.round(x * 100) / 100).sort((a, b) => a - b);
        let best = w[0], bn = 1, cur = w[0], cn = 1;
        for (let k = 1; k < w.length; k++) {
          if (w[k] === cur) cn++; else { if (cn > bn) { bn = cn; best = cur; } cur = w[k]; cn = 1; }
        }
        return cn > bn ? cur : best;
      });
      return { lines: [{ color: LC.gray, v: pts(data, m) }] };
    }
    case 'typical': return { lines: [{ color: LC.gray, v: pts(data, TP(data)) }] };
    case 'wclose': return { lines: [{ color: LC.gray, v: pts(data, data.map(b => (b.high + b.low + 2 * b.close) / 4)) }] };
    case 'bb20': { const b = BB(data, 20, 2); return { lines: [{ color: LC.blue, v: pts(data, b.mid) }, { color: LC.gray, v: pts(data, b.upper) }, { color: LC.gray, v: pts(data, b.lower) }] }; }
    case 'keltner': { const k = Keltner(data, 20, 1); return { lines: [{ color: LC.cyan, v: pts(data, k.mid) }, { color: LC.gray, v: pts(data, k.upper) }, { color: LC.gray, v: pts(data, k.lower) }] }; }
    case 'donchian': case 'pricechan': { const x = Donchian(data, 20); return { lines: [{ color: BULL, v: pts(data, x.upper) }, { color: BEAR, v: pts(data, x.lower) }, { color: LC.gray, v: pts(data, x.mid) }] }; }
    case 'envelopes': { const e = Envelopes(data, 20, 2.5); return { lines: [{ color: LC.blue, v: pts(data, e.mid) }, { color: LC.gray, v: pts(data, e.upper) }, { color: LC.gray, v: pts(data, e.lower) }] }; }
    case 'supertrend': { const s = Supertrend(data); return { lines: [{ color: LC.orange, v: pts(data, s.line) }] }; }
    case 'sar': return { lines: [{ color: LC.yellow, v: pts(data, SAR(data)) }] };
    case 'ichimoku': {
      const ic = Ichimoku(data);
      return { lines: [
        { color: '#26a69a', v: pts(data, ic.tenkan) }, { color: '#ef5350', v: pts(data, ic.kijun) },
        { color: 'rgba(38,166,154,.7)', v: pts(data, ic.senkouA) }, { color: 'rgba(239,83,80,.7)', v: pts(data, ic.senkouB) },
        { color: LC.gray, v: pts(data, ic.chikou) }] };
    }
    case 'alligator': { const g = Alligator(data); return { lines: [{ color: LC.blue, v: pts(data, g.jaw) }, { color: LC.red, v: pts(data, g.teeth) }, { color: LC.green, v: pts(data, g.lips) }] }; }
    case 'zigzag': return { lines: [{ color: LC.yellow, v: pts(data, ZigZag(data)) }] };
    case 'rsi14': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, RSI(data, 14)) }] };
    case 'stoch': { const s = Stoch(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, s.K) }, { color: LC.orange, v: pts(data, s.D) }] }; }
    case 'stochrsi': { const s = StochRSI(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, s.K) }, { color: LC.orange, v: pts(data, s.D) }] }; }
    case 'connors': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, ConnorsRSI(data)) }] };
    case 'mfi14': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, MFI(data, 14)) }] };
    case 'cci20': return { pane: 1, lines: [{ color: LC.orange, v: pts(data, CCI(data, 20)) }] };
    case 'willr14': return { pane: 1, lines: [{ color: LC.cyan, v: pts(data, WilliamsR(data, 14)) }] };
    case 'roc12': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, ROC(data, 12)) }] };
    case 'mom10': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, Momentum(data, 10)) }] };
    case 'cmo9': return { pane: 1, lines: [{ color: LC.green, v: pts(data, CMO(data, 9)) }] };
    case 'tsi': { const t = TSI(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, t.tsi) }, { color: LC.orange, v: pts(data, t.signal) }] }; }
    case 'uo': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, UO(data)) }] };
    case 'ao': return { pane: 1, hists: [{ color: BULL, v: pts(data, AO(data).map(v => v === null ? null : Math.abs(v))) }], lines: [{ color: BULL, v: pts(data, AO(data)) }] };
    case 'demarker13': return { pane: 1, lines: [{ color: LC.cyan, v: pts(data, DeMarker(data, 13)) }] };
    case 'rvi': { const r = RVI(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, r.rvi) }, { color: LC.orange, v: pts(data, r.signal) }] }; }
    case 'relvol': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, RelVolIndex(data, 10)) }] };
    case 'schaff': return { pane: 1, lines: [{ color: LC.orange, v: pts(data, SchaffTC(data)) }] };
    case 'coppock': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, Coppock(data)) }] };
    case 'pgo': return { pane: 1, lines: [{ color: LC.cyan, v: pts(data, PGO(data)) }] };
    case 'force13': return { pane: 1, lines: [{ color: LC.green, v: pts(data, ForceIndex(data, 13)) }] };
    case 'chaikinosc': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, ChaikinOsc(data)) }] };
    case 'chaikinvol': return { pane: 1, lines: [{ color: LC.cyan, v: pts(data, ChaikinVol(data)) }] };
    case 'ulcer14': return { pane: 1, lines: [{ color: LC.red, v: pts(data, Ulcer(data, 14)) }] };
    case 'trix18': return { pane: 1, lines: [{ color: LC.orange, v: pts(data, TRIX(data, 18)) }] };
    case 'linregslope': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, linSlope(C_, 14)) }] };
    case 'pctb': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, PctB(data)) }] };
    case 'obv': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, OBV(data)) }] };
    case 'adl': return { pane: 1, lines: [{ color: LC.cyan, v: pts(data, ADL(data)) }] };
    case 'cmf20': return { pane: 1, lines: [{ color: LC.green, v: pts(data, CMF(data, 20)) }] };
    case 'emv14': return { pane: 1, lines: [{ color: LC.orange, v: pts(data, EMV(data, 14)) }] };
    case 'klinger': { const k = Klinger(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, k.k) }, { color: LC.orange, v: pts(data, k.signal) }] }; }
    case 'pvt': return { pane: 1, lines: [{ color: LC.purple, v: pts(data, PVT(data)) }] };
    case 'netvol': return { pane: 1, hists: [{ color: LC.green, v: pts(data, NetVol(data)) }] };
    case 'volosc': return { pane: 1, lines: [{ color: LC.blue, v: pts(data, VolOsc(data)) }] };
    case 'gator': { const g = Gator(data); return { pane: 1, hists: [{ color: BULL, v: pts(data, g.upper) }, { color: BEAR, v: pts(data, g.lower) }] }; }
    case 'bwmfi': return { pane: 1, hists: [{ color: LC.cyan, v: pts(data, BWMFI(data)) }] };
    case 'fractals': {
      const f = Fractals(data);
      const mk = [];
      f.up.forEach((v, i) => { if (v !== null) mk.push({ time: data[i].time, position: 'aboveBar', shape: 'arrowDown', color: BEAR }); });
      f.dn.forEach((v, i) => { if (v !== null) mk.push({ time: data[i].time, position: 'belowBar', shape: 'arrowUp', color: BULL }); });
      return { markers: mk };
    }
    case 'aroon': { const a = Aroon(data); return { pane: 1, lines: [{ color: BULL, v: pts(data, a.up) }, { color: BEAR, v: pts(data, a.dn) }] }; }
    case 'adx': { const a = ADX(data); return { pane: 1, lines: [{ color: LC.yellow, v: pts(data, a.adx) }, { color: BULL, v: pts(data, a.pdi) }, { color: BEAR, v: pts(data, a.mdi) }] }; }
    case 'vortex': { const v = Vortex(data); return { pane: 1, lines: [{ color: BULL, v: pts(data, v.plus) }, { color: BEAR, v: pts(data, v.minus) }] }; }
    case 'kst': { const k = KST(data); return { pane: 1, lines: [{ color: LC.orange, v: pts(data, k.kst) }, { color: LC.blue, v: pts(data, k.signal) }] }; }
    case 'macd': { const m = MACD(data); return { pane: 1, lines: [{ color: LC.blue, v: pts(data, m.macd) }, { color: LC.orange, v: pts(data, m.signal) }], hists: [{ color: LC.red, v: pts(data, m.hist) }] }; }
    case 'pivStd': case 'pivFib': case 'pivDemark': case 'pivWoodie': case 'pivCam': {
      const type = { pivStd: 'std', pivFib: 'fib', pivDemark: 'demark', pivWoodie: 'woodie', pivCam: 'camarilla' }[id];
      const b = data[data.length - 2] || data[data.length - 1];
      const lv = pivotLevels(b.high, b.low, b.close, type);
      const pl = [];
      for (const [k, v] of Object.entries(lv)) {
        if (v === null || !isFinite(v)) continue;
        pl.push({ price: v, color: k === 'P' ? LC.yellow : k[0] === 'R' ? LC.green : LC.red, title: k, style: k === 'P' ? 0 : 2 });
      }
      return { pricelines: pl };
    }
    case 'vprofile': {
      const vp = VProfile(data);
      if (vp.poc === null) return {};
      return { pricelines: [
        { price: vp.poc, color: LC.yellow, title: 'POC', style: 0 },
        { price: vp.vah, color: LC.green, title: 'VAH', style: 2 },
        { price: vp.val, color: LC.red, title: 'VAL', style: 2 }] };
    }
    case 'patterns': {
      const mk = CandlePatterns(data).map(p => ({
        time: data[p.i].time, position: p.pos === 'above' ? 'aboveBar' : 'belowBar',
        shape: p.pos === 'above' ? 'arrowDown' : 'arrowUp',
        color: p.pos === 'above' ? BEAR : BULL, text: p.name
      }));
      return { markers: mk };
    }
  }
  return {};
}

const BULL = '#f23645', BEAR = '#2962ff';  // 상승 빨강 · 하락 파랑
let light = false;
try { light = localStorage.getItem('tvchart-theme') === 'light'; } catch (e) {}
const THEMES = {
  dark: { bg: '#131722', text: '#d1d4dc', grid: 'rgba(42,46,57,.55)', border: '#2a2e39', cross: '#758696', crossBg: '#4c525e' },
  light: { bg: '#ffffff', text: '#131722', grid: 'rgba(224,227,235,.9)', border: '#e0e3eb', cross: '#9aa0b0', crossBg: '#e6e8eb' }
};
function paintChart(c) {
  const t = THEMES[light ? 'light' : 'dark'];
  c.applyOptions({
    layout: { background: { color: t.bg }, textColor: t.text },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    crosshair: { vertLine: { color: t.cross, labelBackgroundColor: t.crossBg }, horzLine: { color: t.cross, labelBackgroundColor: t.crossBg } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border }
  });
}
function applyTheme() {
  document.body.classList.toggle('light', light);
  const b = document.getElementById('themeBtn');
  if (b) b.textContent = light ? '☀' : '🌙';
  if (typeof chart !== 'undefined' && chart) paintChart(chart);
  if (typeof subCharts !== 'undefined') subCharts.forEach(s => paintChart(s.chart));
  try { localStorage.setItem('tvchart-theme', light ? 'light' : 'dark'); } catch (e) {}
}
function baseOpts() {
  const t = THEMES[light ? 'light' : 'dark'];
  return {
    layout: { background: { color: t.bg }, textColor: t.text, fontSize: 11 },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    crosshair: { vertLine: { color: t.cross, labelBackgroundColor: t.crossBg }, horzLine: { color: t.cross, labelBackgroundColor: t.crossBg } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border, timeVisible: false }
  };
}
function allSynced() { return [chart, ...subCharts.map(s => s.chart)]; }
function linkTimeScale(c, owner) {
  const h = r => {
    if (syncing || !r) return;
    syncing = true;
    try { for (const o of allSynced()) if (o !== owner) { try { o.timeScale().setVisibleLogicalRange(r); } catch (e) {} } }
    finally { syncing = false; }
  };
  c.timeScale().subscribeVisibleLogicalRangeChange(h);
  return h;
}
function addPane(id, title) {
  const panes = $('panes');
  const wrap = document.createElement('div');
  wrap.className = 'subpane';
  const ph = document.createElement('div'); ph.className = 'ph';
  const nm = document.createElement('span'); nm.textContent = title;
  const x = document.createElement('button'); x.textContent = '✕';
  x.onclick = () => toggleInd(id);
  ph.appendChild(nm); ph.appendChild(x);
  const box = document.createElement('div'); box.className = 'pb';
  wrap.appendChild(ph); wrap.appendChild(box); panes.appendChild(wrap);
  const c = LightweightCharts.createChart(box, baseOpts());
  new ResizeObserver(es => { const r = es[0].contentRect; try { c.applyOptions({ width: r.width, height: r.height }); } catch (e) {} }).observe(box);
  const entry = { id, chart: c, box, wrap, handlers: [] };
  entry.handlers.push([c, linkTimeScale(c, c)]);
  entry.handlers.push([chart, linkTimeScale(chart, chart)]);
  subCharts.push(entry);
  try { const r = chart.timeScale().getVisibleLogicalRange(); if (r) c.timeScale().setVisibleLogicalRange(r); } catch (e) {}
  return entry;
}
function refreshMarkers() {
  if (!candle) return;
  const all = [];
  for (const k of Object.keys(markerLayers)) for (const m of markerLayers[k]) all.push(m);
  all.sort((a, b) => a.time < b.time ? -1 : 1);
  try { candle.setMarkers(all); } catch (e) {}
}
function clearInd(id) {
  const st = active.get(id);
  if (!st) return;
  for (const s of st.series) { try { s.c.removeSeries(s.s); } catch (e) {} }
  for (const p of st.panes) {
    subCharts = subCharts.filter(x => x !== p);
    try { p.chart.remove(); } catch (e) {}
    p.wrap.remove();
  }
  for (const l of st.lines) { try { candle.removePriceLine(l); } catch (e) {} }
  delete markerLayers['ind:' + id];
  active.delete(id);
  refreshMarkers(); updateChips();
}
function clearAllInd() {
  for (const id of [...active.keys()]) clearInd(id);
  for (const k of Object.keys(markerLayers)) delete markerLayers[k];
  curStrategy = null;
  refreshMarkers(); updateChips();
}
function toggleInd(id) {
  const meta = INDS.find(x => x[0] === id);
  if (!meta) return;
  if (meta[3]) { $('stMsg').textContent = meta[1] + ': 거래소 전체 등락 데이터가 필요한 지표라 미지원'; return; }
  if (active.has(id)) { clearInd(id); return; }
  if (!daily.length || !chart) return;
  const data = curData();
  const r = computeInd(id, data);
  const st = { series: [], panes: [], lines: [] };
  for (const l of (r.lines || [])) {
    if (!l.v.length) continue;
    if (r.pane) {
      let pane = subCharts.find(p => p.id === 'pane:' + id);
      if (!pane) pane = addPane('pane:' + id, meta[1]);
      const s = pane.chart.addLineSeries({ color: l.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(l.v); st.series.push({ c: pane.chart, s }); st.panes.push(pane);
    } else {
      const s = chart.addLineSeries({ color: l.color, lineWidth: l.width || 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(l.v); st.series.push({ c: chart, s });
    }
  }
  for (const h of (r.hists || [])) {
    if (!h.v.length) continue;
    if (r.pane) {
      let pane = subCharts.find(p => p.id === 'pane:' + id);
      if (!pane) pane = addPane('pane:' + id, meta[1]);
      const s = pane.chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' } });
      s.setData(h.v); st.series.push({ c: pane.chart, s }); st.panes.push(pane);
    } else {
      const s = chart.addHistogramSeries({ priceScaleId: 'ind', priceFormat: { type: 'volume' } });
      s.setData(h.v); st.series.push({ c: chart, s });
    }
  }
  // 같은 pane 중복 등록 방지
  st.panes = [...new Set(st.panes)];
  for (const p of (r.pricelines || [])) {
    try { st.lines.push(candle.createPriceLine({ price: p.price, color: p.color, lineWidth: 1, lineStyle: p.style || 2, axisLabelVisible: true, title: p.title || '' })); } catch (e) {}
  }
  if (r.markers && r.markers.length) markerLayers['ind:' + id] = r.markers;
  if (!st.series.length && !st.lines.length && !(r.markers && r.markers.length)) {
    $('stMsg').textContent = meta[1] + ': 데이터 부족으로 표시 불가';
    return;
  }
  active.set(id, st);
  refreshMarkers(); updateChips();
}
function reapplyAll() {
  if (!chart || !daily.length) return;
  if (!curStrategy) curStrategy = autoStrat;
  const ids = [...active.keys()], strat = curStrategy;
  for (const id of ids) clearInd(id);
  delete markerLayers['strat'];
  clearAuto();
  for (const id of ids) toggleInd(id);
  if (strat) runStrategy(strat, true);
  drawAuto();
}
function updateChips() {
  const box = $('chips');
  box.innerHTML = '';
  for (const id of active.keys()) {
    const meta = INDS.find(x => x[0] === id);
    const c = document.createElement('span');
    c.className = 'chip';
    const t = document.createElement('span'); t.textContent = meta ? meta[1] : id;
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = () => toggleInd(id);
    c.appendChild(t); c.appendChild(x); box.appendChild(c);
  }
  if (curStrategy) {
    const c = document.createElement('span');
    c.className = 'chip';
    const t = document.createElement('span'); t.textContent = '전략: ' + curStrategy;
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = () => { delete markerLayers['strat']; curStrategy = null; refreshMarkers(); updateChips(); $('stMsg').textContent = '전략 해제'; };
    c.appendChild(t); c.appendChild(x); box.appendChild(c);
  }
}
const STRAT_NAME = { emaCross: 'EMA 크로스 9/21', maCross: 'MA 크로스 50/200', macd: 'MACD 크로스', rsi: 'RSI 반전', supertrend: '슈퍼트렌드 반전', sar: '파라볼릭SAR 반전', bb: '볼린저 돌파', stoch: '스토캐스틱 크로스', atrStop: 'ATR 추적손절 반전' };
function runStrategy(id, silent) {
  if (!daily.length) return;
  const data = curData();
  const sig = Strat[id](data);
  const mk = [];
  sig.forEach((s, i) => {
    if (!s) return;
    mk.push({ time: data[i].time, position: s === 'BUY' ? 'belowBar' : 'aboveBar', shape: s === 'BUY' ? 'arrowUp' : 'arrowDown', color: s === 'BUY' ? BULL : BEAR, text: s === 'BUY' ? '매수' : '매도' });
  });
  markerLayers['strat'] = mk;
  curStrategy = id;
  autoStrat = id;
  const bt = backtest(data, sig);
  $('stMsg').textContent = '전략 ' + (STRAT_NAME[id] || id) + ' → 거래 ' + bt.trades + '회 · 승률 ' + bt.winRate.toFixed(1) + '% · 누적수익 ' + (bt.totalReturn >= 0 ? '+' : '') + bt.totalReturn.toFixed(1) + '% (수수료 제외)';
  refreshMarkers(); updateChips();
}
function buildIndPanel() {
  let panel = $('indPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'indPanel'; panel.className = 'hidden';
    $('center').appendChild(panel);
  }
  panel.innerHTML = '';
  const groups = {};
  for (const [id, name, g, notice] of INDS) { (groups[g] = groups[g] || []).push([id, name, notice]); }
  for (const g of Object.keys(groups)) {
    const h = document.createElement('h4'); h.textContent = g; panel.appendChild(h);
    for (const [id, name, notice] of groups[g]) {
      const b = document.createElement('button');
      b.className = 'inditem' + (active.has(id) ? ' on' : '');
      b.innerHTML = '';
      b.textContent = name;
      if (notice) { const s = document.createElement('small'); s.textContent = '데이터 필요'; b.appendChild(s); }
      b.onclick = () => { toggleInd(id); buildIndPanel(); };
      panel.appendChild(b);
    }
  }
}
document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', () => {
  $('themeBtn').onclick = () => { light = !light; applyTheme(); };
  const fb = $('favBtn');
  if (fb) fb.onclick = toggleFav;
  const ab = $('autoBtn');
  if (ab) ab.onclick = () => {
    autoMode = !autoMode;
    ab.classList.toggle('on', autoMode);
    if (autoMode) drawAuto(); else { clearAuto(); $('stMsg').textContent = '자동선 해제'; }
  };
  $('indBtn').onclick = () => { buildIndPanel(); $('indPanel').classList.toggle('hidden'); };
  $('stratGo').onclick = () => {
    const v = $('stratSel').value;
    if (!v) { $('stMsg').textContent = '전략을 선택하세요'; return; }
    if ($('indPanel') && !$('indPanel').classList.contains('hidden')) $('indPanel').classList.add('hidden');
    runStrategy(v);
  };
});
