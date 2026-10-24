/*
 * 지표 엔진 회귀 테스트
 *
 * 브라우저를 열지 않고도 초기값 처리와 백테스트 체결 시점을 검증합니다.
 * 실행: node tests/indicators.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const {
  smaArr, emaArr, rmaArr, RSI, Stoch, StochRSI, AO, ADX, Coppock, DEMA, TEMA, TRIX, BWMFI,
  MACD, backtest, walkForwardBundle, COMBO_IDS
} = require('../indicators.js');

function bars(closes) {
  return closes.map((close, i) => ({
    time: i,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000
  }));
}

// EMA와 Wilder RMA는 첫 n개 값의 단순평균으로 시작해야 초기 편향이 없습니다.
assert.deepEqual(emaArr([1, 2, 3], 3), [null, null, 2]);
assert.deepEqual(rmaArr([1, 2, 3], 3), [null, null, 2]);

// 중간에 null이 있으면 이전 구간과 섞지 않고 새 워밍업 구간을 시작해야 합니다.
assert.deepEqual(smaArr([1, null, 3, 5, 7], 2), [null, null, null, 4, 6]);

// 가격이 일정하면 상승/하락 우위가 없으므로 RSI는 100이 아니라 50이어야 합니다.
const flat = RSI(bars(new Array(30).fill(100)), 14);
assert.equal(flat[14], 50);

// 스토캐스틱은 원시값, K, D가 각각 충분히 쌓인 뒤에만 값을 내야 합니다.
const stoch = Stoch(bars(Array.from({ length: 40 }, (_, i) => 100 + (i % 5))), 14, 3, 3);
assert.equal(stoch.K.findIndex(v => v !== null), 15);
assert.equal(stoch.D.findIndex(v => v !== null), 17);

// Stoch RSI는 RSI 값이 14개 쌓인 뒤 다시 14개 구간을 확보해야 첫 원시값을 계산합니다.
const stochRsi = StochRSI(bars(Array.from({ length: 60 }, (_, i) => 100 + i)), 14, 14, 3, 3);
assert.equal(stochRsi.K.findIndex(v => v !== null), 29);
assert.equal(stochRsi.D.findIndex(v => v !== null), 31);

// ADX의 +DM/-DM은 같은 봉에서 동시에 누적하지 않고 더 큰 방향 하나만 채택합니다.
const directional = ADX([
  { time: 0, open: 9, high: 10, low: 0, close: 9, volume: 1000 },
  { time: 1, open: 9, high: 15, low: -1, close: 10, volume: 1000 },
  { time: 2, open: 10, high: 14, low: -3, close: 8, volume: 1000 }
], 2);
assert.equal(directional.mdi[1], 0);

// 음수 AO는 음수로 유지되어 하락 히스토그램으로 표시되어야 합니다.
const ao = AO(bars(new Array(34).fill(100).concat(new Array(6).fill(90))));
assert.ok(ao[34] < 0);

// 중첩 EMA 지표는 각 EMA가 준비된 뒤에만 값을 내야 합니다.
const trendData = bars(Array.from({ length: 80 }, (_, i) => 100 + i));
assert.equal(DEMA(trendData, 14).findIndex(v => v !== null), 26);
assert.equal(TEMA(trendData, 14).findIndex(v => v !== null), 39);
assert.equal(TRIX(trendData, 14).findIndex(v => v !== null), 40);

// Coppock은 두 ROC와 WMA가 모두 준비되기 전까지 인위적인 0을 출력하지 않습니다.
assert.equal(Coppock(trendData, 10, 14, 11).findIndex(v => v !== null), 23);

// 거래량이 0인 BW MFI는 1로 바꾸어 왜곡하지 않고 계산 불가로 둡니다.
assert.equal(BWMFI([{ time: 0, open: 10, high: 12, low: 10, close: 11, volume: 0 }])[0], null);

// MACD 시그널은 MACD 값이 생긴 뒤 다시 시그널 기간만큼 워밍업해야 합니다.
const macd = MACD(bars(Array.from({ length: 60 }, (_, i) => 100 + i)), 12, 26, 9);
assert.equal(macd.macd.findIndex(v => v !== null), 25);
assert.equal(macd.signal.findIndex(v => v !== null), 33);

// 신호가 나온 봉의 종가가 아니라 다음 봉 시가에서 체결되는지 확인합니다.
const execution = backtest([
  { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { time: 1, open: 110, high: 111, low: 109, close: 110, volume: 1000 },
  { time: 2, open: 120, high: 121, low: 119, close: 120, volume: 1000 }
], ['BUY', null, 'SELL'], { entryDelay: 1, feeBps: 0, slippageBps: 0 });
assert.equal(execution.trades, 1);
assert.ok(Math.abs(execution.totalReturn - (120 / 110 - 1) * 100) < 1e-9);

// 워크포워드는 학습 구간에서 고른 조합을 뒤의 검증 구간에만 평가해야 합니다.
const wfData = Array.from({ length: 200 }, (_, i) => {
  const close = 100 + Math.sin(i / 7) * 8 + i * 0.03;
  return { time: i, open: close - 0.2, high: close + 1, low: close - 1, close, volume: 1000 + i };
});
const wf = walkForwardBundle(wfData, COMBO_IDS.slice(0, 8), 2, { minTrain: 80, testSize: 40, step: 40, feeBps: 0, slippageBps: 0 });
assert.equal(wf.folds.length, 3);
assert.ok(wf.folds.every(f => f.trainEnd < f.testEnd));
assert.ok(Number.isFinite(wf.stats.totalReturn));

console.log('indicators.test.js: 모든 테스트 통과');
