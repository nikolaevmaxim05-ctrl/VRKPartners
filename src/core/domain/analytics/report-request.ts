// core/domain/analytics/report-request — параметри звіту: схема, дефолти, розбір query.
// Перенесено з /api/admin/analytics/report та /dimension-values без зміни поведінки.
import { z } from 'zod'
import type { BreakdownDimension, MetricKeyForBreakdown } from './report'

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Мінімальний набір параметрів, спільний для звіту та вивантаження. */
export interface ReportServerParams {
  date_from: string               // YYYY-MM-DD
  date_to: string                 // YYYY-MM-DD
  group_by: string                // GroupBy
  custom_field_id?: string        // UUID, required when group_by='custom_field'
  ts_granularity: 'day' | 'week' | 'month'
  filter_utm_source: string
  filter_service: string
  filter_assigned_to: string
  /** Кілька відповідальних (UUID через кому). Має пріоритет над filter_assigned_to. */
  filter_assignee_ids?: string
  filter_status_ids: string       // UUID через кому
  filter_gclid: 'any' | 'with' | 'without'
  /** Реферальне посилання: UUID, 'none' (без посилання) або порожньо (всі). */
  filter_referral_link_id?: string
  /** Фільтр по конкретному значенню поточного розрізу (group_by). */
  filter_group_value?: string
  /** Розбивка графіка по виміру. */
  breakdown?: BreakdownDimension
  /** Метрика для breakdown-ліній (легасі, одна). */
  breakdown_metric?: MetricKeyForBreakdown
  /** Метрики для breakdown-ліній (список через кому). Має пріоритет. */
  breakdown_metrics?: string
}

/** Фільтр реферального посилання: '' (всі) | 'none' (без посилання) | UUID. */
export const referralLinkFilterSchema = z
  .string()
  .optional()
  .default('')
  .refine((v) => v === '' || v === 'none' || UUID_REGEX.test(v), {
    message: "filter_referral_link_id має бути UUID або 'none'",
  })

export const reportParamsSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from має бути YYYY-MM-DD'),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to має бути YYYY-MM-DD'),
  group_by: z
    .enum([
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'status', 'service', 'assigned_to', 'referral_link',
      'day', 'week', 'month',
      'custom_field',
    ])
    .default('utm_source'),
  custom_field_id:     z.string().optional().default(''),
  ts_granularity:      z.enum(['day', 'week', 'month']).default('day'),
  filter_utm_source:   z.string().optional().default(''),
  filter_service:      z.string().optional().default(''),
  filter_assigned_to:  z.string().optional().default(''),
  filter_assignee_ids: z.string().optional().default(''),
  filter_status_ids:   z.string().optional().default(''),
  filter_gclid:        z.enum(['any', 'with', 'without']).default('any'),
  filter_referral_link_id: referralLinkFilterSchema,
  filter_group_value:  z.string().optional().default(''),
  breakdown: z
    .enum(['none', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
           'status', 'service', 'assigned_to', 'referral_link'])
    .optional()
    .default('none'),
  breakdown_metric: z
    .enum(['total', 'targetLeads', 'nonTargetLeads', 'deals', 'dealAmountSum', 'dealProfitSum'])
    .optional()
    .default('total'),
  breakdown_metrics: z.string().optional().default(''),
})

export function defaultDateFrom(now: Date): string {
  const d = new Date(now.getTime())
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().substring(0, 10)
}

export function defaultDateTo(now: Date): string {
  return now.toISOString().substring(0, 10)
}

export type ParsedQuery<T> = { ok: true; params: T } | { ok: false; message: string }

/** Розбір query-параметрів звіту (зі значеннями за замовчуванням і перевіркою custom_field). */
export function parseReportQuery(
  get: (key: string) => string | null,
  now: Date,
): ParsedQuery<z.infer<typeof reportParamsSchema>> {
  const raw = {
    date_from:           get('date_from')           ?? defaultDateFrom(now),
    date_to:             get('date_to')             ?? defaultDateTo(now),
    group_by:            get('group_by')            ?? 'utm_source',
    custom_field_id:     get('custom_field_id')     ?? '',
    ts_granularity:      get('ts_granularity')      ?? 'day',
    filter_utm_source:   get('filter_utm_source')   ?? '',
    filter_service:      get('filter_service')      ?? '',
    filter_assigned_to:  get('filter_assigned_to')  ?? '',
    filter_assignee_ids: get('filter_assignee_ids') ?? '',
    filter_status_ids:   get('filter_status_ids')   ?? '',
    filter_gclid:        get('filter_gclid')        ?? 'any',
    filter_referral_link_id: get('filter_referral_link_id') ?? '',
    filter_group_value:  get('filter_group_value')  ?? '',
    breakdown:           get('breakdown')           ?? 'none',
    breakdown_metric:    get('breakdown_metric')    ?? 'total',
    breakdown_metrics:   get('breakdown_metrics')   ?? '',
  }
  const parsed = reportParamsSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.errors.map((e) => e.message).join('; ') }
  }
  const params = parsed.data
  if (params.group_by === 'custom_field') {
    if (!params.custom_field_id || !UUID_REGEX.test(params.custom_field_id)) {
      return {
        ok: false,
        message: "custom_field_id є обов'язковим і має бути валідним UUID при group_by=custom_field",
      }
    }
  }
  return { ok: true, params }
}

// ── Значення виміру (контекстний фільтр «Значення») ──────────────────────────

export const UTM_COLUMNS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

export const dimensionParamsSchema = z.object({
  dimension: z.enum([...UTM_COLUMNS, 'custom_field']),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  custom_field_id: z.string().optional().default(''),
})

export const DIMENSION_MAX_SCAN = 10_000
export const DIMENSION_MAX_VALUES = 500

/** Унікальні непорожні рядки, відсортовані по-українськи, обрізані до DIMENSION_MAX_VALUES. */
export function dedupeSorted(raw: unknown[]): string[] {
  const set = new Set<string>()
  for (const v of raw) {
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) set.add(t)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'uk')).slice(0, DIMENSION_MAX_VALUES)
}

/** Розбиває "a, b,,c" → ['a','b','c']. */
export function splitIds(csv: string | undefined): string[] {
  return csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : []
}
