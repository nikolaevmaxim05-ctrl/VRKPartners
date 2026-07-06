// PATCH  /api/admin/lead-statuses/[id] — редагування стадії
// DELETE /api/admin/lead-statuses/[id] — видалення стадії
//
// Усі стадії рівноправні: is_system більше не захищає від змін/видалення.
// Інваріанти на DELETE:
//   - не можна видалити єдину is_initial=true стадію
//   - не можна видалити стадію з живими лідами
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { validateConversionAction } from '@/lib/conversion-action'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ConversionType = 'target_lead' | 'non_target_lead' | 'deal' | 'deal_adjustment'

const VALID_CONVERSION_TYPES: readonly ConversionType[] = [
  'target_lead',
  'non_target_lead',
  'deal',
  'deal_adjustment',
] as const

const AMOUNT_CONVERSION_TYPES: readonly ConversionType[] = ['deal', 'deal_adjustment'] as const

const STATUS_SELECT =
  'id, name, color, position, is_final, is_initial, conversion_type, conversion_action, requires_amount, amount_is_profit, allowed_next_status_ids, allowed_prev_status_ids'

type PatchBody = Partial<{
  name: string
  color: string
  position: number
  is_final: boolean
  is_initial: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
  amount_is_profit: boolean
  allowed_next_status_ids: string[]
  allowed_prev_status_ids: string[]
}>

type CurrentStatusRow = {
  id: string
  is_initial: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PatchBody
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
    .maybeSingle<CurrentStatusRow>()

  if (getErr || !current) {
    return NextResponse.json({ error: 'Стадія не знайдена' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  // ── Прості поля ────────────────────────────────────────────────────────────

  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed || trimmed.length > 64) {
      return NextResponse.json({ error: 'Назва: 1-64 символи' }, { status: 400 })
    }
    update.name = trimmed
  }

  if (body.color !== undefined) {
    if (!HEX_COLOR.test(body.color)) {
      return NextResponse.json({ error: 'Колір має бути у форматі #rrggbb' }, { status: 400 })
    }
    update.color = body.color
  }

  if (body.position !== undefined) {
    const p = Number(body.position)
    if (!Number.isFinite(p) || p < 0) {
      return NextResponse.json({ error: 'Невірна позиція' }, { status: 400 })
    }
    update.position = Math.floor(p)
  }

  if (body.conversion_action !== undefined) {
    const conversionActionError = validateConversionAction(body.conversion_action)
    if (conversionActionError) {
      return NextResponse.json({ error: conversionActionError }, { status: 400 })
    }
    const trimmed = typeof body.conversion_action === 'string'
      ? body.conversion_action.trim()
      : null
    update.conversion_action = trimmed || null
  }

  // ── Воронкові переходи ─────────────────────────────────────────────────────

  if (body.allowed_next_status_ids !== undefined) {
    if (!Array.isArray(body.allowed_next_status_ids)) {
      return NextResponse.json({ error: 'allowed_next_status_ids має бути масивом' }, { status: 400 })
    }
    if (!body.allowed_next_status_ids.every((v) => typeof v === 'string')) {
      return NextResponse.json({ error: 'allowed_next_status_ids: усі елементи мають бути рядками' }, { status: 400 })
    }
    update.allowed_next_status_ids = body.allowed_next_status_ids
  }

  if (body.allowed_prev_status_ids !== undefined) {
    if (!Array.isArray(body.allowed_prev_status_ids)) {
      return NextResponse.json({ error: 'allowed_prev_status_ids має бути масивом' }, { status: 400 })
    }
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const v of body.allowed_prev_status_ids) {
      if (typeof v !== 'string' || !UUID_RE.test(v)) {
        return NextResponse.json({ error: 'allowed_prev_status_ids: невірний UUID' }, { status: 400 })
      }
      if (!seen.has(v)) {
        seen.add(v)
        cleaned.push(v)
      }
    }
    update.allowed_prev_status_ids = cleaned
  }

  // ── conversion_type / is_final ─────────────────────────────────────────────

  // Ефективний conversion_type після усіх змін у body
  const effectiveConversionType =
    body.conversion_type !== undefined ? body.conversion_type : current.conversion_type

  if (body.conversion_type !== undefined) {
    if (body.conversion_type !== null && !VALID_CONVERSION_TYPES.includes(body.conversion_type)) {
      return NextResponse.json(
        { error: 'conversion_type: target_lead / non_target_lead / deal / deal_adjustment / null' },
        { status: 400 },
      )
    }
    update.conversion_type = body.conversion_type
    if (body.conversion_type !== null) {
      // Інваріант: conversion_type != null ⇒ is_final = true
      update.is_final = true
    } else if (body.is_final === undefined && current.conversion_type !== null) {
      // Скидання типу конверсії без явного is_final у body — знімаємо «кінцеву»,
      // щоб прапор не залипав (клієнт надсилає is_final явно, це запасний шлях)
      update.is_final = false
    }
  }

  if (body.is_final !== undefined) {
    // Інваріант: при ефективному conversion_type != null is_final завжди true.
    // Напрямок conversion_type = null + is_final = false — дозволений.
    update.is_final = effectiveConversionType !== null ? true : !!body.is_final
  }

  // ── requires_amount / amount_is_profit ─────────────────────────────────────
  const isAmountConversion =
    effectiveConversionType !== null && AMOUNT_CONVERSION_TYPES.includes(effectiveConversionType)

  if (body.requires_amount !== undefined) {
    const wants = !!body.requires_amount
    if (wants && !isAmountConversion) {
      return NextResponse.json(
        { error: 'requires_amount допустимий лише для типу конверсії «Угода» або «Корекція угоди»' },
        { status: 400 },
      )
    }
    update.requires_amount = wants
    if (!wants) update.amount_is_profit = false
  } else if (!isAmountConversion && current.requires_amount) {
    // При зміні conversion_type на non-amount тип — автоматично скидаємо requires_amount
    update.requires_amount = false
    update.amount_is_profit = false
  }

  if (body.amount_is_profit !== undefined) {
    const wants = !!body.amount_is_profit
    const effectiveRequires =
      update.requires_amount !== undefined ? !!update.requires_amount : current.requires_amount
    if (wants && !effectiveRequires) {
      return NextResponse.json(
        { error: 'amount_is_profit допустимий лише коли requires_amount=true' },
        { status: 400 },
      )
    }
    update.amount_is_profit = wants
  }

  // ── conversion_action обов'язковий, якщо conversion_type != null ───────────
  if (effectiveConversionType !== null) {
    const effectiveAction =
      update.conversion_action !== undefined
        ? (update.conversion_action as string | null)
        : current.conversion_action
    if (!effectiveAction || effectiveAction.trim() === '') {
      return NextResponse.json(
        { error: 'При обраному типі конверсії обов\'язкова назва конверсії в Google Ads' },
        { status: 400 },
      )
    }
  }

  // ── is_initial — radio-поведінка: спершу скидаємо у всіх інших ─────────────
  if (body.is_initial === true) {
    await service
      .from('lead_statuses')
      .update({ is_initial: false })
      .neq('id', id)
    update.is_initial = true
  } else if (body.is_initial === false) {
    // Захист від зняття останньої is_initial
    if (current.is_initial) {
      const { count: otherInitial } = await service
        .from('lead_statuses')
        .select('id', { count: 'exact', head: true })
        .eq('is_initial', true)
        .neq('id', id)
      if ((otherInitial ?? 0) === 0) {
        return NextResponse.json(
          { error: 'Має існувати щонайменше одна початкова стадія' },
          { status: 400 },
        )
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
