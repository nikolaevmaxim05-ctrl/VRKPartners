// Метадані (SEO) головної сторінки: title/description, Open Graph, поля організації
// для JSON-LD. Дефолти — в config/site.ts (meta), оверрайди — в БД (таблиця
// site_content, окремий рядок id='seo'). Механізм і fail-safe — той самий, що для
// контенту лендингу (lib/content.ts), але окремий рядок, щоб форма метаданих і
// форма контенту не перетирали одна одну.

import { meta } from '@/config/site'

export const SEO_CONTENT_ID = 'seo'

export type SeoMeta = {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  orgName: string
  orgDescription: string
  orgPhone: string
  orgEmail: string
  orgTelegram: string
}

export type SeoOverrides = Partial<SeoMeta>

/** Порядок/набір полів — єдине джерело правди (для diff/whitelist). */
export const SEO_KEYS: readonly (keyof SeoMeta)[] = [
  'title', 'description', 'ogTitle', 'ogDescription', 'ogImage',
  'orgName', 'orgDescription', 'orgPhone', 'orgEmail', 'orgTelegram',
]

/** Дефолти з коду у мутабельному вигляді. */
export function getDefaultSeo(): SeoMeta {
  return { ...meta }
}

/** Лишає лише непорожні рядки (щоб порожнє поле не затирало дефолт). */
function cleanStrings(ov: SeoOverrides | null | undefined): Partial<SeoMeta> {
  const out: Partial<SeoMeta> = {}
  if (!ov) return out
  for (const k of SEO_KEYS) {
    const v = ov[k]
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return out
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди → лишається дефолт. */
export function mergeSeo(overrides: SeoOverrides | null | undefined): SeoMeta {
  return { ...getDefaultSeo(), ...cleanStrings(overrides) }
}

/** OG-заголовок/опис із наслідуванням: порожньо → беремо основні title/description. */
export function effectiveOg(m: SeoMeta): { title: string; description: string } {
  return {
    title: m.ogTitle.trim() || m.title,
    description: m.ogDescription.trim() || m.description,
  }
}

/** Diff від дефолтів: зберігаємо лише непорожні поля, що відрізняються (правки коду
 * доходять до прод, поки поле не перевизначене вручну). */
export function diffSeo(incoming: SeoOverrides, defaults: SeoMeta): SeoOverrides {
  const out: SeoOverrides = {}
  for (const k of SEO_KEYS) {
    const v = incoming[k]
    if (typeof v === 'string' && v.trim().length > 0 && v !== defaults[k]) out[k] = v
  }
  return out
}

/** Серверне читання оверрайдів. Будь-яка помилка → {} (сторінка бере дефолти). */
export async function getSeoOverrides(): Promise<SeoOverrides> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data, error } = await service
      .from('site_content')
      .select('data')
      .eq('id', SEO_CONTENT_ID)
      .maybeSingle()
    if (error || !data?.data) return {}
    return data.data as SeoOverrides
  } catch {
    return {}
  }
}

/** updated_at рядка метаданих — для optimistic-lock. null, якщо рядка ще немає. */
export async function getSeoUpdatedAt(): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data } = await service
      .from('site_content')
      .select('updated_at')
      .eq('id', SEO_CONTENT_ID)
      .maybeSingle()
    return (data?.updated_at as string | null) ?? null
  } catch {
    return null
  }
}
