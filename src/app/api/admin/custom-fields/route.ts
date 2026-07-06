// GET  /api/admin/custom-fields — список кастомних полів лида
// POST /api/admin/custom-fields — створити нове поле (потрібно manage_settings)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasPermission } from '@/lib/permissions'

export const runtime = 'nodejs'

const ALLOWED_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const
type FieldType = (typeof ALLOWED_TYPES)[number]

const KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('lead_custom_fields')
    .select('id, name, field_key, type, options, required, position, created_at')
    .order('position', { ascending: true })

  if (error) {
    console.error('[admin/custom-fields] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

type PostBody = {
  name?: string
  field_key?: string
  type?: string
  options?: string[]
  required?: boolean
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasPermission(user.id, 'manage_settings')
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const field_key = (body.field_key ?? '').trim().toLowerCase()
  const type = (body.type ?? 'text') as FieldType

  if (!name || name.length > 64) {
    return NextResponse.json({ error: 'Назва: 1-64 символи' }, { status: 400 })
  }
  if (!KEY_REGEX.test(field_key)) {
    return NextResponse.json(
      { error: 'Ключ: латиниця, цифри, _, починається з літери (макс. 64)' },
      { status: 400 }
    )
  }
  if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Невірний тип' }, { status: 400 })
  }

  let options: string[] | null = null
  if (type === 'select') {
    if (!Array.isArray(body.options) || body.options.length === 0) {
      return NextResponse.json({ error: 'Для типу select потрібен список опцій' }, { status: 400 })
    }
    options = body.options
      .map((o) => String(o).trim())
      .filter((o) => o.length > 0 && o.length <= 64)
    if (options.length === 0) {
      return NextResponse.json({ error: 'Потрібна хоча б одна опція' }, { status: 400 })
    }
  }

  const service = createServiceClient()

  // Беремо макс. position, щоб додати в кінець
  const { data: maxRow } = await service
    .from('lead_custom_fields')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxRow?.position ?? 0) + 1

  const { data, error } = await service
    .from('lead_custom_fields')
    .insert({
      name,
      field_key,
      type,
      options,
      required: !!body.required,
      position: nextPosition,
    })
    .select('id, name, field_key, type, options, required, position, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Поле з таким ключем вже існує' }, { status: 409 })
    }
    console.error('[admin/custom-fields] insert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
