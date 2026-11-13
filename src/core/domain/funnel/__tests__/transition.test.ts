import { describe, it, expect } from 'vitest'
import {
  planDealClearing,
  resolveConversionValue,
  isConversionStage,
  decideAdjustment,
  conversionStateChanged,
} from '../transition'
import { shouldSuppressRetract, normalizeAdjustmentValue } from '../adjustments'
import { toGoogleAdsTime } from '../google-ads-time'

describe('planDealClearing', () => {
  const before = { deal_amount: 100, deal_profit: 20 }
  it('deal → без сделки: обнуляет сумму и прибыль, если не переданы явно', () => {
    const r = planDealClearing({ before, bodyKeys: new Set(['status_id']), oldConversionType: 'deal', newConversionType: null })
    expect(r).toEqual({ update: { deal_amount: null, deal_profit: null }, cleared: true })
  })
  it('явно переданные поля не трогает', () => {
    const r = planDealClearing({ before, bodyKeys: new Set(['status_id', 'deal_amount']), oldConversionType: 'deal', newConversionType: 'target_lead' })
    expect(r).toEqual({ update: { deal_profit: null }, cleared: true })
  })
  it('deal → deal_adjustment: ничего не обнуляет', () => {
    expect(planDealClearing({ before, bodyKeys: new Set(), oldConversionType: 'deal', newConversionType: 'deal_adjustment' }))
      .toEqual({ update: {}, cleared: false })
  })
  it('не было сделки — ничего', () => {
    expect(planDealClearing({ before, bodyKeys: new Set(), oldConversionType: 'target_lead', newConversionType: null }))
      .toEqual({ update: {}, cleared: false })
  })
  it('суммы уже пустые → cleared=false', () => {
    expect(planDealClearing({ before: { deal_amount: null, deal_profit: null }, bodyKeys: new Set(), oldConversionType: 'deal', newConversionType: null }))
      .toEqual({ update: {}, cleared: false })
  })
})

describe('resolveConversionValue', () => {
  const lead = { deal_amount: '150.5', deal_profit: 40 }
  it('без requires_amount → null', () => {
    expect(resolveConversionValue({ requires_amount: false, conversion_type: 'deal' }, lead)).toBeNull()
  })
  it('deal → сумма; deal_adjustment → прибыль', () => {
    expect(resolveConversionValue({ requires_amount: true, conversion_type: 'deal' }, lead)).toBe(150.5)
    expect(resolveConversionValue({ requires_amount: true, conversion_type: 'deal_adjustment' }, lead)).toBe(40)
    expect(resolveConversionValue({ requires_amount: true, conversion_type: 'deal' }, { deal_amount: null, deal_profit: 1 })).toBeNull()
  })
})

describe('isConversionStage', () => {
  it('is_final + conversion_type', () => {
    expect(isConversionStage({ is_final: true, conversion_type: 'deal' })).toBe(true)
    expect(isConversionStage({ is_final: true, conversion_type: null })).toBe(false)
    expect(isConversionStage({ is_final: false, conversion_type: 'deal' })).toBe(false)
    expect(isConversionStage(null)).toBe(false)
  })
})

