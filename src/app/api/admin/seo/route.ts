// GET  /api/admin/seo — поточні оверрайди метаданих + ефективні значення
// PUT  /api/admin/seo — зберегти оверрайди (+ revalidate лендингу)
// Право: manage_content. Zod-валідація (довжини полів, ogImage за allowlist хостів),
// whitelist полів (z.object стриже невідомі ключі), лише plain-текст (значення
// потрапляють у <head>/JSON-LD як екрановані рядки). Контакти тут не редагуються.
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import { isSafeImageUrl } from '@/lib/content'
import { isStaleUpdate } from '@/lib/optimistic-lock'
import {
  SEO_CONTENT_ID,
  getSeoOverrides,
  mergeSeo,
  getDefaultSeo,
  getSeoUpdatedAt,
  diffSeo,
  type SeoOverrides,
} from '@/lib/seo'

export const runtime = 'nodejs'

// Контакти (phone/email/telegram) сюди НЕ входять — вони живуть у контенті лендингу
// (єдине джерело). z.object стриже невідомі ключі, тож старі оверрайди ігноруються.
const seoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(500).optional(),
  ogImage: z.string().max(500).optional(),
  orgName: z.string().max(200).optional(),
  orgDescription: z.string().max(500).optional(),
})

async function requireSeoAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await hasAnyPermission(user.id, ['manage_content']))) {
    return { error: NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET() {
  const guard = await requireSeoAccess()
  if (guard.error) return guard.error

  const [overrides, updatedAt] = await Promise.all([getSeoOverrides(), getSeoUpdatedAt()])
  return NextResponse.json({ overrides, content: mergeSeo(overrides), updatedAt })
}

export async function PUT(request: NextRequest) {
  const guard = await requireSeoAccess()
  if (guard.error) return guard.error

  let body: { overrides?: unknown; baseUpdatedAt?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = seoSchema.safeParse(body.overrides)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Невірний формат метаданих' }, { status: 400 })
  }
  const overrides = parsed.data as SeoOverrides

  // OG-картинка — лише локальний шлях /… або https на дозволеному хості (як для контенту).
  if (!isSafeImageUrl(overrides.ogImage)) {
    return NextResponse.json(
      { error: 'Недопустима картинка OG (лише /… або https://…supabase.co)' },
      { status: 400 },
    )
  }

  const service = createServiceClient()

  // Optimistic-lock: інший адмін зберіг раніше → 409.
  const { data: current } = await service
    .from('site_content')
    .select('updated_at')
    .eq('id', SEO_CONTENT_ID)
    .maybeSingle()
  if (isStaleUpdate(current?.updated_at, body.baseUpdatedAt)) {
    return NextResponse.json(
      { error: 'Метадані змінив інший адміністратор. Оновіть сторінку й повторіть.' },
      { status: 409 },
    )
  }

  // Зберігаємо лише diff від дефолтів (правки коду доходять до прод без «заморозки»).
  const merged = diffSeo(overrides, getDefaultSeo())

  const nowIso = new Date().toISOString()
  const { error } = await service.from('site_content').upsert({
    id: SEO_CONTENT_ID,
    data: merged,
    updated_at: nowIso,
    updated_by: guard.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Лендинг (метадані <head> + JSON-LD) підхоплює зміни без деплою.
  revalidatePath('/', 'layout')

  return NextResponse.json({ ok: true, updatedAt: nowIso })
}
