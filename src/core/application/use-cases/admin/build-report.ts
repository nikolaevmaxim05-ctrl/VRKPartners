// use-cases/admin/build-report — аналитический отчёт и значения измерения для фильтра.
// Перенесено из lib/analytics-report-server.ts и роутов /analytics/{report,dimension-values}.
import { ok, fail, type Result } from '../../result'
import type { Clock } from '../../ports/common'
import type { AnalyticsRepository, UtmColumn } from '../../ports/analytics'
import type { UserRepository } from '../../ports/access'
import {
  buildReport as buildReportDomain,
  filterLeads,
  NO_REFERRAL_KEY,
  NO_REFERRAL_LABEL,
  type GroupBy,
  type LeadForAggregation,
  type ReportResponse,
  type MetricKeyForBreakdown,
} from '../../../domain/analytics/report'
import {
  kyivBoundaryToUtc,
  mapDbRowsToLeads,
  buildTimeseriesBreakdown,
  isValidBreakdownMetric,
  type BreakdownLabelMaps,
} from '../../../domain/analytics/report-breakdown'
import {
  parseReportQuery,
  dimensionParamsSchema,
  defaultDateFrom,
  defaultDateTo,
  dedupeSorted,
  splitIds,
  UUID_REGEX,
  DIMENSION_MAX_SCAN,
  type ReportServerParams,
} from '../../../domain/analytics/report-request'

const ROW_LIMIT = 10_000

export type ReportData = {
  leads: LeadForAggregation[]
  labelMap: Record<string, string>
  colorMap: Record<string, string>
  assigneeLabelMap: Record<string, string>
  /** id ссылки → название партнёра (из embed referral_links). */
  referralLabelMap: Record<string, string>
  flags: ReportResponse['flags']
}

