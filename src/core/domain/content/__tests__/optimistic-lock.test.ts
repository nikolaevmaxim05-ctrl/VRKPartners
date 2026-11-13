import { describe, it, expect } from 'vitest'
import { isStaleUpdate } from '../optimistic-lock'

describe('isStaleUpdate — optimistic-lock по моменту времени', () => {
  it('тот же момент в разных форматах (Z vs +00:00) — НЕ stale (регрессия на баг «конфликт с собой»)', () => {
    // Сервер пишет JS-ISO, supabase-js читает PostgREST-формат — тот же момент.
    expect(isStaleUpdate('2026-07-24T12:34:56.789+00:00', '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('идентичные строки — НЕ stale', () => {
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('разные моменты — stale (настоящий конфликт двух админов → 409)', () => {
    expect(isStaleUpdate('2026-07-24T12:35:00.000Z', '2026-07-24T12:34:56.789Z')).toBe(true)
  })

  it('нет строки в БД (первая запись) — НЕ stale', () => {
    expect(isStaleUpdate(null, '2026-07-24T12:34:56.789Z')).toBe(false)
    expect(isStaleUpdate(undefined, '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('клиент не прислал токен — НЕ stale (проверять нечего)', () => {
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', null)).toBe(false)
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', undefined)).toBe(false)
  })

  it('невалидные даты — НЕ stale (fail-open)', () => {
    expect(isStaleUpdate('not-a-date', '2026-07-24T12:34:56.789Z')).toBe(false)
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', 'not-a-date')).toBe(false)
  })
})
