import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPageLayout'
import { privacyPolicy } from '@/content/legal/privacy-policy'
import { site } from '@/config/site'

// TODO(legal): поки стоїть заглушка — сторінка noindex. ПІСЛЯ публікації реального
// тексту (заповнення `sections` у src/content/legal/privacy-policy.ts):
//   1. приберіть `robots` нижче (або задайте { index: true, follow: true });
//   2. додайте цю сторінку в src/app/sitemap.ts (там є відповідний TODO).
export const metadata: Metadata = {
  title: `${privacyPolicy.title} — ${site.name}`,
  robots: { index: false, follow: false },
}

export default function PrivacyPolicyPage() {
  return <LegalPage doc={privacyPolicy} />
}
