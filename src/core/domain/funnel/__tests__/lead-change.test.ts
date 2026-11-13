// Раздел 6: классификация изменения лида (enter / leave / amount / none) и корректировки для leave/amount.
import { describe, it, expect } from 'vitest'
import { classifyLeadChange, decideLeave, decideAmountAdjustment } from '../transition'

const conv = { is_final: true, conversion_type: 'deal', requires_amount: true }
const convNoAmount = { is_final: true, conversion_type: 'target_lead', requires_amount: false }
const plain = { is_final: false, conversion_type: null, requires_amount: false }
const exported = { id: 'oc', export_status: 'exported' as const, conversion_action: 'deal_offline' }
const pending = { ...exported, export_status: 'pending' as const }

describe('classifyLeadChange', () => {
  it('enter: стадия сменилась на конверсионную', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: plain, newStatus: conv, amountChanged: false })).toBe('enter')
    expect(classifyLeadChange({ statusChanged: true, oldStatus: null, newStatus: convNoAmount, amountChanged: false })).toBe('enter')
  })
  it('leave: с конверсионной на неконверсионную', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: conv, newStatus: plain, amountChanged: false })).toBe('leave')
    expect(classifyLeadChange({ statusChanged: true, oldStatus: conv, newStatus: null, amountChanged: false })).toBe('leave')
  })
  it('none: между неконверсионными стадиями', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: plain, newStatus: plain, amountChanged: false })).toBe('none')
  })
  it('amount: стадия та же, конверсионная с суммой, сумма изменилась', () => {
    expect(classifyLeadChange({ statusChanged: false, oldStatus: conv, newStatus: conv, amountChanged: true })).toBe('amount')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: conv, newStatus: conv, amountChanged: false })).toBe('none')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: convNoAmount, newStatus: convNoAmount, amountChanged: true })).toBe('none')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: plain, newStatus: plain, amountChanged: true })).toBe('none')
  })
})

describe('decideLeave', () => {
  it('RETRACT только для выгруженной конверсии', () => {
    expect(decideLeave(exported)).toEqual({ kind: 'retract', conversionAction: 'deal_offline', offlineConversionId: 'oc' })
    expect(decideLeave(pending)).toEqual({ kind: 'none' })
    expect(decideLeave(null)).toEqual({ kind: 'none' })
  })
})

describe('decideAmountAdjustment', () => {
  const updated = { outcome: 'updated' as const, action: 'deal_offline', prevAction: 'deal_offline', prevType: 'deal', prevValue: 100, valueChanged: true }
  it('RESTATE: сумма изменилась и конверсия выгружена', () => {
    expect(decideAmountAdjustment({ outcome: updated, ocBefore: exported, conversionValue: 250 })).toEqual({
      kind: 'restate', conversionAction: 'deal_offline', value: 250,
    })
  })
  it('pending / без изменений / ошибка → ничего', () => {
    expect(decideAmountAdjustment({ outcome: updated, ocBefore: pending, conversionValue: 250 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { ...updated, valueChanged: false }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { outcome: 'noop' }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { outcome: 'error' }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
  })
})
