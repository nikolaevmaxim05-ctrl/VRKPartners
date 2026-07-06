// Сторінка «Аналітика» — серверний shell з перевіркою прав.
// Нема view_reports → redirect на /admin/leads.
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { AnalyticsReport } from '@/components/admin/analytics-report'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Аналітика | Адмін' }

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Auth-guard — на випадок якщо layout не спрацював
  if (!user) redirect('/admin/login')

  // Права — view_reports обов'язково
  const allowed = await hasPermission(user.id, 'view_reports')
  if (!allowed) redirect('/admin/leads')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Аналітика</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Зведені звіти по заявках у розрізах: джерело, стадія, послуга, відповідальний, дата.
        </p>
      </div>
      {/* Suspense потрібен, бо AnalyticsReport використовує useSearchParams() */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <AnalyticsReport />
      </Suspense>
    </div>
  )
}
