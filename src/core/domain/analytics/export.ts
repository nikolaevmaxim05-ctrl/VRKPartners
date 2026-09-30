/**
 * analytics-export.ts
 *
 * Чисті (без БД) хелпери для побудови вмісту вивантажень.
 * Тестуються через vitest без моків Supabase.
 *
 * Публічний API:
 *   buildComparisonTable  — зведена таблиця «Порівняння» для кількох періодів
 *   buildPeriodRows       — рядки таблиці одного періоду (з/без разбивки дат)
 *   filterByDealAmount    — предикат фільтру діапазону суми угоди
 *   wasTargetPredicate    — предикат «був цільовим» (через history OR поточна стадія)
 *   sanitizeCsvCell       — захист від CSV-ін'єкцій формул (W4)
 *   sanitizeSheetName     — очищення імені листа XLSX (Excel-обмеження)
 */

import type { ReportResponse, ReportRow } from './report'

// ─── Типи ────────────────────────────────────────────────────────────────────

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

/** Заголовки стовпців для summary-виводу (uk-UA). */
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
 * Канонічний порядок показників у файлі вивантаження і в конструкторі (рішення власника 2026-09-30):
 * як у зведеній таблиці екрана — «Конверсія у цільові» одразу після «Нецільові», перед «Угоди».
 * Порядок стовпців файлу НЕ залежить від того, в якій послідовності користувач ставив позначки.
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

/** Обрані показники в канонічному порядку (дублікати прибираються). */
export function orderSummaryColumns(columns: ReadonlyArray<SummaryColumn>): SummaryColumn[] {
  const chosen = new Set(columns)
  return SUMMARY_COLUMN_ORDER.filter((c) => chosen.has(c))
}

// ─── sanitizeCsvCell ─────────────────────────────────────────────────────────

/**
 * Захист від CSV/XLSX-ін'єкцій формул (OWASP W4).
 * Якщо рядок починається з = + - @ \t \r — додаємо апостроф.
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }
  return value
}

/**
 * Обгортає телефон у формульний рядок для CSV щоб Excel не конвертував у число.
 * Наприклад: "+380501234567" → `="+380501234567"`
 */
export function wrapPhoneForCsv(phone: string): string {
  const clean = phone.replace(/"/g, '""')
  return `="${clean}"`
}

// ─── sanitizeSheetName ────────────────────────────────────────────────────────

const FORBIDDEN_SHEET_CHARS_RE = /[:/\\?*[\]]/g

/**
 * Очищає ім'я листа Excel від заборонених символів і обрізає до 31 символу.
 * Excel не дозволяє: : \ / ? * [ ]
 */
export function sanitizeSheetName(name: string): string {
  return name.replace(FORBIDDEN_SHEET_CHARS_RE, '-').substring(0, 31)
}

/**
 * Повертає унікальне ім'я листа відносно вже використаних імен.
 *
 * Алгоритм:
 *   1. Намагаємось використати base (вже sanitize-нутий, ≤31 символу).
 *   2. При коллізії додаємо суфікс « (2)», « (3)»... і обрізаємо base щоб
 *      фінальна рядок лишалась ≤31 символу.
 *
 * @param existing — Set вже зайнятих імен (case-sensitive, як в ExcelJS)
 * @param base     — бажане ім'я листа (має бути вже sanitize-нутим)
 */
export function uniqueSheetName(existing: Set<string>, base: string): string {
  if (!existing.has(base)) return base

  for (let n = 2; n <= 1000; n++) {
    const suffix = ` (${n})`
    // Обрізаємо base щоб base+suffix ≤31
    const trimmedBase = base.substring(0, 31 - suffix.length)
    const candidate = trimmedBase + suffix
    if (!existing.has(candidate)) return candidate
  }

  // Fallback: практично недосяжно
  return base.substring(0, 28) + '...'
}

// ─── filterByDealAmount ───────────────────────────────────────────────────────

/**
 * Повертає true якщо лід проходить фільтр діапазону суми угоди.
 *
 * Семантика:
 *   - Якщо from і to не задані (null/undefined) — всі ліди проходять.
 *   - Якщо хоча б один з них заданий і deal_amount = null — лід виключається.
 *   - Порівняння включне: from ≤ deal_amount ≤ to.
 *   - from > to → некоректний стан (валідується в роуті до виклику), але
 *     тут поведінка як «нічого не проходить».
 */
export function filterByDealAmount(
  dealAmount: number | null,
  from: number | null | undefined,
  to: number | null | undefined,
): boolean {
  const hasConstraint = from != null || to != null
  if (!hasConstraint) return true
  // Якщо є обмеження але deal_amount = null — виключаємо
  if (dealAmount == null) return false
  if (from != null && dealAmount < from) return false
  if (to != null && dealAmount > to) return false
  return true
}

// ─── wasTargetPredicate / wasNonTargetPredicate ───────────────────────────────

/**
 * Чиста функція: «Був цільовим» для одного ліда.
 *
 * Повертає true якщо:
 *   - в historyTypes є 'target_lead', АБО
 *   - поточна стадія ліда має conversion_type = 'target_lead'
 */
export function wasTargetPredicate(
  historyTypes: Set<string>,
  currentConversionType: string | null,
): boolean {
  return historyTypes.has('target_lead') || currentConversionType === 'target_lead'
}

/**
 * Чиста функція: «Був нецільовим» для одного ліда.
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
 * Будує рядки таблиці одного звітного періоду.
 *
 * @param report              — готовий ReportResponse для цього діапазону дат
 * @param includeDateBreakdown — додавати розбивку по бакетах (timeseries)
 * @param columns             — обрані стовпці
 * @returns                   масив рядків (рядки даних + рядок «Разом»)
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

  // Рядок «Разом»
  rows.push({
    label: 'Разом',
    values: extractReportRowValues(report.total, columns),
    isTotal: true,
  })

  return rows
}

// ─── Внутрішні хелпери ───────────────────────────────────────────────────────

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
      // Конверсії в таймсерії не зберігаються — рахуємо on-the-fly
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
  /** Заголовок стовпця (напр. «01.06.2026 – 30.06.2026»). */
  label: string
  /** Підсумковий рядок «Разом» зі звіту за цей период. */
  report: ReportResponse
}

export interface ComparisonTable {
  /** Заголовки: '', period0, Δ %, period1, Δ %, …, base = periods[0] */
  headers: string[]
  /** Рядки: перший стовпець — назва метрики, далі значення + дельта. */
  rows: Array<{ metricLabel: string; metric: SummaryColumn; cells: (number | string)[] }>
}

/**
 * Будує таблицю «Порівняння» для XLSX-листа або CSV-секції.
 *
 * Структура: перший елемент periods[] = основний период.
 * Кожен наступний periods[i] (i ≥ 1) — порівняльний:
 *   - стовпець «значення periodI»
 *   - стовпець «Δ % до основного»
 *
 * При P0 = 0 → дельта = '—' (рядок).
 */
export function buildComparisonTable(
  periods: ComparisonPeriod[],
  columns: SummaryColumn[],
): ComparisonTable {
  if (periods.length === 0) {
    return { headers: [], rows: [] }
  }

  // Заголовки: пустий перший (назва метрики) + base-period + (compare + Δ)*
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
 * Розраховує дельту у % відносно базового значення.
 * При base = 0 повертає рядок '—'.
 */
export function computeDeltaPct(base: number, compare: number): number | string {
  if (base === 0) return '—'
  return ((compare - base) / base) * 100
}
