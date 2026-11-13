// Валидация PATCH конфига событий аналитики (validateEventsPatch).
import { describe, it, expect } from 'vitest'
import { validateEventsPatch } from '../events-config'
import { ANALYTICS_REGISTRY, MAX_EVENT_NAMES_PER_KEY } from '../registry'

const KEY = 'header_cta_click'
const LABEL = 'Шапка — Клік по CTA-кнопці у шапці'

describe('validateEventsPatch', () => {
  it('undefined → ok, patch=null (нічого не міняємо)', () => {
    expect(validateEventsPatch(undefined)).toEqual({ ok: true, patch: null })
  })

  it('не обʼєкт / масив / null → помилка', () => {
    for (const bad of [null, 'x', 5, true, [], [{ enabled: true }]]) {
      const r = validateEventsPatch(bad)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toBe('Поле events має бути обʼєктом')
    }
  })

  it('порожній обʼєкт → ok, порожній patch', () => {
    expect(validateEventsPatch({})).toEqual({ ok: true, patch: {} })
  })

  it('невідомий ключ → помилка з іменем ключа', () => {
    const r = validateEventsPatch({ nope_key: { enabled: true } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('nope_key')
  })

  it('запис не обʼєкт → помилка з лейблом точки', () => {
    for (const bad of [null, 'x', 1, ['a']]) {
      const r = validateEventsPatch({ [KEY]: bad })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toBe(`Невірний формат налаштування для: ${LABEL}`)
    }
  })

  it('enabled не boolean → помилка', () => {
    for (const bad of [undefined, 'true', 1, null]) {
      const r = validateEventsPatch({ [KEY]: { enabled: bad, eventNames: ['cta_click'] } })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toBe(`Поле enabled має бути true/false (${LABEL})`)
    }
  })

  it('валідний запис → patch з eventNames і легасі eventName = перше імʼя', () => {
    const r = validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['cta_click', 'hdr_cta'] } })
    expect(r).toEqual({
      ok: true,
      patch: { [KEY]: { enabled: true, eventNames: ['cta_click', 'hdr_cta'], eventName: 'cta_click' } },
    })
  })

  it('більше 5 імен → помилка', () => {
    const names = Array.from({ length: MAX_EVENT_NAMES_PER_KEY + 1 }, (_, i) => `ev_${i}`)
    const r = validateEventsPatch({ [KEY]: { enabled: true, eventNames: names } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe(`Максимум 5 подій на одну взаємодію (${LABEL})`)
    // ровно 5 — ок
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventNames: names.slice(0, 5) } }).ok).toBe(true)
  })

  it('невірне імʼя (великі літери, пробіли, >40, не рядок) → помилка', () => {
    for (const bad of ['Cta_Click', 'cta click', 'a'.repeat(41), '', 5, null, 'cta-click']) {
      const r = validateEventsPatch({ [KEY]: { enabled: true, eventNames: [bad] } })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toContain('Невірне імʼя події')
    }
    // ровно 40 символов — ок
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['a'.repeat(40)] } }).ok).toBe(true)
  })

  it('дублікати імен → помилка', () => {
    const r = validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['cta_click', 'cta_click'] } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toBe(`Імена подій не повинні повторюватись (${LABEL})`)
  })

  it('легасі eventName (рядок) приймається з trim', () => {
    const r = validateEventsPatch({ [KEY]: { enabled: false, eventName: '  legacy_name ' } })
    expect(r).toEqual({
      ok: true,
      patch: { [KEY]: { enabled: false, eventNames: ['legacy_name'], eventName: 'legacy_name' } },
    })
    // невалидный легаси → ошибка
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventName: 'Bad Name' } }).ok).toBe(false)
  })

  it('eventNames має пріоритет над легасі eventName', () => {
    const r = validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['a_1'], eventName: 'b_2' } })
    expect(r.ok && r.patch?.[KEY].eventNames).toEqual(['a_1'])
  })

  it('без імен → порожній масив, eventName = ключ (точка мовчить)', () => {
    const r = validateEventsPatch({ [KEY]: { enabled: true } })
    expect(r).toEqual({ ok: true, patch: { [KEY]: { enabled: true, eventNames: [], eventName: KEY } } })
    const r2 = validateEventsPatch({ [KEY]: { enabled: true, eventNames: [] } })
    expect(r2).toEqual({ ok: true, patch: { [KEY]: { enabled: true, eventNames: [], eventName: KEY } } })
  })

  it('усі ключі реєстру приймаються', () => {
    const events = Object.fromEntries(ANALYTICS_REGISTRY.map((e) => [e.key, { enabled: true, eventNames: [...e.defaultEventNames] }]))
    const r = validateEventsPatch(events)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.patch ?? {})).toHaveLength(ANALYTICS_REGISTRY.length)
  })

  // AGENTS.md: «Имена form_start / form_submit запрещены» — комментарий в registry.ts:39-41 гласит
  // «form_start/form_submit НЕ используем — конфликт с GA4 Enhanced Measurement»,
  // с 2026-09-18 validateEventsPatch отклоняет их (RESERVED_EVENT_NAMES в registry.ts).
  it('заборонені імена form_start / form_submit відхиляються (розділ 15, виправлено 2026-09-18)', () => {
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['form_start'] } }).ok).toBe(false)
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['cta_click', 'form_submit'] } }).ok).toBe(false)
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventName: 'form_submit' } }).ok).toBe(false)
    expect(validateEventsPatch({ [KEY]: { enabled: true, eventNames: ['form_started'] } }).ok).toBe(true)
  })

})
