/**
 * analytics-export.test.ts
 *
 * Тести чистих хелперів analytics-export.ts (промпт 023).
 * Середовище: node (vitest), без БД і моків.
 *
 * Покриття:
 *   buildComparisonTable — дельти, P0=0 → «—», порядок колонок
 *   buildPeriodRows      — з/без date breakdown
 *   filterByDealAmount   — границі включно, null виключається при заданому діапазоні,
 *                          тільки from, тільки to
 *   wasTargetPredicate / wasNonTargetPredicate — history OR поточна стадія
 *   sanitizeCsvCell      — захист від формул
 *   sanitizeSheetName    — обрізка і заборонені символи
 *   wrapPhoneForCsv      — телефон у формулі CSV
 */

import { describe, it, expect } from 'vitest'
import {
  buildComparisonTable,
  buildPeriodRows,
  filterByDealAmount,
  wasTargetPredicate,
  wasNonTargetPredicate,
  sanitizeCsvCell,
  sanitizeSheetName,
  uniqueSheetName,
  wrapPhoneForCsv,
  SUMMARY_COLUMN_HEADERS,
  SUMMARY_COLUMN_ORDER,
  orderSummaryColumns,
  computeDeltaPct,
} from '../export'
import { buildSummaryCsv } from '../export-csv'
import type { SummaryColumn, ComparisonPeriod } from '../export'
import type { ReportResponse } from '../report'

// ─── Фабрика мінімального ReportResponse ──────────────────────────────────────

function makeReport(
  overrides: Partial<{
    total: number
    targetLeads: number
    nonTargetLeads: number
    deals: number
    dealAmountSum: number
    dealProfitSum: number
  }> = {},
  timeseriesPoints: Array<{ label: string; total: number; targetLeads?: number; nonTargetLeads?: number; deals?: number; dealAmountSum?: number; dealProfitSum?: number }> = [],
): ReportResponse {
  const total = {
    key: '__total__',
    label: 'Разом',
    color: null,
    total:                 overrides.total ?? 0,
    targetLeads:           overrides.targetLeads ?? 0,
    nonTargetLeads:        overrides.nonTargetLeads ?? 0,
    deals:                 overrides.deals ?? 0,
    dealAdjustments:       0,
    dealAmountSum:         overrides.dealAmountSum ?? 0,
    dealProfitSum:         overrides.dealProfitSum ?? 0,
    conversionToTarget:    overrides.total ? (overrides.targetLeads ?? 0) / overrides.total * 100 : 0,
    conversionToDeal:      overrides.total ? (overrides.deals ?? 0) / overrides.total * 100 : 0,
    conversionToNonTarget: overrides.total ? (overrides.nonTargetLeads ?? 0) / overrides.total * 100 : 0,
  }

  const timeseries = timeseriesPoints.map((pt) => ({
    dateIso:        pt.label,
    label:          pt.label,
    total:          pt.total,
    targetLeads:    pt.targetLeads ?? 0,
    nonTargetLeads: pt.nonTargetLeads ?? 0,
    deals:          pt.deals ?? 0,
    dealAdjustments: 0,
    dealAmountSum:  pt.dealAmountSum ?? 0,
    dealProfitSum:  pt.dealProfitSum ?? 0,
  }))

  return {
    rows:         [],
    total,
    timeseries,
    byAssignee:   [],
    flags:        { hasProfitStages: false, hasDealAdjustmentStages: false },
    params:       { dateFrom: '2026-01-01', dateTo: '2026-01-31', groupBy: 'day' },
    filteredCount: overrides.total ?? 0,
  }
}

function makePeriod(label: string, report: ReportResponse): ComparisonPeriod {
  return { label, report }
}

// ─── buildComparisonTable ──────────────────────────────────────────────────────

