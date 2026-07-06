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
import {
  buildReport,
  toKyivDateKey,
  toKyivWeekKey,
  toKyivMonthKey,
  generateBuckets,
} from '@/lib/analytics-report'
import type {
  LeadForAggregation,
  ReportResponse,
  BreakdownDimension,
  MetricKeyForBreakdown,
  TimeseriesBreakdown,
  BreakdownSeries,
  TsGranularity,
} from '@/lib/analytics-report'

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

// Мітки метрик для підписів серій у multi-metric breakdown
const BREAKDOWN_METRIC_LABELS: Record<MetricKeyForBreakdown, string> = {
  total:          'Заявки',
  targetLeads:    'Цільові',
  nonTargetLeads: 'Нецільові',
  deals:          'Угоди',
  dealAmountSum:  'Сума угод',
  dealProfitSum:  'Прибуток',
}

const BREAKDOWN_METRIC_SET = new Set<string>([
  'total', 'targetLeads', 'nonTargetLeads', 'deals', 'dealAmountSum', 'dealProfitSum',
])
function isValidBreakdownMetric(v: string): v is MetricKeyForBreakdown {
  return BREAKDOWN_METRIC_SET.has(v)
}

// ─── Тип рядка з БД (загальний для обох роутів) ──────────────────────────────

export type DbLeadRow = {
  id: string
  created_at: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  service: string | null
  assigned_to: string | null
  deal_amount: number | null
  deal_profit: number | null
  status_id: string | null
  lead_statuses: {
    id: string
    name: string
    color: string | null
    conversion_type: string | null
  } | null
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

// ─── Конвертація Kyiv-дати у UTC ─────────────────────────────────────────────

export function getKyivOffsetMs(utcDate: Date): number {
  const kyivStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(utcDate)
  const kyivAsUtcMs = new Date(kyivStr.replace(' ', 'T') + 'Z').getTime()
  return kyivAsUtcMs - utcDate.getTime()
}

export function kyivBoundaryToUtc(dateStr: string, endOfDay: boolean): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const midday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const kyivOffsetMs = getKyivOffsetMs(midday)
  const msInDay = endOfDay
    ? 23 * 3600_000 + 59 * 60_000 + 59 * 1000 + 999
    : 0
  const baseUtcMs =
    Date.UTC(year, month - 1, day) +
    msInDay -
    kyivOffsetMs
  return new Date(baseUtcMs).toISOString()
}

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

// ─── mapDbRowsToLeads ─────────────────────────────────────────────────────────

export function mapDbRowsToLeads(dbRows: DbLeadRow[]): LeadForAggregation[] {
  return dbRows.map((r) => {
    const statusRaw = Array.isArray(r.lead_statuses)
      ? r.lead_statuses[0]
      : r.lead_statuses
    return {
      id:                     r.id,
      created_at:             r.created_at,
      utm_source:             r.utm_source,
      utm_medium:             r.utm_medium,
      utm_campaign:           r.utm_campaign,
      utm_term:               r.utm_term,
      utm_content:            r.utm_content,
      gclid:                  r.gclid,
      service:                r.service,
      assigned_to:            r.assigned_to,
      deal_amount:            r.deal_amount,
      deal_profit:            r.deal_profit,
      status_id:              r.status_id,
      status_conversion_type: (statusRaw?.conversion_type ?? null) as LeadForAggregation['status_conversion_type'],
      status_name:            statusRaw?.name ?? null,
      status_color:           statusRaw?.color ?? null,
    }
  })
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

// ─── Палітра кольорів для серій breakdown ────────────────────────────────────

const BREAKDOWN_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
]

const OTHER_COLOR = '#94a3b8' // slate

/** Максимальна кількість серій (решта йдуть в «Інші»). */
const MAX_BREAKDOWN_SERIES = 8

// ─── Хелпер: витягти значення виміру з ліда ──────────────────────────────────

