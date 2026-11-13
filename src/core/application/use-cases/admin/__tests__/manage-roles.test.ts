// makeRoleUseCases на фейковых портах — раздел 5: иерархия ролей, lockout-guard, порядок.
import { describe, it, expect, vi } from 'vitest'
import { makeRoleUseCases } from '../manage-roles'
import { dbOk, dbFail, UNIQUE_VIOLATION } from '../../../ports/common'

const admin = { id: 'u-admin', email: 'admin@vrk.test' }
const manager = { id: 'u-mgr', email: 'mgr@vrk.test' }

const RANKS = new Map<string, number>([
  ['r-admin', -1],
  ['r-mgr', 1],
  ['r-view', 2],
])

const ROLES_FOR_ORDER = [
  { id: 'r-admin', name: 'admin', hierarchy_order: 0 },
  { id: 'r-mgr', name: 'Менеджер', hierarchy_order: 1 },
  { id: 'r-view', name: 'Переглядач', hierarchy_order: 2 },
]

function setup(over: { roles?: Record<string, unknown>; users?: Record<string, unknown> } = {}) {
  const roles = {
    list: vi.fn(async () => dbOk([])),
    get: vi.fn(async (id: string) => dbOk({ id, name: 'Менеджер', is_system: false })),
    maxOrder: vi.fn(async () => 2),
    insert: vi.fn(async (values: Record<string, unknown>) => dbOk({ id: 'r-new', ...values })),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) =>
      dbOk({ id, name: (patch.name as string) ?? 'Менеджер', permissions: patch.permissions ?? [], is_system: false }),
    ),
    delete: vi.fn(async () => dbOk(undefined)),
    countUsers: vi.fn(async () => 0),
    getRanks: vi.fn(async () => RANKS),
    getPermissions: vi.fn(async () => []),
    listForOrder: vi.fn(async () => dbOk(ROLES_FOR_ORDER)),
    setOrder: vi.fn(async () => dbOk(undefined)),
    ...over.roles,
  }
  const users = {
    // По умолчанию актор — admin (ранг −1), его роль r-admin.
    getActorRank: vi.fn(async (userId: string) => (userId === admin.id ? -1 : 1)),
    getRoleInfo: vi.fn(async (userId: string) => ({ roleId: userId === admin.id ? 'r-admin' : 'r-mgr' })),
    getActiveAssignments: vi.fn(async () => [] as Array<{ user_id: string; role_id: string | null; permissions: string[] }>),
    ...over.users,
  }
  const audit = { record: vi.fn(async () => {}) }
  const deps = { roles, users, audit }
  return { uc: makeRoleUseCases(deps as never), roles, users, audit }
}

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('createRole', () => {
  it('назва обрізається до 48 символів, права санітизуються, позиція = maxOrder + 1; audit role.create', async () => {
    const { uc, roles, audit } = setup()
    const raw = '  ' + 'н'.repeat(60) + '  '
    const r = await uc.createRole({ name: raw, permissions: ['manage_leads', 'bogus', 'manage_leads', 42] }, admin)
    expect(r.ok).toBe(true)
    expect(roles.insert).toHaveBeenCalledWith({
      name: 'н'.repeat(48),
      permissions: ['manage_leads'],
      is_system: false,
      hierarchy_order: 3,
    })
    expect(audit.record).toHaveBeenCalledWith(admin, 'role.create', 'admin_roles/r-new', {
      new: { name: 'н'.repeat(48), permissions: ['manage_leads'] },
    })
  })

  it('порожня назва → invalid, у БД нічого не пишемо', async () => {
    const { uc, roles, audit } = setup()
    const r = await uc.createRole({ name: '   ' }, admin)
    expect(r).toMatchObject({ ok: false, code: 'invalid' })
    expect(roles.insert).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('права не масив → порожній список прав', async () => {
    const { uc, roles } = setup()
    await uc.createRole({ name: 'Тест', permissions: 'manage_leads' }, admin)
    expect(roles.insert).toHaveBeenCalledWith(expect.objectContaining({ permissions: [] }))
  })

  it('unique_violation → conflict; інша помилка БД → failed', async () => {
    quiet()
    const conflict = setup({ roles: { insert: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) } })
    expect(await conflict.uc.createRole({ name: 'Менеджер' }, admin)).toMatchObject({ ok: false, code: 'conflict' })
    expect(conflict.audit.record).not.toHaveBeenCalled()
    const failed = setup({ roles: { insert: vi.fn(async () => dbFail('boom')) } })
    expect(await failed.uc.createRole({ name: 'Менеджер' }, admin)).toMatchObject({ ok: false, code: 'failed', message: 'boom' })
  })
})

describe('updateRole', () => {
  it('роль не знайдено → not_found', async () => {
    const { uc } = setup({ roles: { get: vi.fn(async () => dbOk(null)) } })
    expect(await uc.updateRole('r-x', { name: 'X' }, admin)).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('роль на рівні або вище за власну → forbidden (менеджер редагує admin і сам себе)', async () => {
    const { uc, roles } = setup()
    expect(await uc.updateRole('r-admin', { name: 'X' }, manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await uc.updateRole('r-mgr', { name: 'X' }, manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(roles.update).not.toHaveBeenCalled()
  })

  it('зміна прав ВЛАСНОЇ ролі → forbidden (захист спрацьовує, коли ранг ролі невідомий і перевірка рангу пройдена)', async () => {
    // Наблюдение: при консистентных рангах own-role guard недостижим — проверка ранга
    // (actorRank < ownRank ложно) отсекает раньше. Ветка достижима только когда ranks не содержит id.
    const { uc, roles, users } = setup({ roles: { getRanks: vi.fn(async () => new Map()) } })
    const r = await uc.updateRole('r-admin', { permissions: ['manage_leads'] }, admin)
    expect(r).toMatchObject({ ok: false, code: 'forbidden', message: 'Не можна змінювати права власної ролі' })
    expect(users.getRoleInfo).toHaveBeenCalledWith(admin.id)
    expect(roles.update).not.toHaveBeenCalled()
  })

  it('системна роль: назва ігнорується, права оновлюються', async () => {
    const { uc, roles } = setup({ roles: { get: vi.fn(async () => dbOk({ id: 'r-mgr', name: 'manager', is_system: true })) } })
    const r = await uc.updateRole('r-mgr', { name: 'Нова назва', permissions: ['manage_leads', 'manage_users'] }, admin)
    expect(r.ok).toBe(true)
    expect(roles.update).toHaveBeenCalledWith('r-mgr', { permissions: ['manage_leads', 'manage_users'] })
  })

  it('системна роль: лише назва → «Нічого оновлювати»', async () => {
    const { uc, roles } = setup({ roles: { get: vi.fn(async () => dbOk({ id: 'r-mgr', name: 'manager', is_system: true })) } })
    expect(await uc.updateRole('r-mgr', { name: 'Нова' }, admin)).toMatchObject({ ok: false, code: 'invalid', message: 'Нічого оновлювати' })
    expect(roles.update).not.toHaveBeenCalled()
  })

  it('порожня назва звичайної ролі → invalid; назва обрізається до 48', async () => {
    const { uc, roles } = setup()
    expect(await uc.updateRole('r-mgr', { name: '  ' }, admin)).toMatchObject({ ok: false, code: 'invalid' })
    await uc.updateRole('r-mgr', { name: ' ' + 'x'.repeat(60) }, admin)
    expect(roles.update).toHaveBeenCalledWith('r-mgr', { name: 'x'.repeat(48) })
  })

  it('lockout-guard: зняти manage_users з останньої ролі, що його надає активним → invalid', async () => {
    const { uc, roles } = setup({
      users: {
        getActiveAssignments: vi.fn(async () => [
          { user_id: 'u-1', role_id: 'r-mgr', permissions: ['manage_users'] },
          { user_id: 'u-2', role_id: 'r-view', permissions: ['view_reports'] },
        ]),
      },
    })
    const r = await uc.updateRole('r-mgr', { permissions: ['manage_leads'] }, admin)
    expect(r).toMatchObject({ ok: false, code: 'invalid' })
    expect((r as { message: string }).message).toContain('Управління користувачами')
    expect(roles.update).not.toHaveBeenCalled()
  })

  it('lockout-guard не спрацьовує, якщо є інший активний власник manage_users', async () => {
    const { uc, roles } = setup({
      users: {
        getActiveAssignments: vi.fn(async () => [
          { user_id: 'u-1', role_id: 'r-mgr', permissions: ['manage_users'] },
          { user_id: 'u-admin', role_id: 'r-admin', permissions: ['manage_users'] },
        ]),
      },
    })
    expect((await uc.updateRole('r-mgr', { permissions: ['manage_leads'] }, admin)).ok).toBe(true)
    expect(roles.update).toHaveBeenCalledWith('r-mgr', { permissions: ['manage_leads'] })
  })

  it('права з manage_users → getActiveAssignments не викликається', async () => {
    const { uc, users } = setup()
    await uc.updateRole('r-mgr', { permissions: ['manage_users'] }, admin)
    expect(users.getActiveAssignments).not.toHaveBeenCalled()
  })

  it('успіх → audit role.update зі старою назвою і патчем', async () => {
    const { uc, audit } = setup()
    await uc.updateRole('r-mgr', { name: 'Старший', permissions: ['manage_leads'] }, admin)
    expect(audit.record).toHaveBeenCalledWith(admin, 'role.update', 'admin_roles/r-mgr', {
      old: { name: 'Менеджер' },
      new: { permissions: ['manage_leads'], name: 'Старший' },
    })
  })

  it('unique_violation при оновленні → conflict', async () => {
    const { uc, audit } = setup({ roles: { update: vi.fn(async () => dbFail('dup', UNIQUE_VIOLATION)) } })
    expect(await uc.updateRole('r-mgr', { name: 'admin' }, admin)).toMatchObject({ ok: false, code: 'conflict' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('deleteRole', () => {
  it('не знайдено → not_found (помилка читання теж дає not_found — спостереження)', async () => {
    const a = setup({ roles: { get: vi.fn(async () => dbOk(null)) } })
    expect(await a.uc.deleteRole('r-x', admin)).toMatchObject({ ok: false, code: 'not_found' })
    const b = setup({ roles: { get: vi.fn(async () => dbFail('boom')) } })
    expect(await b.uc.deleteRole('r-x', admin)).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('системна роль → invalid', async () => {
    const { uc, roles } = setup({ roles: { get: vi.fn(async () => dbOk({ id: 'r-mgr', name: 'manager', is_system: true })) } })
    expect(await uc.deleteRole('r-mgr', admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(roles.delete).not.toHaveBeenCalled()
  })

  it('роль на рівні або вище за власну → forbidden', async () => {
    const { uc, roles } = setup()
    expect(await uc.deleteRole('r-mgr', manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(roles.delete).not.toHaveBeenCalled()
  })

  it('роль призначена користувачам → invalid', async () => {
    const { uc, roles } = setup({ roles: { countUsers: vi.fn(async () => 2) } })
    expect(await uc.deleteRole('r-mgr', admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(roles.delete).not.toHaveBeenCalled()
  })

  it('успіх → delete + audit role.delete зі старою назвою', async () => {
    const { uc, roles, audit } = setup()
    expect(await uc.deleteRole('r-mgr', admin)).toEqual({ ok: true, value: undefined })
    expect(roles.delete).toHaveBeenCalledWith('r-mgr')
    expect(audit.record).toHaveBeenCalledWith(admin, 'role.delete', 'admin_roles/r-mgr', { old: { name: 'Менеджер' } })
  })

  it('помилка видалення → failed, без audit', async () => {
    const { uc, audit } = setup({ roles: { delete: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.deleteRole('r-mgr', admin)).toMatchObject({ ok: false, code: 'failed' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('reorderRoles', () => {
  it('не масив / порожній / без рядків → invalid, БД не читається', async () => {
    const { uc, roles } = setup()
    expect(await uc.reorderRoles({}, admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.reorderRoles({ orderedIds: [] }, admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await uc.reorderRoles({ orderedIds: [1, 2] }, admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(roles.listForOrder).not.toHaveBeenCalled()
  })

  it('неповна перестановка або дублі → invalid (400)', async () => {
    const { uc, roles } = setup()
    expect(await uc.reorderRoles({ orderedIds: ['r-admin', 'r-mgr'] }, admin)).toMatchObject({
      ok: false,
      code: 'invalid',
      message: 'Список ролей неповний або з дублями',
    })
    expect(await uc.reorderRoles({ orderedIds: ['r-admin', 'r-mgr', 'r-mgr'] }, admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(roles.setOrder).not.toHaveBeenCalled()
  })

  it('переміщення заблокованого префікса (ролі на рівні/вище за актора) → forbidden', async () => {
    const { uc, roles } = setup()
    const r = await uc.reorderRoles({ orderedIds: ['r-mgr', 'r-admin', 'r-view'] }, manager)
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
    expect(roles.setOrder).not.toHaveBeenCalled()
  })

  it('менеджер може переставляти лише ролі нижче за себе: префікс [admin, mgr] збережено → ok', async () => {
    const { uc, roles, audit } = setup({
      roles: {
        listForOrder: vi.fn(async () => dbOk([...ROLES_FOR_ORDER, { id: 'r-guest', name: 'Гість', hierarchy_order: 3 }])),
      },
    })
    const ordered = ['r-admin', 'r-mgr', 'r-guest', 'r-view']
    expect(await uc.reorderRoles({ orderedIds: ordered }, manager)).toEqual({ ok: true, value: undefined })
    expect(roles.setOrder).toHaveBeenCalledWith(ordered)
    expect(audit.record).toHaveBeenCalledWith(manager, 'role.reorder', 'admin_roles', { new: ordered })
  })

  it('admin: повна перестановка → setOrder + audit role.reorder', async () => {
    const { uc, roles, audit } = setup()
    const ordered = ['r-admin', 'r-view', 'r-mgr']
    expect(await uc.reorderRoles({ orderedIds: ordered }, admin)).toEqual({ ok: true, value: undefined })
    expect(roles.setOrder).toHaveBeenCalledWith(ordered)
    expect(audit.record).toHaveBeenCalledWith(admin, 'role.reorder', 'admin_roles', { new: ordered })
  })

  it('помилка listForOrder / setOrder → failed', async () => {
    const a = setup({ roles: { listForOrder: vi.fn(async () => dbFail('boom')) } })
    expect(await a.uc.reorderRoles({ orderedIds: ['r-admin'] }, admin)).toMatchObject({ ok: false, code: 'failed' })
    const b = setup({ roles: { setOrder: vi.fn(async () => dbFail('boom')) } })
    expect(await b.uc.reorderRoles({ orderedIds: ['r-admin', 'r-mgr', 'r-view'] }, admin)).toMatchObject({ ok: false, code: 'failed' })
    expect(b.audit.record).not.toHaveBeenCalled()
  })
})
