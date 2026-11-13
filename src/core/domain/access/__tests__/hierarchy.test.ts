import { describe, it, expect } from 'vitest'
import {
  canActOnRank,
  validateRoleReorder,
  roleChangeCausesLockout,
  userChangeCausesLockout,
  type ActiveAssignment,
} from '../hierarchy'
import { effectiveRank, roleGrants, sanitizePermissions, ADMIN_RANK } from '../permissions'

describe('permissions', () => {
  it('effectiveRank: admin всегда -1, иначе hierarchy_order или 1000', () => {
    expect(effectiveRank({ name: 'admin', hierarchy_order: 5 })).toBe(ADMIN_RANK)
    expect(effectiveRank({ name: 'manager', hierarchy_order: 2 })).toBe(2)
    expect(effectiveRank({ name: 'x', hierarchy_order: null })).toBe(1000)
    expect(effectiveRank({ name: 'x' })).toBe(1000)
  })

  it('roleGrants: деактивированный — никаких прав; иначе любое из перечня', () => {
    const info = { roleId: 'r', roleName: 'manager', roleIsSystem: false, permissions: ['manage_leads' as const], isActive: true, displayName: null, roleRank: 2 }
    expect(roleGrants(info, ['manage_leads'])).toBe(true)
    expect(roleGrants(info, ['manage_users', 'manage_leads'])).toBe(true)
    expect(roleGrants(info, ['manage_users'])).toBe(false)
    expect(roleGrants({ ...info, isActive: false }, ['manage_leads'])).toBe(false)
    expect(roleGrants(null, ['manage_leads'])).toBe(false)
  })

  it('sanitizePermissions: неизвестные ключи и дубли отбрасываются', () => {
    expect(sanitizePermissions(['manage_leads', 'bogus', 'manage_leads', 42])).toEqual(['manage_leads'])
    expect(sanitizePermissions('nope')).toEqual([])
  })
})

describe('canActOnRank', () => {
  it('управлять можно только строго более низкой ролью', () => {
    expect(canActOnRank(-1, 0)).toBe(true)
    expect(canActOnRank(0, 0)).toBe(false)
    expect(canActOnRank(2, 1)).toBe(false)
    expect(canActOnRank(0, Infinity)).toBe(true)
  })
})

describe('validateRoleReorder', () => {
  const roles = [
    { id: 'a', name: 'admin', hierarchy_order: 0 },
    { id: 'm', name: 'manager', hierarchy_order: 2 },
    { id: 'c', name: 'content', hierarchy_order: 3 },
  ]

  it('400 при неполном списке или дублях', () => {
    expect(validateRoleReorder(['a', 'm'], roles, -1)).toMatchObject({ ok: false, status: 400 })
    expect(validateRoleReorder(['a', 'm', 'm'], roles, -1)).toMatchObject({ ok: false, status: 400 })
    expect(validateRoleReorder(['a', 'm', 'zzz'], roles, -1)).toMatchObject({ ok: false, status: 400 })
  })

  it('admin (ранг -1) может переставлять всё, кроме себя — он в locked-префиксе', () => {
    expect(validateRoleReorder(['a', 'c', 'm'], roles, -1)).toEqual({ ok: true, lockedIds: ['a'] })
    expect(validateRoleReorder(['m', 'a', 'c'], roles, -1)).toMatchObject({ ok: false, status: 403 })
  })

  it('менеджер (ранг 2) не двигает роли на своём уровне и выше', () => {
    expect(validateRoleReorder(['a', 'm', 'c'], roles, 2)).toEqual({ ok: true, lockedIds: ['a', 'm'] })
    expect(validateRoleReorder(['a', 'c', 'm'], roles, 2)).toMatchObject({ ok: false, status: 403 })
  })
})

describe('lockout guards', () => {
  const assignments: ActiveAssignment[] = [
    { user_id: 'u1', role_id: 'admin', permissions: ['manage_users', 'manage_leads'] },
    { user_id: 'u2', role_id: 'mgr', permissions: ['manage_leads'] },
  ]

  it('roleChangeCausesLockout: снять manage_users с последней роли-носителя нельзя', () => {
    expect(roleChangeCausesLockout(assignments, 'admin', ['manage_leads'])).toBe(true)
    expect(roleChangeCausesLockout(assignments, 'admin', ['manage_users'])).toBe(false)
    // роль без активных носителей — можно
    expect(roleChangeCausesLockout(assignments, 'mgr', ['manage_leads'])).toBe(false)
    // есть другой носитель
    const two = [...assignments, { user_id: 'u3', role_id: 'other', permissions: ['manage_users' as const] }]
    expect(roleChangeCausesLockout(two, 'admin', [])).toBe(false)
  })

  it('userChangeCausesLockout: последний активный с manage_users не может потерять право', () => {
    expect(userChangeCausesLockout(assignments, 'u1', false)).toBe(true)
    expect(userChangeCausesLockout(assignments, 'u1', true)).toBe(false)
    expect(userChangeCausesLockout(assignments, 'u2', false)).toBe(false)
  })
})
