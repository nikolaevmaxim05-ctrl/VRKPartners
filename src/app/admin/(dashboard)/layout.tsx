import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRoleInfo } from '@/lib/permissions'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminTopbar } from '@/components/admin/topbar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'Адмін-панель',
  robots: 'noindex, nofollow',
}

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  // Отримуємо права користувача для sidebar.
  // Деактивований користувач (is_active=false) НЕ має жодних прав ролі —
  // обнуляємо, щоб меню/доступ відповідали реальним правам (як і hasPermission).
  const roleInfo = await getUserRoleInfo(user.id)
  const permissions = roleInfo?.isActive ? (roleInfo.permissions ?? []) : []

  // Підпис ролі під email у сайдбарі (системні ролі — людською назвою).
  const ROLE_LABELS: Record<string, string> = { admin: 'Власник', manager: 'Менеджер' }
  const roleLabel = roleInfo
    ? (ROLE_LABELS[roleInfo.roleName] ?? roleInfo.roleName)
    : 'Без ролі'

  return (
    <SidebarProvider>
      <AdminSidebar user={user} permissions={permissions} roleLabel={roleLabel} />
      <SidebarInset>
        <AdminTopbar />
        <main className="flex flex-1 flex-col gap-4 p-4 pt-6">
          {children}
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
