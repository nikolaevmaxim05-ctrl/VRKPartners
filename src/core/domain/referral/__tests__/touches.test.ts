// Касання партнерських посилань і first-touch-атрибуція: кодек cookie (v2, легасі, мусор),
// addTouch (перший ts зберігається, стеля 8 — замінюється останнє, старші 400 днів відкидаються),
// mergeTouches (мінімальний ts за кодом), pickReferralTouch (найраніше у вікні), налаштування вікна.
import { describe, it, expect } from 'vitest'
import {
  REF_MAX_TOUCHES, REF_COOKIE_MAX_DAYS, REF_ATTRIBUTION_DEFAULT_DAYS, REF_ATTRIBUTION_PRESETS,
  REF_ATTRIBUTION_MIN_DAYS, REF_ATTRIBUTION_MAX_DAYS, REF_ATTRIBUTION_RANGE_MESSAGE,
  decodeRefCookie, encodeRefCookie, addTouch, mergeTouches, pickReferralTouch,
  normalizeTouches, parseAttributionDays, planAttributionDays,
} from '../touches'
import { collectReferralTouches } from '../attribution'

const NOW = 1_790_000_000 // unix-секунди
const DAY = 86_400
const A = 'aaaa2345'
const B = 'bbbb2345'

describe('кодек cookie', () => {
  it('константи: 8 касань, 400 днів, дефолт 90, пресети, межі 1–400', () => {
    expect(REF_MAX_TOUCHES).toBe(8)
    expect(REF_COOKIE_MAX_DAYS).toBe(400)
    expect(REF_ATTRIBUTION_DEFAULT_DAYS).toBe(90)
    expect([...REF_ATTRIBUTION_PRESETS]).toEqual([14, 30, 60, 90, 180, 365])
    expect(REF_ATTRIBUTION_MIN_DAYS).toBe(1)
    expect(REF_ATTRIBUTION_MAX_DAYS).toBe(400)
  })

  it('encode → decode round-trip, порядок за ts, лише cookie-безпечні символи', () => {
    const touches = [{ code: A, at: NOW - 5 * DAY }, { code: B, at: NOW - DAY }]
    const value = encodeRefCookie(touches)
    expect(value).toBe(`v2_${A}.${NOW - 5 * DAY}_${B}.${NOW - DAY}`)
    expect(encodeURIComponent(value)).toBe(value)
    expect(decodeRefCookie(value, NOW)).toEqual(touches)
    expect(encodeRefCookie([])).toBe('')
  })

  it('легасі голий код → одне касання «зараз»; мусор → []', () => {
    expect(decodeRefCookie('AbCd2345', NOW)).toEqual([{ code: 'abcd2345', at: NOW }])
    expect(decodeRefCookie('', NOW)).toEqual([])
    expect(decodeRefCookie(null, NOW)).toEqual([])
    expect(decodeRefCookie('x'.repeat(200), NOW)).toEqual([])
    expect(decodeRefCookie('v2_', NOW)).toEqual([])
    expect(decodeRefCookie('v2_bad..code.12', NOW)).toEqual([])
    expect(decodeRefCookie(`v2_${A}.abc`, NOW)).toEqual([])
    expect(decodeRefCookie(`v2_${A}.-5`, NOW)).toEqual([])
  })

  it('decode: невалідні пари пропускаються, дублікати коду — мінімальний ts, не більше 8', () => {
    const parts = [`${A}.${NOW - 3}`, 'junk', `${B}.${NOW - 1}`, `${A}.${NOW - 10}`]
    expect(decodeRefCookie('v2_' + parts.join('_'), NOW)).toEqual([{ code: A, at: NOW - 10 }, { code: B, at: NOW - 1 }])
    const many = Array.from({ length: 12 }, (_, i) => `code${i}x.${NOW - i}`)
    expect(decodeRefCookie('v2_' + many.join('_'), NOW)).toHaveLength(REF_MAX_TOUCHES)
  })
})

describe('addTouch', () => {
  it('новий код додається з ts=now; повторний перехід за тим самим кодом ts не змінює', () => {
    const first = addTouch([], A, NOW - 10 * DAY)
    expect(first).toEqual([{ code: A, at: NOW - 10 * DAY }])
    const again = addTouch(first, A, NOW)
    expect(again).toEqual([{ code: A, at: NOW - 10 * DAY }])
    expect(addTouch(first, B, NOW)).toEqual([{ code: A, at: NOW - 10 * DAY }, { code: B, at: NOW }])
  })

  it('список повний → замінюється ОСТАННЄ касання, ранні не чіпаються', () => {
    const full = Array.from({ length: REF_MAX_TOUCHES }, (_, i) => ({ code: `code${i}xx`, at: NOW - (100 - i) * DAY }))
    const out = addTouch(full, 'newcode1', NOW)
    expect(out).toHaveLength(REF_MAX_TOUCHES)
    expect(out.slice(0, 7)).toEqual(full.slice(0, 7))
    expect(out[7]).toEqual({ code: 'newcode1', at: NOW })
  })

  it('касання старші за 400 днів і «з майбутнього» відкидаються', () => {
    const touches = [{ code: A, at: NOW - 401 * DAY }, { code: B, at: NOW + 60 }, { code: 'cccc2345', at: NOW - 399 * DAY }]
    expect(addTouch(touches, 'dddd2345', NOW)).toEqual([{ code: 'cccc2345', at: NOW - 399 * DAY }, { code: 'dddd2345', at: NOW }])
  })
})

