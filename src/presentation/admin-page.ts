// presentation/admin-page — авторизация страниц админки (RSC).
import { redirect } from 'next/navigation'
import { getAuthSession, getUserRepository } from '@composition/container'
import { roleGrants, type Permission, type UserRoleInfo } from '@core/domain/access/permissions'
import type { Actor } from '@core/application/ports/common'

export type AdminAccess = {
  actor: Actor | null
  roleInfo: UserRoleInfo | null
  /** У деактивированного пользователя — пусто. */
  permissions: Permission[]
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const user = await getAuthSession().getUser()
  if (!user) return { actor: null, roleInfo: null, permissions: [] }
  const roleInfo = await getUserRepository().getRoleInfo(user.id)
  return {
    actor: { id: user.id, email: user.email },
    roleInfo,
    permissions: roleInfo?.isActive ? roleInfo.permissions : [],
  }
}

/** Нет сессии → /admin/login; нет ни одного из прав → /admin. */
export async function requireSectionAccess(anyOf: Permission[]): Promise<AdminAccess & { actor: Actor }> {
  const access = await getAdminAccess()
  if (!access.actor) redirect('/admin/login')
  if (!roleGrants(access.roleInfo, anyOf)) redirect('/admin')
  return access as AdminAccess & { actor: Actor }
}
