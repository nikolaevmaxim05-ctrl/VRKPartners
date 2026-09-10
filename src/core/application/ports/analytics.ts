// core/application/ports/analytics — вибірки для звітів і вивантажень, файли XLSX.
import type { DbResult } from './common'
import type { DbLeadRow } from '../../domain/analytics/report-breakdown'
import type {
  ExportLeadRow,
  ExportHistoryRow,
  ExportCommentRow,
  CellValue,
} from '../../domain/analytics/export-leads'
import type { LeadExportField } from '../../domain/analytics/export-request'
import type { ComparisonPeriod, SummaryColumn } from '../../domain/analytics/export'

export type ReportLeadQuery = {
  utcFrom: string
  utcTo: string
  utmSource: string
  service: string
  assigneeIds: string[]
  assignedTo: string
  gclid: 'any' | 'with' | 'without'
  statusIds: string[]
  limit: number
}

export type ExportLeadQuery = {
  utcFrom: string
  utcTo: string
  utmSource: string
  service: string
  assignedTo: string
  gclid: 'any' | 'with' | 'without'
  statusIds: string[]
  limit: number
}

export type UtmColumn = 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content'

export interface AnalyticsRepository {
  reportLeads(q: ReportLeadQuery): Promise<DbResult<{ rows: DbLeadRow[]; count: number | null }>>
  exportLeads(q: ExportLeadQuery): Promise<DbResult<{ rows: ExportLeadRow[]; count: number | null }>>
  statusFlags(): Promise<Array<{ conversion_type: string | null; amount_is_profit?: boolean }>>
  statusNames(): Promise<Array<{ id: string; name: string }>>
  customFieldValuesByField(fieldId: string, limit?: number): Promise<DbResult<Array<{ lead_id: string; value: string | null }>>>
  customFieldDefs(): Promise<Array<{ id: string; name: string }>>
  /** Батчами по 500. */
  customFieldValuesByLeads(leadIds: string[]): Promise<Array<{ lead_id: string; field_id: string; value: string }>>
  historyByLeads(leadIds: string[]): Promise<ExportHistoryRow[]>
  commentsByLeads(leadIds: string[]): Promise<ExportCommentRow[]>
  utmValues(col: UtmColumn, utcFrom: string, utcTo: string, limit: number): Promise<DbResult<unknown[]>>
}

/** Побудова XLSX (ExcelJS) — в інфраструктурі. */
export interface SpreadsheetFileBuilder {
  leadsXlsx(headers: string[], rows: CellValue[][], fields: LeadExportField[]): Promise<ArrayBuffer>
  summaryXlsx(periods: ComparisonPeriod[], columns: SummaryColumn[], includeDateBreakdown: boolean): Promise<ArrayBuffer>
}
