export const CURRENCY_LIST = [
  { code: 'USD', symbol: '$',   label: '$ USD'   },
  { code: 'KRW', symbol: '₩',   label: '₩ KRW'   },
  { code: 'EUR', symbol: '€',   label: '€ EUR'   },
  { code: 'JPY', symbol: '¥',   label: '¥ JPY'   },
  { code: 'GBP', symbol: '£',   label: '£ GBP'   },
  { code: 'CNY', symbol: '¥',   label: '¥ CNY'   },
  { code: 'CAD', symbol: 'C$',  label: 'C$ CAD'  },
  { code: 'AUD', symbol: 'A$',  label: 'A$ AUD'  },
  { code: 'CHF', symbol: 'Fr',  label: 'Fr CHF'  },
  { code: 'HKD', symbol: 'HK$', label: 'HK$ HKD' },
  { code: 'SGD', symbol: 'S$',  label: 'S$ SGD'  },
]

export const CURRENCY_CODES = CURRENCY_LIST.map(c => c.code)

export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCY_LIST.map(c => [c.code, c.symbol]))
