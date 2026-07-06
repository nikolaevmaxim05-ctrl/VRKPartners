// POST /api/admin/conversion-adjustments/export-pending
// Масова вивантаження всіх корекцій зі статусом 'pending' у таблицю корекцій Google Sheets.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendAdjustmentToSheets } from '@/lib/google-sheets'
import { markAdjustmentExported, type AdjustmentType } from '@/lib/conversion-adjustments'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasAnyPermission(user.id, ['manage_conversions', 'manage_users'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const service = createServiceClient()
  const { data: rows, error } = await service
    .from('conversion_adjustments')
    .select('id, order_no, conversion_action, adjustment_type, adjusted_value, adjustment_currency, adjustment_time')
    .eq('export_status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let failed = 0
  let skipped = 0
  for (const adj of rows ?? []) {
    try {
      const ok = await sendAdjustmentToSheets({
        orderNo: adj.order_no,
        conversionAction: adj.conversion_action,
        adjustmentTime: adj.adjustment_time,
        type: adj.adjustment_type as AdjustmentType,
        value: adj.adjusted_value != null ? Number(adj.adjusted_value) : null,
        currency: adj.adjustment_currency,
      })
      if (ok) {
        await markAdjustmentExported(adj.id)
        sent++
      } else {
        skipped++ // таблицю корекцій не налаштовано
      }
    } catch (e) {
      console.error('[conversion-adjustments/export-pending] send_failed', e instanceof Error ? e.message : e)
      failed++
    }
  }

  if (sent === 0 && skipped > 0) {
    return NextResponse.json(
      { ok: false, error: 'Таблицю корекцій не налаштовано — нічого не вивантажено' },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, total: (rows ?? []).length })
}
