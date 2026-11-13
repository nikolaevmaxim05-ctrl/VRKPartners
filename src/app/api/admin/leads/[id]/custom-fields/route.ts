// PATCH /api/admin/leads/[id]/custom-fields — upsert значения кастомного поля лида.
// Body: { field_id: string, value: string | null }
import { NextRequest } from 'next/server'
import { getLeadUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'

export const runtime = 'nodejs'

export const PATCH = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  withAdmin(['manage_leads'], async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson<{ field_id?: string; value?: string | null }>(request)
    if (!body.ok) return body.response
    return respond(await getLeadUseCases().setCustomFieldValue(id, body.body, actor))
  })
