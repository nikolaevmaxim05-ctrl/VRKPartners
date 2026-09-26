// infrastructure/supabase/repositories/referral-links — таблиця referral_links (міграція 035).
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { ReferralLinkRepository, ReferralLeadRows } from '@core/application/ports/referrals'
import type { ReferralLink, ReferralLinkRef } from '@core/domain/referral/link-rules'

const LINK_SELECT = 'id, name, code, is_active, notes, created_by, created_at, updated_at'
const REF_SELECT = 'id, name, code, is_active'
/** Як у звітах: не більше 10 000 рядків у памʼять. */
const LEAD_ROWS_LIMIT = 10_000

export function makeReferralLinkRepository(db: () => Db): ReferralLinkRepository {
  return {
    async list() {
      const { data, error } = await db().from('referral_links').select(LINK_SELECT).order('created_at', { ascending: false })
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as ReferralLink[])
    },

    async listRefs() {
      const { data, error } = await db().from('referral_links').select(REF_SELECT).order('name', { ascending: true })
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as ReferralLinkRef[])
    },

    async get(id) {
      const { data, error } = await db().from('referral_links').select(LINK_SELECT).eq('id', id).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as ReferralLink | null) ?? null)
    },

    async findByCode(code) {
      const { data, error } = await db().from('referral_links').select(REF_SELECT).eq('code', code).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as ReferralLinkRef | null) ?? null)
    },

    async insert(values) {
      const { data, error } = await db().from('referral_links').insert(values).select(LINK_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as ReferralLink)
    },

    async update(id, patch) {
      const { data, error } = await db().from('referral_links').update(patch).eq('id', id).select(LINK_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as ReferralLink)
    },

    async delete(id) {
      const { error } = await db().from('referral_links').delete().eq('id', id)
      return error ? dbFail(error.message, error.code) : dbOk(undefined)
    },

    async leadRows() {
      const { data, error } = await db()
        .from('leads')
        .select('referral_link_id, created_at')
        .not('referral_link_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(LEAD_ROWS_LIMIT + 1)
      if (error) return dbFail(error.message)
      const rows = (data ?? []) as ReferralLeadRows['rows']
      return dbOk({ rows: rows.slice(0, LEAD_ROWS_LIMIT), truncated: rows.length > LEAD_ROWS_LIMIT })
    },
  }
}
