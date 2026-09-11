'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarHeader,
} from '@/shared/ui/sidebar'
import { LayoutGrid, LogOut } from 'lucide-react'
import { createClient } from '@infra/supabase/client'
import type { Permission } from '@core/domain/access/permissions'
import { visibleSections } from '@/features/admin/lib/sections'

type AdminSidebarProps = {
  user: { email: string | null }
  permissions?: Permission[]
  roleLabel?: string
}

// Меню адмінки — один масив розділів (features/admin/lib/sections.ts), той самий, що й картки
// головної: пункт показується, якщо є хоча б одне з прав anyPermission.
export function AdminSidebar({ user, permissions = [], roleLabel = 'Адміністратор' }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  const items = visibleSections(permissions)

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/admin" className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-bold">V</span>
          </div>
          <div>
            <p className="text-sm font-semibold">VRK Partners</p>
            <p className="text-xs text-muted-foreground">Адмін-панель</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Меню</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/admin'}>
                  <Link href="/admin">
                    <LayoutGrid className="h-4 w-4" />
                    <span>Головна</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
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
