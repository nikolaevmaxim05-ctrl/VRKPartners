// GET /api/admin/analytics/report — зведений аналітичний звіт
//
// Параметри query (всі snake_case):
//   date_from            YYYY-MM-DD (default: сьогодні - 30 днів)
//   date_to              YYYY-MM-DD (default: сьогодні)
//   group_by             utm_source|utm_medium|utm_campaign|utm_term|utm_content|
//                        status|service|assigned_to|day|week|month|custom_field
//                        (default: day)
//   custom_field_id      UUID (обов'язковий при group_by=custom_field)
//   ts_granularity       day|week|month (default: day)
//   filter_utm_source    рядок (default: '')
//   filter_service       рядок (default: '')
//   filter_assigned_to   UUID або '' (default: '')
//   filter_status_ids    UUID через кому (default: '')
//   filter_gclid         any|with|without (default: any)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { buildReportForParams } from '@/lib/analytics-report-server'

export const runtime = 'nodejs'

// UUID-регулярка для валідації custom_field_id
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Zod-схема вхідних параметрів ────────────────────────────────────────────

const paramsSchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from має бути YYYY-MM-DD'),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to має бути YYYY-MM-DD'),
  group_by: z
    .enum([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'status', 'service', 'assigned_to',
      'day', 'week', 'month',
      'custom_field',
    ])
    .default('utm_source'),
  custom_field_id:    z.string().optional().default(''),
  ts_granularity:     z.enum(['day', 'week', 'month']).default('day'),
  filter_utm_source:  z.string().optional().default(''),
  filter_service:     z.string().optional().default(''),
  filter_assigned_to: z.string().optional().default(''),
  filter_assignee_ids: z.string().optional().default(''),
  filter_status_ids:  z.string().optional().default(''),
  filter_gclid:       z.enum(['any', 'with', 'without']).default('any'),
  filter_group_value: z.string().optional().default(''),
  breakdown: z
    .enum(['none', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
           'status', 'service', 'assigned_to'])
    .optional()
    .default('none'),
  breakdown_metric: z
    .enum(['total', 'targetLeads', 'nonTargetLeads', 'deals', 'dealAmountSum', 'dealProfitSum'])
    .optional()
    .default('total'),
  // Нове: список метрик через кому (multi-metric breakdown). Має пріоритет над breakdown_metric.
  breakdown_metrics: z.string().optional().default(''),
})

// ─── Хелпер: дефолтні дати ───────────────────────────────────────────────────

function defaultDateFrom(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().substring(0, 10)
}

function defaultDateTo(): string {
  return new Date().toISOString().substring(0, 10)
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Авторизація
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Перевірка прав
  const allowed = await hasPermission(user.id, 'view_reports')
  if (!allowed) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  // 3. Парсинг та валідація query-параметрів
  const { searchParams } = new URL(request.url)

  const rawParams = {
    date_from:          searchParams.get('date_from')          ?? defaultDateFrom(),
    date_to:            searchParams.get('date_to')            ?? defaultDateTo(),
    group_by:           searchParams.get('group_by')           ?? 'utm_source',
    custom_field_id:    searchParams.get('custom_field_id')    ?? '',
    ts_granularity:     searchParams.get('ts_granularity')     ?? 'day',
    filter_utm_source:  searchParams.get('filter_utm_source')  ?? '',
    filter_service:     searchParams.get('filter_service')     ?? '',
    filter_assigned_to: searchParams.get('filter_assigned_to') ?? '',
    filter_assignee_ids: searchParams.get('filter_assignee_ids') ?? '',
    filter_status_ids:  searchParams.get('filter_status_ids')  ?? '',
    filter_gclid:       searchParams.get('filter_gclid')       ?? 'any',
    filter_group_value: searchParams.get('filter_group_value') ?? '',
    breakdown:          searchParams.get('breakdown')          ?? 'none',
    breakdown_metric:   searchParams.get('breakdown_metric')   ?? 'total',
    breakdown_metrics:  searchParams.get('breakdown_metrics')  ?? '',
  }

  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 }
    )
  }

  const params = parsed.data

  // 4. Валідація: custom_field вимагає custom_field_id (UUID)
  if (params.group_by === 'custom_field') {
    if (!params.custom_field_id || !UUID_REGEX.test(params.custom_field_id)) {
      return NextResponse.json(
        { error: "custom_field_id є обов'язковим і має бути валідним UUID при group_by=custom_field" },
        { status: 400 }
      )
    }
  }

  // 5. Отримати звіт через спільний хелпер (замість ~150 рядків дублікату)
  const reportOrError = await buildReportForParams(params)

  if ('error' in reportOrError) {
    return NextResponse.json(
      { error: reportOrError.error, ...(reportOrError.code ? { code: reportOrError.code } : {}) },
      { status: reportOrError.status }
    )
  }

  return NextResponse.json(reportOrError)
}
