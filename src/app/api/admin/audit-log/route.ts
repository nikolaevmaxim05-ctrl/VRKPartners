// GET /api/admin/audit-log?page=&limit= — журнал действий админов (audit_log), новейшие сверху.
import { NextRequest } from 'next/server'
import { getAuditLogUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond, queryGetter } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(['manage_users'], async () => respond(await getAuditLogUseCases().listAuditLog(queryGetter(request)), (v) => v))
