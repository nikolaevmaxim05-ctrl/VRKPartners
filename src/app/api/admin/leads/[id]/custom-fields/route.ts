// PATCH /api/admin/leads/[id]/custom-fields — upsert значення кастомного поля для лида
// Body: { field_id: string, value: string | null }
// Унікальна пара: (lead_id, field_id) у lead_custom_field_values.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = {
  field_id?: string
  value?: string | null
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: leadId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fieldId = (body.field_id ?? '').trim()
  if (!fieldId) {
    return NextResponse.json({ error: 'field_id обовʼязковий' }, { status: 400 })
  }

  const service = createServiceClient()

  // Перевіряємо існування поля і його тип для валідації value
  const { data: field, error: fieldErr } = await service
    .from('lead_custom_fields')
    .select('id, type, options, required')
    .eq('id', fieldId)
    .maybeSingle()

  if (fieldErr || !field) {
    return NextResponse.json({ error: 'Поле не знайдено' }, { status: 404 })
  }

  // Нормалізація value: '' → null
  let value: string | null = null
  if (body.value !== null && body.value !== undefined) {
    const raw = String(body.value).trim()
    value = raw === '' ? null : raw
  }

  if (value !== null) {
    if (value.length > 1000) {
      return NextResponse.json({ error: 'Занадто довге значення' }, { status: 400 })
    }
    if (field.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: 'Невірне число' }, { status: 400 })
      }
    }
    if (field.type === 'date') {
      // Очікуємо YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return NextResponse.json({ error: 'Невірна дата (YYYY-MM-DD)' }, { status: 400 })
      }
    }
    if (field.type === 'select') {
      const opts = Array.isArray(field.options) ? field.options : []
      if (!opts.includes(value)) {
        return NextResponse.json({ error: 'Значення не входить в список опцій' }, { status: 400 })
      }
    }
  }

  // Перевіряємо що лід існує
  const { data: lead, error: leadErr } = await service
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Лід не знайдено' }, { status: 404 })
  }

  const { data, error } = await service
    .from('lead_custom_field_values')
    .upsert(
      { lead_id: leadId, field_id: fieldId, value },
      { onConflict: 'lead_id,field_id' }
    )
    .select('field_id, value')
    .single()

  if (error) {
    console.error('[admin/leads/[id]/custom-fields] upsert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
