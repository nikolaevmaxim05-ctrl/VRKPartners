// core/domain/analytics/export-request — тіло запиту вивантаження (Zod), порядок полів, імʼя файлу.
// Перенесено з /api/admin/analytics/export без зміни поведінки.
import { z } from 'zod'
import type { ReportServerParams } from './report-request'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const exportFiltersSchema = z.object({
  date_from:           z.string().regex(DATE_RE, 'date_from має бути YYYY-MM-DD'),
  date_to:             z.string().regex(DATE_RE, 'date_to має бути YYYY-MM-DD'),
  filter_utm_source:   z.string().optional().default(''),
  filter_service:      z.string().optional().default(''),
  filter_assigned_to:  z.string().optional().default(''),
  filter_assignee_ids: z.array(z.string()).optional().default([]),
  filter_status_ids:   z.array(z.string()).optional().default([]),
  filter_gclid:        z.enum(['any', 'with', 'without']).optional().default('any'),
})

export const leadExportFieldSchema = z.enum([
  'dates', 'utm_source', 'all_utm', 'status', 'custom_fields',
  'manager_history', 'comments', 'phone', 'email', 'service',
  'assigned_to', 'deal_amount', 'was_target', 'was_non_target',
])

export type LeadExportField = z.infer<typeof leadExportFieldSchema>
export type ExportFilters = z.infer<typeof exportFiltersSchema>

// Порядок колонок: від значущих (основні дані ліда) до другорядних (UTM, історія, чат).
export const LEAD_FIELD_ORDER: LeadExportField[] = [
  'dates', 'phone', 'email', 'service', 'status', 'assigned_to',
  'deal_amount', 'was_target', 'was_non_target',
  'utm_source', 'all_utm', 'custom_fields', 'manager_history', 'comments',
]

export function orderLeadFields(fields: LeadExportField[]): LeadExportField[] {
  return [...fields].sort((a, b) => LEAD_FIELD_ORDER.indexOf(a) - LEAD_FIELD_ORDER.indexOf(b))
}

export const summaryColumnSchema = z.enum([
  'total', 'nonTargetLeads', 'targetLeads', 'deals',
  'dealAmountSum', 'dealProfitSum',
  'conversionToNonTarget', 'conversionToTarget', 'conversionToDeal',
])

const comparePeriodSchema = z.object({
  date_from: z.string().regex(DATE_RE),
  date_to:   z.string().regex(DATE_RE),
})

export const exportBodySchema = z.discriminatedUnion('tab', [
  z.object({
    format:  z.enum(['csv', 'xlsx']),
    tab:     z.literal('leads'),
    filters: exportFiltersSchema,
    leadFields:           z.array(leadExportFieldSchema).min(1, 'leadFields не може бути порожнім'),
    dealAmountFrom:       z.number().nullable().optional(),
    dealAmountTo:         z.number().nullable().optional(),
    comparePeriods:       z.array(comparePeriodSchema).max(5).optional(),
    summaryColumns:       z.array(summaryColumnSchema).optional(),
    includeDateBreakdown: z.boolean().optional(),
    granularity:          z.enum(['day', 'week', 'month']).optional(),
  }),
  z.object({
    format:  z.enum(['csv', 'xlsx']),
    tab:     z.literal('summary'),
    filters: exportFiltersSchema,
    summaryColumns:       z.array(summaryColumnSchema).min(1, 'summaryColumns не може бути порожнім'),
    includeDateBreakdown: z.boolean().optional().default(false),
    granularity:          z.enum(['day', 'week', 'month']).optional().default('day'),
    comparePeriods:       z.array(comparePeriodSchema).max(5).optional(),
    leadFields:           z.array(leadExportFieldSchema).optional(),
    dealAmountFrom:       z.number().nullable().optional(),
    dealAmountTo:         z.number().nullable().optional(),
  }),
])

export type ExportBody = z.infer<typeof exportBodySchema>

export function buildExportFileName(body: ExportBody): string {
  const { date_from, date_to } = body.filters
  const ext = body.format
  if (body.tab === 'leads') return `leads_${date_from}_${date_to}.${ext}`
  const suffix = body.comparePeriods?.length ? '_compare' : ''
  return `analytics_${date_from}_${date_to}${suffix}.${ext}`
}

/** Фільтри вивантаження → параметри звіту (для summary — розбивка за часом). */
export function filtersToReportParams(
  filters: ExportFilters,
  granularity: 'day' | 'week' | 'month' = 'day',
): ReportServerParams {
  return {
    date_from:           filters.date_from,
    date_to:             filters.date_to,
    group_by:            granularity,
    ts_granularity:      granularity,
    filter_utm_source:   filters.filter_utm_source ?? '',
    filter_service:      filters.filter_service ?? '',
    filter_assigned_to:  filters.filter_assigned_to ?? '',
    filter_assignee_ids: (filters.filter_assignee_ids ?? []).join(','),
    filter_status_ids:   (filters.filter_status_ids ?? []).join(','),
    filter_gclid:        filters.filter_gclid ?? 'any',
  }
}
