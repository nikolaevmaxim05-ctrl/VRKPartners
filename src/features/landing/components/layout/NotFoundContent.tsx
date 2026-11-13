// Содержимое страницы 404 (server component). Тексты — messages.notFound; используется и под
// layout сайта ([locale]/not-found.tsx — решение 13), и в корневом not-found (вне языков).
import { Link } from '@/i18n/navigation'
import { Button } from '@/features/landing/components/ui/Button'
import type { NotFoundMessages } from '@core/domain/content/site-messages'

export function NotFoundContent({ m }: { m: NotFoundMessages }) {
  return (
    <section className="section flex min-h-[70vh] items-center">
      <div className="container-x text-center">
        <p className="text-6xl font-bold text-brand">404</p>
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{m.title}</h1>
        <p className="mt-3 text-white/60">{m.text}</p>
        <div className="mt-8 flex justify-center">
          <Link href="/">
            <Button size="lg">{m.home}</Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
