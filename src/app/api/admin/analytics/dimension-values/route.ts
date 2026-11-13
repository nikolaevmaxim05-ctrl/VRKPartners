// GET /api/admin/analytics/dimension-values — реальные значения измерения (utm_* / custom_field)
// для контекстного фильтра «Значення» на вкладке Аналитика. Ответ: { data: { value, label }[] }
import { NextRequest } from 'next/server'
import { getReportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { queryGetter, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(['view_reports'], async () => respond(await getReportUseCases().getDimensionValues(queryGetter(request))))
