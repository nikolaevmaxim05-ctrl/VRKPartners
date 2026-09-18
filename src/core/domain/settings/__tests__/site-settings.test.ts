// Білий список ключів site_settings і нормалізація значень (normalizeSettingItems).
import { describe, it, expect } from 'vitest'
import {
  normalizeSettingItems,
  inferSettingType,
  ALLOWED_SETTING_KEYS,
  SECRET_SETTING_KEYS,
  ALLOWED_CURRENCIES,
} from '../site-settings'

describe('константи', () => {
  it('білий список — 7 ключів, без секретів', () => {
    expect([...ALLOWED_SETTING_KEYS].sort()).toEqual([
      'deal_amount_type',
      'dedup_by_ip',
      'dedup_by_phone',
      'dedup_ip_window_hours',
      'google_ads_conversion_action',
      'internal_currency',
      'pipelines_enabled',
    ])
    for (const k of SECRET_SETTING_KEYS) expect(ALLOWED_SETTING_KEYS.has(k)).toBe(false)
  })

  it('telephony_secret — секрет, не в білому списку', () => {
    expect(SECRET_SETTING_KEYS.has('telephony_secret')).toBe(true)
    expect(ALLOWED_SETTING_KEYS.has('telephony_secret')).toBe(false)
  })

  it('валюти', () => {
    expect(ALLOWED_CURRENCIES).toEqual(['UAH', 'USD', 'EUR'])
  })
})

describe('inferSettingType', () => {
  it('тип за ключем', () => {
    expect(inferSettingType('dedup_by_phone')).toBe('boolean')
    expect(inferSettingType('dedup_by_ip')).toBe('boolean')
    expect(inferSettingType('pipelines_enabled')).toBe('boolean')
    expect(inferSettingType('dedup_ip_window_hours')).toBe('number')
    expect(inferSettingType('internal_currency')).toBe('string')
    expect(inferSettingType('unknown')).toBe('string')
  })
})

describe('normalizeSettingItems', () => {
  it('порожні items / не масив → помилка', () => {
    for (const bad of [[], null, undefined, {}, 'x']) {
      expect(normalizeSettingItems(bad)).toEqual({ ok: false, message: 'Порожній items' })
    }
  })

  it('невідомий ключ → помилка з іменем ключа', () => {
    const r = normalizeSettingItems([{ key: 'evil_key', value: '1' }])
    expect(r).toEqual({ ok: false, message: 'Невідомий ключ: evil_key' })
  })

  it('telephony_secret відхиляється (зберігається в integrations)', () => {
    expect(normalizeSettingItems([{ key: 'telephony_secret', value: 's3cret' }])).toEqual({
      ok: false,
      message: 'Невідомий ключ: telephony_secret',
    })
  })

  it('один невідомий ключ у списку валить весь запит', () => {
    const r = normalizeSettingItems([
      { key: 'dedup_by_phone', value: true },
      { key: 'nope', value: 1 },
    ])
    expect(r.ok).toBe(false)
  })

  it('boolean: true / "true" → "true", решта → "false"', () => {
    const r = normalizeSettingItems([
      { key: 'dedup_by_phone', value: true },
      { key: 'dedup_by_ip', value: 'true' },
      { key: 'pipelines_enabled', value: 'yes' },
      { key: 'dedup_by_phone', value: 1 },
      { key: 'dedup_by_ip', value: null },
      { key: 'pipelines_enabled', value: 'TRUE' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.rows.map((x) => x.value)).toEqual(['true', 'true', 'false', 'false', 'false', 'false'])
      expect(r.rows.every((x) => x.type === 'boolean')).toBe(true)
    }
  })

  it('number: ≥ 0, floor; NaN / відʼємне / нескінченність → помилка', () => {
    const ok = normalizeSettingItems([
      { key: 'dedup_ip_window_hours', value: 24.9 },
      { key: 'dedup_ip_window_hours', value: '12' },
      { key: 'dedup_ip_window_hours', value: 0 },
    ])
    expect(ok).toEqual({
      ok: true,
      rows: [
        { key: 'dedup_ip_window_hours', value: '24', type: 'number' },
        { key: 'dedup_ip_window_hours', value: '12', type: 'number' },
        { key: 'dedup_ip_window_hours', value: '0', type: 'number' },
      ],
    })
    for (const bad of ['abc', -1, Infinity, NaN]) {
      expect(normalizeSettingItems([{ key: 'dedup_ip_window_hours', value: bad }])).toEqual({
        ok: false,
        message: 'Невірне число для dedup_ip_window_hours',
      })
    }
  })

  it('явний type у item має пріоритет над inferSettingType', () => {
    const r = normalizeSettingItems([{ key: 'google_ads_conversion_action', value: 7.5, type: 'number' }])
    expect(r).toEqual({ ok: true, rows: [{ key: 'google_ads_conversion_action', value: '7', type: 'number' }] })
  })

  it('internal_currency: лише UAH/USD/EUR (з trim)', () => {
    expect(normalizeSettingItems([{ key: 'internal_currency', value: ' USD ' }])).toEqual({
      ok: true,
      rows: [{ key: 'internal_currency', value: 'USD', type: 'string' }],
    })
    for (const bad of ['usd', 'PLN', '', null]) {
      expect(normalizeSettingItems([{ key: 'internal_currency', value: bad }])).toEqual({
        ok: false,
        message: 'Валюта: UAH, USD або EUR',
      })
    }
  })

  it('deal_amount_type: amount або profit', () => {
    expect(normalizeSettingItems([{ key: 'deal_amount_type', value: 'profit' }])).toEqual({
      ok: true,
      rows: [{ key: 'deal_amount_type', value: 'profit', type: 'string' }],
    })
    expect(normalizeSettingItems([{ key: 'deal_amount_type', value: 'amount' }]).ok).toBe(true)
    for (const bad of ['revenue', '', 'Amount']) {
      expect(normalizeSettingItems([{ key: 'deal_amount_type', value: bad }])).toEqual({
        ok: false,
        message: 'deal_amount_type: amount або profit',
      })
    }
  })

  it('string: null → "", інші → String().trim()', () => {
    const r = normalizeSettingItems([
      { key: 'google_ads_conversion_action', value: null },
      { key: 'google_ads_conversion_action', value: '  Purchase  ' },
      { key: 'google_ads_conversion_action', value: 42 },
    ])
    expect(r).toEqual({
      ok: true,
      rows: [
        { key: 'google_ads_conversion_action', value: '', type: 'string' },
        { key: 'google_ads_conversion_action', value: 'Purchase', type: 'string' },
        { key: 'google_ads_conversion_action', value: '42', type: 'string' },
      ],
    })
  })
})
