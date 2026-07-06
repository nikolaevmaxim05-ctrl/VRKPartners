// PATCH /api/admin/roles/reorder — змінити порядок ієрархії ролей.
// Body: { orderedIds: string[] } — зверху вниз (перший = найвищий).
// Правила: потрібно manage_roles/manage_users. Ролі на рівні/вище за власну
// (locked) НЕ можна рухати — вони мають лишитись префіксом у тому ж порядку.
// «admin» завжди найвищий (його ранг -1, тож він завжди в locked-префіксі).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageRoles, getActorRank, effectiveRank } from '@/lib/roles'

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

  // Перевірка: orderedIds — повна перестановка існуючих ролей.
  const allIds = new Set(roles.map((r) => r.id))
  if (orderedIds.length !== roles.length || !orderedIds.every((id) => allIds.has(id))
      || new Set(orderedIds).size !== orderedIds.length) {
    return NextResponse.json({ error: 'Список ролей неповний або з дублями' }, { status: 400 })
  }

  // Поточний порядок за рангом (admin зверху).
  const rankById = new Map(roles.map((r) => [r.id, effectiveRank(r)]))
  const currentOrdered = [...roles].sort(
    (a, b) => effectiveRank(a) - effectiveRank(b) || a.name.localeCompare(b.name),
  )

  const actorRank = await getActorRank(user.id)
  // Locked = ролі на рівні/вище за власну (їх рухати не можна).
  const lockedIds = currentOrdered
    .filter((r) => (rankById.get(r.id) ?? Infinity) <= actorRank)
    .map((r) => r.id)

  // У надісланому списку locked-ролі мають бути префіксом і в тому ж порядку.
  const prefix = orderedIds.slice(0, lockedIds.length)
  const samePrefix = prefix.length === lockedIds.length
    && prefix.every((id, i) => id === lockedIds[i])
  if (!samePrefix) {
    return NextResponse.json(
      { error: 'Не можна переміщувати ролі на рівні або вище за вашу' },
      { status: 403 },
    )
  }

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
