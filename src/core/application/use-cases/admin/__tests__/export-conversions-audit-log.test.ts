// makeConversionExportUseCases і makeAuditLogUseCases на фейкових портах: повторна та масова
// відправка конверсій/корекцій у Google Sheets, сторінка журналу дій.
import { describe, it, expect, vi } from 'vitest'
import { makeConversionExportUseCases } from '../export-conversions'
import { makeAuditLogUseCases } from '../audit-log'
import { dbOk, dbFail } from '../../../ports/common'

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

const LEAD = {
  id: 'l1',
  order_no: 1000001,
  email: 'a@b.c',
  phone: '+380501234567',
  gclid: 'g1',
  gbraid: null,
  wbraid: null,
  status: { conversion_action: 'deal_offline' },
}

const convRow = (over: Record<string, unknown> = {}) => ({
  id: 'oc1',
  export_status: 'pending' as const,
  conversion_value: '250.50',
  lead: LEAD,
  ...over,
})

const ADJ = {
  id: 'adj1',
  order_no: 1000001,
  conversion_action: 'deal_offline',
  adjustment_type: 'restate' as const,
  adjusted_value: '300' as unknown as number,
  adjustment_currency: 'UAH',
  adjustment_time: '2026-02-01T10:00:00.000Z',
}

const ADJ_INPUT = {
  orderNo: 1000001,
  conversionAction: 'deal_offline',
  adjustmentTime: '2026-02-01T10:00:00.000Z',
  type: 'restate',
  value: 300,
  currency: 'UAH',
}

function setup(over: { conversions?: Record<string, unknown>; adjustments?: Record<string, unknown>; sheets?: Record<string, unknown> } = {}) {
  const conversions = {
    getForExport: vi.fn(async () => dbOk(convRow())),
    listPendingForExport: vi.fn(async () => dbOk([convRow()])),
    listPage: vi.fn(async () => dbOk({ rows: [{ id: 'oc1' }], total: 11 })),
    countPending: vi.fn(async () => 3),
    ...over.conversions,
  }
  const adjustments = {
    get: vi.fn(async () => dbOk(ADJ)),
    listPending: vi.fn(async () => dbOk([ADJ])),
    listPage: vi.fn(async () => dbOk({ rows: [], total: 0 })),
    countPending: vi.fn(async () => 0),
    ...over.adjustments,
  }
  const sheets = {
    sendConversion: vi.fn(async () => true),
    sendAdjustment: vi.fn(async () => true),
    testConnection: vi.fn(),
    ...over.sheets,
  }
  const conversionFlow = {
    markConversionExportedByLead: vi.fn(async () => {}),
    markAdjustmentExported: vi.fn(async () => {}),
  }
  const deps = { conversions, adjustments, sheets, conversionFlow }
  return { uc: makeConversionExportUseCases(deps as never), conversions, adjustments, sheets, conversionFlow }
}