describe('buildComparisonTable — базові', () => {
  const cols: SummaryColumn[] = ['total', 'targetLeads', 'deals']

  it('порожній масив periods → порожня таблиця', () => {
    const t = buildComparisonTable([], cols)
    expect(t.headers).toEqual([])
    expect(t.rows).toEqual([])
  })

  it('один period → без Δ-стовпців', () => {
    const p0 = makePeriod('Янв', makeReport({ total: 10 }))
    const t = buildComparisonTable([p0], cols)
    expect(t.headers).toEqual(['', 'Янв'])
    expect(t.rows).toHaveLength(cols.length)
    for (const row of t.rows) {
      expect(row.cells).toHaveLength(1)
    }
  })

  it('два periods → P0 + P1 + Δ стовпці', () => {
    const p0 = makePeriod('Янв', makeReport({ total: 100 }))
    const p1 = makePeriod('Лют', makeReport({ total: 150 }))
    const t = buildComparisonTable([p0, p1], ['total'])
    // headers: '' + P0 + P1 + Δ до P0
    expect(t.headers).toHaveLength(4)
    expect(t.headers[0]).toBe('')
    expect(t.headers[1]).toBe('Янв')
    expect(t.headers[2]).toBe('Лют')
    expect(t.headers[3]).toMatch(/Δ.*Янв/)
  })
})

describe('buildComparisonTable — дельти', () => {
  it('P0=100, P1=150 → Δ = +50%', () => {
    const p0 = makePeriod('P0', makeReport({ total: 100 }))
    const p1 = makePeriod('P1', makeReport({ total: 150 }))
    const t = buildComparisonTable([p0, p1], ['total'])
    const row = t.rows[0]
    expect(row.cells[0]).toBe(100) // P0.total
    expect(row.cells[1]).toBe(150) // P1.total
    expect(row.cells[2]).toBeCloseTo(50, 5) // Δ = (150-100)/100*100 = 50%
  })

  it('P0=200, P1=100 → Δ = -50%', () => {
    const p0 = makePeriod('P0', makeReport({ total: 200 }))
    const p1 = makePeriod('P1', makeReport({ total: 100 }))
    const t = buildComparisonTable([p0, p1], ['total'])
    const delta = t.rows[0].cells[2]
    expect(delta).toBeCloseTo(-50, 5)
  })

  it('P0=0 → дельта = "—"', () => {
    const p0 = makePeriod('P0', makeReport({ total: 0 }))
    const p1 = makePeriod('P1', makeReport({ total: 100 }))
    const t = buildComparisonTable([p0, p1], ['total'])
    expect(t.rows[0].cells[2]).toBe('—')
  })

  it('P0=0, P1=0 → дельта = "—"', () => {
    const p0 = makePeriod('P0', makeReport({ total: 0 }))
    const p1 = makePeriod('P1', makeReport({ total: 0 }))
    const t = buildComparisonTable([p0, p1], ['total'])
    expect(t.rows[0].cells[2]).toBe('—')
  })

  it('три periods → дві Δ-колонки, кожна відносно P0', () => {
    const p0 = makePeriod('P0', makeReport({ total: 100 }))
    const p1 = makePeriod('P1', makeReport({ total: 120 }))
    const p2 = makePeriod('P2', makeReport({ total: 80 }))
    const t = buildComparisonTable([p0, p1, p2], ['total'])
    // cells: [P0, P1, Δ1, P2, Δ2]
    expect(t.rows[0].cells).toHaveLength(5)
    expect(t.rows[0].cells[2]).toBeCloseTo(20, 5)  // (120-100)/100*100
    expect(t.rows[0].cells[4]).toBeCloseTo(-20, 5) // (80-100)/100*100
  })

  it('три periods з нульовим основним (P0=0) → обидві Δ = "—", значення лишаються', () => {
    const p0 = makePeriod('P0', makeReport({ total: 0 }))
    const p1 = makePeriod('P1', makeReport({ total: 120 }))
    const p2 = makePeriod('P2', makeReport({ total: 80 }))
    const t = buildComparisonTable([p0, p1, p2], ['total'])
    // cells: [P0=0, P1=120, Δ1="—", P2=80, Δ2="—"]
    expect(t.rows[0].cells).toHaveLength(5)
    expect(t.rows[0].cells[0]).toBe(0)
    expect(t.rows[0].cells[1]).toBe(120)
    expect(t.rows[0].cells[2]).toBe('—')
    expect(t.rows[0].cells[3]).toBe(80)
    expect(t.rows[0].cells[4]).toBe('—')
    // дві compare-колонки → дві пари «значення + Δ» у headers
    expect(t.headers).toEqual(['', 'P0', 'P1', 'Δ % до P0', 'P2', 'Δ % до P0'])
  })

  it('п\'ять periods (Zod-максимум) → чотири Δ-колонки', () => {
    const mk = (lbl: string, total: number) => makePeriod(lbl, makeReport({ total }))
    const t = buildComparisonTable(
      [mk('P0', 100), mk('P1', 110), mk('P2', 120), mk('P3', 130), mk('P4', 140)],
      ['total'],
    )
    // cells: [P0, P1, Δ1, P2, Δ2, P3, Δ3, P4, Δ4] = 9
    expect(t.rows[0].cells).toHaveLength(9)
    expect(t.rows[0].cells[2]).toBeCloseTo(10, 5)
    expect(t.rows[0].cells[8]).toBeCloseTo(40, 5)
  })
})

