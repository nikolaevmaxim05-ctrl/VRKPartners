// PATCH  /api/admin/tracking-tags/[id] — редагування тегу (enabled / label / tag_id)
// DELETE /api/admin/tracking-tags/[id] — видалення тегу. Після змін — revalidate сайту.
import { NextRequest, NextResponse } from 'next/server'
import { getTrackingTagUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { INTEGRATION_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async () => {
    const { id } = await params
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getTrackingTagUseCases().updateTag(id, body.body))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async () => {
    const { id } = await params
    const result = await getTrackingTagUseCases().deleteTag(id)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
