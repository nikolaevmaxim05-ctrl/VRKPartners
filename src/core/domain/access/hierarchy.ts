// core/domain/access/hierarchy — иерархия ролей и защита от блокировки (раздел 5).
// Чистые правила, вынесенные из роутов /api/admin/roles/* и /api/admin/users/[id].
// Меньший ранг = выше. Роль управляет только ролями СТРОГО ниже себя.
import { effectiveRank, type Permission } from './permissions'

/** Актор может управлять целью, только если цель СТРОГО ниже (больший ранг). */
export function canActOnRank(actorRank: number, targetRank: number): boolean {
  return actorRank < targetRank
}

export type RoleForOrder = { id: string; name: string; hierarchy_order: number | null }

export type ReorderPlan =
  | { ok: true; lockedIds: string[] }
  | { ok: false; status: 400 | 403; error: string }

/**
 * Проверяет перестановку ролей (сверху вниз):
 *  - orderedIds — полная перестановка существующих id, без пропусков и дублей (400);
 *  - роли на уровне актора/выше (locked) остаются префиксом в том же порядке (403).
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

/** Активное назначение роли: кто какую роль имеет + права этой роли. */
export type ActiveAssignment = { user_id: string; role_id: string | null; permissions: Permission[] }

/**
 * Lockout-guard для изменения прав роли: true, если после снятия `manage_users` с роли
 * `roleId` не останется ни одного активного пользователя с этим правом.
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
 * Lockout-guard для изменения пользователя: true, если после изменения (новая роль / деактивация)
 * в системе не останется ни одного активного пользователя с `manage_users`.
 * `targetWillHave` — будет ли у целевого пользователя право ПОСЛЕ изменения.
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
