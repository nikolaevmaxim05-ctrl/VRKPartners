import { redirect } from 'next/navigation'
import { getAdminAccess } from '@/presentation/admin-page'
import { AdminSidebar } from '@/features/admin/components/sidebar'
import { AdminTopbar } from '@/features/admin/components/topbar'
import { SidebarProvider, SidebarInset } from '@/shared/ui/sidebar'
import { Toaster } from '@/shared/ui/sonner'

export const metadata = {
  title: 'Адмін-панель',
  robots: 'noindex, nofollow',
}

// Підпис ролі під email у сайдбарі (системні ролі — людською назвою).
const ROLE_LABELS: Record<string, string> = { admin: 'Власник', manager: 'Менеджер' }

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // Деактивований користувач не має жодних прав ролі — permissions порожні.
  const { actor, roleInfo, permissions } = await getAdminAccess()
  if (!actor) redirect('/admin/login')

  const roleLabel = roleInfo ? (ROLE_LABELS[roleInfo.roleName] ?? roleInfo.roleName) : 'Без ролі'

  return (
    <SidebarProvider>
      <AdminSidebar user={{ email: actor.email }} permissions={permissions} roleLabel={roleLabel} />
      <SidebarInset>
        <AdminTopbar />
        <main className="flex flex-1 flex-col gap-4 p-4 pt-6">{children}</main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
