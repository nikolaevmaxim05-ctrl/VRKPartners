import { describe, it, expect } from 'vitest'
import { getClientIp } from '@/lib/ip'

const h = (init: Record<string, string>) => new Headers(init)

describe('getClientIp — ключ rate-limit / dedup', () => {
  it('різні IP → різні ключі (лічильники незалежні)', () => {
    const a = getClientIp(h({ 'x-real-ip': '1.1.1.1' }))
    const b = getClientIp(h({ 'x-real-ip': '2.2.2.2' }))
    expect(a).toBe('1.1.1.1')
    expect(b).toBe('2.2.2.2')
    expect(a).not.toBe(b)
  })

  it('немає жодного заголовка → null (НЕ спільний ключ-константа)', () => {
    // Ключова регресія: раніше повертали "unknown" → усі відвідувачі в одному
    // лічильнику rate-limit. Тепер null → викликаючий код пропускає ліміт.
    expect(getClientIp(h({}))).toBeNull()
  })

  it('два запити без заголовків не дають однаковий НЕ-null ключ', () => {
    const a = getClientIp(h({}))
    const b = getClientIp(h({}))
    expect(a).toBeNull()
    expect(b).toBeNull()
    // null !== рядок-константа: обидва «невідомі», але це не спільний лічильник —
    // код за null ліміт пропускає, а не рахує всіх разом.
  })

  it('x-real-ip має пріоритет над іншими заголовками', () => {
    const ip = getClientIp(
      h({
        'x-real-ip': '9.9.9.9',
        'x-vercel-forwarded-for': '8.8.8.8',
        'x-forwarded-for': '7.7.7.7',
      }),
    )
    expect(ip).toBe('9.9.9.9')
  })

  it('x-real-ip тримиться (пробіли прибираються)', () => {
    expect(getClientIp(h({ 'x-real-ip': '  3.3.3.3  ' }))).toBe('3.3.3.3')
  })

  it('без x-real-ip → перший сегмент x-vercel-forwarded-for (клієнт)', () => {
    const ip = getClientIp(
      h({ 'x-vercel-forwarded-for': '5.5.5.5, 10.0.0.1, 10.0.0.2' }),
    )
    expect(ip).toBe('5.5.5.5')
  })

  it('фолбек x-forwarded-for → ПРАВИЙ сегмент (S5: лівий підробний)', () => {
    // Клієнт може підставити лівий сегмент; довіряємо найближчому до сервера (правому).
    const ip = getClientIp(h({ 'x-forwarded-for': '1.2.3.4, 100.64.0.1, 203.0.113.9' }))
    expect(ip).toBe('203.0.113.9')
  })

  it('порожні значення заголовків не дають порожній ключ → null', () => {
    expect(getClientIp(h({ 'x-real-ip': '   ' }))).toBeNull()
    expect(getClientIp(h({ 'x-forwarded-for': ' , , ' }))).toBeNull()
  })
})
