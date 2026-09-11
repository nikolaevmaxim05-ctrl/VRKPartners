// Ліміти за типом поля (розділ 9) + санітизація/валідація збереження.
import { describe, it, expect } from 'vitest'
import { fieldType, fieldLimit, fieldKind, validateMessages, isAllowedHref, MAX_ARRAY_ITEMS } from '../limits'

describe('fieldType / fieldLimit', () => {
  it('тип за іменем ключа у порядку таблиці', () => {
    expect(fieldType('price')).toBe('number')
    expect(fieldType('desc')).toBe('paragraph')
    expect(fieldType('subtitle')).toBe('paragraph')
    expect(fieldType('modalDescription')).toBe('paragraph')
    expect(fieldType('title')).toBe('title')
    expect(fieldType('name')).toBe('title')
    expect(fieldType('eyebrow')).toBe('badge')
    expect(fieldType('primaryCta')).toBe('badge')
    expect(fieldType('submit')).toBe('badge')
    expect(fieldType('label')).toBe('label')
    expect(fieldType('placeholder')).toBe('label')
    expect(fieldType('facts')).toBe('other')
  })

  it('явні винятки — імʼя обманює про тип', () => {
    expect(fieldType('q')).toBe('title')
    expect(fieldType('a')).toBe('paragraph')
    expect(fieldType('partnerLinkText')).toBe('label')
    expect(fieldType('partnerBadge')).toBe('other')
    expect(fieldType('partnerLabel')).toBe('label')
    expect(fieldType('trust', 'hero.trust')).toBe('paragraph')
  })

  it('ліміт = max(ліміт типу, ceil(дефолт × 1.2)); «прочее» — 2×дефолт + 500', () => {
    expect(fieldLimit('title', 'короткий')).toBe(80)
    expect(fieldLimit('title', 'x'.repeat(100))).toBe(120)
    expect(fieldLimit('facts', 'x'.repeat(10))).toBe(520)
    expect(fieldLimit('facts', undefined)).toBe(500)
  })

  it('вид поля для віджета/URL', () => {
    expect(fieldKind('image')).toBe('image')
    expect(fieldKind('photo')).toBe('image')
    expect(fieldKind('mockupFull')).toBe('image')
    expect(fieldKind('logo')).toBe('image')
    expect(fieldKind('imageAlt')).toBe('text')
    expect(fieldKind('trustHref')).toBe('href')
    expect(fieldKind('telegramCtaUrl')).toBe('href')
    expect(fieldKind('icon')).toBe('icon')
    expect(fieldKind('title')).toBe('text')
  })

  it('href: https/http/tel/mailto або відносний шлях', () => {
    expect(isAllowedHref('https://x.com')).toBe(true)
    expect(isAllowedHref('tel:+380')).toBe(true)
    expect(isAllowedHref('mailto:a@b.c')).toBe(true)
    expect(isAllowedHref('/page')).toBe(true)
    expect(isAllowedHref('')).toBe(true)
    expect(isAllowedHref('javascript:alert(1)')).toBe(false)
    expect(isAllowedHref('//evil')).toBe(false)
  })
})

const defaults = {
  site: { telegramCtaUrl: 'https://t.me/x', phone: '+38' },
  hero: { title: 'T', trustHref: 'https://a', partners: [{ name: 'A', logo: '/a.png', href: 'https://a' }] },
  usp: { items: [{ title: 'a', icon: 'database', text: 'b' }] },
  trust: { facts: ['один'] },
  faq: [{ q: 'Q', a: 'A' }],
  home: { hidden: [] as string[] },
  services: { items: [{ key: 'search', name: 'n', desc: 'd', previewWide: false }, { key: 'x', name: 'n', desc: 'd', mockup: '/x.png' }] },
}

