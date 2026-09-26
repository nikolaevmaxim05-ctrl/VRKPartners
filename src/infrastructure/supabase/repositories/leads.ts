// infrastructure/supabase/repositories/leads — таблиця leads.
import type { Db } from '../service'
import { dbOk, dbFail, type DbResult } from '@core/application/ports/common'
import type { LeadRepository, LeadListFilters, LeadRow, LeadState } from '@core/application/ports/leads'

// Білий список UTM-колонок для фільтра за значенням (захист від інʼєкції імені поля)
const UTM_FILTER_FIELDS = ['utm_campaign', 'utm_medium', 'utm_term', 'utm_content']

const STATUS_JOIN =
  'status:lead_statuses(id, name, color, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit)'

export function makeLeadRepository(db: () => Db): LeadRepository {
  return {
    async findFirstIdByPhone(phone) {
      const { data, error } = await db()
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) return dbFail(error.message)
      return dbOk(data && data.length > 0 ? (data[0].id as string) : null)
    },

    async findFirstIdByIpSince(ip, sinceIso) {
      const { data, error } = await db()
        .from('leads')
        .select('id')
        .eq('ip_address', ip)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) return dbFail(error.message)
      return dbOk(data && data.length > 0 ? (data[0].id as string) : null)
    },

    async countByIpSince(ip, sinceIso) {
      const { count, error } = await db()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', sinceIso)
      if (error) return dbFail(error.message)
      return dbOk(count ?? 0)
    },

    async markRepeat(id) {
      const { error } = await db().from('leads').update({ is_repeat: true }).eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async insert(row) {
      const { error } = await db().from('leads').insert(row)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async list(f: LeadListFilters) {
      const offset = (f.page - 1) * f.limit
      let query = db()
        .from('leads')
        .select(`*, status:lead_statuses!left(id, name, color, is_final)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + f.limit - 1)

      if (f.search) {
        // C17: кома/дужки ламають синтаксис PostgREST .or() → вирізаємо; % і _ — екрануємо.
        const escaped = f.search.replace(/[,()]/g, ' ').replace(/[%_]/g, '\\$&')
        query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      }
      if (f.service) query = query.eq('service', f.service)
      if (f.utmSource) query = query.eq('utm_source', f.utmSource)
      if (f.utmValue && UTM_FILTER_FIELDS.includes(f.utmField)) {
        const escaped = f.utmValue.replace(/[%_]/g, '\\$&')
        query = query.ilike(f.utmField, `%${escaped}%`)
      }
      if (f.statusId) query = query.eq('status_id', f.statusId)
      if (f.assignedTo) {
        if (f.assignedTo === 'unassigned') query = query.is('assigned_to', null)
        else query = query.eq('assigned_to', f.assignedTo)
      }
      if (f.dateFrom) query = query.gte('created_at', f.dateFrom)
      if (f.dateTo) {
        const endOfDay = new Date(f.dateTo)
        if (!isNaN(endOfDay.getTime())) {
          endOfDay.setHours(23, 59, 59, 999)
          query = query.lte('created_at', endOfDay.toISOString())
        }
      }

      const { data, count, error } = await query
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as LeadRow[], total: count ?? 0 })
    },

    async getDetail(id) {
      const { data, error } = await db()
        .from('leads')
        .select(`*, ${STATUS_JOIN}, original:original_lead_id(id, name, phone, created_at, status_id)`)
        .eq('id', id)
        .maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as LeadRow | null) ?? null)
    },

    async listByPhone(phone) {
      const { data } = await db()
        .from('leads')
        .select('id, created_at, status_id')
        .eq('phone', phone)
        .order('created_at', { ascending: true })
      return (data ?? []) as Array<{ id: string; created_at: string; status_id: string | null }>
    },

    async getState(id) {
      const { data, error } = await db()
        .from('leads')
        .select('status_id, assigned_to, deal_amount, deal_profit')
        .eq('id', id)
        .maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as LeadState | null) ?? null)
    },

    async update(id, patch, cas) {
      let q = db().from('leads').update(patch).eq('id', id)
      if (cas) {
        q = cas.statusId ? q.eq('status_id', cas.statusId) : q.is('status_id', null)
      }
      const { data, error } = await q.select(`*, ${STATUS_JOIN}`).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as LeadRow | null) ?? null)
    },

    async delete(id) {
      // Спершу повʼязані offline_conversions (FK)
      await db().from('offline_conversions').delete().eq('lead_id', id)
      const { error } = await db().from('leads').delete().eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async exists(id) {
      const { data, error } = await db().from('leads').select('id').eq('id', id).maybeSingle()
      return !error && !!data
    },

    async getClickIds(id) {
      const { data, error } = await db()
        .from('leads')
        .select('gclid, gbraid, wbraid')
        .eq('id', id)
        .maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as { gclid: string | null; gbraid: string | null; wbraid: string | null } | null) ?? null)
    },

    async countByStatus(statusId) {
      const { count } = await db()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('status_id', statusId)
      return count ?? 0
    },

    async countByReferralLink(linkId) {
      const { count } = await db()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('referral_link_id', linkId)
      return count ?? 0
    },
  }
}

export type { DbResult }
