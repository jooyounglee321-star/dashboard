/**
 * stockStats.js 단위 테스트
 *
 * 고정 기준일: 2026-07-07 (vite.config.js fakeTimers로 설정)
 * 1M cutoff → 2026-06-07
 * 3M cutoff → 2026-04-07
 * 6M cutoff → 2026-01-07
 */
import { describe, it, expect } from 'vitest'
import { calcCutoff, cleanStr, computePeriodStats } from '../utils/stockStats'

// ────────────────────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────────────────────
const p  = (date, qty, price) => ({ date, qty, price })   // 매입
const s  = (date, qty, price) => ({ date, qty, price })   // 매도
const stock = (ticker, purchases = [], sells = [], is_deleted = false) =>
  ({ ticker, name: ticker, purchases, sells, is_deleted })
const group = (id, currency, stocks) =>
  ({ id, name: id, currency, stocks })

const priceMap = {
  AAPL: { current_price: 200 },
  TSLA: { current_price: 300 },
  MSFT: { current_price: 400 },
  '005930': { current_price: 80000 },
  '066570': { current_price: 90000 },
}

// ────────────────────────────────────────────────────────────
// calcCutoff
// ────────────────────────────────────────────────────────────
describe('calcCutoff', () => {
  it('1m → 2026-06-07', () => expect(calcCutoff('1m')).toBe('2026-06-07'))
  it('3m → 2026-04-07', () => expect(calcCutoff('3m')).toBe('2026-04-07'))
  it('6m → 2026-01-07', () => expect(calcCutoff('6m')).toBe('2026-01-07'))
  it('ytd → 2026-01-01', () => expect(calcCutoff('ytd')).toBe('2026-01-01'))
  it('1y → 2025-07-07', () => expect(calcCutoff('1y')).toBe('2025-07-07'))
  it('3y → 2023-07-07', () => expect(calcCutoff('3y')).toBe('2023-07-07'))
  it('custom + 날짜 → 그 날짜 반환', () => expect(calcCutoff('custom', '2026-03-01')).toBe('2026-03-01'))
  it('custom + null → null',          () => expect(calcCutoff('custom', null)).toBeNull())
  it('all → null',                    () => expect(calcCutoff('all')).toBeNull())
  it('미지 키 → null',                () => expect(calcCutoff('whatever')).toBeNull())
})

// ────────────────────────────────────────────────────────────
// cleanStr
// ────────────────────────────────────────────────────────────
describe('cleanStr', () => {
  it('첫 번째 유효값 반환',            () => expect(cleanStr('삼성전자', 'SEC')).toBe('삼성전자'))
  it('"undefined" 문자열 건너뜀',      () => expect(cleanStr('undefined', 'AAPL')).toBe('AAPL'))
  it('null·빈 문자열 건너뜀',          () => expect(cleanStr(null, '', 'TSLA')).toBe('TSLA'))
  it('모두 무효 → null',              () => expect(cleanStr(null, 'undefined', '')).toBeNull())
  it('공백만 있는 문자열 건너뜀',      () => expect(cleanStr('   ', 'OK')).toBe('OK'))
})

