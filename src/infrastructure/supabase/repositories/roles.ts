// infrastructure/supabase/repositories/roles — admin_roles.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { RoleRepository, RoleRow } from '@core/application/ports/access'
import { effectiveRank, filterKnownPermissions } from '@core/domain/access/permissions'
import type { RoleForOrder } from '@core/domain/access/hierarchy'

const ROLE_SELECT = 'id, name, permissions, is_system, hierarchy_order'

export function makeRoleRepository(db: () => Db): RoleRepository {
  return {
    async list() {
      const { data, error } = await db()
        .from('admin_roles')
        .select(ROLE_SELECT)
        .order('hierarchy_order', { ascending: true })
        .order('name')
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as RoleRow[])
    },

    async get(id) {
      const { data, error } = await db().from('admin_roles').select('id, name, is_system').eq('id', id).maybeSingle()
      if (error) return dbFail(error.message)
      return dbOk((data as { id: string; name: string; is_system: boolean } | null) ?? null)
    },

    async maxOrder() {
      const { data } = await db()
        .from('admin_roles')
        .select('hierarchy_order')
        .order('hierarchy_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      return Number((data as { hierarchy_order?: number } | null)?.hierarchy_order ?? 0)
    },

    async insert(values) {
      const { data, error } = await db().from('admin_roles').insert(values).select(ROLE_SELECT).single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as RoleRow)
    },

    async update(id, patch) {
      const { data, error } = await db()
        .from('admin_roles')
        .update(patch)
        .eq('id', id)
        .select('id, name, permissions, is_system')
        .single()
      if (error) return dbFail(error.message, error.code)
      return dbOk(data as { id: string; name: string; permissions: unknown; is_system: boolean })
    },

    async delete(id) {
      const { error } = await db().from('admin_roles').delete().eq('id', id)
      return error ? dbFail(error.message) : dbOk(undefined)
    },

    async countUsers(roleId) {
      const { count } = await db()
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role_id', roleId)
      return count ?? 0
    },

    async getRanks() {
      const { data } = await db().from('admin_roles').select('id, name, hierarchy_order')
      const map = new Map<string, number>()
      for (const r of (data ?? []) as { id: string; name: string; hierarchy_order: number | null }[]) {
        map.set(r.id, effectiveRank(r))
      }
      return map
    },

    async getPermissions(roleId) {
      const { data } = await db().from('admin_roles').select('permissions').eq('id', roleId).maybeSingle()
      return filterKnownPermissions((data as { permissions?: unknown } | null)?.permissions)
    },

    async listForOrder() {
      const { data, error } = await db().from('admin_roles').select('id, name, hierarchy_order')
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as RoleForOrder[])
    },

    async setOrder(orderedIds) {
      const results = await Promise.all(
        orderedIds.map((id, i) => db().from('admin_roles').update({ hierarchy_order: i }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      return failed?.error ? dbFail(failed.error.message) : dbOk(undefined)
    },
  }
}
