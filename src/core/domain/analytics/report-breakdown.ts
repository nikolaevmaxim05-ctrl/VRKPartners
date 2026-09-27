// core/domain/analytics/report-breakdown — чисті частини lib/analytics-report-server.ts:
// конвертація Київ→UTC, маппінг рядків БД у LeadForAggregation, розбивка часового ряду.
// Отримання даних з БД лишається в серверному модулі (Фаза 2 → use-case build-report).
import { toKyivDateKey, toKyivWeekKey, toKyivMonthKey, generateBuckets, NO_REFERRAL_KEY, NO_REFERRAL_LABEL } from './report'
import type {
  LeadForAggregation,
  BreakdownDimension,
  MetricKeyForBreakdown,
  TimeseriesBreakdown,
  BreakdownSeries,
  TsGranularity,
} from './report'

export const CLIENT_TIME_ZONE = 'Europe/Kyiv'

// ─── Мітки метрик для підписів серій у multi-metric breakdown ────────────────

export const BREAKDOWN_METRIC_LABELS: Record<MetricKeyForBreakdown, string> = {
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
export function isValidBreakdownMetric(v: string): v is MetricKeyForBreakdown {
  return BREAKDOWN_METRIC_SET.has(v)
}

/** Максимум серій у розбивці (решта — «Інші»). */
export const MAX_BREAKDOWN_SERIES = 8
export const OTHER_COLOR = '#94a3b8' // slate
export const BREAKDOWN_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
]

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
  referral_link_id: string | null
  referral_code: string | null
  /** Embed referral_links!left(id, name); відсутній у старих фікстурах → трактується як null. */
  referral_links?: { id: string; name: string } | null
}

/** Назва партнера з embed (PostgREST може віддати обʼєкт або масив з одним елементом). */
export function referralNameOf(row: Pick<DbLeadRow, 'referral_links'>): string | null {
  const raw = Array.isArray(row.referral_links) ? row.referral_links[0] : row.referral_links
  return raw?.name ?? null
}

// ─── Конвертація Kyiv-дати у UTC ─────────────────────────────────────────────

export function getKyivOffsetMs(utcDate: Date): number {
  const kyivStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: CLIENT_TIME_ZONE,
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
  const baseUtcMs = Date.UTC(year, month - 1, day) + msInDay - kyivOffsetMs
  return new Date(baseUtcMs).toISOString()
}

// ─── mapDbRowsToLeads ─────────────────────────────────────────────────────────

export function mapDbRowsToLeads(dbRows: DbLeadRow[]): LeadForAggregation[] {
  return dbRows.map((r) => {
    const statusRaw = Array.isArray(r.lead_statuses) ? r.lead_statuses[0] : r.lead_statuses
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
      referral_link_id:       r.referral_link_id ?? null,
      referral_link_name:     referralNameOf(r),
      referral_code:          r.referral_code ?? null,
    }
  })
}

/** Словники key → підпис для вимірів, що потребують «олюднення» ключа (стадія, відповідальний, партнер). */
export type BreakdownLabelMaps = Partial<Record<BreakdownDimension, Record<string, string>>>

// ─── Ключ/підпис виміру розбивки ─────────────────────────────────────────────

export function getBreakdownKey(
  lead: LeadForAggregation,
  dimension: BreakdownDimension,
): string {
  switch (dimension) {
    case 'utm_source':   return lead.utm_source   ?? '(невідомо)'
    case 'utm_medium':   return lead.utm_medium   ?? '(невідомо)'
    case 'utm_campaign': return lead.utm_campaign ?? '(невідомо)'
    case 'utm_term':     return lead.utm_term     ?? '(невідомо)'
    case 'utm_content':  return lead.utm_content  ?? '(невідомо)'
    case 'service':      return lead.service      ?? '(невідомо)'
    case 'assigned_to':  return lead.assigned_to  ?? '(невідомо)'
    case 'status':       return lead.status_id    ?? '(невідомо)'
    case 'referral_link': return lead.referral_link_id ?? NO_REFERRAL_KEY
    default:             return '(невідомо)'
  }
}

