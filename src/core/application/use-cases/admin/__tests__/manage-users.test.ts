// makeUserUseCases на фейковых портах — раздел 5: приглашение, изменение, удаление пользователей,
// иерархия рангов и lockout-guard.
import { describe, it, expect, vi } from 'vitest'
import { makeUserUseCases } from '../manage-users'
import { dbOk, dbFail } from '../../../ports/common'

const admin = { id: 'u-admin', email: 'admin@vrk.test' }
const manager = { id: 'u-mgr', email: 'mgr@vrk.test' }
const NOW = new Date('2026-03-01T12:00:00.000Z')
const ORIGIN = 'https://vrk.com.ua'

const RANKS = new Map<string, number>([
  ['r-admin', -1],
  ['r-mgr', 1],
  ['r-view', 2],
])

/** У кого какая роль (для getRoleId / getActorRank). */
const ROLE_OF: Record<string, string | null> = {
  'u-admin': 'r-admin',
  'u-mgr': 'r-mgr',
  'u-mgr2': 'r-mgr',
  'u-view': 'r-view',
  'u-none': null,
}

function setup(over: { users?: Record<string, unknown>; roles?: Record<string, unknown> } = {}) {
  const users = {
    getRoleInfo: vi.fn(),
    getActorRank: vi.fn(async (userId: string) => {
      const roleId = ROLE_OF[userId]
      return roleId ? RANKS.get(roleId) ?? Infinity : Infinity
    }),
    getActiveAssignments: vi.fn(async () => [
      { user_id: 'u-admin', role_id: 'r-admin', permissions: ['manage_users', 'manage_roles'] },
      { user_id: 'u-mgr', role_id: 'r-mgr', permissions: ['manage_users', 'manage_leads'] },
      { user_id: 'u-view', role_id: 'r-view', permissions: ['view_reports'] },
    ]),
    listAdminUsers: vi.fn(async () => dbOk([])),
    listAssignees: vi.fn(async () => dbOk([])),
    getRoleId: vi.fn(async (userId: string) => ROLE_OF[userId] ?? null),
    hasRoleRow: vi.fn(async (userId: string) => ROLE_OF[userId] != null),
    updateRoleRow: vi.fn(async () => dbOk(undefined)),
    insertRoleRow: vi.fn(async () => dbOk(undefined)),
    assignRoleOnInvite: vi.fn(async () => dbOk(undefined)),
    invite: vi.fn(async (email: string) =>
      dbOk({ id: 'u-new', email, created_at: '2026-03-01T11:00:00.000Z', email_confirmed_at: null }),
    ),
    deleteAuthUser: vi.fn(async () => dbOk(undefined)),
    getDisplayLabel: vi.fn(),
    getEmailAndName: vi.fn(),
    getEmailsAndNames: vi.fn(),
    getAssigneeLabelMap: vi.fn(),
    ...over.users,
  }
  const roles = {
    getRanks: vi.fn(async () => RANKS),
    getPermissions: vi.fn(async (roleId: string) =>
      roleId === 'r-admin' || roleId === 'r-mgr' ? ['manage_users', 'manage_leads'] : ['view_reports'],
    ),
    ...over.roles,
  }
  const audit = { record: vi.fn(async () => {}) }
  const deps = { users, roles, clock: { now: () => NOW }, audit }
  return { uc: makeUserUseCases(deps as never), users, roles, audit }
}

