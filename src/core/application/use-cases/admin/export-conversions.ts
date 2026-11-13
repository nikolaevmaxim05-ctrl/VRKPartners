// use-cases/admin/export-conversions — списки офлайн-конверсий и корректировок, повторная и массовая
// отправка в Google Sheets.
import { ok, fail, type Result } from '../../result'
import type {
  ConversionRepository,
  AdjustmentRepository,
  ConversionSheetExporter,
  AdjustmentExportRow,
} from '../../ports/conversions'
import type { ConversionFlow } from './conversion-flow'
import { pageMeta } from '../../paging'

export type ResendOutcome = { kind: 'sent' } | { kind: 'not_configured' } | { kind: 'send_failed'; message: string }

export type BulkExportCounts = { sent: number; failed: number; skipped: number; total: number }

const toAdjustmentInput = (adj: AdjustmentExportRow) => ({
  orderNo: adj.order_no,
  conversionAction: adj.conversion_action,
  adjustmentTime: adj.adjustment_time,
  type: adj.adjustment_type,
  value: adj.adjusted_value != null ? Number(adj.adjusted_value) : null,
  currency: adj.adjustment_currency,
})

export function makeConversionExportUseCases(deps: {
  conversions: ConversionRepository
  adjustments: AdjustmentRepository
  sheets: ConversionSheetExporter
  conversionFlow: ConversionFlow
}) {
  const { conversions, adjustments, sheets, conversionFlow } = deps

  async function listConversions(page: number, limit: number) {
    const res = await conversions.listPage(page, limit)
    if (!res.ok) {
      console.error('[admin/conversions] query_failed', res.error)
      return fail('failed', res.error)
    }
    const pendingTotal = await conversions.countPending()
    return ok({ data: res.data.rows, ...pageMeta(res.data.total, page, limit), pendingTotal })
  }

  async function listAdjustments(page: number, limit: number) {
    const res = await adjustments.listPage(page, limit)
    if (!res.ok) {
      console.error('[admin/conversion-adjustments] query_failed', res.error)
      return fail('failed', res.error)
    }
    const pendingTotal = await adjustments.countPending()
    return ok({ data: res.data.rows, ...pageMeta(res.data.total, page, limit), pendingTotal })
  }

  async function resendConversion(id: string): Promise<Result<ResendOutcome>> {
    const res = await conversions.getForExport(id)
    if (!res.ok) return fail('failed', res.error)
    const conv = res.data
    if (!conv?.lead) return fail('not_found', 'Конверсію або відповідного ліда не знайдено')
    if (conv.export_status === 'retracted') {
      // Отозванную конверсию вручную не отправляем — иначе RETRACT в Google будет перебит.
      return fail('invalid', 'Конверсію відкликано (RETRACT). Повторна відправка — після повернення ліда на конверсійну стадію')
    }
    const lead = conv.lead
    try {
      const sent = await sheets.sendConversion({
        lead_id: lead.id,
        order_no: lead.order_no,
        email: lead.email,
        phone: lead.phone,
        gclid: lead.gclid,
        gbraid: lead.gbraid,
        wbraid: lead.wbraid,
        // C2: отправляем СОХРАНЁННОЕ значение конверсии (фид = offline_conversions).
        conversionValue: conv.conversion_value != null ? Number(conv.conversion_value) : null,
        conversionAction: lead.status?.conversion_action ?? null,
      })
      if (!sent) return ok({ kind: 'not_configured' })
      await conversionFlow.markConversionExportedByLead(lead.id)
      return ok({ kind: 'sent' })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[admin/conversions/[id]/resend] sheets_failed', message)
      return ok({ kind: 'send_failed', message })
    }
  }

  async function exportPendingConversions(): Promise<Result<BulkExportCounts>> {
    const res = await conversions.listPendingForExport()
    if (!res.ok) return fail('failed', res.error)
    let sent = 0, failed = 0, skipped = 0
    for (const row of res.data) {
      const lead = row.lead
      if (!lead) { failed++; continue }
      try {
        const okSent = await sheets.sendConversion({
          lead_id: lead.id,
          order_no: lead.order_no,
          email: lead.email,
          phone: lead.phone,
          gclid: lead.gclid,
          gbraid: lead.gbraid,
          wbraid: lead.wbraid,
          conversionValue: row.conversion_value != null ? Number(row.conversion_value) : null,
          conversionAction: lead.status?.conversion_action ?? null,
        })
        if (okSent) {
          await conversionFlow.markConversionExportedByLead(lead.id)
          sent++
        } else {
          skipped++ // Sheets не настроен
        }
      } catch (e) {
        console.error('[conversions/export-pending] send_failed', e instanceof Error ? e.message : e)
        failed++
      }
    }
    if (sent === 0 && skipped > 0) {
      return fail('invalid', 'Google Sheets не налаштовано — нічого не вивантажено', { ok: false })
    }
    return ok({ sent, failed, skipped, total: res.data.length })
  }

  async function resendAdjustment(id: string): Promise<Result<ResendOutcome>> {
    const res = await adjustments.get(id)
    if (!res.ok) return fail('failed', res.error)
    const adj = res.data
    if (!adj) return fail('not_found', 'Корекцію не знайдено')
    try {
      const sent = await sheets.sendAdjustment(toAdjustmentInput(adj))
      if (!sent) return ok({ kind: 'not_configured' })
      await conversionFlow.markAdjustmentExported(adj.id)
      return ok({ kind: 'sent' })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[admin/conversion-adjustments/[id]/resend] sheets_failed', message)
      return ok({ kind: 'send_failed', message })
    }
  }

  async function exportPendingAdjustments(): Promise<Result<BulkExportCounts>> {
    const res = await adjustments.listPending()
    if (!res.ok) return fail('failed', res.error)
    let sent = 0, failed = 0, skipped = 0
    for (const adj of res.data) {
      try {
        if (await sheets.sendAdjustment(toAdjustmentInput(adj))) {
          await conversionFlow.markAdjustmentExported(adj.id)
          sent++
        } else {
          skipped++ // таблица корректировок не настроена
        }
      } catch (e) {
        console.error('[conversion-adjustments/export-pending] send_failed', e instanceof Error ? e.message : e)
        failed++
      }
    }
    if (sent === 0 && skipped > 0) {
      return fail('invalid', 'Таблицю корекцій не налаштовано — нічого не вивантажено', { ok: false })
    }
    return ok({ sent, failed, skipped, total: res.data.length })
  }

  return {
    listConversions,
    listAdjustments,
    resendConversion,
    exportPendingConversions,
    resendAdjustment,
    exportPendingAdjustments,
  }
}
