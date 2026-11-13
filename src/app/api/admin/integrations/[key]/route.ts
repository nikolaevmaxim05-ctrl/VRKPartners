// PUT    /api/admin/integrations/[key] — сохранить/обновить ключ (AES-256-GCM)
// DELETE /api/admin/integrations/[key] — удалить ключ
import { NextRequest, NextResponse } from 'next/server'
import { getIntegrationUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { errorResponse, readJson } from '@/presentation/http'
import { INTEGRATION_PERMISSIONS } from '@/presentation/permissions'
import { KNOWN_INTEGRATION_KEYS } from '@core/domain/integrations/keys'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ key: string }> }

const unknownKey = () => NextResponse.json({ error: 'Невідома інтеграція' }, { status: 400 })

export const PUT = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async (actor) => {
    const { key } = await params
    // S9: неизвестный ключ отсекаем ДО чтения тела.
    if (!KNOWN_INTEGRATION_KEYS.has(key)) return unknownKey()
    const body = await readJson<{ value?: string }>(request)
    if (!body.ok) return body.response
    const result = await getIntegrationUseCases().setIntegration(key, body.body, actor)
    return result.ok ? NextResponse.json({ ok: true }) : errorResponse(result)
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async (actor) => {
    const { key } = await params
    const result = await getIntegrationUseCases().deleteIntegration(key, actor)
    return result.ok ? NextResponse.json({ ok: true }) : errorResponse(result)
  })
