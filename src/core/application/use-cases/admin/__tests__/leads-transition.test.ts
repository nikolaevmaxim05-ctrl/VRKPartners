// updateLead на фейковых портах — раздел 6: enter / leave / amount и корректировки RETRACT / RESTATE.
import { describe, it, expect, vi } from 'vitest'
import { makeLeadUseCases } from '../leads'
import { dbOk } from '../../../ports/common'

const DEAL = { id: 'st-deal', name: 'Угода', is_final: true, conversion_type: 'deal' as const, conversion_action: 'deal_offline', requires_amount: true, amount_is_profit: false }
const WORK = { id: 'st-work', name: 'В роботі', is_final: false, conversion_type: null, conversion_action: null, requires_amount: false, amount_is_profit: false }
const STATUSES = [DEAL, WORK]
const actor = { id: 'u1', email: 'a@b.c' }

function setup(opts: { before: { status_id: string | null; deal_amount: number | null }; oc?: { export_status: 'pending' | 'exported' | 'retracted' } | null; noop?: boolean }) {
  const before = { status_id: opts.before.status_id, assigned_to: null, deal_amount: opts.before.deal_amount, deal_profit: null }
  const leads = {
    getState: vi.fn(async () => dbOk(before)),
    update: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
      const statusId = ('status_id' in patch ? (patch.status_id as string | null) : before.status_id) ?? null
      const status = STATUSES.find((s) => s.id === statusId) ?? null
      return dbOk({ id: 'l1', order_no: 1000001, email: null, phone: '+380501234567', gclid: 'g', gbraid: null, wbraid: null, assigned_to: null, deal_amount: 'deal_amount' in patch ? patch.deal_amount : before.deal_amount, deal_profit: null, status_id: statusId, status })
    }),
    delete: vi.fn(),
  }
  const oc = opts.oc === undefined ? null : opts.oc ? { id: 'oc1', export_status: opts.oc.export_status, conversion_action: 'deal_offline', conversion_type: 'deal', conversion_value: 100 } : null
  const conversionFlow = {
    getConversionByLead: vi.fn(async () => oc),
    recordConversion: vi.fn(async (_id: string, value: number | null) =>
      opts.noop
        ? { outcome: 'noop' as const }
        : oc
          ? { outcome: 'updated' as const, action: 'deal_offline', prevAction: 'deal_offline', prevType: 'deal', prevValue: 100, valueChanged: value !== 100 }
          : { outcome: 'inserted' as const },
    ),
    recordAdjustment: vi.fn(async (p: { type: string }) => ({ id: 'adj', lead_id: 'l1', order_no: 1000001, conversion_action: 'deal_offline', adjustment_type: p.type, adjusted_value: null, adjustment_currency: null, adjustment_time: 'now' })),
    dispatchAdjustment: vi.fn(async () => {}),
    markConversionExportedByLead: vi.fn(async () => {}),
    markConversionPendingByLead: vi.fn(async () => {}),
  }
  const sheets = { sendConversion: vi.fn(async () => true) }
  const deps = {
    leads,
    statuses: { getForTransition: vi.fn(async (ids: string[]) => STATUSES.filter((s) => ids.includes(s.id))) },
    comments: { insertMany: vi.fn(async () => dbOk(undefined)) },
    history: { insert: vi.fn(async () => dbOk(undefined)) },
    customFields: {},
    users: { getDisplayLabel: vi.fn(async () => 'x') },
    conversionFlow,
    sheets,
    audit: { record: vi.fn(async () => {}) },
  }
  return { uc: makeLeadUseCases(deps as never), conversionFlow, sheets, leads, audit: deps.audit }
}

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('updateLead — розділ 6', () => {
  it('enter: перехід на угоду → конверсія записана і рядок пішов у Sheets; audit lead.update', async () => {
    quiet()
    const { uc, conversionFlow, sheets, audit } = setup({ before: { status_id: 'st-work', deal_amount: 500 } })
    const r = await uc.updateLead('l1', { status_id: 'st-deal' }, actor)
    expect(r.ok).toBe(true)
    expect(conversionFlow.recordConversion).toHaveBeenCalledWith('l1', 500, 'deal_offline', 'deal')
    expect(sheets.sendConversion).toHaveBeenCalledOnce()
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
    expect(audit.record).toHaveBeenCalledWith(actor, 'lead.update', 'leads/l1', expect.objectContaining({ new: { status_id: 'st-deal' } }))
  })

  it('leave: з угоди на «В роботі», конверсію вивантажено → RETRACT і відправка корекції', async () => {
    quiet()
    const { uc, conversionFlow, sheets } = setup({ before: { status_id: 'st-deal', deal_amount: 500 }, oc: { export_status: 'exported' } })
    const r = await uc.updateLead('l1', { status_id: 'st-work' }, actor)
    expect(r.ok).toBe(true)
    expect(conversionFlow.recordAdjustment).toHaveBeenCalledWith(expect.objectContaining({ type: 'retract', conversionAction: 'deal_offline', offlineConversionId: 'oc1' }))
    expect(conversionFlow.dispatchAdjustment).toHaveBeenCalledOnce()
    expect(conversionFlow.recordConversion).not.toHaveBeenCalled()
    expect(sheets.sendConversion).not.toHaveBeenCalled()
  })

  it('enter повторно після RETRACT (стан той самий, конверсія pending) → рядок відправляється заново', async () => {
    quiet()
    const { uc, conversionFlow, sheets } = setup({ before: { status_id: 'st-work', deal_amount: 100 }, oc: { export_status: 'pending' }, noop: true })
    await uc.updateLead('l1', { status_id: 'st-deal' }, actor)
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
    expect(sheets.sendConversion).toHaveBeenCalledOnce()
    const exported = setup({ before: { status_id: 'st-work', deal_amount: 100 }, oc: { export_status: 'exported' }, noop: true })
    await exported.uc.updateLead('l1', { status_id: 'st-deal' }, actor)
    expect(exported.sheets.sendConversion).not.toHaveBeenCalled()
  })

  it('enter повторно після RETRACT (стан той самий, конверсія retracted) → повертається в pending і відправляється заново', async () => {
    quiet()
    const { uc, conversionFlow, sheets } = setup({ before: { status_id: 'st-work', deal_amount: 100 }, oc: { export_status: 'retracted' }, noop: true })
    const r = await uc.updateLead('l1', { status_id: 'st-deal' }, actor)
    expect(r.ok).toBe(true)
    expect(conversionFlow.markConversionPendingByLead).toHaveBeenCalledWith('l1')
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
    expect(sheets.sendConversion).toHaveBeenCalledTimes(1)
    expect(conversionFlow.markConversionExportedByLead).toHaveBeenCalledWith('l1')
  })

  it('leave: конверсія retracted → повторного RETRACT немає', async () => {
    quiet()
    const { uc, conversionFlow } = setup({ before: { status_id: 'st-deal', deal_amount: 500 }, oc: { export_status: 'retracted' } })
    const r = await uc.updateLead('l1', { status_id: 'st-work' }, actor)
    expect(r.ok).toBe(true)
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
  })

  it('leave: конверсія ще pending → нічого не відкликаємо', async () => {
    quiet()
    const { uc, conversionFlow } = setup({ before: { status_id: 'st-deal', deal_amount: 500 }, oc: { export_status: 'pending' } })
    await uc.updateLead('l1', { status_id: 'st-work' }, actor)
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
  })

  it('amount: та сама угода, сума змінилась, вивантажено → стан оновлено + RESTATE, без нового рядка', async () => {
    quiet()
    const { uc, conversionFlow, sheets } = setup({ before: { status_id: 'st-deal', deal_amount: 100 }, oc: { export_status: 'exported' } })
    const r = await uc.updateLead('l1', { deal_amount: 250 }, actor)
    expect(r.ok).toBe(true)
    expect(conversionFlow.recordConversion).toHaveBeenCalledWith('l1', 250, 'deal_offline', 'deal')
    expect(conversionFlow.recordAdjustment).toHaveBeenCalledWith(expect.objectContaining({ type: 'restate', value: 250 }))
    expect(sheets.sendConversion).not.toHaveBeenCalled()
  })

  it('amount: конверсія ще pending → без RESTATE, оновлений рядок іде у Sheets', async () => {
    quiet()
    const { uc, conversionFlow, sheets } = setup({ before: { status_id: 'st-deal', deal_amount: 100 }, oc: { export_status: 'pending' } })
    await uc.updateLead('l1', { deal_amount: 250 }, actor)
    expect(conversionFlow.recordAdjustment).not.toHaveBeenCalled()
    expect(sheets.sendConversion).toHaveBeenCalledOnce()
  })

  it('none: сума та сама або стадія без суми → конверсію не чіпаємо', async () => {
    quiet()
    const { uc, conversionFlow } = setup({ before: { status_id: 'st-deal', deal_amount: 100 }, oc: { export_status: 'exported' } })
    await uc.updateLead('l1', { deal_amount: 100 }, actor)
    expect(conversionFlow.recordConversion).not.toHaveBeenCalled()
    const other = setup({ before: { status_id: 'st-work', deal_amount: null } })
    await other.uc.updateLead('l1', { assigned_to: 'u2' }, actor)
    expect(other.conversionFlow.recordConversion).not.toHaveBeenCalled()
    expect(other.conversionFlow.getConversionByLead).not.toHaveBeenCalled()
  })
})