/** Повертає відображувану назву ключа для виміру. */
export function getBreakdownLabel(
  key: string,
  dimension: BreakdownDimension,
  labelMaps: BreakdownLabelMaps = {},
): string {
  if (dimension === 'assigned_to' && key === '(невідомо)') return 'Без відповідального'
  if (dimension === 'referral_link' && key === NO_REFERRAL_KEY) return NO_REFERRAL_LABEL
  return labelMaps[dimension]?.[key] ?? key
}

type Bucket = {
  total: number
  targetLeads: number
  nonTargetLeads: number
  deals: number
  dealAmountSum: number
  dealProfitSum: number
}

/** Повертає числове значення метрики з агрегату. */
export function getMetricValue(agg: Bucket, metric: MetricKeyForBreakdown): number {
  switch (metric) {
    case 'total':          return agg.total
    case 'targetLeads':    return agg.targetLeads
    case 'nonTargetLeads': return agg.nonTargetLeads
    case 'deals':          return agg.deals
    case 'dealAmountSum':  return agg.dealAmountSum
    case 'dealProfitSum':  return agg.dealProfitSum
  }
}

// ─── buildTimeseriesBreakdown ────────────────────────────────────────────────

export function buildTimeseriesBreakdown(
  leads: LeadForAggregation[],
  dateFrom: string,
  dateTo: string,
  granularity: TsGranularity,
  dimension: BreakdownDimension,
  metrics: MetricKeyForBreakdown[],
  labelMaps: BreakdownLabelMaps = {},
): TimeseriesBreakdown {
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
    const dimKey = getBreakdownKey(lead, dimension)

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
    if (lead.status_conversion_type === 'target_lead')     bucket.targetLeads    += 1
    if (lead.status_conversion_type === 'non_target_lead') bucket.nonTargetLeads += 1
    if (lead.status_conversion_type === 'deal')            bucket.deals          += 1
    if (lead.deal_amount != null) bucket.dealAmountSum += lead.deal_amount
    if (lead.deal_profit != null) bucket.dealProfitSum += lead.deal_profit

    dateMap.set(dateKey, bucket)
  }

  const primaryMetric = metrics[0] ?? 'total'
  const multi = metrics.length > 1

  const dimTotals: { key: string; total: number }[] = []
  for (const [dimKey, dateMap] of dimMap.entries()) {
    let sum = 0
    for (const bucket of dateMap.values()) sum += getMetricValue(bucket, primaryMetric)
    dimTotals.push({ key: dimKey, total: sum })
  }
  dimTotals.sort((a, b) => b.total - a.total)

  const topDims = dimTotals.slice(0, MAX_BREAKDOWN_SERIES).map((d) => d.key)
  const topKeys = new Set(topDims)
  const hasOther = dimTotals.length > MAX_BREAKDOWN_SERIES

  const seriesKey = (dimKey: string, m: MetricKeyForBreakdown) => `${dimKey}${m}`
  const dimsForSeries = hasOther ? [...topDims, '__other__'] : topDims

  const series: BreakdownSeries[] = []
  let colorIdx = 0
  for (const dimKey of dimsForSeries) {
    const dimLabel = dimKey === '__other__'
      ? 'Інші'
      : getBreakdownLabel(dimKey, dimension, labelMaps)
    for (const m of metrics) {
      series.push({
        key: seriesKey(dimKey, m),
        label: multi ? `${dimLabel} · ${BREAKDOWN_METRIC_LABELS[m]}` : dimLabel,
        color: dimKey === '__other__'
          ? OTHER_COLOR
          : BREAKDOWN_COLORS[colorIdx % BREAKDOWN_COLORS.length],
      })
      colorIdx++
    }
  }

  const buckets = generateBuckets(dateFrom, dateTo, granularity)

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

  const points = buckets.map(({ dateIso, label }) => {
    const values: Record<string, number> = {}
    for (const dimKey of dimsForSeries) {
      const bucket = dimKey === '__other__'
        ? (otherMap.get(dateIso) ?? emptyBucket())
        : (dimMap.get(dimKey)?.get(dateIso) ?? emptyBucket())
      for (const m of metrics) values[seriesKey(dimKey, m)] = getMetricValue(bucket, m)
    }
    return { dateIso, label, values }
  })

  return { metrics, series, points }
}
