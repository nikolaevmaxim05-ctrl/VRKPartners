// LEGACY-адаптер (Фаза 1): правила юр.документів — у @core/domain/content/legal.
// Тут: дефолти з src/content/legal/* і читання оверрайдів із site_content (id='legal').

import { privacyPolicy } from '@/content/legal/privacy-policy'
import { publicOffer } from '@/content/legal/public-offer'
import {
  LEGAL_CONTENT_ID,
  mergeLegalContent as mergeLegalContentWith,
  type LegalContent,
  type LegalOverrides,
} from '@core/domain/content/legal'

export { LEGAL_CONTENT_ID, diffLegalOverrides, formatLegalUpdatedAt } from '@core/domain/content/legal'
export type { LegalDocKey, LegalContent, LegalDocOverride, LegalOverrides } from '@core/domain/content/legal'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/** Дефолти з коду у мутабельному вигляді. */
export function getDefaultLegalContent(): LegalContent {
  return {
    privacy: clone(privacyPolicy),
    offer: clone(publicOffer),
  }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди → лишаються дефолти. */
export function mergeLegalContent(overrides: LegalOverrides | null | undefined): LegalContent {
  return mergeLegalContentWith(getDefaultLegalContent(), overrides)
}

/** Серверне читання оверрайдів. Будь-яка помилка → {} (сторінки падають на дефолти). */
export async function getLegalOverrides(): Promise<LegalOverrides> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data, error } = await service
      .from('site_content')
      .select('data')
      .eq('id', LEGAL_CONTENT_ID)
      .maybeSingle()
    if (error || !data?.data) return {}
    return data.data as LegalOverrides
  } catch {
    return {}
  }
}

/** updated_at рядка легальних документів — дата останнього збереження (або null). */
export async function getLegalUpdatedAt(): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data } = await service
      .from('site_content')
      .select('updated_at')
      .eq('id', LEGAL_CONTENT_ID)
      .maybeSingle()
    return (data?.updated_at as string | null) ?? null
  } catch {
    return null
  }
}
