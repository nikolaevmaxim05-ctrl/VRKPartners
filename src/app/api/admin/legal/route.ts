// GET  /api/admin/legal — поточні оверрайди юридичних документів + ефективний контент
// PUT  /api/admin/legal — зберегти оверрайди (+ revalidate обох сторінок)
// Право: manage_content. Валідація тіла — Zod, лише plain-текст (whitelist полів),
// жодного raw-HTML: тексти рендеряться як текстові вузли JSX (авто-екранування).
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { hasAnyPermission } from '@/lib/permissions'
import {
  LEGAL_CONTENT_ID,
  getLegalOverrides,
  mergeLegalContent,
  getDefaultLegalContent,
  getLegalUpdatedAt,
  diffLegalOverrides,
  type LegalOverrides,
} from '@/lib/legal'

export const runtime = 'nodejs'

const PRIVACY_PATH = '/polityka-konfidentsiynosti'
const OFFER_PATH = '/publichna-oferta'

const sectionSchema = z.object({
  heading: z.string().max(300),
  paragraphs: z.array(z.string().max(6000)).max(60),
  items: z.array(z.string().max(1500)).max(60).optional(),
})
const docSchema = z.object({ sections: z.array(sectionSchema).max(80) })
const overridesSchema = z.object({
  privacy: docSchema.optional(),
  offer: docSchema.optional(),
})

async function requireLegalAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await hasAnyPermission(user.id, ['manage_content']))) {
    return { error: NextResponse.json({ error: 'Доступ заборонено' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET() {
  const guard = await requireLegalAccess()
  if (guard.error) return guard.error

  const [overrides, updatedAt] = await Promise.all([getLegalOverrides(), getLegalUpdatedAt()])
  return NextResponse.json({
    overrides,
    content: mergeLegalContent(overrides),
    updatedAt,
  })
}

export async function PUT(request: NextRequest) {
  const guard = await requireLegalAccess()
  if (guard.error) return guard.error

  let body: { overrides?: unknown; baseUpdatedAt?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Zod + whitelist: пропускаємо лише відомі поля, обрізаємо решту.
  const parsed = overridesSchema.safeParse(body.overrides)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Невірний формат документів' }, { status: 400 })
  }
  const overrides = parsed.data as LegalOverrides

  const service = createServiceClient()

  // Optimistic-lock: якщо інший адмін зберіг раніше — 409 без «lost update».
  const { data: current } = await service
    .from('site_content')
    .select('updated_at')
    .eq('id', LEGAL_CONTENT_ID)
    .maybeSingle()
  if (current && typeof body.baseUpdatedAt === 'string' && current.updated_at !== body.baseUpdatedAt) {
    return NextResponse.json(
      { error: 'Документи змінив інший адміністратор. Оновіть сторінку й повторіть.' },
      { status: 409 },
    )
  }

  // Зберігаємо лише diff від дефолтів (правки коду доходять до прод без «заморозки»).
  const merged = diffLegalOverrides(overrides, getDefaultLegalContent())

  const nowIso = new Date().toISOString()
  const { error } = await service.from('site_content').upsert({
    id: LEGAL_CONTENT_ID,
    data: merged,
    updated_at: nowIso,
    updated_by: guard.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Обидві сторінки підхоплюють зміни без деплою.
  revalidatePath(PRIVACY_PATH)
  revalidatePath(OFFER_PATH)

  return NextResponse.json({ ok: true, updatedAt: nowIso })
}
