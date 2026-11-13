import { describe, it, expect } from 'vitest'
import { planNewTag, planTagPatch } from '../tag-rules'
import { adsSendToList } from '../tags'

describe('Google-теги: conversion label (раздел 5)', () => {
  it('aw с label → send_to сохраняется; пустой → null', () => {
    const r = planNewTag({ type: 'aw', tag_id: 'AW-123456', conversion_label: ' AbC_d-1 ' })
    expect(r).toEqual({ ok: true, value: { type: 'aw', tag_id: 'AW-123456', label: null, conversion_label: 'AbC_d-1', enabled: true } })
    const r2 = planNewTag({ type: 'aw', tag_id: 'AW-1', conversion_label: '' })
    expect(r2.ok && r2.value.conversion_label).toBeNull()
  })

  it('ga4/gtm с label → 400', () => {
    expect(planNewTag({ type: 'ga4', tag_id: 'G-ABC', conversion_label: 'X' }).ok).toBe(false)
    expect(planTagPatch({ conversion_label: 'X' }, 'gtm').ok).toBe(false)
  })

  it('неверный формат label → 400', () => {
    expect(planNewTag({ type: 'aw', tag_id: 'AW-1', conversion_label: 'bad label!' }).ok).toBe(false)
    expect(planTagPatch({ conversion_label: 'x'.repeat(65) }, 'aw').ok).toBe(false)
  })

  it('patch: label можно очистить; формат tag_id — по текущему типу', () => {
    expect(planTagPatch({ conversion_label: '' }, 'aw')).toEqual({ ok: true, value: { conversion_label: null } })
    expect(planTagPatch({ tag_id: 'G-1' }, 'aw').ok).toBe(false)
  })

  it('adsSendToList: только aw с валидным label', () => {
    expect(
      adsSendToList([
        { type: 'aw', tag_id: 'AW-1', conversion_label: 'L1' },
        { type: 'aw', tag_id: 'AW-2', conversion_label: null },
        { type: 'ga4', tag_id: 'G-1', conversion_label: 'X' },
        { type: 'aw', tag_id: 'AW-3', conversion_label: 'bad!' },
      ]),
    ).toEqual(['AW-1/L1'])
  })
})
