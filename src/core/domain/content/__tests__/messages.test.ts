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
  it('без правок → копия дефолтов', () => {
    const m = mergeMessages(defaults, undefined)
    expect(m).toEqual(defaults)
    expect(m).not.toBe(defaults)
    expect(mergeMessages(defaults, null)).toEqual(defaults)
    expect(mergeMessages(defaults, 'junk')).toEqual(defaults)
  })

  it('строка из правки побеждает всегда, даже пустая («пусто = убрано»)', () => {
    const m = mergeMessages(defaults, { hero: { title: '', subtitle: 'Новий' } })
    expect(m.hero.title).toBe('')
    expect(m.hero.subtitle).toBe('Новий')
    expect(m.hero.trustHref).toBe('https://a')
  })

  it('массив из правки заменяет дефолтный целиком — короче, длиннее, пустой', () => {
    expect(mergeMessages(defaults, { trust: { facts: ['x'] } }).trust.facts).toEqual(['x'])
    expect(mergeMessages(defaults, { trust: { facts: [] } }).trust.facts).toEqual([])
    expect(mergeMessages(defaults, { faq: [{ q: '1', a: '1' }, { q: '2', a: '2' }] }).faq).toHaveLength(2)
  })

  it('число/булево — только если тип совпадает; тип не совпал → дефолт', () => {
    const m = mergeMessages(defaults, { flags: { wide: true, n: '5' }, hero: { title: 42, partners: 'nope' } })
    expect(m.flags.wide).toBe(true)
    expect(m.flags.n).toBe(3)
    expect(m.hero.title).toBe('Заголовок')
    expect(m.hero.partners).toEqual(defaults.hero.partners)
  })

  it('ключи правки, которых нет в дефолтах, игнорируются', () => {
    const m = mergeMessages(defaults, { hero: { badge: 'old', formTitle: 'old' }, unknownNs: { a: 1 } }) as unknown as Record<string, unknown>
    expect((m.hero as Record<string, unknown>).badge).toBeUndefined()
    expect(m.unknownNs).toBeUndefined()
  })

  it('совместим со старым форматом правок клиента (hero/site/trust целым блоком)', () => {
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
  it('без различий → undefined (пустой объект не сохраняется)', () => {
    expect(diffMessages(defaults, JSON.parse(JSON.stringify(defaults)))).toBeUndefined()
  })

  it('оставляет только изменённые строки; возвращённое к дефолту значение исчезает', () => {
    const d = diffMessages(defaults, { hero: { title: 'Новий', subtitle: 'Підзаголовок' } })
    expect(d).toEqual({ hero: { title: 'Новий' } })
  })

  it('пустая строка — тоже правка (она убирает текст)', () => {
    expect(diffMessages(defaults, { hero: { title: '' } })).toEqual({ hero: { title: '' } })
  })

  it('массив сохраняется целиком, если JSON отличается', () => {
    expect(diffMessages(defaults, { trust: { facts: ['один', 'ДВА'] } })).toEqual({ trust: { facts: ['один', 'ДВА'] } })
    expect(diffMessages(defaults, { trust: { facts: ['один', 'два'] } })).toBeUndefined()
    expect(diffMessages(defaults, { home: { hidden: ['about'] } })).toEqual({ home: { hidden: ['about'] } })
  })

  it('число/булево — если отличается и тип тот же; чужие ключи не попадают', () => {
    expect(diffMessages(defaults, { flags: { wide: true, n: '7', extra: 1 } })).toEqual({ flags: { wide: true } })
  })

  it('мерж диффа возвращает полное значение (круговая совместимость)', () => {
    const edited = JSON.parse(JSON.stringify(defaults))
    edited.workflow.bonus.terms.push({ label: 'x', value: 'y' })
    edited.hero.title = ''
    const diff = diffMessages(defaults, edited)
    expect(mergeMessages(defaults, diff)).toEqual(edited)
  })
})

describe('contentList / countChanges / pickEditable', () => {
  it('contentList оставляет только непустые строки', () => {
    expect(contentList(['a', '', '  ', 1, null, 'b'])).toEqual(['a', 'b'])
    expect(contentList('x')).toEqual([])
  })

  it('countChanges считает изменённые листья, лишние и отсутствующие элементы', () => {
    expect(countChanges(defaults, defaults)).toBe(0)
    expect(countChanges(defaults, { ...defaults, hero: { ...defaults.hero, title: 'x', subtitle: 'y' } })).toBe(2)
    expect(countChanges(defaults, { ...defaults, trust: { ...defaults.trust, facts: ['один'] } })).toBe(1)
    expect(countChanges(defaults, { ...defaults, faq: [...defaults.faq, { q: 'n', a: 'n' }] })).toBe(1)
    expect(countChanges(defaults, { ...defaults, home: { hidden: ['about'] } })).toBe(1)
  })

  it('pickEditable не отдаёт pageMeta', () => {
    const picked = pickEditable({ hero: {}, pageMeta: { title: 'x' }, faq: [] })
    expect(Object.keys(picked)).toEqual(['hero', 'faq'])
    expect(EDITABLE_NAMESPACES).not.toContain('pageMeta')
  })
})
