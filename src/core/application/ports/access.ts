// core/application/ports/access — сессия, роли, пользователи.
import type { DbResult } from './common'
import type { Permission, UserRoleInfo } from '../../domain/access/permissions'
import type { ActiveAssignment, RoleForOrder } from '../../domain/access/hierarchy'

/** Текущая сессия админки (cookie Supabase Auth). */
export interface AuthSession {
  getUser(): Promise<{ id: string; email: string | null } | null>
}

export type RoleRow = {
  id: string
  name: string
  permissions: unknown
  is_system: boolean
  hierarchy_order: number | null
}

export interface RoleRepository {
  list(): Promise<DbResult<RoleRow[]>>
  get(id: string): Promise<DbResult<{ id: string; name: string; is_system: boolean } | null>>
  maxOrder(): Promise<number>
  insert(values: { name: string; permissions: Permission[]; is_system: boolean; hierarchy_order: number }): Promise<DbResult<RoleRow>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<{ id: string; name: string; permissions: unknown; is_system: boolean }>>
  delete(id: string): Promise<DbResult<void>>
  countUsers(roleId: string): Promise<number>
  /** roleId → эффективный ранг. */
  getRanks(): Promise<Map<string, number>>
  getPermissions(roleId: string): Promise<Permission[]>
  listForOrder(): Promise<DbResult<RoleForOrder[]>>
  /** Проставляет hierarchy_order = индекс в списке. Первая ошибка — в результате. */
  setOrder(orderedIds: string[]): Promise<DbResult<void>>
}

export type AdminUserView = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  display_name: string | null
  role_id: string | null
  role_name: string | null
  is_active: boolean
}

export type AssigneeView = { id: string; email: string; name: string | null; role: string | null }

export type InvitedUser = {
  id: string
  email: string | null
  created_at: string | null
  email_confirmed_at: string | null
}

export interface UserRepository {
  getRoleInfo(userId: string): Promise<UserRoleInfo | null>
  /** Ранг роли пользователя (Infinity — нет роли). */
  getActorRank(userId: string): Promise<number>
  getActiveAssignments(): Promise<ActiveAssignment[]>
  listAdminUsers(): Promise<DbResult<AdminUserView[]>>
  listAssignees(): Promise<DbResult<AssigneeView[]>>
  getRoleId(userId: string): Promise<string | null>
  hasRoleRow(userId: string): Promise<boolean>
  updateRoleRow(userId: string, fields: Record<string, unknown>): Promise<DbResult<void>>
  insertRoleRow(userId: string, fields: Record<string, unknown>): Promise<DbResult<void>>
  /** Upsert user_roles {role_id, is_active:true} сразу после приглашения. */
  assignRoleOnInvite(userId: string, roleId: string): Promise<DbResult<void>>
  invite(email: string, redirectTo: string): Promise<DbResult<InvitedUser | null>>
  deleteAuthUser(id: string): Promise<DbResult<void>>
  /** Человекочитаемая подпись пользователя: имя из user_roles → email → id. */
  getDisplayLabel(userId: string): Promise<string>
  getEmailAndName(userId: string): Promise<{ email: string | null; name: string | null }>
  /** Email/имена для нескольких id (ошибки только логируются). */
  getEmailsAndNames(ids: string[]): Promise<{ emailById: Map<string, string>; nameById: Map<string, string> }>
  /** id → имя/email (через listUsers, как в отчётах). */
  getAssigneeLabelMap(ids: string[]): Promise<Record<string, string>>
}
