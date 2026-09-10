// POST /api/admin/integrations/[key]/test — тест зʼєднання для ключа (значення з БД, реальний API-запит).
import { NextRequest, NextResponse } from 'next/server'
import { getIntegrationUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'

export const runtime = 'nodejs'

export const POST = (_request: NextRequest, { params }: { params: Promise<{ key: string }> }) =>
  withAdmin(['manage_settings', 'manage_integrations'], async (actor) => {
    const { key } = await params
    return NextResponse.json(await getIntegrationUseCases().testIntegration(key, actor))
  })
