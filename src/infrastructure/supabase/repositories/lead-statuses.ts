// infrastructure/supabase/repositories/lead-statuses — стадии воронки.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { LeadStatusRepository, LeadStatusRow } from '@core/application/ports/leads'
import type { StageCurrent } from '@core/domain/funnel/stage-rules'
import type { StatusForTransition } from '@core/domain/funnel/transition'

export const STATUS_SELECT =
  'id, name, color, position, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit, allowed_next_status_ids, allowed_prev_status_ids'

export function makeLeadStatusRepository(db: () => Db): LeadStatusRepository {
  return {
    async list() {
      const { data, error } = await db().from('lead_statuses').select(STATUS_SELECT).order('position', { ascending: true })
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as LeadStatusRow[])
    },

    async getForTransition(ids) {
      if (ids.length === 0) return []
      const { data } = await db()
        .from('lead_statuses')
        .select('id, name, is_final, conversion_type, conversion_action, requires_amount, amount_is_profit')
        .in('id', ids)
      return (data ?? []) as StatusForTransition[]
    },

    async getCurrent(id) {
      const { data, error } = await db()
        .from('lead_statuses')
        .select('id, is_initial, conversion_type, conversion_action, requires_amount')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      return data as StageCurrent
    },

    async getForDelete(id) {
      const { data, error } = await db()
        .from('lead_statuses')
        .select('id, name, is_initial')
        .eq('id', id)
        .maybeSingle()
      if (error || !data) return null
      return data as { id: string; name: string; is_initial: boolean }
    },

    async findInitialId() {
      const { data } = await db()
        .from('lead_statuses')
        .select('id')
        .eq('is_initial', true)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      return (data?.id as string | undefined) ?? null
    },

    async findIdByName(name) {
      const { data } = await db().from('lead_statuses').select('id').eq('name', name).maybeSingle()
      return (data?.id as string | undefined) ?? null
    },

    async clearInitialExcept(exceptId) {
      await db().from('lead_statuses').update({ is_initial: false }).neq('id', exceptId)
    },

    async countInitialExcept(exceptId) {
      const { count } = await db()
        .from('lead_statuses')
        .select('id', { count: 'exact', head: true })
        .eq('is_initial', true)
        .neq('id', exceptId)
      return count ?? 0
    },

    async maxPosition() {
      const { data } = await db()
        .from('lead_statuses')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      return Number(data?.position ?? 0)
    },

    async insert(values) {
      const { data, error } = await db().from('lead_statuses').insert(values).select(STATUS_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as LeadStatusRow)
    },

    async update(id, patch) {
      const { data, error } = await db().from('lead_statuses').update(patch).eq('id', id).select(STATUS_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as LeadStatusRow)
    },

    async delete(id) {
      const { error } = await db().from('lead_statuses').delete().eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async setPosition(id, position) {
      const { error } = await db().from('lead_statuses').update({ position }).eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
