// infrastructure/export/excel — XLSX-вивантаження (ExcelJS): ліди та зведення з порівнянням.
// Перенесено з /api/admin/analytics/export без зміни вигляду файлів.
// ExcelJS (~1 МБ) вантажиться ЛИШЕ під час вивантаження XLSX — динамічний import, щоб пакет не
// потрапляв у спільний серверний чанк усіх сторінок і роутів адмінки (холодний старт).
const loadExcelJS = async () => (await import('exceljs')).default
import type { SpreadsheetFileBuilder } from '@core/application/ports/analytics'
import type { CellValue } from '@core/domain/analytics/export-leads'
import type { LeadExportField } from '@core/domain/analytics/export-request'
import {
  sanitizeCsvCell,
  sanitizeSheetName,
  uniqueSheetName,
  buildPeriodRows,
  buildComparisonTable,
  SUMMARY_COLUMN_HEADERS,
  type SummaryColumn,
  type ComparisonPeriod,
} from '@core/domain/analytics/export'

/** Кількість колонок кастомних полів = усі заголовки мінус заголовки інших полів. */
function customFieldDefCount(headers: string[], leadFields: LeadExportField[]): number {
  if (!leadFields.includes('custom_fields')) return 0
  let nonCfHeaders = 0
  for (const f of leadFields) {
    if (f === 'custom_fields') continue
    if (f === 'dates') nonCfHeaders += 2
    else if (f === 'all_utm') nonCfHeaders += 8
    else nonCfHeaders += 1
  }
  return headers.length - nonCfHeaders
}

async function buildLeadsXlsx(headers: string[], dataRows: CellValue[][], leadFields: LeadExportField[]): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Analytics'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Ліди')
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Авто-ширина колонок за вмістом у межах [MIN_W, MAX_W].
  const MIN_W = 10
  const MAX_W = 60
  const widths = headers.map((h) => Math.max(MIN_W, Math.min(MAX_W, (h?.length ?? 0) + 2)))
  for (const rowData of dataRows) {
    for (let ci = 0; ci < headers.length; ci++) {
      const v = rowData[ci]
      let len = 0
      if (v instanceof Date) len = 16 // dd.mm.yyyy hh:mm
      else if (v != null && v !== '') len = String(v).split('\n').reduce((m, line) => Math.max(m, line.length), 0)
      const want = Math.min(MAX_W, len + 2)
      if (want > widths[ci]) widths[ci] = want
    }
  }
  sheet.columns = headers.map((h, i) => ({ header: h, key: `col_${i}`, width: widths[i] ?? 20 }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }

  // Маска типів колонок — 1:1 з headers
  const cfCount = customFieldDefCount(headers, leadFields)
  const colTypes: Array<'phone' | 'datetime' | 'number' | 'wraptext' | 'text'> = []
  for (const f of leadFields) {
    switch (f) {
      case 'dates': colTypes.push('datetime', 'datetime'); break
      case 'all_utm': for (let i = 0; i < 8; i++) colTypes.push('text'); break
      case 'custom_fields': for (let i = 0; i < cfCount; i++) colTypes.push('text'); break
      case 'phone': colTypes.push('phone'); break
      case 'deal_amount': colTypes.push('number'); break
      case 'manager_history':
      case 'comments': colTypes.push('wraptext'); break
      default: colTypes.push('text')
    }
  }

  for (const rowData of dataRows) {
    const excelRow = sheet.addRow(rowData.map((v) => (v instanceof Date ? v : v ?? '')))
    for (let ci = 0; ci < colTypes.length; ci++) {
      const cell = excelRow.getCell(ci + 1)
      const typ = colTypes[ci]
      if (typ === 'phone') {
        if (rowData[ci] != null && rowData[ci] !== '') {
          cell.value = String(rowData[ci])
          cell.numFmt = '@'
        }
      } else if (typ === 'datetime') {
        if (rowData[ci] instanceof Date) {
          cell.value = rowData[ci] as Date
          cell.numFmt = 'dd.mm.yyyy hh:mm'
        }
      } else if (typ === 'number') {
        if (typeof rowData[ci] === 'number') cell.numFmt = '#,##0.00'
      } else if (typ === 'wraptext') {
        cell.alignment = { wrapText: true, vertical: 'top' }
      }
    }
  }

  // ── Підсумковий рядок ──
  const colIndexOf = (target: LeadExportField): number => {
    let idx = 0
    for (const f of leadFields) {
      if (f === target) return idx
      if (f === 'dates') idx += 2
      else if (f === 'all_utm') idx += 8
      else if (f === 'custom_fields') idx += cfCount
      else idx += 1
    }
    return -1
  }
  const dealIdx      = leadFields.includes('deal_amount')    ? colIndexOf('deal_amount')    : -1
  const targetIdx    = leadFields.includes('was_target')     ? colIndexOf('was_target')     : -1
  const nonTargetIdx = leadFields.includes('was_non_target') ? colIndexOf('was_non_target') : -1

  const dealSum = dealIdx >= 0
    ? dataRows.reduce((acc, r) => acc + (typeof r[dealIdx] === 'number' ? (r[dealIdx] as number) : 0), 0)
    : 0
  const targetCount    = targetIdx >= 0    ? dataRows.filter((r) => r[targetIdx] === 'Так').length    : 0
  const nonTargetCount = nonTargetIdx >= 0 ? dataRows.filter((r) => r[nonTargetIdx] === 'Так').length : 0

  sheet.addRow([])
  const totals: (string | number)[] = new Array(headers.length).fill('')
  totals[0] = `Разом: ${dataRows.length} лідів`
  if (dealIdx >= 0)      totals[dealIdx]      = dealSum
  if (targetIdx >= 0)    totals[targetIdx]    = targetCount
  if (nonTargetIdx >= 0) totals[nonTargetIdx] = nonTargetCount

  const totalRow = sheet.addRow(totals)
  totalRow.font = { bold: true }
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F5' } }
  if (dealIdx >= 0) totalRow.getCell(dealIdx + 1).numFmt = '#,##0.00'

  return workbook.xlsx.writeBuffer()
}

