/**
 * 수입 카테고리 상수 데이터
 * 대분류(main_code) → 소분류(sub_code) 동적 매핑용
 *
 * 사용법:
 *   import { INCOME_CATEGORIES, getSubcategories, getCategoryName } from '../data/incomeCategories'
 *
 *   // 대분류 목록
 *   INCOME_CATEGORIES.map(c => c.code)
 *
 *   // 선택한 대분류의 소분류 목록
 *   getSubcategories('REGULAR')  // → [{code, name_ko, name_en, icon}, ...]
 */

export const INCOME_CATEGORIES = [
  {
    code:    'REGULAR',
    name_ko: '주수입 (정기)',
    name_en: 'Regular Income',
    icon:    '💰',
    subs: [
      { code: 'SALARY',   name_ko: '급여 / 월급',     name_en: 'Base Salary / Paycheck',  icon: '🏦' },
      { code: 'BONUS',    name_ko: '상여금 / 성과급', name_en: 'Bonus / Incentives',      icon: '🎁' },
      { code: 'SIDE_JOB', name_ko: '부업 / 외주 수익',name_en: 'Side Hustle / Freelance', icon: '💼' },
    ],
  },
  {
    code:    'IRREGULAR',
    name_ko: '부수입 (비정기)',
    name_en: 'Irregular Income',
    icon:    '📦',
    subs: [
      { code: 'SUBSIDY',    name_ko: '정부 보조금 / 환급금', name_en: 'Government Subsidy / Tax Refund', icon: '🏛️' },
      { code: 'GIFT',       name_ko: '용돈 / 축의금',        name_en: 'Pocket Money / Gift Cash',       icon: '🎀' },
      { code: 'USED_SALES', name_ko: '중고 판매 수익',       name_en: 'Used Items Sales',               icon: '♻️' },
      { code: 'OTHER_INC',  name_ko: '기타 부수입',          name_en: 'Other Miscellaneous Income',     icon: '📌' },
    ],
  },
  {
    code:    'INVESTMENT',
    name_ko: '금융 / 투자',
    name_en: 'Investment Income',
    icon:    '📈',
    subs: [
      { code: 'INTEREST',     name_ko: '이자 수익',      name_en: 'Interest Income',         icon: '🏧' },
      { code: 'DIVIDEND',     name_ko: '배당금',         name_en: 'Dividend / Distribution', icon: '💹' },
      { code: 'CAPITAL_GAIN', name_ko: '투자 실현 익절', name_en: 'Investment Capital Gains',icon: '📊' },
      { code: 'RENTAL_INC',   name_ko: '부동산 임대료',  name_en: 'Rental Income',           icon: '🏠' },
    ],
  },
  {
    code:    'TRANSFER',
    name_ko: '자산 이동',
    name_en: 'Asset Transfer',
    icon:    '🔄',
    subs: [
      { code: 'INSURANCE', name_ko: '보험금 수령',           name_en: 'Insurance Payout',      icon: '🛡️' },
      { code: 'LOAN',      name_ko: '빌린 돈 / 대출금',      name_en: 'Borrowed Money / Loan', icon: '🏦' },
      { code: 'REFUND',    name_ko: '카드 대금 환급 / 취소', name_en: 'Card Refund',           icon: '↩️' },
    ],
  },
]

/** code → subcategory 배열 */
export function getSubcategories(mainCode) {
  const cat = INCOME_CATEGORIES.find(c => c.code === mainCode)
  return cat ? cat.subs : []
}

/** code → 표시 이름 (lang: 'ko'|'en') */
export function getCategoryName(code, lang = 'ko') {
  for (const cat of INCOME_CATEGORIES) {
    if (cat.code === code) return lang === 'en' ? cat.name_en : cat.name_ko
    for (const sub of cat.subs) {
      if (sub.code === code) return lang === 'en' ? sub.name_en : sub.name_ko
    }
  }
  return code
}

/** 전체 flat 목록 (대분류 + 소분류) — 검색/표시용 */
export const INCOME_CATEGORIES_FLAT = INCOME_CATEGORIES.flatMap(cat => [
  { ...cat, level: 'main' },
  ...cat.subs.map(sub => ({ ...sub, level: 'sub', parent_code: cat.code })),
])
