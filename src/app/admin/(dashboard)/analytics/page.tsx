// Сторінка «Аналітика» — серверний shell з перевіркою прав (view_reports).
import { Suspense } from 'react'
import { requireSectionAccess } from '@/presentation/admin-page'
import { AnalyticsReport } from '@/features/admin/components/analytics-report'
import { Skeleton } from '@/shared/ui/skeleton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Аналітика | Адмін' }

export default async function AnalyticsPage() {
  await requireSectionAccess(['view_reports'])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Аналітика</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Зведені звіти по заявках у розрізах: джерело, стадія, послуга, відповідальний, реферальне посилання, дата.
        </p>
      </div>
      {/* Suspense потрібен, бо AnalyticsReport використовує useSearchParams() */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalyticsReport />
      </Suspense>
    </div>
  )
}
