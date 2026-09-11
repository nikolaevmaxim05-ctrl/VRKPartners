// infrastructure/supabase/repositories/audit-log — таблиця audit_log (лише запис; читає БД-адмін).
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { AuditLogRepository } from '@core/application/ports/system'

export function makeAuditLogRepository(db: () => Db): AuditLogRepository {
  return {
    async insert(entry) {
      const { error } = await db().from('audit_log').insert(entry)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
