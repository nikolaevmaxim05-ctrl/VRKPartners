import { describe, it, expect } from 'vitest'
import { isHidden, pageVisibility, normalizeHidden, HIDEABLE_BLOCKS, NAV_ITEMS, HOME_NS } from '../visibility'

describe('visibility', () => {
  it('isHidden: сам или родительский блок', () => {
    expect(isHidden(['about'], HOME_NS, 'about')).toBe(true)
    expect(isHidden(['about'], HOME_NS, 'usp')).toBe(false)
  })

  it('pageVisibility: неизвестные значения отбрасываются, shown работает', () => {
    const v = pageVisibility(HOME_NS, ['about', 'junk', 5])
    expect(v.hidden).toEqual(['about'])
    expect(v.shown('about')).toBe(false)
    expect(v.shown('hero')).toBe(true)
    expect(pageVisibility(HOME_NS, undefined).hidden).toEqual([])
    expect(pageVisibility(HOME_NS, ['step_2']).hiddenItems('step', 4)).toEqual([])
  })

  it('normalizeHidden: неизвестный → ошибка; дубли; порядок списка', () => {
    expect(normalizeHidden(HOME_NS, ['x']).ok).toBe(false)
    expect(normalizeHidden(HOME_NS, 'x').ok).toBe(false)
    const r = normalizeHidden(HOME_NS, ['process', 'hero', 'hero'])
    expect(r).toEqual({ ok: true, value: ['hero', 'process'] })
  })

  it('каждый пункт меню ведёт на скрываемый блок главной', () => {
    const ids = new Set(HIDEABLE_BLOCKS[HOME_NS].map((b) => b.id))
    for (const item of NAV_ITEMS) expect(ids.has(item.id)).toBe(true)
  })
})