function getBreakdownKey(
  lead: LeadForAggregation,
  dimension: BreakdownDimension,
  statusLabelMap: Record<string, string>,
): string {
  switch (dimension) {
    case 'utm_source':   return lead.utm_source   ?? '(невідомо)'
    case 'utm_medium':   return lead.utm_medium   ?? '(невідомо)'
    case 'utm_campaign': return lead.utm_campaign ?? '(невідомо)'
    case 'utm_term':     return lead.utm_term     ?? '(невідомо)'
    case 'utm_content':  return lead.utm_content  ?? '(невідомо)'
    case 'service':      return lead.service      ?? '(невідомо)'
    case 'assigned_to':  return lead.assigned_to  ?? '(невідомо)'
    case 'status': {
      const key = lead.status_id ?? '(невідомо)'
      return key
    }
    default:             return '(невідомо)'
  }
}

/** Повертає відображувану назву ключа для виміру. */
function getBreakdownLabel(
  key: string,
  dimension: BreakdownDimension,
  statusLabelMap: Record<string, string>,
  assigneeLabelMap: Record<string, string>,
): string {
  if (dimension === 'status') return statusLabelMap[key] ?? key
  if (dimension === 'assigned_to') {
    if (key === '(невідомо)') return 'Без відповідального'
    return assigneeLabelMap[key] ?? key
  }
  return key
}

/** Повертає числове значення метрики з агрегату. */
function getMetricValue(
  agg: {
    total: number
    targetLeads: number
    nonTargetLeads: number
    deals: number
    dealAmountSum: number
    dealProfitSum: number
  },
  metric: MetricKeyForBreakdown,
): number {
  switch (metric) {
    case 'total':          return agg.total
    case 'targetLeads':    return agg.targetLeads
    case 'nonTargetLeads': return agg.nonTargetLeads
    case 'deals':          return agg.deals
    case 'dealAmountSum':  return agg.dealAmountSum
    case 'dealProfitSum':  return agg.dealProfitSum
  }
}

// ─── buildTimeseriesBreakdown ─────────────────────────────────────────────────

/**
 * Будує таймсерію з розбивкою по одному виміру.
 *
 * Алгоритм:
 * 1. Для кожного ліда визначаємо ключ виміру (utm_source тощо).
 * 2. Агрегуємо: Map<dimensionKey, Map<dateKey, Bucket>>.
 * 3. Обчислюємо суму метрики по кожному виміру за весь період.
 * 4. Відбираємо топ-MAX_BREAKDOWN_SERIES; решту — в '__other__'.
 * 5. Генеруємо всі бакети і заповнюємо нулями де нема даних.
 */
