// core/domain/access/hierarchy — ієрархія ролей і захист від блокування (раздел 5).
// Чисті правила, винесені з роутів /api/admin/roles/* та /api/admin/users/[id].
// Менший ранг = вище. Роль керує лише ролями СТРОГО нижче за себе.
import { effectiveRank, type Permission } from './permissions'

/** Актор може керувати ціллю, лише якщо ціль СТРОГО нижче (більший ранг). */
export function canActOnRank(actorRank: number, targetRank: number): boolean {
  return actorRank < targetRank
}

export type RoleForOrder = { id: string; name: string; hierarchy_order: number | null }

export type ReorderPlan =
  | { ok: true; lockedIds: string[] }
  | { ok: false; status: 400 | 403; error: string }

/**
 * Перевіряє перестановку ролей (зверху вниз):
 *  - orderedIds — повна перестановка існуючих id, без пропусків і дублів (400);
 *  - ролі на рівні/вище за актора (locked) лишаються префіксом у тому ж порядку (403).
 */
export function validateRoleReorder(
  orderedIds: string[],
  roles: RoleForOrder[],
  actorRank: number,
): ReorderPlan {
  const allIds = new Set(roles.map((r) => r.id))
  if (
    orderedIds.length !== roles.length ||
    !orderedIds.every((id) => allIds.has(id)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return { ok: false, status: 400, error: 'Список ролей неповний або з дублями' }
  }

  const rankById = new Map(roles.map((r) => [r.id, effectiveRank(r)]))
  const currentOrdered = [...roles].sort(
    (a, b) => effectiveRank(a) - effectiveRank(b) || a.name.localeCompare(b.name),
  )
  const lockedIds = currentOrdered
    .filter((r) => (rankById.get(r.id) ?? Infinity) <= actorRank)
    .map((r) => r.id)

  const prefix = orderedIds.slice(0, lockedIds.length)
  const samePrefix =
    prefix.length === lockedIds.length && prefix.every((id, i) => id === lockedIds[i])
  if (!samePrefix) {
    return { ok: false, status: 403, error: 'Не можна переміщувати ролі на рівні або вище за вашу' }
  }
  return { ok: true, lockedIds }
}

/** Активне призначення ролі: хто яку роль має + права цієї ролі. */
export type ActiveAssignment = { user_id: string; role_id: string | null; permissions: Permission[] }

/**
 * Lockout-guard для зміни прав ролі: true, якщо після зняття `manage_users` з ролі
 * `roleId` не лишиться жодного активного користувача з цим правом.
 */
export function roleChangeCausesLockout(
  assignments: ActiveAssignment[],
  roleId: string,
  newPermissions: Permission[],
): boolean {
  if (newPermissions.includes('manage_users')) return false
  const stillHave = assignments.filter(
    (a) => a.role_id !== roleId && a.permissions.includes('manage_users'),
  )
  const thisRoleHasHolders = assignments.some(
    (a) => a.role_id === roleId && a.permissions.includes('manage_users'),
  )
  return thisRoleHasHolders && stillHave.length === 0
}

/**
 * Lockout-guard для зміни користувача: true, якщо після зміни (нова роль / деактивація)
 * у системі не лишиться жодного активного користувача з `manage_users`.
 * `targetWillHave` — чи матиме цільовий користувач право ПІСЛЯ зміни.
 */
export function userChangeCausesLockout(
  assignments: ActiveAssignment[],
  userId: string,
  targetWillHave: boolean,
): boolean {
  const holders = assignments.filter((a) => a.permissions.includes('manage_users'))
  const otherHolders = holders.filter((a) => a.user_id !== userId)
  return !targetWillHave && otherHolders.length === 0
}
