// PATCH /api/admin/roles/reorder — змінити порядок ієрархії ролей.
// Body: { orderedIds: string[] } — зверху вниз (перший = найвищий).
// Правила (ядро: core/domain/access/hierarchy.validateRoleReorder): повна перестановка
// без дублів; ролі на рівні/вище за власну (locked) лишаються префіксом у тому ж порядку.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageRoles, getActorRank } from '@/lib/roles'
import { validateRoleReorder } from '@core/domain/access/hierarchy'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canManageRoles(user.id))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  let body: { orderedIds?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const orderedIds = Array.isArray(body.orderedIds)
    ? body.orderedIds.filter((x): x is string => typeof x === 'string')
    : null
  if (!orderedIds || orderedIds.length === 0) {
    return NextResponse.json({ error: 'Порожній список' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: rolesRaw, error: rErr } = await service
    .from('admin_roles')
    .select('id, name, hierarchy_order')
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const roles = (rolesRaw ?? []) as { id: string; name: string; hierarchy_order: number | null }[]
  const actorRank = await getActorRank(user.id)

  const plan = validateRoleReorder(orderedIds, roles, actorRank)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status })

  // Призначаємо нові порядкові індекси (0..N-1).
  const updates = orderedIds.map((id, i) =>
    service.from('admin_roles').update({ hierarchy_order: i }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
