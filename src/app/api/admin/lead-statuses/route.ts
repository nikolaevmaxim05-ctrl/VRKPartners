// GET  /api/admin/lead-statuses — стадии воронки (по position) + pipelines_enabled
// POST /api/admin/lead-statuses — создать стадию (manage_settings)
import { NextRequest } from 'next/server'
import { getStageUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getStageUseCases().listStages(), (v) => v))

export const POST = (request: NextRequest) =>
  withAdmin(['manage_settings'], async (actor) => {
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getStageUseCases().createStage(body.body, actor))
  })
