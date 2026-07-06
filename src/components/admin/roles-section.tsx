'use client'

// Спільний контейнер сторінки «Ролі»: тримає ЄДИНИЙ стан списку ролей і віддає його
// в редактор (RolesManager) і в панель ієрархії (RoleHierarchy). Завдяки цьому
// створення/видалення/перепорядкування ролі одразу видно в обох місцях без перезавантаження.

import { useState } from 'react'
import { toast } from 'sonner'
import { RolesManager } from '@/components/admin/roles-manager'
import { RoleHierarchy } from '@/components/admin/role-hierarchy'

export type Role = {
  id: string
  name: string
  permissions: string[]
  is_system: boolean
  rank: number
}

type PermOption = { key: string; label: string; description?: string }

export function RolesSection({
  initialRoles,
  permissionList,
  canManage,
  ownRoleId,
  actorRank,
}: {
  initialRoles: Role[]
  permissionList: PermOption[]
  canManage: boolean
  ownRoleId: string | null
  actorRank: number
}) {
  const [roles, setRoles] = useState<Role[]>(initialRoles)
  const [savingOrder, setSavingOrder] = useState(false)

  async function handleReorder(orderedIds: string[]) {
    const prev = roles
    const next = orderedIds
      .map((id) => roles.find((r) => r.id === id))
      .filter((r): r is Role => !!r)
    setRoles(next) // оптимістично
    setSavingOrder(true)
    try {
      const res = await fetch('/api/admin/roles/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Помилка')
      toast.success('Ієрархію оновлено')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Помилка')
      setRoles(prev) // відкат
    } finally {
      setSavingOrder(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <RolesManager
        roles={roles}
        setRoles={setRoles}
        permissionList={permissionList}
        canManage={canManage}
        ownRoleId={ownRoleId}
        actorRank={actorRank}
      />
      <div className="lg:sticky lg:top-4">
        <RoleHierarchy
          roles={roles.map((r) => ({ id: r.id, name: r.name, rank: r.rank, is_system: r.is_system }))}
          actorRank={actorRank}
          canManage={canManage}
          saving={savingOrder}
          onReorder={handleReorder}
        />
      </div>
    </div>
  )
}