describe('mergeTouches / normalizeTouches', () => {
  it('за кодом — мінімальний ts; результат відсортований за часом', () => {
    expect(mergeTouches([{ code: B, at: NOW - 1 }], [{ code: A, at: NOW - 5 }, { code: B, at: NOW - 9 }])).toEqual([
      { code: B, at: NOW - 9 }, { code: A, at: NOW - 5 },
    ])
  })

  it('normalizeTouches: не масив → [], елементи без коду/ts → пропуск, at як рядок → число, ≤ 8', () => {
    expect(normalizeTouches('x')).toEqual([])
    expect(normalizeTouches([{ code: ' AAAA2345 ', at: String(NOW) }, { code: 'bad!', at: NOW }, { code: B }, null, { code: B, at: 1.5 }])).toEqual([{ code: A, at: NOW }])
    expect(normalizeTouches(Array.from({ length: 20 }, (_, i) => ({ code: `c${i}xxxxx`, at: NOW - i })))).toHaveLength(8)
  })
})

describe('pickReferralTouch — first-touch у вікні', () => {
  const touches = [{ code: A, at: NOW - 5 * DAY }, { code: B, at: NOW - DAY }]

  it('найраніше касання у вікні виграє, навіть якщо пізніше є інший партнер', () => {
    expect(pickReferralTouch(touches, { windowDays: 90, now: NOW })).toEqual({ code: A, at: NOW - 5 * DAY })
  })

  it('перше поза вікном → наступне; усі поза вікном → null; межа вікна включно', () => {
    const old = [{ code: A, at: NOW - 200 * DAY }, { code: B, at: NOW - DAY }]
    expect(pickReferralTouch(old, { windowDays: 90, now: NOW })).toEqual({ code: B, at: NOW - DAY })
    expect(pickReferralTouch(old, { windowDays: 1, now: NOW })).toEqual({ code: B, at: NOW - DAY })
    expect(pickReferralTouch([{ code: A, at: NOW - 2 * DAY }], { windowDays: 1, now: NOW })).toBeNull()
    expect(pickReferralTouch([], { windowDays: 90, now: NOW })).toBeNull()
  })

  it('касання «з майбутнього» і з невалідним ts ігноруються', () => {
    expect(pickReferralTouch([{ code: A, at: NOW + 10 }, { code: B, at: NOW - 1 }], { windowDays: 90, now: NOW })).toEqual({ code: B, at: NOW - 1 })
    expect(pickReferralTouch([{ code: A, at: Number.NaN }], { windowDays: 90, now: NOW })).toBeNull()
  })
})

describe('collectReferralTouches — cookie ⊕ тіло ⊕ ?ref сторінки', () => {
  it('обʼєднання за кодом з мінімальним ts; легасі ref і ?ref сторінки — касання «зараз»', () => {
    const out = collectReferralTouches({
      cookie: `v2_${A}.${NOW - 5 * DAY}`,
      body: [{ code: A, at: NOW - 9 * DAY }, { code: B, at: NOW - DAY }],
      legacyBody: 'cccc2345',
      pageUrl: `https://vrk.com.ua/?utm_source=x&ref=${B}`,
    }, NOW)
    expect(out).toEqual([{ code: A, at: NOW - 9 * DAY }, { code: B, at: NOW - DAY }, { code: 'cccc2345', at: NOW }])
    expect(collectReferralTouches({}, NOW)).toEqual([])
    expect(collectReferralTouches({ pageUrl: 'not a url', body: 'junk' }, NOW)).toEqual([])
    expect(collectReferralTouches({ cookie: 'LEGACY12' }, NOW)).toEqual([{ code: 'legacy12', at: NOW }])
  })
})

describe('вікно атрибуції (налаштування)', () => {
  it('parseAttributionDays: рядок/число у [1, 400] → значення; інакше дефолт 90', () => {
    expect(parseAttributionDays('30')).toBe(30)
    expect(parseAttributionDays(400)).toBe(400)
    expect(parseAttributionDays(null)).toBe(90)
    expect(parseAttributionDays('0')).toBe(90)
    expect(parseAttributionDays('401')).toBe(90)
    expect(parseAttributionDays('12.5')).toBe(90)
    expect(parseAttributionDays('abc')).toBe(90)
  })

  it('planAttributionDays: строго — поза межами повідомлення uk-UA', () => {
    expect(planAttributionDays(14)).toEqual({ ok: true, days: 14 })
    expect(planAttributionDays(' 365 ')).toEqual({ ok: true, days: 365 })
    for (const bad of [0, 401, 1.5, 'x', null, undefined]) expect(planAttributionDays(bad)).toEqual({ ok: false, message: REF_ATTRIBUTION_RANGE_MESSAGE })
  })
})
