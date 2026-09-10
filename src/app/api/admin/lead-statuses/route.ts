// GET  /api/admin/lead-statuses — список усіх стадій воронки, відсортованих по position
// POST /api/admin/lead-statuses — створити нову стадію (потрібно manage_settings)
// Правила конфігурації стадії — у ядрі (core/domain/funnel/stage-rules.planNewStage).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { planNewStage, type StageCreateBody } from '@core/domain/funnel/stage-rules'

export const runtime = 'nodejs'

const STATUS_SELECT =
  'id, name, color, position, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit, allowed_next_status_ids, allowed_prev_status_ids'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const [statusesResult, pipelinesResult] = await Promise.all([
    service
      .from('lead_statuses')
      .select(STATUS_SELECT)
      .order('position', { ascending: true }),
    service
      .from('site_settings')
      .select('value')
      .eq('key', 'pipelines_enabled')
      .maybeSingle(),
  ])

  if (statusesResult.error) {
    console.error('[admin/lead-statuses] query_failed', statusesResult.error.message)
    return NextResponse.json({ error: statusesResult.error.message }, { status: 500 })
  }

  const pipelinesEnabled = pipelinesResult.data?.value === 'true'

  return NextResponse.json({
    data: statusesResult.data ?? [],
    pipelines_enabled: pipelinesEnabled,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: StageCreateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const plan = planNewStage(body)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })
  const v = plan.values

  const service = createServiceClient()

  // position — кінець списку
  const { data: maxRow } = await service
    .from('lead_statuses')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxRow?.position ?? 0) + 1

  // Якщо нова стадія is_initial — спочатку скидаємо у всіх інших
  if (v.is_initial) {
    await service.from('lead_statuses').update({ is_initial: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await service
    .from('lead_statuses')
    .insert({ ...v, position: nextPosition })
    .select(STATUS_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Стадія з такою назвою вже існує' }, { status: 409 })
    }
    console.error('[admin/lead-statuses] insert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
