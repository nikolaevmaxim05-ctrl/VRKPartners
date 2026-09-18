// Схеми запитів аналітики: параметри звіту, значення виміру, тіло вивантаження.
import { describe, it, expect } from 'vitest'
import {
  parseReportQuery,
  reportParamsSchema,
  dimensionParamsSchema,
  defaultDateFrom,
  defaultDateTo,
  dedupeSorted,
  splitIds,
  UUID_REGEX,
  DIMENSION_MAX_VALUES,
} from '../report-request'
import { exportBodySchema, exportFiltersSchema, buildExportFileName, orderLeadFields, filtersToReportParams } from '../export-request'

const NOW = new Date('2026-09-18T12:00:00Z')
const UUID = '11111111-2222-4333-8444-555555555555'
const getFrom = (q: Record<string, string>) => (k: string) => (k in q ? q[k] : null)

// ── Звіт ─────────────────────────────────────────────────────────────────────

describe('defaultDateFrom / defaultDateTo', () => {
  it('30 днів назад і сьогодні (UTC)', () => {
    expect(defaultDateTo(NOW)).toBe('2026-09-18')
    expect(defaultDateFrom(NOW)).toBe('2026-08-19')
  })
})

describe('parseReportQuery', () => {
  it('порожній query → дефолти', () => {
    const r = parseReportQuery(getFrom({}), NOW)
    expect(r).toEqual({
      ok: true,
      params: {
        date_from: '2026-08-19',
        date_to: '2026-09-18',
        group_by: 'utm_source',
        custom_field_id: '',
        ts_granularity: 'day',
        filter_utm_source: '',
        filter_service: '',
        filter_assigned_to: '',
        filter_assignee_ids: '',
        filter_status_ids: '',
        filter_gclid: 'any',
        filter_group_value: '',
        breakdown: 'none',
        breakdown_metric: 'total',
        breakdown_metrics: '',
      },
    })
  })

  it('дата не YYYY-MM-DD → помилка з текстом', () => {
    const r = parseReportQuery(getFrom({ date_from: '18.09.2026' }), NOW)
    expect(r).toEqual({ ok: false, message: 'date_from має бути YYYY-MM-DD' })
    const r2 = parseReportQuery(getFrom({ date_to: '2026-9-1' }), NOW)
    expect(r2).toEqual({ ok: false, message: 'date_to має бути YYYY-MM-DD' })
    // обидві невалідні → повідомлення через «; »
    const r3 = parseReportQuery(getFrom({ date_from: 'x', date_to: 'y' }), NOW)
    expect(!r3.ok && r3.message).toBe('date_from має бути YYYY-MM-DD; date_to має бути YYYY-MM-DD')
  })

  it('enum-и: group_by, ts_granularity, filter_gclid, breakdown, breakdown_metric', () => {
    expect(parseReportQuery(getFrom({ group_by: 'nope' }), NOW).ok).toBe(false)
    expect(parseReportQuery(getFrom({ ts_granularity: 'hour' }), NOW).ok).toBe(false)
    expect(parseReportQuery(getFrom({ filter_gclid: 'yes' }), NOW).ok).toBe(false)
    expect(parseReportQuery(getFrom({ breakdown: 'day' }), NOW).ok).toBe(false)
    expect(parseReportQuery(getFrom({ breakdown_metric: 'conversion' }), NOW).ok).toBe(false)
    const ok = parseReportQuery(getFrom({ group_by: 'month', ts_granularity: 'week', filter_gclid: 'with', breakdown: 'status', breakdown_metric: 'deals' }), NOW)
    expect(ok.ok && ok.params).toMatchObject({ group_by: 'month', ts_granularity: 'week', filter_gclid: 'with', breakdown: 'status', breakdown_metric: 'deals' })
  })

  it('group_by=custom_field вимагає валідний UUID custom_field_id', () => {
    const msg = "custom_field_id є обов'язковим і має бути валідним UUID при group_by=custom_field"
    expect(parseReportQuery(getFrom({ group_by: 'custom_field' }), NOW)).toEqual({ ok: false, message: msg })
    expect(parseReportQuery(getFrom({ group_by: 'custom_field', custom_field_id: 'abc' }), NOW)).toEqual({ ok: false, message: msg })
    const ok = parseReportQuery(getFrom({ group_by: 'custom_field', custom_field_id: UUID }), NOW)
    expect(ok.ok && ok.params).toMatchObject({ group_by: 'custom_field', custom_field_id: UUID })
    // UUID без вимоги — не перевіряється
    expect(parseReportQuery(getFrom({ group_by: 'status', custom_field_id: 'abc' }), NOW).ok).toBe(true)
  })

  it('UUID_REGEX — нечутливий до регістру', () => {
    expect(UUID_REGEX.test(UUID)).toBe(true)
    expect(UUID_REGEX.test(UUID.toUpperCase())).toBe(true)
    expect(UUID_REGEX.test('11111111-2222-4333-8444-55555555555')).toBe(false)
  })

  it('рядкові фільтри передаються як є', () => {
    const r = parseReportQuery(getFrom({ filter_status_ids: 'a,b', filter_assignee_ids: 'x', filter_group_value: 'google', breakdown_metrics: 'total,deals' }), NOW)
    expect(r.ok && r.params).toMatchObject({ filter_status_ids: 'a,b', filter_assignee_ids: 'x', filter_group_value: 'google', breakdown_metrics: 'total,deals' })
  })
})

