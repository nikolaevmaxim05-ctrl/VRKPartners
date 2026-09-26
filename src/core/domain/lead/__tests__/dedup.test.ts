import { describe, it, expect } from 'vitest'
import { parseDedupSettings, buildRepeatComment, DEFAULT_DEDUP_SETTINGS } from '../dedup'
import { normalizeUtm, hasUtm, utmEntries, formatUtmSummary } from '../utm'

describe('parseDedupSettings', () => {
  it('дефолти при порожній мапі', () => {
    expect(parseDedupSettings(new Map())).toEqual(DEFAULT_DEDUP_SETTINGS)
  })
  it('читає прапори та вікно; невалідне вікно → 24', () => {
    expect(parseDedupSettings(new Map([['dedup_by_phone', 'false'], ['dedup_by_ip', 'true'], ['dedup_ip_window_hours', '48']])))
      .toEqual({ dedupByPhone: false, dedupByIp: true, ipWindowHours: 48 })
    expect(parseDedupSettings(new Map([['dedup_ip_window_hours', '-5']])).ipWindowHours).toBe(24)
    expect(parseDedupSettings(new Map([['dedup_ip_window_hours', 'abc']])).ipWindowHours).toBe(24)
  })
})

describe('buildRepeatComment', () => {
  it('реферал: «Партнер» / код зі станом', () => {
    expect(buildRepeatComment({ reason: 'phone', referral: { code: 'abcd1234', name: 'Агенція', state: 'active' } })).toContain('Партнер: Агенція')
    expect(buildRepeatComment({ reason: 'phone', referral: { code: 'abcd1234', name: null, state: 'unknown' } })).toContain('Реф. код: abcd1234 — посилання не знайдено')
    expect(buildRepeatComment({ reason: 'ip', referral: { code: 'abcd1234', name: 'Старий', state: 'inactive' } })).toContain('вимкнене (Старий)')
    expect(buildRepeatComment({ reason: 'ip' })).not.toContain('Реф. код')
  })

  it('формує system-коментар із причиною, полями та UTM', () => {
    const text = buildRepeatComment({ reason: 'phone', service: 'Аудит', message: 'Привіт', utm: { utm_source: 'google', utm_medium: '' }, source: 'https://vrk.com.ua/' })
    expect(text.split('\n')).toEqual([
      '[ПОВТОР] Нове повторне звернення',
      'Причина дедупу: телефон',
      'Послуга: Аудит',
      'Повідомлення: Привіт',
      'UTM:',
      '• utm_source: google',
      'Сторінка: https://vrk.com.ua/',
    ])
    expect(buildRepeatComment({ reason: 'ip' })).toBe('[ПОВТОР] Нове повторне звернення\nПричина дедупу: IP-адреса')
  })
})

describe('utm', () => {
  it('normalizeUtm лишає лише відомі непорожні ключі', () => {
    expect(normalizeUtm({ utm_source: 'g', utm_medium: ' ', foo: 'x', gclid: 'abc' })).toEqual({ utm_source: 'g', gclid: 'abc' })
    expect(normalizeUtm(null)).toEqual({})
  })
  it('hasUtm / utmEntries / formatUtmSummary', () => {
    expect(hasUtm({})).toBe(false)
    expect(hasUtm({ referrer: 'r' })).toBe(true)
    expect(utmEntries({ utm_campaign: 'c', utm_source: 's' })).toEqual([['Source', 's'], ['Campaign', 'c']])
    expect(formatUtmSummary({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', utm_term: 't' })).toBe('google → cpc → brand (term: t)')
    expect(formatUtmSummary({ utm_term: 't' })).toBe('(term: t)')
  })
})