describe('resendConversion', () => {
  it('немає конверсії або ліда → not_found; помилка читання → failed', async () => {
    const none = setup({ conversions: { getForExport: vi.fn(async () => dbOk(null)) } })
    expect(await none.uc.resendConversion('oc-x')).toMatchObject({ ok: false, code: 'not_found' })
    const noLead = setup({ conversions: { getForExport: vi.fn(async () => dbOk(convRow({ lead: null }))) } })
    expect(await noLead.uc.resendConversion('oc1')).toMatchObject({ ok: false, code: 'not_found' })
    expect(noLead.sheets.sendConversion).not.toHaveBeenCalled()
    const failed = setup({ conversions: { getForExport: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.resendConversion('oc1')).toMatchObject({ ok: false, code: 'failed' })
  })

  it('відкликана (retracted) → invalid, у Sheets нічого не шлеться', async () => {
    const { uc, sheets, conversionFlow } = setup({ conversions: { getForExport: vi.fn(async () => dbOk(convRow({ export_status: 'retracted' }))) } })
    const r = await uc.resendConversion('oc1')
    expect(r).toMatchObject({ ok: false, code: 'invalid' })
    expect((r as { message: string }).message).toContain('RETRACT')
    expect(sheets.sendConversion).not.toHaveBeenCalled()
    expect(conversionFlow.markConversionExportedByLead).not.toHaveBeenCalled()
  })

  it('Sheets не налаштовано (false) → not_configured, статус не міняється', async () => {
    const { uc, conversionFlow } = setup({ sheets: { sendConversion: vi.fn(async () => false) } })
    expect(await uc.resendConversion('oc1')).toEqual({ ok: true, value: { kind: 'not_configured' } })
    expect(conversionFlow.markConversionExportedByLead).not.toHaveBeenCalled()
  })

  it('Sheets кинув помилку → send_failed з текстом, статус не міняється', async () => {
    quiet()
    const { uc, conversionFlow } = setup({ sheets: { sendConversion: vi.fn(async () => { throw new Error('quota') }) } })
    expect(await uc.resendConversion('oc1')).toEqual({ ok: true, value: { kind: 'send_failed', message: 'quota' } })
    expect(conversionFlow.markConversionExportedByLead).not.toHaveBeenCalled()
  })

  it('успіх → рядок зі ЗБЕРЕЖЕНИМ значенням конверсії і дією зі стадії; markConversionExportedByLead', async () => {
    const { uc, sheets, conversionFlow } = setup()
    expect(await uc.resendConversion('oc1')).toEqual({ ok: true, value: { kind: 'sent' } })
    expect(sheets.sendConversion).toHaveBeenCalledWith({
      lead_id: 'l1',
      order_no: 1000001,
      email: 'a@b.c',
      phone: '+380501234567',
      gclid: 'g1',
      gbraid: null,
      wbraid: null,
      conversionValue: 250.5,
      conversionAction: 'deal_offline',
    })
    expect(conversionFlow.markConversionExportedByLead).toHaveBeenCalledWith('l1')
  })

  it('exported-конверсія теж відправляється повторно (ручний resend не обмежений статусом exported)', async () => {
    const { uc } = setup({ conversions: { getForExport: vi.fn(async () => dbOk(convRow({ export_status: 'exported', conversion_value: null }))) } })
    expect(await uc.resendConversion('oc1')).toEqual({ ok: true, value: { kind: 'sent' } })
  })
})

describe('exportPendingConversions', () => {
  it('рахує sent / failed / skipped: без ліда → failed, throw → failed, false → skipped', async () => {
    quiet()
    const rows = [
      convRow({ id: 'a', lead: { ...LEAD, id: 'la' } }),
      convRow({ id: 'b', lead: null }),
      convRow({ id: 'c', lead: { ...LEAD, id: 'lc' } }),
      convRow({ id: 'd', lead: { ...LEAD, id: 'ld' } }),
    ]
    const sendConversion = vi.fn(async (input: { lead_id: string }) => {
      if (input.lead_id === 'lc') throw new Error('api')
      return input.lead_id !== 'ld'
    })
    const { uc, conversionFlow } = setup({ conversions: { listPendingForExport: vi.fn(async () => dbOk(rows)) }, sheets: { sendConversion } })
    expect(await uc.exportPendingConversions()).toEqual({ ok: true, value: { sent: 1, failed: 2, skipped: 1, total: 4 } })
    expect(conversionFlow.markConversionExportedByLead).toHaveBeenCalledTimes(1)
    expect(conversionFlow.markConversionExportedByLead).toHaveBeenCalledWith('la')
  })

  it('усі пропущені (Sheets не налаштовано) → invalid з details { ok: false }', async () => {
    const { uc } = setup({ sheets: { sendConversion: vi.fn(async () => false) } })
    expect(await uc.exportPendingConversions()).toEqual({
      ok: false,
      code: 'invalid',
      message: 'Google Sheets не налаштовано — нічого не вивантажено',
      details: { ok: false },
    })
  })

  it('порожня черга → ok з нулями; помилка читання → failed', async () => {
    const empty = setup({ conversions: { listPendingForExport: vi.fn(async () => dbOk([])) } })
    expect(await empty.uc.exportPendingConversions()).toEqual({ ok: true, value: { sent: 0, failed: 0, skipped: 0, total: 0 } })
    const failed = setup({ conversions: { listPendingForExport: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.exportPendingConversions()).toMatchObject({ ok: false, code: 'failed' })
  })
})

describe('resendAdjustment', () => {
  it('не знайдено → not_found; помилка читання → failed', async () => {
    const none = setup({ adjustments: { get: vi.fn(async () => dbOk(null)) } })
    expect(await none.uc.resendAdjustment('adj-x')).toMatchObject({ ok: false, code: 'not_found', message: 'Корекцію не знайдено' })
    const failed = setup({ adjustments: { get: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.resendAdjustment('adj1')).toMatchObject({ ok: false, code: 'failed' })
  })

  it('false → not_configured; throw → send_failed; статус не міняється', async () => {
    quiet()
    const off = setup({ sheets: { sendAdjustment: vi.fn(async () => false) } })
    expect(await off.uc.resendAdjustment('adj1')).toEqual({ ok: true, value: { kind: 'not_configured' } })
    expect(off.conversionFlow.markAdjustmentExported).not.toHaveBeenCalled()
    const thrown = setup({ sheets: { sendAdjustment: vi.fn(async () => { throw 'plain string' }) } })
    expect(await thrown.uc.resendAdjustment('adj1')).toEqual({ ok: true, value: { kind: 'send_failed', message: 'plain string' } })
    expect(thrown.conversionFlow.markAdjustmentExported).not.toHaveBeenCalled()
  })

  it('успіх → sendAdjustment із приведеним рядком (value → Number) + markAdjustmentExported(id)', async () => {
    const { uc, sheets, conversionFlow } = setup()
    expect(await uc.resendAdjustment('adj1')).toEqual({ ok: true, value: { kind: 'sent' } })
    expect(sheets.sendAdjustment).toHaveBeenCalledWith(ADJ_INPUT)
    expect(conversionFlow.markAdjustmentExported).toHaveBeenCalledWith('adj1')
  })

  it('adjusted_value null → value null (RETRACT без суми)', async () => {
    const { uc, sheets } = setup({ adjustments: { get: vi.fn(async () => dbOk({ ...ADJ, adjustment_type: 'retract', adjusted_value: null, adjustment_currency: null })) } })
    await uc.resendAdjustment('adj1')
    expect(sheets.sendAdjustment).toHaveBeenCalledWith({ ...ADJ_INPUT, type: 'retract', value: null, currency: null })
  })
})

describe('exportPendingAdjustments', () => {
  it('рахує sent / failed / skipped', async () => {
    quiet()
    const rows = [{ ...ADJ, id: 'a' }, { ...ADJ, id: 'b' }, { ...ADJ, id: 'c' }]
    let n = 0
    const sendAdjustment = vi.fn(async () => {
      n += 1
      if (n === 2) throw new Error('api')
      return n !== 3
    })
    const { uc, conversionFlow } = setup({ adjustments: { listPending: vi.fn(async () => dbOk(rows)) }, sheets: { sendAdjustment } })
    expect(await uc.exportPendingAdjustments()).toEqual({ ok: true, value: { sent: 1, failed: 1, skipped: 1, total: 3 } })
    expect(conversionFlow.markAdjustmentExported).toHaveBeenCalledTimes(1)
    expect(conversionFlow.markAdjustmentExported).toHaveBeenCalledWith('a')
  })

  it('усі пропущені → invalid з details { ok: false }; помилка читання → failed', async () => {
    const off = setup({ sheets: { sendAdjustment: vi.fn(async () => false) } })
    expect(await off.uc.exportPendingAdjustments()).toEqual({
      ok: false,
      code: 'invalid',
      message: 'Таблицю корекцій не налаштовано — нічого не вивантажено',
      details: { ok: false },
    })
    const failed = setup({ adjustments: { listPending: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.exportPendingAdjustments()).toMatchObject({ ok: false, code: 'failed' })
  })
})

describe('listConversions / listAdjustments', () => {
  it('сторінка + мета + pendingTotal; помилка → failed', async () => {
    quiet()
    const { uc } = setup()
    expect(await uc.listConversions(2, 5)).toEqual({
      ok: true,
      value: { data: [{ id: 'oc1' }], total: 11, page: 2, limit: 5, totalPages: 3, pendingTotal: 3 },
    })
    expect(await uc.listAdjustments(1, 50)).toEqual({ ok: true, value: { data: [], total: 0, page: 1, limit: 50, totalPages: 0, pendingTotal: 0 } })
    const failed = setup({ conversions: { listPage: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.listConversions(1, 50)).toMatchObject({ ok: false, code: 'failed' })
  })
})

// ── Журнал дій ───────────────────────────────────────────────────────────────

function setupAudit(over: Record<string, unknown> = {}) {
  const audit = {
    insert: vi.fn(async () => dbOk(undefined)),
    listPage: vi.fn(async () => dbOk({ rows: [{ id: 'a1' }], total: 250 })),
    ...over,
  }
  return { uc: makeAuditLogUseCases({ audit } as never), audit }
}

const query = (params: Record<string, string>) => (k: string) => params[k] ?? null

describe('listAuditLog', () => {
  it('без параметрів → page 1, limit 50', async () => {
    const { uc, audit } = setupAudit()
    const r = await uc.listAuditLog(query({}))
    expect(audit.listPage).toHaveBeenCalledWith(1, 50)
    expect(r).toEqual({ ok: true, value: { data: [{ id: 'a1' }], total: 250, page: 1, limit: 50, totalPages: 5 } })
  })

  it('limit обмежується зверху 100, знизу 1; limit=0 і нечислове → дефолт 50 (спостереження: 0 → 50, а не 1)', async () => {
    const { uc, audit } = setupAudit()
    await uc.listAuditLog(query({ limit: '500' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 100)
    await uc.listAuditLog(query({ limit: '-5' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 1)
    await uc.listAuditLog(query({ limit: '0' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 50)
    await uc.listAuditLog(query({ limit: 'abc' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 50)
  })

  it('page нечислове або < 1 → 1; page=3 → 3', async () => {
    const { uc, audit } = setupAudit()
    await uc.listAuditLog(query({ page: 'x' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 50)
    await uc.listAuditLog(query({ page: '0' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 50)
    await uc.listAuditLog(query({ page: '-2' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(1, 50)
    await uc.listAuditLog(query({ page: '3', limit: '20' }))
    expect(audit.listPage).toHaveBeenLastCalledWith(3, 20)
  })

  it('помилка БД → failed', async () => {
    quiet()
    const { uc } = setupAudit({ listPage: vi.fn(async () => dbFail('boom')) })
    expect(await uc.listAuditLog(query({}))).toMatchObject({ ok: false, code: 'failed', message: 'boom' })
  })
})
