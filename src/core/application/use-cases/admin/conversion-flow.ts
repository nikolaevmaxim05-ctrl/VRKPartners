// use-cases/admin/conversion-flow — запис офлайн-конверсії та корекцій (RETRACT/RESTATE)
// і їх вивантаження в Google Sheets. Перенесено з lib/conversions.ts та lib/conversion-adjustments.ts
// без зміни поведінки (логи ті самі).
import type { Clock } from '../../ports/common'
import type { LeadRepository } from '../../ports/leads'
import type { SettingsRepository } from '../../ports/settings'
import type {
  ConversionRepository,
  AdjustmentRepository,
  ConversionSheetExporter,
  ExistingConversion,
  AdjustmentRow,
} from '../../ports/conversions'
import { conversionStateChanged, type RecordOutcome } from '../../../domain/funnel/transition'
import {
  shouldSuppressRetract,
  normalizeAdjustmentValue,
  type AdjustmentType,
} from '../../../domain/funnel/adjustments'

export type ConversionFlowDeps = {
  conversions: ConversionRepository
  adjustments: AdjustmentRepository
  leads: LeadRepository
  settings: SettingsRepository
  sheets: ConversionSheetExporter
  clock: Clock
}

export type ConversionFlow = ReturnType<typeof makeConversionFlow>

