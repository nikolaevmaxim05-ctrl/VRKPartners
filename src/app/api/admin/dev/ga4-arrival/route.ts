// POST /api/admin/dev/ga4-arrival — реальная проверка доставки событий в GA4 (Dev tools → шаг 2).
// Скрыто за NEXT_PUBLIC_DEV_TOOLS=1: без него — 404 даже при прямом запросе.
import { NextResponse } from 'next/server'
import { getVerifyGa4, isDevToolsEnabled } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'

export const runtime = 'nodejs'
// Realtime иногда обновляется до ~1 мин — нужен более долгий лимит.
export const maxDuration = 60

export async function POST() {
  if (!isDevToolsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return withAdmin(['manage_settings', 'view_reports'], async () => NextResponse.json(await getVerifyGa4()()))
}
