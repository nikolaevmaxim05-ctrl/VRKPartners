// PATCH  /api/admin/lead-statuses/[id] — редагування стадії (правила — core/domain/funnel/stage-rules)
// DELETE /api/admin/lead-statuses/[id] — видалення (не початкову і не з живими лідами)
import { NextRequest, NextResponse } from 'next/server'
import { getStageUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_settings'], async (actor) => {
    const { id } = await params
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getStageUseCases().updateStage(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_settings'], async (actor) => {
    const { id } = await params
    const result = await getStageUseCases().deleteStage(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
