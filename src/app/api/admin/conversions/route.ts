// GET /api/admin/conversions — список офлайн-конверсій з даними ліда (з пагінацією)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireApiAccess } from '@/lib/api-guard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guard = await requireApiAccess(['manage_conversions', 'manage_users'])
  if (!guard.ok) return guard.response

  // C9: пагінація за зразком leads — без range PostgREST мовчки ріже на 1000 рядках.
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50') || 50))
  const offset = (page - 1) * limit

  const service = createServiceClient()
  const { data, count, error } = await service
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
      `,
      { count: 'exact' }
    )
    .order('conversion_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[admin/conversions] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Загальна к-сть pending (по всіх сторінках) — для точного лейбла «Вивантажити всі».
  const { count: pendingTotal } = await service
    .from('offline_conversions')
    .select('id', { count: 'exact', head: true })
    .eq('export_status', 'pending')

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
    pendingTotal: pendingTotal ?? 0,
  })
}
