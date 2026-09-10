// POST /api/admin/analytics/export — конструктор вивантаження
//
// Приймає JSON-тіло з вибором формату, вкладки, полів, фільтрів і порівняльних
// діапазонів. Відповідає файлом (CSV або XLSX).
//
// GET-обробник видалено — UI перейшов на POST-діалог.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { buildReportForParams } from '@/lib/analytics-report-server'
import { kyivBoundaryToUtc, buildAssigneeLabelMap } from '@/lib/analytics-report-server'
import type { DbLeadRow } from '@/lib/analytics-report-server'
import {
  sanitizeCsvCell,
  sanitizeSheetName,
  uniqueSheetName,
  filterByDealAmount,
  wasTargetPredicate,
  wasNonTargetPredicate,
  buildPeriodRows,
  buildComparisonTable,
  wrapPhoneForCsv,
  SUMMARY_COLUMN_HEADERS,
} from '@/lib/analytics-export'
import type { SummaryColumn, ComparisonPeriod } from '@/lib/analytics-export'
import { getServiceLabel } from '@/lib/services'

export const runtime = 'nodejs'

const LEAD_EXPORT_LIMIT = 10_000
const CHUNK_SIZE        = 500

// ─── Zod: тіло запиту ────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const filtersSchema = z.object({
  date_from:          z.string().regex(DATE_RE, 'date_from має бути YYYY-MM-DD'),
  date_to:            z.string().regex(DATE_RE, 'date_to має бути YYYY-MM-DD'),
  filter_utm_source:  z.string().optional().default(''),
  filter_service:     z.string().optional().default(''),
  filter_assigned_to: z.string().optional().default(''),
  filter_assignee_ids: z.array(z.string()).optional().default([]),
  filter_status_ids:  z.array(z.string()).optional().default([]),
  filter_gclid:       z.enum(['any', 'with', 'without']).optional().default('any'),
})

const leadExportFieldSchema = z.enum([
  'dates', 'utm_source', 'all_utm', 'status', 'custom_fields',
  'manager_history', 'comments', 'phone', 'email', 'service',
  'assigned_to', 'deal_amount', 'was_target', 'was_non_target',
])

// Порядок колонок у вивантаженні: від значущих (основні дані ліда) до другорядних
// (детальні UTM-мітки, історія, чат). Сортуємо вибрані поля за цим пріоритетом.
const LEAD_FIELD_ORDER: z.infer<typeof leadExportFieldSchema>[] = [
  'dates', 'phone', 'email', 'service', 'status', 'assigned_to',
  'deal_amount', 'was_target', 'was_non_target',
  'utm_source', 'all_utm', 'custom_fields', 'manager_history', 'comments',
]

function orderLeadFields(
  fields: z.infer<typeof leadExportFieldSchema>[],
): z.infer<typeof leadExportFieldSchema>[] {
  return [...fields].sort(
    (a, b) => LEAD_FIELD_ORDER.indexOf(a) - LEAD_FIELD_ORDER.indexOf(b),
  )
}

const summaryColumnSchema = z.enum([
  'total', 'nonTargetLeads', 'targetLeads', 'deals',
  'dealAmountSum', 'dealProfitSum',
  'conversionToNonTarget', 'conversionToTarget', 'conversionToDeal',
])

const comparePeriodSchema = z.object({
  date_from: z.string().regex(DATE_RE),
  date_to:   z.string().regex(DATE_RE),
})

const bodySchema = z.discriminatedUnion('tab', [
  z.object({
    format:  z.enum(['csv', 'xlsx']),
    tab:     z.literal('leads'),
    filters: filtersSchema,
    leadFields:      z.array(leadExportFieldSchema).min(1, "leadFields не може бути порожнім"),
    dealAmountFrom:  z.number().nullable().optional(),
    dealAmountTo:    z.number().nullable().optional(),
    comparePeriods:  z.array(comparePeriodSchema).max(5).optional(),
    summaryColumns:     z.array(summaryColumnSchema).optional(),
    includeDateBreakdown: z.boolean().optional(),
    granularity:     z.enum(['day', 'week', 'month']).optional(),
  }),
  z.object({
    format:  z.enum(['csv', 'xlsx']),
    tab:     z.literal('summary'),
    filters: filtersSchema,
    summaryColumns:       z.array(summaryColumnSchema).min(1, "summaryColumns не може бути порожнім"),
    includeDateBreakdown: z.boolean().optional().default(false),
    granularity:          z.enum(['day', 'week', 'month']).optional().default('day'),
    comparePeriods:       z.array(comparePeriodSchema).max(5).optional(),
    leadFields:           z.array(leadExportFieldSchema).optional(),
    dealAmountFrom:       z.number().nullable().optional(),
    dealAmountTo:         z.number().nullable().optional(),
  }),
])

