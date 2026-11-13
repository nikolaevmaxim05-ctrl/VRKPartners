// shared/content/defaults — дефолтные тексты сайта (messages/uk.json), SEO и юр.документов.
// Без ввода-вывода: импортируется сервером (container, i18n/request) и клиентом (редактор).
// Разработчик пишет тексты сайта ТОЛЬКО в messages/<язык>.json; в компонентах — только ключи.
import uk from '@/messages/uk.json'
import { privacyPolicy } from '@/shared/content/legal/privacy-policy'
import { publicOffer } from '@/shared/content/legal/public-offer'
import type { SiteMessages } from '@core/domain/content/site-messages'
import type { SeoMeta } from '@core/domain/content/seo'
import type { LegalContent } from '@core/domain/content/legal'

// Правила URL для контента — одна точка импорта для редактора и лендинга.
export { isSafeImageUrl, isSafeHref, isTelegramUrl } from '@core/domain/content/landing'
export type { SiteMessages } from '@core/domain/content/site-messages'

/** Файлы текстов по языку. Профиль A: один язык. */
const MESSAGES: Record<string, SiteMessages> = { uk: uk as SiteMessages }

/** Глубокая копия (снимает readonly/литеральные типы). */
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
