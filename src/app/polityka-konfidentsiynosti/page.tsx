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
  const { privacy } = mergeLegalContent(await getLegalOverrides())
  return { title: `${privacy.title} — ${site.name}` }
}

export default async function PrivacyPolicyPage() {
  const [overrides, updatedAtIso] = await Promise.all([getLegalOverrides(), getLegalUpdatedAt()])
  const { privacy } = mergeLegalContent(overrides)
  const updatedAt = formatLegalUpdatedAt(updatedAtIso, privacy.updatedAt)
  return <LegalPage doc={privacy} updatedAt={updatedAt} />
}