describe('buildComparisonTable — порядок колонок', () => {
  it('метрики йдуть у порядку columns[]', () => {
    const p0 = makePeriod('P0', makeReport({ total: 10, deals: 3, dealAmountSum: 1000 }))
    const cols: SummaryColumn[] = ['deals', 'total', 'dealAmountSum']
    const t = buildComparisonTable([p0], cols)
    expect(t.rows.map((r) => r.metricLabel)).toEqual([
      SUMMARY_COLUMN_HEADERS['deals'],
      SUMMARY_COLUMN_HEADERS['total'],
      SUMMARY_COLUMN_HEADERS['dealAmountSum'],
    ])
    expect(t.rows[0].cells[0]).toBe(3)    // deals
    expect(t.rows[1].cells[0]).toBe(10)   // total
    expect(t.rows[2].cells[0]).toBe(1000) // dealAmountSum
  })
})

// ─── computeDeltaPct ──────────────────────────────────────────────────────────

describe('computeDeltaPct', () => {
  it('base=100, compare=100 → 0', () => {
    expect(computeDeltaPct(100, 100)).toBe(0)
  })

  it('base=0 → "—"', () => {
    expect(computeDeltaPct(0, 100)).toBe('—')
  })

  it('base=50, compare=75 → 50', () => {
    expect(computeDeltaPct(50, 75)).toBeCloseTo(50, 5)
  })
})

// ─── buildPeriodRows ──────────────────────────────────────────────────────────

describe('buildPeriodRows — без date breakdown', () => {
  const report = makeReport({ total: 20, targetLeads: 5, deals: 2 })
  const cols: SummaryColumn[] = ['total', 'targetLeads', 'deals']

  it('тільки рядок «Разом»', () => {
    const rows = buildPeriodRows(report, false, cols)
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Разом')
    expect(rows[0].isTotal).toBe(true)
  })

  it('значення в рядку «Разом» відповідають total', () => {
    const rows = buildPeriodRows(report, false, cols)
    expect(rows[0].values.total).toBe(20)
    expect(rows[0].values.targetLeads).toBe(5)
    expect(rows[0].values.deals).toBe(2)
  })
})

