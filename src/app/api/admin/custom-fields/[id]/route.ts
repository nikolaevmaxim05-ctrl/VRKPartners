// PATCH  /api/admin/custom-fields/[id] — редагувати поле (name, options, required, position)
// DELETE /api/admin/custom-fields/[id] — видалити (значення в lead_custom_field_values каскадно)
//
// field_key і type — НЕ змінюються після створення (інакше треба валідувати/мігрувати
// значення у lead_custom_field_values, що складно і небезпечно).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = Partial<{
  name: string
  options: string[]
  required: boolean
  position: number
}>

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()

  // Потрібно знати type щоб валідувати options
  const { data: current, error: getErr } = await service
    .from('lead_custom_fields')
    .select('id, type')
    .eq('id', id)
    .maybeSingle()

  if (getErr || !current) {
    return NextResponse.json({ error: 'Поле не знайдено' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed || trimmed.length > 64) {
      return NextResponse.json({ error: 'Назва: 1-64 символи' }, { status: 400 })
    }
    update.name = trimmed
  }
  if (body.options !== undefined) {
    if (current.type !== 'select') {
      return NextResponse.json({ error: 'Опції лише для типу select' }, { status: 400 })
    }
    if (!Array.isArray(body.options) || body.options.length === 0) {
      return NextResponse.json({ error: 'Потрібен непорожній список опцій' }, { status: 400 })
    }
    const opts = body.options
      .map((o) => String(o).trim())
      .filter((o) => o.length > 0 && o.length <= 64)
    if (opts.length === 0) {
      return NextResponse.json({ error: 'Потрібна хоча б одна опція' }, { status: 400 })
    }
    update.options = opts
  }
  if (body.required !== undefined) update.required = !!body.required
  if (body.position !== undefined) {
    const p = Number(body.position)
    if (!Number.isFinite(p) || p < 0) {
      return NextResponse.json({ error: 'Невірна позиція' }, { status: 400 })
    }
    update.position = Math.floor(p)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  const { data, error } = await service
    .from('lead_custom_fields')
    .update(update)
    .eq('id', id)
    .select('id, name, field_key, type, options, required, position, created_at')
    .single()

  if (error) {
    console.error('[admin/custom-fields/[id]] update_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const service = createServiceClient()
  // lead_custom_field_values FK з ON DELETE CASCADE — значення видаляться автоматично
  const { error } = await service.from('lead_custom_fields').delete().eq('id', id)

  if (error) {
    console.error('[admin/custom-fields/[id]] delete_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
