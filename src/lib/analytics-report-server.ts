/**
 * analytics-report-server.ts
 *
 * Серверний модуль: інкапсулює загальну логіку отримання даних
 * для /api/admin/analytics/report і /api/admin/analytics/export.
 *
 * Зовнішній контракт:
 *   fetchReportData(params)   — тягне сирі дані з БД, будує labelMap / colorMap
 *   buildReportForParams(params) — fetchReportData + buildReport
 *
 * ВАЖЛИВО: цей модуль НЕ можна імпортувати в client-bundle —
 * використовує createServiceClient (Node.js only).
 */

import { createServiceClient } from '@/lib/supabase/service'
import { buildReport } from '@core/domain/analytics/report'
import type {
  LeadForAggregation,
  ReportResponse,
  BreakdownDimension,
  MetricKeyForBreakdown,
} from '@core/domain/analytics/report'
import {
  getKyivOffsetMs,
  kyivBoundaryToUtc,
  mapDbRowsToLeads,
  buildTimeseriesBreakdown,
  isValidBreakdownMetric,
  type DbLeadRow,
} from '@core/domain/analytics/report-breakdown'

// Чисті частини переїхали в ядро (Фаза 1); реекспорт для сумісності з роутами.
export { getKyivOffsetMs, kyivBoundaryToUtc, mapDbRowsToLeads, buildTimeseriesBreakdown }
export type { DbLeadRow }

// ─── Публічний тип параметрів (мінімальне що треба обом роутам) ──────────────

export interface ReportServerParams {
  date_from: string               // YYYY-MM-DD
  date_to: string                 // YYYY-MM-DD
  group_by: string                // GroupBy
  custom_field_id?: string        // UUID, required when group_by='custom_field'
  ts_granularity: 'day' | 'week' | 'month'
  filter_utm_source: string
  filter_service: string
  filter_assigned_to: string
  /** Кілька відповідальних (UUID через кому). Має пріоритет над filter_assigned_to. */
  filter_assignee_ids?: string
  filter_status_ids: string       // UUID через кому
  filter_gclid: 'any' | 'with' | 'without'
  /** Фільтр по конкретному значенню поточного розрізу (group_by). Default: ''. */
  filter_group_value?: string
  /** Розбивка графіка по виміру. Default: 'none'. */
  breakdown?: BreakdownDimension
  /** Метрика для breakdown-ліній (легасі, одна). Default: 'total'. */
  breakdown_metric?: MetricKeyForBreakdown
  /** Метрики для breakdown-ліній (нове, список через кому). Має пріоритет. */
  breakdown_metrics?: string
}

// ─── Результат fetchReportData ────────────────────────────────────────────────

export interface ReportData {
  leads: LeadForAggregation[]
  labelMap: Record<string, string>
  colorMap: Record<string, string>
  assigneeLabelMap: Record<string, string>
  flags: ReportResponse['flags']
}

export type ReportDataResult =
  | ReportData
  | { error: string; status: number; code?: string }

// ─── Константа ────────────────────────────────────────────────────────────────

const ROW_LIMIT = 10_000

// ─── buildAssigneeLabelMap ───────────────────────────────────────────────────

export async function buildAssigneeLabelMap(
  service: ReturnType<typeof createServiceClient>,
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}
  try {
    const [{ data: usersData }, { data: rolesData }] = await Promise.all([
      service.auth.admin.listUsers({ perPage: 200 }),
      service
        .from('user_roles')
        .select('user_id, name')
        .in('user_id', userIds),
    ])
    const emailById = new Map(
      (usersData?.users ?? [])
        .filter((u) => userIds.includes(u.id))
        .map((u) => [u.id, u.email ?? u.id])
    )
    const nameById = new Map(
      (rolesData ?? [])
        .filter((r): r is { user_id: string; name: string } => !!r.name)
        .map((r) => [r.user_id, r.name])
    )
    const map: Record<string, string> = {}
    for (const id of userIds) {
      map[id] = nameById.get(id) ?? emailById.get(id) ?? id
    }
    return map
  } catch (e) {
    console.error('[analytics-report-server] assignee_resolve_failed', e)
    return {}
  }
}

