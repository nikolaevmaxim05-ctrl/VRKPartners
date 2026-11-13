import { getMessages } from 'next-intl/server'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { NotFoundContent } from '@/features/landing/components/layout/NotFoundContent'

// Корневой 404 — только для путей вне сегмента сайта (напр. неизвестные /admin/*).
// Страницы сайта попадают в [locale]/not-found.tsx под шапкой и футером.
export default async function RootNotFound() {
  const { notFound } = (await getMessages()) as unknown as SiteMessages
  return (
    <main>
      <NotFoundContent m={notFound} />
    </main>
  )
}
