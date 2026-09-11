import { describe, it, expect } from 'vitest'
import { getClientIp, UNKNOWN_IP } from '../client-ip'

const h = (init: Record<string, string>) => new Headers(init)

describe('getClientIp — ланцюжок розділу 8', () => {
  it('cf-connecting-ip має найвищий пріоритет', () => {
    expect(getClientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '7.7.7.7', 'x-real-ip': '8.8.8.8' }))).toBe('9.9.9.9')
  })

  it('потім — ПЕРШИЙ сегмент x-forwarded-for (на Vercel його виставляє платформа)', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '1.2.3.4, 100.64.0.1, 203.0.113.9', 'x-real-ip': '8.8.8.8' }))).toBe('1.2.3.4')
  })

  it('потім — x-real-ip', () => {
    expect(getClientIp(h({ 'x-real-ip': '  3.3.3.3  ' }))).toBe('3.3.3.3')
  })

  it("немає заголовків або вони порожні → 'unknown' (ліміт і дедуп за IP пропускаються)", () => {
    expect(getClientIp(h({}))).toBe(UNKNOWN_IP)
    expect(getClientIp(h({ 'x-real-ip': '   ' }))).toBe(UNKNOWN_IP)
    expect(getClientIp(h({ 'x-forwarded-for': ' , , ' }))).toBe(UNKNOWN_IP)
  })

  it('не-IP у заголовку (спуфінг/сміття) пропускається — далі ланцюжком, у inet не потрапляє', () => {
    expect(getClientIp(h({ 'cf-connecting-ip': 'foo', 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4')
    expect(getClientIp(h({ 'cf-connecting-ip': '10.0.0.999', 'x-real-ip': '5.5.5.5' }))).toBe('5.5.5.5')
    expect(getClientIp(h({ 'x-forwarded-for': 'unknown, 1.2.3.4' }))).toBe(UNKNOWN_IP)
    expect(getClientIp(h({ 'x-forwarded-for': "1.2.3.4' or 1=1" }))).toBe(UNKNOWN_IP)
  })

  it('IPv6 приймається', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '2a02:1234::1' }))).toBe('2a02:1234::1')
  })

  it('різні IP → різні ключі', () => {
    expect(getClientIp(h({ 'x-forwarded-for': '1.1.1.1' }))).not.toBe(getClientIp(h({ 'x-forwarded-for': '2.2.2.2' })))
  })
})
