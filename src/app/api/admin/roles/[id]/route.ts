// PATCH  /api/admin/roles/[id] — оновити роль (назва/права). Системні: тільки права.
// DELETE /api/admin/roles/[id] — видалити роль (несистемну, без привʼязаних користувачів).
import { NextRequest, NextResponse } from 'next/server'
import { getRoleUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { ROLE_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(ROLE_PERMISSIONS, async (actor) => {
    const { id } = await params
    const body = await readJson<{ name?: string; permissions?: unknown }>(request)
    if (!body.ok) return body.response
    return respond(await getRoleUseCases().updateRole(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(ROLE_PERMISSIONS, async (actor) => {
    const { id } = await params
    const result = await getRoleUseCases().deleteRole(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
