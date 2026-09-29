// Розділ «Реферальні посилання» (відхилення 11): посилання для компаній-партнерів і заявки за ними.
import { requireSectionAccess } from '@/presentation/admin-page'
import { REFERRAL_PERMISSIONS } from '@/presentation/permissions'
import { ReferralLinksSection } from '@/features/admin/components/referral-links-section'
import { ReferralAttributionCard } from '@/features/admin/components/referral-attribution-card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Реферальні посилання | Адмін' }

export default async function ReferralLinksPage() {
  await requireSectionAccess(REFERRAL_PERMISSIONS)
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Реферальні посилання</h1>
        <p className="text-muted-foreground text-sm">
          Кожному партнеру — своє посилання. Заявка зараховується партнеру, за посиланням якого відвідувач
          перейшов першим протягом вікна атрибуції; вимкнене посилання нових заявок не зараховує.
        </p>
      </div>
      <ReferralLinksSection />
      <ReferralAttributionCard />
    </div>
  )
}
