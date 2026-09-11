import type { Metadata } from 'next'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { getContentUseCases } from '@composition/container'
import { formatLegalUpdatedAt } from '@core/domain/content/legal'
import type { SiteMessages } from '@core/domain/content/site-messages'
import { LegalPage } from '@/features/landing/components/legal/LegalPageLayout'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [{ content }, messages] = await Promise.all([getContentUseCases().getLegal(), getMessages()])
  return { title: `${content.offer.title} — ${(messages as unknown as SiteMessages).site.name}` }
}

export default async function PublicOfferPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const { content, updatedAt } = await getContentUseCases().getLegal()
  return <LegalPage doc={content.offer} updatedAt={formatLegalUpdatedAt(updatedAt, content.offer.updatedAt)} />
}
