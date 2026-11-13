// GET /api/admin/legal — оверрайды юридических документов + эффективный контент
// PUT /api/admin/legal — сохранить (только plain-текст, Zod-whitelist) + revalidate обеих страниц
import { NextRequest, NextResponse } from 'next/server'
import { getContentUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(['manage_content'], async () => NextResponse.json(await getContentUseCases().getLegal()))

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_content'], async (actor) => {
    const body = await readJson<{ overrides?: unknown; baseUpdatedAt?: string | null }>(request)
    if (!body.ok) return body.response
    return respond(await getContentUseCases().saveLegal(body.body, actor), ({ updatedAt }) => ({ ok: true, updatedAt }))
  })
