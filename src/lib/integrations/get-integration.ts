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
  // Gmail SMTP (email-нотифікації)
  smtp_user:          'SMTP_USER',
  smtp_password:      'SMTP_PASSWORD',
  smtp_from:          'SMTP_FROM',
  keycrm_api_key:     'KEYCRM_API_KEY',
  // Google Sheets — DB-first з env-фолбеком
  google_sheets_service_account_json:  'GOOGLE_SERVICE_ACCOUNT_JSON',
  google_spreadsheet_id:               'GOOGLE_SPREADSHEET_ID',
  // Окрема таблиця для корекцій конверсій (RETRACT/RESTATE), той самий service account
  google_adjustments_spreadsheet_id:   'GOOGLE_ADJUSTMENTS_SPREADSHEET_ID',
}

function fromEnv(key: string): string | null {
  const envVar = ENV_FALLBACK_VARS[key]
  return (envVar ? process.env[envVar] : undefined) ?? null
}

// C12: короткий TTL-кеш розшифрованих значень. /api/lead на кожен сабміт читав
// integrations 6+ разів послідовно; тепер prefetchIntegrations() тягне все одним
// .in()-запитом, а getIntegration бере з кешу. TTL короткий — інтеграції змінюються рідко.
type CacheEntry = { value: string | null; expires: number }
const TTL_MS = 30_000
const cache = new Map<string, CacheEntry>()

function getCached(key: string): string | null | undefined {
  const e = cache.get(key)
  if (e && e.expires > Date.now()) return e.value
  return undefined
}
function setCached(key: string, value: string | null): void {
  cache.set(key, { value, expires: Date.now() + TTL_MS })
}

/**
 * Скидає кеш інтеграцій.
 * Потрібно для ізоляції unit-тестів (щоб значення одного тесту не «залипало»
 * у наступному). У проді можна викликати після зміни налаштувань інтеграцій
 * в адмінці для миттєвої інвалідації — хоча TTL 30s і сам це покриває.
 */
export function clearIntegrationCache(): void {
  cache.clear()
}

export async function getIntegration(key: string): Promise<string | null> {
  const cached = getCached(key)
  if (cached !== undefined) return cached

  try {
    const service = createServiceClient()
    const { data } = await service
      .from('integrations')
      .select('encrypted_value, iv, auth_tag')
      .eq('key', key)
      .maybeSingle()

    if (data) {
      const value = decrypt(data.encrypted_value, data.iv, data.auth_tag)
      setCached(key, value)
      return value
    }
  } catch {
    // якщо БД недоступна або decrypt впав — фолбек на env
  }

  const value = fromEnv(key)
  setCached(key, value)
  return value
}

/** C12: один .in()-запит для набору ключів → наповнює кеш (щоб не читати по одному). */
export async function prefetchIntegrations(keys: string[]): Promise<void> {
  const missing = keys.filter((k) => getCached(k) === undefined)
  if (missing.length === 0) return
  try {
    const service = createServiceClient()
    const { data } = await service
      .from('integrations')
      .select('key, encrypted_value, iv, auth_tag')
      .in('key', missing)

    const byKey = new Map(
      (data ?? []).map((r) => [r.key as string, r as { encrypted_value: string; iv: string; auth_tag: string }]),
    )
    for (const k of missing) {
      const row = byKey.get(k)
      if (row) {
        try { setCached(k, decrypt(row.encrypted_value, row.iv, row.auth_tag)) }
        catch { setCached(k, fromEnv(k)) }
      } else {
        setCached(k, fromEnv(k))
      }
    }
  } catch {
    // БД недоступна — кеш не наповнюємо, getIntegration зробить env-фолбек індивідуально
  }
}
