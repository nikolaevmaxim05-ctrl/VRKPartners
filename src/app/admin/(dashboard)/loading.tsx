// Скелетон раздела админки: показывается сразу после клика по пункту меню, пока сервер готовит
// страницу (все страницы админки динамические). Благодаря этой границе prefetch ссылок сайдбара приносит
// готовый каркас, и переход ощущается мгновенным. Модель авторизации не меняется: каркас не
// содержит данных, сама страница рендерится после проверок middleware и гарда раздела.
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
