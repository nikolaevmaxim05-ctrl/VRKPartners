/**
 * analytics-export.ts
 *
 * Чистые (без БД) хелперы для построения содержимого выгрузок.
 * Тестируются через vitest без моков Supabase.
 *
 * Публичный API:
 *   buildComparisonTable  — сводная таблица «Порівняння» для нескольких периодов
 *   buildPeriodRows       — строки таблицы одного периода (с/без разбивки дат)
 *   filterByDealAmount    — предикат фильтра диапазона суммы сделки
 *   wasTargetPredicate    — предикат «был целевым» (через history OR текущая стадия)
 *   sanitizeCsvCell       — защита от CSV-инъекций формул (W4)
 *   sanitizeSheetName     — очистка имени листа XLSX (ограничения Excel)
 */

import type { ReportResponse, ReportRow } from './report'

// ─── Типы ────────────────────────────────────────────────────────────────────

export type SummaryColumn =
  | 'total'
  | 'nonTargetLeads'
  | 'targetLeads'
  | 'deals'
  | 'dealAmountSum'
  | 'dealProfitSum'
  | 'conversionToNonTarget'
  | 'conversionToTarget'
  | 'conversionToDeal'

/** Заголовки столбцов для summary-вывода (uk-UA). */
export const SUMMARY_COLUMN_HEADERS: Record<SummaryColumn, string> = {
  total:                 'Заявки',
  nonTargetLeads:        'Нецільові ліди',
  targetLeads:           'Цільові ліди',
  deals:                 'Угоди',
  dealAmountSum:         'Сума угод (грн)',
  dealProfitSum:         'Прибуток (грн)',
  conversionToNonTarget: 'Конверсія у нецільові (%)',
  conversionToTarget:    'Конверсія у цільові (%)',
  conversionToDeal:      'Конверсія в угоду (%)',
}

/**
 * Канонический порядок показателей в файле выгрузки и в конструкторе (решение владельца 2026-09-30):
 * как в сводной таблице экрана — «Конверсія у цільові» сразу после «Нецільові», перед «Угоди».
 * Порядок столбцов файла НЕ зависит от того, в какой последовательности пользователь ставил отметки.
 */
export const SUMMARY_COLUMN_ORDER: SummaryColumn[] = [
  'total',
  'targetLeads',
  'nonTargetLeads',
  'conversionToTarget',
  'conversionToNonTarget',
  'deals',
  'dealAmountSum',
  'dealProfitSum',
  'conversionToDeal',
]

/** Выбранные показатели в каноническом порядке (дубликаты убираются). */
export function orderSummaryColumns(columns: ReadonlyArray<SummaryColumn>): SummaryColumn[] {
  const chosen = new Set(columns)
  return SUMMARY_COLUMN_ORDER.filter((c) => chosen.has(c))
}

// ─── sanitizeCsvCell ─────────────────────────────────────────────────────────

/**
 * Защита от CSV/XLSX-инъекций формул (OWASP W4).
 * Если строка начинается с = + - @ \t \r — добавляем апостроф.
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }
  return value
}

/**
 * Оборачивает телефон в формульную строку для CSV, чтобы Excel не конвертировал в число.
 * Например: "+380501234567" → `="+380501234567"`
 */
