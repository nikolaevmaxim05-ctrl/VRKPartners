// Редаговані з адмінки оверрайди контенту лендингу.
// Дефолти живуть у config/site.ts і завжди є фолбеком — якщо в БД порожньо
// або сталася помилка, лендинг рендериться як раніше (нічого не ламається).
//
// Зберігання: таблиця site_content, один рядок id='landing', колонка data (JSONB)
// містить лише ЗМІНЕНІ поля (partial override), напр.:
//   { "hero": { "title": "..." }, "faq": [ { "q": "...", "a": "..." } ] }

import { site, hero, finalCta, faq } from '@/config/site'

export const LANDING_CONTENT_ID = 'landing'

export type FaqItem = { q: string; a: string }

/** Форма оверрайдів (усі поля опційні — редагуємо лише те, що треба). */
export type LandingContentOverrides = {
  site?: Partial<{
    phone: string
    phoneHref: string
    email: string
    telegram: string
    telegramHandle: string
    geo: string
  }>
  hero?: Partial<{
    title: string
    subtitle: string
    trust: string
    primaryCta: string
    secondaryCta: string
    formTitle: string
    formNote: string
  }>
  finalCta?: Partial<{
    title: string
    text: string
    primaryCta: string
  }>
  faq?: FaqItem[]
}

/** Повний контент лендингу після мержу дефолтів з оверрайдами.
 * Значення — рядки (усі поля site/hero/finalCta у config є рядками), тож
 * Record<string,string> точний і не конфліктує з літеральними типами `as const`. */
export type LandingContent = {
  site: Record<string, string>
  hero: Record<string, string>
  finalCta: Record<string, string>
  faq: readonly FaqItem[]
}

/** Дефолти з config/site.ts у мутабельному вигляді. */
export function getDefaultLandingContent(): LandingContent {
  return {
    site: { ...site },
    hero: { ...hero },
    finalCta: { ...finalCta },
    faq: [...faq],
  }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди ігноруються. */
export function mergeLandingContent(
  overrides: LandingContentOverrides | null | undefined
): LandingContent {
  const base = getDefaultLandingContent()
  if (!overrides || typeof overrides !== 'object') return base

  return {
    site: { ...base.site, ...cleanStrings(overrides.site) },
    hero: { ...base.hero, ...cleanStrings(overrides.hero) },
    finalCta: { ...base.finalCta, ...cleanStrings(overrides.finalCta) },
    faq:
      Array.isArray(overrides.faq) && overrides.faq.length > 0
        ? overrides.faq
            .filter(
              (f): f is FaqItem =>
                !!f && typeof f.q === 'string' && typeof f.a === 'string' && f.q.trim().length > 0
            )
            .map((f) => ({ q: f.q, a: f.a }))
        : base.faq,
  }
}

/** Лишає тільки непорожні рядкові значення (щоб порожнє поле не затирало дефолт). */
function cleanStrings<T extends Record<string, unknown> | undefined>(
  obj: T
): Partial<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return out
}

/**
 * Серверне читання оверрайдів із site_content. Захищене: будь-яка помилка →
 * порожній об'єкт (лендинг падає на дефолти config/site.ts).
 * Викликається тільки на сервері (createServiceClient).
 */
export async function getLandingContentOverrides(): Promise<LandingContentOverrides> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data, error } = await service
      .from('site_content')
      .select('data')
      .eq('id', LANDING_CONTENT_ID)
      .maybeSingle()

    if (error || !data?.data) return {}
    return data.data as LandingContentOverrides
  } catch {
    return {}
  }
}
