// PATCH  /api/admin/users/[id] — роль, імʼя, is_active (ієрархія + lockout-guard)
// DELETE /api/admin/users/[id] — видалити користувача (не себе)
import { NextRequest, NextResponse } from 'next/server'
import { getUserUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_users'], async (actor) => {
    const { id } = await params
    const body = await readJson<{ role_id?: string; display_name?: string; is_active?: boolean }>(request)
    if (!body.ok) return body.response
    const result = await getUserUseCases().updateUser(id, body.body, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(['manage_users'], async (actor) => {
    const { id } = await params
    const result = await getUserUseCases().deleteUser(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
