// core/domain/settings/site-settings — белый список ключей site_settings и их нормализация.
// Перенесено из /api/admin/settings без изменения поведения.

// Белый список ключей — защита от записи произвольных настроек через API.
// telephony_secret хранится в integrations (AES-256-GCM), здесь не принимается.
import { REF_ATTRIBUTION_SETTING_KEY, planAttributionDays } from '../referral/touches'

export const ALLOWED_SETTING_KEYS = new Set<string>([
  'internal_currency',
  'dedup_by_phone',
  'dedup_by_ip',
  'dedup_ip_window_hours',
  'google_ads_conversion_action',
  'deal_amount_type',
  'pipelines_enabled',
  // Окно first-touch-атрибуции реферальных заявок (дней, 1–400; touches.ts).
  REF_ATTRIBUTION_SETTING_KEY,
])

/** Никогда не отдаём секреты из GET settings. */
export const SECRET_SETTING_KEYS = new Set<string>(['telephony_secret'])

export const ALLOWED_CURRENCIES = ['UAH', 'USD', 'EUR']

/** Тип по умолчанию по ключу — если клиент не передал type. */
export function inferSettingType(key: string): string {
  if (key === 'dedup_by_phone' || key === 'dedup_by_ip') return 'boolean'
  if (key === 'pipelines_enabled') return 'boolean'
  if (key === 'dedup_ip_window_hours' || key === REF_ATTRIBUTION_SETTING_KEY) return 'number'
  return 'string'
}

export type SettingItem = { key: string; value: string | number | boolean | null; type?: string }

/** Валидирует и нормализует items (хранятся как TEXT). */
export function normalizeSettingItems(items: unknown):
  | { ok: true; rows: Array<{ key: string; value: string; type: string }> }
  | { ok: false; message: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, message: 'Порожній items' }
  const rows: Array<{ key: string; value: string; type: string }> = []
  for (const item of items as SettingItem[]) {
    if (!ALLOWED_SETTING_KEYS.has(item.key)) return { ok: false, message: `Невідомий ключ: ${item.key}` }
    const type = item.type ?? inferSettingType(item.key)
    let value: string
    if (type === 'boolean') {
      value = item.value === true || item.value === 'true' ? 'true' : 'false'
    } else if (type === 'number') {
      const n = Number(item.value)
      if (!Number.isFinite(n) || n < 0) return { ok: false, message: `Невірне число для ${item.key}` }
      if (item.key === REF_ATTRIBUTION_SETTING_KEY) {
        const plan = planAttributionDays(n)
        if (!plan.ok) return { ok: false, message: plan.message }
      }
      value = String(Math.floor(n))
    } else {
      value = item.value == null ? '' : String(item.value).trim()
      if (item.key === 'internal_currency' && !ALLOWED_CURRENCIES.includes(value)) {
        return { ok: false, message: 'Валюта: UAH, USD або EUR' }
      }
      if (item.key === 'deal_amount_type' && !['amount', 'profit'].includes(value)) {
        return { ok: false, message: 'deal_amount_type: amount або profit' }
      }
    }
    rows.push({ key: item.key, value, type })
  }
  return { ok: true, rows }
}
