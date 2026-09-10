// GET /api/admin/legal — оверрайди юридичних документів + ефективний контент
// PUT /api/admin/legal — зберегти (лише plain-текст, Zod-whitelist) + revalidate обох сторінок
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
