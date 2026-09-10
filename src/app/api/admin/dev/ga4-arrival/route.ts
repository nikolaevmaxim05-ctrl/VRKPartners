// POST /api/admin/dev/ga4-arrival — реальна перевірка доставки подій у GA4 (Dev tools → крок 2).
// Приховано за NEXT_PUBLIC_DEV_TOOLS=1: без нього — 404 навіть за прямого запиту.
import { NextResponse } from 'next/server'
import { getVerifyGa4, isDevToolsEnabled } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'

export const runtime = 'nodejs'
// Realtime інколи оновлюється до ~1 хв — потрібен довший ліміт.
export const maxDuration = 60

export async function POST() {
  if (!isDevToolsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return withAdmin(['manage_settings', 'view_reports'], async () => NextResponse.json(await getVerifyGa4()()))
}
