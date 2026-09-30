// Скелетон розділу адмінки: показується одразу після кліку по пункту меню, поки сервер готує
// сторінку (усі сторінки адмінки динамічні). Завдяки цій межі prefetch посилань сайдбара приносить
// готовий каркас, і перехід відчувається миттєвим. Модель авторизації не змінюється: каркас не
// містить даних, сама сторінка рендериться після перевірок middleware і гарда розділу.
import { Skeleton } from '@/shared/ui/skeleton'

export default function AdminSectionLoading() {
  return (
    <div className="space-y-6" data-admin-loading aria-busy="true" aria-live="polite">
      <span className="sr-only">Завантаження…</span>
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-5/6" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </div>
  )
}