describe('buildPeriodRows — з date breakdown', () => {
  const report = makeReport(
    { total: 10 },
    [
      { label: '01.06', total: 3, targetLeads: 1 },
      { label: '02.06', total: 7, deals: 2 },
    ],
  )
  const cols: SummaryColumn[] = ['total', 'targetLeads', 'deals']

  it('рядки timeseries + рядок «Разом»', () => {
    const rows = buildPeriodRows(report, true, cols)
    expect(rows).toHaveLength(3)
    expect(rows[0].label).toBe('01.06')
    expect(rows[0].isTotal).toBe(false)
    expect(rows[1].label).toBe('02.06')
    expect(rows[2].label).toBe('Разом')
    expect(rows[2].isTotal).toBe(true)
  })

  it('значення в рядках timeseries коректні', () => {
    const rows = buildPeriodRows(report, true, cols)
    expect(rows[0].values.total).toBe(3)
    expect(rows[0].values.targetLeads).toBe(1)
    expect(rows[1].values.total).toBe(7)
    expect(rows[1].values.deals).toBe(2)
  })

  it('конверсії в timeseries-рядках рахуються on-the-fly', () => {
    const report2 = makeReport(
      { total: 10 },
      [{ label: 'день', total: 4, targetLeads: 2 }],
    )
    const rows = buildPeriodRows(report2, true, ['conversionToTarget'])
    // conversionToTarget = 2/4*100 = 50%
    expect(rows[0].values.conversionToTarget).toBeCloseTo(50, 5)
  })

  it('порожня timeseries → тільки рядок «Разом»', () => {
    const emptyReport = makeReport({ total: 5 }, [])
    const rows = buildPeriodRows(emptyReport, true, ['total'])
    expect(rows).toHaveLength(1)
    expect(rows[0].isTotal).toBe(true)
  })
})

// ─── filterByDealAmount ───────────────────────────────────────────────────────

describe('filterByDealAmount', () => {
  it('немає обмежень → все проходить (включно null)', () => {
    expect(filterByDealAmount(null, null, null)).toBe(true)
    expect(filterByDealAmount(500, null, null)).toBe(true)
    expect(filterByDealAmount(0, null, null)).toBe(true)
  })

  it('тільки from: deal_amount >= from', () => {
    expect(filterByDealAmount(100, 100, null)).toBe(true)  // межа включно
    expect(filterByDealAmount(99, 100, null)).toBe(false)
    expect(filterByDealAmount(200, 100, null)).toBe(true)
  })

  it('тільки to: deal_amount <= to', () => {
    expect(filterByDealAmount(100, null, 100)).toBe(true)  // межа включно
    expect(filterByDealAmount(101, null, 100)).toBe(false)
    expect(filterByDealAmount(0, null, 100)).toBe(true)
  })

  it('from і to: from ≤ deal_amount ≤ to', () => {
    expect(filterByDealAmount(100, 100, 200)).toBe(true)
    expect(filterByDealAmount(200, 100, 200)).toBe(true)
    expect(filterByDealAmount(150, 100, 200)).toBe(true)
    expect(filterByDealAmount(99, 100, 200)).toBe(false)
    expect(filterByDealAmount(201, 100, 200)).toBe(false)
  })

  it('deal_amount = null при заданому from → false', () => {
    expect(filterByDealAmount(null, 100, null)).toBe(false)
  })

  it('deal_amount = null при заданому to → false', () => {
    expect(filterByDealAmount(null, null, 200)).toBe(false)
  })

  it('deal_amount = null при from і to → false', () => {
    expect(filterByDealAmount(null, 100, 200)).toBe(false)
  })

  it('from > to → false для будь-якого значення (некоректний діапазон)', () => {
    expect(filterByDealAmount(150, 200, 100)).toBe(false)
    expect(filterByDealAmount(50, 200, 100)).toBe(false)
    expect(filterByDealAmount(250, 200, 100)).toBe(false)
  })

  it('нульові значення from/to обробляються коректно', () => {
    expect(filterByDealAmount(0, 0, 0)).toBe(true)
    expect(filterByDealAmount(1, 0, 0)).toBe(false)
    expect(filterByDealAmount(-1, 0, null)).toBe(false)
  })
})

// ─── wasTargetPredicate / wasNonTargetPredicate ───────────────────────────────

