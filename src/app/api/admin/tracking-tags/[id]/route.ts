// PATCH  /api/admin/tracking-tags/[id] — редактирование тега (enabled / label / tag_id)
// DELETE /api/admin/tracking-tags/[id] — удаление тега. После изменений — revalidate сайта.
import { NextRequest, NextResponse } from 'next/server'
import { getTrackingTagUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'
import { INTEGRATION_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getTrackingTagUseCases().updateTag(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(INTEGRATION_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const result = await getTrackingTagUseCases().deleteTag(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