export function makeConversionFlow(deps: ConversionFlowDeps) {
  const { conversions, adjustments, leads, settings, sheets, clock } = deps

  async function getSetting(key: string, fallback: string): Promise<string> {
    return (await settings.get(key))?.trim() || fallback
  }

  /**
   * Записує рядок у offline_conversions або оновлює стан, якщо реально змінився.
   * Офлайн-конверсія в БД = ОСТАННІЙ стан ліда (action/type/value); той самий стан → noop.
   */
  async function recordConversion(
    leadId: string,
    value: number | null = null,
    conversionActionOverride?: string | null,
    conversionType?: string | null,
  ): Promise<RecordOutcome> {
    console.log('[conversions] start', { leadId, value, conversionActionOverride, conversionType })

    const existingRes = await conversions.getStateByLead(leadId)
    if (!existingRes.ok) {
      console.error('[conversions] check_existing_failed', existingRes.error)
      return { outcome: 'error' }
    }
    const existing = existingRes.data

    if (existing) {
      console.log('[conversions] record_already_exists', {
        id: existing.id,
        currentAction: existing.conversion_action,
        currentType: existing.conversion_type,
        currentValue: existing.conversion_value,
      })
      const action = conversionActionOverride?.trim() || (await getSetting('google_ads_conversion_action', 'Lead'))
      const typeNorm = conversionType ?? null
      const normNum = (x: unknown): number | null => (x == null ? null : Number(x))
      const { changed, valueChanged } = conversionStateChanged(
        { conversion_action: existing.conversion_action, conversion_type: existing.conversion_type ?? null, conversion_value: existing.conversion_value },
        { action, type: typeNorm, value },
      )
      if (!changed) {
        console.log('[conversions] noop_same_state')
        return { outcome: 'noop' }
      }
      console.log('[conversions] updating_state', {
        action: { from: existing.conversion_action, to: action },
        type: { from: existing.conversion_type, to: typeNorm },
        value: { from: existing.conversion_value, to: value },
      })
      // export_status/exported_at НЕ скидаємо у pending: зміну в Google несуть офлайн-рядок
      // нового стану (шле caller) + корекція RETRACT/RESTATE в окремому фіді.
      const upd = await conversions.updateState(leadId, {
        conversion_action: action,
        conversion_type: typeNorm,
        conversion_value: value,
      })
      if (!upd.ok) {
        console.error('[conversions] update_state_failed', upd.error)
        return { outcome: 'error' }
      }
      console.log('[conversions] state_updated_ok')
      return {
        outcome: 'updated',
        action,
        prevAction: existing.conversion_action,
        prevType: existing.conversion_type ?? null,
        prevValue: normNum(existing.conversion_value),
        valueChanged,
      }
    }

    const leadRes = await leads.getClickIds(leadId)
    if (!leadRes.ok || !leadRes.data) {
      console.error('[conversions] lead_not_found', { leadId, error: leadRes.ok ? undefined : leadRes.error })
      return { outcome: 'error' }
    }
    const lead = leadRes.data
    console.log('[conversions] click_ids', { gclid: lead.gclid ?? null, gbraid: lead.gbraid ?? null, wbraid: lead.wbraid ?? null })

    // Click ID опційний (міграція 021): один рядок на конверсійний лід.
    const [settingAction, currency] = await Promise.all([
      getSetting('google_ads_conversion_action', 'Lead'),
      getSetting('internal_currency', 'UAH'),
    ])
    const conversionAction = conversionActionOverride?.trim() || settingAction
    console.log('[conversions] inserting', { leadId, conversionAction, currency, value })

    const ins = await conversions.insert({
      lead_id: leadId,
      gclid: lead.gclid ?? null,
      gbraid: lead.gbraid ?? null,
      wbraid: lead.wbraid ?? null,
      conversion_action: conversionAction,
      conversion_value: value,
      conversion_currency: currency,
      conversion_time: clock.now().toISOString(),
      conversion_type: conversionType ?? null,
    })
    if (!ins.ok) {
      console.error('[conversions] insert_failed', ins.error, { leadId })
      return { outcome: 'error' }
    }
    console.log('[conversions] inserted_ok', { leadId })
    return { outcome: 'inserted' }
  }

  /** Поточний рядок offline_conversions ліда (або null). */
  async function getConversionByLead(leadId: string): Promise<ExistingConversion | null> {
    const res = await conversions.getByLead(leadId)
    if (!res.ok) {
      console.error('[conversions] get_by_lead_failed', res.error)
      return null
    }
    return res.data
  }

  /** Повертає відкликану конверсію в чергу (повторний enter після RETRACT). */
  async function markConversionPendingByLead(leadId: string): Promise<void> {
    const res = await conversions.markPendingByLead(leadId)
    if (!res.ok) console.error('[conversions] mark_pending_failed', res.error)
  }

  /** Помічає конверсію ліда як вивантажену (після успішної відправки в Sheets). */
  async function markConversionExportedByLead(leadId: string): Promise<void> {
    const res = await conversions.markExportedByLead(leadId, clock.now().toISOString())
    if (!res.ok) console.error('[conversions] mark_exported_failed', res.error)
  }

  /**
   * Записує корекцію. RETRACT — без суми/валюти, з guard від дубля (C15: повторний RETRACT
   * лише якщо конверсію переекспортували після попереднього). RESTATE — новий рядок на кожну
   * зміну суми; валюта — internal_currency, якщо не передана.
   */
  async function recordAdjustment(params: {
    leadId: string
    orderNo: number
    conversionAction: string
    type: AdjustmentType
    value?: number | null
    currency?: string | null
    offlineConversionId?: string | null
  }): Promise<AdjustmentRow | null> {
    if (params.type === 'retract') {
      const lastRetractAt = await adjustments.lastRetractTime(params.leadId, params.conversionAction)
      if (lastRetractAt) {
        const exportedAt = await conversions.getExportedAt(params.leadId)
        if (shouldSuppressRetract(lastRetractAt, exportedAt)) {
          console.log('[adjustments] retract_suppressed_no_new_export', { leadId: params.leadId })
          return null
        }
      }
    }

    const normalized = normalizeAdjustmentValue(params.type, params.value, params.currency)
    let currency = normalized.currency
    if (params.type !== 'retract' && currency == null) {
      currency = (await settings.get('internal_currency'))?.trim() || 'UAH'
    }

    const res = await adjustments.insert({
      lead_id: params.leadId,
      offline_conversion_id: params.offlineConversionId ?? null,
      order_no: params.orderNo,
      conversion_action: params.conversionAction,
      adjustment_type: params.type,
      adjusted_value: normalized.value,
      adjustment_currency: currency,
      adjustment_time: clock.now().toISOString(),
    })
    if (!res.ok) {
      console.error('[adjustments] insert_failed', res.error, { leadId: params.leadId })
      return null
    }
    console.log('[adjustments] recorded', { id: res.data.id, type: params.type, orderNo: params.orderNo })
    if (params.type === 'retract') {
      // Відкликана конверсія → 'retracted': НЕ в черзі масового вивантаження (інакше «Вивантажити
      // всі pending» перебʼє RETRACT новою конверсією). Повторний перехід на конверсійну стадію
      // поверне її в pending і відправить заново (рішення власника); наступний RETRACT дозволений
      // лише після нового експорту.
      const reset = await conversions.markRetractedByLead(params.leadId)
      if (!reset.ok) console.error('[adjustments] mark_retracted_failed', reset.error)
    }
    return res.data
  }

  async function markAdjustmentExported(id: string): Promise<void> {
    const res = await adjustments.markExported(id, clock.now().toISOString())
    if (!res.ok) console.error('[adjustments] mark_exported_failed', res.error)
  }

  /**
   * Відправляє корекцію у Sheets і помічає exported. Обовʼязково await (на serverless промис
   * «у фоні» не доживає). Помилка відправки НЕ кидається назовні.
   */
  async function dispatchAdjustment(row: AdjustmentRow): Promise<void> {
    try {
      const sent = await sheets.sendAdjustment({
        orderNo: row.order_no,
        conversionAction: row.conversion_action,
        adjustmentTime: row.adjustment_time,
        type: row.adjustment_type,
        value: row.adjusted_value,
        currency: row.adjustment_currency,
      })
      if (sent) await markAdjustmentExported(row.id)
    } catch (err) {
      console.error('[adjustments] send_failed', err instanceof Error ? err.message : err)
    }
  }

  return {
    recordConversion,
    getConversionByLead,
    markConversionPendingByLead,
    markConversionExportedByLead,
    recordAdjustment,
    markAdjustmentExported,
    dispatchAdjustment,
  }
}
