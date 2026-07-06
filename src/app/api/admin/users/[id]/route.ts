// DELETE /api/admin/users/[id] — видалити адміна (потрібно manage_users, не можна себе)
// PATCH  /api/admin/users/[id] — оновити user_roles: роль, ім'я, is_active
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { getActiveRoleAssignments, getRolePermissions, getActorRank, getRoleRanks } from '@/lib/roles'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = Partial<{
  role_id: string
  display_name: string
  is_active: boolean
}>

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_users')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const { id } = await params

  let body: PatchBody
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── Ієрархія: керувати чужим користувачем можна, лише якщо його поточна роль
  // СТРОГО нижче за вашу; і призначати можна лише роль строго нижче за вашу ──
  if (id !== user.id) {
    const [actorRank, ranks] = await Promise.all([getActorRank(user.id), getRoleRanks()])
    const { data: targetRow } = await service
      .from('user_roles')
      .select('role_id')
      .eq('user_id', id)
      .maybeSingle()
    const targetRoleId = (targetRow?.role_id as string | null) ?? null
    const targetRank = targetRoleId ? (ranks.get(targetRoleId) ?? Infinity) : Infinity
    if (Number.isFinite(targetRank) && actorRank >= targetRank) {
      return NextResponse.json(
        { error: 'Не можна редагувати користувача з роллю на рівні або вище за вашу' },
        { status: 403 },
      )
    }
    if (body.role_id) {
      const newRank = ranks.get(body.role_id) ?? Infinity
      if (actorRank >= newRank) {
        return NextResponse.json(
          { error: 'Не можна призначати роль на рівні або вище за вашу' },
          { status: 403 },
        )
      }
    }
  }

  // Не можна знімати активність самого себе
  if (id === user.id && body.is_active === false) {
    return NextResponse.json({ error: 'Не можна деактивувати самого себе' }, { status: 400 })
  }

  // Не можна змінювати ВЛАСНУ роль (щоб не понизити собі доступ).
  if (id === user.id && body.role_id !== undefined) {
    const { data: own } = await service
      .from('user_roles')
      .select('role_id')
      .eq('user_id', id)
      .maybeSingle()
    if ((own?.role_id ?? null) !== (body.role_id || null)) {
      return NextResponse.json(
        { error: 'Не можна змінювати власну роль' },
        { status: 403 }
      )
    }
  }

  if (body.role_id === undefined && body.display_name === undefined && body.is_active === undefined) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  // ── Lockout-guard: не залишити систему без жодного активного користувача
  // з правом «Управління користувачами» (manage_users) ──
  const changesAccess = body.role_id !== undefined || body.is_active === false
  if (changesAccess) {
    const assignments = await getActiveRoleAssignments()
    const holders = assignments.filter((a) => a.permissions.includes('manage_users'))
    const otherHolders = holders.filter((a) => a.user_id !== id)

    // Чи матиме цільовий користувач manage_users ПІСЛЯ цієї зміни?
    let targetWillHave = holders.some((a) => a.user_id === id)
    if (body.role_id !== undefined) {
      const newPerms = await getRolePermissions(body.role_id)
      targetWillHave = newPerms.includes('manage_users')
    }
    if (body.is_active === false) targetWillHave = false

    if (!targetWillHave && otherHolders.length === 0) {
      return NextResponse.json(
        {
          error: id === user.id
            ? 'Не можна знизити роль/деактивувати себе: ви єдиний з правом «Управління користувачами»'
            : 'Це останній користувач з правом «Управління користувачами» — дію заблоковано',
        },
        { status: 400 }
      )
    }
  }

  // Поля для запису (без user_id — він у фільтрі/вставці окремо)
  const fields: Record<string, unknown> = {}
  if (body.role_id !== undefined) fields.role_id = body.role_id
  if (body.display_name !== undefined) fields.name = body.display_name.trim().slice(0, 64)
  if (body.is_active !== undefined) fields.is_active = !!body.is_active

  // Чи існує вже рядок user_roles для цього користувача
  const { data: existing } = await service
    .from('user_roles')
    .select('user_id')
    .eq('user_id', id)
    .maybeSingle()

  if (existing) {
    // UPDATE — оновлюємо лише передані поля, role_id не чіпаємо якщо його не передали
    const { error } = await service
      .from('user_roles')
      .update(fields)
      .eq('user_id', id)
    if (error) {
      console.error('[admin/users/[id]] update_role_failed', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    // INSERT можливий лише з роллю (role_id NOT NULL)
    if (body.role_id === undefined) {
      return NextResponse.json(
        { error: 'Спочатку призначте роль користувачу' },
        { status: 400 }
      )
    }
    const { error } = await service
      .from('user_roles')
      .insert({ user_id: id, ...fields })
    if (error) {
      console.error('[admin/users/[id]] insert_role_failed', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_users')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const { id } = await params

  if (id === user.id) {
    return NextResponse.json({ error: 'Не можна видалити самого себе' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── Ієрархія: видаляти можна лише користувача з роллю СТРОГО нижче за вашу ──
  {
    const [actorRank, ranks] = await Promise.all([getActorRank(user.id), getRoleRanks()])
    const { data: targetRow } = await service
      .from('user_roles')
      .select('role_id')
      .eq('user_id', id)
      .maybeSingle()
    const targetRoleId = (targetRow?.role_id as string | null) ?? null
    const targetRank = targetRoleId ? (ranks.get(targetRoleId) ?? Infinity) : Infinity
    if (Number.isFinite(targetRank) && actorRank >= targetRank) {
      return NextResponse.json(
        { error: 'Не можна видаляти користувача з роллю на рівні або вище за вашу' },
        { status: 403 },
      )
    }
  }

  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
