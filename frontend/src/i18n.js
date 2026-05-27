import en from './locales/en.json'
import ko from './locales/ko.json'

const LANGS = { en, ko }

function deepGet(obj, path) {
  return path.split('.').reduce((cur, key) => (cur != null ? cur[key] : undefined), obj)
}

/**
 * t(lang, key) — translate a key for the given language.
 * Supports dot-notation nested keys: t(lang, 'auth.loginBtn')
 * Falls back to Korean, then returns the key itself.
 */
export function t(lang, key) {
  const dict = LANGS[lang] ?? LANGS.ko
  const koDict = LANGS.ko

  if (key.includes('.')) {
    const v = deepGet(dict, key)
    if (typeof v === 'string') return v
    const kv = deepGet(koDict, key)
    if (typeof kv === 'string') return kv
    return key
  }

  const v = dict[key]
  if (typeof v === 'string') return v
  const kv = koDict[key]
  if (typeof kv === 'string') return kv
  return key
}

/** T[lang] gives the full translation object for direct property access (e.g. T[lang]?.expenseCats) */
export const T = LANGS
