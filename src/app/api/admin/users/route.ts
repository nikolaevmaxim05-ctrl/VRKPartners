// GET  /api/admin/users — список адмін-користувачів, збагачений даними user_roles
// POST /api/admin/users — запросити нового користувача по email (потрібно manage_users)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'
import { getActorRank, getRoleRanks } from '@/lib/roles'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const [authResult, rolesResult] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service
      .from('user_roles')
      .select('user_id, name, is_active, role_id, role:admin_roles(id, name)'),
  ])

  if (authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: 500 })
  }
  if (rolesResult.error) {
    console.error('[admin/users] user_roles_failed', rolesResult.error.message)
  }

  type RoleJoin = { id: string; name: string }
  type RoleRow = {
    user_id: string
    name: string | null
    is_active: boolean
    role_id: string | null
    role: RoleJoin | RoleJoin[] | null
  }

  const rolesByUserId = new Map<string, RoleRow>()
  for (const r of (rolesResult.data ?? []) as RoleRow[]) {
    rolesByUserId.set(r.user_id, r)
  }

  const users = (authResult.data?.users ?? []).map((u) => {
    const roleRow = rolesByUserId.get(u.id)
    const roleObj = roleRow?.role
    const role = Array.isArray(roleObj) ? roleObj[0] : roleObj
    return {
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed: !!u.email_confirmed_at,
      display_name: roleRow?.name ?? null,
      role_id: roleRow?.role_id ?? null,
      role_name: role?.name ?? null,
      is_active: roleRow?.is_active ?? true,
    }
  })

  return NextResponse.json({ data: users })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_users')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: { email: string; role_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = body.email?.trim()
  if (!email) return NextResponse.json({ error: 'Email обовʼязковий' }, { status: 400 })

  // ── Ієрархія: запрошувати з роллю можна лише СТРОГО нижче за власну ──
  const requestedRoleId = body.role_id?.trim()
  if (requestedRoleId) {
    const [actorRank, ranks] = await Promise.all([getActorRank(user.id), getRoleRanks()])
    const newRank = ranks.get(requestedRoleId) ?? Number.POSITIVE_INFINITY
    if (actorRank >= newRank) {
      return NextResponse.json(
        { error: 'Не можна запрошувати користувача з роллю на рівні або вище за вашу' },
        { status: 403 },
      )
    }
  }

  const service = createServiceClient()
  // Посилання із листа-запрошення має вести на сторінку встановлення пароля.
  const origin =
    request.headers.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/admin/set-password`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Якщо обрано роль — одразу призначаємо її новому користувачу.
  const roleId = body.role_id?.trim()
  if (roleId && data?.user?.id) {
    const { error: roleErr } = await service
      .from('user_roles')
      .upsert({ user_id: data.user.id, role_id: roleId, is_active: true }, { onConflict: 'user_id' })
    if (roleErr) {
      console.error('[admin/users] assign_role_on_invite_failed', roleErr.message)
      // Запрошення вже відправлено — не валимо запит, лише попереджаємо.
      return NextResponse.json({ ok: true, warning: 'Запрошення відправлено, але роль не призначилась' })
    }
  }

  return NextResponse.json({ ok: true })
}
