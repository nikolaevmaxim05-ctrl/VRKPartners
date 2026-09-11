// i18n/request — конфіг next-intl на кожен запит: мова + ПОВНІ тексти сайту
// (дефолти messages/<мова>.json ⊕ правки клієнта з site_content, розділ 9).
// Помилка або недоступність БД → чисті дефолти (репозиторій повертає {} — сайт не падає).
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import { routing } from './routing'
import { getContentUseCases } from '@composition/container'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale
  const messages = await getContentUseCases().getMessages(locale)
  // Тексти містять масиви та булеві (картки, кейси) — рендеряться через useMessages(), не ICU.
  return { locale, messages: messages as unknown as AbstractIntlMessages }
})
