import { describe, it, expect } from 'vitest'
import { isStaleUpdate } from '@/lib/optimistic-lock'

describe('isStaleUpdate — optimistic-lock за моментом часу', () => {
  it('той самий момент у різних форматах (Z vs +00:00) — НЕ stale (регресія на баг «конфлікт із собою»)', () => {
    // Сервер пише JS-ISO, supabase-js читає PostgREST-формат — той самий момент.
    expect(isStaleUpdate('2026-07-24T12:34:56.789+00:00', '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('ідентичні рядки — НЕ stale', () => {
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('різні моменти — stale (справжній конфлікт двох адмінів → 409)', () => {
    expect(isStaleUpdate('2026-07-24T12:35:00.000Z', '2026-07-24T12:34:56.789Z')).toBe(true)
  })

  it('немає рядка в БД (перший запис) — НЕ stale', () => {
    expect(isStaleUpdate(null, '2026-07-24T12:34:56.789Z')).toBe(false)
    expect(isStaleUpdate(undefined, '2026-07-24T12:34:56.789Z')).toBe(false)
  })

  it('клієнт не надіслав токен — НЕ stale (перевіряти нічого)', () => {
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', null)).toBe(false)
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', undefined)).toBe(false)
  })

  it('невалідні дати — НЕ stale (fail-open)', () => {
    expect(isStaleUpdate('not-a-date', '2026-07-24T12:34:56.789Z')).toBe(false)
    expect(isStaleUpdate('2026-07-24T12:34:56.789Z', 'not-a-date')).toBe(false)
  })
})
