// PATCH  /api/admin/tracking-tags/[id] — редагування тегу (enabled / label / tag_id)
// DELETE /api/admin/tracking-tags/[id] — видалення тегу
//
// Після кожної мутації — revalidatePath('/', 'layout'): теги рендеряться
// серверно у (marketing)/layout.tsx, зміни мають застосовуватись без деплою.
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import {
  type TrackingTagType,
  isValidTagId,
  TAG_ID_FORMAT_HINTS,
} from '@/lib/tracking-tags'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const TAG_SELECT = 'id, type, tag_id, label, enabled, position, created_at'

type PatchBody = Partial<{
  enabled: boolean
  label: string | null
  tag_id: string
}>

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: current, error: getErr } = await service
    .from('tracking_tags')
    .select('id, type')
    .eq('id', id)
    .maybeSingle<{ id: string; type: TrackingTagType }>()

  if (getErr || !current) {
    return NextResponse.json({ error: 'Тег не знайдено' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  if (body.enabled !== undefined) {
    update.enabled = !!body.enabled
  }

  if (body.label !== undefined) {
    const trimmed = typeof body.label === 'string' ? body.label.trim() : null
    const label = trimmed || null
    if (label && label.length > 128) {
      return NextResponse.json({ error: 'Мітка: до 128 символів' }, { status: 400 })
    }
    update.label = label
  }

  if (body.tag_id !== undefined) {
    const tagId = (body.tag_id ?? '').trim()
    // tag_id валідується за поточним типом тегу — тип змінювати не можна
    if (!isValidTagId(current.type, tagId)) {
      return NextResponse.json(
        { error: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[current.type]}` },
        { status: 400 },
      )
    }
    update.tag_id = tagId
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нічого оновлювати' }, { status: 400 })
  }

  const { data, error } = await service
    .from('tracking_tags')
    .update(update)
    .eq('id', id)
    .select(TAG_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Тег з таким ID вже існує' }, { status: 409 })
    }
    console.error('[admin/tracking-tags/[id]] update_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Миттєве застосування на лендингу без деплою
  revalidatePath('/', 'layout')

  return NextResponse.json({ data })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  const service = createServiceClient()

  const { data: target, error: getErr } = await service
    .from('tracking_tags')
    .select('id')
    .eq('id', id)
    .maybeSingle<{ id: string }>()

  if (getErr || !target) {
    return NextResponse.json({ error: 'Тег не знайдено' }, { status: 404 })
  }

  const { error: deleteErr } = await service.from('tracking_tags').delete().eq('id', id)
  if (deleteErr) {
    console.error('[admin/tracking-tags/[id]] delete_failed', deleteErr.message)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  // Миттєве застосування на лендингу без деплою
  revalidatePath('/', 'layout')

  return NextResponse.json({ ok: true })
}
