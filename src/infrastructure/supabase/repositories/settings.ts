// infrastructure/supabase/repositories/settings — site_settings.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { SettingsRepository, SettingRow } from '@core/application/ports/settings'

export function makeSettingsRepository(db: () => Db): SettingsRepository {
  return {
    async getMany(keys) {
      const { data, error } = await db().from('site_settings').select('key, value').in('key', keys)
      if (error) return dbFail(error.message)
      return dbOk(new Map((data ?? []).map((r) => [r.key as string, r.value as string | null])))
    },

    async get(key) {
      try {
        const { data, error } = await db().from('site_settings').select('value').eq('key', key).maybeSingle()
        if (error) console.error('[settings] get_failed', key, error.message)
        return (data?.value as string | null | undefined) ?? null
      } catch (err) {
        console.error('[settings] get_unavailable', key, err)
        return null
      }
    },

    async listAll() {
      const { data, error } = await db().from('site_settings').select('key, value, type, updated_at')
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as SettingRow[])
    },

    async upsertMany(rows) {
      const { error } = await db().from('site_settings').upsert(rows, { onConflict: 'key' })
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
