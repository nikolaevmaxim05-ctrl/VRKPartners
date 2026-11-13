// Правила мержа/диффа текстов (раздел 9 стандарта) + совместимость со старым форматом правок.
import { describe, it, expect } from 'vitest'
import { mergeMessages, diffMessages, contentList, countChanges, pickEditable, EDITABLE_NAMESPACES } from '../messages'

const defaults = {
  hero: { title: 'Заголовок', subtitle: 'Підзаголовок', trustHref: 'https://a', partners: [{ name: 'A', logo: '/a.png' }] },
  trust: { facts: ['один', 'два'], caseGroups: [{ id: 'g1', niche: 'N', cases: [{ id: 'c1', client: 'x' }] }] },
  faq: [{ q: 'Q1', a: 'A1' }],
  home: { hidden: [] as string[] },
  workflow: { bonus: { badge: 'B', terms: [{ label: 'l', value: 'v' }] }, steps: [{ title: 's1' }] },
  flags: { wide: false, n: 3 },
}

describe('mergeMessages', () => {
  it('без правок → копія дефолтів', () => {
    const m = mergeMessages(defaults, undefined)
    expect(m).toEqual(defaults)
    expect(m).not.toBe(defaults)
    expect(mergeMessages(defaults, null)).toEqual(defaults)
    expect(mergeMessages(defaults, 'junk')).toEqual(defaults)
  })

  it('рядок із правки перемагає завжди, навіть порожній («пусто = убрано»)', () => {
    const m = mergeMessages(defaults, { hero: { title: '', subtitle: 'Новий' } })
    expect(m.hero.title).toBe('')
    expect(m.hero.subtitle).toBe('Новий')
    expect(m.hero.trustHref).toBe('https://a')
  })

  it('масив із правки замінює дефолтний цілком — коротший, довший, порожній', () => {
    expect(mergeMessages(defaults, { trust: { facts: ['x'] } }).trust.facts).toEqual(['x'])
    expect(mergeMessages(defaults, { trust: { facts: [] } }).trust.facts).toEqual([])
    expect(mergeMessages(defaults, { faq: [{ q: '1', a: '1' }, { q: '2', a: '2' }] }).faq).toHaveLength(2)
  })

  it('число/булеве — лише якщо тип збігається; тип не збігся → дефолт', () => {
    const m = mergeMessages(defaults, { flags: { wide: true, n: '5' }, hero: { title: 42, partners: 'nope' } })
    expect(m.flags.wide).toBe(true)
    expect(m.flags.n).toBe(3)
    expect(m.hero.title).toBe('Заголовок')
    expect(m.hero.partners).toEqual(defaults.hero.partners)
  })

  it('ключі правки, яких немає в дефолтах, ігноруються', () => {
    const m = mergeMessages(defaults, { hero: { badge: 'old', formTitle: 'old' }, unknownNs: { a: 1 } }) as unknown as Record<string, unknown>
    expect((m.hero as Record<string, unknown>).badge).toBeUndefined()
    expect(m.unknownNs).toBeUndefined()
  })

  it('сумісний зі старим форматом правок клієнта (hero/site/trust цілим блоком)', () => {
    const old = {
      hero: { trust: 'Довіра', trustHref: 'https://p' },
      trust: { eyebrow: 'старий ключ', cta: 'старий', facts: ['новий факт', 'два'], caseGroups: [{ id: 'g1', niche: 'N', cases: [{ id: 'c1', client: 'x', image: '' }] }] },
    }
    const d = { ...defaults, hero: { ...defaults.hero, trust: 'Дефолт' } }
    const m = mergeMessages(d, old)
    expect(m.hero.trust).toBe('Довіра')
    expect(m.trust.facts[0]).toBe('новий факт')
    expect((m.trust.caseGroups[0].cases[0] as { image?: string }).image).toBe('')
    expect((m.trust as Record<string, unknown>).eyebrow).toBeUndefined()
  })
})

describe('diffMessages', () => {
  it('без відмінностей → undefined (порожній обʼєкт не зберігається)', () => {
    expect(diffMessages(defaults, JSON.parse(JSON.stringify(defaults)))).toBeUndefined()
  })

  it('лишає лише змінені рядки; повернуте до дефолту значення зникає', () => {
    const d = diffMessages(defaults, { hero: { title: 'Новий', subtitle: 'Підзаголовок' } })
    expect(d).toEqual({ hero: { title: 'Новий' } })
  })

  it('порожній рядок — теж правка (він прибирає текст)', () => {
    expect(diffMessages(defaults, { hero: { title: '' } })).toEqual({ hero: { title: '' } })
  })

  it('масив зберігається цілком, якщо JSON відрізняється', () => {
    expect(diffMessages(defaults, { trust: { facts: ['один', 'ДВА'] } })).toEqual({ trust: { facts: ['один', 'ДВА'] } })
    expect(diffMessages(defaults, { trust: { facts: ['один', 'два'] } })).toBeUndefined()
    expect(diffMessages(defaults, { home: { hidden: ['about'] } })).toEqual({ home: { hidden: ['about'] } })
  })

  it('число/булеве — якщо відрізняється і тип той самий; чужі ключі не потрапляють', () => {
    expect(diffMessages(defaults, { flags: { wide: true, n: '7', extra: 1 } })).toEqual({ flags: { wide: true } })
  })

  it('мерж диффу повертає повне значення (кругова сумісність)', () => {
    const edited = JSON.parse(JSON.stringify(defaults))
    edited.workflow.bonus.terms.push({ label: 'x', value: 'y' })
    edited.hero.title = ''
    const diff = diffMessages(defaults, edited)
    expect(mergeMessages(defaults, diff)).toEqual(edited)
  })
})

describe('contentList / countChanges / pickEditable', () => {
  it('contentList лишає лише непорожні рядки', () => {
    expect(contentList(['a', '', '  ', 1, null, 'b'])).toEqual(['a', 'b'])
    expect(contentList('x')).toEqual([])
  })

  it('countChanges рахує змінені листки, зайві та відсутні елементи', () => {
    expect(countChanges(defaults, defaults)).toBe(0)
    expect(countChanges(defaults, { ...defaults, hero: { ...defaults.hero, title: 'x', subtitle: 'y' } })).toBe(2)
    expect(countChanges(defaults, { ...defaults, trust: { ...defaults.trust, facts: ['один'] } })).toBe(1)
    expect(countChanges(defaults, { ...defaults, faq: [...defaults.faq, { q: 'n', a: 'n' }] })).toBe(1)
    expect(countChanges(defaults, { ...defaults, home: { hidden: ['about'] } })).toBe(1)
  })

  it('pickEditable не віддає pageMeta', () => {
    const picked = pickEditable({ hero: {}, pageMeta: { title: 'x' }, faq: [] })
    expect(Object.keys(picked)).toEqual(['hero', 'faq'])
    expect(EDITABLE_NAMESPACES).not.toContain('pageMeta')
  })
})
