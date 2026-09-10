// GET /api/admin/analytics/dimension-values — реальні значення виміру (utm_* / custom_field)
// для контекстного фільтра «Значення» на вкладці Аналітика. Відповідь: { data: { value, label }[] }
import { NextRequest } from 'next/server'
import { getReportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { queryGetter, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(['view_reports'], async () => respond(await getReportUseCases().getDimensionValues(queryGetter(request))))
