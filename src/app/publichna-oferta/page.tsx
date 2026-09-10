import type { Metadata } from 'next'
import { getContentUseCases } from '@composition/container'
import { formatLegalUpdatedAt } from '@core/domain/content/legal'
import { LegalPage } from '@/features/landing/components/legal/LegalPageLayout'
import { site } from '@/shared/config/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getContentUseCases().getLegal()
  return { title: `${content.offer.title} — ${site.name}` }
}

export default async function PublicOfferPage() {
  const { content, updatedAt } = await getContentUseCases().getLegal()
  return <LegalPage doc={content.offer} updatedAt={formatLegalUpdatedAt(updatedAt, content.offer.updatedAt)} />
}
