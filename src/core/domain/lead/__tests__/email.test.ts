import { describe, it, expect } from 'vitest'
import { normalizeEmail, emailForHash } from '../email'
import { hashableUserData } from '../../funnel/enhanced-conversions'

describe('normalizeEmail / emailForHash (разделы 8, 15)', () => {
  it('normalizeEmail: trim + lowercase, точки остаются (так в БД)', () => {
    expect(normalizeEmail('  Ivan.Petrenko@Gmail.COM ')).toBe('ivan.petrenko@gmail.com')
  })

  it('emailForHash: для gmail.com / googlemail.com точки до @ убираются', () => {
    expect(emailForHash('Ivan.Petrenko@Gmail.com')).toBe('ivanpetrenko@gmail.com')
    expect(emailForHash('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
  })

  it('emailForHash: другие домены — без изменений (точки значимы)', () => {
    expect(emailForHash('John.Doe@Example.org')).toBe('john.doe@example.org')
    expect(emailForHash('not-an-email')).toBe('not-an-email')
  })

  it('hashableUserData: телефон через единую normalizePhone, пустые пропускаются', () => {
    expect(hashableUserData({ email: 'A.B@gmail.com', phone: '+380 (67) 123-45-67' })).toEqual({
      email: 'ab@gmail.com',
      phone: '+380671234567',
    })
    expect(hashableUserData({ email: '', phone: '0671234567' })).toEqual({ phone: '+380671234567' })
    expect(hashableUserData({})).toEqual({})
  })
})
