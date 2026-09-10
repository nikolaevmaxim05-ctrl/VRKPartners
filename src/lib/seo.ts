// LEGACY-адаптер (Фаза 1): правила SEO-метаданих — у @core/domain/content/seo.
// Тут: дефолти з config/site.ts і читання оверрайдів із site_content (id='seo').

import { meta } from '@/config/site'
import { SEO_CONTENT_ID, mergeSeo as mergeSeoWith, type SeoMeta, type SeoOverrides } from '@core/domain/content/seo'

export { SEO_CONTENT_ID, SEO_KEYS, effectiveOg, effectiveOrg, diffSeo } from '@core/domain/content/seo'
export type { SeoMeta, SeoOverrides } from '@core/domain/content/seo'

/** Дефолти з коду у мутабельному вигляді. */
export function getDefaultSeo(): SeoMeta {
  return { ...meta }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди → лишається дефолт. */
export function mergeSeo(overrides: SeoOverrides | null | undefined): SeoMeta {
  return mergeSeoWith(getDefaultSeo(), overrides)
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
