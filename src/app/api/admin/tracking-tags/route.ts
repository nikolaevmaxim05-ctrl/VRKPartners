// GET  /api/admin/tracking-tags — список усіх Google-тегів, відсортованих по position
// POST /api/admin/tracking-tags — створити новий тег (потрібно manage_settings)
//
// Теги рендеряться на лендингу ((marketing)/layout.tsx) — після кожної
// мутації робимо revalidatePath('/', 'layout'), щоб зміни застосовувались
// миттєво, без деплою.
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import {
  type TrackingTagType,
  isValidTagType,
  isValidTagId,
  TAG_ID_FORMAT_HINTS,
} from '@/lib/tracking-tags'

export const runtime = 'nodejs'

const TAG_SELECT = 'id, type, tag_id, label, enabled, position, created_at'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('tracking_tags')
    .select(TAG_SELECT)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[admin/tracking-tags] query_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

type PostBody = {
  type?: string
  tag_id?: string
  label?: string | null
  enabled?: boolean
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasAnyPermission(user.id, ['manage_settings', 'manage_integrations'])
  if (!allowed) return NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 })

  let body: PostBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidTagType(body.type)) {
    return NextResponse.json({ error: 'Тип тегу: ga4 / gtm / aw' }, { status: 400 })
  }
  const type: TrackingTagType = body.type

  const tagId = (body.tag_id ?? '').trim()
  if (!isValidTagId(type, tagId)) {
    return NextResponse.json(
      { error: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[type]}` },
      { status: 400 },
    )
  }

  const labelRaw = typeof body.label === 'string' ? body.label.trim() : null
  const label = labelRaw || null
  if (label && label.length > 128) {
    return NextResponse.json({ error: 'Мітка: до 128 символів' }, { status: 400 })
  }

  const enabled = body.enabled === undefined ? true : !!body.enabled

  const service = createServiceClient()

  // position — кінець списку
  const { data: maxRow } = await service
    .from('tracking_tags')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (maxRow?.position ?? 0) + 1

  const { data, error } = await service
    .from('tracking_tags')
    .insert({ type, tag_id: tagId, label, enabled, position: nextPosition })
    .select(TAG_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Тег з таким ID вже існує' }, { status: 409 })
    }
    console.error('[admin/tracking-tags] insert_failed', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Миттєве застосування на лендингу без деплою
  revalidatePath('/', 'layout')

  return NextResponse.json({ data })
}
