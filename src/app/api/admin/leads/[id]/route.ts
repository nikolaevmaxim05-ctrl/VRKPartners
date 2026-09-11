// GET    /api/admin/leads/[id] — картка ліда (статус, відповідальний, кастомні поля, історія повторів)
// PATCH  /api/admin/leads/[id] — стадія / відповідальний / суми (+ system-коментарі, конверсії, корекції)
// DELETE /api/admin/leads/[id] — видалення ліда
import { NextRequest, NextResponse } from 'next/server'
import { getLeadUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { LEAD_VIEW_PERMISSIONS, LEAD_EDIT_PERMISSIONS, LEAD_DELETE_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const GET = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_VIEW_PERMISSIONS, async () => {
    const { id } = await params
    return respond(await getLeadUseCases().getLeadDetail(id), (v) => v)
  })

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_EDIT_PERMISSIONS, async (actor) => {
    const { id } = await params
    const body = await readJson<unknown>(request)
    if (!body.ok) return body.response
    return respond(await getLeadUseCases().updateLead(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_DELETE_PERMISSIONS, async (actor) => {
    const { id } = await params
    const result = await getLeadUseCases().deleteLead(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