export function wrapPhoneForCsv(phone: string): string {
  const clean = phone.replace(/"/g, '""')
  return `="${clean}"`
}

// ─── sanitizeSheetName ────────────────────────────────────────────────────────

const FORBIDDEN_SHEET_CHARS_RE = /[:/\\?*[\]]/g

/**
 * Очищает имя листа Excel от запрещённых символов и обрезает до 31 символа.
 * Excel не допускает: : \ / ? * [ ]
 */
export function sanitizeSheetName(name: string): string {
  return name.replace(FORBIDDEN_SHEET_CHARS_RE, '-').substring(0, 31)
}

/**
 * Возвращает уникальное имя листа относительно уже использованных имён.
 *
 * Алгоритм:
 *   1. Пытаемся использовать base (уже sanitize-нутый, ≤31 символа).
 *   2. При коллизии добавляем суффикс « (2)», « (3)»... и обрезаем base, чтобы
 *      финальная строка оставалась ≤31 символа.
 *
 * @param existing — Set уже занятых имён (case-sensitive, как в ExcelJS)
 * @param base     — желаемое имя листа (должно быть уже sanitize-нутым)
 */
export function uniqueSheetName(existing: Set<string>, base: string): string {
  if (!existing.has(base)) return base

  for (let n = 2; n <= 1000; n++) {
    const suffix = ` (${n})`
    // Обрезаем base, чтобы base+suffix ≤31
    const trimmedBase = base.substring(0, 31 - suffix.length)
    const candidate = trimmedBase + suffix
    if (!existing.has(candidate)) return candidate
  }

  // Fallback: практически недостижимо
  return base.substring(0, 28) + '...'
}

// ─── filterByDealAmount ───────────────────────────────────────────────────────

/**
 * Возвращает true, если лид проходит фильтр диапазона суммы сделки.
 *
 * Семантика:
 *   - Если from и to не заданы (null/undefined) — все лиды проходят.
 *   - Если хотя бы один из них задан и deal_amount = null — лид исключается.
 *   - Сравнение включительное: from ≤ deal_amount ≤ to.
 *   - from > to → некорректное состояние (валидируется в роуте до вызова), но
 *     здесь поведение как «ничего не проходит».
 */
export function filterByDealAmount(
  dealAmount: number | null,
  from: number | null | undefined,
  to: number | null | undefined,
): boolean {
  const hasConstraint = from != null || to != null
  if (!hasConstraint) return true
  // Если есть ограничение, но deal_amount = null — исключаем
  if (dealAmount == null) return false
  if (from != null && dealAmount < from) return false
  if (to != null && dealAmount > to) return false
  return true
}

// ─── wasTargetPredicate / wasNonTargetPredicate ───────────────────────────────

/**
 * Чистая функция: «Був цільовим» для одного лида.
 *
 * Возвращает true, если:
 *   - в historyTypes есть 'target_lead', ИЛИ
 *   - текущая стадия лида имеет conversion_type = 'target_lead'
 */
export function wasTargetPredicate(
  historyTypes: Set<string>,
  currentConversionType: string | null,
): boolean {
  return historyTypes.has('target_lead') || currentConversionType === 'target_lead'
}

/**
 * Чистая функция: «Був нецільовим» для одного лида.
 */
export function wasNonTargetPredicate(
  historyTypes: Set<string>,
  currentConversionType: string | null,
): boolean {
  return historyTypes.has('non_target_lead') || currentConversionType === 'non_target_lead'
}

// ─── buildPeriodRows ──────────────────────────────────────────────────────────

export interface PeriodTableRow {
  label: string
  values: Record<SummaryColumn, number>
  isTotal: boolean
}

/**
 * Строит строки таблицы одного отчётного периода.
 *
 * @param report              — готовый ReportResponse для этого диапазона дат
 * @param includeDateBreakdown — добавлять разбивку по бакетам (timeseries)
 * @param columns             — выбранные столбцы
 * @returns                   массив строк (строки данных + строка «Разом»)
 */
export function buildPeriodRows(
  report: ReportResponse,
  includeDateBreakdown: boolean,
  columns: SummaryColumn[],
): PeriodTableRow[] {
  const rows: PeriodTableRow[] = []

  if (includeDateBreakdown) {
    for (const pt of report.timeseries) {
      rows.push({
        label: pt.label,
        values: extractTimeseriesValues(pt, columns),
        isTotal: false,
      })
    }
  }

  // Строка «Разом»
  rows.push({
    label: 'Разом',
    values: extractReportRowValues(report.total, columns),
    isTotal: true,
  })

  return rows
}

// ─── Внутренние хелперы ──────────────────────────────────────────────────────

function extractReportRowValues(
  row: ReportRow,
  columns: SummaryColumn[],
): Record<SummaryColumn, number> {
  const result = {} as Record<SummaryColumn, number>
  for (const col of columns) {
    result[col] = getReportRowValue(row, col)
  }
  return result
}

function getReportRowValue(row: ReportRow, col: SummaryColumn): number {
  switch (col) {
    case 'total':                 return row.total
    case 'nonTargetLeads':        return row.nonTargetLeads
    case 'targetLeads':           return row.targetLeads
    case 'deals':                 return row.deals
    case 'dealAmountSum':         return row.dealAmountSum
    case 'dealProfitSum':         return row.dealProfitSum
    case 'conversionToNonTarget': return row.conversionToNonTarget
    case 'conversionToTarget':    return row.conversionToTarget
    case 'conversionToDeal':      return row.conversionToDeal
  }
}

type TimeseriesCompatible = {
  total: number
  nonTargetLeads?: number
  targetLeads: number
  deals: number
  dealAdjustments?: number
  dealAmountSum: number
  dealProfitSum: number
}

function extractTimeseriesValues(
  pt: ReportResponse['timeseries'][number],
  columns: SummaryColumn[],
): Record<SummaryColumn, number> {
  const result = {} as Record<SummaryColumn, number>
  const ts = pt as TimeseriesCompatible
  for (const col of columns) {
    switch (col) {
      case 'total':                 result[col] = ts.total;             break
      case 'nonTargetLeads':        result[col] = ts.nonTargetLeads ?? 0; break
      case 'targetLeads':           result[col] = ts.targetLeads;       break
      case 'deals':                 result[col] = ts.deals;             break
      case 'dealAmountSum':         result[col] = ts.dealAmountSum;     break
      case 'dealProfitSum':         result[col] = ts.dealProfitSum;     break
      // Конверсии в таймсерии не хранятся — считаем on-the-fly
      case 'conversionToNonTarget':
        result[col] = ts.total > 0
          ? ((ts.nonTargetLeads ?? 0) / ts.total) * 100
          : 0
        break
      case 'conversionToTarget':
        result[col] = ts.total > 0 ? (ts.targetLeads / ts.total) * 100 : 0
        break
      case 'conversionToDeal':
        result[col] = ts.total > 0 ? (ts.deals / ts.total) * 100 : 0
        break
    }
  }
  return result
}

// ─── buildComparisonTable ─────────────────────────────────────────────────────

export interface ComparisonPeriod {
  /** Заголовок столбца (напр. «01.06.2026 – 30.06.2026»). */
  label: string
  /** Итоговая строка «Разом» из отчёта за этот период. */
  report: ReportResponse
}

export interface ComparisonTable {
  /** Заголовки: '', period0, Δ %, period1, Δ %, …, base = periods[0] */
  headers: string[]
  /** Строки: первый столбец — название метрики, далее значения + дельта. */
  rows: Array<{ metricLabel: string; metric: SummaryColumn; cells: (number | string)[] }>
}

/**
 * Строит таблицу «Порівняння» для XLSX-листа или CSV-секции.
 *
 * Структура: первый элемент periods[] = основной период.
 * Каждый следующий periods[i] (i ≥ 1) — сравнительный:
 *   - столбец «значение periodI»
 *   - столбец «Δ % к основному»
 *
 * При P0 = 0 → дельта = '—' (строка).
 */
export function buildComparisonTable(
  periods: ComparisonPeriod[],
  columns: SummaryColumn[],
): ComparisonTable {
  if (periods.length === 0) {
    return { headers: [], rows: [] }
  }

  // Заголовки: пустой первый (название метрики) + base-period + (compare + Δ)*
  const headers: string[] = ['']
  headers.push(periods[0].label)
  for (let i = 1; i < periods.length; i++) {
    headers.push(periods[i].label)
    headers.push(`Δ % до ${periods[0].label}`)
  }

  const rows = columns.map((col) => {
    const p0Value = getReportRowValue(periods[0].report.total, col)
    const cells: (number | string)[] = [p0Value]

    for (let i = 1; i < periods.length; i++) {
      const pi = getReportRowValue(periods[i].report.total, col)
      cells.push(pi)
      // Дельта
      const delta = computeDeltaPct(p0Value, pi)
      cells.push(delta)
    }

    return {
      metricLabel: SUMMARY_COLUMN_HEADERS[col],
      metric: col,
      cells,
    }
  })

  return { headers, rows }
}

/**
 * Рассчитывает дельту в % относительно базового значения.
 * При base = 0 возвращает строку '—'.
 */
export function computeDeltaPct(base: number, compare: number): number | string {
  if (base === 0) return '—'
  return ((compare - base) / base) * 100
}
