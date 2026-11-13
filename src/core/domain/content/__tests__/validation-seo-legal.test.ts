// Валидация загрузки картинок, схемы SEO/юр.документов, мерж/дифф SEO и юр.документов.
import { describe, it, expect } from 'vitest'
import {
  validateImageUpload,
  buildUploadPath,
  extractOwnObjectPath,
  seoOverridesSchema,
  legalOverridesSchema,
  IMAGE_MAX_BYTES,
  IMAGE_ALLOWED_TYPES,
} from '../validation'
import { diffSeo, mergeSeo, effectiveOg, effectiveOrg, SEO_KEYS, type SeoMeta } from '../seo'
import { diffLegalOverrides, mergeLegalContent, cleanSection, type LegalContent } from '../legal'

// ── Картинки ─────────────────────────────────────────────────────────────────

describe('validateImageUpload', () => {
  it('png / jpeg / webp / gif — ок, з розширенням', () => {
    expect(validateImageUpload('image/png', 10)).toEqual({ ok: true, value: { ext: 'png' } })
    expect(validateImageUpload('image/jpeg', 10)).toEqual({ ok: true, value: { ext: 'jpg' } })
    expect(validateImageUpload('image/webp', 10)).toEqual({ ok: true, value: { ext: 'webp' } })
    expect(validateImageUpload('image/gif', 10)).toEqual({ ok: true, value: { ext: 'gif' } })
    expect([...IMAGE_ALLOWED_TYPES].sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp'])
  })

  it('svg та інші типи відхиляються', () => {
    for (const t of ['image/svg+xml', 'text/html', 'application/pdf', '', 'image/PNG']) {
      expect(validateImageUpload(t, 10)).toEqual({ ok: false, message: 'Дозволені лише зображення: png, jpg, webp, gif' })
    }
  })

  it('розмір > 5 МБ → помилка; рівно 5 МБ — ок', () => {
    expect(IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(validateImageUpload('image/png', IMAGE_MAX_BYTES)).toEqual({ ok: true, value: { ext: 'png' } })
    expect(validateImageUpload('image/png', IMAGE_MAX_BYTES + 1)).toEqual({ ok: false, message: 'Максимальний розмір — 5 МБ' })
  })

  it('тип перевіряється раніше за розмір', () => {
    const r = validateImageUpload('image/svg+xml', IMAGE_MAX_BYTES + 1)
    expect(!r.ok && r.message).toContain('Дозволені лише зображення')
  })
})

describe('buildUploadPath', () => {
  it('формат <timestamp>-<6 символів>.<ext>', () => {
    const p = buildUploadPath(1758153600000, 'abc123', 'png')
    expect(p).toBe('1758153600000-abc123.png')
    expect(p).toMatch(/^\d+-[a-z0-9]{6}\.[a-z]+$/)
  })
})

describe('extractOwnObjectPath', () => {
  const marker = '/storage/v1/object/public/content/'

  it('URL нашого bucket → шлях обʼєкта', () => {
    expect(extractOwnObjectPath(`https://x.supabase.co${marker}123-abcdef.png`, marker)).toBe('123-abcdef.png')
    expect(extractOwnObjectPath(`https://x.supabase.co${marker}dir/file.webp`, marker)).toBe('dir/file.webp')
  })

  it('чужий URL → null; порожній шлях після маркера → null', () => {
    expect(extractOwnObjectPath('https://evil.example/img.png', marker)).toBeNull()
    expect(extractOwnObjectPath('', marker)).toBeNull()
    expect(extractOwnObjectPath(`https://x.supabase.co${marker}`, marker)).toBeNull()
  })
})

// ── Схемы ────────────────────────────────────────────────────────────────────

describe('seoOverridesSchema', () => {
  it('ліміти: title/ogTitle/orgName ≤ 200, description/ogDescription/ogImage/orgDescription ≤ 500', () => {
    expect(seoOverridesSchema.safeParse({ title: 'x'.repeat(200), ogTitle: 'x'.repeat(200), orgName: 'x'.repeat(200) }).success).toBe(true)
    expect(seoOverridesSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ ogTitle: 'x'.repeat(201) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ orgName: 'x'.repeat(201) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ description: 'x'.repeat(500), ogDescription: 'x'.repeat(500), ogImage: 'x'.repeat(500), orgDescription: 'x'.repeat(500) }).success).toBe(true)
    expect(seoOverridesSchema.safeParse({ description: 'x'.repeat(501) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ ogDescription: 'x'.repeat(501) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ ogImage: 'x'.repeat(501) }).success).toBe(false)
    expect(seoOverridesSchema.safeParse({ orgDescription: 'x'.repeat(501) }).success).toBe(false)
  })

  it('невідомі ключі (старі контакти) відкидаються; усі поля необовʼязкові', () => {
    const r = seoOverridesSchema.safeParse({ title: 'T', phone: '+380', email: 'a@b.c', telegram: 'x' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ title: 'T' })
    expect(seoOverridesSchema.safeParse({}).success).toBe(true)
    expect(seoOverridesSchema.safeParse({ title: 5 }).success).toBe(false)
  })
})

