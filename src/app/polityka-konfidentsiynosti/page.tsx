import type { Metadata } from 'next'
import { getContentUseCases } from '@composition/container'
import { formatLegalUpdatedAt } from '@core/domain/content/legal'
import { LegalPage } from '@/features/landing/components/legal/LegalPageLayout'
import { site } from '@/shared/config/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getContentUseCases().getLegal()
  return { title: `${content.privacy.title} — ${site.name}` }
}

export default async function PrivacyPolicyPage() {
  const { content, updatedAt } = await getContentUseCases().getLegal()
  return <LegalPage doc={content.privacy} updatedAt={formatLegalUpdatedAt(updatedAt, content.privacy.updatedAt)} />
}
