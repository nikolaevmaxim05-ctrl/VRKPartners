import { describe, it, expect } from 'vitest'
import { planStagePatch, planNewStage, STAGE_ERRORS, type StageCurrent } from '../stage-rules'

const base: StageCurrent = {
  id: 's1',
  is_initial: false,
  conversion_type: null,
  conversion_action: null,
  requires_amount: false,
}

describe('planNewStage', () => {
  it('валидная простая стадия', () => {
    const r = planNewStage({ name: '  Нова ', color: '#112233' })
    expect(r).toEqual({
      ok: true,
      values: {
        name: 'Нова', color: '#112233', is_final: false, is_initial: false,
        conversion_type: null, conversion_action: null, requires_amount: false, amount_is_profit: false,
      },
    })
  })

  it('название и цвет', () => {
    expect(planNewStage({ name: '' })).toEqual({ ok: false, error: STAGE_ERRORS.name })
    expect(planNewStage({ name: 'x'.repeat(65) })).toEqual({ ok: false, error: STAGE_ERRORS.name })
    expect(planNewStage({ name: 'ok', color: 'red' })).toEqual({ ok: false, error: STAGE_ERRORS.color })
  })

  it('конверсионная стадия обязательно имеет conversion_action и становится is_final', () => {
    expect(planNewStage({ name: 'Угода', conversion_type: 'deal' })).toEqual({ ok: false, error: STAGE_ERRORS.conversionActionRequired })
    const r = planNewStage({ name: 'Угода', conversion_type: 'deal', conversion_action: 'purchase', requires_amount: true, amount_is_profit: true })
    expect(r.ok && r.values).toMatchObject({ is_final: true, requires_amount: true, amount_is_profit: true })
  })

  it('requires_amount только для deal/deal_adjustment; amount_is_profit только с requires_amount', () => {
    expect(planNewStage({ name: 'Ц', conversion_type: 'target_lead', conversion_action: 'lead', requires_amount: true }))
      .toEqual({ ok: false, error: STAGE_ERRORS.requiresAmount })
    const r = planNewStage({ name: 'Ц', conversion_type: 'target_lead', conversion_action: 'lead', amount_is_profit: true })
    expect(r.ok && r.values.amount_is_profit).toBe(false)
  })

  it('неизвестный conversion_type и formula-injection в conversion_action', () => {
    expect(planNewStage({ name: 'x', conversion_type: 'weird' as never })).toEqual({ ok: false, error: STAGE_ERRORS.conversionType })
    const r = planNewStage({ name: 'x', conversion_type: 'deal', conversion_action: '=SUM(A1)' })
    expect(r.ok).toBe(false)
  })
})

describe('planStagePatch', () => {
  it('пустой body → пустой update, initial=keep', () => {
    expect(planStagePatch({}, base)).toEqual({ ok: true, update: {}, initial: 'keep' })
  })

  it('conversion_type ⇒ is_final=true; сброс типа снимает is_final, если is_final не передан', () => {
    const r1 = planStagePatch({ conversion_type: 'deal', conversion_action: 'purchase' }, base)
    expect(r1.ok && r1.update).toMatchObject({ conversion_type: 'deal', is_final: true })
    const r2 = planStagePatch({ conversion_type: null }, { ...base, conversion_type: 'deal', conversion_action: 'p' })
    expect(r2.ok && r2.update).toMatchObject({ conversion_type: null, is_final: false })
    // явный is_final=false при конверсии игнорируется (инвариант)
    const r3 = planStagePatch({ is_final: false }, { ...base, conversion_type: 'deal', conversion_action: 'p' })
    expect(r3.ok && r3.update).toMatchObject({ is_final: true })
  })

  it('conversion_action обязателен при эффективном conversion_type', () => {
    expect(planStagePatch({ conversion_type: 'deal' }, base)).toEqual({ ok: false, error: STAGE_ERRORS.conversionActionRequired })
    expect(planStagePatch({ conversion_action: '  ' }, { ...base, conversion_type: 'deal', conversion_action: 'p' }))
      .toEqual({ ok: false, error: STAGE_ERRORS.conversionActionRequired })
  })

  it('requires_amount: запрет для non-amount типов и автосброс при смене типа', () => {
    expect(planStagePatch({ requires_amount: true }, base)).toEqual({ ok: false, error: STAGE_ERRORS.requiresAmount })
    const r = planStagePatch({ conversion_type: 'target_lead', conversion_action: 'lead' }, { ...base, conversion_type: 'deal', conversion_action: 'p', requires_amount: true })
    expect(r.ok && r.update).toMatchObject({ requires_amount: false, amount_is_profit: false })
    const r2 = planStagePatch({ requires_amount: false }, { ...base, conversion_type: 'deal', conversion_action: 'p', requires_amount: true })
    expect(r2.ok && r2.update).toMatchObject({ requires_amount: false, amount_is_profit: false })
  })

  it('amount_is_profit только когда requires_amount=true (эффективно)', () => {
    expect(planStagePatch({ amount_is_profit: true }, { ...base, conversion_type: 'deal', conversion_action: 'p' }))
      .toEqual({ ok: false, error: STAGE_ERRORS.amountIsProfit })
    const r = planStagePatch({ requires_amount: true, amount_is_profit: true }, { ...base, conversion_type: 'deal', conversion_action: 'p' })
    expect(r.ok && r.update).toMatchObject({ requires_amount: true, amount_is_profit: true })
  })

  it('allowed_prev_status_ids: только UUID, без дублей; allowed_next — строки', () => {
    const u = '11111111-2222-4333-8444-555555555555'
    const r = planStagePatch({ allowed_prev_status_ids: [u, u], allowed_next_status_ids: ['x', 'y'] }, base)
    expect(r.ok && r.update).toEqual({ allowed_prev_status_ids: [u], allowed_next_status_ids: ['x', 'y'] })
    expect(planStagePatch({ allowed_prev_status_ids: ['nope'] }, base)).toEqual({ ok: false, error: STAGE_ERRORS.prevIdsUuid })
    expect(planStagePatch({ allowed_next_status_ids: 'x' as never }, base)).toEqual({ ok: false, error: STAGE_ERRORS.nextIdsArray })
  })

  it('is_initial → set/unset', () => {
    expect(planStagePatch({ is_initial: true }, base)).toMatchObject({ ok: true, initial: 'set' })
    expect(planStagePatch({ is_initial: false }, base)).toMatchObject({ ok: true, initial: 'unset' })
  })

  it('position: floor, неотрицательное', () => {
    expect(planStagePatch({ position: 3.7 }, base)).toMatchObject({ ok: true, update: { position: 3 } })
    expect(planStagePatch({ position: -1 }, base)).toEqual({ ok: false, error: STAGE_ERRORS.position })
  })
})
