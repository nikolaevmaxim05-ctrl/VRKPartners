// i18n/routing — профиль A (один язык): locales ['uk'], адреса без префикса /uk.
// next-intl остаётся всегда — на нём держится контент-система (дефолты, мерж правок,
// строка site_content на язык, редактор). Один язык — это список из одного языка (раздел 10).
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['uk'],
  defaultLocale: 'uk',
  localePrefix: 'never',
  // Один язык: определять язык из cookie/accept-language не из чего, hreflang-альтернатив нет.
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
})

export type AppLocale = (typeof routing.locales)[number]

/** Единая карта кодов: сегмент адреса → <html lang> / og:locale (раздел 10). */
export const LOCALE_CODES: Record<AppLocale, { lang: string; og: string }> = {
  uk: { lang: 'uk', og: 'uk_UA' },
}
