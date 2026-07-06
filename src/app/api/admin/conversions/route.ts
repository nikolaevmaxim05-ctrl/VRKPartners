// GET /api/admin/conversions — список офлайн-конверсій з даними ліда
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
    .from('offline_conversions')
    .select(
      `
        id,
        lead_id,
        gclid,
        gbraid,
        wbraid,
        conversion_action,
        conversion_value,
        conversion_currency,
        conversion_time,
        export_status,
        exported_at,
        created_at,
        lead:leads(id, name, phone, service)
      `
    )
    .order('conversion_time', { ascending: false })

  if (error) {
    console.error('[admin/conversions] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
