// GET /api/admin/analytics/report — зведений аналітичний звіт.
// Параметри (snake_case): date_from, date_to, group_by, custom_field_id, ts_granularity,
// filter_utm_source, filter_service, filter_assigned_to, filter_assignee_ids, filter_status_ids,
// filter_gclid, filter_group_value, breakdown, breakdown_metric, breakdown_metrics.
import { NextRequest } from 'next/server'
import { getReportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { queryGetter, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(['view_reports'], async () =>
    respond(await getReportUseCases().getReport(queryGetter(request)), (report) => report),
  )
