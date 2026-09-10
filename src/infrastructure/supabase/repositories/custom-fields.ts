// infrastructure/supabase/repositories/custom-fields — кастомні поля ліда та їх значення.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { CustomFieldRepository, CustomFieldRow } from '@core/application/ports/leads'

const FIELD_SELECT = 'id, name, field_key, type, options, required, position, created_at'

export function makeCustomFieldRepository(db: () => Db): CustomFieldRepository {
  return {
    async list() {
      const { data, error } = await db().from('lead_custom_fields').select(FIELD_SELECT).order('position', { ascending: true })
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as CustomFieldRow[])
    },

    async listForLead() {
      const { data } = await db()
        .from('lead_custom_fields')
        .select('id, name, field_key, type, options, required, position')
        .order('position', { ascending: true })
      return (data ?? []) as CustomFieldRow[]
    },

    async get(id) {
      const { data, error } = await db()
        .from('lead_custom_fields')
        .select('id, type, options, required')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      return data as Pick<CustomFieldRow, 'id' | 'type' | 'options' | 'required'>
    },

    async maxPosition() {
      const { data } = await db()
        .from('lead_custom_fields')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      return Number(data?.position ?? 0)
    },

    async insert(values) {
      const { data, error } = await db().from('lead_custom_fields').insert(values).select(FIELD_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as CustomFieldRow)
    },

    async update(id, patch) {
      const { data, error } = await db().from('lead_custom_fields').update(patch).eq('id', id).select(FIELD_SELECT).single()
      if (error) return dbFail(error.message)
      return dbOk(data as CustomFieldRow)
    },

    async delete(id) {
      // lead_custom_field_values — FK ON DELETE CASCADE
      const { error } = await db().from('lead_custom_fields').delete().eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async valuesForLead(leadId) {
      const { data } = await db().from('lead_custom_field_values').select('field_id, value').eq('lead_id', leadId)
      return (data ?? []) as Array<{ field_id: string; value: string | null }>
    },

    async upsertValue(leadId, fieldId, value) {
      const { data, error } = await db()
        .from('lead_custom_field_values')
        .upsert({ lead_id: leadId, field_id: fieldId, value }, { onConflict: 'lead_id,field_id' })
        .select('field_id, value')
        .single()
      if (error) return dbFail(error.message)
      return dbOk(data as { field_id: string; value: string | null })
    },
  }
}