// ────────────────────────────────────────────────────────────
// computePeriodStats
// ────────────────────────────────────────────────────────────
describe('computePeriodStats', () => {

  // ── null / 빈 입력 ─────────────────────────────────────
  it('stockData=null → 빈 결과', () => {
    expect(computePeriodStats(null, 'all'))
      .toEqual({ periodGrpTotals: [], periodStockValues: [], periodStockEvals: [] })
  })

  it('그룹 없음 → 빈 결과', () => {
    expect(computePeriodStats({ groups: [], priceMap: {} }, 'all'))
      .toEqual({ periodGrpTotals: [], periodStockValues: [], periodStockEvals: [] })
  })

  // ── 기본 전체기간 ──────────────────────────────────────
  it('전체기간: 단일 USD 매입 → evalPL·evalAmt 정상', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 150)])
    ])], priceMap }

    const { periodStockValues, periodStockEvals, periodGrpTotals } = computePeriodStats(data, 'all')

    expect(periodStockValues).toHaveLength(1)
    expect(periodStockValues[0]).toMatchObject({ ticker: 'AAPL', evalAmt: 2000 })   // 200*10

    expect(periodStockEvals).toHaveLength(1)
    expect(periodStockEvals[0]).toMatchObject({ label: 'AAPL', evalPL: 500, sym: '$', isKRW: false }) // (200-150)*10

    expect(periodGrpTotals[0].total).toBe(2000)
  })

  it('전체기간: KRW 종목 sym=₩ / isKRW=true', () => {
    const data = { groups: [group('kr', 'KRW', [
      stock('005930', [p('2026-01-01', 10, 70000)])
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, 'all')

    expect(periodStockEvals[0]).toMatchObject({ sym: '₩', isKRW: true, evalPL: 100000 }) // (80000-70000)*10
  })

  // ── 기간 필터 ──────────────────────────────────────────
  it('1M: 기간 밖 매입은 psv/pse에서 제외', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [
        p('2026-01-01', 5, 100),  // 1M 이전 → 제외 (cutoff=2026-06-07)
        p('2026-07-01', 5, 180),  // 1M 이내 → 포함
      ])
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockValues[0].evalAmt).toBe(1000)         // 200*5
    expect(periodStockEvals[0].evalPL).toBe(100)            // (200-180)*5
  })

  it('3M: cutoff=2026-04-07 — 그 이전 매입 제외', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [
        p('2026-04-01', 10, 190), // 3M 이전 → 제외
        p('2026-05-01', 5, 195),  // 3M 이내 → 포함
      ])
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, '3m')

    expect(periodStockEvals[0].evalPL).toBe((200 - 195) * 5) // 25
  })

  // ── periodHQ 핵심 케이스 ───────────────────────────────
  it('핵심버그: 이전 기간 매도가 많아도 1M 매입 수량 유지 (min(periodBQ, totalHQ))', () => {
    // totalBQ=15, sq=8, totalHQ=7 / periodBQ(1M)=5 → periodHQ=min(5,7)=5
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2025-12-01', 10, 120), p('2026-07-01', 5, 190)],
        [s('2026-03-01', 8, 160)]
      )
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockEvals[0].evalPL).toBe((200 - 190) * 5) // 50
  })

  it('기간 매입 > 현재 보유: periodHQ=min(periodBQ, totalHQ) 로 조정', () => {
    // 1M 내 5주 매입, 3주 매도 → totalHQ=2, periodHQ=min(5,2)=2
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2026-07-01', 5, 190)],
        [s('2026-07-02', 3, 200)]
      )
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockEvals[0].evalPL).toBe((200 - 190) * 2) // 20
  })

  it('전량 매도 → totalHQ=0 → psv/pse 미포함', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2026-01-01', 5, 150)],
        [s('2026-02-01', 5, 180)]
      )
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, 'all')

    expect(periodStockValues).toHaveLength(0)
    expect(periodStockEvals).toHaveLength(0)
  })

  it('기간 내 매입 없음 → 그 종목은 psv/pse에 미포함', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2025-01-01', 10, 100)])  // 훨씬 이전
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockValues).toHaveLength(0)
    expect(periodStockEvals).toHaveLength(0)
  })

  // ── is_deleted ─────────────────────────────────────────
  it('is_deleted 종목은 전체기간에서도 제외', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 150)], [], true),   // deleted
      stock('TSLA', [p('2026-01-01', 5, 250)],  [], false),  // active
    ])], priceMap }

    const { periodStockValues, periodStockEvals, periodGrpTotals } = computePeriodStats(data, 'all')

    expect(periodStockValues.map(x => x.ticker)).not.toContain('AAPL')
    expect(periodStockValues.map(x => x.ticker)).toContain('TSLA')
    expect(periodStockEvals[0].evalPL).toBe((300 - 250) * 5)  // 250
    expect(periodGrpTotals[0].total).toBe(300 * 5)            // TSLA만: 1500
  })

  it('그룹 내 일부 삭제 — grpTotal은 활성 종목만 합산', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 150)], [], false),  // evalAmt=2000
      stock('TSLA', [p('2026-01-01', 5, 250)],  [], true),   // deleted → 0
    ])], priceMap }

    const { periodGrpTotals } = computePeriodStats(data, 'all')

    expect(periodGrpTotals[0].total).toBe(200 * 10) // 2000, TSLA 제외
  })

  // ── 가격 데이터 ────────────────────────────────────────
  it('priceMap에 없는 종목 → avg로 폴백, evalPL=0', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('UNKNOWN', [p('2026-01-01', 10, 100)])
    ])], priceMap: {} }  // 가격 없음

    const { periodStockEvals } = computePeriodStats(data, 'all')

    // cur=avg=100 → evalPL=(100-100)*10=0
    expect(periodStockEvals[0].evalPL).toBe(0)
  })

  it('매입가 0 → avg=0 → evalPL=null → pse 미포함', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 0)])
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, 'all')

    expect(periodStockEvals).toHaveLength(0)
  })

  // ── 다중 그룹 ──────────────────────────────────────────
  it('KRW 그룹 + USD 그룹: 통화 sym·isKRW 각각 올바름', () => {
    const data = {
      groups: [
        group('kr', 'KRW', [stock('005930', [p('2026-01-01', 10, 70000)])]),
        group('us', 'USD', [stock('AAPL',   [p('2026-01-01', 5,  150)])]),
      ],
      priceMap,
    }

    const { periodStockEvals, periodGrpTotals } = computePeriodStats(data, 'all')

    const krw = periodStockEvals.find(e => e.label === '005930')
    const usd = periodStockEvals.find(e => e.label === 'AAPL')
    expect(krw).toMatchObject({ sym: '₩', isKRW: true,  evalPL: 100000 }) // (80000-70000)*10
    expect(usd).toMatchObject({ sym: '$', isKRW: false, evalPL: 250 })    // (200-150)*5

    expect(periodGrpTotals.find(g => g.id === 'kr').total).toBe(800000)   // 80000*10
    expect(periodGrpTotals.find(g => g.id === 'us').total).toBe(1000)     // 200*5
  })

  it('다중 그룹: 1M 기간 필터가 그룹별로 독립 적용', () => {
    // cutoff = 2026-06-07
    const data = {
      groups: [
        group('kr', 'KRW', [stock('005930', [
          p('2025-10-01', 5, 70000),  // 1M 이전 제외
          p('2026-07-01', 3, 75000),  // 1M 이내 포함
        ])]),
        group('us', 'USD', [
          stock('AAPL', [p('2026-01-01', 10, 150)]),         // 1M 이전 → 제외
          stock('TSLA', [p('2026-06-20', 2, 280)]),          // 1M 이내 → 포함
        ]),
      ],
      priceMap,
    }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    const tickers = periodStockValues.map(x => x.ticker)
    expect(tickers).toContain('005930')
    expect(tickers).not.toContain('AAPL')
    expect(tickers).toContain('TSLA')

    // 005930: avg=75000, cur=80000, qty=3, evalPL=15000
    expect(periodStockEvals.find(e => e.label === '005930').evalPL).toBe(15000)
    // TSLA: avg=280, cur=300, qty=2, evalPL=40
    expect(periodStockEvals.find(e => e.label === 'TSLA').evalPL).toBe(40)
  })

  it('세 그룹: grpTotal이 각 그룹 내 evalAmt 합산과 일치', () => {
    const data = {
      groups: [
        group('g1', 'USD', [
          stock('AAPL', [p('2026-01-01', 3, 150)]),  // evalAmt=600
          stock('TSLA', [p('2026-01-01', 2, 200)]),  // evalAmt=600
        ]),
        group('g2', 'USD', [
          stock('MSFT', [p('2026-01-01', 1, 350)]),  // evalAmt=400
        ]),
        group('g3', 'KRW', [
          stock('005930', [p('2026-01-01', 5, 70000)]), // evalAmt=400000
        ]),
      ],
      priceMap,
    }

    const { periodGrpTotals, periodStockValues } = computePeriodStats(data, 'all')

    expect(periodGrpTotals.find(g => g.id === 'g1').total).toBe(200*3 + 300*2) // 1200
    expect(periodGrpTotals.find(g => g.id === 'g2').total).toBe(400*1)          // 400
    expect(periodGrpTotals.find(g => g.id === 'g3').total).toBe(80000*5)        // 400000
    expect(periodStockValues).toHaveLength(4)
  })

  // ── custom 기간 ────────────────────────────────────────
  it('custom 기간: cutoffEnd로 미래 매입도 제외', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [
        p('2025-12-01', 5, 130), // 범위 이전 제외
        p('2026-02-01', 3, 140), // 범위 내 포함
        p('2026-04-01', 4, 160), // 범위 이후 제외
      ])
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(
      data, 'custom', '2026-01-01', '2026-03-31'
    )

    expect(periodStockValues[0].evalAmt).toBe(200 * 3)          // 600
    expect(periodStockEvals[0].evalPL).toBe((200 - 140) * 3)   // 180
  })

  // ── 날짜 없는 매입 ─────────────────────────────────────
  it('date 없는 매입 → 어떤 기간 필터에서도 포함', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [{ qty: 5, price: 150 }])  // date 없음
    ])], priceMap }

    // 1M 필터여도 date=undefined → !p.date → 조건 통과
    const { periodStockValues } = computePeriodStats(data, '1m')

    expect(periodStockValues).toHaveLength(1)
    expect(periodStockValues[0].evalAmt).toBe(200 * 5) // 1000
  })

  // ── groupName 매핑 ─────────────────────────────────────
  it('psv 항목의 groupName이 g.name 기준', () => {
    const data = { groups: [group('grp1', 'USD', [
      stock('AAPL', [p('2026-01-01', 2, 150)])
    ])], priceMap }
    const { periodStockValues } = computePeriodStats(data, 'all')
    expect(periodStockValues[0].groupName).toBe('grp1')
  })

  it('"undefined" 그룹명 → cleanStr이 id로 대체', () => {
    const data = {
      groups: [{ id: 'real-id', name: 'undefined', currency: 'USD', stocks: [
        stock('AAPL', [p('2026-01-01', 2, 150)])
      ]}],
      priceMap,
    }
    const { periodGrpTotals } = computePeriodStats(data, 'all')
    expect(periodGrpTotals[0].name).toBe('real-id')
  })
})