describe('reportParamsSchema', () => {
  it('дати обовʼязкові, решта — з дефолтами', () => {
    expect(reportParamsSchema.safeParse({}).success).toBe(false)
    const r = reportParamsSchema.safeParse({ date_from: '2026-01-01', date_to: '2026-01-31' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toMatchObject({ group_by: 'utm_source', ts_granularity: 'day', filter_gclid: 'any', breakdown: 'none', breakdown_metric: 'total', custom_field_id: '' })
  })
})

// ── Значення виміру ──────────────────────────────────────────────────────────

describe('dimensionParamsSchema', () => {
  it('dimension — utm_* або custom_field, обовʼязковий', () => {
    expect(dimensionParamsSchema.safeParse({}).success).toBe(false)
    expect(dimensionParamsSchema.safeParse({ dimension: 'status' }).success).toBe(false)
    for (const d of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'custom_field']) {
      expect(dimensionParamsSchema.safeParse({ dimension: d }).success).toBe(true)
    }
  })

  it('дати необовʼязкові, але у форматі YYYY-MM-DD; custom_field_id дефолт ""', () => {
    const r = dimensionParamsSchema.safeParse({ dimension: 'utm_source' })
    expect(r.success && r.data).toEqual({ dimension: 'utm_source', custom_field_id: '' })
    expect(dimensionParamsSchema.safeParse({ dimension: 'utm_source', date_from: '2026-01-01', date_to: '2026-01-31' }).success).toBe(true)
    expect(dimensionParamsSchema.safeParse({ dimension: 'utm_source', date_from: '01.01.2026' }).success).toBe(false)
  })
})

describe('dedupeSorted / splitIds', () => {
  it('унікальні непорожні рядки, сортування uk, обрізання', () => {
    expect(dedupeSorted([' b ', 'a', 'b', '', 3, null, 'я', 'А'])).toEqual(['a', 'А', 'b', 'я'].sort((x, y) => x.localeCompare(y, 'uk')))
    expect(dedupeSorted(Array.from({ length: DIMENSION_MAX_VALUES + 10 }, (_, i) => `v${i}`))).toHaveLength(DIMENSION_MAX_VALUES)
  })

  it('splitIds: "a, b,,c" → [a,b,c]; undefined/"" → []', () => {
    expect(splitIds('a, b,,c')).toEqual(['a', 'b', 'c'])
    expect(splitIds(undefined)).toEqual([])
    expect(splitIds('')).toEqual([])
  })
})

// ── Вивантаження ─────────────────────────────────────────────────────────────

const filters = { date_from: '2026-01-01', date_to: '2026-01-31' }

describe('exportFiltersSchema', () => {
  it('дати обовʼязкові у форматі; масиви/enum з дефолтами', () => {
    const r = exportFiltersSchema.safeParse(filters)
    expect(r.success && r.data).toEqual({
      ...filters,
      filter_utm_source: '', filter_service: '', filter_assigned_to: '',
      filter_assignee_ids: [], filter_status_ids: [], filter_gclid: 'any',
    })
    expect(exportFiltersSchema.safeParse({ date_from: 'x', date_to: '2026-01-31' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...filters, filter_status_ids: 'a,b' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...filters, filter_gclid: 'maybe' }).success).toBe(false)
  })
})

describe('exportBodySchema', () => {
  it('tab=leads: leadFields непорожній', () => {
    const ok = exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'] })
    expect(ok.success).toBe(true)
    const empty = exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: [] })
    expect(empty.success).toBe(false)
    if (!empty.success) expect(empty.error.errors.map((e) => e.message)).toContain('leadFields не може бути порожнім')
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['unknown'] }).success).toBe(false)
  })

  it('tab=summary: summaryColumns непорожній; дефолти includeDateBreakdown=false, granularity=day', () => {
    const ok = exportBodySchema.safeParse({ format: 'xlsx', tab: 'summary', filters, summaryColumns: ['total'] })
    expect(ok.success).toBe(true)
    if (ok.success && ok.data.tab === 'summary') {
      expect(ok.data.includeDateBreakdown).toBe(false)
      expect(ok.data.granularity).toBe('day')
    }
    const empty = exportBodySchema.safeParse({ format: 'xlsx', tab: 'summary', filters, summaryColumns: [] })
    expect(empty.success).toBe(false)
    if (!empty.success) expect(empty.error.errors.map((e) => e.message)).toContain('summaryColumns не може бути порожнім')
    expect(exportBodySchema.safeParse({ format: 'xlsx', tab: 'summary', filters }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'xlsx', tab: 'summary', filters, summaryColumns: ['nope'] }).success).toBe(false)
  })

  it('дискримінатор tab і format', () => {
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'other', filters, leadFields: ['phone'] }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'pdf', tab: 'leads', filters, leadFields: ['phone'] }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'csv', filters, leadFields: ['phone'] }).success).toBe(false)
  })

  it('comparePeriods ≤ 5 і у форматі дат', () => {
    const period = { date_from: '2026-01-01', date_to: '2026-01-31' }
    const five = Array(5).fill(period)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'summary', filters, summaryColumns: ['total'], comparePeriods: five }).success).toBe(true)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'summary', filters, summaryColumns: ['total'], comparePeriods: [...five, period] }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'], comparePeriods: [...five, period] }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'], comparePeriods: [{ date_from: 'x', date_to: 'y' }] }).success).toBe(false)
  })

  it('dealAmountFrom/To — число або null; granularity enum', () => {
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'], dealAmountFrom: null, dealAmountTo: 100 }).success).toBe(true)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'], dealAmountFrom: '10' }).success).toBe(false)
    expect(exportBodySchema.safeParse({ format: 'csv', tab: 'summary', filters, summaryColumns: ['total'], granularity: 'year' }).success).toBe(false)
  })
})

