// shared/content/defaults — дефолтні тексти сайту (з файлів) у мутабельному вигляді.
// Джерело до Фази 3 — config/site.ts і content/legal/*; у Фазі 3 — messages/uk.json.
// Без вводу-виводу: імпортується і сервером (container), і клієнтом (ContentProvider).
import { site, hero, usp, about, finalCta, faq, services, trust, audit, workflow, meta } from '@/shared/config/site'
import { privacyPolicy } from '@/shared/content/legal/privacy-policy'
import { publicOffer } from '@/shared/content/legal/public-offer'
import {
  mergeLandingContent as mergeWith,
  type LandingContent,
  type LandingContentOverrides,
  type UspContent,
  type AboutContent,
  type ServicesContent,
  type TrustContent,
  type AuditContent,
  type WorkflowContent,
} from '@core/domain/content/landing'
import type { SeoMeta } from '@core/domain/content/seo'
import type { LegalContent } from '@core/domain/content/legal'

// Типи й валідатори моделі контенту — для компонентів редактора й лендингу (одна точка імпорту).
export { diffLandingOverrides, isSafeImageUrl, isSafeHref, isTelegramUrl } from '@core/domain/content/landing'
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

/** Глибока копія (знімає readonly/літеральні типи `as const`). */
function clone<T>(v: unknown): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function getDefaultLandingContent(): LandingContent {
  return {
    site: { ...site },
    hero: { ...hero },
    usp: clone<UspContent>(usp),
    about: clone<AboutContent>(about),
    finalCta: { ...finalCta },
    faq: [...faq],
    services: clone<ServicesContent>(services),
    trust: clone<TrustContent>(trust),
    audit: clone<AuditContent>(audit),
    workflow: clone<WorkflowContent>(workflow),
  }
}

export function getDefaultSeo(): SeoMeta {
  return { ...meta }
}

export function getDefaultLegalContent(): LegalContent {
  return { privacy: clone(privacyPolicy), offer: clone(publicOffer) }
}

/** Мерж дефолтів лендингу з оверрайдами (порожні/невалідні оверрайди ігноруються). */
export function mergeLandingContent(overrides: LandingContentOverrides | null | undefined): LandingContent {
  return mergeWith(getDefaultLandingContent(), overrides)
}
