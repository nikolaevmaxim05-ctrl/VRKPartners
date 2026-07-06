// Корекції конверсій (Google Ads adjustments): RETRACT / RESTATE.
// Офлайн-конверсія = останній стан ліда; корекція = подія зміни.
// Викликається з PATCH /api/admin/leads/[id] (тригери) і з API корекцій (resend/export).
import { createServiceClient } from '@/lib/supabase/service'
import { sendAdjustmentToSheets } from '@/lib/google-sheets'

export type AdjustmentType = 'retract' | 'restate'

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

  // Idempotency guard для RETRACT — одна корекція-відкликання на конверсію.
  if (params.type === 'retract') {
    const { data: dup } = await supabase
      .from('conversion_adjustments')
      .select('id')
      .eq('lead_id', params.leadId)
      .eq('adjustment_type', 'retract')
      .eq('conversion_action', params.conversionAction)
      .maybeSingle()
    if (dup) {
      console.log('[adjustments] retract_already_exists', { leadId: params.leadId })
      return null
    }
  }

  let value: number | null = params.value ?? null
  let currency: string | null = params.currency ?? null

  if (params.type === 'retract') {
    value = null
    currency = null
  } else if (currency == null) {
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
