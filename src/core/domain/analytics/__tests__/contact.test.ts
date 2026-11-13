import { describe, it, expect } from 'vitest'
import { normalizeContactValue, resolveContactClick } from '../contact'

describe('normalizeContactValue — телефон (маска → E.164)', () => {
  it('убирает маску/пробелы/скобки из отображаемого номера', () => {
    expect(normalizeContactValue('+380 (67) 123-45-67', 'phone')).toBe('+380671234567')
  })

  it('нормализует локальный формат 0XXXXXXXXX', () => {
    expect(normalizeContactValue('067 123 45 67', 'phone')).toBe('+380671234567')
  })

  it('нормализует 9-значный национальный номер', () => {
    expect(normalizeContactValue('671234567', 'phone')).toBe('+380671234567')
  })

  it('оставляет уже чистый E.164 без изменений', () => {
    expect(normalizeContactValue('+380671234567', 'phone')).toBe('+380671234567')
  })
})

describe('normalizeContactValue — email', () => {
  it('trim + lowercase', () => {
    expect(normalizeContactValue('  Info@VRK.Partners  ', 'email')).toBe('info@vrk.partners')
  })

  it('не трогает уже нормализованный email', () => {
    expect(normalizeContactValue('hello@example.com', 'email')).toBe('hello@example.com')
  })
})

describe('resolveContactClick — блокировка перехода vs копирование', () => {
  it('email на ПК: блокируем mailto:, копируем', () => {
    expect(resolveContactClick('email', false)).toEqual({ preventDefault: true, copy: true })
  })

  it('email на тач-устройстве: тоже только копирование (без почтового приложения)', () => {
    expect(resolveContactClick('email', true)).toEqual({ preventDefault: true, copy: true })
  })

  it('телефон на ПК: блокируем tel:, копируем', () => {
    expect(resolveContactClick('phone', false)).toEqual({ preventDefault: true, copy: true })
  })

  it('телефон на тач-устройстве: нативный tel:, без копирования', () => {
    expect(resolveContactClick('phone', true)).toEqual({ preventDefault: false, copy: false })
  })
})
