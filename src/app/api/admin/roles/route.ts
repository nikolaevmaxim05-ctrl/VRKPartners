// GET  /api/admin/roles — список адмін-ролей з permissions
// POST /api/admin/roles — створити нову роль (потрібно manage_roles або manage_users)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageRoles, sanitizePermissions } from '@/lib/roles'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('admin_roles')
    .select('id, name, permissions, is_system, hierarchy_order')
    .order('hierarchy_order', { ascending: true })
    .order('name')

  if (error) {
    console.error('[admin/roles] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await canManageRoles(user.id))) {
    return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })
  }

  let body: { name?: string; permissions?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = (body.name ?? '').trim().slice(0, 48)
  if (!name) return NextResponse.json({ error: 'Назва ролі обовʼязкова' }, { status: 400 })

  const permissions = sanitizePermissions(body.permissions)

  const service = createServiceClient()

  // Нова роль стає в самий низ ієрархії (найбільший order + 1).
  const { data: maxRow } = await service
    .from('admin_roles')
    .select('hierarchy_order')
    .order('hierarchy_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = Number((maxRow as { hierarchy_order?: number } | null)?.hierarchy_order ?? 0) + 1

  const { data, error } = await service
    .from('admin_roles')
    .insert({ name, permissions, is_system: false, hierarchy_order: nextOrder })
    .select('id, name, permissions, is_system, hierarchy_order')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Роль з такою назвою вже існує' }, { status: 409 })
    }
    console.error('[admin/roles] create_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
