// PATCH /api/admin/roles/reorder — порядок иерархии ролей. Body: { orderedIds: string[] } (сверху вниз).
import { NextRequest, NextResponse } from 'next/server'
import { getRoleUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { ROLE_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const PATCH = (request: NextRequest) =>
  withAdmin(ROLE_PERMISSIONS, async (actor) => {
    const body = await readJson<{ orderedIds?: unknown }>(request)
    if (!body.ok) return body.response
    const result = await getRoleUseCases().reorderRoles(body.body, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
