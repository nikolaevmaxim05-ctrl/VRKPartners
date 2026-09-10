// presentation/admin-route — авторизація API адмінки (раздел 5 стандарту).
// middleware.ts відповідає за СЕСІЮ (401 без неї), роут через withAdmin — за ПРАВА.
// 401 без сесії, 403 без права; anyOf = [] — достатньо бути активним користувачем з роллю.
import { NextResponse } from 'next/server'
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
  // Деактивований користувач не має жодних прав — навіть для GET-роутів (anyOf = []).
  const allowed = anyOf.length === 0 ? !!info?.isActive : roleGrants(info, anyOf)
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  return handler({ id: user.id, email: user.email })
}
