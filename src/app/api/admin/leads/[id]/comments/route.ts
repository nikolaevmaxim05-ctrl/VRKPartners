// GET  /api/admin/leads/[id]/comments?type=comment|note|system — лента комментариев
// POST /api/admin/leads/[id]/comments — добавить comment или note (system пишет только сервер)
import { NextRequest } from 'next/server'
import { getLeadUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'
import { LEAD_VIEW_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const GET = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_VIEW_PERMISSIONS, async () => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const type = new URL(request.url).searchParams.get('type')
    return respond(await getLeadUseCases().listComments(id, type))
  })

export const POST = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_leads'], async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson<{ type?: string; content?: string }>(request)
    if (!body.ok) return body.response
    return respond(await getLeadUseCases().addComment(id, body.body, actor))
  })
