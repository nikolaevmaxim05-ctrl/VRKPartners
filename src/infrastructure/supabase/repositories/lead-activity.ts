// infrastructure/supabase/repositories/lead-activity — коментарі ліда та історія стадій.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type {
  LeadCommentRepository,
  LeadCommentRow,
  LeadHistoryRepository,
} from '@core/application/ports/leads'

const COMMENT_SELECT = 'id, lead_id, user_id, user_email, type, content, created_at'

export function makeLeadCommentRepository(db: () => Db): LeadCommentRepository {
  return {
    async list(leadId, type) {
      let query = db().from('lead_comments').select(COMMENT_SELECT).eq('lead_id', leadId).order('created_at', { ascending: true })
      if (type) query = query.eq('type', type)
      const { data, error } = await query
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as LeadCommentRow[])
    },

    async insert(row) {
      const { data, error } = await db().from('lead_comments').insert(row).select(COMMENT_SELECT).single()
      if (error) return dbFail(error.message)
      return dbOk(data as LeadCommentRow)
    },

    async insertMany(rows) {
      const { error } = await db().from('lead_comments').insert(rows)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}

export function makeLeadHistoryRepository(db: () => Db): LeadHistoryRepository {
  return {
    async insert(row) {
      const { error } = await db().from('lead_status_history').insert(row)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
