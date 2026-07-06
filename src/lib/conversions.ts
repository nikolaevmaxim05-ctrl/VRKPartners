// Запис офлайн-конверсії Google Ads при переході ліда у фінальний статус.
// Викликається з PATCH /api/admin/leads/[id] синхронно після UPDATE.
import { createServiceClient } from '@/lib/supabase/service'

async function getSetting(key: string, fallback: string): Promise<string> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  return data?.value?.trim() || fallback
}

// Форматує ISO-час у формат Google Ads: "2024-01-15 10:30:00+03:00" (Kyiv TZ)
export function toGoogleAdsTime(iso: string): string {
  const d = new Date(iso)
  const offsetParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  }).formatToParts(d)
  const rawOffset = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const tzOffset = rawOffset.replace('GMT', '') // "+03:00"

  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}${tzOffset}`
}

/**
 * Записує рядок у offline_conversions (або оновлює стан якщо вже є).
 *
 * Викликається синхронно з PATCH `/api/admin/leads/[id]` коли новий статус
 * має `is_final = true` і `conversion_type != null`. Офлайн-конверсія в БД =
 * ОСТАННІЙ стан ліда: при повторному виклику оновлюються ВСІ ТРИ поля
 * (`conversion_action`, `conversion_type`, `conversion_value`), якщо стан
 * реально змінився; той самий стан повторно → noop (нічого не пишемо).
 *
 * @param leadId - UUID ліда
 * @param value - сума конверсії (deal_amount або deal_profit) або null
 * @param conversionActionOverride - override назви конверсії зі стадії;
 *   фолбек другого рівня — site_settings.google_ads_conversion_action.
 * @param conversionType - тип конверсії зі стадії
 *   ('target_lead' / 'non_target_lead' / 'deal' / 'deal_adjustment').
 */
/**
 * Помічає офлайн-конверсію ліда як вивантажену (export_status='exported').
 * Викликати ПІСЛЯ успішного sendConversionToSheets.
 */
export async function markConversionExportedByLead(leadId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('offline_conversions')
    .update({ export_status: 'exported', exported_at: new Date().toISOString() })
    .eq('lead_id', leadId)
  if (error) console.error('[conversions] mark_exported_failed', error.message)
}

// Результат recordConversion — драйвить корекції (RETRACT/RESTATE) і відправку
// в офлайн-лист у caller (leads/[id] route): слати лише на inserted/updated.
export type RecordConversionResult =
  | { outcome: 'inserted' }
  | {
      outcome: 'updated'
      // Резолвнута ПОТОЧНА дія (override → site_settings → 'Lead') — для RESTATE.
      action: string
      prevAction: string
      prevType: string | null
      prevValue: number | null
      valueChanged: boolean
    }
  | { outcome: 'noop' }              // існуюча конверсія, стан не змінився
  | { outcome: 'error' }

export async function recordConversion(
  leadId: string,
  value: number | null = null,
  // Пріоритет: переданий override → site_settings → 'Lead'
  conversionActionOverride?: string | null,
  conversionType?: string | null,
): Promise<RecordConversionResult> {
  console.log('[conversions] start', { leadId, value, conversionActionOverride, conversionType })
  const supabase = createServiceClient()

  // Перевіряємо чи вже є запис — оновлюємо стан якщо реально змінився
  const { data: existing, error: existErr } = await supabase
    .from('offline_conversions')
    .select('id, conversion_value, conversion_action, conversion_type')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (existErr) {
    console.error('[conversions] check_existing_failed', existErr.message)
    return { outcome: 'error' }
  }

  if (existing) {
    console.log('[conversions] record_already_exists', {
      id: existing.id,
      currentAction: existing.conversion_action,
      currentType: existing.conversion_type,
      currentValue: existing.conversion_value,
    })
    // Поточна дія: override → site_settings → 'Lead' (та сама логіка, що при insert)
    const action = conversionActionOverride?.trim()
      || (await getSetting('google_ads_conversion_action', 'Lead'))
    const typeNorm = conversionType ?? null

    const normNum = (x: unknown): number | null => (x == null ? null : Number(x))
    const valueChanged = normNum(value) !== normNum(existing.conversion_value)
    const changed =
      action !== existing.conversion_action ||
      typeNorm !== (existing.conversion_type ?? null) ||
      valueChanged

    if (!changed) {
      console.log('[conversions] noop_same_state')
      return { outcome: 'noop' }
    }

    console.log('[conversions] updating_state', {
      action: { from: existing.conversion_action, to: action },
      type: { from: existing.conversion_type, to: typeNorm },
      value: { from: existing.conversion_value, to: value },
    })
    // Оновлюємо ВСІ ТРИ поля — БД завжди несе останній стан конверсії.
    // export_status/exported_at НЕ скидаємо у pending: ручний «export pending»
    // не має ре-аппендити рядок; зміну в Google несуть офлайн-рядок нового стану
    // (шле caller) + корекція RETRACT/RESTATE в окремому фіді.
    const { error: updErr } = await supabase
      .from('offline_conversions')
      .update({
        conversion_action: action,
        conversion_type: typeNorm,
        conversion_value: value,
      })
      .eq('lead_id', leadId)
    if (updErr) {
      console.error('[conversions] update_state_failed', updErr.message)
      return { outcome: 'error' }
    }
    console.log('[conversions] state_updated_ok')
    return {
      outcome: 'updated',
      action,
      prevAction: existing.conversion_action as string,
      prevType: (existing.conversion_type as string | null) ?? null,
      prevValue: normNum(existing.conversion_value),
      valueChanged,
    }
  }

  // Читаємо click IDs з ліда
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('gclid, gbraid, wbraid')
    .eq('id', leadId)
    .maybeSingle()

  if (leadErr || !lead) {
    console.error('[conversions] lead_not_found', { leadId, error: leadErr?.message })
    return { outcome: 'error' }
  }

  console.log('[conversions] click_ids', {
    gclid: lead.gclid ?? null,
    gbraid: lead.gbraid ?? null,
    wbraid: lead.wbraid ?? null,
  })

  // Click ID опційний (міграція 021 зняла CHECK chk_has_click_id): офлайн-конверсія —
  // єдине джерело істини, один рядок на конверсійний лід. Лист офлайн-конверсій
  // матчить ліда і по хешу email/phone (enhanced conversions). Тож лід без
  // gclid/gbraid/wbraid теж отримує рядок → корекції (RETRACT/RESTATE) працюють для нього.
  const [settingAction, currency] = await Promise.all([
    getSetting('google_ads_conversion_action', 'Lead'),
    getSetting('internal_currency', 'UAH'),
  ])
  // Пріоритет: переданий override → site_settings → 'Lead'
  const conversionAction = conversionActionOverride?.trim() || settingAction

  console.log('[conversions] inserting', { leadId, conversionAction, currency, value })

  const { error: insErr } = await supabase.from('offline_conversions').insert({
    lead_id: leadId,
    gclid: lead.gclid ?? null,
    gbraid: lead.gbraid ?? null,
    wbraid: lead.wbraid ?? null,
    conversion_action: conversionAction,
    conversion_value: value,
    conversion_currency: currency,
    conversion_time: new Date().toISOString(),
    conversion_type: conversionType ?? null,
  })

  if (insErr) {
    console.error('[conversions] insert_failed', insErr.message, { leadId })
    return { outcome: 'error' }
  }
  console.log('[conversions] inserted_ok', { leadId })
  return { outcome: 'inserted' }
}

// ── Хелпери для RETRACT (оновлення офлайн-конверсії до нецільового стану) ─────

export type ExistingConversion = {
  id: string
  export_status: 'pending' | 'exported'
  conversion_action: string
  conversion_type: string | null
  conversion_value: number | null
}

// Повертає поточний рядок offline_conversions ліда (або null, якщо конверсії немає —
// напр. лід без Google click ID).
export async function getConversionByLead(leadId: string): Promise<ExistingConversion | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('offline_conversions')
    .select('id, export_status, conversion_action, conversion_type, conversion_value')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) {
    console.error('[conversions] get_by_lead_failed', error.message)
    return null
  }
  return (data as ExistingConversion | null) ?? null
}
