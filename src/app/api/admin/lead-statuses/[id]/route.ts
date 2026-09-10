// PATCH  /api/admin/lead-statuses/[id] — редагування стадії
// DELETE /api/admin/lead-statuses/[id] — видалення стадії
//
// Правила конфігурації стадії — у ядрі (core/domain/funnel/stage-rules.planStagePatch);
// роут лише виконує план. Інваріанти на DELETE:
//   - не можна видалити єдину is_initial=true стадію
//   - не можна видалити стадію з живими лідами
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import {
  planStagePatch,
  STAGE_ERRORS,
  type StagePatchBody,
  type StageCurrent,
} from '@core/domain/funnel/stage-rules'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const STATUS_SELECT =
  'id, name, color, position, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit, allowed_next_status_ids, allowed_prev_status_ids'

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: StagePatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: current, error: getErr } = await service
    .from('lead_statuses')
    .select('id, is_initial, conversion_type, conversion_action, requires_amount')
    .eq('id', id)
    .maybeSingle<StageCurrent>()

  if (getErr || !current) {
    return NextResponse.json({ error: 'Стадія не знайдена' }, { status: 404 })
  }

  const plan = planStagePatch(body, current)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })
  const update = plan.update

  // ── is_initial — radio-поведінка: спершу скидаємо у всіх інших ─────────────
  if (plan.initial === 'set') {
    await service
      .from('lead_statuses')
      .update({ is_initial: false })
      .neq('id', id)
    update.is_initial = true
  } else if (plan.initial === 'unset') {
    // Захист від зняття останньої is_initial
    if (current.is_initial) {
      const { count: otherInitial } = await service
        .from('lead_statuses')
        .select('id', { count: 'exact', head: true })
        .eq('is_initial', true)
        .neq('id', id)
      if ((otherInitial ?? 0) === 0) {
        return NextResponse.json({ error: STAGE_ERRORS.lastInitial }, { status: 400 })
      }
    }
    update.is_initial = false
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  const { data, error } = await service
    .from('lead_statuses')
    .update(update)
    .eq('id', id)
    .select(STATUS_SELECT)
    .single()

  if (error) {
    console.error('[admin/lead-statuses/[id]] update_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const service = createServiceClient()

  const { data: target, error: getErr } = await service
    .from('lead_statuses')
    .select('id, name, is_initial')
    .eq('id', id)
    .maybeSingle<{ id: string; name: string; is_initial: boolean }>()

  if (getErr || !target) {
    return NextResponse.json({ error: 'Стадія не знайдена' }, { status: 404 })
  }

  // 1) Не можна видалити поточну is_initial — спершу треба обрати іншу
  if (target.is_initial) {
    return NextResponse.json(
      { error: 'Спочатку призначте іншу стадію первинною' },
      { status: 400 },
    )
  }

  // 2) Не можна видалити стадію з живими лідами
  const { count: leadsCount } = await service
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('status_id', id)
  if ((leadsCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Не можна видалити: на стадії знаходиться ${leadsCount} лід(ів). Спочатку переведіть їх на іншу стадію.`,
      },
      { status: 400 },
    )
  }

  const { error: deleteErr } = await service.from('lead_statuses').delete().eq('id', id)
  if (deleteErr) {
    console.error('[admin/lead-statuses/[id]] delete_failed', deleteErr.message)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
