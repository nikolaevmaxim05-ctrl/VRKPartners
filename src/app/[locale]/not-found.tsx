import { getMessages } from 'next-intl/server'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { NotFoundContent } from '@/features/landing/components/layout/NotFoundContent'

// 404 под layout сайта (шапка/футер/тексты) — решение владельца 13.
export default async function NotFound() {
  const { notFound } = (await getMessages()) as unknown as SiteMessages
  return <NotFoundContent m={notFound} />
}