describe('decideAdjustment', () => {
  const exported = { id: 'oc', export_status: 'exported' as const, conversion_action: 'lead_offline' }
  const pending = { ...exported, export_status: 'pending' as const }
  const updated = (over: Partial<{ action: string; prevAction: string; valueChanged: boolean }> = {}) => ({
    outcome: 'updated' as const, action: 'purchase', prevAction: 'purchase', prevType: 'deal', prevValue: 100, valueChanged: false, ...over,
  })

  it('целевой → нецелевой: RETRACT только если оригинал exported', () => {
    expect(decideAdjustment({ oldConversionType: 'target_lead', newConversionType: 'non_target_lead', outcome: updated({ action: 'nt', prevAction: 'lead_offline' }), ocBefore: exported, conversionValue: null }))
      .toEqual({ kind: 'retract', conversionAction: 'lead_offline', offlineConversionId: 'oc' })
    expect(decideAdjustment({ oldConversionType: 'target_lead', newConversionType: 'non_target_lead', outcome: updated({ action: 'nt', prevAction: 'lead_offline' }), ocBefore: pending, conversionValue: null }))
      .toEqual({ kind: 'none' })
  })

  it('целевой лид → сделка: RETRACT старой (exported)', () => {
    expect(decideAdjustment({ oldConversionType: 'target_lead', newConversionType: 'deal', outcome: updated({ prevAction: 'lead_offline' }), ocBefore: exported, conversionValue: 500 }))
      .toEqual({ kind: 'retract', conversionAction: 'lead_offline', offlineConversionId: 'oc' })
  })

  it('та же сделка, изменилась сумма → RESTATE с новым итогом', () => {
    expect(decideAdjustment({ oldConversionType: 'deal', newConversionType: 'deal', outcome: updated({ valueChanged: true }), ocBefore: exported, conversionValue: 700 }))
      .toEqual({ kind: 'restate', conversionAction: 'purchase', value: 700 })
  })

  it('первая конверсия (inserted) или noop → ничего', () => {
    expect(decideAdjustment({ oldConversionType: null, newConversionType: 'target_lead', outcome: { outcome: 'inserted' }, ocBefore: null, conversionValue: null })).toEqual({ kind: 'none' })
    expect(decideAdjustment({ oldConversionType: 'deal', newConversionType: 'deal', outcome: { outcome: 'noop' }, ocBefore: exported, conversionValue: 100 })).toEqual({ kind: 'none' })
  })

  it('изменение суммы без amount-типа → ничего', () => {
    expect(decideAdjustment({ oldConversionType: 'target_lead', newConversionType: 'target_lead', outcome: updated({ valueChanged: true }), ocBefore: exported, conversionValue: null })).toEqual({ kind: 'none' })
  })
})

describe('conversionStateChanged', () => {
  it('сравнивает действие, тип и сумму (численно)', () => {
    const ex = { conversion_action: 'a', conversion_type: 'deal', conversion_value: '100' }
    expect(conversionStateChanged(ex, { action: 'a', type: 'deal', value: 100 })).toEqual({ changed: false, valueChanged: false })
    expect(conversionStateChanged(ex, { action: 'a', type: 'deal', value: 101 })).toEqual({ changed: true, valueChanged: true })
    expect(conversionStateChanged(ex, { action: 'b', type: 'deal', value: 100 })).toEqual({ changed: true, valueChanged: false })
    expect(conversionStateChanged({ ...ex, conversion_type: null }, { action: 'a', type: null, value: 100 })).toEqual({ changed: false, valueChanged: false })
  })
})

describe('adjustments rules', () => {
  it('shouldSuppressRetract: без предыдущего retract — не глушим; после реэкспорта — разрешено', () => {
    expect(shouldSuppressRetract(null, '2026-01-02T00:00:00Z')).toBe(false)
    expect(shouldSuppressRetract('2026-01-05T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(true)
    expect(shouldSuppressRetract('2026-01-05T00:00:00Z', null)).toBe(true)
    expect(shouldSuppressRetract('2026-01-05T00:00:00Z', '2026-01-06T00:00:00Z')).toBe(false)
  })
  it('normalizeAdjustmentValue: retract без суммы/валюты', () => {
    expect(normalizeAdjustmentValue('retract', 10, 'UAH')).toEqual({ value: null, currency: null })
    expect(normalizeAdjustmentValue('restate', 10, undefined)).toEqual({ value: 10, currency: null })
  })
})

describe('toGoogleAdsTime', () => {
  it('Kyiv-время со смещением', () => {
    expect(toGoogleAdsTime('2026-01-15T08:30:00Z')).toBe('2026-01-15 10:30:00+02:00')
    expect(toGoogleAdsTime('2026-07-15T08:30:00Z')).toBe('2026-07-15 11:30:00+03:00')
  })
})
