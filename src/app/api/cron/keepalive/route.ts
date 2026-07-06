// GET /api/cron/keepalive — lightweight Supabase ping to prevent project from pausing
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  // Перевірити cron secret щоб ніхто сторонній не міг викликати
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const service = createServiceClient()
    // Мінімальний запит — просто переконатись що БД відповідає
    const { error } = await service.from('lead_statuses').select('id').limit(1)

    if (error) {
      console.error('[cron/keepalive] supabase_error', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    console.log('[cron/keepalive] ping ok', new Date().toISOString())
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/keepalive] unexpected', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
