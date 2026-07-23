/**
 * stockStats.js 단위 테스트
 *
 * 고정 기준일: 2026-07-07 (vite.config.js fakeTimers로 설정)
 * 1M cutoff → 2026-06-07
 * 3M cutoff → 2026-04-07
 * 6M cutoff → 2026-01-07
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { calcCutoff, cleanStr, computePeriodStats, computeUnits, computeReturnRates, computeConcentration, computeRealizedPL } from '../utils/stockStats'

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
  beforeAll(() => vi.useFakeTimers({ now: new Date(2026, 6, 7, 12, 0, 0) })) // 로컬 시간 7월7일 정오
  afterAll(() => vi.useFakeTimers({ now: new Date('2026-07-07T12:00:00Z') })) // 전역 설정으로 복원

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
  it('1M: psv는 기간 내 매입만, pse는 전체 보유 기준', () => {
    // psv: 1M 이내 매입(5주)만 포함 → evalAmt=200*5=1000
    // pse: allAvg=(5*100+5*180)/10=140, totalHQ=10 → evalPL=(200-140)*10=600
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [
        p('2026-01-01', 5, 100),  // 1M 이전 → psv 제외
        p('2026-07-01', 5, 180),  // 1M 이내 → psv 포함
      ])
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockValues[0].evalAmt).toBe(1000)   // 200*5 (period only)
    expect(periodStockEvals[0].evalPL).toBe(600)      // (200-140)*10 (전체 보유 기준)
  })

  it('3M: pse는 전체 보유 기준 (allAvg/totalHQ)', () => {
    // allAvg=(10*190+5*195)/15=191.67, totalHQ=15, evalPL=(200-191.67)*15=125
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [
        p('2026-04-01', 10, 190), // 3M 이전
        p('2026-05-01', 5, 195),  // 3M 이내
      ])
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, '3m')

    expect(periodStockEvals[0].evalPL).toBeCloseTo(125, 5) // (200*15 - (10*190+5*195)) = 3000-2875=125
  })

  // ── periodHQ 핵심 케이스 ───────────────────────────────
  it('매도 있어도 pse는 현재 보유(totalHQ) 기준', () => {
    // totalBQ=15, sq=8, totalHQ=7
    // allAvg=(10*120+5*190)/15=143.33, evalPL=(200-143.33)*7≈396.67
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2025-12-01', 10, 120), p('2026-07-01', 5, 190)],
        [s('2026-03-01', 8, 160)]
      )
    ])], priceMap }

    const { periodStockEvals } = computePeriodStats(data, '1m')

    // (200 - 2150/15) * 7 = (3000-2150)/15*7 = 5950/15
    expect(periodStockEvals[0].evalPL).toBeCloseTo(5950 / 15, 2)
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

  it('기간 내 매입 없음 → psv 미포함, pse는 현재 보유 표시', () => {
    // psv: 1M 이내 매입 없음 → 비어있음
    // pse: totalHQ=10, allAvg=100, evalPL=(200-100)*10=1000 → 표시됨
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2025-01-01', 10, 100)])  // 훨씬 이전
    ])], priceMap }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    expect(periodStockValues).toHaveLength(0)   // psv: 기간 내 매입 없으므로 비어있음
    expect(periodStockEvals).toHaveLength(1)    // pse: 현재 보유 종목 표시
    expect(periodStockEvals[0].evalPL).toBe(1000) // (200-100)*10
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

  it('다중 그룹: psv는 기간 필터 적용, pse는 전체 보유 기준', () => {
    // psv cutoff=2026-06-07
    // 005930 psv: 1M내 3주, AAPL psv: 없음, TSLA psv: 2주
    // pse:
    //   005930: allAvg=(5*70000+3*75000)/8=71875, totalHQ=8, evalPL=(80000-71875)*8=65000
    //   AAPL: allAvg=150, totalHQ=10, evalPL=(200-150)*10=500
    //   TSLA: allAvg=280, totalHQ=2, evalPL=(300-280)*2=40
    const data = {
      groups: [
        group('kr', 'KRW', [stock('005930', [
          p('2025-10-01', 5, 70000),  // 1M 이전 → psv 제외
          p('2026-07-01', 3, 75000),  // 1M 이내 → psv 포함
        ])]),
        group('us', 'USD', [
          stock('AAPL', [p('2026-01-01', 10, 150)]),         // 1M 이전 → psv 제외
          stock('TSLA', [p('2026-06-20', 2, 280)]),          // 1M 이내 → psv 포함
        ]),
      ],
      priceMap,
    }

    const { periodStockValues, periodStockEvals } = computePeriodStats(data, '1m')

    const tickers = periodStockValues.map(x => x.ticker)
    expect(tickers).toContain('005930')
    expect(tickers).not.toContain('AAPL')   // psv: 기간 내 매입 없음
    expect(tickers).toContain('TSLA')

    // pse: 전체 보유 기준
    expect(periodStockEvals.find(e => e.label === '005930').evalPL).toBe(65000)  // (80000-71875)*8
    expect(periodStockEvals.find(e => e.label === 'TSLA').evalPL).toBe(40)       // (300-280)*2
    expect(periodStockEvals.find(e => e.label === 'AAPL').evalPL).toBe(500)     // (200-150)*10
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

    // psv: 기간 내 매입(3주, avg=140) → evalAmt=200*3=600
    // pse: allAvg=(5*130+3*140+4*160)/12=142.5, totalHQ=12, evalPL=(200-142.5)*12=690
    expect(periodStockValues[0].evalAmt).toBe(200 * 3)          // 600
    expect(periodStockEvals[0].evalPL).toBe(690)                // (200*12 - (5*130+3*140+4*160)) = 2400-1710=690
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

// ────────────────────────────────────────────────────────────
// computeUnits
// ────────────────────────────────────────────────────────────
describe('computeUnits', () => {
  const data = {
    groups: [
      group('g1', 'USD', [
        stock('AAPL', [p('2026-01-01', 10, 150)]),  // evalAmt=200*10=2000
        stock('TSLA', [p('2026-01-01', 5, 250)]),   // evalAmt=300*5=1500
      ]),
      group('g2', 'KRW', [
        stock('005930', [p('2026-01-01', 3, 70000)]), // evalAmt=80000*3=240000
      ]),
    ],
    priceMap,
  }

  it('전체 선택 → 그룹 단위 반환', () => {
    const { units, isStockUnit } = computeUnits(data, '')
    expect(isStockUnit).toBe(false)
    expect(units).toHaveLength(2)
    const g1 = units.find(u => u.name === 'g1')
    expect(g1.evalAmt).toBe(200*10 + 300*5) // 3500
  })

  it('그룹 선택 → 종목 단위 반환', () => {
    const { units, isStockUnit } = computeUnits(data, 'g1')
    expect(isStockUnit).toBe(true)
    expect(units).toHaveLength(2)
    expect(units.find(u => u.ticker === 'AAPL').evalAmt).toBe(2000)
    expect(units.find(u => u.ticker === 'TSLA').evalAmt).toBe(1500)
  })

  it('그룹 1개면 자동 종목 단위', () => {
    const singleGroup = {
      groups: [group('only', 'USD', [stock('AAPL', [p('2026-01-01', 5, 150)])])],
      priceMap,
    }
    const { isStockUnit, units } = computeUnits(singleGroup, '')
    expect(isStockUnit).toBe(true)
    expect(units).toHaveLength(1)
    expect(units[0].evalAmt).toBe(200 * 5)
  })

  it('전량 매도 종목은 units에 미포함', () => {
    const d = {
      groups: [group('g1', 'USD', [
        stock('AAPL', [p('2026-01-01', 5, 150)], [s('2026-02-01', 5, 180)]),
        stock('TSLA', [p('2026-01-01', 3, 250)]),
      ])],
      priceMap,
    }
    const { units } = computeUnits(d, 'g1')
    expect(units.map(u => u.ticker)).not.toContain('AAPL')
    expect(units.map(u => u.ticker)).toContain('TSLA')
  })

  it('null 입력 → 빈 배열', () => {
    const { units } = computeUnits(null, '')
    expect(units).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────
// computeReturnRates
// ────────────────────────────────────────────────────────────
describe('computeReturnRates', () => {
  it('수익률% 계산 정확성', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 150)]),   // (200-150)/150*100 = 33.33%
      stock('TSLA', [p('2026-01-01', 5, 350)]),    // (300-350)/350*100 = -14.28%
    ])], priceMap }
    const rates = computeReturnRates(data, '')
    const aapl = rates.find(r => r.ticker === 'AAPL')
    const tsla = rates.find(r => r.ticker === 'TSLA')
    expect(aapl.returnPct).toBeCloseTo((200-150)/150*100, 1)
    expect(tsla.returnPct).toBeCloseTo((300-350)/350*100, 1)
    expect(aapl.holdQty).toBe(10)
    expect(aapl.avgCost).toBe(150)
    expect(aapl.curPrice).toBe(200)
  })

  it('그룹 선택 시 해당 그룹 종목만 반환', () => {
    const data = {
      groups: [
        group('g1', 'USD', [stock('AAPL', [p('2026-01-01', 10, 150)])]),
        group('g2', 'USD', [stock('TSLA', [p('2026-01-01', 5, 250)])]),
      ],
      priceMap,
    }
    const rates = computeReturnRates(data, 'g1')
    expect(rates.map(r => r.ticker)).toContain('AAPL')
    expect(rates.map(r => r.ticker)).not.toContain('TSLA')
  })

  it('전량 매도 종목 제외', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 5, 150)], [s('2026-02-01', 5, 180)]),
    ])], priceMap }
    expect(computeReturnRates(data, '')).toHaveLength(0)
  })

  it('내림차순 정렬 (수익률 높은 것 먼저)', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('TSLA', [p('2026-01-01', 1, 350)]),  // returnPct<0
      stock('AAPL', [p('2026-01-01', 1, 150)]),  // returnPct>0
    ])], priceMap }
    const rates = computeReturnRates(data, '')
    expect(rates[0].ticker).toBe('AAPL')
    expect(rates[1].ticker).toBe('TSLA')
  })
})

// ────────────────────────────────────────────────────────────
// computeConcentration
// ────────────────────────────────────────────────────────────
describe('computeConcentration', () => {
  it('비중% 합계 = 100', () => {
    const units = [
      { name: 'A', evalAmt: 300, isKRW: false },
      { name: 'B', evalAmt: 700, isKRW: false },
    ]
    const result = computeConcentration(units, null)
    const sum = result.reduce((a, r) => a + r.pct, 0)
    expect(sum).toBeCloseTo(100, 5)
  })

  it('단일 항목 → 100%', () => {
    const units = [{ name: 'Only', evalAmt: 1000, isKRW: false }]
    const result = computeConcentration(units, null)
    expect(result[0].pct).toBeCloseTo(100, 5)
  })

  it('내림차순 정렬', () => {
    const units = [
      { name: 'A', evalAmt: 200, isKRW: false },
      { name: 'B', evalAmt: 800, isKRW: false },
    ]
    const result = computeConcentration(units, null)
    expect(result[0].name).toBe('B')
    expect(result[1].name).toBe('A')
  })

  it('빈 배열 → 빈 결과', () => {
    expect(computeConcentration([], null)).toHaveLength(0)
  })

  it('KRW+USD 혼재: fxRate로 환산 후 비중 계산', () => {
    // USD 1000, KRW 1000000 (fxRate=1000 → USD 1000)
    // 50:50 비중
    const units = [
      { name: 'USD-A', evalAmt: 1000, isKRW: false },
      { name: 'KRW-B', evalAmt: 1000000, isKRW: true },
    ]
    const result = computeConcentration(units, 1000)
    const usd = result.find(r => r.name === 'USD-A')
    const krw = result.find(r => r.name === 'KRW-B')
    expect(usd.pct).toBeCloseTo(50, 1)
    expect(krw.pct).toBeCloseTo(50, 1)
  })
})

// ────────────────────────────────────────────────────────────
// computeRealizedPL
// ────────────────────────────────────────────────────────────
describe('computeRealizedPL', () => {
  it('기본 실현 손익 계산', () => {
    // avg_cost=150, sell_price=200, qty=5 → pl=250
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 5, 150)], [s('2026-03-01', 5, 200)])
    ])], priceMap }
    const { total, items } = computeRealizedPL(data)
    expect(items).toHaveLength(1)
    expect(items[0].pl).toBeCloseTo(250, 2)
    expect(items[0].pl_pct).toBeCloseTo((200-150)/150*100, 2)
    expect(total).toBeCloseTo(250, 2)
  })

  it('손실 케이스', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 10, 200)], [s('2026-03-01', 10, 150)])
    ])], priceMap }
    const { total, items } = computeRealizedPL(data)
    expect(items[0].pl).toBeCloseTo(-500, 2)
    expect(total).toBeCloseTo(-500, 2)
  })

  it('가중평균 단가 계산', () => {
    // avg_cost = (10*100 + 5*200) / 15 = 133.33
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2026-01-01', 10, 100), p('2026-02-01', 5, 200)],
        [s('2026-04-01', 3, 300)]
      )
    ])], priceMap }
    const { items } = computeRealizedPL(data)
    expect(items[0].avg_cost).toBeCloseTo((10*100+5*200)/15, 2)
    expect(items[0].pl).toBeCloseTo((300 - (10*100+5*200)/15) * 3, 2)
  })

  it('매도 없으면 빈 결과', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL', [p('2026-01-01', 5, 150)])
    ])], priceMap }
    const { total, items } = computeRealizedPL(data)
    expect(items).toHaveLength(0)
    expect(total).toBe(0)
  })

  it('null 입력 → 빈 결과', () => {
    const { total, items } = computeRealizedPL(null)
    expect(total).toBe(0)
    expect(items).toHaveLength(0)
  })

  it('날짜 내림차순 정렬', () => {
    const data = { groups: [group('g1', 'USD', [
      stock('AAPL',
        [p('2026-01-01', 10, 100)],
        [s('2026-03-01', 2, 200), s('2026-01-15', 3, 150)]
      )
    ])], priceMap }
    const { items } = computeRealizedPL(data)
    expect(items[0].date).toBe('2026-03-01')
    expect(items[1].date).toBe('2026-01-15')
  })

  it('여러 그룹 합계', () => {
    const data = {
      groups: [
        group('g1', 'USD', [stock('AAPL', [p('2026-01-01', 5, 100)], [s('2026-03-01', 5, 200)])]),
        group('g2', 'KRW', [stock('005930', [p('2026-01-01', 10, 60000)], [s('2026-04-01', 10, 80000)])]),
      ],
      priceMap,
    }
    const { total, items } = computeRealizedPL(data)
    expect(items).toHaveLength(2)
    // USD pl=500, KRW pl=200000
    expect(total).toBeCloseTo(500 + 200000, 0)
  })
})
