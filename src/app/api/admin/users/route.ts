// GET  /api/admin/users — пользователи админки (auth.users + user_roles)
// POST /api/admin/users — пригласить пользователя по email (manage_users)
import { NextRequest, NextResponse } from 'next/server'
import { getPublicSiteUrl, getUserUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { errorResponse, readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getUserUseCases().listUsers()))

export const POST = (request: NextRequest) =>
  withAdmin(['manage_users'], async (actor) => {
    const body = await readJson<{ email?: string; role_id?: string }>(request)
    if (!body.ok) return body.response
    // Ссылка из письма ведёт на /admin/set-password этого же сайта. Заголовок Origin запроса НЕ
    // используем: им управляет клиент, и он мог бы увести токены инвайта на чужой домен.
    const origin = getPublicSiteUrl() ?? new URL(request.url).origin
    const result = await getUserUseCases().inviteUser(body.body, actor, origin)
    return result.ok ? NextResponse.json(result.value) : errorResponse(result)
  })
