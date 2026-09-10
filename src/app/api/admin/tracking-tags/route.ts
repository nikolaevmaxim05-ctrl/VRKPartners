// GET  /api/admin/tracking-tags — Google-теги (по position)
// POST /api/admin/tracking-tags — створити тег (+ revalidate сайту)
import { NextRequest } from 'next/server'
import { getTrackingTagUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { INTEGRATION_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getTrackingTagUseCases().listTags()))

export const POST = (request: NextRequest) =>
  withAdmin(INTEGRATION_PERMISSIONS, async () => {
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getTrackingTagUseCases().createTag(body.body))
  })
