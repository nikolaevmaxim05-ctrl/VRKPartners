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

    // Прибирання старих лічильників rate-limit (вікно 10 хв → усе старше за годину
    // вже неактуальне). Тримає таблицю rate_limits маленькою. Помилка не критична.
    const rlCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { error: rlErr } = await service
      .from('rate_limits')
      .delete()
      .lt('window_started_at', rlCutoff)
    if (rlErr) console.error('[cron/keepalive] rate_limits_cleanup_failed', rlErr.message)

    console.log('[cron/keepalive] ping ok', new Date().toISOString())
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/keepalive] unexpected', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
