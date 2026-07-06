// GET /api/admin/conversion-adjustments — список корекцій конверсій (RETRACT/RESTATE) з даними ліда
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAnyPermission(user.id, ['manage_conversions', 'manage_users']))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('conversion_adjustments')
    .select(
      `
        id,
        lead_id,
        order_no,
        conversion_action,
        adjustment_type,
        adjusted_value,
        adjustment_currency,
        adjustment_time,
        export_status,
        exported_at,
        created_at,
        lead:leads(id, name, phone, service)
      `
    )
    .order('adjustment_time', { ascending: false })

  if (error) {
    console.error('[admin/conversion-adjustments] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
