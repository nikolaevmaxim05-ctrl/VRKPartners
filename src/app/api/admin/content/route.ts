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
  getDefaultLandingContent,
  diffLandingOverrides,
  isSafeImageUrl,
  isSafeHref,
  isTelegramUrl,
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

  let body: { overrides?: LandingContentOverrides; baseUpdatedAt?: string | null }
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

  // C10/S7: серверна валідація URL. Зображення (services/cases/about-фото) рендеряться
  // через next/image і впадуть на чужому хості; href кейса без валідації схеми — вектор
  // stored-XSS (javascript:). Дозволяємо лише локальні /… та https на supabase.co для картинок
  // і лише http(s) для href. Інакше — 400.
  for (const it of overrides.services?.items ?? []) {
    if (!isSafeImageUrl(it.mockup ?? null) || !isSafeImageUrl(it.mockupFull ?? null)) {
      return NextResponse.json({ error: 'Недопустиме зображення послуги (лише /… або https://…supabase.co)' }, { status: 400 })
    }
  }
  for (const m of overrides.about?.members ?? []) {
    if (!isSafeImageUrl(m.photo ?? null)) {
      return NextResponse.json({ error: 'Недопустиме фото учасника (лише /… або https://…supabase.co)' }, { status: 400 })
    }
  }
  // Кнопка «Або напишіть нам»: лише t.me / telegram.me (інакше — вектор фішингу/довільного редіректу).
  if (!isTelegramUrl(overrides.site?.telegramCtaUrl)) {
    return NextResponse.json({ error: 'Посилання кнопки Telegram — лише https://t.me/… або https://telegram.me/…' }, { status: 400 })
  }

  for (const g of overrides.trust?.caseGroups ?? []) {
    for (const c of g.cases ?? []) {
      if (!isSafeImageUrl(c.image ?? null)) {
        return NextResponse.json({ error: 'Недопустиме зображення кейса (лише /… або https://…supabase.co)' }, { status: 400 })
      }
      if (!isSafeHref(c.href ?? null)) {
        return NextResponse.json({ error: 'Недопустиме посилання кейса (лише http/https)' }, { status: 400 })
      }
    }
  }

  const service = createServiceClient()

  // C5(a): optimistic-lock. Форма надсилає baseUpdatedAt (значення, з яким завантажила
  // контент). Якщо в БД updated_at інший — інший адмін зберіг раніше → 409, без «lost update».
  const { data: current } = await service
    .from('site_content')
    .select('updated_at')
    .eq('id', LANDING_CONTENT_ID)
    .maybeSingle()
  if (current && typeof body.baseUpdatedAt === 'string' && current.updated_at !== body.baseUpdatedAt) {
    return NextResponse.json(
      { error: 'Контент змінив інший адміністратор. Оновіть сторінку й повторіть.' },
      { status: 409 },
    )
  }

  // C5(b): зберігаємо лише diff від дефолтів (форма шле всі блоки цілком). Блоки, рівні
  // дефолту, не зберігаються — правки config/site.ts доходять до прод без «заморозки».
  const merged = diffLandingOverrides(overrides, getDefaultLandingContent())

  const nowIso = new Date().toISOString()
  const { error } = await service.from('site_content').upsert({
    id: LANDING_CONTENT_ID,
    data: merged,
    updated_at: nowIso,
    updated_by: guard.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Лендинг підхоплює зміни без деплою.
  revalidatePath('/', 'layout')

  // Повертаємо новий updated_at — форма оновлює свій baseline для наступних збережень.
  return NextResponse.json({ ok: true, updatedAt: nowIso })
}
