'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type User } from '@supabase/supabase-js'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from '@/components/ui/sidebar'
import {
  PhoneCall, Plug, TrendingUp, Users, Shield,
  Settings, LogOut, BarChart3, RotateCcw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Permission } from '@/lib/permissions'

// ----------------------------------------------------------------
// Верхні пункти (Заявки, Аналітика — умовно за правами)
// ----------------------------------------------------------------
const topNavItems = [
  { href: '/admin/leads',     label: 'Заявки',    icon: PhoneCall  },
  // Аналітика — рендериться тільки якщо є view_reports (перевірка нижче)
  { href: '/admin/analytics', label: 'Аналітика', icon: BarChart3, permission: 'view_reports' as Permission },
]

// ----------------------------------------------------------------
// Нижня група: Інтеграції, Користувачі, Ролі, Офлайн конверсії, Налаштування
// (порядок: Офлайн конверсії — НАД Налаштуваннями)
// ----------------------------------------------------------------
const bottomNavItems = [
  { href: '/admin/integrations', label: 'Інтеграції',       icon: Plug,
    anyPermission: ['manage_settings', 'manage_integrations'] as Permission[] },
  { href: '/admin/users',        label: 'Користувачі',      icon: Users,
    anyPermission: ['manage_users'] as Permission[] },
  { href: '/admin/roles',        label: 'Ролі',             icon: Shield,
    anyPermission: ['manage_roles', 'manage_users'] as Permission[] },
  { href: '/admin/conversions',  label: 'Офлайн конверсії', icon: TrendingUp,
    anyPermission: ['manage_conversions', 'manage_users'] as Permission[] },
  { href: '/admin/conversion-adjustments', label: 'Корекції конверсій', icon: RotateCcw,
    anyPermission: ['manage_conversions', 'manage_users'] as Permission[] },
  { href: '/admin/settings',     label: 'Налаштування',     icon: Settings,
    anyPermission: ['manage_settings'] as Permission[] },
]

type AdminSidebarProps = {
  user: User
  permissions?: Permission[]
  roleLabel?: string
}

export function AdminSidebar({ user, permissions = [], roleLabel = 'Адміністратор' }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  // Відфільтровуємо topNavItems за правами
  const visibleTopNavItems = topNavItems.filter((item) => {
    if (!item.permission) return true
    return permissions.includes(item.permission)
  })

  // Нижні пункти: ховаємо ті, що вимагають прав, яких немає
  const visibleBottomNavItems = bottomNavItems.filter((item) => {
    const anyPerm = (item as { anyPermission?: Permission[] }).anyPermission
    if (!anyPerm) return true
    return anyPerm.some((p) => permissions.includes(p))
  })

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">V</span>
          </div>
          <div>
            <p className="text-sm font-semibold">VRK Partners</p>
            <p className="text-xs text-muted-foreground">Адмін-панель</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Меню</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* ── Верхні пункти: Заявки, (Аналітика за правами) ── */}
              {visibleTopNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* ── Нижні пункти: Інтеграції, Користувачі, Ролі, Офлайн конверсії, Налаштування ── */}
              {visibleBottomNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user.email}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-2 p-1.5 rounded hover:bg-accent transition-colors"
            title="Вийти"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