type ParsedBody = z.infer<typeof bodySchema>

// ─── Форматування дати у Kyiv-часовому поясі ─────────────────────────────────

function formatKyivDateTime(isoUtc: string): string {
  const d = new Date(isoUtc)
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(d).replace(',', '')
}

function formatKyivDate(isoUtc: string): string {
  const d = new Date(isoUtc)
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  }).format(d)
}

// ─── Ім'я файлу ───────────────────────────────────────────────────────────────

function buildFileName(body: ParsedBody): string {
  const { date_from, date_to } = body.filters
  const ext = body.format
  if (body.tab === 'leads') {
    return `leads_${date_from}_${date_to}.${ext}`
  }
  const suffix = body.comparePeriods?.length ? '_compare' : ''
  return `analytics_${date_from}_${date_to}${suffix}.${ext}`
}

// ─── Перетворення filters у ReportServerParams ───────────────────────────────

function filtersToServerParams(
  filters: z.infer<typeof filtersSchema>,
  granularity: 'day' | 'week' | 'month' = 'day',
): import('@/lib/analytics-report-server').ReportServerParams {
  return {
    date_from:          filters.date_from,
    date_to:            filters.date_to,
    group_by:           granularity,  // для summary — розбивка за часом
    ts_granularity:     granularity,
    filter_utm_source:  filters.filter_utm_source ?? '',
    filter_service:     filters.filter_service ?? '',
    filter_assigned_to: filters.filter_assigned_to ?? '',
    filter_assignee_ids: (filters.filter_assignee_ids ?? []).join(','),
    filter_status_ids:  (filters.filter_status_ids ?? []).join(','),
    filter_gclid:       filters.filter_gclid ?? 'any',
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

  // 3. Парсинг тіла
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалідний JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const body = parsed.data

  // 4. Додаткова валідація dealAmount
  if (body.tab === 'leads') {
    const { dealAmountFrom: daf, dealAmountTo: dat } = body
    if (daf != null && dat != null && daf > dat) {
      return NextResponse.json(
        { error: 'dealAmountFrom не може бути більше dealAmountTo' },
        { status: 400 }
      )
    }
  }

  try {
    if (body.tab === 'leads') {
      return await handleLeadsExport(body, user)
    } else {
      return await handleSummaryExport(body, user)
    }
  } catch (err) {
    console.error('[admin/analytics/export] generation_failed', err)
    return NextResponse.json({ error: 'Помилка генерації файлу' }, { status: 500 })
  }
}

// ─── Tab = leads ──────────────────────────────────────────────────────────────

async function handleLeadsExport(
  body: ParsedBody & { tab: 'leads' },
  _user: { id: string; email?: string },
): Promise<NextResponse> {
  const service = createServiceClient()
  const { filters, leadFields, dealAmountFrom, dealAmountTo, format } = body
  // Колонки впорядковуємо від значущих до другорядних (порядок чекбоксів у діалозі ігноруємо)
  const orderedFields = orderLeadFields(leadFields)

  const utcFrom = kyivBoundaryToUtc(filters.date_from, false)
  const utcTo   = kyivBoundaryToUtc(filters.date_to,   true)

  // Базові поля + phone, email, fbclid, ttclid, referrer, status
  let query = service
    .from('leads')
    .select(`
      id,
      created_at,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      gclid,
      fbclid,
      ttclid,
      referrer,
      phone,
      email,
      service,
      assigned_to,
      deal_amount,
      deal_profit,
      status_id,
      lead_statuses!left(id, name, color, conversion_type)
    `)
    .gte('created_at', utcFrom)
    .lte('created_at', utcTo)
    .order('created_at', { ascending: false })

  // SQL-фільтри
  if (filters.filter_utm_source)  query = query.eq('utm_source', filters.filter_utm_source)
  if (filters.filter_service)     query = query.eq('service', filters.filter_service)
  if (filters.filter_assigned_to) query = query.eq('assigned_to', filters.filter_assigned_to)
  if (filters.filter_gclid === 'with')    query = query.not('gclid', 'is', null)
  if (filters.filter_gclid === 'without') query = query.is('gclid', null)
  const statusIds = filters.filter_status_ids ?? []
  if (statusIds.length > 0)       query = query.in('status_id', statusIds)

  const { data: rawRows, error: dbErr, count } = await query.limit(LEAD_EXPORT_LIMIT + 1)

  if (dbErr) {
    console.error('[export/leads] query_failed', dbErr.message)
    return NextResponse.json({ error: 'Помилка сервера' }, { status: 500 })
  }

  if ((count ?? rawRows?.length ?? 0) > LEAD_EXPORT_LIMIT) {
    return NextResponse.json(
      { error: 'Забагато рядків для вивантаження — звузьте період або фільтри' },
      { status: 413 }
    )
  }

  type ExtendedDbRow = DbLeadRow & {
    phone: string | null
    email: string | null
    fbclid: string | null
    ttclid: string | null
    referrer: string | null
  }

  let rows = (rawRows ?? []) as unknown as ExtendedDbRow[]

  // Фільтрація по deal_amount (після отримання з БД, бо null треба враховувати)
  const daf = dealAmountFrom ?? null
  const dat = dealAmountTo ?? null
  if (daf != null || dat != null) {
    rows = rows.filter((r) => filterByDealAmount(r.deal_amount, daf, dat))
  }

  const leadIds = rows.map((r) => r.id)

  // Резолв assigneeLabelMap
  const allAssignedIds = Array.from(
    new Set(rows.map((r) => r.assigned_to).filter((v): v is string => !!v))
  )
  const assigneeLabelMap = await buildAssigneeLabelMap(service, allAssignedIds)

  // ── Тяжкі поля — батчеві запити по CHUNK_SIZE ──────────────────────────────

  // custom_fields
  let customFieldDefs: Array<{ id: string; name: string }> = []
  const cfValuesByLead = new Map<string, Map<string, string>>() // lead_id → field_id → value

  if (leadFields.includes('custom_fields') && leadIds.length > 0) {
    const { data: cfDefs } = await service
      .from('lead_custom_fields')
      .select('id, name')
      .order('position', { ascending: true })
    customFieldDefs = cfDefs ?? []

    for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
      const chunk = leadIds.slice(i, i + CHUNK_SIZE)
      const { data: cfVals } = await service
        .from('lead_custom_field_values')
        .select('lead_id, field_id, value')
        .in('lead_id', chunk)
      for (const v of cfVals ?? []) {
        if (!cfValuesByLead.has(v.lead_id as string)) {
          cfValuesByLead.set(v.lead_id as string, new Map())
        }
        cfValuesByLead.get(v.lead_id as string)!.set(v.field_id as string, v.value as string)
      }
    }
  }

  // manager_history (lead_status_history)
  type HistoryRow = { lead_id: string; from_status_id: string | null; to_status_id: string | null; to_conversion_type: string | null; changed_by_email: string | null; created_at: string }
  const historyByLead = new Map<string, HistoryRow[]>()
  // Також потрібно для was_target / was_non_target
  const historyTypesById = new Map<string, Set<string>>() // lead_id → Set<conversion_type>

  // Завантажуємо history якщо потрібне manager_history або was_*/was_non_target
  const needsHistory = leadFields.includes('manager_history')
    || leadFields.includes('was_target')
    || leadFields.includes('was_non_target')
    || leadFields.includes('dates')  // друга колонка дат

  if (needsHistory && leadIds.length > 0) {
    // Підтягуємо назви стадій для history
    type HistoryDbRow = { lead_id: string; from_status_id: string | null; to_status_id: string | null; to_conversion_type: string | null; changed_by_email: string | null; created_at: string }

    for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
      const chunk = leadIds.slice(i, i + CHUNK_SIZE)
      const { data: hRows } = await service
        .from('lead_status_history')
        .select('lead_id, from_status_id, to_status_id, to_conversion_type, changed_by_email, created_at')
        .in('lead_id', chunk)
        .order('created_at', { ascending: true })

      for (const h of (hRows ?? []) as HistoryDbRow[]) {
        if (!historyByLead.has(h.lead_id)) historyByLead.set(h.lead_id, [])
        historyByLead.get(h.lead_id)!.push(h)

        if (h.to_conversion_type) {
          if (!historyTypesById.has(h.lead_id)) historyTypesById.set(h.lead_id, new Set())
          historyTypesById.get(h.lead_id)!.add(h.to_conversion_type)
        }
      }
    }
  }

  // Якщо manager_history — потрібні назви стадій для відображення «Від → До»
  const statusNamesById = new Map<string, string>()
  if (leadFields.includes('manager_history')) {
    const { data: allStatuses } = await service
      .from('lead_statuses')
      .select('id, name')
      .limit(500)
    for (const s of allStatuses ?? []) {
      statusNamesById.set(s.id as string, s.name as string)
    }
  }

  // comments
  type CommentRow = { lead_id: string; created_at: string; user_email: string | null; content: string; type: string }
  const commentsByLead = new Map<string, CommentRow[]>()

  if (leadFields.includes('comments') && leadIds.length > 0) {
    for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
      const chunk = leadIds.slice(i, i + CHUNK_SIZE)
      const { data: cRows } = await service
        .from('lead_comments')
        .select('lead_id, created_at, user_email, content, type')
        .in('lead_id', chunk)
        .in('type', ['comment', 'note'])
        .order('created_at', { ascending: true })

      for (const c of (cRows ?? []) as CommentRow[]) {
        if (!commentsByLead.has(c.lead_id)) commentsByLead.set(c.lead_id, [])
        commentsByLead.get(c.lead_id)!.push(c)
      }
    }
  }

  // ── Побудова рядків ──────────────────────────────────────────────────────────

  // Формуємо заголовки відповідно до впорядкованих полів
  const headers: string[] = []
  for (const field of orderedFields) {
    switch (field) {
      case 'dates':
        headers.push('Дата створення', 'Дата останньої зміни стадії')
        break
      case 'utm_source':
        headers.push('Джерело (utm_source)')
        break
      case 'all_utm':
        headers.push('UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content', 'GCLId', 'FBCLId', 'TTCLId', 'Referrer')
        break
      case 'status':
        headers.push('Стадія')
        break
      case 'custom_fields':
        headers.push(...customFieldDefs.map((f) => f.name))
        break
      case 'manager_history':
        headers.push('Історія стадій')
        break
      case 'comments':
        headers.push('Чат і нотатки')
        break
      case 'phone':
        headers.push('Телефон')
        break
      case 'email':
        headers.push('Email')
        break
      case 'service':
        headers.push('Послуга')
        break
      case 'assigned_to':
        headers.push('Відповідальний')
        break
      case 'deal_amount':
        headers.push('Сума угоди (грн)')
        break
      case 'was_target':
        headers.push('Був цільовим')
        break
      case 'was_non_target':
        headers.push('Був нецільовим')
        break
    }
  }

  // Будуємо dataRows: масив масивів (string | number | Date | null)
  type CellValue = string | number | Date | null
  const dataRows: CellValue[][] = []

  for (const row of rows) {
    const statusRaw = Array.isArray(row.lead_statuses) ? row.lead_statuses[0] : row.lead_statuses
    const historyRows = historyByLead.get(row.id) ?? []
    const historyTypes = historyTypesById.get(row.id) ?? new Set<string>()
    const comments = commentsByLead.get(row.id) ?? []
    const cfMap = cfValuesByLead.get(row.id) ?? new Map<string, string>()

    const cells: CellValue[] = []

    for (const field of orderedFields) {
      switch (field) {
        case 'dates': {
          // Перша — дата створення; друга — max created_at з history
          cells.push(new Date(row.created_at))
          if (historyRows.length > 0) {
            const maxTs = historyRows.reduce((max, h) =>
              h.created_at > max ? h.created_at : max, historyRows[0].created_at)
            cells.push(new Date(maxTs))
          } else {
            cells.push(null)
          }
          break
        }
        case 'utm_source':
          cells.push(row.utm_source)
          break
        case 'all_utm':
          cells.push(
            row.utm_medium,
            row.utm_campaign,
            row.utm_term,
            row.utm_content,
            row.gclid,
            row.fbclid,
            row.ttclid,
            row.referrer,
          )
          break
        case 'status':
          cells.push(statusRaw?.name ?? null)
          break
        case 'custom_fields':
          for (const cf of customFieldDefs) {
            cells.push(cfMap.get(cf.id) ?? null)
          }
          break
        case 'manager_history': {
          // «dd.MM.yyyy HH:mm — Від → До — email»
          const lines = historyRows.map((h) => {
            const dt = formatKyivDateTime(h.created_at)
            const from = h.from_status_id
              ? (statusNamesById.get(h.from_status_id) ?? h.from_status_id)
              : '(початкова)'
            const to = h.to_status_id
              ? (statusNamesById.get(h.to_status_id) ?? h.to_status_id)
              : '—'
            const who = h.changed_by_email ?? '(система)'
            return `${dt} — ${from} → ${to} — ${who}`
          })
          cells.push(lines.length > 0 ? lines.join('\n') : null)
          break
        }
        case 'comments': {
          // «dd.MM.yyyy HH:mm — автор — текст»
          const lines = comments.map((c) => {
            const dt = formatKyivDateTime(c.created_at)
            const author = c.user_email ?? '(система)'
            return `${dt} — ${author} — ${c.content}`
          })
          cells.push(lines.length > 0 ? lines.join('\n') : null)
          break
        }
        case 'phone':
          cells.push(row.phone)
          break
        case 'email':
          cells.push(row.email)
          break
        case 'service':
          cells.push(getServiceLabel(row.service))
          break
        case 'assigned_to':
          cells.push(
            row.assigned_to
              ? (assigneeLabelMap[row.assigned_to] ?? row.assigned_to)
              : null
          )
          break
        case 'deal_amount':
          cells.push(row.deal_amount)
          break
        case 'was_target':
          cells.push(
            wasTargetPredicate(historyTypes, statusRaw?.conversion_type ?? null)
              ? 'Так'
              : 'Ні'
          )
          break
        case 'was_non_target':
          cells.push(
            wasNonTargetPredicate(historyTypes, statusRaw?.conversion_type ?? null)
              ? 'Так'
              : 'Ні'
          )
          break
      }
    }

    dataRows.push(cells)
  }

  const fileName = buildFileName(body)

  if (format === 'csv') {
    const csv = buildLeadsCsv(headers, dataRows, orderedFields)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  // XLSX
  const buffer = await buildLeadsXlsx(headers, dataRows, orderedFields)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

// ─── CSV: leads ───────────────────────────────────────────────────────────────

type LeadExportField = z.infer<typeof leadExportFieldSchema>

function buildLeadsCsv(
  headers: string[],
  dataRows: (string | number | Date | null)[][],
  _leadFields: LeadExportField[],
): string {
  const escapeWithFormula = (v: string | number | Date | null, colIndex: number): string => {
    if (v == null) return '""'
    if (v instanceof Date) {
      return `"${formatKyivDateTime(v.toISOString())}"`
    }
    // Телефон визначаємо за заголовком колонки (headers вже розгорнуті 1:1)
    if (headers[colIndex] === 'Телефон' && typeof v === 'string') {
      // Повертаємо формулу без зовнішніх лапок — Excel зчитує як formula-рядок
      return wrapPhoneForCsv(v)
    }
    const s = String(v)
    // W4: захист від формул (не для телефону — він вже у формулі)
    const sanitized = sanitizeCsvCell(s)
    return `"${sanitized.replace(/"/g, '""')}"`
  }

  // Заголовки — звичайна екранізація (без формульної логіки phone)
  const lines: string[] = [
    headers.map((h) => `"${h}"`).join(','),
    ...dataRows.map((row) =>
      row.map((cell, ci) => escapeWithFormula(cell, ci)).join(',')
    ),
  ]

  // BOM
  return '﻿' + lines.join('\n')
}

// ─── XLSX: leads ──────────────────────────────────────────────────────────────

async function buildLeadsXlsx(
  headers: string[],
  dataRows: (string | number | Date | null)[][],
  leadFields: LeadExportField[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Analytics'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Ліди')
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Авто-ширина колонок за вмістом (заголовок + найдовший рядок у клітинці),
  // у межах [MIN_W, MAX_W]. Багаторядкові клітинки рахуємо за найдовшим рядком.
  const MIN_W = 10
  const MAX_W = 60
  const widths = headers.map((h) => Math.max(MIN_W, Math.min(MAX_W, (h?.length ?? 0) + 2)))
  for (const rowData of dataRows) {
    for (let ci = 0; ci < headers.length; ci++) {
      const v = rowData[ci]
      let len = 0
      if (v instanceof Date) {
        len = 16 // dd.mm.yyyy hh:mm
      } else if (v != null && v !== '') {
        len = String(v).split('\n').reduce((m, line) => Math.max(m, line.length), 0)
      }
      const want = Math.min(MAX_W, len + 2)
      if (want > widths[ci]) widths[ci] = want
    }
  }

  sheet.columns = headers.map((h, i) => ({
    header: h,
    key: `col_${i}`,
    width: widths[i] ?? 20,
  }))

  // Стиль заголовків
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE9ECEF' },
  }

  // Маска типів колонок — 1:1 з headers
  const colTypes: Array<'phone' | 'datetime' | 'number' | 'wraptext' | 'text'> = []
  for (const f of leadFields) {
    switch (f) {
      case 'dates':
        colTypes.push('datetime', 'datetime')
        break
      case 'all_utm':
        for (let i = 0; i < 8; i++) colTypes.push('text')
        break
      case 'custom_fields':
        for (let i = 0; i < customFieldDefCount(headers, leadFields); i++) colTypes.push('text')
        break
      case 'phone':
        colTypes.push('phone')
        break
      case 'deal_amount':
        colTypes.push('number')
        break
      case 'manager_history':
      case 'comments':
        colTypes.push('wraptext')
        break
      default:
        colTypes.push('text')
    }
  }

  // Додаємо рядки даних
  for (const rowData of dataRows) {
    const excelRow = sheet.addRow(rowData.map((v) => {
      if (v instanceof Date) return v
      return v ?? ''
    }))

    for (let ci = 0; ci < colTypes.length; ci++) {
      const cell = excelRow.getCell(ci + 1)
      const typ = colTypes[ci]

      if (typ === 'phone') {
        // Явна рядкова ячейка: значення string + numFmt '@'
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
        if (typeof rowData[ci] === 'number') {
          cell.numFmt = '#,##0.00'
        }
      } else if (typ === 'wraptext') {
        cell.alignment = { wrapText: true, vertical: 'top' }
      }
    }
  }

  // ── Підсумковий рядок із сумами по параметрах (у самому кінці) ──
  const cfCount = customFieldDefCount(headers, leadFields)
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

  const dealIdx       = leadFields.includes('deal_amount')    ? colIndexOf('deal_amount')    : -1
  const targetIdx     = leadFields.includes('was_target')     ? colIndexOf('was_target')     : -1
  const nonTargetIdx  = leadFields.includes('was_non_target') ? colIndexOf('was_non_target') : -1

  const dealSum = dealIdx >= 0
    ? dataRows.reduce((acc, r) => acc + (typeof r[dealIdx] === 'number' ? (r[dealIdx] as number) : 0), 0)
    : 0
  const targetCount    = targetIdx >= 0    ? dataRows.filter((r) => r[targetIdx] === 'Так').length    : 0
  const nonTargetCount = nonTargetIdx >= 0 ? dataRows.filter((r) => r[nonTargetIdx] === 'Так').length : 0

  sheet.addRow([]) // порожній рядок-розділювач

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

// Хелпер: кількість custom field колонок (розраховуємо з headers і leadFields)
function customFieldDefCount(headers: string[], leadFields: LeadExportField[]): number {
  let _offset = 0
  for (const f of leadFields) {
    if (f === 'custom_fields') {
      // підраховуємо кількість залишених заголовків що НЕ відносяться до інших полів
      // Простіший підхід: зберегли loadFields → визначаємо кількість CF-колонок
      // як різницю між загальною кількістю headers і кількістю не-CF заголовків
      let nonCfHeaders = 0
      for (const ff of leadFields) {
        if (ff === 'custom_fields') continue
        if (ff === 'dates') nonCfHeaders += 2
        else if (ff === 'all_utm') nonCfHeaders += 8
        else nonCfHeaders += 1
      }
      return headers.length - nonCfHeaders
    }
    if (f === 'dates') _offset += 2
    else if (f === 'all_utm') _offset += 8
    else _offset += 1
  }
  return 0
}

// ─── Tab = summary ────────────────────────────────────────────────────────────

async function handleSummaryExport(
  body: ParsedBody & { tab: 'summary' },
  _user: { id: string; email?: string },
): Promise<NextResponse> {
  const {
    filters,
    summaryColumns,
    includeDateBreakdown,
    granularity = 'day',
    comparePeriods: rawComparePeriods,
    format,
  } = body

  // Отримуємо звіт для основного діапазону
  const mainParams = filtersToServerParams(filters, granularity)
  const mainReport = await buildReportForParams(mainParams)
  if ('error' in mainReport) {
    return NextResponse.json(
      { error: mainReport.error, ...(mainReport.code ? { code: mainReport.code } : {}) },
      { status: mainReport.status }
    )
  }

  // Фільтруємо dealProfitSum якщо немає profit-стадій
  const effectiveColumns: SummaryColumn[] = summaryColumns.filter(
    (col) => col !== 'dealProfitSum' || mainReport.flags.hasProfitStages
  )

  // Формуємо об'єкти ComparisonPeriod
  const periods: ComparisonPeriod[] = [{
    label: periodLabel(filters.date_from, filters.date_to),
    report: mainReport,
  }]

  // Порівняльні діапазони
  const comparePeriods = rawComparePeriods ?? []
  for (const cp of comparePeriods) {
    const cpParams = filtersToServerParams(
      {
        ...filters,
        date_from: cp.date_from,
        date_to:   cp.date_to,
      },
      granularity,
    )
    const cpReport = await buildReportForParams(cpParams)
    if ('error' in cpReport) {
      // Не блокуємо — пропускаємо з попередженням
      console.warn('[export/summary] compare_period_failed', cpReport.error)
      continue
    }
    periods.push({
      label:  periodLabel(cp.date_from, cp.date_to),
      report: cpReport,
    })
  }

  const fileName = buildFileName(body)

  if (format === 'csv') {
    const csv = buildSummaryCsv(periods, effectiveColumns, includeDateBreakdown ?? false)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  const buffer = await buildSummaryXlsx(periods, effectiveColumns, includeDateBreakdown ?? false)
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

// ─── Форматування мітки діапазону ─────────────────────────────────────────────

function periodLabel(dateFrom: string, dateTo: string): string {
  return `${formatKyivDate(dateFrom + 'T12:00:00Z')} – ${formatKyivDate(dateTo + 'T12:00:00Z')}`
}

// ─── CSV: summary ─────────────────────────────────────────────────────────────

function buildSummaryCsv(
  periods: ComparisonPeriod[],
  columns: SummaryColumn[],
  includeDateBreakdown: boolean,
): string {
  const escape = (v: string | number | null): string => {
    if (v == null) return '""'
    const s = String(v)
    return `"${sanitizeCsvCell(s).replace(/"/g, '""')}"`
  }

  const colHeaders = ['Розріз', ...columns.map((c) => SUMMARY_COLUMN_HEADERS[c])]
  const lines: string[] = []

  // Секції основного і порівняльних діапазонів
  for (const period of periods) {
    lines.push(`"Період: ${period.label}"`)
    lines.push(colHeaders.map((h) => `"${h}"`).join(','))

    const rows = buildPeriodRows(period.report, includeDateBreakdown, columns)
    for (const row of rows) {
      const rowCells: string[] = [escape(row.label)]
      for (const col of columns) {
        rowCells.push(escape(row.values[col]))
      }
      lines.push(rowCells.join(','))
    }
    lines.push('') // пустий рядок-розділювач
  }

  // Секція «Порівняння» якщо є кілька діапазонів
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

  return '﻿' + lines.join('\n')
}

// ─── XLSX: summary ────────────────────────────────────────────────────────────

// Метрики, де зростання — це добре (для адаптивного підсвічування дельт).
// Решта (nonTargetLeads, conversionToNonTarget) — зростання це погано.
const HIGHER_IS_BETTER: Set<SummaryColumn> = new Set([
  'total', 'targetLeads', 'deals', 'dealAmountSum', 'dealProfitSum',
  'conversionToTarget', 'conversionToDeal',
])

// Базова 3-кольорова шкала: t ∈ [-1, 1]. -1 → червоний, 0 → жовтий, +1 → зелений.
function scaleArgb(t: number): string {
  const clamped = Math.max(-1, Math.min(1, t))
  const YELLOW = [255, 235, 132]
  const GREEN  = [99, 190, 123]
  const RED    = [248, 105, 107]
  const lerp = (a: number[], b: number[], k: number) =>
    a.map((c, i) => Math.round(c + (b[i] - c) * k))
  const rgb = clamped >= 0 ? lerp(YELLOW, GREEN, clamped) : lerp(YELLOW, RED, -clamped)
  const hex = rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
  return ('FF' + hex).toUpperCase()
}

// Колір заливки дельти: близько до 0 — жовтий; що краще — то зеленіше;
// що гірше — то червоніше. «Краще/гірше» залежить від метрики (адаптивно).
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
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Analytics'
  workbook.created = new Date()

  // Лист на кожен діапазон
  const usedSheetNames = new Set<string>()
  for (const period of periods) {
    const rawName = period.label
    const baseName = sanitizeSheetName(rawName)
    const sheetName = uniqueSheetName(usedSheetNames, baseName)
    usedSheetNames.add(sheetName)
    const sheet = workbook.addWorksheet(sheetName)
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const colHeaders = ['Розріз', ...columns.map((c) => SUMMARY_COLUMN_HEADERS[c])]

    sheet.columns = colHeaders.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: i === 0 ? 28 : 20,
    }))

    // Стиль заголовку
    const hRow = sheet.getRow(1)
    hRow.font = { bold: true }
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }

    const rows = buildPeriodRows(period.report, includeDateBreakdown, columns)

    for (const row of rows) {
      const values: (string | number)[] = [
        sanitizeCsvCell(row.label),
        ...columns.map((c) => {
          const v = row.values[c]
          return v
        }),
      ]
      const excelRow = sheet.addRow(values)

      if (row.isTotal) {
        excelRow.font = { bold: true }
        excelRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }
      }

      // Числові формати: відсотки і суми (без кольорів — кольори лише в «Порівняння»)
      let ci = 2
      for (const col of columns) {
        if (col === 'dealAmountSum' || col === 'dealProfitSum') {
          excelRow.getCell(ci).numFmt = '#,##0.00 [$₴-422]'
        } else if (col.startsWith('conversion')) {
          excelRow.getCell(ci).numFmt = '0.00"%"'
        }
        ci++
      }
    }
  }

  // Лист «Порівняння» якщо є кілька діапазонів
  if (periods.length > 1) {
    const comparison = buildComparisonTable(periods, columns)
    const compSheet = workbook.addWorksheet('Порівняння')
    compSheet.views = [{ state: 'frozen', ySplit: 1 }]

    compSheet.columns = comparison.headers.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: i === 0 ? 36 : 22,
    }))

    const hRow = compSheet.getRow(1)
    hRow.font = { bold: true }
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } }

    for (const row of comparison.rows) {
      const values: (string | number)[] = [
        row.metricLabel,
        ...row.cells.map((c) => {
          if (typeof c === 'string') return c  // '—'
          return c
        }),
      ]
      const excelRow = compSheet.addRow(values)

      // Форматуємо дельта-колонки (непарні починаючи з 3, тобто індекси 2,4,6...)
      // Порядок: [label, P0, P1, Δ1, P2, Δ2, ...]
      let deltaColIdx = 4  // перша Δ-колонка (1-based)
      for (let i = 1; i < periods.length; i++) {
        const deltaCell = excelRow.getCell(deltaColIdx)
        if (typeof deltaCell.value === 'number') {
          deltaCell.numFmt = '+0.00"%";-0.00"%"'
          // Адаптивна заливка: жовтий біля 0, зелений — краще, червоний — гірше
          deltaCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: deltaFillArgb(deltaCell.value, row.metric) },
          }
        }
        deltaColIdx += 2
      }
    }
  }

  return workbook.xlsx.writeBuffer()
}
