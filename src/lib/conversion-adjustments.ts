// Корекції конверсій (Google Ads adjustments): RETRACT / RESTATE.
// Офлайн-конверсія = останній стан ліда; корекція = подія зміни.
// Викликається з PATCH /api/admin/leads/[id] (тригери) і з API корекцій (resend/export).
import { createServiceClient } from '@/lib/supabase/service'
import { sendAdjustmentToSheets } from '@/lib/google-sheets'
import { shouldSuppressRetract, normalizeAdjustmentValue, type AdjustmentType } from '@core/domain/funnel/adjustments'

export type { AdjustmentType } from '@core/domain/funnel/adjustments'

export type AdjustmentRow = {
  id: string
  lead_id: string
  order_no: number
  conversion_action: string
  adjustment_type: AdjustmentType
  adjusted_value: number | null
  adjustment_currency: string | null
  adjustment_time: string
}

/**
 * Записує рядок у conversion_adjustments.
 * - RETRACT: без суми/валюти; guard — не дублювати retract для тієї ж (lead, conversionAction).
 * - RESTATE: новий рядок на кожну зміну суми (без дедупу); валюта — internal_currency якщо не передана.
 * Повертає створений рядок або null (guard спрацював / помилка).
 */
export async function recordAdjustment(params: {
  leadId: string
  orderNo: number
  conversionAction: string
  type: AdjustmentType
  value?: number | null
  currency?: string | null
  offlineConversionId?: string | null
}): Promise<AdjustmentRow | null> {
  const supabase = createServiceClient()

  // C15: guard для RETRACT — не за самим ФАКТОМ попереднього retract (це «навічно»
  // глушило другий retract у циклі target→non_target→target→non_target), а за ЧАСОМ:
  // повторний retract дозволяємо, лише якщо конверсію ПЕРЕекспортували ПІСЛЯ
  // попереднього retract (тобто є що відкликати знову).
  if (params.type === 'retract') {
    const { data: lastRetract } = await supabase
      .from('conversion_adjustments')
      .select('adjustment_time')
      .eq('lead_id', params.leadId)
      .eq('adjustment_type', 'retract')
      .eq('conversion_action', params.conversionAction)
      .order('adjustment_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastRetract) {
      const { data: oc } = await supabase
        .from('offline_conversions')
        .select('exported_at')
        .eq('lead_id', params.leadId)
        .maybeSingle()
      if (shouldSuppressRetract(lastRetract.adjustment_time as string, (oc?.exported_at as string | null) ?? null)) {
        // Після попереднього retract нового експорту не було → дубль, пропускаємо.
        console.log('[adjustments] retract_suppressed_no_new_export', { leadId: params.leadId })
        return null
      }
      // інакше: конверсію переекспортували після retract → дозволяємо новий retract.
    }
  }

  const normalized = normalizeAdjustmentValue(params.type, params.value, params.currency)
  const value: number | null = normalized.value
  let currency: string | null = normalized.currency

  if (params.type !== 'retract' && currency == null) {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'internal_currency')
      .maybeSingle()
    currency = data?.value?.trim() || 'UAH'
  }

  const { data, error } = await supabase
    .from('conversion_adjustments')
    .insert({
      lead_id: params.leadId,
      offline_conversion_id: params.offlineConversionId ?? null,
      order_no: params.orderNo,
      conversion_action: params.conversionAction,
      adjustment_type: params.type,
      adjusted_value: value,
      adjustment_currency: currency,
      adjustment_time: new Date().toISOString(),
    })
    .select('id, lead_id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency, adjustment_time')
    .single()

  if (error) {
    console.error('[adjustments] insert_failed', error.message, { leadId: params.leadId })
    return null
  }
  console.log('[adjustments] recorded', { id: data.id, type: params.type, orderNo: params.orderNo })
  return data as AdjustmentRow
}

// Помічає корекцію як вивантажену. Викликати ПІСЛЯ успішного sendAdjustmentToSheets.
export async function markAdjustmentExported(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('conversion_adjustments')
    .update({ export_status: 'exported', exported_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[adjustments] mark_exported_failed', error.message)
}

// Відправляє корекцію у Google Sheets і помічає exported. Обов'язково await-ити:
// на Vercel лямбда заморожується одразу після відповіді, fire-and-forget промис
// часто не доживає (корекція висіла «Очікує» при вже записаному рядку в таблиці).
// Помилка відправки НЕ кидається назовні — не валить PATCH.
export async function dispatchAdjustment(row: AdjustmentRow): Promise<void> {
  try {
    const sent = await sendAdjustmentToSheets({
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
