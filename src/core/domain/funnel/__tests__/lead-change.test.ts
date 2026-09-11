// Розділ 6: класифікація зміни ліда (enter / leave / amount / none) і корекції для leave/amount.
import { describe, it, expect } from 'vitest'
import { classifyLeadChange, decideLeave, decideAmountAdjustment } from '../transition'

const conv = { is_final: true, conversion_type: 'deal', requires_amount: true }
const convNoAmount = { is_final: true, conversion_type: 'target_lead', requires_amount: false }
const plain = { is_final: false, conversion_type: null, requires_amount: false }
const exported = { id: 'oc', export_status: 'exported' as const, conversion_action: 'deal_offline' }
const pending = { ...exported, export_status: 'pending' as const }

describe('classifyLeadChange', () => {
  it('enter: стадія змінилась на конверсійну', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: plain, newStatus: conv, amountChanged: false })).toBe('enter')
    expect(classifyLeadChange({ statusChanged: true, oldStatus: null, newStatus: convNoAmount, amountChanged: false })).toBe('enter')
  })
  it('leave: із конверсійної на неконверсійну', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: conv, newStatus: plain, amountChanged: false })).toBe('leave')
    expect(classifyLeadChange({ statusChanged: true, oldStatus: conv, newStatus: null, amountChanged: false })).toBe('leave')
  })
  it('none: між неконверсійними стадіями', () => {
    expect(classifyLeadChange({ statusChanged: true, oldStatus: plain, newStatus: plain, amountChanged: false })).toBe('none')
  })
  it('amount: стадія та сама, конверсійна з сумою, сума змінилась', () => {
    expect(classifyLeadChange({ statusChanged: false, oldStatus: conv, newStatus: conv, amountChanged: true })).toBe('amount')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: conv, newStatus: conv, amountChanged: false })).toBe('none')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: convNoAmount, newStatus: convNoAmount, amountChanged: true })).toBe('none')
    expect(classifyLeadChange({ statusChanged: false, oldStatus: plain, newStatus: plain, amountChanged: true })).toBe('none')
  })
})

describe('decideLeave', () => {
  it('RETRACT лише для вивантаженої конверсії', () => {
    expect(decideLeave(exported)).toEqual({ kind: 'retract', conversionAction: 'deal_offline', offlineConversionId: 'oc' })
    expect(decideLeave(pending)).toEqual({ kind: 'none' })
    expect(decideLeave(null)).toEqual({ kind: 'none' })
  })
})

describe('decideAmountAdjustment', () => {
  const updated = { outcome: 'updated' as const, action: 'deal_offline', prevAction: 'deal_offline', prevType: 'deal', prevValue: 100, valueChanged: true }
  it('RESTATE: сума змінилась і конверсію вивантажено', () => {
    expect(decideAmountAdjustment({ outcome: updated, ocBefore: exported, conversionValue: 250 })).toEqual({
      kind: 'restate', conversionAction: 'deal_offline', value: 250,
    })
  })
  it('pending / без змін / помилка → нічого', () => {
    expect(decideAmountAdjustment({ outcome: updated, ocBefore: pending, conversionValue: 250 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { ...updated, valueChanged: false }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { outcome: 'noop' }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
    expect(decideAmountAdjustment({ outcome: { outcome: 'error' }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
  })
})
