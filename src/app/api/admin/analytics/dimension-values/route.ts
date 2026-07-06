// GET /api/admin/analytics/dimension-values
//
// Повертає список РЕАЛЬНИХ значень обраного виміру (для контекстного фільтра
// «Значення» поряд із «Розріз» на вкладці Аналітика).
//
// Параметри query:
//   dimension        utm_source|utm_medium|utm_campaign|utm_term|utm_content|custom_field
//   date_from        YYYY-MM-DD (для utm_* звужує діапазон; default: -30 днів)
//   date_to          YYYY-MM-DD (default: сьогодні)
//   custom_field_id  UUID (обов'язковий при dimension=custom_field)
//
// Відповідь: { data: { value: string; label: string }[] }
//
// Для status/service/assigned_to значення НЕ потрібні — фронт бере їх із уже
// завантажених довідників (стадії, послуги, відповідальні).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { kyivBoundaryToUtc } from '@/lib/analytics-report-server'

export const runtime = 'nodejs'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Білий список колонок utm_* — захист від SQL-інʼєкції (значення = ім'я колонки)
const UTM_COLUMNS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
type UtmColumn = (typeof UTM_COLUMNS)[number]

const paramsSchema = z.object({
  dimension: z.enum([...UTM_COLUMNS, 'custom_field']),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  custom_field_id: z.string().optional().default(''),
})

const MAX_SCAN = 10_000
const MAX_VALUES = 500

function defaultDateFrom(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().substring(0, 10)
}
function defaultDateTo(): string {
  return new Date().toISOString().substring(0, 10)
}

export async function GET(request: NextRequest) {
  // 1. Авторизація
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Права
  const allowed = await hasPermission(user.id, 'view_reports')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  // 3. Параметри
  const { searchParams } = new URL(request.url)
  const parsed = paramsSchema.safeParse({
    dimension:       searchParams.get('dimension') ?? undefined,
    date_from:       searchParams.get('date_from') ?? undefined,
    date_to:         searchParams.get('date_to') ?? undefined,
    custom_field_id: searchParams.get('custom_field_id') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    )
  }
  const { dimension, custom_field_id } = parsed.data
  const dateFrom = parsed.data.date_from ?? defaultDateFrom()
  const dateTo   = parsed.data.date_to ?? defaultDateTo()

  const service = createServiceClient()

  try {
    // ── custom_field: значення з окремої таблиці ──
    if (dimension === 'custom_field') {
      if (!UUID_REGEX.test(custom_field_id)) {
        return NextResponse.json(
          { error: "custom_field_id обовʼязковий і має бути валідним UUID" },
          { status: 400 },
        )
      }
      const { data, error } = await service
        .from('lead_custom_field_values')
        .select('value')
        .eq('field_id', custom_field_id)
        .limit(MAX_SCAN)

      if (error) {
        console.error('[dimension-values] custom_field_query_failed', error.message)
        return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 })
      }

      const values = dedupeSorted(
        (data ?? []).map((r) => (r as { value: unknown }).value),
      )
      return NextResponse.json({ data: values.map((v) => ({ value: v, label: v })) })
    }

    // ── utm_*: distinct значення колонки за діапазоном дат ──
    const col = dimension as UtmColumn
    const utcFrom = kyivBoundaryToUtc(dateFrom, false)
    const utcTo   = kyivBoundaryToUtc(dateTo, true)

    const { data, error } = await service
      .from('leads')
      .select(col)
      .gte('created_at', utcFrom)
      .lte('created_at', utcTo)
      .not(col, 'is', null)
      .limit(MAX_SCAN)

    if (error) {
      console.error('[dimension-values] utm_query_failed', error.message)
      return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const values = dedupeSorted(rows.map((r) => r[col]))
    return NextResponse.json({ data: values.map((v) => ({ value: v, label: v })) })
  } catch (e) {
    console.error('[dimension-values] unexpected', e)
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 })
  }
}

// Унікальні непорожні рядки, відсортовані по-українськи, обрізані до MAX_VALUES
function dedupeSorted(raw: unknown[]): string[] {
  const set = new Set<string>()
  for (const v of raw) {
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) set.add(t)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'uk')).slice(0, MAX_VALUES)
}
