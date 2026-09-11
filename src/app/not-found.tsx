import { getMessages } from 'next-intl/server'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { NotFoundContent } from '@/features/landing/components/layout/NotFoundContent'

// Кореневий 404 — лише для шляхів поза сегментом сайту (напр. невідомі /admin/*).
// Сторінки сайту потрапляють у [locale]/not-found.tsx під шапкою й футером.
export default async function RootNotFound() {
  const { notFound } = (await getMessages()) as unknown as SiteMessages
  return <NotFoundContent m={notFound} />
}