export function makeReportUseCases(deps: { analytics: AnalyticsRepository; users: UserRepository; clock: Clock }) {
  const { analytics, users, clock } = deps

  async function fetchReportData(params: ReportServerParams): Promise<Result<ReportData>> {
    const res = await analytics.reportLeads({
      utcFrom: kyivBoundaryToUtc(params.date_from, false),
      utcTo: kyivBoundaryToUtc(params.date_to, true),
      utmSource: params.filter_utm_source,
      service: params.filter_service,
      assigneeIds: splitIds(params.filter_assignee_ids),
      assignedTo: params.filter_assigned_to,
      gclid: params.filter_gclid,
      statusIds: splitIds(params.filter_status_ids),
      referralLinkId: params.filter_referral_link_id ?? '',
      limit: ROW_LIMIT + 1,
    })
    if (!res.ok) {
      console.error('[analytics-report-server] query_failed', res.error)
      return fail('failed', 'Помилка сервера')
    }
    if ((res.data.count ?? res.data.rows.length) > ROW_LIMIT) {
      return fail('too_large', 'Звузіть діапазон дат', { code: 'TOO_MANY_ROWS' })
    }

    const leads = mapDbRowsToLeads(res.data.rows)
    const allAssignedIds = Array.from(new Set(leads.map((l) => l.assigned_to).filter((v): v is string => !!v)))
    const [flagsData, assigneeLabelMap] = await Promise.all([
      analytics.statusFlags(),
      users.getAssigneeLabelMap(allAssignedIds),
    ])
    const flags = {
      hasProfitStages: flagsData.some((s) => s.amount_is_profit === true),
      hasDealAdjustmentStages: flagsData.some((s) => s.conversion_type === 'deal_adjustment'),
    }

    if (params.group_by === 'custom_field' && params.custom_field_id) {
      const cf = await analytics.customFieldValuesByField(params.custom_field_id)
      const cfMap = new Map<string, string>((cf.ok ? cf.data : []).map((cv) => [cv.lead_id, cv.value as string]))
      for (const lead of leads) lead.custom_field_value = cfMap.get(lead.id) ?? null
    }

    let labelMap: Record<string, string> = {}
    const colorMap: Record<string, string> = {}
    if (params.group_by === 'status') {
      for (const lead of leads) {
        if (lead.status_id) {
          if (lead.status_name) labelMap[lead.status_id] = lead.status_name
          if (lead.status_color) colorMap[lead.status_id] = lead.status_color
        }
      }
    }
    if (params.group_by === 'assigned_to') labelMap = assigneeLabelMap

    const referralLabelMap: Record<string, string> = {}
    for (const lead of leads) {
      if (lead.referral_link_id && lead.referral_link_name) referralLabelMap[lead.referral_link_id] = lead.referral_link_name
    }
    if (params.group_by === 'referral_link') labelMap = { ...referralLabelMap, [NO_REFERRAL_KEY]: NO_REFERRAL_LABEL }

    return ok({ leads, labelMap, colorMap, assigneeLabelMap, referralLabelMap, flags })
  }

  async function buildReport(params: ReportServerParams): Promise<Result<ReportResponse>> {
    const data = await fetchReportData(params)
    if (!data.ok) return data
    const { leads, labelMap, colorMap, assigneeLabelMap, referralLabelMap, flags } = data.value

    const filterStatusIds = splitIds(params.filter_status_ids)
    const filterAssigneeIds = splitIds(params.filter_assignee_ids)

    const report = buildReportDomain(
      leads,
      {
        dateFrom: params.date_from,
        dateTo: params.date_to,
        groupBy: params.group_by as GroupBy,
        customFieldId: params.custom_field_id || undefined,
        tsGranularity: params.ts_granularity,
        filterUtmSource: params.filter_utm_source,
        filterService: params.filter_service,
        filterAssignedTo: params.filter_assigned_to,
        filterAssigneeIds: filterAssigneeIds.length > 0 ? filterAssigneeIds : undefined,
        filterStatusIds,
        filterGclid: params.filter_gclid,
        filterReferralLinkId: params.filter_referral_link_id || undefined,
        filterGroupValue: params.filter_group_value || undefined,
      },
      labelMap,
      colorMap,
      flags,
      assigneeLabelMap,
    )

    const breakdown = params.breakdown
    if (breakdown && breakdown !== 'none') {
      // Приоритет: breakdown_metrics (список) → breakdown_metric (легаси) → ['total']
      const fromList = (params.breakdown_metrics ?? '').split(',').map((s) => s.trim()).filter(isValidBreakdownMetric)
      const metrics: MetricKeyForBreakdown[] = fromList.length > 0
        ? [...new Set(fromList)]
        : [params.breakdown_metric && isValidBreakdownMetric(params.breakdown_metric) ? params.breakdown_metric : 'total']

      const filteredLeads = filterLeads(leads, {
        filterUtmSource: params.filter_utm_source || undefined,
        filterService: params.filter_service || undefined,
        filterAssignedTo: params.filter_assigned_to || undefined,
        filterAssigneeIds: filterAssigneeIds.length > 0 ? filterAssigneeIds : undefined,
        filterStatusIds: filterStatusIds.length > 0 ? filterStatusIds : undefined,
        filterGclid: params.filter_gclid,
        filterReferralLinkId: params.filter_referral_link_id || undefined,
        groupBy: params.group_by as GroupBy,
        filterGroupValue: params.filter_group_value || undefined,
      })

      const bStatusMap: Record<string, string> = {}
      if (breakdown === 'status') {
        for (const lead of filteredLeads) {
          if (lead.status_id && lead.status_name) bStatusMap[lead.status_id] = lead.status_name
        }
      }
      const labelMaps: BreakdownLabelMaps = {
        status: breakdown === 'status' ? bStatusMap : (params.group_by === 'status' ? labelMap : {}),
        assigned_to: assigneeLabelMap,
        referral_link: referralLabelMap,
      }

      report.timeseriesBreakdown = buildTimeseriesBreakdown(
        filteredLeads,
        params.date_from,
        params.date_to,
        params.ts_granularity,
        breakdown,
        metrics,
        labelMaps,
      )
    }

    return ok(report)
  }

  /** GET /analytics/report — разбор query + отчёт. */
  async function getReport(get: (key: string) => string | null): Promise<Result<ReportResponse>> {
    const parsed = parseReportQuery(get, clock.now())
    if (!parsed.ok) return fail('invalid', parsed.message)
    return buildReport(parsed.params)
  }

  /** GET /analytics/dimension-values — реальные значения выбранного измерения. */
  async function getDimensionValues(get: (key: string) => string | null): Promise<Result<Array<{ value: string; label: string }>>> {
    const parsed = dimensionParamsSchema.safeParse({
      dimension: get('dimension') ?? undefined,
      date_from: get('date_from') ?? undefined,
      date_to: get('date_to') ?? undefined,
      custom_field_id: get('custom_field_id') ?? '',
    })
    if (!parsed.success) return fail('invalid', parsed.error.errors.map((e) => e.message).join('; '))

    const { dimension, custom_field_id } = parsed.data
    const now = clock.now()
    const dateFrom = parsed.data.date_from ?? defaultDateFrom(now)
    const dateTo = parsed.data.date_to ?? defaultDateTo(now)
    const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }))

    try {
      if (dimension === 'custom_field') {
        if (!UUID_REGEX.test(custom_field_id)) {
          return fail('invalid', 'custom_field_id обовʼязковий і має бути валідним UUID')
        }
        const res = await analytics.customFieldValuesByField(custom_field_id, DIMENSION_MAX_SCAN)
        if (!res.ok) {
          console.error('[dimension-values] custom_field_query_failed', res.error)
          return fail('failed', 'Помилка сервера')
        }
        return ok(toOptions(dedupeSorted(res.data.map((r) => r.value))))
      }

      const res = await analytics.utmValues(
        dimension as UtmColumn,
        kyivBoundaryToUtc(dateFrom, false),
        kyivBoundaryToUtc(dateTo, true),
        DIMENSION_MAX_SCAN,
      )
      if (!res.ok) {
        console.error('[dimension-values] utm_query_failed', res.error)
        return fail('failed', 'Помилка сервера')
      }
      return ok(toOptions(dedupeSorted(res.data)))
    } catch (e) {
      console.error('[dimension-values] unexpected', e)
      return fail('failed', 'Помилка сервера')
    }
  }

  return { fetchReportData, buildReport, getReport, getDimensionValues }
}

export type ReportUseCases = ReturnType<typeof makeReportUseCases>
