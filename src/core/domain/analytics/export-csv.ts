// core/domain/analytics/export-csv — CSV-выгрузка (лидов и сводки). Чистая логика.
import {
  sanitizeCsvCell,
  wrapPhoneForCsv,
  buildPeriodRows,
  buildComparisonTable,
  SUMMARY_COLUMN_HEADERS,
  type SummaryColumn,
  type ComparisonPeriod,
} from './export'
import type { CellValue } from './export-leads'
import { formatKyivDateTime } from './format'

const BOM = '﻿'

export function buildLeadsCsv(headers: string[], dataRows: CellValue[][]): string {
  const escapeWithFormula = (v: CellValue, colIndex: number): string => {
    if (v == null) return '""'
    if (v instanceof Date) return `"${formatKyivDateTime(v.toISOString())}"`
    // Телефон определяем по заголовку колонки (headers уже развёрнуты 1:1)
    if (headers[colIndex] === 'Телефон' && typeof v === 'string') {
      // Формула без внешних кавычек — Excel считывает как formula-строку
      return wrapPhoneForCsv(v)
    }
    // W4: защита от формул (не для телефона — он уже в формуле)
    const sanitized = sanitizeCsvCell(String(v))
    return `"${sanitized.replace(/"/g, '""')}"`
  }

  const lines: string[] = [
    headers.map((h) => `"${h}"`).join(','),
    ...dataRows.map((row) => row.map((cell, ci) => escapeWithFormula(cell, ci)).join(',')),
  ]
  return BOM + lines.join('\n')
}

export function buildSummaryCsv(
  periods: ComparisonPeriod[],
  columns: SummaryColumn[],
  includeDateBreakdown: boolean,
): string {
  const escape = (v: string | number | null): string => {
    if (v == null) return '""'
    return `"${sanitizeCsvCell(String(v)).replace(/"/g, '""')}"`
  }

  const colHeaders = ['Розріз', ...columns.map((c) => SUMMARY_COLUMN_HEADERS[c])]
  const lines: string[] = []

  for (const period of periods) {
    lines.push(`"Період: ${period.label}"`)
    lines.push(colHeaders.map((h) => `"${h}"`).join(','))
    const rows = buildPeriodRows(period.report, includeDateBreakdown, columns)
    for (const row of rows) {
      const rowCells: string[] = [escape(row.label)]
      for (const col of columns) rowCells.push(escape(row.values[col]))
      lines.push(rowCells.join(','))
    }
    lines.push('')
  }

  if (periods.length > 1) {
    const comparison = buildComparisonTable(periods, columns)
    lines.push('"Порівняння"')
    lines.push(comparison.headers.map((h) => `"${h}"`).join(','))
    for (const row of comparison.rows) {
      const cells = [escape(row.metricLabel), ...row.cells.map((c) => escape(c as string | number | null))]
      lines.push(cells.join(','))
    }
    lines.push('')
  }

  return BOM + lines.join('\n')
}
