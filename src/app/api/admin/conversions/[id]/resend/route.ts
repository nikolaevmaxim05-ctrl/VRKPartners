// POST /api/admin/conversions/[id]/resend
// Повторна відправка існуючої конверсії у Google Sheets.
// Після успішної відправки помічає конверсію як вивантажену (export_status='exported').
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendConversionToSheets } from '@/lib/google-sheets'
import { markConversionExportedByLead } from '@/lib/conversions'
import { hasAnyPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

type LeadJoin = {
  id: string
  order_no: number
  email: string | null
  phone: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  deal_amount: number | string | null
  deal_profit: number | string | null
  status: { conversion_action: string | null } | null
}

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

  const { data: conv, error } = await service
    .from('offline_conversions')
    .select(`
      id, lead_id, conversion_value,
      lead:leads(
        id, order_no, email, phone, gclid, gbraid, wbraid,
        status:lead_statuses(conversion_action)
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!conv?.lead) {
    return NextResponse.json({ error: 'Конверсію або відповідного ліда не знайдено' }, { status: 404 })
  }

  const lead = conv.lead as unknown as LeadJoin
  const convValue = (conv as { conversion_value: number | string | null }).conversion_value

  try {
    const sent = await sendConversionToSheets({
      lead_id: lead.id,
      order_no: lead.order_no,
      email: lead.email,
      phone: lead.phone,
      gclid: lead.gclid,
      gbraid: lead.gbraid,
      wbraid: lead.wbraid,
      // C2: відправляємо ЗБЕРЕЖЕНЕ значення конверсії (фід = offline_conversions).
      conversionValue: convValue != null ? Number(convValue) : null,
      conversionAction: lead.status?.conversion_action ?? null,
    })
    if (!sent) {
      return NextResponse.json(
        { ok: false, message: 'Google Sheets не налаштовано — нічого не відправлено' },
        { status: 400 }
      )
    }
    // Успішно відправлено → помічаємо конверсію як вивантажену
    await markConversionExportedByLead(lead.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin/conversions/[id]/resend] sheets_failed', msg)
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