describe('wasTargetPredicate', () => {
  it('history має target_lead → true', () => {
    const h = new Set(['target_lead'])
    expect(wasTargetPredicate(h, null)).toBe(true)
  })

  it('поточна стадія target_lead і порожня history → true', () => {
    expect(wasTargetPredicate(new Set(), 'target_lead')).toBe(true)
  })

  it('history non_target_lead, поточна null → false', () => {
    expect(wasTargetPredicate(new Set(['non_target_lead']), null)).toBe(false)
  })

  it('порожня history і null поточна → false', () => {
    expect(wasTargetPredicate(new Set(), null)).toBe(false)
  })

  it('history deal, поточна target_lead → true (OR-логіка)', () => {
    const h = new Set(['deal'])
    expect(wasTargetPredicate(h, 'target_lead')).toBe(true)
  })

  it('history має обидва типи → true', () => {
    const h = new Set(['target_lead', 'non_target_lead'])
    expect(wasTargetPredicate(h, null)).toBe(true)
  })
})

describe('wasNonTargetPredicate', () => {
  it('history має non_target_lead → true', () => {
    expect(wasNonTargetPredicate(new Set(['non_target_lead']), null)).toBe(true)
  })

  it('поточна стадія non_target_lead → true', () => {
    expect(wasNonTargetPredicate(new Set(), 'non_target_lead')).toBe(true)
  })

  it('history target_lead, поточна null → false', () => {
    expect(wasNonTargetPredicate(new Set(['target_lead']), null)).toBe(false)
  })

  it('порожня history і null поточна → false', () => {
    expect(wasNonTargetPredicate(new Set(), null)).toBe(false)
  })

  it('лід перейшов з цільового у нецільовий: history має обидва → true', () => {
    const h = new Set(['target_lead', 'non_target_lead'])
    expect(wasNonTargetPredicate(h, 'target_lead')).toBe(true)
  })
})

// ─── sanitizeCsvCell ──────────────────────────────────────────────────────────

describe('sanitizeCsvCell', () => {
  it('звичайний текст → без змін', () => {
    expect(sanitizeCsvCell('Hello World')).toBe('Hello World')
    expect(sanitizeCsvCell('Нормальний текст')).toBe('Нормальний текст')
    expect(sanitizeCsvCell('')).toBe('')
  })

  it('= на початку → апостроф', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
  })

  it('+ на початку → апостроф', () => {
    expect(sanitizeCsvCell('+link')).toBe("'+link")
  })

  it('- на початку → апостроф', () => {
    expect(sanitizeCsvCell('-1+2')).toBe("'-1+2")
  })

  it('@ на початку → апостроф', () => {
    expect(sanitizeCsvCell('@user')).toBe("'@user")
  })

  it('\t на початку → апостроф', () => {
    expect(sanitizeCsvCell('\ttest')).toBe("'\ttest")
  })

  it('рядок що не починається з небезпечних символів → без змін', () => {
    expect(sanitizeCsvCell('text=more')).toBe('text=more')
    expect(sanitizeCsvCell('a+b')).toBe('a+b')
  })
})

// ─── sanitizeSheetName ────────────────────────────────────────────────────────

describe('sanitizeSheetName', () => {
  it('звичайна назва → без змін', () => {
    expect(sanitizeSheetName('Аналітика')).toBe('Аналітика')
    expect(sanitizeSheetName('01.06.2026 – 30.06.2026')).toBe('01.06.2026 – 30.06.2026')
  })

  it('заборонені символи замінюються на "-"', () => {
    expect(sanitizeSheetName('Sheet:1')).toBe('Sheet-1')
    expect(sanitizeSheetName('data\\file')).toBe('data-file')
    expect(sanitizeSheetName('path/to')).toBe('path-to')
    expect(sanitizeSheetName('what?')).toBe('what-')
    expect(sanitizeSheetName('star*name')).toBe('star-name')
    expect(sanitizeSheetName('[bracket]')).toBe('-bracket-')
  })

  it('обрізає до 31 символу', () => {
    const long = 'A'.repeat(40)
    const result = sanitizeSheetName(long)
    expect(result.length).toBe(31)
  })

  it('обрізка відбувається після санітизації', () => {
    const s = 'A'.repeat(35)
    expect(sanitizeSheetName(s).length).toBe(31)
  })

  it('порожній рядок → порожній', () => {
    expect(sanitizeSheetName('')).toBe('')
  })
})

