// Регресс: валидация URL (C10/S7), дефолты из messages/uk.json, мерж/дифф на реальных дефолтах.
import { describe, it, expect } from 'vitest'
import { mergeMessages, diffMessages, pickEditable } from '@core/domain/content/messages'
import { getDefaultMessages, getDefaultSeo, isSafeImageUrl, isSafeHref } from '../defaults'

describe('C10/S7 — валидация URL', () => {
  it('isSafeImageUrl: локальные и supabase — ок; чужое/js — нет', () => {
    expect(isSafeImageUrl('/mockups/x.png')).toBe(true)
    expect(isSafeImageUrl('https://abc.supabase.co/storage/v1/object/public/content/x.png')).toBe(true)
    expect(isSafeImageUrl('https://evil.example.com/x.png')).toBe(false)
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeImageUrl('//evil.example.com/x.png')).toBe(false)
    expect(isSafeImageUrl('')).toBe(true)
    expect(isSafeImageUrl(undefined)).toBe(true)
  })

  it('isSafeHref: только http(s)', () => {
    expect(isSafeHref('https://client.com/')).toBe(true)
    expect(isSafeHref('http://client.com/')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,x')).toBe(false)
    expect(isSafeHref('')).toBe(true)
  })
})

describe('дефолты messages/uk.json', () => {
  it('содержат все пространства, копия независима', () => {
    const a = getDefaultMessages()
    const b = getDefaultMessages()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    for (const ns of ['site', 'nav', 'header', 'hero', 'usp', 'about', 'services', 'audit', 'trust', 'workflow', 'finalCta', 'faq', 'footer', 'form', 'thanks', 'notFound', 'legal', 'home', 'pageMeta']) {
      expect(ns in a, ns).toBe(true)
    }
    expect(a.home.hidden).toEqual([])
    expect(getDefaultSeo().title.length).toBeGreaterThan(0)
  })

  it('C5 — блок, равный дефолту, не сохраняется; изменённое поле — остаётся', () => {
    const d = pickEditable(getDefaultMessages())
    expect(diffMessages(d, JSON.parse(JSON.stringify(d)))).toBeUndefined()
    const edited = JSON.parse(JSON.stringify(d))
    edited.hero.title = 'НОВИЙ'
    expect(diffMessages(d, edited)).toEqual({ hero: { title: 'НОВИЙ' } })
  })

  it('старые правки клиента (hero.trust/trustHref, site.*, trust целиком) мержатся без потерь', () => {
    const d = getDefaultMessages()
    const overrides = {
      hero: { trust: 'Правка довіри', trustHref: 'https://partners.example' },
      site: { phone: '+38 (000) 000-00-00', phoneHref: 'tel:+380000000000', telegram: 'https://t.me/x', telegramHandle: '@x' },
      trust: { ...JSON.parse(JSON.stringify(d.trust)), eyebrow: 'legacy', cta: 'legacy', facts: ['Новий факт', ...d.trust.facts.slice(1)] },
    }
    const m = mergeMessages(d, overrides)
    expect(m.hero.trust).toBe('Правка довіри')
    expect(m.site.phone).toBe('+38 (000) 000-00-00')
    expect(m.trust.facts[0]).toBe('Новий факт')
    expect(m.trust.caseGroups).toEqual(d.trust.caseGroups)
    expect((m.trust as unknown as Record<string, unknown>).eyebrow).toBeUndefined()
  })
})
