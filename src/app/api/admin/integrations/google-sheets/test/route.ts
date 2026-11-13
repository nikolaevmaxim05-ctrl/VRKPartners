// POST /api/admin/integrations/google-sheets/test — проверка ОБЕИХ таблиц (конверсий и корректировок).
import { NextResponse } from 'next/server'
import { getIntegrationUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'

export const runtime = 'nodejs'

export const POST = () =>
  withAdmin(['manage_settings', 'manage_integrations'], async () =>
    NextResponse.json(await getIntegrationUseCases().testGoogleSheets()),
  )
