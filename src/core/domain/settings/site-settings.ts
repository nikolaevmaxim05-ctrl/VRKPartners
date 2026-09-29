// core/domain/settings/site-settings — білий список ключів site_settings і їх нормалізація.
// Перенесено з /api/admin/settings без зміни поведінки.

// Білий список ключів — захист від запису довільних налаштувань через API.
// telephony_secret зберігається в integrations (AES-256-GCM), тут не приймається.
import { REF_ATTRIBUTION_SETTING_KEY, planAttributionDays } from '../referral/touches'

export const ALLOWED_SETTING_KEYS = new Set<string>([
  'internal_currency',
  'dedup_by_phone',
  'dedup_by_ip',
  'dedup_ip_window_hours',
  'google_ads_conversion_action',
  'deal_amount_type',
  'pipelines_enabled',
  // Вікно first-touch-атрибуції реферальних заявок (днів, 1–400; touches.ts).
  REF_ATTRIBUTION_SETTING_KEY,
])

/** Ніколи не віддаємо секрети з GET settings. */
export const SECRET_SETTING_KEYS = new Set<string>(['telephony_secret'])

export const ALLOWED_CURRENCIES = ['UAH', 'USD', 'EUR']

/** Тип за замовчуванням за ключем — якщо клієнт не передав type. */
export function inferSettingType(key: string): string {
  if (key === 'dedup_by_phone' || key === 'dedup_by_ip') return 'boolean'
  if (key === 'pipelines_enabled') return 'boolean'
  if (key === 'dedup_ip_window_hours' || key === REF_ATTRIBUTION_SETTING_KEY) return 'number'
  return 'string'
}

export type SettingItem = { key: string; value: string | number | boolean | null; type?: string }

/** Валідує й нормалізує items (зберігаються як TEXT). */
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
