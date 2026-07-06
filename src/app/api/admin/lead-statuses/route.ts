// GET  /api/admin/lead-statuses — список усіх стадій воронки, відсортованих по position
// POST /api/admin/lead-statuses — створити нову стадію (потрібно manage_settings)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { validateConversionAction } from '@/lib/conversion-action'

export const runtime = 'nodejs'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

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

type PostBody = {
  name?: string
  color?: string
  is_final?: boolean
  is_initial?: boolean
  conversion_type?: ConversionType | null
  conversion_action?: string | null
  requires_amount?: boolean
  amount_is_profit?: boolean
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const color = (body.color ?? '#6b7280').trim()

  if (!name || name.length > 64) {
    return NextResponse.json({ error: 'Назва: 1-64 символи' }, { status: 400 })
  }
  if (!HEX_COLOR.test(color)) {
    return NextResponse.json({ error: 'Колір має бути у форматі #rrggbb' }, { status: 400 })
  }

  // conversion_type валідація
  const conversionType: ConversionType | null =
    body.conversion_type === undefined || body.conversion_type === null ? null : body.conversion_type
  if (conversionType !== null && !VALID_CONVERSION_TYPES.includes(conversionType)) {
    return NextResponse.json(
      { error: 'conversion_type: target_lead / non_target_lead / deal / deal_adjustment / null' },
      { status: 400 },
    )
  }

  // conversion_action: спершу формат (захист від formula injection у Sheets),
  // потім trim → null. Обов'язковий якщо conversion_type != null.
  const conversionActionError = validateConversionAction(body.conversion_action)
  if (conversionActionError) {
    return NextResponse.json({ error: conversionActionError }, { status: 400 })
  }
  const rawConversion = typeof body.conversion_action === 'string'
    ? body.conversion_action.trim()
    : null
  const conversionAction = rawConversion || null
  if (conversionType !== null && !conversionAction) {
    return NextResponse.json(
      { error: 'При обраному типі конверсії обов\'язкова назва конверсії в Google Ads' },
      { status: 400 },
    )
  }

  // requires_amount: дозволено тільки для conversion_type IN ('deal', 'deal_adjustment')
  const requiresAmountRaw = !!body.requires_amount
  if (requiresAmountRaw && (conversionType === null || !AMOUNT_CONVERSION_TYPES.includes(conversionType))) {
    return NextResponse.json(
      { error: 'requires_amount допустимий лише для типу конверсії «Угода» або «Корекція угоди»' },
      { status: 400 },
    )
  }
  const requiresAmount = requiresAmountRaw
  const amountIsProfit = requiresAmount ? !!body.amount_is_profit : false

  // is_final: для конверсії — завжди true; інакше з body
  const isFinal = conversionType !== null ? true : !!body.is_final
  const isInitialRaw = !!body.is_initial

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
  if (isInitialRaw) {
    await service.from('lead_statuses').update({ is_initial: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await service
    .from('lead_statuses')
    .insert({
      name,
      color,
      position: nextPosition,
      is_final: isFinal,
      is_initial: isInitialRaw,
      conversion_type: conversionType,
      conversion_action: conversionAction,
      requires_amount: requiresAmount,
      amount_is_profit: amountIsProfit,
    })
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
