// GET /api/admin/seo — оверрайды метаданных + эффективные значения (отклонение 2: SEO редактируется)
// PUT /api/admin/seo — сохранить (Zod, ogImage по allowlist) + revalidate сайта
import { NextRequest, NextResponse } from 'next/server'
import { getContentUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(['manage_content'], async () => {
    const { overrides, content, updatedAt } = await getContentUseCases().getSeo()
    return NextResponse.json({ overrides, content, updatedAt })
  })

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_content'], async (actor) => {
    const body = await readJson<{ overrides?: unknown; baseUpdatedAt?: string | null }>(request)
    if (!body.ok) return body.response
    return respond(await getContentUseCases().saveSeo(body.body, actor), ({ updatedAt }) => ({ ok: true, updatedAt }))
  })
