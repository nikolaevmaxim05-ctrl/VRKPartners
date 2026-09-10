// use-cases/admin/manage-users — користувачі адмінки: список, запрошення, зміна, видалення.
import { ok, fail, type Result } from '../../result'
import type { Actor } from '../../ports/common'
import type { RoleRepository, UserRepository, AdminUserView, AssigneeView } from '../../ports/access'
import { canActOnRank, userChangeCausesLockout } from '../../../domain/access/hierarchy'

type PatchBody = Partial<{ role_id: string; display_name: string; is_active: boolean }>

export type InviteResult = {
  ok: true
  user: {
    id: string
    email: string
    created_at: string
    last_sign_in_at: null
    email_confirmed: boolean
    display_name: null
    role_id: string | null
    is_active: true
  } | null
  warning?: string
}

export function makeUserUseCases(deps: { users: UserRepository; roles: RoleRepository; clock: { now(): Date } }) {
  const { users, roles, clock } = deps

  async function listUsers(): Promise<Result<AdminUserView[]>> {
    const res = await users.listAdminUsers()
    return res.ok ? ok(res.data) : fail('failed', res.error)
  }

  async function listAssignees(): Promise<Result<AssigneeView[]>> {
    const res = await users.listAssignees()
    return res.ok ? ok(res.data) : fail('failed', res.error)
  }

  /** redirectOrigin — origin сайту для посилання в листі (/admin/set-password). */
  async function inviteUser(body: { email?: string; role_id?: string }, actor: Actor, redirectOrigin: string): Promise<Result<InviteResult>> {
    const email = body.email?.trim()
    if (!email) return fail('invalid', 'Email обовʼязковий')

    // Ієрархія: запрошувати з роллю можна лише СТРОГО нижче за власну
    const roleId = body.role_id?.trim()
    if (roleId) {
      const [actorRank, ranks] = await Promise.all([users.getActorRank(actor.id), roles.getRanks()])
      if (!canActOnRank(actorRank, ranks.get(roleId) ?? Number.POSITIVE_INFINITY)) {
        return fail('forbidden', 'Не можна запрошувати користувача з роллю на рівні або вище за вашу')
      }
    }

    const inv = await users.invite(email, `${redirectOrigin}/admin/set-password`)
    if (!inv.ok) return fail('failed', inv.error)

    let roleAssigned = false
    if (roleId && inv.data?.id) {
      const r = await users.assignRoleOnInvite(inv.data.id, roleId)
      if (!r.ok) console.error('[admin/users] assign_role_on_invite_failed', r.error)
      else roleAssigned = true
    }

    const invited = inv.data
      ? {
          id: inv.data.id,
          email: inv.data.email ?? email,
          created_at: inv.data.created_at ?? clock.now().toISOString(),
          last_sign_in_at: null,
          email_confirmed: Boolean(inv.data.email_confirmed_at),
          display_name: null,
          role_id: roleAssigned ? roleId! : null,
          is_active: true as const,
        }
      : null

    return ok({
      ok: true,
      user: invited,
      ...(roleId && !roleAssigned ? { warning: 'Запрошення відправлено, але роль не призначилась' } : {}),
    })
  }

  async function updateUser(id: string, body: PatchBody, actor: Actor): Promise<Result<void>> {
    // Ієрархія: чужим користувачем керувати можна, лише якщо його роль СТРОГО нижче;
    // призначати — лише роль строго нижче за власну.
    if (id !== actor.id) {
      const [actorRank, ranks] = await Promise.all([users.getActorRank(actor.id), roles.getRanks()])
      const targetRoleId = await users.getRoleId(id)
      const targetRank = targetRoleId ? ranks.get(targetRoleId) ?? Infinity : Infinity
      if (Number.isFinite(targetRank) && !canActOnRank(actorRank, targetRank)) {
        return fail('forbidden', 'Не можна редагувати користувача з роллю на рівні або вище за вашу')
      }
      if (body.role_id && !canActOnRank(actorRank, ranks.get(body.role_id) ?? Infinity)) {
        return fail('forbidden', 'Не можна призначати роль на рівні або вище за вашу')
      }
    }

    if (id === actor.id && body.is_active === false) return fail('invalid', 'Не можна деактивувати самого себе')

    if (id === actor.id && body.role_id !== undefined) {
      const own = await users.getRoleId(id)
      if ((own ?? null) !== (body.role_id || null)) return fail('forbidden', 'Не можна змінювати власну роль')
    }

    if (body.role_id === undefined && body.display_name === undefined && body.is_active === undefined) {
      return fail('invalid', 'Нічого оновлювати')
    }

    // Lockout-guard: не залишити систему без активного користувача з manage_users
    if (body.role_id !== undefined || body.is_active === false) {
      const assignments = await users.getActiveAssignments()
      let targetWillHave = assignments.some((a) => a.user_id === id && a.permissions.includes('manage_users'))
      if (body.role_id !== undefined) targetWillHave = (await roles.getPermissions(body.role_id)).includes('manage_users')
      if (body.is_active === false) targetWillHave = false
      if (userChangeCausesLockout(assignments, id, targetWillHave)) {
        return fail(
          'invalid',
          id === actor.id
            ? 'Не можна знизити роль/деактивувати себе: ви єдиний з правом «Управління користувачами»'
            : 'Це останній користувач з правом «Управління користувачами» — дію заблоковано',
        )
      }
    }

    const fields: Record<string, unknown> = {}
    if (body.role_id !== undefined) fields.role_id = body.role_id
    if (body.display_name !== undefined) fields.name = body.display_name.trim().slice(0, 64)
    if (body.is_active !== undefined) fields.is_active = !!body.is_active

    if (await users.hasRoleRow(id)) {
      const res = await users.updateRoleRow(id, fields)
      if (!res.ok) {
        console.error('[admin/users/[id]] update_role_failed', res.error)
        return fail('failed', res.error)
      }
    } else {
      // INSERT можливий лише з роллю (role_id NOT NULL)
      if (body.role_id === undefined) return fail('invalid', 'Спочатку призначте роль користувачу')
      const res = await users.insertRoleRow(id, fields)
      if (!res.ok) {
        console.error('[admin/users/[id]] insert_role_failed', res.error)
        return fail('failed', res.error)
      }
    }
    return ok(undefined)
  }

  async function deleteUser(id: string, actor: Actor): Promise<Result<void>> {
    if (id === actor.id) return fail('invalid', 'Не можна видалити самого себе')
    const [actorRank, ranks] = await Promise.all([users.getActorRank(actor.id), roles.getRanks()])
    const targetRoleId = await users.getRoleId(id)
    const targetRank = targetRoleId ? ranks.get(targetRoleId) ?? Infinity : Infinity
    if (Number.isFinite(targetRank) && !canActOnRank(actorRank, targetRank)) {
      return fail('forbidden', 'Не можна видаляти користувача з роллю на рівні або вище за вашу')
    }
    const res = await users.deleteAuthUser(id)
    return res.ok ? ok(undefined) : fail('failed', res.error)
  }

  return { listUsers, listAssignees, inviteUser, updateUser, deleteUser }
}
