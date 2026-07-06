// PATCH  /api/admin/roles/[id] — оновити роль (назва/права). Системні: тільки права.
// DELETE /api/admin/roles/[id] — видалити роль (тільки несистемну, без привʼязаних юзерів).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageRoles, sanitizePermissions, getActiveRoleAssignments, getActorRank, getRoleRanks } from '@/lib/roles'
import { getUserRoleInfo } from '@/lib/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canManageRoles(user.id))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { id } = await params
  let body: { name?: string; permissions?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: role, error: getErr } = await service
    .from('admin_roles')
    .select('id, name, is_system')
    .eq('id', id)
    .maybeSingle()
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
  if (!role) return NextResponse.json({ error: 'Роль не знайдено' }, { status: 404 })

  // ── Ієрархія: редагувати можна лише роль СТРОГО нижче за власну ──
  const [actorRank, ranks] = await Promise.all([getActorRank(user.id), getRoleRanks()])
  const targetRank = ranks.get(id) ?? Number.POSITIVE_INFINITY
  if (actorRank >= targetRank) {
    return NextResponse.json(
      { error: 'Не можна редагувати роль, що стоїть на одному рівні або вище за вашу' },
      { status: 403 },
    )
  }

  // Заборона змінювати права ВЛАСНОЇ ролі (щоб не зняти собі доступ).
  if (body.permissions !== undefined) {
    const info = await getUserRoleInfo(user.id)
    if (info?.roleId === id) {
      return NextResponse.json(
        { error: 'Не можна змінювати права власної ролі' },
        { status: 403 }
      )
    }
  }

  const update: Record<string, unknown> = {}
  if (body.permissions !== undefined) update.permissions = sanitizePermissions(body.permissions)
  // Назву системних ролей (admin/manager) не міняємо — на них зав'язана логіка/мітки.
  if (body.name !== undefined && !role.is_system) {
    const name = body.name.trim().slice(0, 48)
    if (!name) return NextResponse.json({ error: 'Назва ролі обовʼязкова' }, { status: 400 })
    update.name = name
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  // ── Lockout-guard: не дати прибрати «Управління користувачами» з ОСТАННЬОЇ ролі,
  // яка дає це право активним користувачам ──
  if (Array.isArray(update.permissions) && !update.permissions.includes('manage_users')) {
    const assignments = await getActiveRoleAssignments()
    const stillHave = assignments.filter(
      (a) => a.role_id !== id && a.permissions.includes('manage_users'),
    )
    const thisRoleHasHolders = assignments.some(
      (a) => a.role_id === id && a.permissions.includes('manage_users'),
    )
    if (thisRoleHasHolders && stillHave.length === 0) {
      return NextResponse.json(
        { error: 'Не можна прибрати «Управління користувачами» з останньої ролі, що його надає активним користувачам' },
        { status: 400 }
      )
    }
  }

  const { data, error } = await service
    .from('admin_roles')
    .update(update)
    .eq('id', id)
    .select('id, name, permissions, is_system')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Роль з такою назвою вже існує' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canManageRoles(user.id))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: role } = await service
    .from('admin_roles')
    .select('id, is_system')
    .eq('id', id)
    .maybeSingle()
  if (!role) return NextResponse.json({ error: 'Роль не знайдено' }, { status: 404 })
  if (role.is_system) {
    return NextResponse.json({ error: 'Системну роль не можна видалити' }, { status: 400 })
  }

  // ── Ієрархія: видаляти можна лише роль СТРОГО нижче за власну ──
  const [actorRank, ranks] = await Promise.all([getActorRank(user.id), getRoleRanks()])
  if (actorRank >= (ranks.get(id) ?? Number.POSITIVE_INFINITY)) {
    return NextResponse.json(
      { error: 'Не можна видаляти роль, що стоїть на одному рівні або вище за вашу' },
      { status: 403 },
    )
  }

  // Не видаляємо роль, якщо вона комусь призначена
  const { count } = await service
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Роль призначена користувачам — спершу змініть їм роль' },
      { status: 400 }
    )
  }

  const { error } = await service.from('admin_roles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
