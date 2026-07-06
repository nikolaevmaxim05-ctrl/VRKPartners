// POST /api/admin/conversion-adjustments/[id]/resend
// Повторна відправка корекції у Google Sheets (таблиця корекцій). Після успіху — exported.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendAdjustmentToSheets } from '@/lib/google-sheets'
import { markAdjustmentExported, type AdjustmentType } from '@/lib/conversion-adjustments'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_conversions', 'manage_users']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: adj, error } = await service
    .from('conversion_adjustments')
    .select('id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency, adjustment_time')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!adj) return NextResponse.json({ error: 'Корекцію не знайдено' }, { status: 404 })

  try {
    const sent = await sendAdjustmentToSheets({
      orderNo: adj.order_no,
      conversionAction: adj.conversion_action,
      adjustmentTime: adj.adjustment_time,
      type: adj.adjustment_type as AdjustmentType,
      value: adj.adjusted_value != null ? Number(adj.adjusted_value) : null,
      currency: adj.adjustment_currency,
    })
    if (!sent) {
      return NextResponse.json(
        { ok: false, message: 'Таблицю корекцій не налаштовано — нічого не відправлено' },
        { status: 400 }
      )
    }
    await markAdjustmentExported(adj.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin/conversion-adjustments/[id]/resend] sheets_failed', msg)
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
