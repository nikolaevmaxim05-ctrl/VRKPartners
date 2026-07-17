import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPageLayout'
import { site } from '@/config/site'
import {
  getLegalOverrides,
  mergeLegalContent,
  getLegalUpdatedAt,
  formatLegalUpdatedAt,
} from '@/lib/legal'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { offer } = mergeLegalContent(await getLegalOverrides())
  return { title: `${offer.title} — ${site.name}` }
}

export default async function PublicOfferPage() {
  const [overrides, updatedAtIso] = await Promise.all([getLegalOverrides(), getLegalUpdatedAt()])
  const { offer } = mergeLegalContent(overrides)
  const updatedAt = formatLegalUpdatedAt(updatedAtIso, offer.updatedAt)
  return <LegalPage doc={offer} updatedAt={updatedAt} />
}
