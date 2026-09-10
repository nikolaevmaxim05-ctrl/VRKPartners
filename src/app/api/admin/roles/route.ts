// GET  /api/admin/roles — ролі з правами
// POST /api/admin/roles — створити роль (manage_roles або manage_users)
import { NextRequest } from 'next/server'
import { getRoleUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { ROLE_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getRoleUseCases().listRoles()))

export const POST = (request: NextRequest) =>
  withAdmin(ROLE_PERMISSIONS, async () => {
    const body = await readJson<{ name?: string; permissions?: unknown }>(request)
    if (!body.ok) return body.response
    return respond(await getRoleUseCases().createRole(body.body))
  })
