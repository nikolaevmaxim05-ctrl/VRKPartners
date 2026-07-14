import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPageLayout'
import { publicOffer } from '@/content/legal/public-offer'
import { site } from '@/config/site'

// TODO(legal): поки стоїть заглушка — сторінка noindex. ПІСЛЯ публікації реального
// тексту (заповнення `sections` у src/content/legal/public-offer.ts):
//   1. приберіть `robots` нижче (або задайте { index: true, follow: true });
//   2. додайте цю сторінку в src/app/sitemap.ts (там є відповідний TODO).
export const metadata: Metadata = {
  title: `${publicOffer.title} — ${site.name}`,
  robots: { index: false, follow: false },
}

export default function PublicOfferPage() {
  return <LegalPage doc={publicOffer} />
}