describe('buildExportFileName / orderLeadFields / filtersToReportParams', () => {
  it('імʼя файлу за вкладкою, форматом і порівнянням', () => {
    const leads = exportBodySchema.parse({ format: 'csv', tab: 'leads', filters, leadFields: ['phone'] })
    expect(buildExportFileName(leads)).toBe('leads_2026-01-01_2026-01-31.csv')
    const summary = exportBodySchema.parse({ format: 'xlsx', tab: 'summary', filters, summaryColumns: ['total'] })
    expect(buildExportFileName(summary)).toBe('analytics_2026-01-01_2026-01-31.xlsx')
    const cmp = exportBodySchema.parse({ format: 'xlsx', tab: 'summary', filters, summaryColumns: ['total'], comparePeriods: [filters] })
    expect(buildExportFileName(cmp)).toBe('analytics_2026-01-01_2026-01-31_compare.xlsx')
  })

  it('порядок полів — за LEAD_FIELD_ORDER', () => {
    expect(orderLeadFields(['comments', 'phone', 'dates'])).toEqual(['dates', 'phone', 'comments'])
  })

  it('фільтри → параметри звіту (масиви через кому, granularity = group_by)', () => {
    const f = exportFiltersSchema.parse({ ...filters, filter_assignee_ids: ['a', 'b'], filter_status_ids: ['s'] })
    expect(filtersToReportParams(f, 'week')).toEqual({
      date_from: '2026-01-01', date_to: '2026-01-31', group_by: 'week', ts_granularity: 'week',
      filter_utm_source: '', filter_service: '', filter_assigned_to: '',
      filter_assignee_ids: 'a,b', filter_status_ids: 's', filter_gclid: 'any',
    })
    expect(filtersToReportParams(f).group_by).toBe('day')
  })
})
