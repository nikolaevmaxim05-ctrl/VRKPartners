'use client'

// Тексти сайту для клієнтських секцій: повний обʼєкт messages (дефолти ⊕ правки клієнта),
// який [locale]/layout передає у NextIntlClientProvider. Читаємо через useMessages(), а не
// t('key'): тексти редагує клієнт, і ICU-синтаксис ({, ') у них — не формат, а звичайні символи.
import { useMessages } from 'next-intl'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { pageVisibility, HOME_NS, type PageVisibility } from '@core/domain/content/visibility'

export function useSiteMessages(): SiteMessages {
  return useMessages() as unknown as SiteMessages
}

/** Видимість блоків головної (messages.home.hidden) — для меню шапки/футера. */
export function useHomeVisibility(): PageVisibility {
  const { home } = useSiteMessages()
  return pageVisibility(HOME_NS, home.hidden)
}
