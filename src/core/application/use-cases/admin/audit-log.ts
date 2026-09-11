// use-cases/admin/audit-log — екран «Журнал дій»: сторінка записів audit_log (найновіші зверху).
import { ok, fail, type Result } from '../../result'
import type { AuditLogRepository, AuditRow } from '../../ports/system'
import { pageMeta } from '../../paging'

export function makeAuditLogUseCases(deps: { audit: AuditLogRepository }) {
  async function listAuditLog(get: (k: string) => string | null): Promise<Result<Record<string, unknown>>> {
    const page = Math.max(1, parseInt(get('page') ?? '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(get('limit') ?? '50') || 50))
    const res = await deps.audit.listPage(page, limit)
    if (!res.ok) {
      console.error('[admin/audit-log] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok({ data: res.data.rows as AuditRow[], ...pageMeta(res.data.total, page, limit) })
  }
  return { listAuditLog }
}
