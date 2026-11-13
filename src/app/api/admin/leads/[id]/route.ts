// GET    /api/admin/leads/[id] — карточка лида (статус, ответственный, кастомные поля, история повторов)
// PATCH  /api/admin/leads/[id] — стадия / ответственный / суммы (+ system-комментарии, конверсии, корректировки)
// DELETE /api/admin/leads/[id] — удаление лида
import { NextRequest, NextResponse } from 'next/server'
import { getLeadUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'
import { LEAD_VIEW_PERMISSIONS, LEAD_EDIT_PERMISSIONS, LEAD_DELETE_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const GET = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_VIEW_PERMISSIONS, async () => {
    const { id } = await params
    // Не-UUID в пути — 404 до запроса в БД (исправление 12 тестирования админки 2026-09-18).
    if (!isUuid(id)) return notFound()
    // Сценарий уже отдаёт { data: … }; тождественное преобразование — чтобы не обернуть второй раз.
    return respond(await getLeadUseCases().getLeadDetail(id), (v) => v)
  })

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_EDIT_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson<unknown>(request)
    if (!body.ok) return body.response
    return respond(await getLeadUseCases().updateLead(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(LEAD_DELETE_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const result = await getLeadUseCases().deleteLead(id, actor)
    // Несуществующий лид — not_found → 404 через respond (исправление 7 тестирования админки 2026-09-18).
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
