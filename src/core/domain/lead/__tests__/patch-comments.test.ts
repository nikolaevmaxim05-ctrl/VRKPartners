// PATCH лида (parseLeadPatch) и комментарии (validateNewComment, isCommentType).
import { describe, it, expect } from 'vitest'
import { parseLeadPatch, PATCHABLE_LEAD_KEYS } from '../patch'
import { validateNewComment, isCommentType, COMMENT_TYPES } from '../comments'

describe('parseLeadPatch', () => {
  it('дозволені ключі', () => {
    expect(PATCHABLE_LEAD_KEYS).toEqual(['status_id', 'assigned_to', 'deal_amount', 'deal_profit'])
  })

  it('оновлює лише передані ключі', () => {
    const r = parseLeadPatch({ status_id: 's1' })
    expect(r).toEqual({ ok: true, update: { status_id: 's1' }, bodyKeys: new Set(['status_id']) })
    const r2 = parseLeadPatch({ deal_amount: 100, deal_profit: 0 })
    expect(r2.ok && r2.update).toEqual({ deal_amount: 100, deal_profit: 0 })
  })

  it('невідомі ключі відкидаються з update, але лишаються в bodyKeys', () => {
    const r = parseLeadPatch({ status_id: 's1', is_admin: true, name: 'hack' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.update).toEqual({ status_id: 's1' })
      expect(r.bodyKeys).toEqual(new Set(['status_id', 'is_admin', 'name']))
    }
  })

  it('лише невідомі ключі → «Нічого оновлювати»', () => {
    expect(parseLeadPatch({ junk: 1 })).toEqual({ ok: false, message: 'Нічого оновлювати' })
  })

  it('порожнє тіло / не обʼєкт → помилка', () => {
    expect(parseLeadPatch({})).toEqual({ ok: false, message: 'Нічого оновлювати' })
    expect(parseLeadPatch(null)).toEqual({ ok: false, message: 'Невірні дані' })
    expect(parseLeadPatch('x')).toEqual({ ok: false, message: 'Невірні дані' })
    expect(parseLeadPatch([])).toEqual({ ok: false, message: 'Невірні дані' })
  })

  it('суми: відʼємні / NaN / нескінченні / рядки → «Невірні дані»', () => {
    for (const bad of [-1, NaN, Infinity, '100']) {
      expect(parseLeadPatch({ deal_amount: bad })).toEqual({ ok: false, message: 'Невірні дані' })
      expect(parseLeadPatch({ deal_profit: bad })).toEqual({ ok: false, message: 'Невірні дані' })
    }
    expect(parseLeadPatch({ deal_amount: 0 }).ok).toBe(true)
    expect(parseLeadPatch({ deal_amount: 12.5 }).ok).toBe(true)
  })

  it('status_id / assigned_to / суми — nullable (null → null в update)', () => {
    const r = parseLeadPatch({ status_id: null, assigned_to: null, deal_amount: null, deal_profit: null })
    expect(r.ok && r.update).toEqual({ status_id: null, assigned_to: null, deal_amount: null, deal_profit: null })
  })

  it('status_id / assigned_to: порожній рядок або не рядок → помилка', () => {
    expect(parseLeadPatch({ status_id: '' })).toEqual({ ok: false, message: 'Невірні дані' })
    expect(parseLeadPatch({ assigned_to: 5 })).toEqual({ ok: false, message: 'Невірні дані' })
  })

  it('явний undefined у тілі → ключ присутній, у update null', () => {
    const r = parseLeadPatch({ status_id: undefined })
    expect(r.ok && r.update).toEqual({ status_id: null })
  })
})

describe('isCommentType', () => {
  it('comment / note / system', () => {
    expect(COMMENT_TYPES).toEqual(['comment', 'note', 'system'])
    for (const t of COMMENT_TYPES) expect(isCommentType(t)).toBe(true)
    expect(isCommentType('other')).toBe(false)
    expect(isCommentType('')).toBe(false)
    expect(isCommentType(null)).toBe(false)
    expect(isCommentType(1)).toBe(false)
  })
})

describe('validateNewComment', () => {
  it('comment (за замовчуванням) і note — ок, з trim', () => {
    expect(validateNewComment({ content: '  Привіт ' })).toEqual({ ok: true, type: 'comment', content: 'Привіт' })
    expect(validateNewComment({ type: 'note', content: 'n' })).toEqual({ ok: true, type: 'note', content: 'n' })
    expect(validateNewComment({ type: 'comment', content: 'c' })).toEqual({ ok: true, type: 'comment', content: 'c' })
  })

  it('system та невідомий тип → «Невалідний тип»', () => {
    expect(validateNewComment({ type: 'system', content: 'x' })).toEqual({ ok: false, message: 'Невалідний тип' })
    expect(validateNewComment({ type: 'weird', content: 'x' })).toEqual({ ok: false, message: 'Невалідний тип' })
  })

  it('порожній контент (після trim) → помилка', () => {
    expect(validateNewComment({})).toEqual({ ok: false, message: 'Порожній коментар' })
    expect(validateNewComment({ content: '' })).toEqual({ ok: false, message: 'Порожній коментар' })
    expect(validateNewComment({ content: '   \n ' })).toEqual({ ok: false, message: 'Порожній коментар' })
  })

  it('довжина ≤ 4000 (рахується після trim)', () => {
    expect(validateNewComment({ content: 'x'.repeat(4000) }).ok).toBe(true)
    expect(validateNewComment({ content: 'x'.repeat(4001) })).toEqual({ ok: false, message: 'Занадто довгий коментар' })
    expect(validateNewComment({ content: '  ' + 'x'.repeat(4000) + '  ' }).ok).toBe(true)
  })

  it('тип перевіряється раніше за контент', () => {
    expect(validateNewComment({ type: 'system', content: '' })).toEqual({ ok: false, message: 'Невалідний тип' })
  })
})
