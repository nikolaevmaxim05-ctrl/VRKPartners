// PUT /api/admin/lead-statuses/reorder — масове оновлення position
// body: { items: [{ id: string, position: number }, ...] }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

type Body = { items: { id: string; position: number }[] }

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Порожній items' }, { status: 400 })
  }

  // Валідація
  for (const item of body.items) {
    if (!item.id || !Number.isFinite(item.position) || item.position < 0) {
      return NextResponse.json({ error: 'Невірні дані' }, { status: 400 })
    }
  }

  const service = createServiceClient()

  // Послідовні UPDATE — для 6-15 стадій це OK. Транзакція не критична:
  // якщо одна впаде, інші позиції все одно валідні (просто проміжний стан).
  const errors: string[] = []
  for (const item of body.items) {
    const { error } = await service
      .from('lead_statuses')
      .update({ position: Math.floor(item.position) })
      .eq('id', item.id)
    if (error) errors.push(`${item.id}: ${error.message}`)
  }

  if (errors.length > 0) {
    console.error('[admin/lead-statuses/reorder] partial_failure', errors)
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
