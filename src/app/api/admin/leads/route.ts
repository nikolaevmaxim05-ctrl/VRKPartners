// GET /api/admin/leads — заявки с фильтрами/пагинацией + статус, ответственный, маркер повтора.
import { NextRequest } from 'next/server'
import { getLeadUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { queryGetter, respond } from '@/presentation/http'
import { LEAD_VIEW_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(LEAD_VIEW_PERMISSIONS, async () => respond(await getLeadUseCases().listLeads(queryGetter(request)), (v) => v))
