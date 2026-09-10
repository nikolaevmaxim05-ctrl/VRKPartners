// use-cases/admin/export-analytics — конструктор вивантаження (ліди / зведення, CSV / XLSX).
// Перенесено з /api/admin/analytics/export без зміни вмісту файлів.
import { ok, fail, type Result } from '../../result'
import type { AnalyticsRepository, SpreadsheetFileBuilder } from '../../ports/analytics'
import type { UserRepository } from '../../ports/access'
import type { ReportUseCases } from './build-report'
import {
  exportBodySchema,
  orderLeadFields,
  buildExportFileName,
  filtersToReportParams,
  type ExportBody,
} from '../../../domain/analytics/export-request'
import {
  buildLeadExportTable,
  exportNeedsHistory,
  groupHistory,
  groupComments,
  groupCustomFieldValues,
} from '../../../domain/analytics/export-leads'
import { buildLeadsCsv, buildSummaryCsv } from '../../../domain/analytics/export-csv'
import { filterByDealAmount, type SummaryColumn, type ComparisonPeriod } from '../../../domain/analytics/export'
import { kyivBoundaryToUtc } from '../../../domain/analytics/report-breakdown'
import { periodLabel } from '../../../domain/analytics/format'
import { getServiceLabel } from '../../../domain/lead/services'

const LEAD_EXPORT_LIMIT = 10_000

export type ExportFile = { fileName: string; contentType: string; body: string | ArrayBuffer }

const CSV_TYPE = 'text/csv; charset=utf-8'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function makeExportAnalytics(deps: {
  analytics: AnalyticsRepository
  users: UserRepository
  reports: ReportUseCases
  xlsx: SpreadsheetFileBuilder
}) {
  const { analytics, users, reports, xlsx } = deps

  async function exportLeads(body: ExportBody & { tab: 'leads' }): Promise<Result<ExportFile>> {
    const { filters, leadFields, dealAmountFrom, dealAmountTo, format } = body
    const orderedFields = orderLeadFields(leadFields)

    const res = await analytics.exportLeads({
      utcFrom: kyivBoundaryToUtc(filters.date_from, false),
      utcTo: kyivBoundaryToUtc(filters.date_to, true),
      utmSource: filters.filter_utm_source,
      service: filters.filter_service,
      assignedTo: filters.filter_assigned_to,
      gclid: filters.filter_gclid,
      statusIds: filters.filter_status_ids ?? [],
      limit: LEAD_EXPORT_LIMIT + 1,
    })
    if (!res.ok) {
      console.error('[export/leads] query_failed', res.error)
      return fail('failed', 'Помилка сервера')
    }
    if ((res.data.count ?? res.data.rows.length) > LEAD_EXPORT_LIMIT) {
      return fail('too_large', 'Забагато рядків для вивантаження — звузьте період або фільтри')
    }

    let rows = res.data.rows
    const daf = dealAmountFrom ?? null
    const dat = dealAmountTo ?? null
    if (daf != null || dat != null) rows = rows.filter((r) => filterByDealAmount(r.deal_amount, daf, dat))

    const leadIds = rows.map((r) => r.id)
    const assignedIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter((v): v is string => !!v)))
    const assigneeLabelMap = await users.getAssigneeLabelMap(assignedIds)

    const withCf = leadFields.includes('custom_fields') && leadIds.length > 0
    const customFieldDefs = withCf ? await analytics.customFieldDefs() : []
    const cfValuesByLead = groupCustomFieldValues(withCf ? await analytics.customFieldValuesByLeads(leadIds) : [])

    const { historyByLead, historyTypesById } = groupHistory(
      exportNeedsHistory(leadFields) && leadIds.length > 0 ? await analytics.historyByLeads(leadIds) : [],
    )
    const statusNamesById = new Map<string, string>(
      leadFields.includes('manager_history') ? (await analytics.statusNames()).map((s) => [s.id, s.name]) : [],
    )
    const commentsByLead = groupComments(
      leadFields.includes('comments') && leadIds.length > 0 ? await analytics.commentsByLeads(leadIds) : [],
    )

    const { headers, dataRows } = buildLeadExportTable({
      rows,
      orderedFields,
      customFieldDefs,
      cfValuesByLead,
      historyByLead,
      historyTypesById,
      statusNamesById,
      commentsByLead,
      assigneeLabelMap,
      serviceLabel: getServiceLabel,
    })

    const fileName = buildExportFileName(body)
    if (format === 'csv') return ok({ fileName, contentType: CSV_TYPE, body: buildLeadsCsv(headers, dataRows) })
    return ok({ fileName, contentType: XLSX_TYPE, body: await xlsx.leadsXlsx(headers, dataRows, orderedFields) })
  }

  async function exportSummary(body: ExportBody & { tab: 'summary' }): Promise<Result<ExportFile>> {
    const { filters, summaryColumns, includeDateBreakdown, granularity = 'day', comparePeriods, format } = body

    const main = await reports.buildReport(filtersToReportParams(filters, granularity))
    if (!main.ok) return main
    const mainReport = main.value

    const effectiveColumns: SummaryColumn[] = summaryColumns.filter(
      (col) => col !== 'dealProfitSum' || mainReport.flags.hasProfitStages,
    )

    const periods: ComparisonPeriod[] = [{ label: periodLabel(filters.date_from, filters.date_to), report: mainReport }]
    for (const cp of comparePeriods ?? []) {
      const r = await reports.buildReport(
        filtersToReportParams({ ...filters, date_from: cp.date_from, date_to: cp.date_to }, granularity),
      )
      if (!r.ok) {
        console.warn('[export/summary] compare_period_failed', r.message)
        continue
      }
      periods.push({ label: periodLabel(cp.date_from, cp.date_to), report: r.value })
    }

    const fileName = buildExportFileName(body)
    const breakdown = includeDateBreakdown ?? false
    if (format === 'csv') {
      return ok({ fileName, contentType: CSV_TYPE, body: buildSummaryCsv(periods, effectiveColumns, breakdown) })
    }
    return ok({ fileName, contentType: XLSX_TYPE, body: await xlsx.summaryXlsx(periods, effectiveColumns, breakdown) })
  }

  return async function exportAnalytics(rawBody: unknown): Promise<Result<ExportFile>> {
    const parsed = exportBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return fail('invalid', parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '))
    }
    const body = parsed.data
    if (body.tab === 'leads') {
      const { dealAmountFrom: daf, dealAmountTo: dat } = body
      if (daf != null && dat != null && daf > dat) return fail('invalid', 'dealAmountFrom не може бути більше dealAmountTo')
    }
    try {
      return body.tab === 'leads' ? await exportLeads(body) : await exportSummary(body)
    } catch (err) {
      console.error('[admin/analytics/export] generation_failed', err)
      return fail('failed', 'Помилка генерації файлу')
    }
  }
}
