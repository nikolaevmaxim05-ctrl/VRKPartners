// infrastructure/supabase/repositories/tracking-tags — Google-теги (GA4 / GTM / Ads).
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { TrackingTagRepository } from '@core/application/ports/settings'
import type { TrackingTag, TrackingTagType } from '@core/domain/tracking/tags'

const TAG_SELECT = 'id, type, tag_id, label, conversion_label, enabled, position, created_at'

export function makeTrackingTagRepository(db: () => Db): TrackingTagRepository {
  return {
    async list() {
      const { data, error } = await db()
        .from('tracking_tags')
        .select(TAG_SELECT)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as TrackingTag[])
    },

    async listEnabled() {
      try {
        const { data, error } = await db()
          .from('tracking_tags')
          .select('type, tag_id, conversion_label')
          .eq('enabled', true)
          .order('position', { ascending: true })
        if (error) return dbFail(error.message)
        return dbOk((data ?? []) as Array<{ type: TrackingTagType; tag_id: string; conversion_label: string | null }>)
      } catch (e) {
        return dbFail(e instanceof Error ? e.message : String(e))
      }
    },

    async getType(id) {
      const { data, error } = await db().from('tracking_tags').select('id, type').eq('id', id).maybeSingle()
      if (error || !data) return null
      return data as { id: string; type: TrackingTagType }
    },

    async exists(id) {
      const { data, error } = await db().from('tracking_tags').select('id').eq('id', id).maybeSingle()
      return !error && !!data
    },

    async maxPosition() {
      const { data } = await db()
        .from('tracking_tags')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      return Number(data?.position ?? 0)
    },

    async insert(values) {
      const { data, error } = await db().from('tracking_tags').insert(values).select(TAG_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as TrackingTag)
    },

    async update(id, patch) {
      const { data, error } = await db().from('tracking_tags').update(patch).eq('id', id).select(TAG_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as TrackingTag)
    },

    async delete(id) {
      const { error } = await db().from('tracking_tags').delete().eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
