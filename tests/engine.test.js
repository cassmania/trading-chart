/* 엔진 회귀 테스트 — 실행: node tests/engine.test.js */
'use strict';
const assert = require('node:assert/strict');
const E = require('../engine.js');

// 결정적 의사난수 가격 데이터
function gen(n, seed = 7) {
  let s = seed; const r = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  const out = []; let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p, c = Math.max(1, p * (1 + (r() - 0.49) * 0.04));
    out.push({ time: 1600000000 + i * 3600, open: o, high: Math.max(o, c) * (1 + r() * 0.01), low: Math.min(o, c) * (1 - r() * 0.01), close: c, volume: 100 + r() * 900 });
    p = c;
  }
  return out;
}

// 1) 기본 지표 초기값
assert.deepEqual(E.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
assert.deepEqual(E.ema([1, 2, 3], 3), [null, null, 2]);
assert.deepEqual(E.rma([1, 2, 3], 3), [null, null, 2]);
const flatUp = Array.from({ length: 30 }, (_, i) => ({ time: i, open: i, high: i + 1, low: i - 0.5, close: i + 0.5, volume: 1 }));
assert.equal(E.rsi(flatUp, 14)[29], 100, '계속 오르면 RSI 100');

// 2) 미래 참조 없음: 앞부분만으로 계산한 신호 = 전체로 계산한 신호
const b = gen(600);
for (const s of E.STRATEGIES) {
  const full = s.build(b).sig;
  const part = s.build(b.slice(0, 400)).sig;
  for (let i = 0; i < 400; i++) assert.equal(part[i], full[i], s.id + ' 신호가 미래 데이터에 의존함 (i=' + i + ')');
}
const rf = E.regimes(b), rp = E.regimes(b.slice(0, 400));
for (let i = 0; i < 400; i++) assert.equal(rp[i], rf[i], '국면 판정이 미래 데이터에 의존함');

// 3) 체결: 신호 봉 다음 봉 시가 진입
const a = E.analyze(b, { mode: 'long' });
const prep = E.prepare(b);
for (const r of a.rows) for (const t of r.trades) {
  assert.ok(t.entryIdx >= 1);
  assert.equal(t.entry, b[t.entryIdx].open, '진입은 다음 봉 시가');
  assert.equal(prep.built[r.id].sig[t.entryIdx - 1], 1, '직전 봉에 매수 신호 존재');
  assert.ok(t.exitIdx >= t.entryIdx);
  if (t.reason === 'stop') assert.ok(b[t.exitIdx].low <= t.stop + 1e-9, '손절은 저가가 손절가 도달 시');
}
// 4) 형성 중인 마지막 봉은 신호에 쓰지 않음
assert.equal(a.signalEnd, b.length - 1);

// 5) 롱·숏 모드 + 결과 구조
const ab = E.analyze(b, { mode: 'both' });
assert.ok(ab.rows.some(r => r.trades.some(t => t.dir === -1)), '숏 거래 발생');
assert.ok(['up', 'down', 'range'].includes(ab.regime));
assert.ok(Number.isFinite(ab.adaptive.stats.score));
const vp = E.volumeProfile(b, 300, 48);
assert.ok(vp.val <= vp.poc && vp.poc <= vp.vah, 'VAL ≤ POC ≤ VAH');

console.log('engine tests passed');
