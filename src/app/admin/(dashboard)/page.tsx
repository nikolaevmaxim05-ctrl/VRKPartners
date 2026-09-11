// /admin — головна адмінки: картки доступних розділів (розділ 5 стандарту).
// Достатньо входу; кожна картка показується лише за наявності відповідного права.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getAdminAccess } from '@/presentation/admin-page'
import { visibleSections } from '@/features/admin/lib/sections'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Головна | Адмін' }

export default async function AdminRootPage() {
  const { actor, permissions } = await getAdminAccess()
  if (!actor) redirect('/admin/login')
  const sections = visibleSections(permissions)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Головна</h1>
        <p className="text-muted-foreground">
          {sections.length > 0
            ? 'Оберіть розділ. Показано лише розділи, доступні вашій ролі.'
            : 'Вашій ролі поки не надано доступу до жодного розділу. Зверніться до адміністратора.'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base">{s.label}</CardTitle>
                  <CardDescription className="mt-1">{s.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-1 pt-0 text-sm text-primary">
                Відкрити <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