// ─── fetchReportData ──────────────────────────────────────────────────────────

export async function fetchReportData(
  params: ReportServerParams,
): Promise<ReportDataResult> {
  const service = createServiceClient()

  const utcFrom = kyivBoundaryToUtc(params.date_from, false)
  const utcTo   = kyivBoundaryToUtc(params.date_to,   true)

  // Застосовуємо SQL-фільтри де можна (зменшуємо обсяг трафіку з БД)
  let query = service
    .from('leads')
    .select(
      `
        id,
        created_at,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        gclid,
        service,
        assigned_to,
        deal_amount,
        deal_profit,
        status_id,
        lead_statuses!left(id, name, color, conversion_type)
      `,
      { count: 'exact' }
    )
    .gte('created_at', utcFrom)
    .lte('created_at', utcTo)

  // SQL-фільтри для полів прямої рівності (зменшують кількість повернутих рядків)
  if (params.filter_utm_source) {
    query = query.eq('utm_source', params.filter_utm_source)
  }
  if (params.filter_service) {
    query = query.eq('service', params.filter_service)
  }
  const assigneeIds = params.filter_assignee_ids
    ? params.filter_assignee_ids.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  if (assigneeIds.length > 0) {
    query = query.in('assigned_to', assigneeIds)
  } else if (params.filter_assigned_to) {
    query = query.eq('assigned_to', params.filter_assigned_to)
  }
  if (params.filter_gclid === 'with') {
    query = query.not('gclid', 'is', null)
  } else if (params.filter_gclid === 'without') {
    query = query.is('gclid', null)
  }
  const filterStatusIds = params.filter_status_ids
    ? params.filter_status_ids.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  if (filterStatusIds.length > 0) {
    query = query.in('status_id', filterStatusIds)
  }

  const finalQuery = query.limit(ROW_LIMIT + 1)
  const { data: rows, error: dbError, count } = await finalQuery

  if (dbError) {
    console.error('[analytics-report-server] query_failed', dbError.message)
    return { error: 'Помилка сервера', status: 500 }
  }

  if ((count ?? rows?.length ?? 0) > ROW_LIMIT) {
    return { error: 'Звузіть діапазон дат', code: 'TOO_MANY_ROWS', status: 413 }
  }

  const dbRows = (rows ?? []) as unknown as DbLeadRow[]
  const leads  = mapDbRowsToLeads(dbRows)

  // Паралельно: флаги зі стадій + assigneeLabelMap
  const allAssignedIds = Array.from(
    new Set(leads.map((l) => l.assigned_to).filter((v): v is string => !!v))
  )

  const [statusFlagsResult, assigneeLabelMap] = await Promise.all([
    service.from('lead_statuses').select('conversion_type, amount_is_profit').limit(500),
    buildAssigneeLabelMap(service, allAssignedIds),
  ])

  const statusFlagsData = statusFlagsResult.data ?? []
  const hasProfitStages = statusFlagsData.some(
    (s) => (s as { amount_is_profit?: boolean }).amount_is_profit === true
  )
  const hasDealAdjustmentStages = statusFlagsData.some(
    (s) => s.conversion_type === 'deal_adjustment'
  )

  // Підстановка custom_field_value при group_by=custom_field
  if (params.group_by === 'custom_field' && params.custom_field_id) {
    const { data: cfValues } = await service
      .from('lead_custom_field_values')
      .select('lead_id, value')
      .eq('field_id', params.custom_field_id)

    const cfMap = new Map<string, string>(
      (cfValues ?? []).map((cv) => [cv.lead_id as string, cv.value as string])
    )

    for (const lead of leads) {
      lead.custom_field_value = cfMap.get(lead.id) ?? null
    }
  }

  // labelMap / colorMap залежать від group_by
  let labelMap: Record<string, string> = {}
  const colorMap: Record<string, string> = {}

  if (params.group_by === 'status') {
    for (const lead of leads) {
      if (lead.status_id) {
        if (lead.status_name)  labelMap[lead.status_id] = lead.status_name
        if (lead.status_color) colorMap[lead.status_id] = lead.status_color
      }
    }
  }

  if (params.group_by === 'assigned_to') {
    labelMap = assigneeLabelMap
  }

  return {
    leads,
    labelMap,
    colorMap,
    assigneeLabelMap,
    flags: { hasProfitStages, hasDealAdjustmentStages },
  }
}

