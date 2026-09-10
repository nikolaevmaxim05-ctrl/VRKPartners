// LEGACY-адаптер (Фаза 1): модель контенту лендингу — у @core/domain/content/landing.
// Тут: дефолти з config/site.ts (Фаза 3 → messages/uk.json) і серверне читання
// оверрайдів із site_content (Фаза 2 → infrastructure/supabase/repositories/content).
//
// Зберігання: таблиця site_content, один рядок id='landing', колонка data (JSONB)
// містить лише ЗМІНЕНІ поля (partial override).

import { site, hero, usp, about, finalCta, faq, services, trust, audit, workflow } from '@/config/site'
import {
  mergeLandingContent as mergeLandingContentWith,
  type LandingContent,
  type LandingContentOverrides,
  type UspContent,
  type AboutContent,
  type ServicesContent,
  type TrustContent,
  type AuditContent,
  type WorkflowContent,
} from '@core/domain/content/landing'

export {
  diffLandingOverrides,
  isSafeImageUrl,
  isSafeHref,
  isTelegramUrl,
} from '@core/domain/content/landing'
export type {
  FaqItem,
  UspItem,
  UspContent,
  AboutMember,
  AboutContent,
  AuditItem,
  AuditContent,
  WorkflowStep,
  WorkflowTerm,
  WorkflowBonus,
  WorkflowContent,
  ServiceItem,
  ServicesContent,
  CaseMetric,
  CaseItem,
  CaseGroup,
  TrustContent,
  LandingContentOverrides,
  LandingContent,
} from '@core/domain/content/landing'

export const LANDING_CONTENT_ID = 'landing'

/** Глибока копія (знімає readonly/літеральні типи `as const`). */
function clone(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v))
}

/** Дефолти з config/site.ts у мутабельному вигляді. */
export function getDefaultLandingContent(): LandingContent {
  return {
    site: { ...site },
    hero: { ...hero },
    usp: clone(usp) as UspContent,
    about: clone(about) as AboutContent,
    finalCta: { ...finalCta },
    faq: [...faq],
    services: clone(services) as ServicesContent,
    trust: clone(trust) as TrustContent,
    audit: clone(audit) as AuditContent,
    workflow: clone(workflow) as WorkflowContent,
  }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди ігноруються. */
export function mergeLandingContent(
  overrides: LandingContentOverrides | null | undefined,
): LandingContent {
  return mergeLandingContentWith(getDefaultLandingContent(), overrides)
}

/**
 * Серверне читання оверрайдів із site_content. Захищене: будь-яка помилка →
 * порожній об'єкт (лендинг падає на дефолти config/site.ts).
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

/** updated_at рядка site_content — для optimistic-lock. null, якщо рядка ще немає. */
export async function getLandingContentUpdatedAt(): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data } = await service
      .from('site_content')
      .select('updated_at')
      .eq('id', LANDING_CONTENT_ID)
      .maybeSingle()
    return (data?.updated_at as string | null) ?? null
  } catch {
    return null
  }
}