export function buildTimeseriesBreakdown(
  leads: LeadForAggregation[],
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity,
  dimension: BreakdownDimension,
  metrics: MetricKeyForBreakdown[],
  statusLabelMap: Record<string, string> = {},
  assigneeLabelMap: Record<string, string> = {},
): TimeseriesBreakdown {
  type Bucket = {
    total: number
    targetLeads: number
    nonTargetLeads: number
    deals: number
    dealAmountSum: number
    dealProfitSum: number
  }

  const emptyBucket = (): Bucket => ({
    total: 0,
    targetLeads: 0,
    nonTargetLeads: 0,
    deals: 0,
    dealAmountSum: 0,
    dealProfitSum: 0,
  })

  // Map<dimensionKey, Map<dateKey, Bucket>>
  const dimMap = new Map<string, Map<string, Bucket>>()

  for (const lead of leads) {
    const dimKey = getBreakdownKey(lead, dimension, statusLabelMap)

    // Ключ бакету по даті
    let dateKey: string
    if (granularity === 'day') {
      dateKey = toKyivDateKey(lead.created_at)
    } else if (granularity === 'week') {
      dateKey = toKyivWeekKey(lead.created_at)
    } else {
      dateKey = toKyivMonthKey(lead.created_at)
    }

    let dateMap = dimMap.get(dimKey)
    if (!dateMap) {
      dateMap = new Map()
      dimMap.set(dimKey, dateMap)
    }

    const bucket = dateMap.get(dateKey) ?? emptyBucket()

    bucket.total += 1
    if (lead.status_conversion_type === 'target_lead')    bucket.targetLeads    += 1
    if (lead.status_conversion_type === 'non_target_lead') bucket.nonTargetLeads += 1
    if (lead.status_conversion_type === 'deal')            bucket.deals          += 1
    if (lead.deal_amount != null) bucket.dealAmountSum += lead.deal_amount
    if (lead.deal_profit != null) bucket.dealProfitSum += lead.deal_profit

    dateMap.set(dateKey, bucket)
  }

  // Первинна метрика — для ранжування вимірів (топ-N)
  const primaryMetric = metrics[0] ?? 'total'
  const multi = metrics.length > 1

  // Ранжуємо виміри по сумі первинної метрики
  const dimTotals: { key: string; total: number }[] = []
  for (const [dimKey, dateMap] of dimMap.entries()) {
    let sum = 0
    for (const bucket of dateMap.values()) {
      sum += getMetricValue(bucket, primaryMetric)
    }
    dimTotals.push({ key: dimKey, total: sum })
  }
  dimTotals.sort((a, b) => b.total - a.total)

  const topDims = dimTotals.slice(0, MAX_BREAKDOWN_SERIES).map((d) => d.key)
  const topKeys = new Set(topDims)
  const hasOther = dimTotals.length > MAX_BREAKDOWN_SERIES

  // Композитний ключ серії: значення виміру + метрика ( — безпечний розділювач)
  const seriesKey = (dimKey: string, m: MetricKeyForBreakdown) => `${dimKey}${m}`

  // Список вимірів для серій (+ «Інші», якщо є хвіст)
  const dimsForSeries = hasOther ? [...topDims, '__other__'] : topDims

  // Будуємо серії: кожен топ-вимір × кожна метрика
  const series: BreakdownSeries[] = []
  let colorIdx = 0
  for (const dimKey of dimsForSeries) {
    const dimLabel = dimKey === '__other__'
      ? 'Інші'
      : getBreakdownLabel(dimKey, dimension, statusLabelMap, assigneeLabelMap)
    for (const m of metrics) {
      series.push({
        key: seriesKey(dimKey, m),
        // При одній метриці підпис = лише вимір; при кількох — «вимір · метрика»
        label: multi ? `${dimLabel} · ${BREAKDOWN_METRIC_LABELS[m]}` : dimLabel,
        color: dimKey === '__other__'
          ? OTHER_COLOR
          : BREAKDOWN_COLORS[colorIdx % BREAKDOWN_COLORS.length],
      })
      colorIdx++
    }
  }

  // Генеруємо всі бакети часового ряду
  const buckets = generateBuckets(dateFrom, dateTo, granularity)

  // Зводимо агрегат «Інші» — Map<dateKey, Bucket> (зберігає всі метрики)
  const otherMap = new Map<string, Bucket>()
  if (hasOther) {
    for (const [dimKey, dateMap] of dimMap.entries()) {
      if (!topKeys.has(dimKey)) {
        for (const [dateKey, bucket] of dateMap.entries()) {
          const existing = otherMap.get(dateKey) ?? emptyBucket()
          existing.total           += bucket.total
          existing.targetLeads     += bucket.targetLeads
          existing.nonTargetLeads  += bucket.nonTargetLeads
          existing.deals           += bucket.deals
          existing.dealAmountSum   += bucket.dealAmountSum
          existing.dealProfitSum   += bucket.dealProfitSum
          otherMap.set(dateKey, existing)
        }
      }
    }
  }

  // Формуємо points: на кожен бакет — значення по кожній серії (вимір × метрика)
  const points = buckets.map(({ dateIso, label }) => {
    const values: Record<string, number> = {}
    for (const dimKey of dimsForSeries) {
      const bucket = dimKey === '__other__'
        ? (otherMap.get(dateIso) ?? emptyBucket())
        : (dimMap.get(dimKey)?.get(dateIso) ?? emptyBucket())
      for (const m of metrics) {
        values[seriesKey(dimKey, m)] = getMetricValue(bucket, m)
      }
    }
    return { dateIso, label, values }
  })

  return { metrics, series, points }
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
    let bStatusMap: Record<string, string> = {}
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
