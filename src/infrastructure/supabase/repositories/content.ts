// infrastructure/supabase/repositories/content — строки site_content (landing / seo / legal).
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { ContentRepository } from '@core/application/ports/content'

export function makeContentRepository(db: () => Db): ContentRepository {
  return {
    async getData(id) {
      // Защищённое чтение: любая ошибка → {} (сайт рендерится на дефолтах).
      try {
        const { data, error } = await db().from('site_content').select('data').eq('id', id).maybeSingle()
        if (error || !data?.data) return {}
        return data.data
      } catch {
        return {}
      }
    },

    async getUpdatedAt(id) {
      try {
        const { data } = await db().from('site_content').select('updated_at').eq('id', id).maybeSingle()
        return (data?.updated_at as string | null | undefined) ?? null
      } catch {
        return null
      }
    },

    async save(id, data, updatedAtIso, userId) {
      const { error } = await db()
        .from('site_content')
        .upsert({ id, data, updated_at: updatedAtIso, updated_by: userId })
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
