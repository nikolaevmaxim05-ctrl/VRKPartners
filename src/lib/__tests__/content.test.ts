// Регрес фази 2: валідація URL (C10/S7), diff-семантика збереження контенту (C5),
// мерж дефолтів з оверрайдами та санітизація href при рендері.
import { describe, it, expect } from 'vitest'
import {
  getDefaultLandingContent,
  mergeLandingContent,
  diffLandingOverrides,
  isSafeImageUrl,
  isSafeHref,
  type LandingContentOverrides,
} from '@/lib/content'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

describe('C10/S7 — валідація URL', () => {
  it('isSafeImageUrl: локальні і supabase — ок; чуже/js — ні', () => {
    expect(isSafeImageUrl('/mockups/x.png')).toBe(true)
    expect(isSafeImageUrl('https://abc.supabase.co/storage/v1/object/public/content/x.png')).toBe(true)
    expect(isSafeImageUrl('https://evil.example.com/x.png')).toBe(false)
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeImageUrl('')).toBe(true)
    expect(isSafeImageUrl(undefined)).toBe(true)
  })

  it('isSafeHref: лише http(s)', () => {
    expect(isSafeHref('https://client.com/')).toBe(true)
    expect(isSafeHref('http://client.com/')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,x')).toBe(false)
    expect(isSafeHref('')).toBe(true)
  })
})

describe('C5 — diffLandingOverrides', () => {
  it('блок, рівний дефолту, не зберігається (дефолти config доходять до прод)', () => {
    const d = getDefaultLandingContent()
    const incoming = {
      hero: { ...d.hero },
      services: clone(d.services),
    } as unknown as LandingContentOverrides
    const diff = diffLandingOverrides(incoming, d)
    expect(diff.hero).toBeUndefined()
    expect(diff.services).toBeUndefined()
  })

  it('змінене скалярне поле лишається, незмінені — ні', () => {
    const d = getDefaultLandingContent()
    const incoming = { hero: { ...d.hero, title: 'НОВИЙ' } } as unknown as LandingContentOverrides
    const diff = diffLandingOverrides(incoming, d)
    expect(diff.hero).toEqual({ title: 'НОВИЙ' })
  })

  it('змінений структурний блок зберігається цілком', () => {
    const d = getDefaultLandingContent()
    const changed = clone(d.services)
    changed.title = 'ІНШИЙ ЗАГОЛОВОК'
    const diff = diffLandingOverrides({ services: changed } as unknown as LandingContentOverrides, d)
    expect(diff.services?.title).toBe('ІНШИЙ ЗАГОЛОВОК')
  })
})

describe('C5/merge — дефолти + оверрайди + санітизація', () => {
  it('mergeLandingContent застосовує оверрайд поверх дефолту', () => {
    const d = getDefaultLandingContent()
    const merged = mergeLandingContent({ hero: { title: 'X' } } as unknown as LandingContentOverrides)
    expect(merged.hero.title).toBe('X')
    expect(merged.hero.subtitle).toBe(d.hero.subtitle) // інші поля — з дефолтів
  })

  it('mergeLandingContent прибирає небезпечний href кейса (S7)', () => {
    const d = getDefaultLandingContent()
    const trust = clone(d.trust)
    trust.caseGroups[0].cases[0].href = 'javascript:alert(1)'
    const merged = mergeLandingContent({ trust } as unknown as LandingContentOverrides)
    expect(merged.trust.caseGroups[0].cases[0].href).toBeUndefined()
  })

  it('mergeLandingContent прибирає зображення з чужого хоста (C10)', () => {
    const d = getDefaultLandingContent()
    const services = clone(d.services)
    services.items[0].mockup = 'https://evil.example.com/x.png'
    const merged = mergeLandingContent({ services } as unknown as LandingContentOverrides)
    expect(merged.services.items[0].mockup).toBeUndefined()
  })
})
