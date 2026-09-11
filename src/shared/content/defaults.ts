// shared/content/defaults — дефолтні тексти сайту (messages/uk.json), SEO та юр.документів.
// Без вводу-виводу: імпортується сервером (container, i18n/request) і клієнтом (редактор).
// Розробник пише тексти сайту ТІЛЬКИ в messages/<мова>.json; у компонентах — лише ключі.
import uk from '@/messages/uk.json'
import { privacyPolicy } from '@/shared/content/legal/privacy-policy'
import { publicOffer } from '@/shared/content/legal/public-offer'
import type { SiteMessages } from '@core/domain/content/site-messages'
import type { SeoMeta } from '@core/domain/content/seo'
import type { LegalContent } from '@core/domain/content/legal'

// Правила URL для контенту — одна точка імпорту для редактора та лендингу.
export { isSafeImageUrl, isSafeHref, isTelegramUrl } from '@core/domain/content/landing'
export type { SiteMessages } from '@core/domain/content/site-messages'

/** Файли текстів за мовою. Профіль A: одна мова. */
const MESSAGES: Record<string, SiteMessages> = { uk: uk as SiteMessages }

/** Глибока копія (знімає readonly/літеральні типи). */
function clone<T>(v: unknown): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function getDefaultMessages(locale = 'uk'): SiteMessages {
  return clone<SiteMessages>(MESSAGES[locale] ?? MESSAGES.uk)
}

export function getDefaultSeo(): SeoMeta {
  return { ...uk.pageMeta }
}

export function getDefaultLegalContent(): LegalContent {
  return { privacy: clone(privacyPolicy), offer: clone(publicOffer) }
}
