// core/domain/integrations/keys — ключи интеграций и правила их показа в админке.

// S9: key приходит из URL — принимаем только известные интеграции.
export const KNOWN_INTEGRATION_KEYS = new Set<string>([
  'telegram_bot_token',
  'telegram_chat_id',
  'keycrm_api_key',
  'smtp_user',
  'smtp_password',
  'smtp_from',
  'google_sheets_service_account_json',
  'google_spreadsheet_id',
  'google_adjustments_spreadsheet_id',
  'telephony_secret',
])

// Несекретные ключи — отдаём plaintext для prefill (Spreadsheet ID, Gmail-адрес и From).
export const PLAINTEXT_INTEGRATION_KEYS = new Set<string>([
  'google_spreadsheet_id',
  'google_adjustments_spreadsheet_id',
  'smtp_user',
  'smtp_from',
])

/** Маскирует значение: показывает только последние 4 символа. */
export function maskValue(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return '••••••••••••' + plaintext.slice(-4)
}

/** Ключи каналов доставки заявки — одним запросом в кэш перед отправкой. */
export const LEAD_DELIVERY_KEYS = [
  'telegram_bot_token',
  'telegram_chat_id',
  'keycrm_api_key',
  'smtp_user',
  'smtp_password',
  'smtp_from',
]
