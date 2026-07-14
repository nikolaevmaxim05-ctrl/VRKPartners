import { describe, it, expect } from 'vitest'
import { normalizeContactValue } from '@/lib/contact'

describe('normalizeContactValue — телефон (маска → E.164)', () => {
  it('прибирає маску/пробіли/дужки з відображеного номера', () => {
    expect(normalizeContactValue('+380 (67) 123-45-67', 'phone')).toBe('+380671234567')
  })

  it('нормалізує локальний формат 0XXXXXXXXX', () => {
    expect(normalizeContactValue('067 123 45 67', 'phone')).toBe('+380671234567')
  })

  it('нормалізує 9-значний національний номер', () => {
    expect(normalizeContactValue('671234567', 'phone')).toBe('+380671234567')
  })

  it('лишає вже чистий E.164 без змін', () => {
    expect(normalizeContactValue('+380671234567', 'phone')).toBe('+380671234567')
  })
})

describe('normalizeContactValue — email', () => {
  it('trim + lowercase', () => {
    expect(normalizeContactValue('  Info@VRK.Partners  ', 'email')).toBe('info@vrk.partners')
  })

  it('не чіпає вже нормалізований email', () => {
    expect(normalizeContactValue('hello@example.com', 'email')).toBe('hello@example.com')
  })
})
