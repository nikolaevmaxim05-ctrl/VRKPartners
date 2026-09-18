// PATCH  /api/admin/custom-fields/[id] — редагувати поле (name, options, required, position)
// DELETE /api/admin/custom-fields/[id] — видалити (значення каскадно). field_key і type не змінюються.
import { NextRequest, NextResponse } from 'next/server'
import { getCustomFieldUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_settings'], async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getCustomFieldUseCases().updateField(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_settings'], async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const result = await getCustomFieldUseCases().deleteField(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
