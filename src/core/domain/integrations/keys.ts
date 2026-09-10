// core/domain/integrations/keys — ключі інтеграцій і правила їх показу в адмінці.

// S9: key приходить з URL — приймаємо лише відомі інтеграції.
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

// Несекретні ключі — віддаємо plaintext для prefill (Spreadsheet ID, Gmail-адреса і From).
export const PLAINTEXT_INTEGRATION_KEYS = new Set<string>([
  'google_spreadsheet_id',
  'google_adjustments_spreadsheet_id',
  'smtp_user',
  'smtp_from',
])

/** Маскує значення: показує лише останні 4 символи. */
export function maskValue(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return '••••••••••••' + plaintext.slice(-4)
}

/** Ключі каналів доставки заявки — одним запитом у кеш перед відправкою. */
export const LEAD_DELIVERY_KEYS = [
  'telegram_bot_token',
  'telegram_chat_id',
  'keycrm_api_key',
  'smtp_user',
  'smtp_password',
  'smtp_from',
]
