// GET /api/admin/leads — список заявок з фільтрами/пагінацією + статус, відповідальний, маркер повтору
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAccess } from '@/lib/api-guard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Список лідів містить PII (телефон, email, IP, UA, UTM) — доступ лише тим,
  // хто має право працювати з лідами/звітами, і лише активним користувачам.
  const guard = await requireApiAccess(['manage_leads', 'view_reports', 'export_data', 'manage_conversions'])
  if (!guard.ok) return guard.response

  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20') || 20))
  const search = (searchParams.get('search') ?? '').trim()
  const service = (searchParams.get('service') ?? '').trim()
  const utmSource = (searchParams.get('utm_source') ?? '').trim()
  const utmField = (searchParams.get('utm_field') ?? '').trim()
  const utmValue = (searchParams.get('utm_value') ?? '').trim()
  const statusId = (searchParams.get('status_id') ?? '').trim()

  // Білий список UTM-колонок для фільтра за значенням (захист від інʼєкції імені поля)
  const UTM_FILTER_FIELDS = ['utm_campaign', 'utm_medium', 'utm_term', 'utm_content']
  const assignedTo = (searchParams.get('assigned_to') ?? '').trim()
  const dateFrom = (searchParams.get('date_from') ?? '').trim()
  const dateTo = (searchParams.get('date_to') ?? '').trim()

  const offset = (page - 1) * limit

  let query = supabase
    .from('leads')
    .select(
      `
        *,
        status:lead_statuses!left(id, name, color, is_final)
      `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    // Екранування % і _ — це wildcards в ilike
    const escaped = search.replace(/[%_]/g, '\\$&')
    query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
  }
  if (service) query = query.eq('service', service)
  if (utmSource) query = query.eq('utm_source', utmSource)
  if (utmValue && UTM_FILTER_FIELDS.includes(utmField)) {
    const escaped = utmValue.replace(/[%_]/g, '\\$&')
    query = query.ilike(utmField, `%${escaped}%`)
  }
  if (statusId) query = query.eq('status_id', statusId)
  if (assignedTo) {
    if (assignedTo === 'unassigned') query = query.is('assigned_to', null)
    else query = query.eq('assigned_to', assignedTo)
  }
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) {
    const endOfDay = new Date(dateTo)
    if (!isNaN(endOfDay.getTime())) {
      endOfDay.setHours(23, 59, 59, 999)
      query = query.lte('created_at', endOfDay.toISOString())
    }
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[admin/leads] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Резолв email і display name відповідальних.
  // user_roles джойниться окремо — немає прямого FK leads → user_roles.
  type Row = Record<string, unknown> & {
    assigned_to: string | null
    assignee_email?: string | null
    assignee_name?: string | null
  }
  const rows = (data ?? []) as Row[]
  const assignedIds = Array.from(
    new Set(rows.map((r) => r.assigned_to).filter((v): v is string => !!v))
  )

  let emailById = new Map<string, string>()
  let nameById = new Map<string, string>()

  if (assignedIds.length > 0) {
    const svc = createServiceClient()
    try {
      const [{ data: usersData }, { data: rolesData }] = await Promise.all([
        svc.auth.admin.listUsers({ perPage: 200 }),
        svc.from('user_roles').select('user_id, name').in('user_id', assignedIds),
      ])
      emailById = new Map(
        (usersData?.users ?? [])
          .filter((u) => assignedIds.includes(u.id))
          .map((u) => [u.id, u.email ?? ''])
      )
      nameById = new Map(
        (rolesData ?? [])
          .filter((r): r is { user_id: string; name: string } => !!r.name)
          .map((r) => [r.user_id, r.name])
      )
    } catch (e) {
      console.error('[admin/leads] assignee_resolve_failed', e)
    }
  }

  const enriched = rows.map((r) => {
    const id = r.assigned_to
    return {
      ...r,
      assignee_email: id ? emailById.get(id) ?? null : null,
      assignee_name: id ? nameById.get(id) ?? null : null,
    }
  })

  return NextResponse.json({
    data: enriched,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}
