/* 트레이딩 챠트 — 독립 차트 패널 (멀티차트용). 전역 fetch/수식 함수 사용 */
'use strict';

const BULL = '#f23645', BEAR = '#2962ff';  // 상승 빨강 · 하락 파랑
const LC = { orange: '#ff9800', purple: '#9c27b0', blue: '#2962ff', cyan: '#00bcd4', green: '#089981', red: '#f23645', yellow: '#ffeb3b', gray: '#868993' };
function pts(data, arr) {
  return arr.map((v, i) => ({ time: data[i].time, value: v }))
    .filter(p => p.value !== null && p.value !== undefined && isFinite(p.value));
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
function paintOne(c) {
  const t = THEMES[light ? 'light' : 'dark'];
  c.applyOptions({
    layout: { background: { color: t.bg }, textColor: t.text },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    crosshair: { vertLine: { color: t.cross, labelBackgroundColor: t.crossBg }, horzLine: { color: t.cross, labelBackgroundColor: t.crossBg } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border }
  });
}

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
    case 'median': return { lines: [{ color: LC.gray, v: pts(data, MED(data)) }] };
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

class ChartPane {
  constructor(els, hooks) {
    this.els = els;
    this.hooks = hooks || {};
    this.daily = []; this.symbol = ''; this.srcKind = 'demo'; this.srcQuote = '';
    this.active = new Map(); this.markerLayers = {}; this.subCharts = [];
    this.autoLayer = { series: [], lines: [] };
    this.curStrategy = null; this.syncing = false;
    this.tf = (typeof tf !== 'undefined' && tf) ? tf : 'D';
    this.liveWS = null; this.liveTimer = null; this.livePrev = null;
    this.liveGeneration = 0; this.livePollController = null; this.livePollPending = false;
    this.loadRequestId = 0; this.loadController = null;
    this.replay = null; this.lastClick = null;
    this.savedMarkers = null;
    this.chart = LightweightCharts.createChart(els.box, baseOpts());
    this.candle = this.chart.addCandlestickSeries({ upColor: BULL, downColor: BEAR, wickUpColor: BULL, wickDownColor: BEAR, borderVisible: false });
    this.vol = this.chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' } });
    this.chart.priceScale('').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    this.ma20 = this.chart.addLineSeries({ color: '#ff9800', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    this.ma50 = this.chart.addLineSeries({ color: '#9c27b0', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    this.chart.subscribeCrosshairMove(p => this.onCross(p));
    new ResizeObserver(es => { const r = es[0].contentRect; try { this.chart.applyOptions({ width: r.width, height: r.height }); } catch (e) {} }).observe(els.box);
    const self = this;
    this.chart.subscribeClick(p => {
      try { els.box.focus({ preventScroll: true }); } catch (e) { try { els.box.focus(); } catch (e2) {} }
      if (self.hooks.onActivate) self.hooks.onActivate(self);
      if (p && p.time !== undefined) { self.lastClick = p.time; self.drawAuto(p.time); }
    });
    els.box.tabIndex = 0;
    els.box.addEventListener('keydown', e => this.onKey(e));
    if (els.symGo) els.symGo.onclick = () => { const v = els.symInput.value.trim(); if (v) this.load(v); };
    if (els.symInput) els.symInput.onkeydown = e => { if (e.key === 'Enter' && els.symGo) els.symGo.onclick(); };
    paintOne(this.chart);
  }
  label() {
    if (this.srcKind === 'binance' || this.srcKind === 'mexc') return this.srcQuote;
    if (this.srcKind !== 'upbit') return this.symbol;
    const m = this.srcQuote.split('-');
    return m[1] + '/' + m[0];
  }
  curData() { return NATIVE.includes(this.srcKind) ? this.daily : resample(this.daily, this.tf); }
  isIntra() { return !!INTRA[this.tf]; }
  setTF(v) { this.tf = v; return this.load(this.symbol); }
  dec() {
    if (!this.daily.length) return 2;
    const c = this.daily[this.daily.length - 1].close;
    return c >= 1000 ? 0 : c >= 1 ? 2 : 4;
  }
  setHead(bar) {
    const d = this.dec(), e = this.els;
    e.o.textContent = 'O ' + fmt(bar.open, d);
    e.h.textContent = 'H ' + fmt(bar.high, d);
    e.l.textContent = 'L ' + fmt(bar.low, d);
    e.c.textContent = 'C ' + fmt(bar.close, d);
    if (e.px) {
      e.px.textContent = fmt(bar.close, d);
      e.px.className = 'cpx ' + (bar.close >= bar.open ? 'up' : 'down');
    }
  }
  setChg(last, prev) {
    const d = this.dec(), el = this.els.chg;
    const ch = last - prev, p = prev ? ch / prev * 100 : 0;
    el.textContent = (ch >= 0 ? '+' : '') + fmt(ch, d) + ' (' + (p >= 0 ? '+' : '') + p.toFixed(2) + '%)';
    el.className = ch >= 0 ? 'up' : 'down';
  }
  onCross(p) {
    if (!p.time || !this.daily.length) return;
    const data = this.curData();
    const bar = data.find(b => b.time === p.time) || data.reduce((a, b) => b.time <= p.time ? b : a, data[0]);
    if (bar) { this.setHead(bar); const i = data.indexOf(bar); if (i > 0) this.setChg(bar.close, data[i - 1].close); }
  }
  onKey(e) {
    const ts = this.chart.timeScale();
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
  }
  clearData() {
    this.stopReplay();
    for (const id of [...this.active.keys()]) this.clearInd(id);
    this.clearAuto();
    this.markerLayers = {};
    this.lastCombo = null;
    this.curStrategy = null;
    this.daily = [];
    this.candle.setData([]); this.vol.setData([]); this.ma20.setData([]); this.ma50.setData([]);
    this.refreshMarkers();
    this.els.sym.textContent = this.symbol;
    this.els.o.textContent = 'O —'; this.els.h.textContent = 'H —';
    this.els.l.textContent = 'L —'; this.els.c.textContent = 'C —';
    this.els.px.textContent = '—'; this.els.chg.textContent = '';
  }
  async load(sym) {
    const requestId = ++this.loadRequestId;
    if (this.loadController) this.loadController.abort();
    const controller = new AbortController();
    this.loadController = controller;
    const signal = controller.signal;
    this.stopLive();
    this.symbol = String(sym || '').trim().toUpperCase();
    const requestSymbol = this.symbol;
    const requestTf = this.tf;
    if (this.els.symInput) this.els.symInput.value = this.symbol;
    this.msg(this.symbol + ' 로딩 중…');
    const plan = cryptoPlan(this.symbol);
    const base = cryptoBase(this.symbol);
    let done = false;
    for (const step of plan) {
      if (signal.aborted || requestId !== this.loadRequestId) return;
      try {
        if (step === 'binance') {
          const r = await tryBinance(base, requestTf, signal);
          if (signal.aborted || requestId !== this.loadRequestId) return;
          this.daily = r.data; this.srcKind = 'binance'; this.srcQuote = r.market;
          this.msg('실시간 데이터: 바이낸스 ' + r.market + ' (' + tfName(requestTf) + ')');
        } else if (step === 'mexc') {
          const r = await tryMexc(base, requestTf, signal);
          if (signal.aborted || requestId !== this.loadRequestId) return;
          this.daily = r.data; this.srcKind = 'mexc'; this.srcQuote = r.market;
          this.msg('실시간 데이터: MEXC ' + r.market + ' (' + tfName(requestTf) + ')');
        } else if (step === 'upbit') {
          const u = INTRA[requestTf]
            ? await tryUpbitIntra(requestSymbol, INTRA[requestTf], undefined, signal)
            : await tryUpbit(requestSymbol, requestTf, undefined, signal);
          if (signal.aborted || requestId !== this.loadRequestId) return;
          this.daily = u.data; this.srcKind = 'upbit'; this.srcQuote = u.market;
          this.msg('실시간 데이터: 업비트 ' + u.market + ' (' + tfName(requestTf) + ')');
        } else {
          this.daily = await fetchStooq(requestSymbol, signal);
          if (signal.aborted || requestId !== this.loadRequestId) return;
          this.srcKind = 'stooq'; this.srcQuote = '';
          this.msg('실시간 데이터: stooq.com (일봉)');
        }
        done = true;
        break;
      } catch (e) {
        if (signal.aborted || requestId !== this.loadRequestId) return;
      }
    }
    if (signal.aborted || requestId !== this.loadRequestId || requestSymbol !== this.symbol || requestTf !== this.tf) return;
    if (!done) {
      if (INTRA[requestTf] && isDemoOnlySymbol(requestSymbol)) {
        this.srcKind = 'demo'; this.srcQuote = '';
        this.clearData();
        this.msg('분봉은 코인만 지원 — ' + requestSymbol + ' 일봉을 선택하세요');
        if (this.loadController === controller) this.loadController = null;
        if (this.hooks.onSymbol) this.hooks.onSymbol(this);
        return;
      }
      if (INTRA[requestTf]) {
        this.srcKind = 'demo'; this.srcQuote = '';
        this.clearData();
        this.msg('분봉 데이터를 불러오지 못했습니다 — 다른 코인이나 시간봉을 선택하세요');
        if (this.loadController === controller) this.loadController = null;
        if (this.hooks.onSymbol) this.hooks.onSymbol(this);
        return;
      }
      this.daily = genDemo(this.symbol);
      this.srcKind = 'demo'; this.srcQuote = '';
      this.msg(isDemoOnlySymbol(requestSymbol) ? '주식 예시 데이터 (데모 · 실시간 시세 미지원)' : '오프라인 데모 데이터 (시세 서버 접근 실패)');
    }
    this.render();
    if (this.loadController === controller) this.loadController = null;
    if (this.hooks.onSymbol) this.hooks.onSymbol(this);
  }
  msg(t) { if (this.hooks.onMsg) this.hooks.onMsg(this, t); }
  render() {
    const data = this.curData();
    if (!data.length) return;
    this.stopReplay();
    this.els.sym.textContent = this.label();
    this.candle.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    this.vol.setData(data.map(b => ({
      time: b.time, value: b.volume,
      color: b.close >= b.open ? 'rgba(242,54,69,.55)' : 'rgba(41,98,255,.55)'
    })));
    this.ma20.setData(sma(data, 20));
    this.ma50.setData(sma(data, 50));
    this.ma20.applyOptions({ visible: this.hooks.ma20 !== false });
    this.ma50.applyOptions({ visible: this.hooks.ma50 !== false });
    this.vol.applyOptions({ visible: this.hooks.vol !== false });
    const last = data[data.length - 1], prev = data[data.length - 2] || last;
    this.setHead(last); this.setChg(last.close, prev.close);
    this.chart.applyOptions({ timeScale: { timeVisible: this.isIntra() } });
    this.chart.timeScale().fitContent();
    this.msg('st:' + '봉 ' + data.length + '개 · ' + fmtT(data[0].time) + ' ~ ' + fmtT(last.time) + ' · Vol ' + fmtV(last.volume));
    this.reapplyAll();
    // 비활성 차트는 스트림을 열지 않아 다중 차트의 네트워크 연결과 CPU 사용을 줄입니다.
    if (this === activePane) this.startLive();
  }
  stepSec() {
    const data = this.curData();
    if (!data.length || typeof data[0].time !== 'number') return 86400;
    const ds = [];
    for (let i = Math.max(1, data.length - 6); i < data.length; i++) ds.push(data[i].time - data[i - 1].time);
    ds.sort((a, b) => a - b);
    return ds.length ? ds[Math.floor(ds.length / 2)] : 60;
  }
  clearAuto() {
    for (const s of this.autoLayer.series) { try { this.chart.removeSeries(s); } catch (e) {} }
    for (const l of this.autoLayer.lines) { try { this.candle.removePriceLine(l); } catch (e) {} }
    this.autoLayer.series = []; this.autoLayer.lines = [];
    if (this.hooks.onAutoClear) this.hooks.onAutoClear(this);
  }
  drawAuto(anchorTime) {
    this.clearAuto();
    if (!autoMode || !this.daily.length) return;
    const data = this.curData();
    let idx = data.length - 1;
    if (anchorTime !== undefined && anchorTime !== null) {
      const f = data.findIndex(b => b.time === anchorTime);
      if (f >= 0) idx = f;
    }
    const weekends = NATIVE.includes(this.srcKind);
    const al = autoLevels(data, idx, weekends, this.stepSec());
    if (al.supLine.length > 1) {
      const s = this.chart.addLineSeries({ color: '#089981', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      s.setData(al.supLine); this.autoLayer.series.push(s);
    }
    if (al.resLine.length > 1) {
      const resColor = light ? '#334155' : '#ffffff';
      const s = this.chart.addLineSeries({ color: resColor, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(al.resLine); this.autoLayer.series.push(s);
    }
    al.supports.forEach((lv, i) => {
      try { this.autoLayer.lines.push(this.candle.createPriceLine({ price: lv.p, color: BULL, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'S' + (i + 1) + '×' + lv.n })); } catch (e) {}
    });
    al.resistances.forEach((lv, i) => {
      try { this.autoLayer.lines.push(this.candle.createPriceLine({ price: lv.p, color: BEAR, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'R' + (i + 1) + '×' + lv.n })); } catch (e) {}
    });
    if (this.hooks.onAuto) this.hooks.onAuto(this, al);
  }
  allSynced() { return [this.chart, ...this.subCharts.map(s => s.chart)]; }
  linkTimeScale(c, owner) {
    const self = this;
    const h = r => {
      if (self.syncing || !r) return;
      self.syncing = true;
      try { for (const o of self.allSynced()) if (o !== owner) { try { o.timeScale().setVisibleLogicalRange(r); } catch (e) {} } }
      finally { self.syncing = false; }
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(h);
    return h;
  }
  addSubPane(id, title) {
    const doc = this.els.panes.ownerDocument || document;
    const wrap = doc.createElement('div');
    wrap.className = 'subpane';
    const ph = doc.createElement('div'); ph.className = 'ph';
    const nm = doc.createElement('span'); nm.textContent = title;
    const x = doc.createElement('button'); x.textContent = '✕';
    x.onclick = () => this.toggleInd(id);
    ph.appendChild(nm); ph.appendChild(x);
    const box = doc.createElement('div'); box.className = 'pb';
    wrap.appendChild(ph); wrap.appendChild(box); this.els.panes.appendChild(wrap);
    const c = LightweightCharts.createChart(box, baseOpts());
    new ResizeObserver(es => { const r = es[0].contentRect; try { c.applyOptions({ width: r.width, height: r.height }); } catch (e) {} }).observe(box);
    const entry = { id, chart: c, box, wrap, handlers: [] };
    entry.handlers.push([c, this.linkTimeScale(c, c)]);
    entry.handlers.push([this.chart, this.linkTimeScale(this.chart, this.chart)]);
    this.subCharts.push(entry);
    try { const r = this.chart.timeScale().getVisibleLogicalRange(); if (r) c.timeScale().setVisibleLogicalRange(r); } catch (e) {}
    return entry;
  }
  refreshMarkers() {
    const all = [];
    for (const k of Object.keys(this.markerLayers)) for (const m of this.markerLayers[k]) all.push(m);
    all.sort((a, b) => a.time < b.time ? -1 : 1);
    try { this.candle.setMarkers(all); } catch (e) {}
  }
  clearInd(id) {
    const st = this.active.get(id);
    if (!st) return;
    for (const s of st.series) { try { s.c.removeSeries(s.s); } catch (e) {} }
    for (const p of st.panes) {
      this.subCharts = this.subCharts.filter(x => x !== p);
      try { p.chart.remove(); } catch (e) {}
      p.wrap.remove();
    }
    for (const l of st.lines) { try { this.candle.removePriceLine(l); } catch (e) {} }
    delete this.markerLayers['ind:' + id];
    this.active.delete(id);
    this.refreshMarkers();
    if (this.hooks.onInd) this.hooks.onInd(this);
  }
  toggleInd(id) {
    const meta = INDS.find(x => x[0] === id);
    if (!meta) return;
    if (meta[3]) { this.msg(meta[1] + ': 거래소 전체 등락 데이터가 필요한 지표라 미지원'); return; }
    if (this.active.has(id)) { this.clearInd(id); return; }
    if (!this.daily.length) return;
    const data = this.curData();
    const r = computeInd(id, data);
    const st = { series: [], panes: [], lines: [] };
    for (const l of (r.lines || [])) {
      if (!l.v.length) continue;
      if (r.pane) {
        let pane = this.subCharts.find(p => p.id === 'pane:' + id);
        if (!pane) pane = this.addSubPane('pane:' + id, meta[1]);
        const s = pane.chart.addLineSeries({ color: l.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(l.v); st.series.push({ c: pane.chart, s }); st.panes.push(pane);
      } else {
        const s = this.chart.addLineSeries({ color: l.color, lineWidth: l.width || 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(l.v); st.series.push({ c: this.chart, s });
      }
    }
    for (const h of (r.hists || [])) {
      if (!h.v.length) continue;
      if (r.pane) {
        let pane = this.subCharts.find(p => p.id === 'pane:' + id);
        if (!pane) pane = this.addSubPane('pane:' + id, meta[1]);
        const s = pane.chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' } });
        s.setData(h.v); st.series.push({ c: pane.chart, s }); st.panes.push(pane);
      } else {
        const s = this.chart.addHistogramSeries({ priceScaleId: 'ind', priceFormat: { type: 'volume' } });
        s.setData(h.v); st.series.push({ c: this.chart, s });
      }
    }
    st.panes = [...new Set(st.panes)];
    for (const p of (r.pricelines || [])) {
      try { st.lines.push(this.candle.createPriceLine({ price: p.price, color: p.color, lineWidth: 1, lineStyle: p.style || 2, axisLabelVisible: true, title: p.title || '' })); } catch (e) {}
    }
    if (r.markers && r.markers.length) this.markerLayers['ind:' + id] = r.markers;
    if (!st.series.length && !st.lines.length && !(r.markers && r.markers.length)) {
      this.msg(meta[1] + ': 데이터 부족으로 표시 불가');
      return;
    }
    this.active.set(id, st);
    this.refreshMarkers();
    if (this.hooks.onInd) this.hooks.onInd(this);
  }
  reapplyAll() {
    if (!this.daily.length) return;
    if (!this.curStrategy) this.curStrategy = autoStrat;
    const ids = [...this.active.keys()], strat = this.curStrategy;
    for (const id of ids) this.clearInd(id);
    delete this.markerLayers['strat'];
    delete this.markerLayers['combo'];
    this.clearAuto();
    for (const id of ids) this.toggleInd(id);
    if (strat) this.runStrategy(strat, true);
    if (this.lastCombo) this.plotCombo();
    this.drawAuto();
  }
  runStrategy(id, silent) {
    if (!this.daily.length) return;
    const data = this.curData();
    const sig = Strat[id](data);
    const mk = [];
    sig.forEach((s, i) => {
      if (!s) return;
      mk.push({ time: data[i].time, position: s === 'BUY' ? 'belowBar' : 'aboveBar', shape: s === 'BUY' ? 'arrowUp' : 'arrowDown', color: s === 'BUY' ? BULL : BEAR, text: s === 'BUY' ? '매수' : '매도' });
    });
    this.markerLayers['strat'] = mk;
    this.curStrategy = id;
    autoStrat = id;
    const bt = backtest(data, sig);
    this.msg('전략 ' + (STRAT_NAME[id] || id) + ' → 거래 ' + bt.trades + '회 · 승률 ' + bt.winRate.toFixed(1) + '% · 누적수익 ' + (bt.totalReturn >= 0 ? '+' : '') + bt.totalReturn.toFixed(1) + '% (수수료 제외)');
    this.refreshMarkers();
    if (this.hooks.onInd) this.hooks.onInd(this);
  }
  /* ---- 리플레이 ---- */
  startReplay(speedMs) {
    if (!this.daily.length) return false;
    this.stopReplay();
    const data = this.curData();
    let start = Math.max(20, data.length - 100);
    if (this.lastClick !== null && this.lastClick !== undefined) {
      const f = data.findIndex(b => b.time === this.lastClick);
      if (f >= 20) start = f;
    }
    this.replay = { idx: start, total: data.length };
    for (const [, st] of this.active) for (const s of st.series) { try { s.s.applyOptions({ visible: false }); } catch (e) {} }
    for (const p of this.subCharts) { try { p.wrap.style.display = 'none'; } catch (e) {} }
    this.savedMarkers = this.markerLayers;
    this.markerLayers = {};
    this.refreshMarkers();
    this.clearAuto();
    this.ma20.applyOptions({ visible: true });
    this.ma50.applyOptions({ visible: true });
    this.vol.applyOptions({ visible: true });
    const self = this;
    this.replay.timer = setInterval(() => self.replayTick(), speedMs || 400);
    this.replayTick();
    return true;
  }
  replayTick() {
    const rp = this.replay;
    if (!rp) return false;
    const data = this.curData();
    if (rp.idx >= data.length) { this.stopReplay(); return false; }
    const slice = data.slice(0, rp.idx + 1);
    const C_ = slice.map(b => b.close);
    this.candle.setData(slice.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    this.vol.setData(slice.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(242,54,69,.55)' : 'rgba(41,98,255,.55)' })));
    this.ma20.setData(sma(slice, 20));
    this.ma50.setData(sma(slice, 50));
    const last = slice[slice.length - 1];
    this.setHead(last);
    this.msg('리플레이 ' + (rp.idx + 1) + '/' + data.length + ' · ' + fmtT(last.time));
    try { this.chart.timeScale().scrollToRealTime(); } catch (e) {}
    rp.idx++;
    if (rp.idx >= data.length) { this.stopReplay(); return false; }
    return true;
  }
  stopReplay() {
    const rp = this.replay;
    this.replay = null;
    if (!rp) return;
    if (rp.timer) { try { clearInterval(rp.timer); } catch (e) {} }
    if (this.savedMarkers) { this.markerLayers = this.savedMarkers; this.savedMarkers = null; this.refreshMarkers(); }
    for (const [, st] of this.active) for (const s of st.series) { try { s.s.applyOptions({ visible: true }); } catch (e) {} }
    for (const p of this.subCharts) { try { p.wrap.style.display = ''; } catch (e) {} }
    if (this.daily.length) this.render();
  }
  applyTheme() { paintOne(this.chart); for (const s of this.subCharts) paintOne(s.chart); }
  optimizeCombo() {
    if (!this.daily.length) return null;
    const data = this.curData();
    const cands = [...this.active.keys()].filter(id => COMBO_IDS.includes(id));
    const use = cands.length >= 2 ? cands : COMBO_IDS.slice();
    const g = greedyBundle(data, use, 5);
    for (const id of [...this.active.keys()]) if (!g.bundle.includes(id)) this.clearInd(id);
    for (const id of g.bundle) if (!this.active.has(id)) this.toggleInd(id);
    const mk = [];
    g.signals.forEach((s, i) => {
      if (!s) return;
      mk.push({ time: data[i].time, position: s === 'BUY' ? 'belowBar' : 'aboveBar', shape: s === 'BUY' ? 'arrowUp' : 'arrowDown', color: s === 'BUY' ? BULL : BEAR, text: '조합' + (s === 'BUY' ? '매수' : '매도') });
    });
    this.markerLayers['combo'] = mk;
    let lastSig = null, barsAgo = -1;
    for (let i = g.signals.length - 1; i >= 0; i--) {
      if (g.signals[i] !== null) { lastSig = g.signals[i]; barsAgo = g.signals.length - 1 - i; break; }
    }
    this.lastCombo = { bundle: g.bundle, stats: g.stats, steps: g.steps, lastSig, barsAgo, id: 'combo:' + g.bundle.slice().sort().join('+') };
    this.refreshMarkers();
    this.msg('최적 조합 [' + g.bundle.join('+') + '] → 거래 ' + g.stats.trades + '회 · 승률 ' + g.stats.winRate.toFixed(1) + '% · 수익 ' + (g.stats.totalReturn >= 0 ? '+' : '') + g.stats.totalReturn.toFixed(1) + '%');
    if (this.hooks.onInd) this.hooks.onInd(this);
    return this.lastCombo;
  }
  plotCombo() {
    if (!this.lastCombo || !this.daily.length) return;
    const data = this.curData();
    const sig = comboSignals(data, this.lastCombo.bundle);
    const mk = [];
    sig.forEach((s, i) => {
      if (!s) return;
      mk.push({ time: data[i].time, position: s === 'BUY' ? 'belowBar' : 'aboveBar', shape: s === 'BUY' ? 'arrowUp' : 'arrowDown', color: s === 'BUY' ? BULL : BEAR, text: '조합' + (s === 'BUY' ? '매수' : '매도') });
    });
    this.markerLayers['combo'] = mk;
    this.lastCombo.stats = backtest(data, sig);
    let lastSig = null, barsAgo = -1;
    for (let i = sig.length - 1; i >= 0; i--) {
      if (sig[i] !== null) { lastSig = sig[i]; barsAgo = sig.length - 1 - i; break; }
    }
    this.lastCombo.lastSig = lastSig;
    this.lastCombo.barsAgo = barsAgo;
    this.refreshMarkers();
  }
  stopLive() {
    const wasLive = Boolean(this.liveWS || this.liveTimer);
    this.liveGeneration += 1;
    if (this.liveWS) { try { this.liveWS.close(); } catch (e) {} this.liveWS = null; }
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; }
    if (this.livePollController) { this.livePollController.abort(); this.livePollController = null; }
    this.livePollPending = false;
    if (wasLive && this.hooks.onLive) this.hooks.onLive(this, false);
  }
  startLive() {
    this.stopLive();
    if (!this.daily.length || this.srcKind === 'demo' || this.srcKind === 'stooq') return false;
    const base = cryptoBase(this.symbol);
    const generation = this.liveGeneration;
    this.livePrev = this.daily.length > 1 ? this.daily[this.daily.length - 2].close : this.daily[this.daily.length - 1].close;
    const isUSDT = this.srcKind === 'binance' || this.srcKind === 'mexc' || (this.srcKind === 'upbit' && this.srcQuote.startsWith('USDT'));
    if (isUSDT && typeof WebSocket !== 'undefined') {
      try {
        const ws = new WebSocket('wss://stream.binance.com:9443/ws/' + base.toLowerCase() + 'usdt@miniTicker');
        this.liveWS = ws;
        const self = this;
        ws.onopen = () => { if (self.liveWS === ws && self.liveGeneration === generation && self.hooks.onLive) self.hooks.onLive(self, true); };
        ws.onclose = () => { if (self.liveWS === ws && self.liveGeneration === generation) { self.liveWS = null; if (self.hooks.onLive) self.hooks.onLive(self, false); self.startLivePoll(); } };
        ws.onerror = () => { try { ws.close(); } catch (e) {} };
        ws.onmessage = ev => {
          if (self.liveWS !== ws || self.liveGeneration !== generation) return;
          try {
            const m = JSON.parse(ev.data);
            const t = { price: +m.c, open: +m.o, high: +m.h, low: +m.l, vol: +m.v };
            if (!isFinite(t.price) || t.price <= 0) return;
            self.onLiveTick(t);
          } catch (e) {}
        };
        return true;
      } catch (e) {}
    }
    this.startLivePoll();
    return true;
  }
  startLivePoll() {
    if (this.liveTimer) return;
    const self = this;
    const generation = this.liveGeneration;
    if (self.hooks.onLive) self.hooks.onLive(self, true);
    const poll = async () => {
      if (self.livePollPending || generation !== self.liveGeneration) return;
      self.livePollPending = true;
      const controller = new AbortController();
      self.livePollController = controller;
      try {
        let t = null;
        if (self.srcKind === 'upbit' && self.srcQuote) {
          const r = await fetch('https://api.upbit.com/v1/ticker?markets=' + encodeURIComponent(self.srcQuote), { signal: controller.signal, cache: 'no-store' });
          if (!r.ok) throw new Error('upbit ticker ' + r.status);
          const j = await r.json();
          if (j && j[0]) t = { price: j[0].trade_price, open: j[0].opening_price, high: j[0].high_price, low: j[0].low_price, vol: 0 };
        } else {
          const base = cryptoBase(self.symbol);
          const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + base + 'USDT', { signal: controller.signal, cache: 'no-store' });
          if (!r.ok) throw new Error('binance ticker ' + r.status);
          const j = await r.json();
          if (j && j.lastPrice) t = { price: +j.lastPrice, open: +j.openPrice, high: +j.highPrice, low: +j.lowPrice, vol: 0 };
        }
        if (generation === self.liveGeneration && t && isFinite(t.price) && t.price > 0) self.onLiveTick(t);
      } catch (e) {
        if (e.name !== 'AbortError') { /* 다음 주기에서 시세 조회를 다시 시도합니다. */ }
      } finally {
        if (generation === self.liveGeneration) {
          self.livePollPending = false;
          if (self.livePollController === controller) self.livePollController = null;
        }
      }
    };
    poll();
    this.liveTimer = setInterval(poll, 5000);
  }
  onLiveTick(t) {
    if (!this.daily.length) return;
    const data = this.curData();
    const isMin = typeof data[0].time === 'number';
    if (isMin) {
      const bar = data[data.length - 1];
      bar.close = t.price;
      if (t.high > bar.high) bar.high = t.high;
      if (t.low < bar.low) bar.low = t.low;
    } else {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      const today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      const last = data[data.length - 1];
      if (today !== last.time) {
        data.push({ time: today, open: t.price, high: t.price, low: t.price, close: t.price, volume: 0 });
        try { this.chart.timeScale().scrollToRealTime(); } catch (e) {}
      } else {
        last.close = t.price;
        if (t.high > last.high) last.high = t.high;
        if (t.low < last.low) last.low = t.low;
      }
    }
    const bar = data[data.length - 1];
    try {
      this.candle.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      this.vol.update({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? 'rgba(242,54,69,.55)' : 'rgba(41,98,255,.55)' });
    } catch (e) {}
    if (this.hooks.onTick) this.hooks.onTick(this, t.price);
  }
  destroy() {
    this.loadRequestId += 1;
    if (this.loadController) { this.loadController.abort(); this.loadController = null; }
    this.stopLive();
    for (const p of this.subCharts) { try { p.chart.remove(); } catch (e) {} }
    this.subCharts = [];
    try { this.chart.remove(); } catch (e) {}
    if (this.els.cell) this.els.cell.remove();
  }
}
