'use client'

// Тексты сайта для клиентских секций: полный объект messages (дефолты ⊕ правки клиента),
// который [locale]/layout передаёт в NextIntlClientProvider. Читаем через useMessages(), а не
// t('key'): тексты редактирует клиент, и ICU-синтаксис ({, ') в них — не формат, а обычные символы.
import { useMessages } from 'next-intl'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { pageVisibility, HOME_NS, type PageVisibility } from '@core/domain/content/visibility'

export function useSiteMessages(): SiteMessages {
  return useMessages() as unknown as SiteMessages
}

/** Видимость блоков главной (messages.home.hidden) — для меню шапки/футера. */
export function useHomeVisibility(): PageVisibility {
  const { home } = useSiteMessages()
  return pageVisibility(HOME_NS, home.hidden)
}
