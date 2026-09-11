import { describe, it, expect } from 'vitest'
import { normalizeEmail, emailForHash } from '../email'
import { hashableUserData } from '../../funnel/enhanced-conversions'

describe('normalizeEmail / emailForHash (розділи 8, 15)', () => {
  it('normalizeEmail: trim + lowercase, крапки лишаються (так у БД)', () => {
    expect(normalizeEmail('  Ivan.Petrenko@Gmail.COM ')).toBe('ivan.petrenko@gmail.com')
  })

  it('emailForHash: для gmail.com / googlemail.com крапки до @ прибираються', () => {
    expect(emailForHash('Ivan.Petrenko@Gmail.com')).toBe('ivanpetrenko@gmail.com')
    expect(emailForHash('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
  })

  it('emailForHash: інші домени — без змін (крапки значущі)', () => {
    expect(emailForHash('John.Doe@Example.org')).toBe('john.doe@example.org')
    expect(emailForHash('not-an-email')).toBe('not-an-email')
  })

  it('hashableUserData: телефон через єдину normalizePhone, порожні пропускаються', () => {
    expect(hashableUserData({ email: 'A.B@gmail.com', phone: '+380 (67) 123-45-67' })).toEqual({
      email: 'ab@gmail.com',
      phone: '+380671234567',
    })
    expect(hashableUserData({ email: '', phone: '0671234567' })).toEqual({ phone: '+380671234567' })
    expect(hashableUserData({})).toEqual({})
  })
})
