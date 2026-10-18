# 트레이딩 챠트

TradingView 스타일 차트 웹앱. `index.html`을 브라우저로 열면 실행됩니다
(시세 API 호출이 필요해서 `python -m http.server` 같은 로컬 서버 권장).

## 기능
- 캔들 차트(상승 빨강·하락 파랑) + 거래량 + MA20/50, 라이트/다크 모드
- 시간봉: 1분·5분·15분·일·주·월봉, 방향키 이동(←→ 1봉, Shift 10봉, ↑↓ 확대, End/Home)
- 코인 실봉: 업비트 API (기본 USDT, KRW 전환 가능)
- 주식 예시(AAPL, 005930.KS): 데모 데이터 (이 정적 사이트에서는 주식 실시간 시세를 지원하지 않음)
- 지표 80종 메뉴(추세·오실레이터·거래량·피벗·패턴) + 전략 9종 백테스트 표시
- 클릭 지점 자동 추세선·지지/저항선

## 차트 라이브러리
`vendor/lightweight-charts.js` — TradingView Lightweight Charts v4.2.0 (Apache-2.0)
