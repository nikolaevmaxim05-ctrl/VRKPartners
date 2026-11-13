// build-report на фейковых портах: реферальная ссылка как разрез (group_by), разбивка графика
// (breakdown) и фильтр (filter_referral_link_id → запрос репозитория и домен), валидация параметра.
import { describe, it, expect, vi } from 'vitest'
import { makeReportUseCases } from '../build-report'
import { dbOk } from '../../../ports/common'
import type { DbLeadRow } from '../../../../domain/analytics/report-breakdown'

const NOW = new Date('2026-09-27T10:00:00.000Z')
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'

function row(over: Partial<DbLeadRow>): DbLeadRow {
  return {
    id: 'x', created_at: '2026-09-26T09:00:00.000Z',
    utm_source: 'google', utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    gclid: null, service: null, assigned_to: null, deal_amount: null, deal_profit: null,
    status_id: 's1', lead_statuses: { id: 's1', name: 'Нова', color: null, conversion_type: null },
    referral_link_id: null, referral_code: null, referral_links: null,
    ...over,
  }
}

const rows: DbLeadRow[] = [
  row({ id: 'a', referral_link_id: L1, referral_code: 'abcd2345', referral_links: { id: L1, name: 'Партнер А' } }),
  row({ id: 'b', referral_link_id: L1, referral_code: 'abcd2345', referral_links: { id: L1, name: 'Партнер А' } }),
  row({ id: 'c', referral_link_id: L2, referral_code: 'efgh6789', referral_links: { id: L2, name: 'Партнер Б' } }),
  row({ id: 'd', referral_code: 'zzzz9999' }),
  row({ id: 'e' }),
]

function setup() {
  const analytics = {
    reportLeads: vi.fn(async (q: { referralLinkId: string }) => {
      const filtered = q.referralLinkId === 'none'
        ? rows.filter((r) => !r.referral_link_id)
        : q.referralLinkId ? rows.filter((r) => r.referral_link_id === q.referralLinkId) : rows
      return dbOk({ rows: filtered, count: filtered.length })
    }),
    statusFlags: vi.fn(async () => []),
    customFieldValuesByField: vi.fn(async () => dbOk([])),
  }
  const users = { getAssigneeLabelMap: vi.fn(async () => ({})) }
  const uc = makeReportUseCases({ analytics, users, clock: { now: () => NOW } } as never)
  return { uc, analytics }
}

const base = { date_from: '2026-09-20', date_to: '2026-09-27' }
const get = (q: Record<string, string>) => (k: string) => q[k] ?? null

describe('build-report — реферальная ссылка', () => {
  it('group_by=referral_link: строки с названиями партнёров и «Без посилання» для остальных, сортировка по total', async () => {
    const { uc } = setup()
    const r = await uc.getReport(get({ ...base, group_by: 'referral_link' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.rows.map((x) => [x.key, x.label, x.total])).toEqual([
      [L1, 'Партнер А', 2], ['(без посилання)', 'Без посилання', 2], [L2, 'Партнер Б', 1],
    ])
    expect(r.value.total.total).toBe(5)
  })

  it('breakdown=referral_link: серии подписаны названиями партнёров, без ссылки → «Без посилання»', async () => {
    const { uc } = setup()
    const r = await uc.getReport(get({ ...base, breakdown: 'referral_link', breakdown_metrics: 'total' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ts = r.value.timeseriesBreakdown!
    expect(ts.series.map((s) => s.label)).toEqual(['Партнер А', 'Без посилання', 'Партнер Б'])
    const day = ts.points.find((p) => p.dateIso === '2026-09-26')!
    expect(day.values[`${L1}total`]).toBe(2)
    expect(day.values['(без посилання)total']).toBe(2)
  })

  it('filter_referral_link_id=UUID передаётся в запрос репозитория и применяется в домене', async () => {
    const { uc, analytics } = setup()
    const r = await uc.getReport(get({ ...base, group_by: 'utm_source', filter_referral_link_id: L2 }))
    expect(r.ok && r.value.total.total).toBe(1)
    expect(analytics.reportLeads.mock.calls[0][0]).toMatchObject({ referralLinkId: L2 })
  })

  it("filter_referral_link_id=none → только без ссылки; 'abc' → invalid", async () => {
    const { uc, analytics } = setup()
    const r = await uc.getReport(get({ ...base, filter_referral_link_id: 'none' }))
    expect(r.ok && r.value.total.total).toBe(2)
    expect(analytics.reportLeads.mock.calls[0][0]).toMatchObject({ referralLinkId: 'none' })
    const bad = await uc.getReport(get({ ...base, filter_referral_link_id: 'abc' }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('invalid')
  })

  it('без фильтра репозиторий получает referralLinkId="" (без ограничения)', async () => {
    const { uc, analytics } = setup()
    await uc.getReport(get(base))
    expect(analytics.reportLeads.mock.calls[0][0]).toMatchObject({ referralLinkId: '' })
  })
})
