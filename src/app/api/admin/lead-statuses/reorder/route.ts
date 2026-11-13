// PUT /api/admin/lead-statuses/reorder — массовое обновление position. body: { items: [{ id, position }] }
import { NextRequest, NextResponse } from 'next/server'
import { getStageUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_settings'], async (actor) => {
    const body = await readJson<{ items?: unknown }>(request)
    if (!body.ok) return body.response
    const result = await getStageUseCases().reorderStages(body.body, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