// Метрики, де зростання — це добре (адаптивне підсвічування дельт).
const HIGHER_IS_BETTER: Set<SummaryColumn> = new Set([
  'total', 'targetLeads', 'deals', 'dealAmountSum', 'dealProfitSum',
  'conversionToTarget', 'conversionToDeal',
])

// 3-кольорова шкала: t ∈ [-1, 1]. -1 → червоний, 0 → жовтий, +1 → зелений.
function scaleArgb(t: number): string {
  const clamped = Math.max(-1, Math.min(1, t))
  const YELLOW = [255, 235, 132]
  const GREEN  = [99, 190, 123]
  const RED    = [248, 105, 107]
  const lerp = (a: number[], b: number[], k: number) => a.map((c, i) => Math.round(c + (b[i] - c) * k))
  const rgb = clamped >= 0 ? lerp(YELLOW, GREEN, clamped) : lerp(YELLOW, RED, -clamped)
  return ('FF' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')).toUpperCase()
}

function deltaFillArgb(deltaPct: number, metric: SummaryColumn): string {
  const goodness = HIGHER_IS_BETTER.has(metric) ? deltaPct : -deltaPct
  const CAP = 50 // |зміна| ≥ 50% → повна насиченість
  return scaleArgb(goodness / CAP)
}

async function buildSummaryXlsx(
  periods: ComparisonPeriod[],
  columns: SummaryColumn[],
  includeDateBreakdown: boolean,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Analytics'
  workbook.created = new Date()

  const usedSheetNames = new Set<string>()
  for (const period of periods) {
    const sheetName = uniqueSheetName(usedSheetNames, sanitizeSheetName(period.label))
    usedSheetNames.add(sheetName)
    const sheet = workbook.addWorksheet(sheetName)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const colHeaders = ['Розріз', ...columns.map((c) => SUMMARY_COLUMN_HEADERS[c])]
    sheet.columns = colHeaders.map((h, i) => ({ header: h, key: `col_${i}`, width: i === 0 ? 28 : 20 }))

    const hRow = sheet.getRow(1)
    hRow.font = { bold: true }
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }

    for (const row of buildPeriodRows(period.report, includeDateBreakdown, columns)) {
      const excelRow = sheet.addRow([sanitizeCsvCell(row.label), ...columns.map((c) => row.values[c])])
      if (row.isTotal) {
        excelRow.font = { bold: true }
        excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }
      }
      let ci = 2
      for (const col of columns) {
        if (col === 'dealAmountSum' || col === 'dealProfitSum') excelRow.getCell(ci).numFmt = '#,##0.00 [$₴-422]'
        else if (col.startsWith('conversion')) excelRow.getCell(ci).numFmt = '0.00"%"'
        ci++
      }
    }
  }

  if (periods.length > 1) {
    const comparison = buildComparisonTable(periods, columns)
    const compSheet = workbook.addWorksheet('Порівняння')
    compSheet.views = [{ state: 'frozen', ySplit: 1 }]
    compSheet.columns = comparison.headers.map((h, i) => ({ header: h, key: `col_${i}`, width: i === 0 ? 36 : 22 }))

    const hRow = compSheet.getRow(1)
    hRow.font = { bold: true }
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }

    for (const row of comparison.rows) {
      const excelRow = compSheet.addRow([row.metricLabel, ...row.cells])
      // Порядок: [label, P0, P1, Δ1, P2, Δ2, ...] — перша Δ-колонка має індекс 4 (1-based)
      let deltaColIdx = 4
      for (let i = 1; i < periods.length; i++) {
        const deltaCell = excelRow.getCell(deltaColIdx)
        if (typeof deltaCell.value === 'number') {
          deltaCell.numFmt = '+0.00"%";-0.00"%"'
          deltaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: deltaFillArgb(deltaCell.value, row.metric) } }
        }
        deltaColIdx += 2
      }
    }
  }

  return workbook.xlsx.writeBuffer()
}

export const excelBuilder: SpreadsheetFileBuilder = {
  leadsXlsx: buildLeadsXlsx,
  summaryXlsx: buildSummaryXlsx,
}