// ─── buildReportForParams ─────────────────────────────────────────────────────

export async function buildReportForParams(
  params: ReportServerParams,
): Promise<ReportResponse | { error: string; status: number; code?: string }> {
  const result = await fetchReportData(params)
  if ('error' in result) return result

  const { leads, labelMap, colorMap, assigneeLabelMap, flags } = result

  const filterStatusIds = params.filter_status_ids
    ? params.filter_status_ids.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const filterAssigneeIds = params.filter_assignee_ids
    ? params.filter_assignee_ids.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const report = buildReport(
    leads,
    {
      dateFrom:         params.date_from,
      dateTo:           params.date_to,
      groupBy:          params.group_by as import('@/lib/analytics-report').GroupBy,
      customFieldId:    params.custom_field_id || undefined,
      tsGranularity:    params.ts_granularity,
      filterUtmSource:  params.filter_utm_source,
      filterService:    params.filter_service,
      filterAssignedTo: params.filter_assigned_to,
      filterAssigneeIds: filterAssigneeIds.length > 0 ? filterAssigneeIds : undefined,
      filterStatusIds,
      filterGclid:      params.filter_gclid,
      filterGroupValue: params.filter_group_value || undefined,
    },
    labelMap,
    colorMap,
    flags,
    assigneeLabelMap,
  )

  // Додаємо breakdown-таймсерію якщо запитана
  const breakdown = params.breakdown
  if (breakdown && breakdown !== 'none') {
    // Пріоритет: breakdown_metrics (список) → breakdown_metric (легасі) → ['total']
    const fromList = (params.breakdown_metrics ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(isValidBreakdownMetric)
    const metrics: MetricKeyForBreakdown[] = fromList.length > 0
      ? [...new Set(fromList)]
      : [params.breakdown_metric && isValidBreakdownMetric(params.breakdown_metric)
          ? params.breakdown_metric
          : 'total']

    // Для фільтрованих лідів (після filterLeads у buildReport)
    // використовуємо вже обчислений leads (вони вже без SQL-фільтрів потрапили в buildReport)
    // але потрібні filtered — запускаємо filterLeads вручну
    const { filterLeads } = await import('@/lib/analytics-report')
    const filteredLeads = filterLeads(leads, {
      filterUtmSource:  params.filter_utm_source || undefined,
      filterService:    params.filter_service || undefined,
      filterAssignedTo: params.filter_assigned_to || undefined,
      filterAssigneeIds: filterAssigneeIds.length > 0 ? filterAssigneeIds : undefined,
      filterStatusIds:  filterStatusIds.length > 0 ? filterStatusIds : undefined,
      filterGclid:      params.filter_gclid,
      groupBy:          params.group_by as import('@/lib/analytics-report').GroupBy,
      filterGroupValue: params.filter_group_value || undefined,
    })

    // statusLabelMap: для breakdown=status беремо labelMap (він заповнений для status)
    const statusLabelMap = params.group_by === 'status' ? labelMap : {}
    // Але якщо розріз не status, а breakdown=status — потрібно зібрати map зі leads
    const bStatusMap: Record<string, string> = {}
    if (breakdown === 'status') {
      for (const lead of filteredLeads) {
        if (lead.status_id && lead.status_name) {
          bStatusMap[lead.status_id] = lead.status_name
        }
      }
    }

    report.timeseriesBreakdown = buildTimeseriesBreakdown(
      filteredLeads,
      params.date_from,
      params.date_to,
      params.ts_granularity,
      breakdown,
      metrics,
      breakdown === 'status' ? bStatusMap : statusLabelMap,
      assigneeLabelMap,
    )
  }

  return report
}
