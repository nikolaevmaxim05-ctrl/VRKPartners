// conversion-flow на фейковых портах: доставка корректировок (await send → exported только при sent),
// guard от дубля RETRACT, запись/обновление конверсии.
import { describe, it, expect, vi } from 'vitest'
import { makeConversionFlow } from '../conversion-flow'
import type { AdjustmentRow, ConversionSheetExporter } from '../../../ports/conversions'
import { dbOk } from '../../../ports/common'

const NOW = new Date('2026-02-01T10:00:00.000Z')

function setup(over: Partial<Record<string, unknown>> = {}) {
  const conversions = {
    getStateByLead: vi.fn(async () => dbOk(null)),
    getByLead: vi.fn(async () => dbOk(null)),
    insert: vi.fn(async () => dbOk(undefined)),
    updateState: vi.fn(async () => dbOk(undefined)),
    markExportedByLead: vi.fn(async () => dbOk(undefined)),
    markPendingByLead: vi.fn(async () => dbOk(undefined)),
    markRetractedByLead: vi.fn(async () => dbOk(undefined)),
    getExportedAt: vi.fn(async () => null as string | null),
    listPage: vi.fn(),
    countPending: vi.fn(),
    getForExport: vi.fn(),
    listPendingForExport: vi.fn(),
    ...(over.conversions as object),
  }
  const adjustments = {
    lastRetractTime: vi.fn(async () => null as string | null),
    insert: vi.fn(async (row: Omit<AdjustmentRow, 'id'>) => dbOk({ id: 'adj-new', ...row } as AdjustmentRow)),
    markExported: vi.fn(async () => dbOk(undefined)),
    listPage: vi.fn(),
    countPending: vi.fn(),
    get: vi.fn(),
    listPending: vi.fn(),
    ...(over.adjustments as object),
  }
  const sheets: ConversionSheetExporter = {
    sendConversion: vi.fn(async () => true),
    sendAdjustment: vi.fn(async () => true),
    testConnection: vi.fn(),
    ...(over.sheets as object),
  }
  const settings = {
    get: vi.fn(async (k: string) => (k === 'internal_currency' ? 'UAH' : 'Lead')),
    getMany: vi.fn(),
    listAll: vi.fn(),
    upsertMany: vi.fn(),
  }
  const leads = { getClickIds: vi.fn(async () => dbOk({ gclid: 'g1', gbraid: null, wbraid: null })) }
  const flow = makeConversionFlow({
    conversions,
    adjustments,
    sheets,
    settings,
    leads: leads as never,
    clock: { now: () => NOW },
  } as never)
  return { flow, conversions, adjustments, sheets, settings, leads }
}

const row: AdjustmentRow = {
  id: 'adj-1',
  lead_id: 'lead-1',
  order_no: 204,
  conversion_action: 'Target Lead',
  adjustment_type: 'retract',
  adjusted_value: null,
  adjustment_currency: null,
  adjustment_time: '2026-01-15T08:30:00.000Z',
}

describe('recordAdjustment: после RETRACT конверсия становится retracted (не в очереди массовой выгрузки)', () => {
  it('retract → markRetractedByLead (не pending); restate → нет', async () => {
    const { flow, conversions } = setup()
    await flow.recordAdjustment({ leadId: 'l1', orderNo: 1, conversionAction: 'a', type: 'retract' })
    expect(conversions.markRetractedByLead).toHaveBeenCalledWith('l1')
    expect(conversions.markPendingByLead).not.toHaveBeenCalled()
    await flow.recordAdjustment({ leadId: 'l1', orderNo: 1, conversionAction: 'a', type: 'restate', value: 5 })
    expect(conversions.markRetractedByLead).toHaveBeenCalledTimes(1)
  })

  it('markConversionPendingByLead возвращает конверсию в очередь', async () => {
    const { flow, conversions } = setup()
    await flow.markConversionPendingByLead('l1')
    expect(conversions.markPendingByLead).toHaveBeenCalledWith('l1')
  })
})

describe('dispatchAdjustment', () => {
  it('sent === true → exported (await до завершения)', async () => {
    const { flow, sheets, adjustments } = setup()
    await flow.dispatchAdjustment(row)
    expect(sheets.sendAdjustment).toHaveBeenCalledWith({
      orderNo: 204,
      conversionAction: 'Target Lead',
      adjustmentTime: '2026-01-15T08:30:00.000Z',
      type: 'retract',
      value: null,
      currency: null,
    })
    expect(adjustments.markExported).toHaveBeenCalledWith('adj-1', NOW.toISOString())
  })

  it('sent === false (Sheets не настроен) → export_status не трогаем', async () => {
    const { flow, adjustments } = setup({ sheets: { sendAdjustment: vi.fn(async () => false) } })
    await flow.dispatchAdjustment(row)
    expect(adjustments.markExported).not.toHaveBeenCalled()
  })

  it('send бросает → ошибка не пробрасывается, exported не ставится', async () => {
    const { flow, adjustments } = setup({ sheets: { sendAdjustment: vi.fn(async () => { throw new Error('Sheets API error: 500') }) } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(flow.dispatchAdjustment(row)).resolves.toBeUndefined()
    expect(adjustments.markExported).not.toHaveBeenCalled()
  })
})

describe('recordAdjustment', () => {
  it('RETRACT глушится, если после предыдущего не было нового экспорта', async () => {
    const { flow, adjustments } = setup({
      adjustments: { lastRetractTime: vi.fn(async () => '2026-01-20T00:00:00Z') },
      conversions: { getExportedAt: vi.fn(async () => '2026-01-10T00:00:00Z') },
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await flow.recordAdjustment({ leadId: 'l', orderNo: 1, conversionAction: 'A', type: 'retract' })).toBeNull()
    expect(adjustments.insert).not.toHaveBeenCalled()
  })

  it('RESTATE без валюты берёт internal_currency', async () => {
    const { flow, adjustments } = setup()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await flow.recordAdjustment({ leadId: 'l', orderNo: 1, conversionAction: 'A', type: 'restate', value: 700 })
    expect(adjustments.insert).toHaveBeenCalledWith(
      expect.objectContaining({ adjustment_type: 'restate', adjusted_value: 700, adjustment_currency: 'UAH' }),
    )
  })
})

describe('recordConversion', () => {
  it('нет конверсии → inserted с click-id и действием из стадии', async () => {
    const { flow, conversions } = setup()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await flow.recordConversion('l', 100, 'purchase', 'deal')).toEqual({ outcome: 'inserted' })
    expect(conversions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'l', gclid: 'g1', conversion_action: 'purchase', conversion_value: 100, conversion_currency: 'UAH', conversion_type: 'deal' }),
    )
  })

  it('то же состояние → noop; изменённая сумма → updated с valueChanged', async () => {
    const existing = { id: 'oc', conversion_action: 'purchase', conversion_type: 'deal', conversion_value: '100' }
    const { flow, conversions } = setup({ conversions: { getStateByLead: vi.fn(async () => dbOk(existing)) } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await flow.recordConversion('l', 100, 'purchase', 'deal')).toEqual({ outcome: 'noop' })
    const r = await flow.recordConversion('l', 150, 'purchase', 'deal')
    expect(r).toMatchObject({ outcome: 'updated', action: 'purchase', prevAction: 'purchase', prevValue: 100, valueChanged: true })
    expect(conversions.updateState).toHaveBeenCalledWith('l', { conversion_action: 'purchase', conversion_type: 'deal', conversion_value: 150 })
  })
})
