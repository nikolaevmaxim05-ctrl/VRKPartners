// GET /api/admin/content — оверрайди контенту лендингу + ефективні значення
// PUT /api/admin/content — зберегти (лише дифф від дефолтів) + revalidate сайту
import { NextRequest, NextResponse } from 'next/server'
import { getContentUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(['manage_content'], async () => NextResponse.json(await getContentUseCases().getLanding()))

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_content'], async (actor) => {
    const body = await readJson<{ overrides?: unknown; baseUpdatedAt?: string | null }>(request)
    if (!body.ok) return body.response
    return respond(await getContentUseCases().saveLanding(body.body, actor), ({ updatedAt }) => ({ ok: true, updatedAt }))
  })
