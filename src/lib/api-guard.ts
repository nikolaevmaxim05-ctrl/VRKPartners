// Централізований guard для admin-API роутів: авторизація + активність + права.
// hasAnyPermission повертає false для деактивованих користувачів (user_roles.is_active=false),
// тож одним викликом закриваємо і клас «жива сесія деактивованого користувача читає PII».
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasAnyPermission, type Permission } from '@/lib/permissions'

export type ApiGuardResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse }

export async function requireApiAccess(anyOf: Permission[]): Promise<ApiGuardResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const allowed = await hasAnyPermission(user.id, anyOf)
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id, email: user.email ?? null }
}
