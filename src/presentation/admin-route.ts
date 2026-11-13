// presentation/admin-route — авторизация API админки (раздел 5 стандарта).
// middleware.ts отвечает за СЕССИЮ (401 без неё), роут через withAdmin — за ПРАВА.
// 401 без сессии, 403 без права; anyOf = [] — достаточно быть активным пользователем с ролью.
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getClientIp } from './client-ip'
import { getAuthSession, getUserRepository } from '@composition/container'
import { roleGrants, type Permission } from '@core/domain/access/permissions'
import type { Actor } from '@core/application/ports/common'

export type AdminActor = Actor

export async function withAdmin(
  anyOf: Permission[],
  handler: (actor: AdminActor) => Promise<Response> | Response,
): Promise<Response> {
  const user = await getAuthSession().getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const info = await getUserRepository().getRoleInfo(user.id)
  // Деактивированный пользователь не имеет никаких прав — даже для GET-роутов (anyOf = []).
  const allowed = anyOf.length === 0 ? !!info?.isActive : roleGrants(info, anyOf)
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  // IP — для audit_log (цепочка раздела 8; 'unknown' журнал пишет как NULL).
  const ip = getClientIp(await headers())
  return handler({ id: user.id, email: user.email, ip })
}
