// GET  /api/admin/users — користувачі адмінки (auth.users + user_roles)
// POST /api/admin/users — запросити користувача по email (manage_users)
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
    // Посилання із листа веде на /admin/set-password цього ж сайту. Заголовок Origin запиту НЕ
    // використовуємо: він керується клієнтом і міг би відвести токени інвайту на чужий домен.
    const origin = getPublicSiteUrl() ?? new URL(request.url).origin
    const result = await getUserUseCases().inviteUser(body.body, actor, origin)
    return result.ok ? NextResponse.json(result.value) : errorResponse(result)
  })
