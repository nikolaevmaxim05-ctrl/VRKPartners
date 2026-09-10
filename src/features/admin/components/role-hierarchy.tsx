'use client'

// Панель ієрархії ролей з drag-and-drop (нативний HTML5 DnD, без бібліотек).
// Керована ззовні: рендерить порядок з пропа `roles`, а при перетягуванні віддає
// новий порядок через onReorder (батько оновлює спільний стан і пише в API).
// Вище у списку = більше повноважень. Рухати можна лише ролі СТРОГО нижче за власну;
// «admin» та ролі на рівні/вище — заблоковані (locked).

import { useState } from 'react'
import { GripVertical, Lock, Loader2 } from 'lucide-react'

type HRole = { id: string; name: string; rank: number; is_system: boolean }

const ROLE_LABELS: Record<string, string> = { admin: 'Власник', manager: 'Менеджер' }
const roleLabel = (name: string) => ROLE_LABELS[name] ?? name

export function RoleHierarchy({
  roles,
  actorRank,
  canManage,
  saving,
  onReorder,
}: {
  roles: HRole[]
  actorRank: number
  canManage: boolean
  saving: boolean
  onReorder: (orderedIds: string[]) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  const isMovable = (r: HRole) => canManage && r.rank > actorRank

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const from = roles.findIndex((r) => r.id === dragId)
    const to = roles.findIndex((r) => r.id === targetId)
    if (from < 0 || to < 0) { setDragId(null); return }
    // Рухати можна лише рухомі (нижчі за власну) ролі
    if (!isMovable(roles[from]) || !isMovable(roles[to])) { setDragId(null); return }
    const next = [...roles]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDragId(null)
    onReorder(next.map((r) => r.id))
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-base">Ієрархія ролей</h2>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Вище = більше повноважень. Роль керує лише тими, що нижче за неї.
        {canManage ? ' Перетягуйте, щоб змінити порядок.' : ''}
      </p>

      <ul className="space-y-1.5">
        {roles.map((r) => {
          const movable = isMovable(r)
          return (
            <li
              key={r.id}
              draggable={movable}
              onDragStart={() => movable && setDragId(r.id)}
              onDragOver={(e) => { if (movable && dragId) e.preventDefault() }}
              onDrop={() => onDrop(r.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-background ${
                movable ? 'cursor-grab active:cursor-grabbing hover:border-primary/40' : 'opacity-70'
              } ${dragId === r.id ? 'ring-2 ring-primary/40' : ''}`}
            >
              {movable
                ? <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                : <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="font-medium truncate">{roleLabel(r.name)}</span>
              {r.name === 'admin' && (
                <span className="text-[10px] text-muted-foreground ml-auto">завжди зверху</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