describe('legalOverridesSchema', () => {
  const section = (over: Partial<{ heading: string; paragraphs: string[]; items: string[] }> = {}) => ({
    heading: 'H', paragraphs: ['p'], ...over,
  })

  it('валідний оверрайд; privacy/offer необовʼязкові', () => {
    expect(legalOverridesSchema.safeParse({}).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ privacy: { sections: [section({ items: ['i'] })] } }).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [] } }).success).toBe(true)
  })

  it('sections ≤ 80', () => {
    const many = (n: number) => Array.from({ length: n }, () => section())
    expect(legalOverridesSchema.safeParse({ privacy: { sections: many(80) } }).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ privacy: { sections: many(81) } }).success).toBe(false)
  })

  it('heading ≤ 300', () => {
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ heading: 'x'.repeat(300) })] } }).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ heading: 'x'.repeat(301) })] } }).success).toBe(false)
  })

  it('paragraphs ≤ 60 × 6000', () => {
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ paragraphs: Array(60).fill('x'.repeat(6000)) })] } }).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ paragraphs: Array(61).fill('p') })] } }).success).toBe(false)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ paragraphs: ['x'.repeat(6001)] })] } }).success).toBe(false)
  })

  it('items ≤ 60 × 1500, необовʼязкові', () => {
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ items: Array(60).fill('x'.repeat(1500)) })] } }).success).toBe(true)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ items: Array(61).fill('i') })] } }).success).toBe(false)
    expect(legalOverridesSchema.safeParse({ offer: { sections: [section({ items: ['x'.repeat(1501)] })] } }).success).toBe(false)
  })

  it('paragraphs обовʼязкові; чужі ключі секції стрижуться', () => {
    expect(legalOverridesSchema.safeParse({ offer: { sections: [{ heading: 'H' }] } }).success).toBe(false)
    const r = legalOverridesSchema.safeParse({ offer: { sections: [{ ...section(), html: '<b>' }] } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.offer?.sections[0]).toEqual({ heading: 'H', paragraphs: ['p'] })
  })
})

// ── SEO: мерж / дифф ─────────────────────────────────────────────────────────

const seoDefaults: SeoMeta = {
  title: 'Def title',
  description: 'Def desc',
  ogTitle: '',
  ogDescription: '',
  ogImage: '/og.png',
  orgName: '',
  orgDescription: '',
}

describe('mergeSeo / diffSeo', () => {
  it('SEO_KEYS — 7 полів у фіксованому порядку', () => {
    expect(SEO_KEYS).toEqual(['title', 'description', 'ogTitle', 'ogDescription', 'ogImage', 'orgName', 'orgDescription'])
  })

  it('мерж: порожні/невалідні оверрайди → дефолт; null/undefined → дефолти', () => {
    expect(mergeSeo(seoDefaults, null)).toEqual(seoDefaults)
    expect(mergeSeo(seoDefaults, undefined)).toEqual(seoDefaults)
    expect(mergeSeo(seoDefaults, { title: '', description: '   ', ogImage: 5 as never })).toEqual(seoDefaults)
    expect(mergeSeo(seoDefaults, { title: 'New' })).toEqual({ ...seoDefaults, title: 'New' })
  })

  it('мерж ігнорує чужі ключі', () => {
    const merged = mergeSeo(seoDefaults, { phone: '+380' } as never)
    expect(merged).toEqual(seoDefaults)
    expect('phone' in merged).toBe(false)
  })

  it('дифф: лише непорожні поля, що відрізняються від дефолту', () => {
    expect(diffSeo({ title: 'Def title', description: 'New desc', ogTitle: '', ogImage: '  ' }, seoDefaults))
      .toEqual({ description: 'New desc' })
    expect(diffSeo({}, seoDefaults)).toEqual({})
    expect(diffSeo({ ...seoDefaults }, seoDefaults)).toEqual({})
  })

  it('round-trip: merge(defaults, diff(incoming)) відтворює непорожні поля incoming', () => {
    const incoming = { ...seoDefaults, title: 'T2', ogTitle: 'OG', orgName: 'Org' }
    const diff = diffSeo(incoming, seoDefaults)
    expect(diff).toEqual({ title: 'T2', ogTitle: 'OG', orgName: 'Org' })
    expect(mergeSeo(seoDefaults, diff)).toEqual(incoming)
  })

  it('effectiveOg / effectiveOrg — наслідування порожніх полів', () => {
    expect(effectiveOg(seoDefaults)).toEqual({ title: 'Def title', description: 'Def desc' })
    expect(effectiveOg({ ...seoDefaults, ogTitle: 'OG', ogDescription: 'OD' })).toEqual({ title: 'OG', description: 'OD' })
    expect(effectiveOrg(seoDefaults, 'Site')).toEqual({ name: 'Site', description: 'Def desc' })
    expect(effectiveOrg({ ...seoDefaults, orgName: ' Org ', orgDescription: 'X' }, 'Site')).toEqual({ name: 'Org', description: 'X' })
    expect(effectiveOrg({ ...seoDefaults, orgName: '   ' }, 'Site').name).toBe('Site')
  })
})