const quiet = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('inviteUser', () => {
  it('email обовʼязковий (порожній / пробіли) → invalid, запрошення не шлеться', async () => {
    const { uc, users } = setup()
    expect(await uc.inviteUser({}, admin, ORIGIN)).toMatchObject({ ok: false, code: 'invalid', message: 'Email обовʼязковий' })
    expect(await uc.inviteUser({ email: '   ' }, admin, ORIGIN)).toMatchObject({ ok: false, code: 'invalid' })
    expect(users.invite).not.toHaveBeenCalled()
  })

  it('роль на рівні або вище за власну → forbidden (менеджер запрошує admin і менеджера)', async () => {
    const { uc, users } = setup()
    expect(await uc.inviteUser({ email: 'x@y.z', role_id: 'r-admin' }, manager, ORIGIN)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(await uc.inviteUser({ email: 'x@y.z', role_id: 'r-mgr' }, manager, ORIGIN)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(users.invite).not.toHaveBeenCalled()
  })

  it('успіх: invite з redirect /admin/set-password, assignRoleOnInvite, audit user.invite ПІСЛЯ призначення ролі (факт, а не намір)', async () => {
    const { uc, users, audit } = setup()
    const r = await uc.inviteUser({ email: '  new@vrk.test ', role_id: 'r-view' }, manager, ORIGIN)
    expect(r.ok).toBe(true)
    expect(users.invite).toHaveBeenCalledWith('new@vrk.test', `${ORIGIN}/admin/set-password`)
    expect(users.assignRoleOnInvite).toHaveBeenCalledWith('u-new', 'r-view')
    expect(audit.record).toHaveBeenCalledWith(manager, 'user.invite', 'user_roles/u-new', {
      new: { email: 'new@vrk.test', role_id: 'r-view' },
    })
    // Журнал пишется после назначения роли: при сбое назначения role_id в записи = null.
    const auditOrder = audit.record.mock.invocationCallOrder[0]
    const assignOrder = users.assignRoleOnInvite.mock.invocationCallOrder[0]
    expect(auditOrder).toBeGreaterThan(assignOrder)
    expect(r.ok && r.value).toEqual({
      ok: true,
      user: {
        id: 'u-new',
        email: 'new@vrk.test',
        created_at: '2026-03-01T11:00:00.000Z',
        last_sign_in_at: null,
        email_confirmed: false,
        display_name: null,
        role_id: 'r-view',
        is_active: true,
      },
    })
  })

  it('роль не призначилась → warning, role_id = null (запрошення вже пішло)', async () => {
    quiet()
    const { uc } = setup({ users: { assignRoleOnInvite: vi.fn(async () => dbFail('boom')) } })
    const r = await uc.inviteUser({ email: 'new@vrk.test', role_id: 'r-view' }, admin, ORIGIN)
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.warning).toBe('Запрошення відправлено, але роль не призначилась')
    expect(r.ok && r.value.user?.role_id).toBeNull()
  })

  it('без ролі: перевірки рангу немає, роль не призначається, у журналі role_id = null', async () => {
    const { uc, users, audit } = setup()
    const r = await uc.inviteUser({ email: 'new@vrk.test' }, manager, ORIGIN)
    expect(r.ok).toBe(true)
    expect(users.getActorRank).not.toHaveBeenCalled()
    expect(users.assignRoleOnInvite).not.toHaveBeenCalled()
    expect(audit.record).toHaveBeenCalledWith(manager, 'user.invite', 'user_roles/u-new', { new: { email: 'new@vrk.test', role_id: null } })
    expect(r.ok && r.value.warning).toBeUndefined()
  })

  it('invite повернув null-дані → user null, ресурс журналу user_roles/unknown; created_at з годинника не потрібен', async () => {
    const { uc, audit } = setup({ users: { invite: vi.fn(async () => dbOk(null)) } })
    const r = await uc.inviteUser({ email: 'new@vrk.test', role_id: 'r-view' }, admin, ORIGIN)
    expect(r.ok && r.value.user).toBeNull()
    expect(r.ok && r.value.warning).toBe('Запрошення відправлено, але роль не призначилась')
    expect(audit.record).toHaveBeenCalledWith(admin, 'user.invite', 'user_roles/unknown', expect.anything())
  })

  it('created_at відсутній у відповіді → береться з годинника', async () => {
    const { uc } = setup({
      users: { invite: vi.fn(async () => dbOk({ id: 'u-new', email: null, created_at: null, email_confirmed_at: '2026-01-01T00:00:00Z' })) },
    })
    const r = await uc.inviteUser({ email: 'new@vrk.test' }, admin, ORIGIN)
    expect(r.ok && r.value.user).toMatchObject({ email: 'new@vrk.test', created_at: NOW.toISOString(), email_confirmed: true })
  })

  it('invite провалився → failed, журнал не пишеться', async () => {
    const { uc, audit } = setup({ users: { invite: vi.fn(async () => dbFail('smtp down')) } })
    expect(await uc.inviteUser({ email: 'new@vrk.test' }, admin, ORIGIN)).toMatchObject({ ok: false, code: 'failed', message: 'smtp down' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})

describe('updateUser', () => {
  it('деактивувати самого себе → invalid', async () => {
    const { uc, users } = setup()
    expect(await uc.updateUser(admin.id, { is_active: false }, admin)).toMatchObject({ ok: false, code: 'invalid', message: 'Не можна деактивувати самого себе' })
    expect(users.updateRoleRow).not.toHaveBeenCalled()
  })

  it('зміна власної ролі → forbidden; та сама роль — проходить', async () => {
    const { uc, users } = setup()
    expect(await uc.updateUser(admin.id, { role_id: 'r-mgr' }, admin)).toMatchObject({ ok: false, code: 'forbidden', message: 'Не можна змінювати власну роль' })
    expect(users.updateRoleRow).not.toHaveBeenCalled()
    const same = await uc.updateUser(admin.id, { role_id: 'r-admin', display_name: 'Адмін' }, admin)
    expect(same.ok).toBe(true)
    expect(users.updateRoleRow).toHaveBeenCalledWith(admin.id, { role_id: 'r-admin', name: 'Адмін' })
  })

  it('ціль з роллю на рівні або вище за власну → forbidden', async () => {
    const { uc, users } = setup()
    expect(await uc.updateUser('u-admin', { display_name: 'X' }, manager)).toMatchObject({ ok: false, code: 'forbidden', message: 'Не можна редагувати користувача з роллю на рівні або вище за вашу' })
    // Другой менеджер (тот же ранг) — тоже forbidden.
    expect(await uc.updateUser('u-mgr2', { display_name: 'X' }, manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(users.updateRoleRow).not.toHaveBeenCalled()
  })

  it('призначити роль на рівні або вище за власну → forbidden', async () => {
    const { uc, users } = setup()
    expect(await uc.updateUser('u-view', { role_id: 'r-mgr' }, manager)).toMatchObject({ ok: false, code: 'forbidden', message: 'Не можна призначати роль на рівні або вище за вашу' })
    expect(await uc.updateUser('u-view', { role_id: 'r-admin' }, manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(users.updateRoleRow).not.toHaveBeenCalled()
  })

  it('ціль без ролі: перевірка рангу цілі пропускається, але призначувана роль усе одно перевіряється', async () => {
    // Наблюдение: user_roles.role_id NOT NULL, так что «без роли» = без строки; тогда INSERT
    // возможен только с role_id, а role_id проверяется рангом. Пробела в защите нет.
    const { uc, users } = setup()
    expect(await uc.updateUser('u-none', { role_id: 'r-mgr' }, manager)).toMatchObject({ ok: false, code: 'forbidden' })
    const r = await uc.updateUser('u-none', { role_id: 'r-view' }, manager)
    expect(r.ok).toBe(true)
    expect(users.insertRoleRow).toHaveBeenCalledWith('u-none', { role_id: 'r-view' })
  })

  it('lockout: деактивація останнього власника manage_users → invalid', async () => {
    const { uc, users } = setup({
      users: {
        getActiveAssignments: vi.fn(async () => [
          { user_id: 'u-mgr', role_id: 'r-mgr', permissions: ['manage_users'] },
          { user_id: 'u-view', role_id: 'r-view', permissions: ['view_reports'] },
        ]),
      },
    })
    // Актор — admin без manage_users в списке активных (напр., деактивирован в этот момент) — граничный случай.
    const r = await uc.updateUser('u-mgr', { is_active: false }, admin)
    expect(r).toMatchObject({ ok: false, code: 'invalid', message: 'Це останній користувач з правом «Управління користувачами» — дію заблоковано' })
    expect(users.updateRoleRow).not.toHaveBeenCalled()
  })

  it('lockout: зниження ролі останнього власника manage_users → invalid; є інший власник → ок', async () => {
    const solo = setup({
      users: { getActiveAssignments: vi.fn(async () => [{ user_id: 'u-mgr', role_id: 'r-mgr', permissions: ['manage_users'] }]) },
    })
    expect(await solo.uc.updateUser('u-mgr', { role_id: 'r-view' }, admin)).toMatchObject({ ok: false, code: 'invalid' })
    expect(solo.roles.getPermissions).toHaveBeenCalledWith('r-view')
    const withAdmin = setup()
    expect((await withAdmin.uc.updateUser('u-mgr', { role_id: 'r-view' }, admin)).ok).toBe(true)
  })

  it('лише display_name → lockout-guard не рахується (getActiveAssignments не викликається)', async () => {
    const { uc, users } = setup()
    await uc.updateUser('u-view', { display_name: 'Іван' }, admin)
    expect(users.getActiveAssignments).not.toHaveBeenCalled()
  })

  it('порожній патч → «Нічого оновлювати»', async () => {
    const { uc, users } = setup()
    expect(await uc.updateUser('u-view', {}, admin)).toMatchObject({ ok: false, code: 'invalid', message: 'Нічого оновлювати' })
    expect(users.hasRoleRow).not.toHaveBeenCalled()
  })

  it('display_name обрізається (trim, 64), is_active приводиться до boolean; audit user.update', async () => {
    const { uc, users, audit } = setup()
    const r = await uc.updateUser('u-view', { display_name: '  ' + 'і'.repeat(70) + ' ', is_active: 1 as unknown as boolean }, admin)
    expect(r).toEqual({ ok: true, value: undefined })
    const fields = { name: 'і'.repeat(64), is_active: true }
    expect(users.updateRoleRow).toHaveBeenCalledWith('u-view', fields)
    expect(users.insertRoleRow).not.toHaveBeenCalled()
    expect(audit.record).toHaveBeenCalledWith(admin, 'user.update', 'user_roles/u-view', { new: fields })
  })

  it('рядка ролі немає і role_id не передано → «Спочатку призначте роль користувачу»', async () => {
    const { uc, users, audit } = setup()
    expect(await uc.updateUser('u-none', { display_name: 'X' }, admin)).toMatchObject({ ok: false, code: 'invalid', message: 'Спочатку призначте роль користувачу' })
    expect(users.insertRoleRow).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('помилка оновлення/вставки → failed, без audit', async () => {
    quiet()
    const upd = setup({ users: { updateRoleRow: vi.fn(async () => dbFail('boom')) } })
    expect(await upd.uc.updateUser('u-view', { display_name: 'X' }, admin)).toMatchObject({ ok: false, code: 'failed' })
    expect(upd.audit.record).not.toHaveBeenCalled()
    const ins = setup({ users: { insertRoleRow: vi.fn(async () => dbFail('boom')) } })
    expect(await ins.uc.updateUser('u-none', { role_id: 'r-view' }, admin)).toMatchObject({ ok: false, code: 'failed' })
  })
})

describe('deleteUser', () => {
  it('видалити самого себе → invalid', async () => {
    const { uc, users } = setup()
    expect(await uc.deleteUser(admin.id, admin)).toMatchObject({ ok: false, code: 'invalid', message: 'Не можна видалити самого себе' })
    expect(users.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('ціль з роллю на рівні або вище → forbidden', async () => {
    const { uc, users } = setup()
    expect(await uc.deleteUser('u-admin', manager)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(users.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('успіх → deleteAuthUser + audit user.delete без значень', async () => {
    const { uc, users, audit } = setup()
    expect(await uc.deleteUser('u-view', manager)).toEqual({ ok: true, value: undefined })
    expect(users.deleteAuthUser).toHaveBeenCalledWith('u-view')
    expect(audit.record).toHaveBeenCalledWith(manager, 'user.delete', 'user_roles/u-view')
    expect(audit.record.mock.calls[0]).toHaveLength(3)
  })

  it('ціль без ролі → видаляється будь-ким з правом (ранг Infinity не перевіряється)', async () => {
    const { uc, users } = setup()
    expect((await uc.deleteUser('u-none', manager)).ok).toBe(true)
    expect(users.deleteAuthUser).toHaveBeenCalledWith('u-none')
  })

  it('помилка видалення → failed, без audit', async () => {
    const { uc, audit } = setup({ users: { deleteAuthUser: vi.fn(async () => dbFail('boom')) } })
    expect(await uc.deleteUser('u-view', admin)).toMatchObject({ ok: false, code: 'failed', message: 'boom' })
    expect(audit.record).not.toHaveBeenCalled()
  })
})