describe('validateMessages', () => {
  it('чужий верхньорівневий ключ → помилка', () => {
    const r = validateMessages(defaults, { pageMeta: { title: 'x' } })
    expect(r.ok).toBe(false)
    const r2 = validateMessages(defaults, { junk: {} })
    expect(r2.ok).toBe(false)
    expect(validateMessages(defaults, null).ok).toBe(false)
  })

  it('санітизує: чужі ключі відкинуто, відсутні — з дефолтів, типи узгоджено', () => {
    const r = validateMessages(defaults, { hero: { title: 'Новий', badge: 'old', trustHref: 5 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.hero).toEqual({ title: 'Новий', trustHref: 'https://a', partners: defaults.hero.partners })
      expect(Object.keys(r.value)).toEqual(['hero'])
    }
  })

  it('елементи масивів санітизуються за шаблоном; необовʼязкові поля лишаються', () => {
    const r = validateMessages(defaults, {
      usp: { items: [{ title: 'x', text: 'y', junk: 1 }, { title: 'z', icon: '', text: '' }] },
      services: { items: [{ key: 'k', name: 'n', desc: 'd', previewWide: true, mockup: '/m.png' }] },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      // необовʼязковий icon не дозаповнюється з шаблону
      expect(r.value.usp.items[0]).toEqual({ title: 'x', text: 'y' })
      expect(r.value.services.items[0]).toEqual({ key: 'k', name: 'n', desc: 'd', previewWide: true, mockup: '/m.png' })
    }
  })

  it('елемент масиву без обовʼязкового вкладеного масиву → порожній масив (не дефолтний); необовʼязковий (approach) не дозаповнюється', () => {
    const defs = { trust: { caseGroups: [{ id: 'g1', niche: 'N', cases: [{ id: 'c1', client: 'C', title: 'T', metrics: [{ label: 'l', value: 'v' }], approach: ['a'] }, { id: 'c2', client: 'D', title: 'U', metrics: [] }] }] } }
    const r = validateMessages(defs, { trust: { caseGroups: [{ id: 'g2', niche: 'X' }, { id: 'g3', niche: 'Y', cases: [{ id: 'c9', client: 'K', title: 'Q' }] }] } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.trust.caseGroups[0]).toEqual({ id: 'g2', niche: 'X', cases: [] })
      expect(r.value.trust.caseGroups[1].cases[0]).toEqual({ id: 'c9', client: 'K', title: 'Q', metrics: [] })
    }
  })

  it('site.telegram і site.telegramCtaUrl — лише t.me/telegram.me (рендеряться в href)', () => {
    const defs = { site: { telegram: 'https://t.me/a', telegramCtaUrl: 'https://t.me/b' } }
    expect(validateMessages(defs, { site: { telegram: 'javascript:alert(1)' } }).ok).toBe(false)
    expect(validateMessages(defs, { site: { telegram: 'https://evil.example/x' } }).ok).toBe(false)
    expect(validateMessages(defs, { site: { telegram: 'https://telegram.me/vrk' } }).ok).toBe(true)
    expect(validateMessages(defs, { site: { telegram: '' } }).ok).toBe(true)
  })

  it('перевищення ліміту → помилка зі шляхом', () => {
    const r = validateMessages(defaults, { hero: { title: 'x'.repeat(81) } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.path).toBe('hero.title')
    const r2 = validateMessages(defaults, { faq: [{ q: 'ok', a: 'x'.repeat(601) }] })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error.path).toBe('faq[0].a')
  })

  it('масиви ≤ 50', () => {
    const r = validateMessages(defaults, { trust: { facts: Array.from({ length: MAX_ARRAY_ITEMS + 1 }, () => 'x') } })
    expect(r.ok).toBe(false)
  })

  it('URL-правила: href, image, icon, telegramCtaUrl', () => {
    expect(validateMessages(defaults, { hero: { trustHref: 'javascript:1' } }).ok).toBe(false)
    expect(validateMessages(defaults, { hero: { partners: [{ name: 'A', logo: 'https://evil/x.png', href: 'https://a' }] } }).ok).toBe(false)
    expect(validateMessages(defaults, { usp: { items: [{ title: 'a', icon: 'javascript:x', text: 'b' }] } }).ok).toBe(false)
    expect(validateMessages(defaults, { site: { telegramCtaUrl: 'https://evil.com' } }).ok).toBe(false)
    expect(validateMessages(defaults, { site: { telegramCtaUrl: '' } }).ok).toBe(true)
    expect(validateMessages(defaults, { hero: { trustHref: 'tel:+380' } }).ok).toBe(true)
  })

  it('hidden: невідомий id → помилка; дублі та порядок нормалізуються', () => {
    expect(validateMessages(defaults, { home: { hidden: ['nope'] } }).ok).toBe(false)
    const r = validateMessages(defaults, { home: { hidden: ['faq', 'about', 'about'] } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.home.hidden).toEqual(['about', 'faq'])
  })
})
