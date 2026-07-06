// Читає і розшифровує значення з таблиці integrations.
// Фолбек на process.env якщо в БД нема (для локальної розробки та збоїв Supabase).
import { createServiceClient } from '@/lib/supabase/service'
import { decrypt } from '@/lib/encryption'

// Мапа ключ → ім'я env-змінної. ВАЖЛИВО: значення читаємо в МОМЕНТ ВИКЛИКУ
// (process.env[envVar]), а не при імпорті модуля — інакше env, виставлений пізніше
// (зокрема в тестах), не підхоплюється.
const ENV_FALLBACK_VARS: Record<string, string> = {
  telegram_bot_token: 'TELEGRAM_BOT_TOKEN',
  telegram_chat_id:   'TELEGRAM_CHAT_ID',
  resend_api_key:     'RESEND_API_KEY',
  resend_from:        'RESEND_FROM',
  keycrm_api_key:     'KEYCRM_API_KEY',
  // Google Sheets — DB-first з env-фолбеком
  google_sheets_service_account_json:  'GOOGLE_SERVICE_ACCOUNT_JSON',
  google_spreadsheet_id:               'GOOGLE_SPREADSHEET_ID',
  // Окрема таблиця для корекцій конверсій (RETRACT/RESTATE), той самий service account
  google_adjustments_spreadsheet_id:   'GOOGLE_ADJUSTMENTS_SPREADSHEET_ID',
}

export async function getIntegration(key: string): Promise<string | null> {
  try {
    const service = createServiceClient()
    const { data } = await service
      .from('integrations')
      .select('encrypted_value, iv, auth_tag')
      .eq('key', key)
      .maybeSingle()

    if (data) {
      return decrypt(data.encrypted_value, data.iv, data.auth_tag)
    }
  } catch {
    // якщо БД недоступна або decrypt впав — фолбек на env
  }

  const envVar = ENV_FALLBACK_VARS[key]
  return (envVar ? process.env[envVar] : undefined) ?? null
}
