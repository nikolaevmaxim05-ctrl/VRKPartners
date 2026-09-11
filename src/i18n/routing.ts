// i18n/routing — профіль A (одна мова): locales ['uk'], адреси без префікса /uk.
// next-intl лишається завжди — на ньому тримається контент-система (дефолти, мерж правок,
// рядок site_content на мову, редактор). Один язык — це список з одної мови (розділ 10).
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['uk'],
  defaultLocale: 'uk',
  localePrefix: 'never',
  // Одна мова: визначати мову з cookie/accept-language нема з чого, hreflang-альтернатив немає.
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
})

export type AppLocale = (typeof routing.locales)[number]

/** Єдина карта кодів: сегмент адреси → <html lang> / og:locale (розділ 10). */
export const LOCALE_CODES: Record<AppLocale, { lang: string; og: string }> = {
  uk: { lang: 'uk', og: 'uk_UA' },
}