// ─── uniqueSheetName ──────────────────────────────────────────────────────────

describe('uniqueSheetName', () => {
  it('немає колізії → повертає base без змін', () => {
    const existing = new Set<string>(['Інший лист'])
    expect(uniqueSheetName(existing, 'Мій лист')).toBe('Мій лист')
  })

  it('одна колізія → додає суфікс (2)', () => {
    const existing = new Set<string>(['01.06 – 30.06'])
    const result = uniqueSheetName(existing, '01.06 – 30.06')
    expect(result).toBe('01.06 – 30.06 (2)')
    expect(result.length).toBeLessThanOrEqual(31)
  })

  it('подвійна колізія → суфікс (3)', () => {
    const existing = new Set<string>(['01.06 – 30.06', '01.06 – 30.06 (2)'])
    const result = uniqueSheetName(existing, '01.06 – 30.06')
    expect(result).toBe('01.06 – 30.06 (3)')
    expect(result.length).toBeLessThanOrEqual(31)
  })

  it('довге ім\'я + суфікс ≤31 символу', () => {
    // base рівно 31 символ
    const base = 'A'.repeat(31)
    const existing = new Set<string>([base])
    const result = uniqueSheetName(existing, base)
    expect(result.length).toBeLessThanOrEqual(31)
    expect(result).toMatch(/\(2\)$/)
  })

  it('довге ім\'я без колізії → повертається без обрізки (вже ≤31)', () => {
    const base = 'B'.repeat(28)
    const existing = new Set<string>()
    const result = uniqueSheetName(existing, base)
    expect(result).toBe(base)
  })
})

// ─── wrapPhoneForCsv ──────────────────────────────────────────────────────────

describe('wrapPhoneForCsv', () => {
  it('телефон обертається у формулу ="+380..."', () => {
    expect(wrapPhoneForCsv('+380501234567')).toBe('="+380501234567"')
  })

  it('внутрішні лапки екрануються', () => {
    expect(wrapPhoneForCsv('+38"050"')).toBe('="+38""050"""')
  })

  it('порожній рядок → порожня формула', () => {
    expect(wrapPhoneForCsv('')).toBe('=""')
  })
})

// ─── Канонічний порядок показників (SUMMARY_COLUMN_ORDER) ─────────────────────

describe('SUMMARY_COLUMN_ORDER / orderSummaryColumns', () => {
  it('порядок як у таблиці екрана: «Конверсія у цільові» після «Нецільові», перед «Угоди»; усі показники покриті', () => {
    expect(SUMMARY_COLUMN_ORDER).toEqual([
      'total', 'targetLeads', 'nonTargetLeads', 'conversionToTarget', 'conversionToNonTarget',
      'deals', 'dealAmountSum', 'dealProfitSum', 'conversionToDeal',
    ])
    expect([...SUMMARY_COLUMN_ORDER].sort()).toEqual(Object.keys(SUMMARY_COLUMN_HEADERS).sort())
  })

  it('обрані в довільному порядку → канонічний порядок, без дублікатів', () => {
    expect(orderSummaryColumns(['conversionToDeal', 'deals', 'conversionToTarget', 'total', 'deals', 'nonTargetLeads'])).toEqual([
      'total', 'nonTargetLeads', 'conversionToTarget', 'deals', 'conversionToDeal',
    ])
    expect(orderSummaryColumns([])).toEqual([])
  })

  it('CSV: заголовки стовпців ідуть у канонічному порядку незалежно від порядку вибору', () => {
    const period = makePeriod('Вересень', makeReport({ total: 10, targetLeads: 4, nonTargetLeads: 2, deals: 1 }))
    const csv = buildSummaryCsv([period], orderSummaryColumns(['deals', 'conversionToTarget', 'nonTargetLeads', 'targetLeads', 'total']), false)
    const header = csv.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.includes('Заявки')) ?? ''
    expect(header).toBe('"Розріз","Заявки","Цільові ліди","Нецільові ліди","Конверсія у цільові (%)","Угоди"')
  })
})
