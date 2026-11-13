// infrastructure/integrations/integration-config — чтение настроек интеграций:
// СНАЧАЛА БД (расшифрованное), ПОТОМ env-фолбэк. Короткий TTL-кэш (30 с) + prefetch одним запросом.
import type { Cipher, IntegrationConfig } from '@core/application/ports/settings'

// Ключ → имя env-переменной. Значение читаем в МОМЕНТ ВЫЗОВА (process.env[envVar]).
export const ENV_FALLBACK_VARS: Record<string, string> = {
  telegram_bot_token: 'TELEGRAM_BOT_TOKEN',
  telegram_chat_id:   'TELEGRAM_CHAT_ID',
  smtp_user:          'SMTP_USER',
  smtp_password:      'SMTP_PASSWORD',
  smtp_from:          'SMTP_FROM',
  keycrm_api_key:     'KEYCRM_API_KEY',
  google_sheets_service_account_json: 'GOOGLE_SERVICE_ACCOUNT_JSON',
  google_spreadsheet_id:              'GOOGLE_SPREADSHEET_ID',
  google_adjustments_spreadsheet_id:  'GOOGLE_ADJUSTMENTS_SPREADSHEET_ID',
}

type EncryptedRow = { encrypted_value: string; iv: string; auth_tag: string }

export type IntegrationRowSource = {
  one(key: string): Promise<EncryptedRow | null>
  many(keys: string[]): Promise<Array<EncryptedRow & { key: string }>>
}

const TTL_MS = 30_000

export function makeIntegrationConfig(source: IntegrationRowSource, cipher: Cipher): IntegrationConfig & {
  clearCache(): void
} {
  const cache = new Map<string, { value: string | null; expires: number }>()

  const fromEnv = (key: string): string | null => {
    const envVar = ENV_FALLBACK_VARS[key]
    return (envVar ? process.env[envVar] : undefined) ?? null
  }
  const getCached = (key: string): string | null | undefined => {
    const e = cache.get(key)
    return e && e.expires > Date.now() ? e.value : undefined
  }
  const setCached = (key: string, value: string | null) => cache.set(key, { value, expires: Date.now() + TTL_MS })

  return {
    clearCache() {
      cache.clear()
    },

    async get(key) {
      const cached = getCached(key)
      if (cached !== undefined) return cached
      try {
        const row = await source.one(key)
        if (row) {
          const value = cipher.decrypt(row.encrypted_value, row.iv, row.auth_tag)
          setCached(key, value)
          return value
        }
      } catch {
        // БД недоступна или decrypt упал — фолбэк на env
      }
      const value = fromEnv(key)
      setCached(key, value)
      return value
    },

    async prefetch(keys) {
      const missing = keys.filter((k) => getCached(k) === undefined)
      if (missing.length === 0) return
      try {
        const rows = await source.many(missing)
        const byKey = new Map(rows.map((r) => [r.key, r]))
        for (const k of missing) {
          const row = byKey.get(k)
          if (row) {
            try {
              setCached(k, cipher.decrypt(row.encrypted_value, row.iv, row.auth_tag))
            } catch {
              setCached(k, fromEnv(k))
            }
          } else {
            setCached(k, fromEnv(k))
          }
        }
      } catch {
        // БД недоступна — кэш не наполняем, get() сделает env-фолбэк индивидуально
      }
    },
  }
}
