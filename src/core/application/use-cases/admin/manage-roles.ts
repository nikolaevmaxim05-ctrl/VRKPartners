// use-cases/admin/manage-roles — роли и их иерархия (раздел 5).
import { ok, fail, type Result } from '../../result'
import { UNIQUE_VIOLATION, type Actor } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { RoleRepository, RoleRow, UserRepository } from '../../ports/access'
import { sanitizePermissions } from '../../../domain/access/permissions'
import { canActOnRank, roleChangeCausesLockout, validateRoleReorder } from '../../../domain/access/hierarchy'

export function makeRoleUseCases(deps: { roles: RoleRepository; users: UserRepository; audit?: AuditLog }) {
  const { roles, users } = deps
  const audit = deps.audit ?? noopAudit

  async function listRoles(): Promise<Result<RoleRow[]>> {
    const res = await roles.list()
    if (!res.ok) {
      console.error('[admin/roles] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function createRole(body: { name?: string; permissions?: unknown }, actor?: Actor): Promise<Result<RoleRow>> {
    const name = (body.name ?? '').trim().slice(0, 48)
    if (!name) return fail('invalid', 'Назва ролі обовʼязкова')
    const permissions = sanitizePermissions(body.permissions)
    // Новая роль — в самый низ иерархии.
    const nextOrder = (await roles.maxOrder()) + 1
    const res = await roles.insert({ name, permissions, is_system: false, hierarchy_order: nextOrder })
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Роль з такою назвою вже існує')
      console.error('[admin/roles] create_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'role.create', `admin_roles/${res.data.id}`, { new: { name, permissions } })
    return ok(res.data)
  }

  async function updateRole(
    id: string,
    body: { name?: string; permissions?: unknown },
    actor: Actor,
  ): Promise<Result<{ id: string; name: string; permissions: unknown; is_system: boolean }>> {
    const roleRes = await roles.get(id)
    if (!roleRes.ok) return fail('failed', roleRes.error)
    const role = roleRes.data
    if (!role) return fail('not_found', 'Роль не знайдено')

    // Иерархия: редактировать можно только роль СТРОГО ниже собственной
    const [actorRank, ranks] = await Promise.all([users.getActorRank(actor.id), roles.getRanks()])
    if (!canActOnRank(actorRank, ranks.get(id) ?? Number.POSITIVE_INFINITY)) {
      return fail('forbidden', 'Не можна редагувати роль, що стоїть на одному рівні або вище за вашу')
    }

    // Запрет менять права СОБСТВЕННОЙ роли
    if (body.permissions !== undefined) {
      const info = await users.getRoleInfo(actor.id)
      if (info?.roleId === id) return fail('forbidden', 'Не можна змінювати права власної ролі')
    }

    const update: Record<string, unknown> = {}
    if (body.permissions !== undefined) update.permissions = sanitizePermissions(body.permissions)
    // Название системных ролей не меняем — на них завязана логика/метки.
    if (body.name !== undefined && !role.is_system) {
      const name = body.name.trim().slice(0, 48)
      if (!name) return fail('invalid', 'Назва ролі обовʼязкова')
      update.name = name
    }
    if (Object.keys(update).length === 0) return fail('invalid', 'Нічого оновлювати')

    // Lockout-guard
    if (Array.isArray(update.permissions) && !update.permissions.includes('manage_users')) {
      const assignments = await users.getActiveAssignments()
      if (roleChangeCausesLockout(assignments, id, update.permissions)) {
        return fail(
          'invalid',
          'Не можна прибрати «Управління користувачами» з останньої ролі, що його надає активним користувачам',
        )
      }
    }

    const res = await roles.update(id, update)
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Роль з такою назвою вже існує')
      return fail('failed', res.error)
    }
    await audit.record(actor, 'role.update', `admin_roles/${id}`, { old: { name: role.name }, new: update })
    return ok(res.data)
  }

  async function deleteRole(id: string, actor: Actor): Promise<Result<void>> {
    const roleRes = await roles.get(id)
    const role = roleRes.ok ? roleRes.data : null
    if (!role) return fail('not_found', 'Роль не знайдено')
    if (role.is_system) return fail('invalid', 'Системну роль не можна видалити')

    const [actorRank, ranks] = await Promise.all([users.getActorRank(actor.id), roles.getRanks()])
    if (!canActOnRank(actorRank, ranks.get(id) ?? Number.POSITIVE_INFINITY)) {
      return fail('forbidden', 'Не можна видаляти роль, що стоїть на одному рівні або вище за вашу')
    }
    if ((await roles.countUsers(id)) > 0) return fail('invalid', 'Роль призначена користувачам — спершу змініть їм роль')

    const res = await roles.delete(id)
    if (!res.ok) return fail('failed', res.error)
    await audit.record(actor, 'role.delete', `admin_roles/${id}`, { old: { name: role.name } })
    return ok(undefined)
  }

  async function reorderRoles(body: { orderedIds?: unknown }, actor: Actor): Promise<Result<void>> {
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds.filter((x): x is string => typeof x === 'string')
      : null
    if (!orderedIds || orderedIds.length === 0) return fail('invalid', 'Порожній список')

    const list = await roles.listForOrder()
    if (!list.ok) return fail('failed', list.error)
    const actorRank = await users.getActorRank(actor.id)

    const plan = validateRoleReorder(orderedIds, list.data, actorRank)
    if (!plan.ok) return fail(plan.status === 403 ? 'forbidden' : 'invalid', plan.error)

    const res = await roles.setOrder(orderedIds)
    if (!res.ok) return fail('failed', res.error)
    await audit.record(actor, 'role.reorder', 'admin_roles', { new: orderedIds })
    return ok(undefined)
  }

  return { listRoles, createRole, updateRole, deleteRole, reorderRoles }
}
