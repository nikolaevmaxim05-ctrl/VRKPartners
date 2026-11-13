// infrastructure/supabase/repositories/integrations — зашифрованные секреты интеграций.
// Таблица integrations доступна только service_role. Формат шифртекста НЕ менять.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { Cipher, IntegrationSecretsRepository } from '@core/application/ports/settings'

export function makeIntegrationSecretsRepository(db: () => Db, cipher: Cipher): IntegrationSecretsRepository {
  return {
    async listDecrypted() {
      const { data, error } = await db().from('integrations').select('key, encrypted_value, iv, auth_tag, updated_at')
      if (error) return dbFail(error.message)
      return dbOk(
        (data ?? []).map((row) => {
          let plain: string | null = null
          try {
            plain = cipher.decrypt(row.encrypted_value as string, row.iv as string, row.auth_tag as string)
          } catch {
            plain = null
          }
          return { key: row.key as string, plain, updated_at: (row.updated_at as string | null) ?? null }
        }),
      )
    },

    async set(key, plaintext, userId, updatedAtIso) {
      const { encrypted_value, iv, auth_tag } = cipher.encrypt(plaintext)
      const { error } = await db().from('integrations').upsert({
        key,
        encrypted_value,
        iv,
        auth_tag,
        updated_at: updatedAtIso,
        updated_by: userId,
      })
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async delete(key) {
      const { error } = await db().from('integrations').delete().eq('key', key)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async read(key) {
      const { data, error } = await db()
        .from('integrations')
        .select('encrypted_value, iv, auth_tag')
        .eq('key', key)
        .maybeSingle()
      if (error || !data) return { status: 'missing' }
      try {
        return { status: 'ok', value: cipher.decrypt(data.encrypted_value, data.iv, data.auth_tag) }
      } catch {
        return { status: 'decrypt_error' }
      }
    },
  }
}

/** Сырое чтение строк для кэша IntegrationConfig (один .in()-запрос). */
export async function readEncryptedRows(
  db: () => Db,
  keys: string[],
): Promise<Array<{ key: string; encrypted_value: string; iv: string; auth_tag: string }>> {
  const { data } = await db().from('integrations').select('key, encrypted_value, iv, auth_tag').in('key', keys)
  return (data ?? []) as Array<{ key: string; encrypted_value: string; iv: string; auth_tag: string }>
}

export async function readEncryptedRow(
  db: () => Db,
  key: string,
): Promise<{ encrypted_value: string; iv: string; auth_tag: string } | null> {
  const { data } = await db().from('integrations').select('encrypted_value, iv, auth_tag').eq('key', key).maybeSingle()
  return (data as { encrypted_value: string; iv: string; auth_tag: string } | null) ?? null
}
