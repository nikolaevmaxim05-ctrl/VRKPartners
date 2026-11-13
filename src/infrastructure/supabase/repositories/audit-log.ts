// infrastructure/supabase/repositories/audit-log — таблица audit_log (запись из сценариев, страница для экрана «Журнал дій»).
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { AuditLogRepository, AuditRow } from '@core/application/ports/system'

export function makeAuditLogRepository(db: () => Db): AuditLogRepository {
  return {
    async insert(entry) {
      const { error } = await db().from('audit_log').insert(entry)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async listPage(page, limit) {
      const offset = (page - 1) * limit
      const { data, count, error } = await db()
        .from('audit_log')
        .select('id, created_at, user_id, user_email, action, resource, old_value, new_value, ip_address', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as AuditRow[], total: count ?? 0 })
    },
  }
}
