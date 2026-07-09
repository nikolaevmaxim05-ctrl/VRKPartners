// GET  /api/admin/content — поточні оверрайди контенту лендингу
// PUT  /api/admin/content — зберегти оверрайди (+ revalidate лендингу)
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import {
  LANDING_CONTENT_ID,
  getLandingContentOverrides,
  mergeLandingContent,
  type LandingContentOverrides,
} from '@/lib/content'

export const runtime = 'nodejs'

async function requireContentAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await hasAnyPermission(user.id, ['manage_content']))) {
    return { error: NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET() {
  const guard = await requireContentAccess()
  if (guard.error) return guard.error

  const overrides = await getLandingContentOverrides()
  // Повертаємо і оверрайди, і поточні ефективні значення (для prefill форми).
  return NextResponse.json({ overrides, content: mergeLandingContent(overrides) })
}

export async function PUT(request: NextRequest) {
  const guard = await requireContentAccess()
  if (guard.error) return guard.error

  let body: { overrides?: LandingContentOverrides }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const overrides = body.overrides
  if (!overrides || typeof overrides !== 'object') {
    return NextResponse.json({ error: 'overrides is required' }, { status: 400 })
  }

  // Легка санітизація FAQ (масив пар рядків, без порожніх питань).
  if (overrides.faq !== undefined) {
    if (!Array.isArray(overrides.faq)) {
      return NextResponse.json({ error: 'faq має бути масивом' }, { status: 400 })
    }
    overrides.faq = overrides.faq
      .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim().length > 0)
      .map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 2000) }))
  }

  // Частковий мерж: редактор одного блоку (напр. послуги) не затирає інші (контакти/FAQ).
  const existing = await getLandingContentOverrides()
  const merged: LandingContentOverrides = { ...existing, ...overrides }

  const service = createServiceClient()
  const { error } = await service.from('site_content').upsert({
    id: LANDING_CONTENT_ID,
    data: merged,
    updated_at: new Date().toISOString(),
    updated_by: guard.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Лендинг підхоплює зміни без деплою.
  revalidatePath('/', 'layout')

  return NextResponse.json({ ok: true })
}
