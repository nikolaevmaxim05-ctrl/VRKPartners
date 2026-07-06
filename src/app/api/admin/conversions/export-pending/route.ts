// POST /api/admin/conversions/export-pending
// Масова вивантаження всіх конверсій зі статусом 'pending' у Google Sheets.
// Кожну успішно відправлену помічає як export_status='exported'.
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

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasAnyPermission(user.id, ['manage_conversions', 'manage_users'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const service = createServiceClient()
  const { data: rows, error } = await service
    .from('offline_conversions')
    .select(`
      id, lead_id,
      lead:leads(
        id, order_no, email, phone, gclid, gbraid, wbraid,
        deal_amount, deal_profit,
        status:lead_statuses(conversion_action)
      )
    `)
    .eq('export_status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let failed = 0
  let skipped = 0
  for (const row of rows ?? []) {
    const lead = (row as { lead: unknown }).lead as LeadJoin | null
    if (!lead) { failed++; continue }
    try {
      const ok = await sendConversionToSheets({
        lead_id: lead.id,
        order_no: lead.order_no,
        email: lead.email,
        phone: lead.phone,
        gclid: lead.gclid,
        gbraid: lead.gbraid,
        wbraid: lead.wbraid,
        deal_amount: lead.deal_amount != null ? Number(lead.deal_amount) : null,
        deal_profit: lead.deal_profit != null ? Number(lead.deal_profit) : null,
        conversionAction: lead.status?.conversion_action ?? null,
      })
      if (ok) {
        await markConversionExportedByLead(lead.id)
        sent++
      } else {
        skipped++ // Sheets не налаштовано
      }
    } catch (e) {
      console.error('[conversions/export-pending] send_failed', e instanceof Error ? e.message : e)
      failed++
    }
  }

  if (sent === 0 && skipped > 0) {
    return NextResponse.json(
      { ok: false, error: 'Google Sheets не налаштовано — нічого не вивантажено' },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, sent, failed, skipped, total: (rows ?? []).length })
}
