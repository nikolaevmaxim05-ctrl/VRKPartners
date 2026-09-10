// infrastructure/supabase/repositories/users — user_roles + Supabase Auth admin.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { UserRepository, AdminUserView, AssigneeView } from '@core/application/ports/access'
import { effectiveRank, filterKnownPermissions, type UserRoleInfo } from '@core/domain/access/permissions'
import type { ActiveAssignment } from '@core/domain/access/hierarchy'

type RoleJoin = { id: string; name: string }
type UserRoleRow = {
  user_id: string
  name: string | null
  is_active: boolean
  role_id: string | null
  role: RoleJoin | RoleJoin[] | null
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export function makeUserRepository(db: () => Db): UserRepository {
  return {
    async getRoleInfo(userId): Promise<UserRoleInfo | null> {
      const { data, error } = await db()
        .from('user_roles')
        .select('name, is_active, role_id, role:admin_roles(id, name, permissions, is_system, hierarchy_order)')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        console.error('[permissions] getUserRoleInfo_failed', error.message)
        return null
      }
      if (!data) return null
      const role = one(data.role as unknown) as
        | { id: string; name: string; permissions: unknown; is_system: boolean; hierarchy_order: number | null }
        | null
      if (!role) return null
      return {
        roleId: data.role_id as string,
        roleName: role.name,
        roleIsSystem: role.is_system,
        permissions: filterKnownPermissions(role.permissions),
        isActive: (data.is_active as boolean | null) ?? true,
        displayName: (data.name as string | null) ?? null,
        roleRank: effectiveRank(role),
      }
    },

    async getActorRank(userId) {
      const { data } = await db()
        .from('user_roles')
        .select('role:admin_roles(name, hierarchy_order)')
        .eq('user_id', userId)
        .maybeSingle()
      const role = one((data as { role: unknown } | null)?.role) as { name: string; hierarchy_order: number | null } | null
      if (!role) return Number.POSITIVE_INFINITY
      return effectiveRank(role)
    },

    async getActiveAssignments(): Promise<ActiveAssignment[]> {
      const { data } = await db().from('user_roles').select('user_id, role_id, is_active, role:admin_roles(permissions)')
      return (data ?? [])
        .filter((r) => (r as { is_active?: boolean }).is_active !== false)
        .map((r) => {
          const role = one((r as { role: unknown }).role) as { permissions?: unknown } | null
          return {
            user_id: (r as { user_id: string }).user_id,
            role_id: (r as { role_id: string | null }).role_id ?? null,
            permissions: filterKnownPermissions(role?.permissions),
          }
        })
    },

    async listAdminUsers() {
      const [authResult, rolesResult] = await Promise.all([
        db().auth.admin.listUsers({ perPage: 200 }),
        db().from('user_roles').select('user_id, name, is_active, role_id, role:admin_roles(id, name)'),
      ])
      if (authResult.error) return dbFail(authResult.error.message)
      if (rolesResult.error) console.error('[admin/users] user_roles_failed', rolesResult.error.message)

      const rolesByUserId = new Map<string, UserRoleRow>()
      for (const r of (rolesResult.data ?? []) as UserRoleRow[]) rolesByUserId.set(r.user_id, r)

      const users: AdminUserView[] = (authResult.data?.users ?? []).map((u) => {
        const roleRow = rolesByUserId.get(u.id)
        const role = one(roleRow?.role)
        return {
          id: u.id,
          email: u.email ?? '',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed: !!u.email_confirmed_at,
          display_name: roleRow?.name ?? null,
          role_id: roleRow?.role_id ?? null,
          role_name: role?.name ?? null,
          is_active: roleRow?.is_active ?? true,
        }
      })
      return dbOk(users)
    },

    async listAssignees() {
      const [authResult, rolesResult] = await Promise.all([
        db().auth.admin.listUsers({ perPage: 200 }),
        db().from('user_roles').select('user_id, name, is_active, role:admin_roles(name)').eq('is_active', true),
      ])
      if (authResult.error) return dbFail(authResult.error.message)
      if (rolesResult.error) console.error('[admin/assignees] user_roles_failed', rolesResult.error.message)

      type Row = { user_id: string; name: string | null; is_active: boolean; role: { name: string } | { name: string }[] | null }
      const rolesById = new Map<string, Row>()
      for (const r of (rolesResult.data ?? []) as Row[]) rolesById.set(r.user_id, r)

      const users: AssigneeView[] = (authResult.data?.users ?? []).map((u) => {
        const role = rolesById.get(u.id)
        return {
          id: u.id,
          email: u.email ?? '',
          // Порожнє імʼя не вважаємо іменем — щоб у селектах падало на email
          name: role?.name?.trim() ? role.name : null,
          role: one(role?.role)?.name ?? null,
        }
      })
      return dbOk(users)
    },

    async getRoleId(userId) {
      const { data } = await db().from('user_roles').select('role_id').eq('user_id', userId).maybeSingle()
      return (data?.role_id as string | null | undefined) ?? null
    },

    async hasRoleRow(userId) {
      const { data } = await db().from('user_roles').select('user_id').eq('user_id', userId).maybeSingle()
      return !!data
    },

    async updateRoleRow(userId, fields) {
      const { error } = await db().from('user_roles').update(fields).eq('user_id', userId)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async insertRoleRow(userId, fields) {
      const { error } = await db().from('user_roles').insert({ user_id: userId, ...fields })
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async assignRoleOnInvite(userId, roleId) {
      const { error } = await db()
        .from('user_roles')
        .upsert({ user_id: userId, role_id: roleId, is_active: true }, { onConflict: 'user_id' })
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async invite(email, redirectTo) {
      const { data, error } = await db().auth.admin.inviteUserByEmail(email, { redirectTo })
      if (error) return dbFail(error.message)
      const u = data?.user
      return dbOk(
        u
          ? {
              id: u.id,
              email: u.email ?? null,
              created_at: u.created_at ?? null,
              email_confirmed_at: u.email_confirmed_at ?? null,
            }
          : null,
      )
    },

    async deleteAuthUser(id) {
      const { error } = await db().auth.admin.deleteUser(id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async getDisplayLabel(userId) {
      const [{ data: au }, { data: roleRow }] = await Promise.all([
        db().auth.admin.getUserById(userId),
        db().from('user_roles').select('name').eq('user_id', userId).maybeSingle(),
      ])
      return (roleRow?.name as string | null | undefined) ?? au?.user?.email ?? userId
    },

    async getEmailAndName(userId) {
      const [{ data: authData }, { data: roleData }] = await Promise.all([
        db().auth.admin.getUserById(userId),
        db().from('user_roles').select('name').eq('user_id', userId).maybeSingle(),
      ])
      return {
        email: authData?.user?.email ?? null,
        name: (roleData?.name as string | null | undefined) ?? null,
      }
    },

    async getEmailsAndNames(ids) {
      let emailById = new Map<string, string>()
      let nameById = new Map<string, string>()
      if (ids.length === 0) return { emailById, nameById }
      try {
        // C13: резолвимо лише потрібні id (getUserById), а не listUsers({perPage:200}).
        const [userResults, { data: rolesData }] = await Promise.all([
          Promise.all(ids.map((uid) => db().auth.admin.getUserById(uid))),
          db().from('user_roles').select('user_id, name').in('user_id', ids),
        ])
        emailById = new Map(
          userResults
            .map((r) => r.data?.user)
            .filter((u): u is NonNullable<typeof u> => !!u)
            .map((u) => [u.id, u.email ?? '']),
        )
        nameById = new Map(
          ((rolesData ?? []) as Array<{ user_id: string; name: string | null }>)
            .filter((r): r is { user_id: string; name: string } => !!r.name)
            .map((r) => [r.user_id, r.name]),
        )
      } catch (e) {
        console.error('[admin/leads] assignee_resolve_failed', e)
      }
      return { emailById, nameById }
    },

    async getAssigneeLabelMap(ids) {
      if (ids.length === 0) return {}
      try {
        const [{ data: usersData }, { data: rolesData }] = await Promise.all([
          db().auth.admin.listUsers({ perPage: 200 }),
          db().from('user_roles').select('user_id, name').in('user_id', ids),
        ])
        const emailById = new Map(
          (usersData?.users ?? []).filter((u) => ids.includes(u.id)).map((u) => [u.id, u.email ?? u.id]),
        )
        const nameById = new Map(
          ((rolesData ?? []) as Array<{ user_id: string; name: string | null }>)
            .filter((r): r is { user_id: string; name: string } => !!r.name)
            .map((r) => [r.user_id, r.name]),
        )
        const map: Record<string, string> = {}
        for (const id of ids) map[id] = nameById.get(id) ?? emailById.get(id) ?? id
        return map
      } catch (e) {
        console.error('[analytics-report-server] assignee_resolve_failed', e)
        return {}
      }
    },
  }
}