// ── Юр.документы: мерж / дифф ────────────────────────────────────────────────

const legalDefaults: LegalContent = {
  privacy: { title: 'Політика', updatedAt: '2026-01-01', sections: [{ heading: 'P1', paragraphs: ['a'] }] },
  offer: { title: 'Оферта', sections: [{ heading: 'O1', paragraphs: ['b'], items: ['i'] }] },
}

describe('diffLegalOverrides / mergeLegalContent', () => {
  it('дифф: лишає лише документи, чиї секції відрізняються', () => {
    const same = { privacy: { sections: legalDefaults.privacy.sections } }
    expect(diffLegalOverrides(same, legalDefaults)).toEqual({})
    const changed = { offer: { sections: [{ heading: 'O2', paragraphs: ['c'] }] } }
    expect(diffLegalOverrides(changed, legalDefaults)).toEqual(changed)
    expect(diffLegalOverrides({}, legalDefaults)).toEqual({})
    expect(diffLegalOverrides({ privacy: { sections: 'x' as never } }, legalDefaults)).toEqual({})
  })

  it('мерж: заголовок і updatedAt лишаються з дефолтів, секції — з оверрайду', () => {
    const ov = { privacy: { sections: [{ heading: 'New', paragraphs: ['n'] }] } }
    const merged = mergeLegalContent(legalDefaults, ov)
    expect(merged.privacy).toEqual({ title: 'Політика', updatedAt: '2026-01-01', sections: [{ heading: 'New', paragraphs: ['n'] }] })
    expect(merged.offer).toEqual(legalDefaults.offer)
  })

  it('мерж: порожні/невалідні оверрайди → дефолти', () => {
    expect(mergeLegalContent(legalDefaults, null)).toEqual(legalDefaults)
    expect(mergeLegalContent(legalDefaults, undefined)).toEqual(legalDefaults)
    expect(mergeLegalContent(legalDefaults, { privacy: { sections: [] } })).toEqual(legalDefaults)
    // все секции пустые → дефолт
    expect(mergeLegalContent(legalDefaults, { offer: { sections: [{ heading: '', paragraphs: [] }] } })).toEqual(legalDefaults)
  })

  it('round-trip: merge(defaults, diff(incoming)) відтворює секції incoming', () => {
    const incoming = {
      privacy: { sections: [{ heading: 'P9', paragraphs: ['x', 'y'], items: ['z'] }] },
      offer: { sections: legalDefaults.offer.sections },
    }
    const diff = diffLegalOverrides(incoming, legalDefaults)
    expect(Object.keys(diff)).toEqual(['privacy'])
    const merged = mergeLegalContent(legalDefaults, diff)
    expect(merged.privacy.sections).toEqual(incoming.privacy.sections)
    expect(merged.offer.sections).toEqual(legalDefaults.offer.sections)
  })

  it('cleanSection: лише plain-текст, порожня секція → null, items лише непорожні', () => {
    expect(cleanSection(null)).toBeNull()
    expect(cleanSection('x')).toBeNull()
    expect(cleanSection({ heading: ' ', paragraphs: [], items: [] })).toBeNull()
    expect(cleanSection({ heading: 'H', paragraphs: ['a', 1, null], items: ['i', {}] })).toEqual({ heading: 'H', paragraphs: ['a'], items: ['i'] })
    expect(cleanSection({ heading: 'H', paragraphs: ['a'], items: [2] })).toEqual({ heading: 'H', paragraphs: ['a'] })
    expect(cleanSection({ heading: 5, paragraphs: ['a'] })).toEqual({ heading: '', paragraphs: ['a'] })
  })
})
